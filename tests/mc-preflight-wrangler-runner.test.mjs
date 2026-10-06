// Repair of the two preflight gaps that forced a manual credential hand-off:
//   P1  Wrangler-backed control plane (the operator's existing login) with the SAME exact checks as the API-token path.
//   P3+ the single observation-level provenance GET runs as the bounded canary-runner identity, never broadened.
// No network: fake spawn / fetch stand in for Wrangler and Cloudflare.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseWranglerAuthToken, resolveCloudflareToken } from '../scripts/lib/cloudflare-token.mjs';
import { CHECKS, evaluatePreflight, fetchRuntimeProbe, resolveProbeIdentity } from '../scripts/lib/mc-production-preflight.mjs';
import { fetchPagesControlPlane } from '../scripts/lib/pages-control-plane.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHA = '8f7f62f000f2af3ef6a31cbbf0f004a1e4449ec8';
const MOVED = '5c184c9f42b24d74c5e8ebeeddca5212920bb8d2';
const DEPLOYMENT = '379773a6-0099-4bc7-9a58-d2cf61f9f2d5';
const LOGIN_TOKEN = 'wrangler-login-token-sentinel-0123456789abcdef';
const RUNNER = 'ab'.repeat(64);
const OPERATOR = 'operator-bearer-sentinel-0123456789';
const authJson = (over = {}) => JSON.stringify({ type: 'oauth', token: LOGIN_TOKEN, ...over });
const spawnReturning = (stdout, status = 0) => { const calls = []; const spawn = (cmd, args, options) => { calls.push({ cmd, args, options }); return { status, stdout, stderr: `boom ${LOGIN_TOKEN}` }; }; spawn.calls = calls; return spawn; };

const rawProject = (sha = SHA) => ({
  name: 'goodflippindesign', production_branch: 'main',
  domains: ['goodflippindesign.pages.dev', 'goodflippindesign.com'],
  source: { config: { owner: 'weave0', repo_name: 'goodflippindesign', production_branch: 'main' } },
  canonical_deployment: {
    id: DEPLOYMENT, environment: 'production', url: `https://${DEPLOYMENT.slice(0, 8)}.goodflippindesign.pages.dev`,
    deployment_trigger: { type: 'github:push', metadata: { branch: 'main', commit_hash: sha } },
    latest_stage: { name: 'deploy', status: 'success', ended_on: '2026-10-06T20:00:00Z' },
  },
  deployment_configs: { production: { d1_databases: { DB: { id: 'a46ec9df-31b8-4285-845b-1fd3a62bd1b5' } }, env_vars: {} } },
});
const cloudflareFetch = (project) => { const seen = []; const fetchImpl = async (url, init = {}) => { seen.push({ url: String(url), method: init.method || 'GET', headers: init.headers }); return new Response(JSON.stringify({ success: true, result: project }), { status: 200 }); }; fetchImpl.seen = seen; return fetchImpl; };
const p12 = (controlPlane, expectedSha = SHA) => evaluatePreflight({ expectedSha, localHeadSha: expectedSha, expectedOnMain: true, expectedWorkerId: 'w', origin: 'https://goodflippindesign.com', controlPlane, probe: null, host: null, gate: null, canonicalD1Id: null }).checks;

// ---- wrangler auth token parsing: strict, and never echoes what it was given ----------------------------------------------------
{
  assert.deepEqual(parseWranglerAuthToken(authJson()), { token: LOGIN_TOKEN });
  assert.deepEqual(parseWranglerAuthToken(` ⛅️ wrangler\n${authJson({ type: 'api_token' })}`), { token: LOGIN_TOKEN }, 'banner lines before the JSON are tolerated');
  for (const [label, out] of [
    ['global API key', authJson({ type: 'api_key', email: 'x@example.com', key: 'k' })],
    ['unknown type', authJson({ type: 'something' })],
    ['short token', authJson({ token: 'short' })],
    ['token with whitespace', authJson({ token: `${LOGIN_TOKEN} injected` })],
    ['missing token', JSON.stringify({ type: 'oauth' })],
    ['not JSON', `error: ${LOGIN_TOKEN}`],
    ['empty', ''],
    [undefined, undefined],
  ]) {
    const parsed = parseWranglerAuthToken(out);
    assert.ok(parsed.error && !parsed.token, String(label));
    assert.ok(!JSON.stringify(parsed).includes(LOGIN_TOKEN), `${label}: the error never carries the token`);
  }
}

// ---- explicit token source: no default, no silent fallback ------------------------------------------------------------------------
{
  assert.deepEqual(resolveCloudflareToken({ source: 'env', env: { CLOUDFLARE_API_TOKEN: 'cf-env-token-0123456789abcdef' } }), { token: 'cf-env-token-0123456789abcdef' });
  assert.match(resolveCloudflareToken({ source: 'env', env: {} }).error, /CLOUDFLARE_API_TOKEN is not set.*--control-plane wrangler/);
  for (const source of [undefined, '', 'auto', 'file', 'ENV']) assert.match(resolveCloudflareToken({ source, env: { CLOUDFLARE_API_TOKEN: 'cf-env-token-0123456789abcdef' } }).error, /unknown Cloudflare token source/, String(source));
  const spawn = spawnReturning(authJson());
  assert.deepEqual(resolveCloudflareToken({ source: 'wrangler', env: {}, spawn, platform: 'linux' }), { token: LOGIN_TOKEN });
  assert.deepEqual([spawn.calls[0].cmd, spawn.calls[0].args], ['npx', ['wrangler', 'auth', 'token', '--json']], 'fixed argv, nothing model- or user-influenced');
  // wrangler failing never falls back to the environment token, and its stderr (which may carry the token) is not forwarded
  const failing = resolveCloudflareToken({ source: 'wrangler', env: { CLOUDFLARE_API_TOKEN: 'cf-env-token-0123456789abcdef' }, spawn: spawnReturning('', 1) });
  assert.ok(failing.error && !failing.token && !failing.error.includes(LOGIN_TOKEN));
}

// ---- Wrangler-backed preflight stays pinned to the exact production SHA and deployment ------------------------------------------------
{
  const fetchImpl = cloudflareFetch(rawProject(SHA));
  const token = resolveCloudflareToken({ source: 'wrangler', spawn: spawnReturning(authJson()), platform: 'linux' }).token;
  const plane = await fetchPagesControlPlane({ fetchImpl, token });
  const ok = p12(plane);
  assert.equal(ok.P1.status, 'PASS');
  assert.equal(ok.P2.status, 'PASS');
  assert.match(ok.P2.reason, /commit == expected/);
  // the login token is read-only-used: exactly one GET of the project, nothing else, only to the Cloudflare API
  assert.equal(fetchImpl.seen.length, 1);
  assert.equal(fetchImpl.seen[0].method, 'GET');
  assert.equal(fetchImpl.seen[0].url, 'https://api.cloudflare.com/client/v4/accounts/3253d907ea85a18eb442283d7308b193/pages/projects/goodflippindesign');

  // production moved to another commit => P2 fails with both SHAs; the wrangler path is no more lenient than the API-token path
  const moved = p12(await fetchPagesControlPlane({ fetchImpl: cloudflareFetch(rawProject(MOVED)), token }));
  assert.equal(moved.P1.status, 'PASS');
  assert.equal(moved.P2.status, 'FAIL');
  assert.ok(moved.P2.reason.includes(MOVED) && moved.P2.reason.includes(SHA));

  // a 7-character (Wrangler list style) commit can never satisfy the exact check
  const short = p12(await fetchPagesControlPlane({ fetchImpl: cloudflareFetch(rawProject(SHA.slice(0, 7))), token }));
  assert.equal(short.P1.status, 'FAIL');
  assert.equal(short.P2.status, 'BLOCKED');
  // an abbreviated expected SHA is refused outright, and cannot satisfy the exact commit comparison
  const abbreviated = evaluatePreflight({ expectedSha: SHA.slice(0, 7), localHeadSha: SHA.slice(0, 7), expectedOnMain: true, controlPlane: plane, probe: null, host: null, gate: null });
  assert.equal(abbreviated.checks.P0.status, 'FAIL');
  assert.notEqual(abbreviated.checks.P2.status, 'PASS');

  // unhealthy / superseded deployments fail whichever token source produced them
  for (const [label, mutate] of [
    ['failed deploy', (r) => { r.canonical_deployment.latest_stage.status = 'failure'; }],
    ['preview deployment', (r) => { r.canonical_deployment.environment = 'preview'; }],
    ['feature branch', (r) => { r.canonical_deployment.deployment_trigger.metadata.branch = 'feat/x'; }],
    ['foreign source repo', (r) => { r.source.config.owner = 'mallory'; }],
  ]) {
    const raw = rawProject(); mutate(raw);
    assert.equal(p12(await fetchPagesControlPlane({ fetchImpl: cloudflareFetch(raw), token })).P1.status, 'FAIL', label);
  }

  // an unreadable wrangler login is a P1 failure with a reason, never a pass or a fallback
  const noLogin = resolveCloudflareToken({ source: 'wrangler', spawn: spawnReturning('', 1) });
  const blocked = p12(noLogin.error ? { error: noLogin.error } : null);
  assert.equal(blocked.P1.status, 'FAIL');
  assert.equal(blocked.P2.status, 'BLOCKED');
  assert.ok(!JSON.stringify(blocked).includes(LOGIN_TOKEN));
}

// ---- which credential carries the provenance GET ---------------------------------------------------------------------------------------
{
  assert.deepEqual(resolveProbeIdentity({ env: { GFD_MC_CANARY_RUNNER_TOKEN: RUNNER, GFD_OPERATOR_TOKEN: OPERATOR } }), { identity: 'canary-runner', token: RUNNER }, 'auto prefers the bounded runner');
  assert.deepEqual(resolveProbeIdentity({ env: { GFD_OPERATOR_TOKEN: OPERATOR } }), { identity: 'operator', token: OPERATOR });
  assert.deepEqual(resolveProbeIdentity({ choice: 'operator', env: { GFD_MC_CANARY_RUNNER_TOKEN: RUNNER, GFD_OPERATOR_TOKEN: OPERATOR } }), { identity: 'operator', token: OPERATOR });
  assert.deepEqual(resolveProbeIdentity({ choice: 'runner', env: { GFD_MC_CANARY_RUNNER_TOKEN: RUNNER, GFD_OPERATOR_TOKEN: OPERATOR } }), { identity: 'canary-runner', token: RUNNER });
  // explicit choices never fall back to the other identity
  assert.match(resolveProbeIdentity({ choice: 'runner', env: { GFD_OPERATOR_TOKEN: OPERATOR } }).error, /GFD_MC_CANARY_RUNNER_TOKEN is not set/);
  assert.match(resolveProbeIdentity({ choice: 'operator', env: { GFD_MC_CANARY_RUNNER_TOKEN: RUNNER } }).error, /neither|not set/);
  // a malformed runner token fails closed (no quiet switch to the operator token), and is never echoed
  for (const choice of ['auto', 'runner']) {
    const bad = resolveProbeIdentity({ choice, env: { GFD_MC_CANARY_RUNNER_TOKEN: 'AB'.repeat(64), GFD_OPERATOR_TOKEN: OPERATOR } });
    assert.match(bad.error, /128-lowercase-hex/, choice);
    assert.ok(!bad.token && !JSON.stringify(bad).includes('AB'.repeat(64)) && !JSON.stringify(bad).includes(OPERATOR));
  }
  assert.match(resolveProbeIdentity({ env: {} }).error, /neither/);
  assert.match(resolveProbeIdentity({ choice: 'root', env: { GFD_MC_CANARY_RUNNER_TOKEN: RUNNER } }).error, /--probe-identity/);
}

// ---- the probe sends the runner credential to the one canonical provenance route only ------------------------------------------------------
{
  const seen = [];
  const spy = async (url, init) => { seen.push({ url: String(url), method: init.method || 'GET', auth: init.headers?.Authorization, redirect: init.redirect }); return new Response(JSON.stringify({}), { status: 200 }); };
  await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token: RUNNER, fetchImpl: spy });
  assert.deepEqual(seen.map((s) => [s.method, s.url, s.auth, s.redirect]), [['GET', 'https://goodflippindesign.com/api/mission-control/provenance', `Bearer ${RUNNER}`, 'manual']]);
  for (const origin of ['https://goodflippindesign.pages.dev', 'https://gfd-auth.weave0.workers.dev', 'http://goodflippindesign.com', 'https://goodflippindesign.com.evil.example']) {
    seen.length = 0;
    assert.match((await fetchRuntimeProbe({ origin, token: RUNNER, fetchImpl: spy })).error, /non-canonical/, origin);
    assert.equal(seen.length, 0, `the runner credential is never sent to ${origin}`);
  }
}

// ---- P3 says exactly what happened for each identity ----------------------------------------------------------------------------------------------
{
  const p3 = (probe, probeIdentity) => evaluatePreflight({ expectedSha: SHA, localHeadSha: SHA, expectedOnMain: true, origin: 'https://goodflippindesign.com', controlPlane: { error: 'x' }, probe, host: null, gate: null, probeIdentity });
  const off = p3({ status: 404, body: { error: 'The Mission Control canary is not enabled', code: 'canary_disabled' } }, 'canary-runner');
  assert.equal(off.checks.P3.status, 'FAIL');
  assert.match(off.checks.P3.reason, /canary is OFF.*canary-runner.*enable the canary and redeploy first/);
  for (const code of ['P4', 'P5', 'P6', 'P9', 'P10', 'P11']) assert.equal(off.checks[code].status, 'BLOCKED', `${code} is blocked, never passed, when the canary is off`);
  assert.equal(off.probeIdentity, 'canary-runner');
  for (const status of [401, 403]) assert.match(p3({ status, body: null }, 'canary-runner').checks.P3.reason, new RegExp(`canary-runner credential refused.*${status}`));
  assert.match(p3({ status: 401, body: null }).checks.P3.reason, /operator credential refused/);
  assert.equal(p3({ status: 404, body: { error: 'Not found' } }, 'canary-runner').checks.P3.status, 'FAIL', 'a generic 404 is not provenance');
  assert.equal(p3({ status: 200, body: { schemaVersion: 'wrong' } }, 'canary-runner').checks.P3.status, 'FAIL');
  assert.equal(CHECKS.length, 12);
}

// ---- CLI: refuses a bad identity or source before any request, and records nothing sensitive ------------------------------------------
{
  const cli = (extra, env = {}) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts/mc-production-preflight.mjs'), ...extra], {
    cwd: ROOT, encoding: 'utf8', timeout: 60000, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  });
  const r = cli(['--expected-sha', SHA, '--control-plane', 'env', '--probe-identity', 'root'], { GFD_MC_CANARY_RUNNER_TOKEN: RUNNER });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--probe-identity must be one of auto, runner, operator/);
  assert.ok(!`${r.stdout}${r.stderr}`.includes(RUNNER));
  const bad = cli(['--expected-sha', SHA, '--control-plane', 'env', '--probe-identity', 'runner'], { GFD_MC_CANARY_RUNNER_TOKEN: 'AB'.repeat(64) });
  assert.equal(bad.status, 2);
  assert.ok(!`${bad.stdout}${bad.stderr}`.includes('AB'.repeat(64)));
  // the source is a code-level choice: the script text carries no silent wrangler/env fallback
  const script = readFileSync(path.join(ROOT, 'scripts/mc-production-preflight.mjs'), 'utf8');
  assert.match(script, /first\('--control-plane'\) \|\| 'env'/);
  assert.ok(!/CLOUDFLARE_API_TOKEN \|\|/.test(script), 'no `env || wrangler` fallback chain');
}

console.log('mc preflight wrangler/runner tests: all passed');
