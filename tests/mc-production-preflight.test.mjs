import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { runPromotionGate } from '../scripts/lib/property-promotion-gate.mjs';
import { CHECKS, EXPECTED_PROTOCOL, evaluatePreflight, fetchRuntimeProbe, fingerprint, formatPreflight, isCanonicalOrigin } from '../scripts/lib/mc-production-preflight.mjs';
import { fetchPagesControlPlane, judgeControlPlane, normalizeProject } from '../scripts/lib/pages-control-plane.mjs';
import { auditForSecrets } from '../scripts/lib/revision-bound-evidence.mjs';
import { kcvFromBytes } from '../scripts/lib/fwomps-host-identity.mjs';
import { strongHexKeyBytes, strongTokenBytes } from '../workers/lib/key-check-value.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => JSON.parse(readFileSync(`${ROOT}${rel}`, 'utf8'));
const SHA = 'a'.repeat(40);
const OTHER = 'c'.repeat(40);
const D1 = 'a46ec9df-31b8-4285-845b-1fd3a62bd1b5';
const DEPLOYMENT = '58d05431-3a61-47ab-a8ec-0e1678829e3f';
const WORKER_ID = 'fwomps-worker-id-sentinel';
const RESULT_KEY_ID = 'result-key-id-sentinel';
const CONTRACT_KEY_ID = 'contract-key-id-sentinel';
const OPERATOR_TOKEN = 'operator-bearer-sentinel-0123456789';
const CF_TOKEN = 'cloudflare-api-token-sentinel-0123456789';
const CONTRACT_HEX = '1'.repeat(64);
const RESULT_HEX = '2'.repeat(64);
const BEARER = '3'.repeat(128); // canonical generated 512-bit lowercase-hex delivery bearer
const KCV = {
  contract: kcvFromBytes(strongHexKeyBytes(CONTRACT_HEX), 'contract'),
  result: kcvFromBytes(strongHexKeyBytes(RESULT_HEX), 'result'),
  bearer: kcvFromBytes(strongTokenBytes(BEARER), 'bearer'),
};
const MC = ['MISSION_CONTROL_CONTRACT_KEY', 'MISSION_CONTROL_CONTRACT_KEY_ID', 'MISSION_CONTROL_RESULT_KEY', 'MISSION_CONTROL_RESULT_KEY_ID', 'MISSION_CONTROL_RESULT_WORKER_ID', 'MISSION_CONTROL_WORKER_TOKEN', 'MISSION_CONTROL_CANARY_RUNNER_TOKEN'];

// --- fixtures: the raw Cloudflare API shape, normalized by the real code -------------------------------
const rawProject = () => ({
  name: 'goodflippindesign',
  production_branch: 'main',
  domains: ['goodflippindesign.pages.dev', 'goodflippindesign.com', 'www.goodflippindesign.com'],
  source: { type: 'github', config: { owner: 'weave0', repo_name: 'goodflippindesign', production_branch: 'main' } },
  canonical_deployment: {
    id: DEPLOYMENT, environment: 'production', created_on: '2026-10-01T01:27:56Z', url: `https://${DEPLOYMENT.slice(0, 8)}.goodflippindesign.pages.dev`,
    deployment_trigger: { type: 'github:push', metadata: { branch: 'main', commit_hash: SHA } },
    latest_stage: { name: 'deploy', status: 'success', ended_on: '2026-10-01T01:29:10Z' },
  },
  deployment_configs: { production: { d1_databases: { DB: { id: D1 } }, env_vars: Object.fromEntries(['CLERK_SECRET_KEY', ...MC].map((n) => [n, { type: 'secret_text', value: 'MUST-NEVER-APPEAR' }])) } },
});
const cp = (mutate = () => {}) => { const raw = rawProject(); mutate(raw); return { project: normalizeProject(raw) }; };

const present = (name, fp, kcv) => [name, { state: 'present', ...(fp ? { fingerprint: fingerprint(fp) } : {}), ...(kcv ? { kcv } : {}) }];
const goodBody = () => ({
  schemaVersion: 'gfd-mc-runtime-provenance-1',
  runtime: { kind: 'cloudflare-pages-advanced-worker', expectedProject: 'goodflippindesign', servedHost: 'goodflippindesign.com' },
  observedAt: '2026-10-01T12:00:00.000Z',
  release: { state: 'stamped', sha: SHA, builtAt: '2026-10-01T01:28:30.000Z', branch: 'main', source: 'cloudflare-pages', url: `https://${DEPLOYMENT.slice(0, 8)}.goodflippindesign.pages.dev`, reason: null },
  protocol: JSON.parse(JSON.stringify(EXPECTED_PROTOCOL)),
  capabilities: { investigation: true, readOnly: true, repairAuthority: false, deployAuthority: false, writeAuthority: false, maxAttempts: 1 },
  bindings: Object.fromEntries([
    present('MISSION_CONTROL_CONTRACT_KEY', null, KCV.contract), present('MISSION_CONTROL_CONTRACT_KEY_ID', CONTRACT_KEY_ID),
    present('MISSION_CONTROL_RESULT_KEY', null, KCV.result), present('MISSION_CONTROL_RESULT_KEY_ID', RESULT_KEY_ID),
    present('MISSION_CONTROL_RESULT_WORKER_ID', WORKER_ID), present('MISSION_CONTROL_WORKER_TOKEN', null, KCV.bearer), present('MISSION_CONTROL_CANARY_RUNNER_TOKEN'),
  ]),
  d1: { bound: true, reachable: true, workItemSchema: true },
  ready: true,
  blockers: [],
});

const check = (status = 'PASS', reason = 'ok') => ({ name: 'x', status, reason });
const gateRow = (propertyId, over = {}) => ({
  propertyId, promotable: propertyId === 'aiaimate.com', hostVerified: propertyId === 'aiaimate.com',
  readinessDispatchReady: propertyId === 'aiaimate.com', checks: { C1: check(), C4: check() }, ...over,
});
const goodGate = () => ({ fwompsHomeVerified: true, properties: ['aiaimate.com', 'a.example', 'b.example'].map((id) => gateRow(id)) });

const good = () => ({
  expectedSha: SHA, localHeadSha: SHA, expectedOnMain: true, expectedWorkerId: WORKER_ID, origin: 'https://goodflippindesign.com',
  controlPlane: cp(), probe: { status: 200, body: goodBody() },
  host: {
    workerId: WORKER_ID, workerKeyId: RESULT_KEY_ID,
    workerKey: { keyId: RESULT_KEY_ID, enrolled: true, problems: [], kcv: KCV.result },
    contractKeys: [{ keyId: CONTRACT_KEY_ID, enrolled: true, problems: [], kcv: KCV.contract }, { keyId: 'other-key', enrolled: true, problems: [], kcv: 'kcv:0000000000000000' }],
  },
  gate: goodGate(), canonicalD1Id: D1, bearerKcv: KCV.bearer,
});
const run = (mutate) => { const input = good(); mutate(input); return evaluatePreflight(input); };
const only = (result, ...codes) => assert.deepEqual(result.failing, codes, formatPreflight(result));

// --- all green; evidence names the Pages deployment ----------------------------------------------------
{
  const result = evaluatePreflight(good());
  assert.equal(result.canStartInvestigation, true, formatPreflight(result));
  assert.deepEqual(Object.keys(result.checks), CHECKS.map(([c]) => c));
  assert.equal(CHECKS.length, 12);
  assert.equal(result.cloudflare.deploymentId, DEPLOYMENT);
  assert.equal(result.cloudflare.commitHash, SHA);
  assert.equal(result.runtimeRelease.sha, SHA);
  assert.deepEqual(result.authority, { mutates: false, repair: false, deploy: false, repositoryWrite: false });
}

// --- P0 -----------------------------------------------------------------------------------------------
only(run((i) => { i.localHeadSha = OTHER; }), 'P0');
only(run((i) => { i.expectedOnMain = false; }), 'P0');
only(run((i) => { i.expectedSha = 'main'; i.localHeadSha = 'main'; }), 'P0', 'P2', 'P4');

// --- P1/P2: Cloudflare control plane is the authoritative release record -------------------------------
for (const [label, mutate] of [
  ['no canonical deployment', (r) => { r.canonical_deployment = null; }],
  ['preview environment', (r) => { r.canonical_deployment.environment = 'preview'; }],
  ['non-main branch', (r) => { r.canonical_deployment.deployment_trigger.metadata.branch = 'feat/x'; }],
  ['failed deploy', (r) => { r.canonical_deployment.latest_stage.status = 'failure'; }],
  ['build stage only', (r) => { r.canonical_deployment.latest_stage = { name: 'build', status: 'success' }; }],
  ['wrong project', (r) => { r.name = 'something-else'; }],
  ['wrong production branch', (r) => { r.production_branch = 'dev'; }],
  ['wrong source repo', (r) => { r.source.config.repo_name = 'other'; }],
  ['canonical domain missing', (r) => { r.domains = ['goodflippindesign.pages.dev']; }],
  ['no commit hash', (r) => { delete r.canonical_deployment.deployment_trigger.metadata.commit_hash; }],
]) {
  const r = run((i) => { i.controlPlane = cp(mutate); });
  assert.equal(r.checks.P1.status, 'FAIL', label);
  assert.equal(r.checks.P2.status, 'BLOCKED', label);
  assert.equal(r.canStartInvestigation, false, label);
}
only(run((i) => { i.controlPlane = cp((r) => { r.canonical_deployment.deployment_trigger.metadata.commit_hash = OTHER; }); }), 'P2', 'P4');
only(run((i) => { i.controlPlane = { error: 'Cloudflare Pages API answered HTTP 403' }; }), 'P1', 'P2', 'P4', 'P5', 'P11');
assert.match(run((i) => { i.controlPlane = { error: 'x' }; }).checks.P1.reason, /x/);

// --- P3: runtime reachability, canonical origin only --------------------------------------------------
for (const status of [401, 403]) {
  const r = run((i) => { i.probe = { status, body: { error: 'x' } }; });
  assert.equal(r.checks.P3.status, 'FAIL');
  for (const code of ['P4', 'P5', 'P6', 'P9', 'P10', 'P11']) assert.equal(r.checks[code].status, 'BLOCKED', `${code} cannot pass without the runtime`);
}
assert.match(run((i) => { i.probe = { status: 404, body: null }; }).checks.P3.reason, /predates the endpoint/);
assert.equal(run((i) => { i.probe = { error: 'network error' }; }).checks.P3.status, 'FAIL');
assert.equal(run((i) => { i.probe.body.schemaVersion = 'other'; }).checks.P3.status, 'FAIL');
assert.equal(run((i) => { i.probe.body.runtime.kind = 'standalone-worker'; }).checks.P3.status, 'FAIL');
assert.equal(run((i) => { i.probe.body.runtime.servedHost = 'gfd-auth.weave0.workers.dev'; }).checks.P3.status, 'FAIL');
// the legacy standalone Worker is never an acceptable origin, even if it somehow answered correctly
for (const origin of ['https://gfd-auth.weave0.workers.dev', 'https://goodflippindesign.pages.dev', 'http://goodflippindesign.com', 'https://goodflippindesign.com:8443', 'https://evil.example/goodflippindesign.com', undefined]) {
  assert.equal(isCanonicalOrigin(origin), false, String(origin));
  const r = run((i) => { i.origin = origin; });
  assert.equal(r.checks.P3.status, 'FAIL', String(origin));
  assert.equal(r.canStartInvestigation, false);
}
assert.equal(isCanonicalOrigin('https://goodflippindesign.com'), true);

// --- P4: runtime stamp must equal the Cloudflare canonical commit --------------------------------------
for (const release of [
  { state: 'unstamped', sha: null }, { state: 'invalid', sha: null }, { state: 'local', sha: null },
  { state: 'stamped', sha: OTHER, source: 'cloudflare-pages' }, { state: 'stamped', sha: null, source: 'cloudflare-pages' },
  { state: 'stamped', sha: SHA, source: 'local' },
]) {
  const r = run((i) => { i.probe.body.release = release; });
  assert.equal(r.checks.P4.status, 'FAIL', JSON.stringify(release));
  assert.equal(r.canStartInvestigation, false);
}
// stale runtime: Cloudflare already serves a newer deployment than the runtime claims
only(run((i) => { i.probe.body.release.sha = OTHER; }), 'P4');
// the same commit can be deployed twice: the runtime must have been built for the CANONICAL deployment, not an older one
for (const url of ['https://635b9af8.goodflippindesign.pages.dev', undefined, null, 'http://58d05431.goodflippindesign.pages.dev', 'https://58d05431.goodflippindesign.pages.dev.evil.example', 'https://58d05431.goodflippindesign.com']) {
  const r = run((i) => { i.probe.body.release.url = url; });
  only(r, 'P4');
  assert.match(r.checks.P4.reason, /different Pages deployment/, String(url));
}
only(run((i) => { i.controlPlane = cp((r) => { r.canonical_deployment.url = 'https://635b9af8.goodflippindesign.pages.dev'; }); }), 'P4');
assert.equal(evaluatePreflight(good()).runtimeRelease.url, 'https://58d05431.goodflippindesign.pages.dev');
// three-way agreement: expected == Cloudflare == runtime. Expected differing from both fails P2 and P4 blocks.
only(run((i) => { i.expectedSha = OTHER; i.localHeadSha = OTHER; }), 'P2', 'P4');

// --- P5: bindings, both at runtime and declared in the Pages environment -------------------------------
for (const name of MC) {
  for (const state of ['missing', 'invalid']) {
    const r = run((i) => { i.probe.body.bindings[name] = { state }; i.probe.body.ready = false; });
    assert.equal(r.checks.P5.status, 'FAIL');
    assert.match(r.checks.P5.reason, new RegExp(`${name}=${state}`));
  }
  const undeclared = run((i) => { i.controlPlane = cp((r) => { delete r.deployment_configs.production.env_vars[name]; }); });
  assert.equal(undeclared.checks.P5.status, 'FAIL');
  assert.match(undeclared.checks.P5.reason, new RegExp(name));
}
only(run((i) => { i.probe.body.ready = false; i.probe.body.blockers = ['x']; }), 'P5');
// credentials must be encrypted secrets in the Pages production environment; an empty plain_text placeholder is not a secret
for (const name of ['MISSION_CONTROL_CONTRACT_KEY', 'MISSION_CONTROL_RESULT_KEY', 'MISSION_CONTROL_WORKER_TOKEN', 'MISSION_CONTROL_CANARY_RUNNER_TOKEN']) {
  for (const type of ['plain_text', 'unknown', undefined]) {
    const r = run((i) => { i.controlPlane = cp((raw) => { raw.deployment_configs.production.env_vars[name] = type ? { type, value: '' } : {}; }); });
    only(r, 'P5');
    assert.match(r.checks.P5.reason, new RegExp(`secret_text in the Pages production environment: ${name}`));
  }
}
// non-credential identifiers may be plain_text or secret_text, but must be a recognised type
for (const name of ['MISSION_CONTROL_CONTRACT_KEY_ID', 'MISSION_CONTROL_RESULT_KEY_ID', 'MISSION_CONTROL_RESULT_WORKER_ID']) {
  assert.equal(run((i) => { i.controlPlane = cp((raw) => { raw.deployment_configs.production.env_vars[name] = { type: 'plain_text', value: 'x' }; }); }).canStartInvestigation, true, name);
  only(run((i) => { i.controlPlane = cp((raw) => { raw.deployment_configs.production.env_vars[name] = { type: 'kv_namespace' }; }); }), 'P5');
}

// --- P6: worker identity -------------------------------------------------------------------------------
only(run((i) => { i.expectedWorkerId = ''; }), 'P6');
only(run((i) => { i.expectedWorkerId = 'someone-else'; i.host.workerId = 'someone-else'; }), 'P6');
only(run((i) => { i.host.workerId = 'another'; }), 'P6');
only(run((i) => { i.host.workerKeyId = 'rotated'; }), 'P6');
only(run((i) => { i.host.contractKeys = [{ keyId: 'unrelated', enrolled: true, problems: [], kcv: KCV.contract }]; }), 'P6');
only(run((i) => { i.host.contractKeys = []; }), 'P6');
// the host's keys must actually be enrolled and valid, not merely named in config.json
for (const problems of [['file_absent'], ['key_id_mismatch'], ['secret_malformed'], ['revoked'], ['unreadable_or_malformed_json'], ['worker_id_mismatch']]) {
  const r = run((i) => { i.host.workerKey = { keyId: RESULT_KEY_ID, enrolled: false, problems }; });
  only(r, 'P6', 'P7');
  assert.match(r.checks.P6.reason, new RegExp(problems[0]));
  assert.equal(r.hostIdentity.workerKeyEnrolled, false);
}
only(run((i) => { i.host.contractKeys[0] = { keyId: CONTRACT_KEY_ID, enrolled: false, problems: ['secret_malformed'] }; }), 'P6');
{
  const ok = evaluatePreflight(good());
  assert.deepEqual(ok.hostIdentity, {
    workerKeyEnrolled: true, workerKeyIdFingerprint: fingerprint(RESULT_KEY_ID), contractKeyEnrolled: true, contractKeyIdFingerprint: fingerprint(CONTRACT_KEY_ID),
    contractKeyMaterialMatches: true, workerKeyMaterialMatches: true, deliveryBearerMatches: true,
  });
  assert.ok(!JSON.stringify(ok).includes(KCV.result) && !JSON.stringify(ok).includes(KCV.contract) && !JSON.stringify(ok).includes(KCV.bearer), 'evidence records booleans, not check values');
  assert.ok(!JSON.stringify(ok).includes(RESULT_KEY_ID), 'only fingerprints, never raw ids');
}
only(run((i) => { i.host = null; }), 'P6', 'P7');

// Same ids are not the same keys: the host must hold the SAME key material (one-way key check value) as the runtime.
{
  const wrong = 'kcv:ffffffffffffffff';
  const c = run((i) => { i.host.contractKeys[0].kcv = wrong; });
  only(c, 'P6'); assert.match(c.checks.P6.reason, /contract key material/); assert.equal(c.hostIdentity.contractKeyMaterialMatches, false);
  const w = run((i) => { i.host.workerKey.kcv = wrong; });
  only(w, 'P6'); assert.match(w.checks.P6.reason, /worker key material/); assert.equal(w.hostIdentity.workerKeyMaterialMatches, false);
  const bearerWrong = run((i) => { i.bearerKcv = wrong; });
  only(bearerWrong, 'P6'); assert.match(bearerWrong.checks.P6.reason, /does not match MISSION_CONTROL_WORKER_TOKEN/);
  const bearerAbsent = run((i) => { i.bearerKcv = null; });
  only(bearerAbsent, 'P6'); assert.match(bearerAbsent.checks.P6.reason, /not present in this shell/);
  // a weak runtime key (no check value published) can never pass interoperability
  only(run((i) => { delete i.probe.body.bindings.MISSION_CONTROL_CONTRACT_KEY.kcv; }), 'P6');
  only(run((i) => { delete i.probe.body.bindings.MISSION_CONTROL_RESULT_KEY.kcv; }), 'P6');
  only(run((i) => { delete i.probe.body.bindings.MISSION_CONTROL_WORKER_TOKEN.kcv; }), 'P6');
  // role separation: a check value for one role is not valid for another
  assert.notEqual(kcvFromBytes(strongHexKeyBytes(CONTRACT_HEX), 'contract'), kcvFromBytes(strongHexKeyBytes(CONTRACT_HEX), 'result'));
}

// --- P7: real host verification; P8: sole dispatch-ready ------------------------------------------------
only(run((i) => { i.gate.fwompsHomeVerified = false; }), 'P7');
only(run((i) => { Object.assign(i.gate.properties[0], { hostVerified: false, checks: { C3: check('FAIL', 'profile not registered') } }); }), 'P7');
only(run((i) => { i.gate.properties[0].promotable = false; }), 'P7', 'P8');
only(run((i) => { i.gate.properties = i.gate.properties.filter((p) => p.propertyId !== 'aiaimate.com'); }), 'P7', 'P8');
only(run((i) => { i.gate.properties[1].readinessDispatchReady = true; }), 'P8');
only(run((i) => { i.gate.properties[2].promotable = true; }), 'P8');
only(run((i) => { i.gate.properties[0].readinessDispatchReady = false; }), 'P8');

// --- P9: protocol --------------------------------------------------------------------------------------
only(run((i) => { i.probe.body.protocol.investigationRequest.schema = 'mc-fw-investigation-request-2'; }), 'P9');
only(run((i) => { i.probe.body.protocol.leaseGrant.purpose = 'gfd->fwomps:lease-grant:v2'; }), 'P9');
only(run((i) => { i.probe.body.protocol.investigationResult = undefined; }), 'P9');
only(run((i) => { i.probe.body.protocol.missionControlApi = 'gfd-mission-control-2'; }), 'P9');

// --- P10: strictly read-only ---------------------------------------------------------------------------
for (const patch of [{ repairAuthority: true }, { deployAuthority: true }, { writeAuthority: true }, { readOnly: false }, { maxAttempts: 3 }, { investigation: false }]) {
  only(run((i) => { Object.assign(i.probe.body.capabilities, patch); }), 'P10');
}
only(run((i) => { delete i.probe.body.capabilities.writeAuthority; }), 'P10');

// --- P11: canonical D1 ---------------------------------------------------------------------------------
only(run((i) => { i.controlPlane = cp((r) => { r.deployment_configs.production.d1_databases.DB.id = 'ffffffff-0000-0000-0000-000000000000'; }); }), 'P11');
only(run((i) => { i.controlPlane = cp((r) => { delete r.deployment_configs.production.d1_databases.DB; }); }), 'P11');
only(run((i) => { i.canonicalD1Id = null; }), 'P11');
only(run((i) => { i.probe.body.d1 = { bound: false, reachable: false, workItemSchema: false }; }), 'P11');
only(run((i) => { i.probe.body.d1.workItemSchema = false; }), 'P11');

// --- control plane client: names only, never values; tokens never leak ----------------------------------
{
  const snapshot = normalizeProject(rawProject());
  assert.ok(!JSON.stringify(snapshot).includes('MUST-NEVER-APPEAR'), 'env var values are dropped');
  assert.equal(snapshot.productionEnvVars.MISSION_CONTROL_WORKER_TOKEN, 'secret_text');
  assert.equal(judgeControlPlane({ project: snapshot }).ok, true);

  let seen;
  const okFetch = async (url, init) => { seen = { url: String(url), method: init.method }; return new Response(JSON.stringify({ success: true, result: rawProject() }), { status: 200 }); };
  const res = await fetchPagesControlPlane({ fetchImpl: okFetch, token: CF_TOKEN });
  assert.equal(res.project.canonicalDeployment.id, DEPLOYMENT);
  assert.match(seen.url, /\/pages\/projects\/goodflippindesign$/);
  assert.equal(seen.method, undefined, 'a plain GET');
  assert.ok(!JSON.stringify(res).includes(CF_TOKEN));
  assert.match((await fetchPagesControlPlane({ fetchImpl: okFetch, token: '' })).error, /not set/);
  const denied = await fetchPagesControlPlane({ fetchImpl: async () => new Response('{}', { status: 403 }), token: CF_TOKEN });
  assert.match(denied.error, /403/);
  assert.ok(!JSON.stringify(denied).includes(CF_TOKEN));
  const boom = await fetchPagesControlPlane({ fetchImpl: async () => { throw new Error(`boom ${CF_TOKEN}`); }, token: CF_TOKEN });
  assert.match(boom.error, /unreachable/);
  assert.ok(!JSON.stringify(boom).includes(CF_TOKEN));
}

// --- evidence never carries credential material or raw identifiers ---------------------------------------
{
  const result = evaluatePreflight({ ...good(), probe: { status: 200, body: { ...goodBody(), operatorToken: OPERATOR_TOKEN } }, controlPlane: cp() });
  const text = JSON.stringify(result) + formatPreflight(result);
  for (const secret of [OPERATOR_TOKEN, CF_TOKEN, WORKER_ID, RESULT_KEY_ID, CONTRACT_KEY_ID, 'MUST-NEVER-APPEAR']) assert.ok(!text.includes(secret), `evidence must not contain ${secret}`);
}

// --- the committed estate with NO real host can never turn the gate green -----------------------------------
{
  const gate = await runPromotionGate({ registry: read('estate/registry.json'), brands: read('brands.json'), healthTargets: read('config/health-targets.json') });
  const result = evaluatePreflight({ ...good(), gate });
  assert.equal(result.checks.P7.status, 'FAIL', 'without the real FWOMPS home the host is unverified');
  assert.equal(result.checks.P8.status, 'PASS', 'aiaimate.com is the sole dispatch-ready property in the committed registry');
  assert.equal(result.canStartInvestigation, false);
}

// --- the operator bearer is never sent to a non-canonical origin (validated BEFORE any request) ----------------------------
{
  const TOKEN_ = 'operator-bearer-sentinel-0123456789';
  const calls = [];
  const spy = async (url, init) => { calls.push({ url: String(url), auth: init.headers.Authorization, redirect: init.redirect }); return new Response(JSON.stringify({ ok: true }), { status: 200 }); };
  for (const origin of [
    'https://gfd-auth.weave0.workers.dev', 'https://goodflippindesign.pages.dev', 'http://goodflippindesign.com', 'https://goodflippindesign.com:8443',
    'https://user:pw@goodflippindesign.com', 'https://goodflippindesign.com.evil.example', 'https://evil.example', 'goodflippindesign.com', '', undefined, null, 'not a url',
  ]) {
    const result = await fetchRuntimeProbe({ origin, token: TOKEN_, fetchImpl: spy });
    assert.ok(result.error, `no probe for ${origin}`);
    assert.ok(!JSON.stringify(result).includes(TOKEN_));
  }
  assert.deepEqual(calls, [], 'no request was made to any non-canonical origin, so the credential was never sent');
  // canonical origin: the credential goes to the fixed canonical URL only, redirects are never followed
  const ok = await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token: TOKEN_, fetchImpl: spy });
  assert.equal(ok.status, 200);
  assert.deepEqual(calls.map((c) => [c.url, c.auth, c.redirect]), [['https://goodflippindesign.com/api/mission-control/provenance', `Bearer ${TOKEN_}`, 'manual']]);
  assert.match((await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token: '', fetchImpl: spy })).error, /not set/);
  assert.equal(calls.length, 1, 'no token => no request');
  const failing = await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token: TOKEN_, fetchImpl: async () => { throw new Error(`down ${TOKEN_}`); } });
  assert.equal(failing.error, 'network error');
  assert.ok(!JSON.stringify(failing).includes(TOKEN_));
}

// --- a malicious / misrouted endpoint cannot get credential text into the persisted evidence -----------------------------
// The operator bearer is sent to the origin, so every field the probe or Cloudflare returns is untrusted. Nothing
// reaches a reason string or the evidence unless it passes a validator; reasons name the deviating field, not its value.
{
  const REFLECTED = 'reflected-bearer-SENTINEL-0123456789abcdef0123456789';
  const poison = (value) => {
    if (typeof value === 'string') return REFLECTED;
    if (Array.isArray(value)) return value.map(poison);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, poison(v)]));
    return value;
  };
  const text = (result) => JSON.stringify(result) + formatPreflight(result);

  // 1. strings in an otherwise-valid probe body replaced by credential-looking text, with every reason path exercised
  for (const [label, mutate] of [
    ['observedAt / runtime strings', (b) => { b.observedAt = REFLECTED; b.runtime.kind = REFLECTED; b.runtime.servedHost = REFLECTED; }],
    ['release fields', (b) => { b.release = { state: REFLECTED, sha: REFLECTED, builtAt: REFLECTED, branch: REFLECTED, source: REFLECTED, reason: REFLECTED }; }],
    ['stamped release with reflected text', (b) => { b.release.reason = REFLECTED; b.release.builtAt = REFLECTED; b.release.branch = REFLECTED; b.release.sha = 'f'.repeat(40); }],
    ['blockers and binding states', (b) => { b.ready = false; b.blockers = [REFLECTED]; for (const n of Object.keys(b.bindings)) b.bindings[n] = { state: REFLECTED }; }],
    ['not-ready blockers with all bindings present', (b) => { b.ready = false; b.blockers = [REFLECTED]; }],
    ['protocol strings', (b) => { b.protocol = poison(b.protocol); }],
    ['capabilities object', (b) => { b.capabilities = { ...poison(b.capabilities), investigation: REFLECTED, repairAuthority: REFLECTED, [REFLECTED]: REFLECTED }; }],
    ['d1 object', (b) => { b.d1 = poison(b.d1); }],
    ['whole body poisoned', (b) => Object.assign(b, poison(b))],
  ]) {
    const input = good();
    mutate(input.probe.body);
    const result = evaluatePreflight(input);
    assert.ok(!text(result).includes(REFLECTED), `${label}: reflected text must not appear in the result or the formatted report`);
    assert.equal(auditForSecrets(text(result), [REFLECTED]).clean, true, label);
  }
  // a poisoned body can never turn the gate green
  {
    const input = good();
    Object.assign(input.probe.body, poison(input.probe.body));
    assert.equal(evaluatePreflight(input).canStartInvestigation, false);
  }

  // 2. Cloudflare control-plane strings are validated too
  for (const [label, mutate] of [
    ['deployment id', (r) => { r.canonical_deployment.id = REFLECTED; }],
    ['branch', (r) => { r.canonical_deployment.deployment_trigger.metadata.branch = REFLECTED; }],
    ['stage', (r) => { r.canonical_deployment.latest_stage = { name: REFLECTED, status: REFLECTED, ended_on: REFLECTED }; }],
    ['environment and url', (r) => { r.canonical_deployment.environment = REFLECTED; r.canonical_deployment.url = `https://${REFLECTED}.example`; r.canonical_deployment.created_on = REFLECTED; }],
    ['project and source', (r) => { r.name = REFLECTED; r.source.config.repo_name = REFLECTED; r.production_branch = REFLECTED; }],
    ['commit hash', (r) => { r.canonical_deployment.deployment_trigger.metadata.commit_hash = REFLECTED; }],
    ['d1 binding id', (r) => { r.deployment_configs.production.d1_databases.DB.id = REFLECTED; }],
  ]) {
    const input = good();
    input.controlPlane = cp(mutate);
    const result = evaluatePreflight(input);
    assert.ok(!text(result).includes(REFLECTED), `control plane ${label}: reflected text must not appear`);
    assert.equal(result.canStartInvestigation, false, label);
  }

  // 3. an operator-supplied origin (userinfo/query) and probe transport errors cannot smuggle tokens either
  {
    const input = good();
    input.origin = `https://user:${REFLECTED}@gfd-auth.weave0.workers.dev/path?token=${REFLECTED}`;
    assert.ok(!text(evaluatePreflight(input)).includes(REFLECTED));
    const input2 = good();
    input2.probe = { error: `connect failed using ${REFLECTED}` };
    assert.ok(!text(evaluatePreflight(input2)).includes(REFLECTED));
  }

  // 4. host-gate reasons (read from a local config) are scrubbed of token-shaped runs
  {
    const input = good();
    input.gate.properties[0] = gateRow('aiaimate.com', { promotable: false, hostVerified: false, checks: { C4: { name: 'x', status: 'FAIL', reason: `host repository ${REFLECTED} differs` } } });
    const result = evaluatePreflight(input);
    assert.ok(!text(result).includes(REFLECTED));
    assert.match(result.checks.P7.reason, /redacted/);
  }

  // 5. legitimate values still read well: SHAs, UUIDs, timestamps survive
  {
    const result = evaluatePreflight(good());
    assert.equal(result.cloudflare.deploymentId, DEPLOYMENT);
    assert.equal(result.cloudflare.commitHash, SHA);
    assert.equal(result.cloudflare.completedOn, '2026-10-01T01:29:10.000Z');
    assert.equal(result.runtimeRelease.sha, SHA);
    assert.equal(result.runtimeTarget.origin, 'https://goodflippindesign.com');
  }
}

console.log('mc production preflight tests: all passed');
