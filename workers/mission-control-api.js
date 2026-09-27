/**
 * Mission Control evidence broker.
 *
 * GlobalDeets owns collection. GFD owns the authenticated operator surface.
 * This module is server-only: upstream credentials are never returned to the browser.
 */

const DEFAULT_REPO = 'weave0/globaldeets';
const DEFAULT_REF = 'mission-control-evidence';

export const EVIDENCE_FILES = Object.freeze({
  estateHealth: 'latest/estate-health.json',
  diagnostics: 'latest/diagnostics.json',
  executive: 'latest/executive.json',
  history: 'latest/history.json',
  audience: 'latest/audience.json',
  businessEvents: 'latest/business-events.json',
  probes: 'latest/probes.json',
});

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extraHeaders,
    },
  });
}

function githubContentsUrl(repo, path, ref) {
  return `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
}

async function fetchEvidenceFile({ fetchImpl, token, repo, ref, key, path }) {
  const response = await fetchImpl(githubContentsUrl(repo, path, ref), {
    headers: {
      Accept: 'application/vnd.github.raw+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'gfd-mission-control',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (!response.ok) {
    const error = new Error(`Evidence fetch failed for ${key}: HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  let value;
  try {
    value = await response.json();
  } catch {
    throw new Error(`Evidence fetch returned invalid JSON for ${key}`);
  }

  if (!value || typeof value !== 'object') {
    throw new Error(`Evidence payload is invalid for ${key}`);
  }
  return value;
}

export async function loadMissionControlEvidence(env, fetchImpl = fetch) {
  const token = env.MISSION_CONTROL_GITHUB_TOKEN;
  if (!token) {
    const error = new Error('Mission Control upstream credential is not configured');
    error.code = 'UPSTREAM_NOT_CONFIGURED';
    throw error;
  }

  const repo = env.MISSION_CONTROL_GITHUB_REPO || DEFAULT_REPO;
  const ref = env.MISSION_CONTROL_GITHUB_REF || DEFAULT_REF;

  const entries = await Promise.all(
    Object.entries(EVIDENCE_FILES).map(async ([key, path]) => [
      key,
      await fetchEvidenceFile({ fetchImpl, token, repo, ref, key, path }),
    ]),
  );

  const evidence = Object.fromEntries(entries);
  const generatedAt =
    evidence.estateHealth?.generatedAt ||
    evidence.executive?.generatedAt ||
    evidence.probes?.generatedAt ||
    null;

  return {
    schemaVersion: 'gfd-mission-control-1',
    source: {
      producer: 'GlobalDeets',
      repository: repo,
      ref,
      generatedAt,
    },
    evidence,
    servedAt: new Date().toISOString(),
  };
}

export async function handleMissionControlRequest(request, env, user, fetchImpl = fetch) {
  if (request.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
  }

  if (!user || user.publicMetadata?.role !== 'admin') {
    return jsonResponse({ error: 'Forbidden: Admin access required' }, 403);
  }

  try {
    const payload = await loadMissionControlEvidence(env, fetchImpl);
    return jsonResponse(payload);
  } catch (error) {
    console.error('[mission-control] evidence broker failed:', error?.message || error);
    const status = error?.code === 'UPSTREAM_NOT_CONFIGURED' ? 503 : 502;
    return jsonResponse({
      error: status === 503
        ? 'Mission Control evidence source is not configured'
        : 'Mission Control evidence is temporarily unavailable',
    }, status);
  }
}
