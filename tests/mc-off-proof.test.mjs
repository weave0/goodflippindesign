// Hostile / regression tests for the production canary OFF proof. No network: a fake fetch stands in for production.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ALL_PROBES, DISABLED_BODY, OUT_OF_SURFACE_PROBES, SURFACE_PROBES,
  bindRelease, isCanonicalOrigin, judgeDisabled, judgeRefused, runOffProof, scanEvidence,
} from '../scripts/lib/mc-off-proof.mjs';
import { parseWranglerDeploymentList } from '../scripts/lib/pages-release-snapshot.mjs';
import { isCanonicalOrigin as preflightIsCanonicalOrigin } from '../scripts/lib/mc-production-preflight.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RUNNER = 'ab'.repeat(64);
const WORKER = 'mission-control-worker-token-test';
const SHA = '5c184c9f42b24d74c5e8ebeeddca5212920bb8d2';
const SNAP = { source: 'test', id: '11111111-1111-4111-8111-111111111111', environment: 'production', branch: 'main', commitHash: SHA, commitIsPrefix: false, stage: 'deploy:success' };
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

/** A production stand-in: valid runner token => canary_disabled 404; everything else => 401. Records every request. */
function fakeProduction({ on = false, override } = {}) {
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    const call = { url: String(url), method: init.method, headers: { ...(init.headers || {}) }, body: init.body, redirect: init.redirect };
    requests.push(call);
    if (override) { const r = await override(call); if (r) return r; }
    if (call.headers.Authorization === `Bearer ${RUNNER}`) return on ? json(403, { error: 'Forbidden' }) : json(404, { ...DISABLED_BODY });
    return json(401, { error: 'Unauthorized' });
  };
  return { fetchImpl, requests };
}
const run = (production, overrides = {}) => runOffProof({ runnerToken: RUNNER, expectedSha: SHA, label: 'initial', controlPlane: async () => SNAP, fetchImpl: production.fetchImpl, ...overrides });
const rejects = async (fn, pattern, message) => {
  let caught;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught, message);
  assert.match(caught.message, pattern, message);
  assert.ok(!caught.message.includes(RUNNER), 'error must not contain the credential');
};

// ---- the happy path proves exactly what it claims --------------------------------------------------------------------------
{
  const production = fakeProduction();
  const evidence = await run(production);
  assert.equal(evidence.verdict, 'OFF_PROVEN');
  assert.deepEqual(evidence.failures, []);
  assert.equal(evidence.summary.probes, ALL_PROBES.length);
  assert.equal(evidence.summary.controls, 2);
  assert.equal(evidence.release.bound, true);
  assert.equal(evidence.credential.value, 'never recorded');
  // the credential is never recorded in evidence, and the evidence passes its own secret scan
  const text = JSON.stringify(evidence);
  assert.ok(!text.includes(RUNNER));
  assert.deepEqual(scanEvidence(text, [RUNNER, WORKER]), []);
  // every request: manual redirects, credential only in the Authorization header, never in url/body
  for (const request of production.requests) {
    assert.equal(request.redirect, 'manual');
    assert.ok(!request.url.includes(RUNNER));
    assert.ok(!String(request.body ?? '').includes(RUNNER));
    assert.ok(request.url.startsWith('https://goodflippindesign.com/api/mission-control'));
  }
  const withRunner = production.requests.filter((r) => r.headers.Authorization === `Bearer ${RUNNER}`);
  assert.equal(withRunner.length, ALL_PROBES.length, 'exactly the probe plan uses the real credential');
  const controls = production.requests.slice(ALL_PROBES.length);
  assert.equal(controls.length, 2);
  assert.equal(controls[0].headers.Authorization, undefined, 'control 1 sends no credential');
  assert.match(controls[1].headers.Authorization, /^Bearer [0-9a-f]{128}$/);
  assert.notEqual(controls[1].headers.Authorization, `Bearer ${RUNNER}`, 'control 2 is a different, random, runner-shaped credential');
}

// ---- probes are inert even if the canary were ON -----------------------------------------------------------------------------
{
  for (const probe of ALL_PROBES) {
    assert.ok(['GET', 'POST', 'DELETE'].includes(probe.method));
    if (probe.path.includes('/work-items/')) assert.match(probe.path, /\/work-items\/gfdwi_v1_0{64}(\/|$)/, `${probe.id} names only the all-zero (nonexistent) item`);
    if (probe.method === 'POST' && probe.path.endsWith('/canary-observations')) {
      assert.deepEqual(Object.keys(probe.body), ['off_proof_probe'], 'the observation probe must be rejected as unexpected_fields, never recorded');
    }
    assert.ok(!JSON.stringify(probe.body ?? {}).includes('degraded'), 'no probe carries a recordable observation status');
  }
  assert.equal(SURFACE_PROBES.length, 8);
  assert.ok(OUT_OF_SURFACE_PROBES.some((p) => p.id === 'out:lease') && OUT_OF_SURFACE_PROBES.some((p) => p.id === 'out:result'));
}

// ---- strict judgement: nothing but the exact canary_disabled refusal counts -------------------------------------------------
{
  const observe = (status, body, extra = {}) => ({ status, contentType: 'application/json', redirected: false, json: body, text: JSON.stringify(body), ...extra });
  assert.equal(judgeDisabled(observe(404, { ...DISABLED_BODY })).ok, true);
  for (const [label, observed] of [
    ['html 404', { status: 404, contentType: 'text/html', redirected: false, json: null, text: '<h1>Not found</h1>' }],
    ['json 404 other code', observe(404, { error: 'Work item was not found' })],
    ['json 404 wrong code', observe(404, { error: DISABLED_BODY.error, code: 'not_found' })],
    ['extra field', observe(404, { ...DISABLED_BODY, extra: 1 })],
    ['wrong message', observe(404, { error: 'nope', code: 'canary_disabled' })],
    ['array body', observe(404, [DISABLED_BODY])],
    ['200', observe(200, { ...DISABLED_BODY })],
    ['403', observe(403, { ...DISABLED_BODY })],
    ['401', observe(401, { ...DISABLED_BODY })],
    ['500', observe(500, { ...DISABLED_BODY })],
    ['redirect', observe(404, { ...DISABLED_BODY }, { redirected: true })],
    ['network error', { error: 'network error' }],
    ['timeout', { error: 'timed out' }],
    ['credential reflected', observe(404, { ...DISABLED_BODY }, { text: `${JSON.stringify(DISABLED_BODY)} ${RUNNER}` })],
  ]) assert.equal(judgeDisabled(observed, [RUNNER]).ok, false, label);

  assert.equal(judgeRefused(observe(401, { error: 'Unauthorized' })).ok, true);
  for (const [label, observed] of [
    ['404 canary_disabled', observe(404, { ...DISABLED_BODY })],
    ['401 canary_disabled body', observe(401, { ...DISABLED_BODY })],
    ['200', observe(200, {})],
    ['403', observe(403, {})],
    ['network', { error: 'network error' }],
  ]) assert.equal(judgeRefused(observed).ok, false, label);
}

// ---- one bad probe, one bad control, or one bad release fails the whole proof ---------------------------------------------
{
  for (const [label, override] of [
    ['one probe answers 200 (canary reachable)', (call) => (call.url.endsWith('/operations') ? json(200, { operations: [] }) : null)],
    ['one probe answers a generic 404', (call) => (call.url.endsWith('/provenance') && call.headers.Authorization ? json(404, { error: 'Not found' }) : null)],
    ['one probe redirects', (call) => (call.method === 'DELETE' ? new Response(null, { status: 302, headers: { location: 'https://example.invalid/' } }) : null)],
    ['one probe throws', (call) => { if (call.method === 'DELETE') throw new TypeError('connection reset'); return null; }],
    ['no-credential control reaches the canary gate', (call) => (!call.headers.Authorization ? json(404, { ...DISABLED_BODY }) : null)],
    ['forged control reaches the canary gate', (call) => (call.headers.Authorization && call.headers.Authorization !== `Bearer ${RUNNER}` ? json(404, { ...DISABLED_BODY }) : null)],
  ]) {
    const evidence = await run(fakeProduction({ override }));
    assert.equal(evidence.verdict, 'NOT_PROVEN', label);
    assert.ok(evidence.failures.length >= 1, label);
  }
  // the canary is ON: nothing is canary_disabled
  const on = await run(fakeProduction({ on: true }));
  assert.equal(on.verdict, 'NOT_PROVEN');
  assert.equal(on.summary.probesOk, 0);
  // the deployed runner secret differs from the local credential
  const mismatched = await run({ fetchImpl: async () => json(401, { error: 'Unauthorized' }) });
  assert.equal(mismatched.verdict, 'NOT_PROVEN');
  // a response that echoes the credential fails the proof and the echo is not recorded
  const reflect = await run(fakeProduction({ override: (call) => (call.method === 'GET' && call.url.endsWith('/operations') ? json(404, { ...DISABLED_BODY, echo: RUNNER }) : null) }));
  assert.equal(reflect.verdict, 'NOT_PROVEN');
  assert.ok(!JSON.stringify(reflect).includes(RUNNER));
}

// ---- release binding ---------------------------------------------------------------------------------------------------------
{
  const ok = bindRelease({ before: SNAP, after: SNAP, expectedSha: SHA });
  assert.equal(ok.ok, true);
  for (const [label, before, after, sha] of [
    ['wrong commit', { ...SNAP, commitHash: 'e'.repeat(40) }, { ...SNAP, commitHash: 'e'.repeat(40) }, SHA],
    ['deployment changed during proof', SNAP, { ...SNAP, id: '22222222-2222-4222-8222-222222222222' }, SHA],
    ['preview environment', { ...SNAP, environment: 'preview' }, { ...SNAP, environment: 'preview' }, SHA],
    ['non-main branch', { ...SNAP, branch: 'feature' }, { ...SNAP, branch: 'feature' }, SHA],
    ['deployment not successful', { ...SNAP, stage: 'deploy:failure' }, { ...SNAP, stage: 'deploy:failure' }, SHA],
    ['snapshot error before', { error: 'Cloudflare Pages API unreachable' }, SNAP, SHA],
    ['snapshot missing after', SNAP, null, SHA],
    ['short expected sha', SNAP, SNAP, SHA.slice(0, 12)],
    ['uppercase expected sha', SNAP, SNAP, SHA.toUpperCase()],
  ]) assert.equal(bindRelease({ before, after, expectedSha: sha }).ok, false, label);
  // regression: matching snapshots with a missing/malformed deployment id are NOT a release binding (undefined === undefined)
  const { id: _omitted, ...NO_ID } = SNAP;
  for (const [label, badId] of [['missing', undefined], ['null', null], ['empty', ''], ['blank', '   '], ['padded', ` ${SNAP.id}`], ['number', 12345], ['object', { id: SNAP.id }],
    ['garbage', 'garbage'], ['short uuid', SNAP.id.slice(0, 35)], ['uppercase uuid', '734E1743-7934-4E9F-B383-ED6E9BD162B2'], ['uuid + suffix', `${SNAP.id}x`], ['no dashes', SNAP.id.replaceAll('-', '')], ['non-hex uuid', SNAP.id.replace(/^./, 'g')]]) {
    const bad = badId === undefined ? NO_ID : { ...SNAP, id: badId };
    const bound = bindRelease({ before: bad, after: bad, expectedSha: SHA });
    assert.equal(bound.ok, false, `${label} id on both snapshots`);
    assert.ok(bound.problems.some((p) => /deployment id is missing or not a deployment UUID/.test(p)), label);
    assert.equal(bindRelease({ before: bad, after: SNAP, expectedSha: SHA }).ok, false, `${label} id before only`);
    assert.equal(bindRelease({ before: SNAP, after: bad, expectedSha: SHA }).ok, false, `${label} id after only`);
  }
  for (const good of ['11111111-1111-4111-8111-111111111111', '734e1743-7934-4e9f-b383-ed6e9bd162b2', 'bf1813c6-a20c-43e1-a333-2ef0a5d56a48', 'c2238527-19c6-408a-b516-dae3f13057f5']) assert.equal(bindRelease({ before: { ...SNAP, id: good }, after: { ...SNAP, id: good }, expectedSha: SHA }).ok, true, `valid production UUID ${good}`);
  assert.equal(bindRelease({ before: SNAP, after: { ...SNAP, id: '22222222-2222-4222-8222-222222222222' }, expectedSha: SHA }).ok, false, 'mismatched ids');
  // a Wrangler-sourced snapshot (7-char source SHA, no stage) is accepted only when it is a prefix of the expected SHA
  const wr = { source: 'wrangler-list', id: SNAP.id, environment: 'Production', branch: 'main', commitHash: '5c184c9', commitIsPrefix: true, stage: null };
  assert.equal(bindRelease({ before: wr, after: wr, expectedSha: SHA }).ok, true);
  assert.equal(bindRelease({ before: { ...wr, commitHash: '5c184c8' }, after: { ...wr, commitHash: '5c184c8' }, expectedSha: SHA }).ok, false);
  assert.equal(bindRelease({ before: { ...wr, commitHash: '5c184' }, after: { ...wr, commitHash: '5c184' }, expectedSha: SHA }).ok, false, 'a too-short prefix is not a binding');
}

// ---- the credential goes only to the canonical origin, and unusable input fails before any request ------------------------------
{
  for (const origin of [
    'http://goodflippindesign.com', 'https://goodflippindesign.com.evil.example', 'https://evil.example', 'https://goodflippindesign.com:8443',
    'https://user:pass@goodflippindesign.com', 'https://gfd-auth.weave0.workers.dev', 'https://goodflippindesign.pages.dev', 'not a url', '',
  ]) {
    const production = fakeProduction();
    await rejects(() => run(production, { origin }), /non-canonical origin/, origin);
    assert.equal(production.requests.length, 0, `no request may be made for ${origin}`);
    // never looser than the preflight rule (which checks embedded credentials separately)
    if (isCanonicalOrigin(origin)) assert.equal(preflightIsCanonicalOrigin(origin), true, origin);
    if (!origin.includes('@')) assert.equal(isCanonicalOrigin(origin), preflightIsCanonicalOrigin(origin), `agrees with the preflight origin rule for ${origin}`);
  }
  assert.equal(isCanonicalOrigin('https://goodflippindesign.com'), true);
  for (const [overrides, pattern] of [
    [{ runnerToken: undefined }, /128-lowercase-hex/], [{ runnerToken: 'AB'.repeat(64) }, /128-lowercase-hex/], [{ runnerToken: 'ab'.repeat(63) }, /128-lowercase-hex/],
    [{ expectedSha: 'abc123' }, /40-character/], [{ expectedSha: undefined }, /40-character/],
    [{ label: 'middle' }, /initial or final/], [{ label: undefined }, /initial or final/],
    [{ controlPlane: undefined }, /bound to a release/],
  ]) {
    const production = fakeProduction();
    await rejects(() => run(production, overrides), pattern, JSON.stringify(Object.keys(overrides)));
    assert.equal(production.requests.length, 0);
  }
}

// ---- evidence secret scan ----------------------------------------------------------------------------------------------------
{
  assert.deepEqual(scanEvidence('{"a":"clean","id":"11111111-1111-4111-8111-111111111111"}', [RUNNER]), []);
  assert.ok(scanEvidence(`{"x":"${RUNNER}"}`, [RUNNER]).length >= 1);
  assert.ok(scanEvidence(`{"x":"${'cd'.repeat(64)}"}`).length >= 1, 'any 128-hex string is refused even if unknown');
  assert.ok(scanEvidence('{"x":"eyJhbGciOiJI.eyJzdWIiOiJ1.signature"}').length >= 1);
  assert.ok(scanEvidence('{"h":"Bearer abcdefghijklmnopqrstuvwxyz"}').length >= 1);
  assert.ok(scanEvidence(`worker ${WORKER}`, [WORKER]).length >= 1);
}

// ---- Wrangler snapshot parsing -----------------------------------------------------------------------------------------------
{
  const sample = ` ⛅️ wrangler 4.105.0\n[{"Id":"b9c85333-a309-4cec-88b2-ee493b7a536a","Environment":"Production","Branch":"main","Source":"5c184c9","Status":"2 hours ago"},{"Id":"cd631d65-3615-464d-bb0c-2cbcbbff3e5b","Environment":"Production","Branch":"main","Source":"5c184c9"}]`;
  const parsed = parseWranglerDeploymentList(sample);
  assert.deepEqual([parsed.id, parsed.commitHash, parsed.commitIsPrefix, parsed.stage], ['b9c85333-a309-4cec-88b2-ee493b7a536a', '5c184c9', true, null]);
  assert.ok(parseWranglerDeploymentList('garbage').error);
  assert.ok(parseWranglerDeploymentList('[]').error);
  assert.ok(parseWranglerDeploymentList('[{"Environment":"Preview","Id":"x"}]').error);
}

// ---- CLI: refuses before any request, never overwrites evidence, never echoes a credential -----------------------------------------
{
  const dir = mkdtempSync(path.join(os.tmpdir(), 'mc-off-proof-'));
  const cli = (extra, env = {}) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts/mc-production-off-proof.mjs'), ...extra], {
    cwd: ROOT, encoding: 'utf8', timeout: 30000,
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, GFD_MC_CANARY_RUNNER_TOKEN: RUNNER, CLOUDFLARE_API_TOKEN: 'cf-test-token-not-real', ...env },
  });
  const out = path.join(dir, 'evidence.json');
  const base = ['--label', 'initial', '--expected-sha', SHA, '--out', out];
  try {
    let r = cli([...base, '--origin', 'https://evil.example']);
    assert.notEqual(r.status, 0); assert.match(r.stderr, /non-canonical origin/); assert.ok(!existsSync(out), 'no evidence for a refused run');
    for (const result of [r]) assert.ok(!`${result.stdout}${result.stderr}`.includes(RUNNER));
    r = cli(['--label', 'initial', '--expected-sha', SHA]);
    assert.notEqual(r.status, 0); assert.match(r.stderr, /--out/);
    r = cli([...base, '--control-plane', 'magic']);
    assert.notEqual(r.status, 0); assert.match(r.stderr, /api, wrangler or wrangler-list/);
    r = cli(base, { CLOUDFLARE_API_TOKEN: '' });
    assert.notEqual(r.status, 0); assert.match(r.stderr, /CLOUDFLARE_API_TOKEN is not set.*--control-plane wrangler/);
    assert.ok(!existsSync(out));
    r = cli(['--label', 'sideways', '--expected-sha', SHA, '--out', out]);
    assert.notEqual(r.status, 0); assert.match(r.stderr, /initial or final/);
    r = cli(base, { GFD_MC_CANARY_RUNNER_TOKEN: 'short-secret-value' });
    assert.notEqual(r.status, 0); assert.ok(!`${r.stdout}${r.stderr}`.includes('short-secret-value'), 'a malformed credential is never echoed');
    writeFileSync(out, 'precious');
    r = cli(base);
    assert.notEqual(r.status, 0); assert.match(r.stderr, /already exists/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('mc-off-proof: ok');
