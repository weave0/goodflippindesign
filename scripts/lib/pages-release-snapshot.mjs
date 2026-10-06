/**
 * Release snapshots of the production Pages project for proofs that must be bound to one exact deployment.
 *
 *   api      The Cloudflare control plane's CANONICAL production deployment (full commit SHA, stage and status).
 *            Needs CLOUDFLARE_API_TOKEN (read-only Pages is enough). This is the preferred source.
 *   wrangler The newest production entry from `wrangler pages deployment list --json`, using the operator's own
 *            Wrangler login. Wrangler reports only the 7-character source SHA and no stage, so snapshots from it are
 *            marked `commitIsPrefix: true` / `stage: null` and the evidence says so. Selected explicitly, never as a
 *            silent fallback.
 */

import { spawnSync } from 'node:child_process';

import { PAGES_PROJECT, fetchPagesControlPlane } from './pages-control-plane.mjs';

export async function apiSnapshot({ token, fetchImpl = fetch } = {}) {
  const plane = await fetchPagesControlPlane({ fetchImpl, token });
  if (plane.error) return { source: 'cloudflare-api', error: plane.error };
  const d = plane.project?.canonicalDeployment;
  if (!d) return { source: 'cloudflare-api', error: 'project has no canonical production deployment' };
  return {
    source: 'cloudflare-api',
    id: d.id,
    environment: d.environment,
    branch: d.branch,
    commitHash: d.commitHash,
    commitIsPrefix: false,
    stage: `${d.stageName}:${d.stageStatus}`,
    createdOn: d.createdOn,
  };
}

/** Pure: parses the JSON array printed by `wrangler pages deployment list --json`. */
export function parseWranglerDeploymentList(text) {
  let entries;
  try { entries = JSON.parse(text.slice(text.indexOf('['))); } catch { return { source: 'wrangler-list', error: 'wrangler deployment list was not parseable JSON' }; }
  const latest = Array.isArray(entries) ? entries.find((entry) => String(entry?.Environment).toLowerCase() === 'production') : null;
  if (!latest) return { source: 'wrangler-list', error: 'no production deployment listed' };
  return {
    source: 'wrangler-list',
    id: latest.Id,
    environment: latest.Environment,
    branch: latest.Branch,
    commitHash: String(latest.Source || ''),
    commitIsPrefix: true,
    stage: null,
  };
}

export function wranglerSnapshot({ spawn = spawnSync, platform = process.platform } = {}) {
  const npx = platform === 'win32' ? 'npx.cmd' : 'npx';
  const run = spawn(npx, ['wrangler', 'pages', 'deployment', 'list', '--project-name', PAGES_PROJECT, '--environment', 'production', '--json'], {
    encoding: 'utf8', shell: platform === 'win32', windowsHide: true, timeout: 90000,
  });
  if (run.status !== 0) return { source: 'wrangler-list', error: 'wrangler pages deployment list failed (is wrangler logged in?)' };
  return parseWranglerDeploymentList(run.stdout || '');
}
