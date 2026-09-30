#!/usr/bin/env node
/**
 * MC-CONFLUENCE-001 (#371), tier 2: the real bounded round trip.
 *
 *   AIAIMate observation (real health-sweep path) -> canonical work item -> registry qualification
 *   -> signed contract -> durable investigation_dispatch intent -> claim -> signed lease
 *   -> REAL FWOMPS published CLI (attested sandbox, host-registered read-only profile, real repo)
 *   -> authenticated HTTP delivery to GFD's REAL worker entry (workers/auth.js) over REAL D1
 *   -> the SAME work item is DIAGNOSED -> receipt recorded -> hostile replays on the real wire
 *
 * Needs an attested FWOMPS sandbox, so it cannot run on GitHub-hosted runners; tier 1
 * (tests/workers/mission-control-confluence.test.js) is the merge-blocking half. See
 * docs/mission-control-confluence-gate.md.
 *
 * usage: FWOMPS_REPO=<fwomps checkout> node --no-warnings --import ./tests/acceptance/node-json-hook.mjs \
 *          tests/acceptance/mc-confluence-specimen.mjs [--dir <run dir>] [--evidence <out.json>]
 *
 * Isolation: a throwaway FWOMPS_HOME and workspace clone under the run dir. The operator's real
 * ~/.fwomps is never read or written. The synthetic part is the observation (the degraded probe
 * result is constructed, not read from production); everything after it is the real system.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const GFD_ROOT = resolve(HERE, '..', '..');
const FWOMPS_REPO = process.env.FWOMPS_REPO;
if (!FWOMPS_REPO) throw new Error('set FWOMPS_REPO to a FWOMPS checkout');
const PYTHON = process.env.PYTHON || 'python';
const AIAIMATE_GIT_URL = process.env.AIAIMATE_GIT_URL || 'https://github.com/weave0/aiaimate.git';
const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; };
const RUN_DIR = resolve(arg('--dir') || join(tmpdir(), `mc-confluence-${Date.now()}`));
const EVIDENCE_PATH = resolve(arg('--evidence') || join(RUN_DIR, 'evidence.json'));
mkdirSync(RUN_DIR, { recursive: true });

const PROFILE = 'web-health-readonly-v1';
const PROPERTY = 'aiaimate.com';
const FINDING_KEY = 'health:aiaimate:machine_contract_mismatch';
const BEARER_ENV = 'GFD_MC_WORKER_TOKEN';

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const evidence = { milestone: 'MC-CONFLUENCE-001', tier: 2, startedAt: new Date().toISOString(), runDir: RUN_DIR, steps: [], checks: [], wire: [], d1: {} };
const step = (name, detail = {}) => { evidence.steps.push({ at: new Date().toISOString(), name, ...detail }); console.log(`• ${name}`); };
const check = (name, pass, detail = null) => { evidence.checks.push({ name, pass: Boolean(pass), ...(detail == null ? {} : { detail }) }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`); };
const sh = (cmd, args, options = {}) => {
  const done = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (done.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${done.stderr || done.stdout}`);
  return done.stdout.trim();
};

// --- modules under test: the real GFD code, loaded unmodified ---------------------------------
const load = (rel) => import(new URL(rel, `file:///${GFD_ROOT.replaceAll('\\', '/')}/`));
const { default: worker } = await load('workers/auth.js');
const { reportToGitHub } = await load('workers/health-sweep.js');
const { createD1WorkItemStore, ensureWorkItemSchema } = await load('workers/mission-control-work-items.js');
const { planEffect, claimDispatch, recordReceipt, ensureOutboxSchema, loadEffect } = await load('workers/lib/mission-control-outbox.js');
const { keyBytesFromEnv, signResultEnvelope } = await load('workers/fwomps-investigation-adapter.js');
const { Miniflare } = await import('miniflare');

// --- keys and identities (generated per run) ----------------------------------------------------
const contractKeyHex = randomBytes(32).toString('hex');
const workerKeyHex = randomBytes(32).toString('hex');
const ids = {
  contractKeyId: `gfd-specimen-${randomBytes(3).toString('hex')}`,
  workerKeyId: `mcwk_${randomBytes(4).toString('hex')}`,
  workerId: 'mcw_specimen_worker',
  workerToken: randomBytes(24).toString('hex'),
};

// --- real D1 (workerd SQLite), persisted under the run dir -------------------------------------
const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("d1") } }', d1Databases: { DB: 'gfd-confluence' }, d1Persist: join(RUN_DIR, 'd1') });
const DB = await mf.getD1Database('DB');
await ensureWorkItemSchema(DB);
await ensureOutboxSchema(DB);

const env = {
  DB,
  CLERK_SECRET_KEY: 'sk_specimen',
  CLERK_SECRET_KEY_GFD: 'sk_specimen',
  MISSION_CONTROL_GITHUB_TOKEN: 'gh_specimen',
  MISSION_CONTROL_CONTRACT_KEY: contractKeyHex,
  MISSION_CONTROL_CONTRACT_KEY_ID: ids.contractKeyId,
  MISSION_CONTROL_RESULT_KEY: workerKeyHex,
  MISSION_CONTROL_RESULT_KEY_ID: ids.workerKeyId,
  MISSION_CONTROL_RESULT_WORKER_ID: ids.workerId,
  MISSION_CONTROL_WORKER_TOKEN: ids.workerToken,
};

// Outbound services GFD's code talks to: Clerk (operator session) and the GitHub incident issue.
// Stateful GitHub so a repeat observation updates the same issue. Everything else passes through.
const realFetch = globalThis.fetch;
const issues = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input?.url || input);
  if (url.includes('api.clerk.com')) {
    return new Response(JSON.stringify({ user: { id: 'user_specimen_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } } }), { status: 200 });
  }
  if (url.includes('api.github.com')) {
    const method = init.method || 'GET';
    if (method === 'GET') return new Response(JSON.stringify(issues), { status: 200 });
    const payload = JSON.parse(init.body || '{}');
    if (method === 'POST') { const issue = { number: 900 + issues.length, title: payload.title, body: payload.body }; issues.push(issue); return new Response(JSON.stringify({ number: issue.number }), { status: 201 }); }
    const issue = issues.find((entry) => entry.number === Number(url.split('/').pop()));
    Object.assign(issue, { title: payload.title ?? issue.title, body: payload.body ?? issue.body });
    return new Response(JSON.stringify({ number: issue.number }), { status: 200 });
  }
  return realFetch(input, init);
};

// --- GFD over HTTP: the real worker entry, real routing, real bearer roles -----------------------
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const response = await worker.fetch(new Request(`http://127.0.0.1${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  }), env);
  const text = await response.text();
  evidence.wire.push({ at: new Date().toISOString(), method: req.method, path: req.url, status: response.status, requestBodySha256: sha256(body), requestBytes: body.length, result: req.url.endsWith('/result') ? { body: body.toString('utf8') } : undefined });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(text);
});
await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
const BASE = `http://127.0.0.1:${server.address().port}`;
step('gfd endpoint up', { baseUrl: BASE, d1: join(RUN_DIR, 'd1') });

// --- operator / worker calls in-process through the same worker entry ---------------------------
const b64 = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
const adminBearer = () => `header.${b64({ sid: 'sess_specimen', sub: 'user_specimen_admin', exp: Math.floor(Date.now() / 1000) + 3600 })}.signature`;
const api = (path, { auth, body } = {}) => worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
  method: 'POST', headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
}), env);
const itemPath = (item, action) => `/api/mission-control/work-items/${encodeURIComponent(item.workItemId)}/${action}`;
const store = createD1WorkItemStore(DB);
const findItem = async () => (await store.list()).filter((item) => item.findingKey === FINDING_KEY);

let exitCode = 1;
try {
  // --- the FWOMPS host: isolated home + a real clone of the governed repository ---------------
  const ws = join(RUN_DIR, 'workspace-aiaimate');
  sh('git', ['clone', '-q', AIAIMATE_GIT_URL, ws]);
  const revision = sh('git', ['-C', ws, 'rev-parse', 'HEAD']);
  const gitStatus = sh('git', ['-C', ws, 'status', '--porcelain']);
  step('workspace cloned', { repository: 'weave0/aiaimate', revision, clean: gitStatus === '' });

  const home = join(RUN_DIR, 'fwomps-home');
  const spec = {
    home, workspace_root: ws, repository: 'weave0/aiaimate', property_id: PROPERTY, workspace_name: 'aiaimate', profile_name: PROFILE,
    python_exe: sh(PYTHON, ['-c', 'import sys; print(sys.executable)']), contract_key_id: ids.contractKeyId, contract_key_hex: contractKeyHex,
    worker_id: ids.workerId, worker_key_id: ids.workerKeyId, worker_key_hex: workerKeyHex, result_base_url: BASE, bearer_env: BEARER_ENV,
  };
  writeFileSync(join(RUN_DIR, 'host-spec.json'), JSON.stringify({ ...spec, contract_key_hex: '<redacted>', worker_key_hex: '<redacted>' }, null, 2));
  const specPath = join(RUN_DIR, 'host-spec.private.json');
  writeFileSync(specPath, JSON.stringify(spec));
  sh(PYTHON, [join(HERE, 'fwomps_host_setup.py'), specPath], { env: { ...process.env, FWOMPS_REPO } });
  step('fwomps host registered (isolated home)', { home, profile: PROFILE, property: PROPERTY });

  // --- 1. observation through the real sweep path -> one canonical work item -------------------
  const degraded = {
    target: { id: 'aiaimate', brand: 'aiaimate', name: 'AI Aimate', url: 'https://aiaimate.com', sweepUrl: 'https://aiaimate.com/api/health', checkType: 'page', expectedKeyword: 'gfd-property-health',
      machineContract: { contract: 'gfd-property-health', contractVersion: 1, propertyId: PROPERTY, productId: 'aiaimate', status: 'ok' } },
    overall_status: 'warn', finding_kind: 'machine_contract_mismatch', status_code: 200, response_time_ms: 180, keyword_found: 0,
    content_keyword: 'machine:gfd-property-health', content_detail: 'propertyId expected "aiaimate.com", got "wrong.example"', error: null,
  };
  await reportToGitHub([degraded], new Date().toISOString(), { GITHUB_TOKEN: 'specimen', DB });
  let items = await findItem();
  check('one canonical work item from the observation', items.length === 1 && items[0].state === 'OBSERVED' && items[0].propertyId === PROPERTY, { workItemId: items[0]?.workItemId });
  const workItemId = items[0].workItemId;

  // --- 2. registry qualification (AIAIMate is the one dispatch-ready property) -----------------
  const qualified = await (await api(itemPath(items[0], 'transition'), { auth: adminBearer(), body: { to: 'QUALIFIED' } })).json();
  check('qualified from the real registry binding', qualified.workItem?.state === 'QUALIFIED' && qualified.workItem.investigationProfile === PROFILE && qualified.workItem.repository === 'weave0/aiaimate', qualified.workItem && { profile: qualified.workItem.investigationProfile, verificationProfile: qualified.workItem.verificationProfile, scope: qualified.workItem.verificationScope });

  // --- 3. signed contract, then the durable intent BEFORE any execution -------------------------
  const issued = await (await api(itemPath(items[0], 'investigate'), { auth: adminBearer(), body: { evidenceRevision: revision } })).json();
  const ready = issued.workItem;
  check('signed read-only contract issued, item INVESTIGATION_READY', ready?.state === 'INVESTIGATION_READY' && Boolean(issued.contract), { requestId: ready?.investigation?.requestId, contractDigest: ready?.investigation?.digest });
  const intent = await planEffect(DB, {
    workItemId, requestedLifecycleVersion: ready.lifecycleVersion, effectType: 'investigation_dispatch', target: `fwomps:${PROPERTY}`,
    candidateDigest: ready.investigation.digest,
    payload: { summary: 'dispatch one bounded read-only investigation', propertyId: PROPERTY, findingKey: FINDING_KEY, profileId: PROFILE },
  });
  check('durable investigation_dispatch intent recorded before execution', intent.created && intent.effect.status === 'PLANNED' && intent.effect.attemptCount === 0, { effectId: intent.effect.effectId, requestedLifecycleVersion: intent.effect.requestedLifecycleVersion });

  // --- 4. claim -> signed lease -> artifacts handed to FWOMPS -----------------------------------
  const claim = await claimDispatch(DB, intent.effect.effectId);
  check('claim permits exactly attempt 1', claim.permit?.attempt === 1, { reason: claim.reason });
  const leased = await (await api(itemPath(ready, 'lease'), { auth: ids.workerToken })).json();
  check('one signed lease minted, item INVESTIGATING', leased.workItem?.state === 'INVESTIGATING' && Boolean(leased.leaseGrant), { attempt: leased.leaseGrant?.attempt });
  const issueDir = join(RUN_DIR, 'issued');
  mkdirSync(issueDir, { recursive: true });
  writeFileSync(join(issueDir, 'contract.json'), JSON.stringify(issued.contract));
  writeFileSync(join(issueDir, 'lease.json'), JSON.stringify(leased.leaseGrant));
  writeFileSync(join(issueDir, 'lease.token'), leased.leaseTokenHex);

  // --- 5. the REAL FWOMPS published CLI: execute first, deliver later (published --no-deliver) ---
  const fwomps = (args, extraEnv = {}) => new Promise((done) => {
    const child = spawn(PYTHON, ['-m', 'fwomps.mission_control', '--home', home, ...args],
      { cwd: FWOMPS_REPO, env: { ...process.env, PYTHONPATH: FWOMPS_REPO, [BEARER_ENV]: ids.workerToken, PYTHONIOENCODING: 'utf-8', ...extraEnv } });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (d) => { stdout += d; }); child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => child.kill(), 420_000);
    child.on('close', (code) => { clearTimeout(timer); done({ code, status: JSON.parse(stdout.trim().split('\n').pop() || '{}'), stderr }); });
  });
  step('invoking fwomps published CLI: investigate --no-deliver (attested sandbox)');
  const executed = await fwomps(['investigate', '--contract', join(issueDir, 'contract.json'), '--lease', join(issueDir, 'lease.json'), '--lease-token-file', join(issueDir, 'lease.token'), '--no-deliver']);
  const requestId = executed.status.request_id;
  evidence.fwomps = { executed: { exitCode: executed.code, status: executed.status } };
  check('fwomps executed and persisted a result without delivering (result_ready, exit 10)', executed.code === 10 && executed.status.status === 'result_ready', executed.status);
  check('nothing has reached GFD yet; item still INVESTIGATING', evidence.wire.length === 0 && (await findItem())[0].state === 'INVESTIGATING');

  // FWOMPS's own persisted envelope: the exact bytes it would deliver.
  const rawBody = readFileSync(join(home, 'mission-control', 'results', `${requestId}.attempt-1.json`), 'utf8');
  const real = JSON.parse(rawBody);
  const macKey = Object.keys(real.authentication).find((key) => /mac|signature/.test(key));
  const workerKey = keyBytesFromEnv(workerKeyHex);
  const resultUrl = `${BASE}/api/mission-control/work-items/${encodeURIComponent(workItemId)}/result`;
  const post = async (body, token = ids.workerToken) => {
    const response = await realFetch(resultUrl, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    let code = null; try { code = (await response.clone().json()).code ?? null; } catch { /* non-json */ }
    return { status: response.status, code };
  };
  const mutate = (fn) => { const copy = JSON.parse(rawBody); fn(copy); return copy; };
  const resign = async (envelope) => { const { authentication, ...unsigned } = envelope; return signResultEnvelope({ ...unsigned, authentication: { key_id: authentication.key_id } }, workerKey); };

  // --- 6. hostile delivery of FWOMPS's real bytes WHILE INVESTIGATING: each refused by its own fence ---
  const STATE_ONLY = new Set(['result_conflict', 'illegal_transition']); // would mean "refused for the wrong reason"
  const hostileBefore = {
    'edited summary (MAC no longer matches)': mutate((e) => { e.summary += ' (edited)'; }),
    'flipped outcome (MAC no longer matches)': mutate((e) => { e.outcome = e.outcome === 'reproduced' ? 'not_reproduced' : 'reproduced'; }),
    'flipped MAC': mutate((e) => { const m = e.authentication[macKey]; e.authentication[macKey] = `${m.slice(0, -1)}${m.endsWith('0') ? '1' : '0'}`; }),
    'unknown key id': mutate((e) => { e.authentication.key_id = 'unknown-key'; }),
    'smuggled authority field (unsigned)': mutate((e) => { e.repair_authority = true; }),
    'unknown schema (unsigned)': mutate((e) => { e.schema_version = 'mc-fw-investigation-result-9'; }),
    'VALIDLY SIGNED wrong lease token': await resign(mutate((e) => { e.lease_token_digest = `sha256:${'9'.repeat(64)}`; })),
    'VALIDLY SIGNED wrong attempt': await resign(mutate((e) => { e.attempt = 2; })),
    'VALIDLY SIGNED wrong work-item echo': await resign(mutate((e) => { e.evidence.diagnostic_id = 'gfdwi_v1_someone_else'; })),
    'VALIDLY SIGNED wrong repository': await resign(mutate((e) => { e.source.repository = 'weave0/other'; })),
    'VALIDLY SIGNED wrong property': await resign(mutate((e) => { e.source.property_id = 'other.com'; })),
    'VALIDLY SIGNED wrong evidence revision': await resign(mutate((e) => { e.evidence.revision = 'b'.repeat(40); })),
    'VALIDLY SIGNED wrong request id': await resign(mutate((e) => { e.request_id = 'mci_someone_elses_request'; })),
    'VALIDLY SIGNED unknown schema': await resign(mutate((e) => { e.schema_version = 'mc-fw-investigation-result-9'; })),
    'VALIDLY SIGNED smuggled repair authority': await resign(mutate((e) => { e.repair_authority = true; })),
  };
  evidence.hostileBeforeAcceptance = {};
  for (const [name, body] of Object.entries(hostileBefore)) {
    const refused = await post(body);
    evidence.hostileBeforeAcceptance[name] = refused;
    check(`hostile while INVESTIGATING: ${name}`, refused.status >= 400 && !STATE_ONLY.has(refused.code), refused);
  }
  const wrongBearer = await post(rawBody, 'wrong-token');
  check('hostile while INVESTIGATING: wrong bearer refused (401/403)', [401, 403].includes(wrongBearer.status), wrongBearer);
  const stillInvestigating = (await findItem())[0];
  check('after every hostile delivery the item is still INVESTIGATING with its lease intact, no diagnosis', stillInvestigating.state === 'INVESTIGATING' && Boolean(stillInvestigating.activeLease) && !stillInvestigating.diagnosis);

  // --- 7. FWOMPS delivers through its published seam; GFD accepts ------------------------------
  step('invoking fwomps published CLI: deliver');
  const delivery = await fwomps(['deliver', '--request-id', requestId]);
  evidence.fwomps.delivered = { exitCode: delivery.code, status: delivery.status };
  check('fwomps delivered and GFD acknowledged (exit 0, acknowledged)', delivery.code === 0 && delivery.status.status === 'acknowledged', delivery.status);

  items = await findItem();
  const done = items[0];
  check('same canonical work item is DIAGNOSED', items.length === 1 && done.workItemId === workItemId && done.state === 'DIAGNOSED', { state: done.state, diagnosisDigest: done.diagnosis?.resultDigest });
  check('diagnosis digest equals the digest FWOMPS reported', done.diagnosis?.resultDigest === executed.status.result_digest && done.diagnosis?.resultDigest === delivery.status.result_digest);
  check('lease released, no active lease', done.activeLease === null);
  const acceptedWire = evidence.wire.filter((entry) => entry.path.endsWith('/result') && entry.method === 'POST' && entry.status === 200);
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
  check('exactly one accepted result delivery, and its content is the FWOMPS-persisted envelope', acceptedWire.length === 1 && JSON.stringify(sortKeys(JSON.parse(acceptedWire[0].result.body))) === JSON.stringify(sortKeys(real)), acceptedWire.map((w) => w.requestBodySha256));
  check('envelope is read-only and every receipt is from the authoritative sandbox', real.repairability?.state === 'not_indicated' && real.execution_receipts?.every((r) => r.authoritative_sandbox === true), { outcome: real.outcome, summary: real.summary, receipts: real.execution_receipts?.map((r) => ({ status: r.status, exit: r.exit_code, authoritative: r.authoritative_sandbox })) });
  const receipt = await recordReceipt(DB, intent.effect.effectId, { attempt: claim.permit.attempt, outcome: 'committed', receipt: delivery.status.result_digest });
  check('dispatch intent receipt committed under the same attempt fence', receipt.effect.status === 'COMMITTED' && receipt.effect.attemptCount === 1);
  const lateAgain = await fwomps(['deliver', '--request-id', requestId]);
  check('fwomps redelivery after ack never re-sends and never re-executes', lateAgain.code === 0 && lateAgain.status.status === 'acknowledged' && evidence.wire.filter((w) => w.status === 200).length === 1, lateAgain.status);

  // --- 7b. after acceptance: idempotent replay, concurrency, conflicting result, late replay -----
  const replay = await post(rawBody);
  check('byte-identical redelivery is idempotent (200)', replay.status === 200, replay);
  const burst = await Promise.all([1, 2, 3, 4].map(() => post(rawBody)));
  check('concurrent identical redelivery all 200', burst.every((r) => r.status === 200), burst.map((r) => r.status));
  const different = await post(await resign(mutate((e) => { e.outcome = e.outcome === 'reproduced' ? 'not_reproduced' : 'reproduced'; e.summary = `${e.summary} (conflicting)`; })));
  check('a different VALIDLY SIGNED result for the same attempt fails closed as result_conflict', different.status === 409 && different.code === 'result_conflict', different);

  // --- 8. invariants after the hostile barrage ---------------------------------------------------
  const finalItems = await findItem();
  const transitions = await DB.prepare("SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND event_type = 'transition' AND to_state = 'DIAGNOSED'").bind(workItemId).first();
  check('still one work item, still DIAGNOSED, one DIAGNOSED transition', finalItems.length === 1 && finalItems[0].state === 'DIAGNOSED' && Number(transitions.n) === 1);
  check('no repair/deploy authority recorded anywhere', !JSON.stringify(evidence.wire).match(/"repair_authority":true/) && (await DB.prepare("SELECT COUNT(*) AS n FROM mc_effects WHERE effect_type IN ('pull_request','deployment')").first()).n === 0);
  const resolved = await api(itemPath(finalItems[0], 'transition'), { auth: adminBearer(), body: { to: 'RESOLVED' } });
  check('diagnosis alone cannot resolve (RESOLVED refused)', resolved.status >= 400, resolved.status);

  // --- D1 record ---------------------------------------------------------------------------------
  const dump = async (sql) => (await DB.prepare(sql).all()).results;
  evidence.d1 = {
    workItems: await dump('SELECT work_item_id, lifecycle_state, lifecycle_version, repository, investigation_profile, verification_profile, verification_scope, active_lease_id, updated_at FROM mc_work_items'),
    events: await dump('SELECT event_type, from_state, to_state, occurred_at, actor_type, actor_id FROM mc_work_item_events ORDER BY occurred_at, rowid'),
    leases: await dump('SELECT lease_id, worker_id, issued_at, expires_at, released_at, release_reason FROM mc_work_item_leases'),
    effects: await dump('SELECT effect_id, effect_type, status, schema_version, requested_lifecycle_version, attempt_count, payload_digest, receipt_ref, candidate_digest FROM mc_effects'),
  };
  evidence.fwompsRevision = sh('git', ['-C', FWOMPS_REPO, 'rev-parse', 'HEAD']);
  evidence.gfdRevision = sh('git', ['-C', GFD_ROOT, 'rev-parse', 'HEAD']);
  evidence.aiaimateRevision = revision;
  evidence.workItemId = workItemId;
  exitCode = evidence.checks.every((c) => c.pass) ? 0 : 1;
} catch (error) {
  evidence.error = String(error?.stack || error);
  console.error(error);
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.passed = exitCode === 0;
  for (const w of evidence.wire) if (w.result) w.result = { bodySha256: sha256(Buffer.from(w.result.body)) }; // keep evidence small; digests only
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  server.close();
  await mf.dispose();
  const failed = evidence.checks.filter((c) => !c.pass);
  console.log(`\n${evidence.checks.length - failed.length}/${evidence.checks.length} checks passed — evidence: ${EVIDENCE_PATH}`);
  if (failed.length) console.log('FAILED:', failed.map((c) => c.name).join('; '));
  process.exit(exitCode);
}
