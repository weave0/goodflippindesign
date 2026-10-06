/**
 * Deterministic same-revision redeploy of the production Pages project.
 *
 * Why this exists: Pages secrets/bindings take effect only on a NEW deployment (docs/mission-control-worker-provenance.md),
 * so the canary runbook redeploys after provisioning, after enabling the canary and after disabling it. Every
 * available "make a new deployment" path except one substitutes something:
 *   - `wrangler pages deploy` uploads a LOCAL directory (not the Git-built, merged revision);
 *   - the force-deploy workflow creates a deployment from branch HEAD, which can be a newer commit than the one certified.
 * The Pages "retry deployment" endpoint rebuilds the SAME commit of a SPECIFIC deployment against the project's current
 * environment. That is the only path that holds the revision fixed, and this module is fail-closed around it:
 *
 *   1. the canonical production deployment must already be the expected full SHA, built from main, successfully;
 *   2. the deployment it creates must be the same SHA, production, main, and a different deployment id;
 *   3. it must reach deploy:success within the deadline;
 *   4. the project's canonical deployment afterwards must be that new deployment, still the expected SHA.
 * Any other outcome is a refusal or a failure, never a substitution. POST is never retried (a duplicate deployment is
 * worse than a reported failure). The token is read by the caller from the environment and never logged or returned.
 */

import { ACCOUNT_ID, PAGES_PROJECT, judgeControlPlane, normalizeProject } from './pages-control-plane.mjs';

export const REDEPLOY_SCHEMA = 'gfd.pages.same-revision-redeploy.v1';
const SHA40 = /^[0-9a-f]{40}$/;
const API = 'https://api.cloudflare.com/client/v4';

export class RedeployError extends Error {
  constructor(message, { code = 'redeploy_failed', evidence = null } = {}) {
    super(message);
    this.code = code;
    this.evidence = evidence;
  }
}

/** Pure: normalizes one Pages deployment object. */
export function normalizeDeployment(result) {
  const trigger = result?.deployment_trigger?.metadata || {};
  const stage = result?.latest_stage || {};
  return {
    id: result?.id ?? null,
    environment: result?.environment ?? null,
    branch: trigger.branch ?? null,
    commitHash: typeof trigger.commit_hash === 'string' ? trigger.commit_hash : null,
    stageName: stage.name ?? null,
    stageStatus: stage.status ?? null,
    createdOn: result?.created_on ?? null,
  };
}

export function createPagesApi({ token, fetchImpl = fetch, accountId = ACCOUNT_ID, project = PAGES_PROJECT, timeoutMs = 30000 }) {
  if (!token) throw new RedeployError('CLOUDFLARE_API_TOKEN is not set (a Pages-write token is required to retry a deployment)', { code: 'no_token' });
  const base = `${API}/accounts/${accountId}/pages/projects/${project}`;
  async function call(method, suffix) {
    let response;
    try {
      response = await fetchImpl(`${base}${suffix}`, {
        method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new RedeployError(`Cloudflare Pages API ${error?.name === 'TimeoutError' ? 'timed out' : 'unreachable'} (${method} ${suffix || '/'})`, { code: 'unreachable' });
    }
    let body = null;
    try { body = await response.json(); } catch { /* not JSON */ }
    if (!response.ok || !body?.success || !body.result) {
      throw new RedeployError(`Cloudflare Pages API refused ${method} ${suffix || '/'} (HTTP ${response.status})`, { code: 'api_refused' });
    }
    return body.result;
  }
  return {
    getProject: async () => normalizeProject(await call('GET', '')),
    getDeployment: async (id) => normalizeDeployment(await call('GET', `/deployments/${encodeURIComponent(id)}`)),
    retry: async (id) => normalizeDeployment(await call('POST', `/deployments/${encodeURIComponent(id)}/retry`)),
  };
}

/** Read-only. Throws RedeployError unless a same-revision retry is permitted. */
export async function planRedeploy({ expectedSha, api }) {
  if (!SHA40.test(expectedSha || '')) throw new RedeployError('--expected-sha must be a full 40-character lowercase commit SHA', { code: 'bad_sha' });
  const project = await api.getProject();
  const judged = judgeControlPlane({ project });
  if (!judged.ok) throw new RedeployError(`production project is not in a retryable state: ${judged.problems.join('; ')}`, { code: 'project_unhealthy' });
  const canonical = project.canonicalDeployment;
  if (canonical.commitHash !== expectedSha) {
    throw new RedeployError(`the canonical production deployment is ${String(canonical.commitHash).slice(0, 12)}, not the expected ${expectedSha.slice(0, 12)}; refusing to substitute another revision`, { code: 'revision_mismatch' });
  }
  return { expectedSha, target: canonical };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Plans, then (when apply) retries the canonical deployment and verifies the result.
 * @returns evidence object (ids, SHAs, timestamps only).
 */
export async function redeploySameRevision({
  expectedSha, api, apply = false, timeoutMs = 15 * 60 * 1000, pollMs = 5000, sleep = wait, now = () => new Date(), clock = () => Date.now(),
}) {
  const startedAt = now().toISOString();
  const { target } = await planRedeploy({ expectedSha, api });
  const evidence = { schema: REDEPLOY_SCHEMA, expectedSha, project: PAGES_PROJECT, mode: apply ? 'apply' : 'plan', startedAt, previous: { id: target.id, createdOn: target.createdOn, commitHash: target.commitHash } };
  if (!apply) return { ...evidence, finishedAt: now().toISOString(), outcome: 'planned' };

  let created;
  try {
    created = await api.retry(target.id);
  } catch (error) {
    // The POST may or may not have created a deployment; say so rather than guessing, and never retry it.
    throw new RedeployError(`${error.message}; the retry outcome is unknown, inspect \`wrangler pages deployment list\` before trying again`, { code: error.code === 'api_refused' ? 'retry_refused' : 'retry_unknown', evidence });
  }
  evidence.retried = { id: created.id, createdOn: created.createdOn, commitHash: created.commitHash, environment: created.environment, branch: created.branch };
  const wrong = [];
  if (!created.id || created.id === target.id) wrong.push('it did not create a new deployment id');
  if (created.commitHash !== expectedSha) wrong.push(`it built ${String(created.commitHash).slice(0, 12)}, not ${expectedSha.slice(0, 12)}`);
  if (String(created.environment).toLowerCase() !== 'production') wrong.push(`environment is ${created.environment}`);
  if (created.branch !== 'main') wrong.push(`branch is ${created.branch}`);
  if (wrong.length) throw new RedeployError(`the retried deployment is not the pinned revision: ${wrong.join('; ')}`, { code: 'retry_not_pinned', evidence });

  const deadline = clock() + timeoutMs;
  // From here the deployment exists. Any failure to observe it must carry its identity so nobody POSTs a second retry blind.
  const observe = async (read) => {
    try {
      return await read();
    } catch (error) {
      throw new RedeployError(`${error.message}; the retry was already submitted as deployment ${created.id}: do NOT retry again, inspect that deployment`, { code: 'observation_failed', evidence });
    }
  };
  let current = created;
  for (;;) {
    if (current.stageStatus === 'failure' || current.stageStatus === 'canceled') {
      throw new RedeployError(`the retried deployment ${created.id} ended ${current.stageName}:${current.stageStatus}`, { code: 'deployment_failed', evidence });
    }
    if (current.stageName === 'deploy' && current.stageStatus === 'success') break;
    if (clock() > deadline) throw new RedeployError(`the retried deployment ${created.id} did not finish within ${Math.round(timeoutMs / 1000)}s (${current.stageName}:${current.stageStatus})`, { code: 'deployment_timeout', evidence });
    await sleep(pollMs);
    current = await observe(() => api.getDeployment(created.id));
    if (current.commitHash !== expectedSha) throw new RedeployError('the deployment changed revision while being observed', { code: 'revision_changed', evidence });
  }

  const project = await observe(() => api.getProject());
  const canonical = project.canonicalDeployment;
  evidence.canonicalAfter = canonical ? { id: canonical.id, commitHash: canonical.commitHash, stage: `${canonical.stageName}:${canonical.stageStatus}` } : null;
  if (!canonical || canonical.id !== created.id) {
    throw new RedeployError(`the project's canonical production deployment is ${canonical?.id ?? 'none'}, not the retried ${created.id}; a different deployment superseded it`, { code: 'superseded', evidence });
  }
  if (canonical.commitHash !== expectedSha) throw new RedeployError('the canonical deployment is not the expected revision', { code: 'revision_changed', evidence });
  return { ...evidence, finishedAt: now().toISOString(), outcome: 'redeployed' };
}
