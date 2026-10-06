// Same-revision production redeploy: hostile tests with a fake Cloudflare Pages API. No network.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { RedeployError, createPagesApi, normalizeDeployment, planRedeploy, redeploySameRevision } from '../scripts/lib/pages-redeploy.mjs';
import { normalizeProject } from '../scripts/lib/pages-control-plane.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHA = '5c184c9f42b24d74c5e8ebeeddca5212920bb8d2';
const NEWER = 'a'.repeat(40);
const OLD_ID = '11111111-1111-4111-8111-111111111111';
const NEW_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ID = '33333333-3333-4333-8333-333333333333';

const deployment = (id, sha, { environment = 'production', branch = 'main', stage = ['deploy', 'success'] } = {}) => ({
  id, environment, created_on: '2026-10-06T20:00:00Z', url: `https://${id.slice(0, 8)}.goodflippindesign.pages.dev`,
  deployment_trigger: { type: 'github:push', metadata: { branch, commit_hash: sha } },
  latest_stage: { name: stage[0], status: stage[1] },
});
const projectResult = (canonical, overrides = {}) => ({
  name: 'goodflippindesign', production_branch: 'main', domains: ['goodflippindesign.com'],
  source: { config: { owner: 'weave0', repo_name: 'goodflippindesign', production_branch: 'main' } },
  canonical_deployment: canonical, deployment_configs: { production: { env_vars: {}, d1_databases: {} } }, ...overrides,
});

/** Scripted API. `projectStates` are returned by successive getProject calls (last repeats). */
function scriptedApi({ projectStates, retryResult, deploymentStates = [], retryThrows = null }) {
  const calls = [];
  let p = 0; let d = 0;
  return {
    calls,
    getProject: async () => { calls.push('getProject'); const state = projectStates[Math.min(p, projectStates.length - 1)]; p += 1; return normalizeProject(state); },
    retry: async (id) => { calls.push(`retry:${id}`); if (retryThrows) throw retryThrows; return normalizeDeployment(retryResult); },
    getDeployment: async (id) => { calls.push(`getDeployment:${id}`); const state = deploymentStates[Math.min(d, deploymentStates.length - 1)]; d += 1; return normalizeDeployment(state); },
  };
}
const fastClock = () => { let t = 0; return { clock: () => t, sleep: async (ms) => { t += ms; } }; };
const refused = async (fn, code, message) => {
  let caught;
  try { await fn(); } catch (error) { caught = error; }
  assert.ok(caught instanceof RedeployError, `${message}: expected a RedeployError, got ${caught}`);
  assert.equal(caught.code, code, message);
  return caught;
};

const current = projectResult(deployment(OLD_ID, SHA));

// ---- plan is read-only and pins the revision ------------------------------------------------------------------------------------
{
  const api = scriptedApi({ projectStates: [current] });
  const evidence = await redeploySameRevision({ expectedSha: SHA, api });
  assert.equal(evidence.outcome, 'planned');
  assert.equal(evidence.previous.id, OLD_ID);
  assert.deepEqual(api.calls, ['getProject'], 'a plan only reads the project');
}

// ---- refusals: it never substitutes a revision --------------------------------------------------------------------------------
{
  const api = scriptedApi({ projectStates: [projectResult(deployment(OLD_ID, NEWER))] });
  const error = await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true }), 'revision_mismatch', 'canonical is a newer branch HEAD');
  assert.match(error.message, /refusing to substitute/);
  assert.ok(!api.calls.some((c) => c.startsWith('retry')), 'no retry is ever issued on a mismatch');

  for (const [label, state, code] of [
    ['canonical deployment failed', projectResult(deployment(OLD_ID, SHA, { stage: ['deploy', 'failure'] })), 'project_unhealthy'],
    ['canonical is a preview deployment', projectResult(deployment(OLD_ID, SHA, { environment: 'preview' })), 'project_unhealthy'],
    ['canonical is from another branch', projectResult(deployment(OLD_ID, SHA, { branch: 'feature' })), 'project_unhealthy'],
    ['no canonical deployment', projectResult(null), 'project_unhealthy'],
    ['project source repository is not ours', projectResult(deployment(OLD_ID, SHA), { source: { config: { owner: 'mallory', repo_name: 'goodflippindesign' } } }), 'project_unhealthy'],
    ['production domain missing', projectResult(deployment(OLD_ID, SHA), { domains: [] }), 'project_unhealthy'],
  ]) {
    const a = scriptedApi({ projectStates: [state] });
    await refused(() => redeploySameRevision({ expectedSha: SHA, api: a, apply: true }), code, label);
    assert.ok(!a.calls.some((c) => c.startsWith('retry')), `${label}: no retry`);
  }
  for (const bad of [undefined, '', 'abc123', SHA.slice(0, 12), SHA.toUpperCase(), `${SHA}0`]) {
    const a = scriptedApi({ projectStates: [current] });
    await refused(() => planRedeploy({ expectedSha: bad, api: a }), 'bad_sha', String(bad));
    assert.deepEqual(a.calls, [], 'a bad SHA is refused before any API call');
  }
}

// ---- happy path --------------------------------------------------------------------------------------------------------------
{
  const api = scriptedApi({
    projectStates: [current, projectResult(deployment(NEW_ID, SHA))],
    retryResult: deployment(NEW_ID, SHA, { stage: ['queued', 'active'] }),
    deploymentStates: [deployment(NEW_ID, SHA, { stage: ['build', 'active'] }), deployment(NEW_ID, SHA, { stage: ['deploy', 'success'] })],
  });
  const evidence = await redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() });
  assert.equal(evidence.outcome, 'redeployed');
  assert.equal(evidence.previous.id, OLD_ID);
  assert.equal(evidence.retried.id, NEW_ID);
  assert.equal(evidence.retried.commitHash, SHA);
  assert.equal(evidence.canonicalAfter.id, NEW_ID);
  assert.deepEqual(api.calls, ['getProject', `retry:${OLD_ID}`, `getDeployment:${NEW_ID}`, `getDeployment:${NEW_ID}`, 'getProject']);
  assert.equal(api.calls.filter((c) => c.startsWith('retry')).length, 1, 'exactly one retry POST');
}

// ---- the retried deployment is verified, not trusted ------------------------------------------------------------------------------
{
  const okRetry = deployment(NEW_ID, SHA, { stage: ['queued', 'active'] });
  for (const [label, retryResult, code] of [
    ['retry built a different commit', deployment(NEW_ID, NEWER, { stage: ['queued', 'active'] }), 'retry_not_pinned'],
    ['retry returned the same deployment id', deployment(OLD_ID, SHA, { stage: ['queued', 'active'] }), 'retry_not_pinned'],
    ['retry created a preview deployment', deployment(NEW_ID, SHA, { environment: 'preview' }), 'retry_not_pinned'],
    ['retry on another branch', deployment(NEW_ID, SHA, { branch: 'feature' }), 'retry_not_pinned'],
  ]) {
    const api = scriptedApi({ projectStates: [current], retryResult });
    await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() }), code, label);
  }
  let api = scriptedApi({ projectStates: [current], retryResult: okRetry, deploymentStates: [deployment(NEW_ID, SHA, { stage: ['build', 'failure'] })] });
  await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() }), 'deployment_failed', 'build failure');
  api = scriptedApi({ projectStates: [current], retryResult: okRetry, deploymentStates: [deployment(NEW_ID, SHA, { stage: ['deploy', 'canceled'] })] });
  await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() }), 'deployment_failed', 'canceled');
  api = scriptedApi({ projectStates: [current], retryResult: okRetry, deploymentStates: [deployment(NEW_ID, SHA, { stage: ['build', 'active'] })] });
  await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, timeoutMs: 30000, pollMs: 5000, ...fastClock() }), 'deployment_timeout', 'never finishes');
  api = scriptedApi({ projectStates: [current], retryResult: okRetry, deploymentStates: [deployment(NEW_ID, NEWER, { stage: ['build', 'active'] })] });
  await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() }), 'revision_changed', 'revision changes while observed');
  // a push to main supersedes the retried deployment before verification
  api = scriptedApi({
    projectStates: [current, projectResult(deployment(OTHER_ID, NEWER))], retryResult: okRetry,
    deploymentStates: [deployment(NEW_ID, SHA, { stage: ['deploy', 'success'] })],
  });
  const error = await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() }), 'superseded', 'superseded by a newer deployment');
  assert.equal(error.evidence.retried.id, NEW_ID, 'evidence of what happened is preserved on failure');
}

// ---- the retry POST is never repeated, and an unknown outcome is reported as unknown --------------------------------------------------
{
  // after a SUCCESSFUL retry, observation failures keep the new deployment's identity and never invite a second POST
  for (const [label, apiOverrides] of [
    ['first poll throws', { getDeployment: async () => { throw new RedeployError('Cloudflare Pages API unreachable (GET /deployments/x)', { code: 'unreachable' }); } }],
    ['final project read throws', { getDeployment: async () => normalizeDeployment(deployment(NEW_ID, SHA)), failFinalProject: true }],
  ]) {
    const base = scriptedApi({ projectStates: [current], retryResult: deployment(NEW_ID, SHA, { stage: ['queued', 'active'] }), deploymentStates: [deployment(NEW_ID, SHA)] });
    let projectReads = 0;
    const api = {
      ...base,
      getProject: async () => { projectReads += 1; if (apiOverrides.failFinalProject && projectReads > 1) throw new RedeployError('Cloudflare Pages API unreachable (GET /)', { code: 'unreachable' }); return base.getProject(); },
      ...(apiOverrides.getDeployment ? { getDeployment: apiOverrides.getDeployment } : {}),
    };
    const error = await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() }), 'observation_failed', label);
    assert.equal(error.evidence.retried.id, NEW_ID, `${label}: the created deployment id is preserved`);
    assert.match(error.message, new RegExp(`submitted as deployment ${NEW_ID}.*do NOT retry again`), label);
    assert.equal(base.calls.filter((c) => c.startsWith('retry')).length, 1, `${label}: exactly one retry POST`);
  }
  for (const [thrown, code] of [
    [new RedeployError('Cloudflare Pages API unreachable (POST /deployments/x/retry)', { code: 'unreachable' }), 'retry_unknown'],
    [new RedeployError('Cloudflare Pages API refused POST (HTTP 403)', { code: 'api_refused' }), 'retry_refused'],
  ]) {
    const api = scriptedApi({ projectStates: [current], retryThrows: thrown });
    const error = await refused(() => redeploySameRevision({ expectedSha: SHA, api, apply: true, ...fastClock() }), code, thrown.message);
    assert.equal(api.calls.filter((c) => c.startsWith('retry')).length, 1, 'POST is not retried');
    if (code === 'retry_unknown') assert.match(error.message, /outcome is unknown/);
  }
}

// ---- the HTTP client: exact routes, bearer only in the header, no redirects, secrets never in errors ----------------------------------
{
  const TOKEN = 'cf-test-token-0123456789';
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url: String(url), method: init.method, headers: init.headers, redirect: init.redirect });
    if (String(url).endsWith('/retry')) return new Response(JSON.stringify({ success: true, result: deployment(NEW_ID, SHA) }), { status: 200 });
    if (String(url).includes('/deployments/')) return new Response(JSON.stringify({ success: false, errors: [{ message: `denied for ${TOKEN}` }] }), { status: 403 });
    return new Response(JSON.stringify({ success: true, result: current }), { status: 200 });
  };
  const api = createPagesApi({ token: TOKEN, fetchImpl });
  assert.equal((await api.getProject()).canonicalDeployment.id, OLD_ID);
  assert.equal((await api.retry(OLD_ID)).id, NEW_ID);
  const failure = await refused(() => api.getDeployment(NEW_ID), 'api_refused', 'API refusal');
  assert.ok(!failure.message.includes(TOKEN), 'the token/body is never reflected into an error');
  const base = 'https://api.cloudflare.com/client/v4/accounts/3253d907ea85a18eb442283d7308b193/pages/projects/goodflippindesign';
  assert.deepEqual(seen.map((s) => [s.method, s.url]), [['GET', base], ['POST', `${base}/deployments/${OLD_ID}/retry`], ['GET', `${base}/deployments/${NEW_ID}`]]);
  for (const s of seen) { assert.equal(s.redirect, 'manual'); assert.equal(s.headers.Authorization, `Bearer ${TOKEN}`); assert.ok(!s.url.includes(TOKEN)); }
  await refused(async () => createPagesApi({ token: undefined }), 'no_token', 'a missing token is refused up front');
  const down = createPagesApi({ token: TOKEN, fetchImpl: async () => { throw new TypeError('socket hang up'); } });
  await refused(() => down.getProject(), 'unreachable', 'network failure');
}

// ---- the workflow cannot be turned into a different deployer ----------------------------------------------------------------------------
{
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/mc-pages-redeploy.yml'), 'utf8');
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.ok(!/^\s+(push|pull_request|pull_request_target|schedule|workflow_run):/m.test(workflow), 'manual dispatch only');
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  const lines = workflow.split(/\r?\n/);
  const runBlocks = [];
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(\s+)run:\s*(.*)$/.exec(lines[i]);
    if (!match) continue;
    const block = [match[2]];
    for (let j = i + 1; j < lines.length && (lines[j].trim() === '' || lines[j].search(/\S/) > match[1].length); j += 1) block.push(lines[j]);
    runBlocks.push(block.join('\n'));
  }
  assert.ok(runBlocks.length >= 2);
  assert.ok(!runBlocks.some((block) => block.includes('${{')), 'no expression is interpolated into a shell script; inputs reach it only through env');
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ inputs\.expected_sha \}\}/);
  assert.match(workflow, /scripts\/mc-pages-redeploy\.mjs --expected-sha "\$EXPECTED_SHA"/);
  assert.ok(!/curl |wrangler pages deploy|branch HEAD from/.test(workflow.replace(/^#.*$/gm, '')), 'no ad hoc deploy path');
  assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
}

// ---- CLI refusals (no network: the token is unset or the SHA is invalid before any request) ---------------------------------------------
{
  const cli = (extra, env = {}) => spawnSync(process.execPath, ['--no-warnings', path.join(ROOT, 'scripts/mc-pages-redeploy.mjs'), ...extra], {
    cwd: ROOT, encoding: 'utf8', timeout: 30000, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, ...env },
  });
  let r = cli(['--expected-sha', SHA]);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /no_token/);
  r = cli(['--expected-sha', 'nope'], { CLOUDFLARE_API_TOKEN: 'cf-test-token-not-real' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /bad_sha/); assert.ok(!r.stderr.includes('cf-test-token-not-real'));
  r = cli(['--expected-sha', SHA, '--timeout-seconds', '5'], { CLOUDFLARE_API_TOKEN: 'cf-test-token-not-real' });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /between 30 and 3600/);
}

console.log('mc-pages-redeploy: ok');
