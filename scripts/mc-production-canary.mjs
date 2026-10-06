#!/usr/bin/env node
/**
 * ONE bounded Mission Control -> FWOMPS -> Mission Control read-only investigation against a real GFD origin
 * (production by default). A canary, not an activation: one eligible property (aiaimate.com), one canonical work
 * item, the host's fixed registered read-only profile, no repair or deploy authority anywhere.
 *
 *   GFD_MC_CANARY_RUNNER_TOKEN=<canary-runner token>  (PREFERRED production identity for the operator-side steps: a dedicated
 *                                                      machine credential, authoritative only while MISSION_CONTROL_CANARY=aiaimate.com,
 *                                                      limited to the canary surface; never a Clerk admin)
 *   GFD_OPERATOR_TOKEN=<admin Clerk session bearer>   (alternative: operator steps as the human admin; read from env only, never printed or recorded)
 *   GFD_OPERATOR_TOKEN_FEED=<http://127.0.0.1:port/path>  (optional, loopback only; instead of the static token: GET returns one
 *                                                        fresh bearer per admin request, because Clerk session tokens live ~60s)
 *   GFD_MC_WORKER_TOKEN=<delivery bearer>             (worker steps; the same variable the FWOMPS host delivers with)
 *   FWOMPS_REPO=<merged FWOMPS checkout> PYTHON=<python with fwomps deps>
 *   node --no-warnings --import ./tests/acceptance/node-json-hook.mjs scripts/mc-production-canary.mjs \
 *       --fwomps-home ~/.fwomps --out <evidence.json> [--origin https://goodflippindesign.com] \
 *       [--preflight <preflight.json>] [--tests "<label>=<passed>/<total>" ...] [--no-reverify] [--close-previous]
 *
 * Requires MISSION_CONTROL_CANARY=aiaimate.com on the target deployment (see scripts/mc-production-provision.mjs).
 * It uses the host's REAL registered delivery path: `fwomps investigate` delivers the signed result to the origin
 * named in the host config. Nothing local substitutes for the receiver. Secrets never enter the evidence file.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createOperatorTokenSource, sendWithConnectionRetry } from './lib/canary-operator-auth.mjs';
import { runDeliveryPathProbe } from './lib/mc-delivery-path-probe.mjs';
import { classifyCanaryItems } from './lib/mc-canary-item-state.mjs';

const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? null : null; };
const values = (name) => args.flatMap((arg, i) => (arg === name && args[i + 1] ? [args[i + 1]] : []));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = (value('--origin') || 'https://goodflippindesign.com').replace(/\/$/, '');
const HOME = path.resolve((value('--fwomps-home') || path.join(os.homedir(), '.fwomps')).replace(/^~(?=$|[\\/])/, os.homedir()));
const OUT = path.resolve(value('--out') || path.join(os.tmpdir(), `mc-production-canary-${Date.now()}.json`));
const FWOMPS_REPO = process.env.FWOMPS_REPO;
const PYTHON = process.env.PYTHON || 'python';
const BEARER_ENV = 'GFD_MC_WORKER_TOKEN';
const operatorToken = createOperatorTokenSource({ runnerToken: process.env.GFD_MC_CANARY_RUNNER_TOKEN, staticToken: process.env.GFD_OPERATOR_TOKEN, feedUrl: process.env.GFD_OPERATOR_TOKEN_FEED });
const WORKER = process.env[BEARER_ENV];
const PROPERTY = 'aiaimate.com';
for (const [name, ok] of [['FWOMPS_REPO', FWOMPS_REPO], [BEARER_ENV, WORKER]]) {
  if (!ok) throw new Error(`${name} must be set in the environment`);
}

const load = (rel) => import(new URL(rel, `file:///${ROOT.replaceAll('\\', '/')}/`));
const { keyBytesFromEnv, signResultEnvelope } = await load('workers/fwomps-investigation-adapter.js');

const sha256 = (text) => `sha256:${createHash('sha256').update(text).digest('hex')}`;
const git = (cwd, ...gitArgs) => spawnSync('git', ['-C', cwd, ...gitArgs], { encoding: 'utf8' }).stdout.trim();
const evidence = { schema: 'gfd-mc-production-canary-1', origin: ORIGIN, startedAt: new Date().toISOString(), steps: [], checks: [], hostileCases: [] };
const step = (name, detail = {}) => { evidence.steps.push({ at: new Date().toISOString(), name, ...detail }); console.log(`• ${name}`); };
const check = (name, pass, detail = null) => { evidence.checks.push({ name, pass: Boolean(pass), ...(detail == null ? {} : { detail }) }); console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`); return Boolean(pass); };
const hostile = (name, expected, observed, pass) => evidence.hostileCases.push({ name, expected, observed, pass: Boolean(pass) });

async function http(method, route, { token, body, raw } = {}) {
  const send = () => fetch(`${ORIGIN}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
  // The blocking FWOMPS run can leave a pooled keep-alive socket dead; a request that never reached the server
  // (connection-level failure, no response) is safe to send once more. Server responses are never retried.
  const response = await sendWithConnectionRetry(send);
  let json = null;
  try { json = await response.clone().json(); } catch { /* not json */ }
  return { status: response.status, json };
}
const admin = async (method, route, body) => http(method, route, { token: await operatorToken(), body });
const itemRoute = (id, action) => `/api/mission-control/work-items/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;

let exitCode = 1;
try {
  // ---- host identity (names and ids only; secrets are read in memory, only to sign hostile probes) ------------------
  const config = JSON.parse(readFileSync(path.join(HOME, 'config.json'), 'utf8'));
  const mc = config.mission_control || {};
  const binding = mc.properties?.[PROPERTY];
  if (!mc.enabled || !binding) throw new Error(`host has no ${PROPERTY} binding`);
  const workspace = config.workspaces[binding.workspace].root;
  const revision = git(workspace, 'rev-parse', 'HEAD');
  const dirty = git(workspace, 'status', '--porcelain') !== '';
  const workerKeyHex = JSON.parse(readFileSync(path.join(HOME, 'mission-control', 'worker-keys', `${mc.worker_key_id}.json`), 'utf8')).secret_hex;
  evidence.host = { workerId: mc.worker_id, workerKeyId: mc.worker_key_id, deliveryOrigin: mc.delivery?.result_base_url, profile: binding.investigation_profile, repository: binding.repository, workspaceRevision: revision, workspaceClean: !dirty };
  evidence.fwomps = { revision: git(FWOMPS_REPO, 'rev-parse', 'HEAD'), branch: git(FWOMPS_REPO, 'branch', '--show-current') || '(detached)', dirty: git(FWOMPS_REPO, 'status', '--porcelain') !== '' };
  evidence.gfdSource = { revision: git(ROOT, 'rev-parse', 'HEAD'), dirty: git(ROOT, 'status', '--porcelain') !== '' };
  check('host delivery origin is the origin under test (no substituted receiver)', mc.delivery?.result_base_url === ORIGIN, { configured: mc.delivery?.result_base_url, under_test: ORIGIN });
  check('host workspace is clean', !dirty, { revision });

  // ---- deployed identity ------------------------------------------------------------------------------------------------
  const provenance = await http('GET', '/api/mission-control/provenance', { token: await operatorToken() });
  evidence.deployment = provenance.status === 200 ? provenance.json : { status: provenance.status, note: 'provenance route unavailable' };

  // ---- 0. nothing is mutated until the one-shot attempt can actually succeed -----------------------------------------------------------
  // The canary item is single-attempt and only a human admin can expire an abandoned lease, so prove the two things that
  // previously spent it: the host's REAL transport must reach the Worker (not be blocked at the Cloudflare edge), and the
  // existing canary item (if any) must be in a state the bounded runner can advance.
  step('delivery path: host transport -> origin (credential-less, writes nothing)');
  const deliveryPath = runDeliveryPathProbe({ origin: ORIGIN, python: PYTHON, fwompsRepo: FWOMPS_REPO });
  evidence.deliveryPath = { verdict: deliveryPath.verdict, status: deliveryPath.status, detail: deliveryPath.detail };
  if (!check('the host delivery transport reaches the Worker (not blocked at the edge)', deliveryPath.ok, evidence.deliveryPath)) throw new Error(`delivery path blocked (${deliveryPath.verdict}); nothing was changed in production`);
  step('canary item state (runner read)');
  const existing = await admin('GET', '/api/mission-control/work-items');
  if (!check('canary is enabled and the work-item list is readable', existing.status === 200 && Array.isArray(existing.json?.workItems), { status: existing.status, code: existing.json?.code })) throw new Error('canary is not enabled on the target');
  const plan = classifyCanaryItems(existing.json.workItems.filter((entry) => entry.producer === 'mc-canary'), { closePrevious: args.includes('--close-previous') });
  evidence.startState = { state: plan.state, action: plan.action };
  if (!check('the canary item is in a state this run can safely advance', plan.run, { state: plan.state, reason: plan.reason })) throw new Error(plan.reason);
  if (plan.action === 'close-previous') {
    // The earlier cycle's diagnosis stays in the item's event ledger; this only completes its lifecycle the ordinary way
    // (operator-asserted healthy observation, strictly newer than the diagnosis) so a clean new cycle can be proven.
    step('close the previous diagnosed cycle (healthy canary observation, explicit --close-previous)');
    const before = existing.json.workItems.find((entry) => entry.producer === 'mc-canary');
    const closed = await admin('POST', '/api/mission-control/canary-observations', { status: 'pass' });
    const closedItem = closed.json?.workItem;
    if (!check('the previous diagnosed cycle is reverified to RESOLVED', closed.status === 200 && closedItem?.workItemId === before.workItemId && closedItem?.state === 'RESOLVED', { status: closed.status, state: closedItem?.state })) throw new Error('could not close the previous cycle; nothing else was changed');
    evidence.previousCycle = { workItemId: before.workItemId, diagnosedState: before.state, diagnosisDigest: before.diagnosis?.resultDigest ?? null, resolvedAt: closedItem.resolvedAt ?? null, note: 'completed by an operator-asserted healthy canary observation; the diagnosis remains in the work-item event ledger' };
  }

  // ---- 1. observation boundary (operator-asserted, canary identity) -------------------------------------------------------------
  step('canary observation: degraded');
  const observed = await admin('POST', '/api/mission-control/canary-observations', { status: 'degraded' });
  if (!check('canary observation accepted (kill switch is on)', observed.status === 200, { status: observed.status, code: observed.json?.code })) throw new Error('canary is not enabled on the target');
  let item = observed.json.workItem;
  const workItemId = item.workItemId;
  evidence.workItemId = workItemId;
  const lifecycle = [{ state: item.state, at: new Date().toISOString(), lifecycleVersion: item.lifecycleVersion }];
  const advance = (next) => { item = next; lifecycle.push({ state: item.state, at: new Date().toISOString(), lifecycleVersion: item.lifecycleVersion }); };

  // ---- 2. qualify, signed contract -----------------------------------------------------------------------------------------------
  if (item.state === 'QUALIFIED') {
    check('qualified from the governed registry (already QUALIFIED by a recovered earlier attempt)', true, { state: item.state });
  } else {
    const qualified = await admin('POST', itemRoute(workItemId, 'transition'), { to: 'QUALIFIED' });
    check('qualified from the governed registry', qualified.status === 200 && qualified.json.workItem.state === 'QUALIFIED', { status: qualified.status });
    advance(qualified.json.workItem);
  }
  const issued = await admin('POST', itemRoute(workItemId, 'investigate'), { evidenceRevision: revision });
  if (!check('production GFD signed a read-only investigation contract', issued.status === 200 && issued.json.workItem.state === 'INVESTIGATION_READY' && issued.json.contract, { status: issued.status })) throw new Error('no contract');
  advance(issued.json.workItem);
  const contract = issued.json.contract;
  evidence.investigation = { requestId: item.investigation.requestId, contractDigest: item.investigation.digest, contractSchema: item.investigation.schemaVersion, repairAuthority: item.investigation.repairAuthority, evidenceRevision: item.evidenceRevision };
  check('contract carries no repair authority', item.investigation.repairAuthority === false);

  // ---- 3. durable intent + claim, 4. signed lease --------------------------------------------------------------------------------
  const dispatched = await admin('POST', itemRoute(workItemId, 'dispatch'), {});
  if (!check('durable dispatch intent committed and claimed (attempt 1)', dispatched.status === 200 && dispatched.json.attempt === 1, { status: dispatched.status, code: dispatched.json?.code })) throw new Error('dispatch failed');
  const dispatch = dispatched.json;
  evidence.investigation.effectId = dispatch.effectId;
  evidence.investigation.attempt = dispatch.attempt;
  const leased = await http('POST', itemRoute(workItemId, 'lease'), { token: WORKER, body: { effect_id: dispatch.effectId, attempt: dispatch.attempt } });
  if (!check('signed lease minted, item INVESTIGATING', leased.status === 200 && leased.json.workItem.state === 'INVESTIGATING', { status: leased.status, code: leased.json?.code })) throw new Error('lease failed');
  advance(leased.json.workItem);
  evidence.investigation.leaseSchema = leased.json.leaseGrant?.schema_version ?? null;
  evidence.investigation.leaseTokenDigest = leased.json.workItem.activeLease?.leaseId ?? null;
  const runDir = path.join(path.dirname(OUT), `.canary-${Date.now()}`);
  mkdirSync(runDir, { recursive: true });
  const files = { contract: path.join(runDir, 'contract.json'), lease: path.join(runDir, 'lease.json'), token: path.join(runDir, 'lease.token') };
  writeFileSync(files.contract, JSON.stringify(contract));
  writeFileSync(files.lease, JSON.stringify(leased.json.leaseGrant));
  writeFileSync(files.token, leased.json.leaseTokenHex);

  // ---- 5. the host's REAL path: execute in the attested sandbox and deliver to the real origin ---------------------------------------
  step('fwomps investigate (attested sandbox, real registered delivery)');
  const run = spawnSync(PYTHON, ['-m', 'fwomps.mission_control', '--home', HOME, 'investigate', '--contract', files.contract, '--lease', files.lease, '--lease-token-file', files.token], {
    cwd: FWOMPS_REPO, encoding: 'utf8', timeout: 420_000, env: { ...process.env, PYTHONPATH: FWOMPS_REPO, PYTHONIOENCODING: 'utf-8' },
  });
  let status = {};
  try { status = JSON.parse(run.stdout.trim().split('\n').pop() || '{}'); } catch { /* reported below */ }
  evidence.fwompsRun = { exitCode: run.status, status: status.status, requestId: status.request_id, resultDigest: status.result_digest, attempt: status.attempt };
  if (!check('fwomps executed and the origin acknowledged delivery (exit 0, acknowledged)', run.status === 0 && status.status === 'acknowledged', evidence.fwompsRun)) {
    // The one-shot lease is spent; nothing after this can be proven. Stop with the recovery facts instead of probing further.
    throw new Error(`delivery was not acknowledged (${status.status || 'no status'}, exit ${run.status}); the single-attempt lease is spent and request ${status.request_id || '(none)'} must be redelivered by the host before the lease expires, otherwise a human admin must expire the lease`);
  }
  const persistedPath = path.join(HOME, 'mission-control', 'results', `${status.request_id}.attempt-1.json`);
  const persisted = readFileSync(persistedPath, 'utf8');
  const envelope = JSON.parse(persisted);
  evidence.result = {
    schema: envelope.schema_version, outcome: envelope.outcome, summary: envelope.summary, workerId: envelope.worker?.id,
    completedAt: envelope.worker?.completed_at, keyId: envelope.authentication?.key_id, repairability: envelope.repairability?.state,
    receipts: envelope.execution_receipts?.map((r) => ({ profile: r.profile, status: r.status, exit_code: r.exit_code, output_digest: r.output_digest, authoritative_sandbox: r.authoritative_sandbox })),
    bodySha256: sha256(persisted),
  };
  check('the investigation EXECUTED in the authoritative sandbox (outcome reproduced|not_reproduced with a receipt), not blocked or inconclusive', ['reproduced', 'not_reproduced'].includes(envelope.outcome) && (envelope.execution_receipts?.length ?? 0) > 0, { outcome: envelope.outcome, stop_reason: envelope.stop_reason ?? null });
  check('result is read-only, from the authoritative sandbox, signed by the registered worker key id', envelope.repairability?.state === 'not_indicated' && envelope.execution_receipts?.every((r) => r.authoritative_sandbox === true) && envelope.authentication?.key_id === mc.worker_key_id && envelope.worker?.id === mc.worker_id);

  // ---- 6. production verified and projected the result ----------------------------------------------------------------------------------
  const projected = await admin('GET', itemRoute(workItemId));
  const diagnosed = projected.json?.workItem;
  advance(diagnosed);
  check('the SAME canonical work item is DIAGNOSED in production', projected.status === 200 && diagnosed.workItemId === workItemId && diagnosed.state === 'DIAGNOSED', { state: diagnosed?.state });
  check('diagnosis digest equals the digest FWOMPS persisted and reported', diagnosed?.diagnosis?.resultDigest === status.result_digest);
  check('lease released; no active lease', diagnosed?.activeLease === null);
  evidence.diagnosis = { resultDigest: diagnosed?.diagnosis?.resultDigest, signatureRef: diagnosed?.diagnosis?.signatureRef, outcome: diagnosed?.diagnosis?.outcome, summary: diagnosed?.diagnosis?.summary };

  // ---- 7. replay / stale / tamper against the real origin ----------------------------------------------------------------------------------
  const resultRoute = itemRoute(workItemId, 'result');
  const resign = async (mutate) => { const copy = JSON.parse(persisted); mutate(copy); const { authentication, ...unsigned } = copy; return signResultEnvelope({ ...unsigned, authentication: { key_id: authentication.key_id } }, keyBytesFromEnv(workerKeyHex)); };
  const macKey = Object.keys(envelope.authentication).find((key) => /mac|signature/.test(key));
  const probes = {
    'byte-identical redelivery': [{ raw: persisted }, 200],
    'tampered MAC': [{ body: (() => { const c = JSON.parse(persisted); c.authentication[macKey] = `${c.authentication[macKey].slice(0, -1)}${c.authentication[macKey].endsWith('0') ? '1' : '0'}`; return c; })() }, 'mac_invalid'],
    'edited summary (MAC mismatch)': [{ body: (() => { const c = JSON.parse(persisted); c.summary += ' (edited)'; return c; })() }, 'mac_invalid'],
    'VALIDLY SIGNED different result (conflict)': [{ body: await resign((c) => { c.summary = `${c.summary.slice(0, -1)}${c.summary.endsWith('x') ? 'y' : 'x'}`; }) }, 'result_conflict'],
    'VALIDLY SIGNED stale/old attempt': [{ body: await resign((c) => { c.attempt = 2; }) }, 'result_conflict'],
    'smuggled repair authority (signed)': [{ body: await resign((c) => { c.repair_authority = true; }) }, 'malformed_result'],
  };
  for (const [name, [payload, expected]] of Object.entries(probes)) {
    const response = await http('POST', resultRoute, { token: WORKER, ...payload });
    const observedCode = response.status === 200 ? 200 : response.json?.code;
    const pass = expected === 200 ? response.status === 200 : response.status >= 400 && observedCode === expected;
    check(`hostile: ${name} -> ${expected}`, pass, { status: response.status, code: response.json?.code });
    hostile(name, expected, observedCode, pass);
  }
  const wrongBearer = await http('POST', resultRoute, { token: 'wrong-bearer', raw: persisted });
  check('hostile: wrong bearer refused', wrongBearer.status === 401 || wrongBearer.status === 403, { status: wrongBearer.status });
  hostile('wrong bearer', '401|403', wrongBearer.status, wrongBearer.status === 401 || wrongBearer.status === 403);
  const redeliver = spawnSync(PYTHON, ['-m', 'fwomps.mission_control', '--home', HOME, 'deliver', '--request-id', status.request_id], { cwd: FWOMPS_REPO, encoding: 'utf8', env: { ...process.env, PYTHONPATH: FWOMPS_REPO, PYTHONIOENCODING: 'utf-8' } });
  check('fwomps redelivery after acknowledgement is idempotent (acknowledged, nothing re-executed)', redeliver.status === 0 && /acknowledged/.test(redeliver.stdout));
  hostile('fwomps redelivery after ack', 'acknowledged', redeliver.status, redeliver.status === 0);
  const after = (await admin('GET', itemRoute(workItemId))).json.workItem;
  check('after every hostile delivery: still one item, still DIAGNOSED, same diagnosis, no repair/deploy authority', after.state === 'DIAGNOSED' && after.diagnosis.resultDigest === diagnosed.diagnosis.resultDigest && after.repairAuthorityRef == null);
  const operations = await admin('GET', '/api/mission-control/operations');
  const view = operations.json?.operations?.items?.find((entry) => entry.workItemId === workItemId);
  evidence.projection = { afterDiagnosis: view?.lifecycle ?? null, authority: operations.json?.operations?.authority ?? null };
  check('the operator projection grants no authority and shows reverification required', JSON.stringify(operations.json?.operations?.authority) === JSON.stringify({ repair: false, deployment: false, execution: false }) && view?.lifecycle?.reverificationRequired === true);
  const listed = (await admin('GET', '/api/mission-control/work-items')).json.workItems.filter((entry) => entry.producer === 'mc-canary');
  check('exactly one canary work item exists in production', listed.length === 1 && listed[0].workItemId === workItemId);
  const diagnosedAt = after.stateEnteredAt;

  // ---- 8. reverification (operator-asserted healthy canary observation, strictly after the diagnosis) ----------------------------------
  if (!args.includes('--no-reverify')) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const healthy = await admin('POST', '/api/mission-control/canary-observations', { status: 'pass' });
    const final = healthy.json?.workItem;
    check('a strictly newer healthy canary observation reverifies the SAME item (RESOLVED)', healthy.status === 200 && final?.workItemId === workItemId && final?.state === 'RESOLVED', { state: final?.state });
    if (final) advance(final);
    const replay = await admin('POST', '/api/mission-control/canary-observations', { status: 'pass' });
    check('a repeated healthy observation is idempotent', replay.status === 200 && replay.json.workItem.state === 'RESOLVED' && replay.json.workItem.lifecycleVersion >= final.lifecycleVersion);
    evidence.reverification = { diagnosedAt, resolvedAt: final?.resolvedAt, resolutionEvidenceDigest: final?.resolutionEvidenceDigest, note: 'operator-asserted canary observation; not a production health probe' };
  } else evidence.reverification = { skipped: true };

  evidence.lifecycle = lifecycle;
  exitCode = evidence.checks.every((c) => c.pass) ? 0 : 1;
} catch (error) {
  evidence.error = String(error?.message || error);
  console.error(evidence.error);
} finally {
  evidence.finishedAt = new Date().toISOString();
  evidence.outcome = exitCode === 0 ? 'pass' : 'fail';
  const preflightPath = value('--preflight');
  if (preflightPath) { try { evidence.preflight = JSON.parse(readFileSync(path.resolve(preflightPath), 'utf8')); } catch { evidence.preflight = { error: 'unreadable' }; } }
  evidence.tests = Object.fromEntries(values('--tests').map((entry) => { const [label, counts] = entry.split('='); return [label, counts]; }));
  evidence.checkTotals = { total: evidence.checks.length, failed: evidence.checks.filter((c) => !c.pass).map((c) => c.name) };
  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(`\n${evidence.checks.length - evidence.checkTotals.failed.length}/${evidence.checks.length} checks passed — evidence: ${OUT}`);
  process.exit(exitCode);
}
