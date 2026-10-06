// The two gates that keep the one-shot production canary item from being spent on a doomed run:
//   - the host's REAL delivery transport must reach the Worker (found by the first production delivery: Cloudflare 1010), and
//   - the existing canary item must be in a state the bounded runner can advance.
// Pure and fake-spawn tests always run. The real-transport integration runs when FWOMPS_REPO (+ PYTHON) is set.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NIL_WORK_ITEM_ID, PROBE_BEARER, judgeDeliveryProbe, runDeliveryPathProbe } from '../scripts/lib/mc-delivery-path-probe.mjs';
import { RUNNABLE_STATES, classifyCanaryItems } from '../scripts/lib/mc-canary-item-state.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const WORKER_401 = { status: 401, body: '{"error":"Unauthorized"}' };
const CF_TEXT = { status: 403, body: 'error code: 1010\n' };
const CF_JSON = { status: 403, body: '{"type":"https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/","title":"Error 1010: Access denied","status":403,"error_code":1010}' };

// ---- judging: only the Worker's own JSON refusal is proof the path reaches the Worker -------------------------------------------------------------
{
  assert.deepEqual(judgeDeliveryProbe(WORKER_401).ok, true);
  assert.equal(judgeDeliveryProbe(WORKER_401).verdict, 'worker_refused_fake_bearer');
  for (const [label, output, verdict] of [
    ['cloudflare text 1010', CF_TEXT, 'edge_blocked'],
    ['cloudflare json 1010', CF_JSON, 'edge_blocked'],
    ['cloudflare 1020 text', { status: 403, body: 'error code: 1020' }, 'edge_blocked'],
    ['worker-looking 403 (not the edge)', { status: 403, body: '{"error":"Forbidden"}' }, 'unexpected_response'],
    ['200 (a bearer must never succeed)', { status: 200, body: '{"workItem":{}}' }, 'unexpected_response'],
    ['404', { status: 404, body: '{"error":"Not found"}' }, 'unexpected_response'],
    ['500', { status: 500, body: '' }, 'unexpected_response'],
    ['401 html (a proxy, not the Worker)', { status: 401, body: '<html>nope</html>' }, 'unexpected_401'],
    ['401 JSON array', { status: 401, body: '[]' }, 'unexpected_401'],
    ['401 without an error field', { status: 401, body: '{"x":1}' }, 'unexpected_401'],
    ['transport error', { error: 'TransportError' }, 'transport_unavailable'],
    ['import error', { error: 'ModuleNotFoundError' }, 'transport_unavailable'],
    ['null', null, 'no_output'],
    ['garbage', 'x', 'no_output'],
  ]) {
    const judged = judgeDeliveryProbe(output);
    assert.equal(judged.ok, false, label);
    assert.equal(judged.verdict, verdict, label);
  }
  assert.match(judgeDeliveryProbe(CF_JSON).detail, /Cloudflare error 1010/);
}

// ---- running it: fixed argv, inert target, no credential anywhere -----------------------------------------------------------------------------------
{
  const calls = [];
  const fakeSpawn = (output) => (command, argv, options) => { calls.push({ command, argv, options }); return { status: 0, stdout: `${JSON.stringify(output)}\n` }; };
  const ok = runDeliveryPathProbe({ origin: 'https://goodflippindesign.com/', python: 'py', fwompsRepo: 'C:/fwomps', spawn: fakeSpawn(WORKER_401) });
  assert.equal(ok.ok, true);
  assert.equal(ok.status, 401);
  const { command, argv, options } = calls[0];
  assert.equal(command, 'py');
  assert.equal(argv[0], '-c');
  assert.equal(argv[2], `https://goodflippindesign.com/api/mission-control/work-items/${NIL_WORK_ITEM_ID}/result`, 'only the result route of the nonexistent all-zero item');
  assert.equal(argv[3], PROBE_BEARER);
  assert.match(NIL_WORK_ITEM_ID, /^gfdwi_v1_0{64}$/);
  assert.ok(!/GFD_|TOKEN|SECRET/.test(JSON.stringify(Object.keys(options.env))), 'no credential-bearing variable crosses into the probe');
  assert.deepEqual(Object.keys(options.env).filter((key) => !['PATH', 'SystemRoot', 'PYTHONPATH', 'PYTHONIOENCODING'].includes(key)), [], 'only the minimal allowlist crosses into the probe');
  assert.equal(options.env.PYTHONPATH, 'C:/fwomps');
  assert.ok(argv[1].includes('urllib_transport'), 'it exercises the host\'s own published transport');
  assert.ok(!argv[1].includes('os.environ') && !argv[1].includes('getenv'), 'the probe script never reads the environment');
  // failures reduce to a closed verdict
  assert.equal(runDeliveryPathProbe({ origin: 'https://x.example', python: 'py', fwompsRepo: 'C:/fwomps', spawn: () => ({ status: 1, stdout: 'Traceback...' }) }).verdict, 'no_output');
  assert.equal(runDeliveryPathProbe({ origin: 'https://x.example', python: 'py', fwompsRepo: undefined, spawn: fakeSpawn(WORKER_401) }).verdict, 'no_host_repo');
  assert.equal(runDeliveryPathProbe({ origin: 'https://x.example', python: 'py', fwompsRepo: 'C:/f', spawn: fakeSpawn(CF_TEXT) }).verdict, 'edge_blocked');
}

// ---- the canary item gate: only states the bounded runner can advance ------------------------------------------------------------------------
{
  const item = (state, extra = {}) => ({ producer: 'mc-canary', state, ...extra });
  assert.deepEqual(classifyCanaryItems([]), { run: true, action: 'qualify', state: null, reason: 'no canary item exists yet' });
  assert.equal(classifyCanaryItems(undefined).run, true);
  for (const [state, action] of Object.entries(RUNNABLE_STATES)) {
    const plan = classifyCanaryItems([item(state)]);
    assert.deepEqual([plan.run, plan.action], [true, action], state);
  }
  assert.deepEqual(Object.keys(RUNNABLE_STATES).sort(), ['OBSERVED', 'QUALIFIED', 'RECURRENT', 'RESOLVED']);
  const stuck = classifyCanaryItems([item('INVESTIGATING', { activeLease: { expiresAt: '2026-10-06T22:45:39.000Z' } })]);
  assert.equal(stuck.run, false);
  assert.match(stuck.reason, /human admin must POST .*expire/);
  assert.match(stuck.reason, /2026-10-06T22:45:39\.000Z/);
  assert.match(classifyCanaryItems([item('INVESTIGATION_READY')]).reason, /recover-dispatch\) is admin-only/);
  for (const state of ['DIAGNOSED', 'REVERIFYING']) assert.match(classifyCanaryItems([item(state)]).reason, /already .* cannot resume/);
  assert.match(classifyCanaryItems([item('DIAGNOSED')]).reason, /--close-previous/, 'the refusal names the explicit opt-in');
  assert.ok(!/--close-previous/.test(classifyCanaryItems([item('REVERIFYING')]).reason), 'only DIAGNOSED is closable');
  assert.deepEqual(classifyCanaryItems([item('DIAGNOSED')], { closePrevious: true }).action, 'close-previous');
  for (const state of ['REVERIFYING', 'INVESTIGATING', 'INVESTIGATION_READY', 'DEPLOYED', 'DISMISSED']) assert.equal(classifyCanaryItems([item(state)], { closePrevious: true }).run, false, `${state} is never closable by the flag`);
  assert.equal(classifyCanaryItems([item('DIAGNOSED'), item('DIAGNOSED')], { closePrevious: true }).run, false, 'two canary items is never runnable, flag or not');
  for (const state of ['DISMISSED', 'SUPERSEDED', 'REPAIR_READY', 'REPAIRING', 'DEPLOYED', 'mystery', undefined]) {
    const plan = classifyCanaryItems([item(state)]);
    assert.equal(plan.run, false, String(state));
    assert.match(plan.reason, /Refusing before any mutation/);
  }
  assert.equal(classifyCanaryItems([item('QUALIFIED'), item('QUALIFIED')]).run, false, 'two canary items is never runnable');
  // hostile values are never reflected into the reason
  assert.ok(!classifyCanaryItems([item('<script>alert(1)</script>')]).reason.includes('<'));
}

// ---- the driver runs both gates before it touches anything --------------------------------------------------------------------------------------
{
  const driver = readFileSync(path.join(ROOT, 'scripts/mc-production-canary.mjs'), 'utf8');
  const probe = driver.indexOf('runDeliveryPathProbe({');
  const classify = driver.indexOf('classifyCanaryItems(');
  const firstWrite = driver.indexOf("'/api/mission-control/canary-observations', { status: 'degraded' }");
  assert.ok(probe > 0 && classify > probe && firstWrite > classify, 'delivery probe, then item gate, then the first production write');
  assert.ok(driver.includes("throw new Error(plan.reason)") && driver.includes('delivery path blocked'), 'both gates abort the run');
  assert.match(driver, /already QUALIFIED by a recovered earlier attempt/);
  assert.match(driver, /single-attempt lease is spent/);
  assert.match(driver, /args\.includes\('--close-previous'\)/);
  const closeAt = driver.indexOf("step('close the previous diagnosed cycle"); const degradedAt = driver.indexOf("canary-observations', { status: 'degraded' }");
  assert.ok(closeAt > classify && closeAt < degradedAt, 'the previous cycle is closed after the gates and before the new degraded observation');
  assert.match(driver, /status: 'pass' \}\);\n    const closedItem/, 'closing uses only the healthy observation the runner is allowed to post');
  // the conflict probe must not depend on what the investigation concluded: flipping a 'blocked' outcome to an executed one is itself malformed
  assert.ok(!/c\.outcome\s*=/.test(driver), 'no hostile probe rewrites the outcome');
  assert.match(driver, /investigation EXECUTED in the authoritative sandbox/);
}

// ---- real transport against a Cloudflare-emulating origin (needs a FWOMPS checkout) --------------------------------------------------------------
// The origin runs in a child process: runDeliveryPathProbe blocks this process (spawnSync), so an in-process server could never answer.
const EDGE_ORIGIN = `
const http = require('node:http');
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    console.log('REQ ' + JSON.stringify({ method: req.method, url: req.url, agent: req.headers['user-agent'], auth: req.headers.authorization, body }));
    const blocked = /^Python-urllib/i.test(req.headers['user-agent'] || '');
    res.writeHead(blocked ? 403 : 401, { 'content-type': blocked ? 'text/plain' : 'application/json' });
    res.end(blocked ? 'error code: 1010\\n' : '{"error":"Unauthorized"}');
  });
});
server.listen(0, '127.0.0.1', () => console.log('PORT ' + server.address().port));
`;
async function withEdgeOrigin(fn) {
  const child = spawn(process.execPath, ['-e', EDGE_ORIGIN], { stdio: ['ignore', 'pipe', 'inherit'] });
  const lines = [];
  let buffer = '';
  const port = await new Promise((resolve, reject) => {
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).trim(); buffer = buffer.slice(newline + 1);
        if (line.startsWith('PORT ')) resolve(Number(line.slice(5))); else if (line.startsWith('REQ ')) lines.push(JSON.parse(line.slice(4)));
      }
    });
    child.on('error', reject);
  });
  try { return await fn(`http://127.0.0.1:${port}`, lines); } finally { child.kill(); }
}
{
  const repo = process.env.FWOMPS_REPO;
  if (!repo) {
    console.log('mc delivery path probe: integration skipped (set FWOMPS_REPO and PYTHON to run the real-transport check)');
  } else {
    const python = process.env.PYTHON || 'python';
    await withEdgeOrigin(async (origin, seen) => {
      const result = runDeliveryPathProbe({ origin, python, fwompsRepo: repo });
      assert.equal(result.ok, true, `the host transport must present a non-default signature (got ${result.verdict}: ${result.detail}); a FWOMPS revision before the User-Agent fix fails here`);
      await new Promise((resolve) => setTimeout(resolve, 300)); // the child's request log arrives after the blocking probe returns
      assert.equal(seen.length, 1, 'exactly one request');
      assert.deepEqual([seen[0].method, seen[0].url, seen[0].auth, seen[0].body], ['POST', `/api/mission-control/work-items/${NIL_WORK_ITEM_ID}/result`, `Bearer ${PROBE_BEARER}`, '{}']);
      assert.ok(!/^python/i.test(seen[0].agent), 'not Python\'s default signature');
    });
    const old = process.env.FWOMPS_REPO_PRE_UA_FIX;
    if (old) {
      await withEdgeOrigin(async (origin) => {
        assert.equal(runDeliveryPathProbe({ origin, python, fwompsRepo: old }).verdict, 'edge_blocked', 'the pre-fix FWOMPS revision is caught before any production mutation');
      });
    }
  }
}
// ---- CLI exits non-zero when blocked (never a silent pass) -------------------------------------------------------------------------------------------
{
  const run = spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts/mc-production-delivery-path-probe.mjs')], { cwd: ROOT, encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /delivery path BLOCKED: no_host_repo/);
}

console.log('mc delivery path probe + canary item gate tests: all passed');
