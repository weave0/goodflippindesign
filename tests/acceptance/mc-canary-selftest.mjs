#!/usr/bin/env node
/**
 * Self-test of scripts/mc-production-canary.mjs against a LOCAL GFD (real worker entry, real D1) and an ISOLATED
 * real-FWOMPS host. It proves the production driver end to end before it is ever pointed at production; it is not
 * itself a production proof (the receiver here is local by design).
 *
 * usage: FWOMPS_REPO=<fwomps checkout> PYTHON=<python> node --no-warnings --import ./tests/acceptance/node-json-hook.mjs \
 *          tests/acceptance/mc-canary-selftest.mjs [--dir <run dir>]
 */

import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GFD_ROOT = resolve(HERE, '..', '..');
const FWOMPS_REPO = process.env.FWOMPS_REPO;
if (!FWOMPS_REPO) throw new Error('set FWOMPS_REPO');
const PYTHON = process.env.PYTHON || 'python';
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const RUN_DIR = resolve(arg('--dir') || join(tmpdir(), `mc-canary-selftest-${Date.now()}`));
mkdirSync(RUN_DIR, { recursive: true });
const sh = (cmd, a, o = {}) => { const d = spawnSync(cmd, a, { encoding: 'utf8', ...o }); if (d.status !== 0) throw new Error(`${cmd} ${a.join(' ')} failed: ${d.stderr || d.stdout}`); return d.stdout.trim(); };

const load = (rel) => import(new URL(rel, `file:///${GFD_ROOT.replaceAll('\\', '/')}/`));
const { default: worker } = await load('workers/auth.js');
const { ensureWorkItemSchema } = await load('workers/mission-control-work-items.js');
const { ensureOutboxSchema } = await load('workers/lib/mission-control-outbox.js');
const { Miniflare } = await import('miniflare');

const contractKeyHex = randomBytes(32).toString('hex');
const workerKeyHex = randomBytes(32).toString('hex');
const ids = { contractKeyId: 'gfd-selftest-contract', workerKeyId: 'gfd-selftest-result', workerId: 'fwomps-selftest-host', workerToken: randomBytes(24).toString('hex') };

const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("d1") } }', d1Databases: { DB: 'canary-selftest' }, d1Persist: join(RUN_DIR, 'd1') });
const DB = await mf.getD1Database('DB');
await ensureWorkItemSchema(DB);
await ensureOutboxSchema(DB);
const env = {
  DB, CLERK_SECRET_KEY: 'sk_selftest', CLERK_SECRET_KEY_GFD: 'sk_selftest',
  MISSION_CONTROL_CONTRACT_KEY: contractKeyHex, MISSION_CONTROL_CONTRACT_KEY_ID: ids.contractKeyId,
  MISSION_CONTROL_RESULT_KEY: workerKeyHex, MISSION_CONTROL_RESULT_KEY_ID: ids.workerKeyId,
  MISSION_CONTROL_RESULT_WORKER_ID: ids.workerId, MISSION_CONTROL_WORKER_TOKEN: ids.workerToken,
  MISSION_CONTROL_CANARY: 'aiaimate.com',
};
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url || input);
  if (url.includes('api.clerk.com')) return new Response(JSON.stringify({ id: 'sess_selftest', status: 'active', user_id: 'user_selftest_admin', user: { id: 'user_selftest_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } } }), { status: 200 });
  return realFetch(input, init);
};
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const response = await worker.fetch(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks) }), env);
  const text = await response.text();
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(text);
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const BASE = `http://127.0.0.1:${server.address().port}`;

let code = 1;
try {
  const ws = join(RUN_DIR, 'workspace-aiaimate');
  sh('git', ['clone', '-q', 'https://github.com/weave0/aiaimate.git', ws]);
  const home = join(RUN_DIR, 'fwomps-home');
  const spec = { home, workspace_root: ws, repository: 'weave0/aiaimate', property_id: 'aiaimate.com', workspace_name: 'aiaimate', profile_name: 'web-health-readonly-v1', python_exe: sh(PYTHON, ['-c', 'import sys; print(sys.executable)']), contract_key_id: ids.contractKeyId, contract_key_hex: contractKeyHex, worker_id: ids.workerId, worker_key_id: ids.workerKeyId, worker_key_hex: workerKeyHex, result_base_url: BASE, bearer_env: 'GFD_MC_WORKER_TOKEN' };
  const specPath = join(RUN_DIR, 'host-spec.private.json');
  writeFileSync(specPath, JSON.stringify(spec));
  sh(PYTHON, [join(HERE, 'fwomps_host_setup.py'), specPath], { env: { ...process.env, FWOMPS_REPO } });

  const b64 = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
  const operatorToken = `header.${b64({ sid: 'sess_selftest', sub: 'user_selftest_admin', exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
  const out = join(RUN_DIR, 'canary-evidence.json');
  const child = spawn(process.execPath, ['--no-warnings', '--import', pathToFileURL(join(HERE, 'node-json-hook.mjs')).href, join(GFD_ROOT, 'scripts', 'mc-production-canary.mjs'), '--origin', BASE, '--fwomps-home', home, '--out', out], {
    env: { ...process.env, FWOMPS_REPO, PYTHON, GFD_OPERATOR_TOKEN: operatorToken, GFD_MC_WORKER_TOKEN: ids.workerToken }, stdio: ['ignore', 'inherit', 'inherit'],
  });
  const exit = await new Promise((done) => child.on('close', done));
  const evidence = JSON.parse(readFileSync(out, 'utf8'));
  const raw = readFileSync(out, 'utf8');
  const leaked = [contractKeyHex, workerKeyHex, ids.workerToken, operatorToken].filter((secret) => raw.includes(secret));
  console.log(`driver exit ${exit}; outcome ${evidence.outcome}; checks ${evidence.checks.length - evidence.checkTotals.failed.length}/${evidence.checks.length}; hostile ${evidence.hostileCases.length}; secrets in evidence: ${leaked.length}`);
  code = exit === 0 && evidence.outcome === 'pass' && leaked.length === 0 && evidence.lifecycle.map((entry) => entry.state).join('>') === 'OBSERVED>QUALIFIED>INVESTIGATION_READY>INVESTIGATING>DIAGNOSED>RESOLVED' ? 0 : 1;
  if (code !== 0) console.log('lifecycle:', evidence.lifecycle?.map((entry) => entry.state).join('>'), 'failed:', evidence.checkTotals.failed);
} catch (error) {
  console.error(error);
} finally {
  server.close();
  await mf.dispose();
  process.exit(code);
}
