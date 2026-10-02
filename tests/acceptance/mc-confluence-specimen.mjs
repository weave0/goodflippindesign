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
 * Confluence-2 (MC-CONFLUENCE-002) continues past DIAGNOSED on the same item: a diagnosis never resolves;
 * a strictly newer healthy production observation does; a later degraded one recurs the SAME lineage.
 *
 * usage: FWOMPS_REPO=<fwomps checkout> node --no-warnings --import ./tests/acceptance/node-json-hook.mjs \
 *          tests/acceptance/mc-confluence-specimen.mjs [--real-home [--home <fwomps home>]] [--dir <run dir>] [--evidence <out.json>]
 *
 * Two modes:
 *   default      isolated: a throwaway FWOMPS_HOME and workspace clone under the run dir. The operator's real
 *                ~/.fwomps is never read or written. Exercises FWOMPS's own `deliver` seam too.
 *   --real-home  the REAL host registration: the operator's actual FWOMPS home (registered workspace, host
 *                profile, enrolled keys, sandbox attestation) executes the investigation. Only the two shared
 *                key secrets are read, in memory, from that home's key store so the throwaway local GFD
 *                verifies what that host signs; nothing secret is printed or written. The home's delivery
 *                origin is production, so the persisted envelope (FWOMPS's own signed bytes) is POSTed to the
 *                local GFD by this script instead of `fwomps deliver`; that substitution is recorded.
 *
 * The synthetic part is the observation (the degraded and healthy probe results are constructed, not read
 * from production); everything after the observation boundary is the real system.
 */

import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const REAL_HOME = process.argv.includes('--real-home');
const REAL_HOME_DIR = resolve(arg('--home') || join(process.env.USERPROFILE || process.env.HOME || '', '.fwomps'));
const RUN_DIR = resolve(arg('--dir') || join(tmpdir(), `mc-confluence-${Date.now()}`));
const EVIDENCE_PATH = resolve(arg('--evidence') || join(RUN_DIR, 'evidence.json'));
mkdirSync(RUN_DIR, { recursive: true });

const PROFILE = 'web-health-readonly-v1';
const PROPERTY = 'aiaimate.com';
const FINDING_KEY = 'health:aiaimate:machine_contract_mismatch';
const BEARER_ENV = 'GFD_MC_WORKER_TOKEN';
const CONTRACT_CHECK = "import sys, pathlib;p = pathlib.Path(sys.argv[1]) / 'portal' / 'app' / 'api' / 'health' / 'route.ts';t = p.read_text(encoding='utf-8');ok = \"contract: 'gfd-property-health'\" in t and \"propertyId: 'aiaimate.com'\" in t;sys.exit(0 if ok else 1)";
const EXPECTED_PROFILE_TAIL = ['-B', '-c', CONTRACT_CHECK, '{repository_root}'];

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const evidence = { milestone: 'MC-CONFLUENCE-002', tier: 2, mode: REAL_HOME ? 'real-host' : 'isolated-host', startedAt: new Date().toISOString(), runDir: RUN_DIR, steps: [], checks: [], hostileCases: [], wire: [], d1: {} };
const hostileCase = (name, expected, observed, pass) => evidence.hostileCases.push({ name, expected, observed, pass: Boolean(pass) });
const step = (name, detail = {}) => { evidence.steps.push({ at: new Date().toISOString(), name, ...detail }); console.log(`• ${name}`); };
const check = (name, pass, detail = null) => { evidence.checks.push({ name, pass: Boolean(pass), ...(detail == null ? {} : { detail }) }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`); };
const sh = (cmd, args, options = {}) => {
  const done = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  if (done.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed: ${done.stderr || done.stdout}`);
  return done.stdout.trim();
};
const shMaybe = (cmd, args, options = {}) => {
  const done = spawnSync(cmd, args, { encoding: 'utf8', ...options });
  return done.status === 0 ? done.stdout.trim() : null;
};
const wallClockAfter = async (...instants) => {
  const floor = Math.max(...instants.filter(Boolean).map((value) => Date.parse(value)).filter(Number.isFinite), Date.now() - 1);
  const delay = Math.max(0, floor + 2 - Date.now());
  if (delay) await new Promise((resolveDelay) => setTimeout(resolveDelay, delay));
  return new Date().toISOString();
};

// --- modules under test: the real GFD code, loaded unmodified ---------------------------------
const load = (rel) => import(new URL(rel, `file:///${GFD_ROOT.replaceAll('\\', '/')}/`));
const { default: worker } = await load('workers/auth.js');
const { reportToGitHub } = await load('workers/health-sweep.js');
const { createD1WorkItemStore, ensureWorkItemSchema } = await load('workers/mission-control-work-items.js');
const { planEffect, claimDispatch, recordReceipt, ensureOutboxSchema, loadEffect } = await load('workers/lib/mission-control-outbox.js');
const { keyBytesFromEnv, signResultEnvelope } = await load('workers/fwomps-investigation-adapter.js');
const { Miniflare } = await import('miniflare');

// --- keys and identities: generated per run, or (real-home) the host's own enrolled keys --------------
let contractKeyHex = randomBytes(32).toString('hex');
let workerKeyHex = randomBytes(32).toString('hex');
const ids = {
  contractKeyId: `gfd-specimen-${randomBytes(3).toString('hex')}`,
  workerKeyId: `mcwk_${randomBytes(4).toString('hex')}`,
  workerId: 'mcw_specimen_worker',
  workerToken: randomBytes(24).toString('hex'),
};
let realHost = null;
if (REAL_HOME) {
  const hostConfig = JSON.parse(readFileSync(join(REAL_HOME_DIR, 'config.json'), 'utf8'));
  const mc = hostConfig.mission_control || {};
  const binding = mc.properties?.[PROPERTY];
  if (!mc.enabled || !binding) throw new Error(`the real host at ${REAL_HOME_DIR} has no ${PROPERTY} Mission Control binding; run scripts/fwomps-aiaimate-host-binding.py first`);
  const contractDir = join(REAL_HOME_DIR, 'mission-control', 'contract-keys');
  const contractIds = readdirSync(contractDir).filter((name) => name.endsWith('.json')).map((name) => name.slice(0, -5));
  if (contractIds.length !== 1) throw new Error(`expected exactly one enrolled contract key, found ${contractIds.length}`);
  const secret = (file) => JSON.parse(readFileSync(file, 'utf8')).secret_hex;
  ids.contractKeyId = contractIds[0];
  ids.workerKeyId = mc.worker_key_id;
  ids.workerId = mc.worker_id;
  contractKeyHex = secret(join(contractDir, `${ids.contractKeyId}.json`));
  workerKeyHex = secret(join(REAL_HOME_DIR, 'mission-control', 'worker-keys', `${ids.workerKeyId}.json`));
  realHost = { home: REAL_HOME_DIR, binding, profile: mc.investigation_profiles?.[binding.investigation_profile], workspace: hostConfig.workspaces?.[binding.workspace], deliveryOrigin: mc.delivery?.result_base_url, workerId: ids.workerId, workerKeyId: ids.workerKeyId, contractKeyId: ids.contractKeyId };
}

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
  // --- the FWOMPS host: isolated home + a real clone, or the operator's real registered host ----
  let ws; let home;
  if (REAL_HOME) {
    ws = realHost.workspace.root;
    home = REAL_HOME_DIR;
    const revision0 = sh('git', ['-C', ws, 'rev-parse', 'HEAD']);
    const origin0 = sh('git', ['-C', ws, 'remote', 'get-url', 'origin']);
    const profileCommand = realHost.profile?.commands?.[0];
    const profileTailMatches = Array.isArray(profileCommand)
      && profileCommand.length === EXPECTED_PROFILE_TAIL.length + 1
      && profileCommand.slice(1).every((part, index) => part === EXPECTED_PROFILE_TAIL[index]);
    check('real host: aiaimate.com is bound to weave0/aiaimate with the read-only profile', realHost.binding.repository === 'weave0/aiaimate' && realHost.binding.investigation_profile === PROFILE && Boolean(realHost.profile), { binding: realHost.binding, deliveryOrigin: realHost.deliveryOrigin });
    check('real host: registered workspace origin is weave0/aiaimate', /github\.com[:/]weave0\/aiaimate(?:\.git)?$/i.test(origin0), { origin: origin0 });
    check('real host: the registered profile is the canonical fixed read-only argv with the exit_nonzero_reproduces predicate', realHost.profile?.commands?.length === 1 && profileTailMatches && realHost.profile.predicate === 'exit_nonzero_reproduces', { commands: realHost.profile?.commands?.length, predicate: realHost.profile?.predicate, canonicalArgv: profileTailMatches });
    check('real host: workspace is a clean git checkout', sh('git', ['-C', ws, 'status', '--porcelain']) === '', { revision: revision0 });
    step('real fwomps host in use (no isolation)', { home, workspace: ws, workerId: ids.workerId, workerKeyId: ids.workerKeyId, contractKeyId: ids.contractKeyId, deliveryOrigin: realHost.deliveryOrigin });
  } else {
    ws = join(RUN_DIR, 'workspace-aiaimate');
    sh('git', ['clone', '-q', AIAIMATE_GIT_URL, ws]);
    home = join(RUN_DIR, 'fwomps-home');
  }
  const revision = sh('git', ['-C', ws, 'rev-parse', 'HEAD']);
  const gitStatus = sh('git', ['-C', ws, 'status', '--porcelain']);
  step('workspace ready', { repository: 'weave0/aiaimate', revision, clean: gitStatus === '' });
  if (!REAL_HOME) {
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
  }

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
  // No production lease path exists without durable prior intent authority: before the claim, the real
  // route refuses a lease that names no intent, and one that names the planned-but-unclaimed intent.
  const noIntent = await api(itemPath(ready, 'lease'), { auth: ids.workerToken });
  check('lease with no dispatch intent is refused (dispatch_intent_required)', noIntent.status === 409 && (await noIntent.json()).code === 'dispatch_intent_required');
  const unclaimed = await api(itemPath(ready, 'lease'), { auth: ids.workerToken, body: { effect_id: intent.effect.effectId, attempt: 1 } });
  const unclaimedBody = await unclaimed.json();
  check('lease under a planned but unclaimed intent is refused', unclaimed.status === 409 && unclaimedBody.code === 'dispatch_intent_ineligible' && /not been claimed/.test(unclaimedBody.error), unclaimedBody);
  check('the refusals changed nothing: item still INVESTIGATION_READY, no lease minted', (await findItem())[0].state === 'INVESTIGATION_READY' && (await DB.prepare('SELECT COUNT(*) AS n FROM mc_work_item_leases').first()).n === 0);
  const claim = await claimDispatch(DB, intent.effect.effectId);
  check('claim permits exactly attempt 1', claim.permit?.attempt === 1, { reason: claim.reason });
  const leased = await (await api(itemPath(ready, 'lease'), { auth: ids.workerToken, body: { effect_id: intent.effect.effectId, attempt: claim.permit.attempt } })).json();
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
  // Each hostile delivery must be refused by its OWN named fence (exact machine-readable code). Every
  // mutation stays valid through all EARLIER layers (signature, closed schema, source/evidence
  // consistency) unless that earlier layer is the point of the case, so it reaches the fence it is named for.
  const WRONG_SHA = 'b'.repeat(40);
  const hostileBefore = {
    'edited summary (MAC no longer matches)': [mutate((e) => { e.summary += ' (edited)'; }), 'mac_invalid'],
    'flipped outcome (MAC no longer matches)': [mutate((e) => { e.outcome = e.outcome === 'reproduced' ? 'not_reproduced' : 'reproduced'; }), 'mac_invalid'],
    'flipped MAC': [mutate((e) => { const m = e.authentication[macKey]; e.authentication[macKey] = `${m.slice(0, -1)}${m.endsWith('0') ? '1' : '0'}`; }), 'mac_invalid'],
    'unknown key id': [mutate((e) => { e.authentication.key_id = 'unknown-key'; }), 'unknown_key'],
    'smuggled authority field (unsigned)': [mutate((e) => { e.repair_authority = true; }), 'malformed_result'],
    'unknown schema (unsigned)': [mutate((e) => { e.schema_version = 'mc-fw-investigation-result-9'; }), 'schema_version_mismatch'],
    'VALIDLY SIGNED wrong lease token': [await resign(mutate((e) => { e.lease_token_digest = `sha256:${'9'.repeat(64)}`; })), 'lease_mismatch'],
    'VALIDLY SIGNED wrong attempt': [await resign(mutate((e) => { e.attempt = 2; })), 'attempt_mismatch'],
    'VALIDLY SIGNED wrong work-item echo': [await resign(mutate((e) => { e.evidence.diagnostic_id = 'gfdwi_v1_someone_else'; })), 'identity_mismatch'],
    'VALIDLY SIGNED wrong repository': [await resign(mutate((e) => { e.source.repository = 'weave0/other'; })), 'identity_mismatch'],
    'VALIDLY SIGNED wrong property': [await resign(mutate((e) => { e.source.property_id = 'other.com'; })), 'identity_mismatch'],
    // BOTH evidence.revision and source.inspected_head_sha move to the same wrong SHA: the envelope is
    // internally consistent, so only the signed-contract binding can refuse it.
    'VALIDLY SIGNED wrong evidence revision (both fields, consistent)': [await resign(mutate((e) => { e.evidence.revision = WRONG_SHA; e.source.inspected_head_sha = WRONG_SHA; })), 'digest_mismatch'],
    'VALIDLY SIGNED wrong contract digest': [await resign(mutate((e) => { e.contract_digest = `sha256:${'7'.repeat(64)}`; })), 'digest_mismatch'],
    'VALIDLY SIGNED wrong request id': [await resign(mutate((e) => { e.request_id = 'mci_someone_elses_request'; })), 'request_mismatch'],
    'VALIDLY SIGNED unknown schema': [await resign(mutate((e) => { e.schema_version = 'mc-fw-investigation-result-9'; })), 'schema_version_mismatch'],
    'VALIDLY SIGNED smuggled repair authority': [await resign(mutate((e) => { e.repair_authority = true; })), 'malformed_result'],
  };
  evidence.hostileBeforeAcceptance = {};
  for (const [name, [body, expectedCode]] of Object.entries(hostileBefore)) {
    const refused = await post(body);
    evidence.hostileBeforeAcceptance[name] = { ...refused, expectedCode };
    check(`hostile while INVESTIGATING: ${name} -> ${expectedCode}`, refused.status >= 400 && refused.code === expectedCode, { ...refused, expectedCode });
    hostileCase(`delivery: ${name}`, expectedCode, refused.code, refused.status >= 400 && refused.code === expectedCode);
  }
  const wrongBearer = await post(rawBody, 'wrong-token');
  check('hostile while INVESTIGATING: wrong bearer refused (401)', wrongBearer.status === 401, wrongBearer);
  hostileCase('delivery: wrong bearer', 401, wrongBearer.status, wrongBearer.status === 401);
  const stillInvestigating = (await findItem())[0];
  check('after every hostile delivery the item is still INVESTIGATING with its lease intact, no diagnosis', stillInvestigating.state === 'INVESTIGATING' && Boolean(stillInvestigating.activeLease) && !stillInvestigating.diagnosis);

  // --- 7. FWOMPS delivers through its published seam; GFD accepts ------------------------------
  let delivery;
  if (REAL_HOME) {
    // The real home's delivery origin is production, so `fwomps deliver` would address production. The bytes are
    // FWOMPS's own persisted, MAC-signed envelope; the specimen POSTs them to the local GFD with the delivery bearer.
    step('real host: posting the persisted FWOMPS envelope to the local GFD (substitutes for `fwomps deliver`)');
    const posted = await realFetch(resultUrl, { method: 'POST', headers: { Authorization: `Bearer ${ids.workerToken}`, 'Content-Type': 'application/json' }, body: rawBody });
    const postedBody = await posted.json().catch(() => ({}));
    delivery = { code: posted.status === 200 ? 0 : 1, status: { status: posted.status === 200 ? 'acknowledged' : 'refused', result_digest: executed.status.result_digest } };
    evidence.fwomps.delivered = { substituted: true, httpStatus: posted.status, workItemState: postedBody.workItem?.state };
    check('GFD accepted FWOMPS\'s own signed envelope (200)', posted.status === 200, { status: posted.status });
  } else {
    step('invoking fwomps published CLI: deliver');
    delivery = await fwomps(['deliver', '--request-id', requestId]);
    evidence.fwomps.delivered = { exitCode: delivery.code, status: delivery.status };
    check('fwomps delivered and GFD acknowledged (exit 0, acknowledged)', delivery.code === 0 && delivery.status.status === 'acknowledged', delivery.status);
  }

  items = await findItem();
  const done = items[0];
  check('same canonical work item is DIAGNOSED', items.length === 1 && done.workItemId === workItemId && done.state === 'DIAGNOSED', { state: done.state, diagnosisDigest: done.diagnosis?.resultDigest });
  check('diagnosis digest equals the digest FWOMPS reported', done.diagnosis?.resultDigest === executed.status.result_digest && (REAL_HOME || done.diagnosis?.resultDigest === delivery.status.result_digest));
  check('lease released, no active lease', done.activeLease === null);
  const acceptedWire = evidence.wire.filter((entry) => entry.path.endsWith('/result') && entry.method === 'POST' && entry.status === 200);
  const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
  check('exactly one accepted result delivery, and its content is the FWOMPS-persisted envelope', acceptedWire.length === 1 && JSON.stringify(sortKeys(JSON.parse(acceptedWire[0].result.body))) === JSON.stringify(sortKeys(real)), acceptedWire.map((w) => w.requestBodySha256));
  check('envelope is read-only and every receipt is from the authoritative sandbox', real.repairability?.state === 'not_indicated' && real.execution_receipts?.every((r) => r.authoritative_sandbox === true), { outcome: real.outcome, summary: real.summary, receipts: real.execution_receipts?.map((r) => ({ status: r.status, exit: r.exit_code, authoritative: r.authoritative_sandbox })) });
  const receipt = await recordReceipt(DB, intent.effect.effectId, { attempt: claim.permit.attempt, outcome: 'committed', receipt: executed.status.result_digest });
  check('dispatch intent receipt committed under the same attempt fence', receipt.effect.status === 'COMMITTED' && receipt.effect.attemptCount === 1);
  evidence.diagnosis = { resultDigest: done.diagnosis?.resultDigest, evidenceRevision: done.evidenceRevision, leaseTokenDigest: real.lease_token_digest, attempt: real.attempt, requestId, contractDigest: ready.investigation.digest, effectId: intent.effect.effectId, lifecycleVersionAtIssue: ready.lifecycleVersion, stateEnteredAt: done.stateEnteredAt, executionReceipt: { outcome: real.outcome, receipts: real.execution_receipts?.map((r) => ({ profile: r.profile, status: r.status, exit_code: r.exit_code, output_digest: r.output_digest, authoritative_sandbox: r.authoritative_sandbox })) } };
  if (!REAL_HOME) {
    const lateAgain = await fwomps(['deliver', '--request-id', requestId]);
    check('fwomps redelivery after ack never re-sends and never re-executes', lateAgain.code === 0 && lateAgain.status.status === 'acknowledged' && evidence.wire.filter((w) => w.status === 200).length === 1, lateAgain.status);
  }

  // --- 7b. after acceptance: idempotent replay, concurrency, conflicting result, late replay -----
  const replay = await post(rawBody);
  check('byte-identical redelivery is idempotent (200)', replay.status === 200, replay);
  const burst = await Promise.all([1, 2, 3, 4].map(() => post(rawBody)));
  check('concurrent identical redelivery all 200', burst.every((r) => r.status === 200), burst.map((r) => r.status));
  const different = await post(await resign(mutate((e) => { e.outcome = e.outcome === 'reproduced' ? 'not_reproduced' : 'reproduced'; e.summary = `${e.summary} (conflicting)`; })));
  check('a different VALIDLY SIGNED result for the same attempt fails closed as result_conflict', different.status === 409 && different.code === 'result_conflict', different);
  hostileCase('delivery: different validly signed result after acceptance', 'result_conflict', different.code, different.status === 409 && different.code === 'result_conflict');

  // --- 8. invariants after the hostile barrage ---------------------------------------------------
  const finalItems = await findItem();
  const transitions = await DB.prepare("SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND event_type = 'transition' AND to_state = 'DIAGNOSED'").bind(workItemId).first();
  check('still one work item, still DIAGNOSED, one DIAGNOSED transition', finalItems.length === 1 && finalItems[0].state === 'DIAGNOSED' && Number(transitions.n) === 1);
  check('no repair/deploy authority recorded anywhere', !JSON.stringify(evidence.wire).match(/"repair_authority":true/) && (await DB.prepare("SELECT COUNT(*) AS n FROM mc_effects WHERE effect_type IN ('pull_request','deployment')").first()).n === 0);
  const resolved = await api(itemPath(finalItems[0], 'transition'), { auth: adminBearer(), body: { to: 'RESOLVED' } });
  check('diagnosis alone cannot resolve (RESOLVED refused)', resolved.status >= 400, resolved.status);
  hostileCase('operator transition to RESOLVED while DIAGNOSED', '>=400', resolved.status, resolved.status >= 400);

  // --- 9. Confluence-2: fresh reverification on the SAME work item -----------------------------------
  const healthy = { ...degraded, overall_status: 'pass', finding_kind: null, keyword_found: 1, content_detail: null };
  const otherProperty = { target: { id: 'globaldeets', brand: 'globaldeets', name: 'GlobalDeets', url: 'https://globaldeets.com', checkType: 'page' }, overall_status: 'pass', finding_kind: null, status_code: 200, response_time_ms: 90, keyword_found: 1, content_keyword: null, content_detail: null, error: null };
  const sweep = (check, at) => reportToGitHub([check], at, { GITHUB_TOKEN: 'specimen', DB });
  const current = async () => (await findItem())[0];
  const operations = async () => {
    const response = await worker.fetch(new Request('https://goodflippindesign.com/api/mission-control/operations', { headers: { Authorization: `Bearer ${adminBearer()}` } }), env);
    return (await response.json()).operations?.items?.find((entry) => entry.workItemId === workItemId)?.lifecycle;
  };
  const diagnosedItem = await current();
  const entered = Date.parse(diagnosedItem.stateEnteredAt);
  const midpoint = new Date(Math.floor((entered + Date.parse(diagnosedItem.lastSeen)) / 2)).toISOString();

  await sweep(healthy, midpoint); // newer than the failing evidence, OLDER than the diagnosis
  let c2 = await current();
  check('Confluence-2: a healthy observation older than the diagnosis does not resolve', c2.state === 'DIAGNOSED' && !c2.resolvedAt, { observedAt: midpoint, diagnosedAt: diagnosedItem.stateEnteredAt });
  hostileCase('reverify: healthy observation older than the diagnosis', 'DIAGNOSED', c2.state, c2.state === 'DIAGNOSED');
  await sweep(otherProperty, await wallClockAfter(diagnosedItem.stateEnteredAt, c2.lastSeen));
  c2 = await current();
  check('Confluence-2: another property\'s healthy observation cannot resolve this item', c2.state === 'DIAGNOSED' && c2.lifecycleVersion === diagnosedItem.lifecycleVersion);
  hostileCase('reverify: different property healthy observation', 'DIAGNOSED unchanged', c2.state, c2.state === 'DIAGNOSED' && c2.lifecycleVersion === diagnosedItem.lifecycleVersion);
  await sweep(degraded, await wallClockAfter(diagnosedItem.stateEnteredAt, (await current()).lastSeen));
  c2 = await current();
  check('Confluence-2: still-failing evidence after diagnosis leaves it unresolved and is journaled', c2.state === 'DIAGNOSED' && c2.reverification?.result === 'still_failing', c2.reverification);
  const opsBefore = await operations();
  check('Confluence-2: the operator projection says reverification is required and why', opsBefore?.reverificationRequired === true && opsBefore?.diagnosisAvailable === true && Boolean(opsBefore?.blocker), opsBefore);

  const healthyAt = await wallClockAfter((await current()).stateEnteredAt, (await current()).lastSeen);
  await sweep(healthy, healthyAt);
  const resolvedItem = await current();
  check('Confluence-2: a strictly newer healthy observation resolves the SAME work item', resolvedItem.workItemId === workItemId && resolvedItem.state === 'RESOLVED' && resolvedItem.resolvedAt === healthyAt, { resolvedAt: resolvedItem.resolvedAt, resolutionEvidenceDigest: resolvedItem.resolutionEvidenceDigest });
  check('Confluence-2: the diagnosis stays on the resolved item (lineage), lease still released', resolvedItem.diagnosis?.resultDigest === done.diagnosis.resultDigest && resolvedItem.activeLease === null);
  await sweep(healthy, healthyAt);
  await sweep(healthy, await wallClockAfter(healthyAt));
  const idempotent = await current();
  check('Confluence-2: repeated and later healthy observations are idempotent', idempotent.state === 'RESOLVED' && idempotent.lifecycleVersion === resolvedItem.lifecycleVersion && idempotent.resolvedAt === healthyAt);
  hostileCase('reverify: replayed / repeated healthy observation', 'RESOLVED unchanged', idempotent.state, idempotent.lifecycleVersion === resolvedItem.lifecycleVersion);
  const opsResolved = await operations();
  check('Confluence-2: the projection shows the resolved reverification', opsResolved?.reverification?.result === 'resolved' && opsResolved?.reverificationRequired === false && opsResolved?.blocker === null, opsResolved);
  const staleDegraded = new Date(Date.parse(resolvedItem.resolvedAt) - 60_000).toISOString();
  await sweep(degraded, staleDegraded);
  check('Confluence-2: a degraded observation older than the resolution does not reopen it', (await current()).state === 'RESOLVED');
  hostileCase('recurrence: degraded observation older than the resolution', 'RESOLVED', (await current()).state, (await current()).state === 'RESOLVED');
  const lateResult = await post(rawBody);
  check('Confluence-2: the old FWOMPS result replayed after resolution is refused and changes nothing', lateResult.status >= 400 && (await current()).state === 'RESOLVED', lateResult);
  hostileCase('replay: old signed result after resolution', 'refused', lateResult.code, lateResult.status >= 400);

  const recurAt = await wallClockAfter(resolvedItem.resolvedAt, (await current()).lastSeen);
  await sweep(degraded, recurAt);
  const recurrent = await current();
  check('Confluence-2: a later degraded observation recurs the SAME lineage', recurrent.workItemId === workItemId && recurrent.state === 'RECURRENT' && recurrent.recurrenceCount === 1 && recurrent.diagnosis === null, { recurrenceCount: recurrent.recurrenceCount });
  check('Confluence-2: still exactly one work item for this finding', (await findItem()).length === 1);
  const opsRecurrent = await operations();
  check('Confluence-2: recurrence projection is scoped to the new cycle', opsRecurrent?.recurrenceCount === 1 && opsRecurrent?.diagnosisAvailable === false && opsRecurrent?.reverification === null, opsRecurrent);
  const lineage = (await DB.prepare("SELECT to_state FROM mc_work_item_events WHERE work_item_id = ? AND event_type = 'transition' ORDER BY occurred_at, rowid").bind(workItemId).all()).results.map((row) => row.to_state);
  check('Confluence-2: history keeps OBSERVED..DIAGNOSED..RESOLVED..RECURRENT on one item', ['QUALIFIED', 'INVESTIGATION_READY', 'INVESTIGATING', 'DIAGNOSED', 'RESOLVED', 'RECURRENT'].every((state) => lineage.includes(state)), lineage);
  const noRepair = (await DB.prepare("SELECT COUNT(*) AS n FROM mc_effects WHERE effect_type IN ('pull_request','deployment')").first()).n === 0;
  check('Confluence-2: no repair or deploy authority anywhere in the loop', noRepair);
  evidence.confluence2 = {
    diagnosedAt: diagnosedItem.stateEnteredAt,
    staleHealthyObservedAt: midpoint,
    resolvedAt: resolvedItem.resolvedAt,
    resolutionEvidenceDigest: resolvedItem.resolutionEvidenceDigest,
    recurrenceObservedAt: recurAt,
    recurrenceCount: recurrent.recurrenceCount,
    lineage,
    projection: { beforeResolution: opsBefore, afterResolution: opsResolved, afterRecurrence: opsRecurrent },
  };

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
  // Failed runs are evidence too. Build the stable comparable summary from whatever was captured before
  // the failure, rather than omitting the schema/outcome when an intermediate operation throws.
  const failedChecks = evidence.checks.filter((c) => !c.pass).map((c) => c.name);
  const gfdRevision = evidence.gfdRevision || shMaybe('git', ['-C', GFD_ROOT, 'rev-parse', 'HEAD']);
  const fwompsRevision = evidence.fwompsRevision || shMaybe('git', ['-C', FWOMPS_REPO, 'rev-parse', 'HEAD']);
  evidence.summary = {
    schema: 'gfd-mc-confluence-evidence-1',
    mode: evidence.mode,
    outcome: exitCode === 0 ? 'pass' : 'fail',
    gfd: { revision: gfdRevision, dirty: shMaybe('git', ['-C', GFD_ROOT, 'status', '--porcelain']) !== '' },
    fwomps: { revision: fwompsRevision, branch: shMaybe('git', ['-C', FWOMPS_REPO, 'branch', '--show-current']), dirty: shMaybe('git', ['-C', FWOMPS_REPO, 'status', '--porcelain']) !== '', home: REAL_HOME ? 'real-host-registration' : 'isolated' },
    host: REAL_HOME && realHost ? { deliveryOrigin: realHost.deliveryOrigin, workerId: realHost.workerId, workerKeyId: realHost.workerKeyId, contractKeyId: realHost.contractKeyId, deliverySubstituted: true } : null,
    property: PROPERTY,
    workItemId: evidence.workItemId ?? null,
    evidenceRevisions: { aiaimate: evidence.aiaimateRevision ?? null, contract: evidence.diagnosis?.evidenceRevision ?? null },
    identifiers: { requestId: evidence.diagnosis?.requestId ?? null, effectId: evidence.diagnosis?.effectId ?? null, attempt: evidence.diagnosis?.attempt ?? null, lifecycleVersionAtIssue: evidence.diagnosis?.lifecycleVersionAtIssue ?? null },
    digests: { contract: evidence.diagnosis?.contractDigest ?? null, leaseToken: evidence.diagnosis?.leaseTokenDigest ?? null, result: evidence.diagnosis?.resultDigest ?? null, resolution: evidence.confluence2?.resolutionEvidenceDigest ?? null },
    timestamps: { startedAt: evidence.startedAt, diagnosedAt: evidence.diagnosis?.stateEnteredAt ?? null, resolvedAt: evidence.confluence2?.resolvedAt ?? null, recurredObservedAt: evidence.confluence2?.recurrenceObservedAt ?? null, finishedAt: evidence.finishedAt },
    executionReceipt: evidence.diagnosis?.executionReceipt ?? null,
    lifecycle: evidence.confluence2?.lineage ?? null,
    recurrenceCount: evidence.confluence2?.recurrenceCount ?? null,
    hostileCases: evidence.hostileCases,
    checks: { total: evidence.checks.length, failed: failedChecks },
  };
  for (const w of evidence.wire) if (w.result) w.result = { bodySha256: sha256(Buffer.from(w.result.body)) }; // keep evidence small; digests only
  writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2));
  server.close();
  await mf.dispose();
  const failed = evidence.checks.filter((c) => !c.pass);
  console.log(`\n${evidence.checks.length - failed.length}/${evidence.checks.length} checks passed — evidence: ${EVIDENCE_PATH}`);
  if (failed.length) console.log('FAILED:', failed.map((c) => c.name).join('; '));
  process.exit(exitCode);
}
