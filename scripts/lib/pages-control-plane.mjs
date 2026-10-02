/**
 * Cloudflare control-plane provenance for the production Pages project.
 *
 * The authoritative release record is the Pages project's CANONICAL production deployment, not GitHub `main` and
 * not anything the runtime says about itself. This reads that record (read-only GET) and normalizes it to the
 * fields the production preflight needs. Environment-variable VALUES are never read: the project endpoint only
 * returns names and types for secrets, and this keeps names only.
 */

export const ACCOUNT_ID = '3253d907ea85a18eb442283d7308b193';
export const PAGES_PROJECT = 'goodflippindesign';
export const CANONICAL_DOMAIN = 'goodflippindesign.com';
export const SOURCE_REPOSITORY = 'weave0/goodflippindesign';

const SHA40 = /^[0-9a-f]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Normalizes the `result` of GET /accounts/:id/pages/projects/:name. Pure. */
export function normalizeProject(result) {
  const canonical = result?.canonical_deployment || null;
  const trigger = canonical?.deployment_trigger?.metadata || {};
  const stage = canonical?.latest_stage || {};
  const prod = result?.deployment_configs?.production || {};
  const sourceConfig = result?.source?.config || {};
  return {
    project: result?.name ?? null,
    productionBranch: result?.production_branch ?? sourceConfig.production_branch ?? null,
    sourceRepository: sourceConfig.owner && sourceConfig.repo_name ? `${sourceConfig.owner}/${sourceConfig.repo_name}`.toLowerCase() : null,
    domains: Array.isArray(result?.domains) ? result.domains.map(String) : [],
    canonicalDeployment: canonical
      ? {
          id: canonical.id ?? null,
          environment: canonical.environment ?? null,
          branch: trigger.branch ?? null,
          commitHash: typeof trigger.commit_hash === 'string' ? trigger.commit_hash : null,
          stageName: stage.name ?? null,
          stageStatus: stage.status ?? null,
          createdOn: canonical.created_on ?? null,
          completedOn: stage.ended_on ?? null,
          url: canonical.url ?? null,
        }
      : null,
    productionD1: Object.fromEntries(Object.entries(prod.d1_databases || {}).map(([binding, v]) => [binding, v?.id ?? null])),
    // names + types only; never values
    productionEnvVars: Object.fromEntries(Object.entries(prod.env_vars || {}).map(([name, v]) => [name, v?.type ?? 'unknown'])),
  };
}

/** @param fetchImpl injectable; token is read by the caller from the environment and never returned. */
export async function fetchPagesControlPlane({ fetchImpl = fetch, token, accountId = ACCOUNT_ID, project = PAGES_PROJECT }) {
  if (!token) return { error: 'CLOUDFLARE_API_TOKEN is not set (read-only Pages token required)' };
  try {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${project}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return { error: `Cloudflare Pages API answered HTTP ${res.status}` };
    const body = await res.json();
    if (!body?.success || !body.result) return { error: 'Cloudflare Pages API reported failure' };
    return { project: normalizeProject(body.result) };
  } catch (error) {
    return { error: error?.name === 'TimeoutError' ? 'Cloudflare Pages API timed out' : 'Cloudflare Pages API unreachable' };
  }
}

/** Evaluates a normalized control-plane snapshot against the canonical expectations. Returns { ok, problems, facts }. */
export function judgeControlPlane(snapshot) {
  const problems = [];
  if (!snapshot || snapshot.error) return { ok: false, problems: [snapshot?.error || 'no control-plane snapshot'], facts: null };
  const p = snapshot.project;
  if (p.project !== PAGES_PROJECT) problems.push(`project is ${p.project}, not ${PAGES_PROJECT}`);
  if (p.productionBranch !== 'main') problems.push(`production branch is ${p.productionBranch}, not main`);
  if (p.sourceRepository !== SOURCE_REPOSITORY) problems.push(`source repository is ${p.sourceRepository}, not ${SOURCE_REPOSITORY}`);
  if (!p.domains.includes(CANONICAL_DOMAIN)) problems.push(`${CANONICAL_DOMAIN} is not a production domain of the project`);
  const d = p.canonicalDeployment;
  if (!d) problems.push('project has no canonical production deployment');
  else {
    if (!UUID.test(d.id || '')) problems.push('canonical deployment id is not a deployment UUID');
    if (String(d.environment).toLowerCase() !== 'production') problems.push(`canonical deployment environment is ${d.environment}`);
    if (d.branch !== 'main') problems.push(`canonical deployment branch is ${d.branch}, not main`);
    if (!SHA40.test(d.commitHash || '')) problems.push('canonical deployment has no valid commit hash');
    if (!(d.stageName === 'deploy' && d.stageStatus === 'success')) problems.push(`canonical deployment is not successful (${d.stageName}:${d.stageStatus})`);
  }
  return { ok: problems.length === 0, problems, facts: p };
}
