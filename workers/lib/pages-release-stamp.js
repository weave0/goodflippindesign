/**
 * Release stamp for the Cloudflare Pages production runtime.
 *
 * Cloudflare Pages injects CF_PAGES=1, CF_PAGES_COMMIT_SHA, CF_PAGES_BRANCH and CF_PAGES_URL into the build that
 * `npm run build` runs. scripts/stamp-pages-release.mjs turns them into a build-output file (release-stamp.json,
 * ignored by Git) that the Pages Worker reads through env.ASSETS. Nothing is committed, so no commit ever claims
 * to contain its own SHA.
 *
 * States:
 *   stamped  built by Cloudflare Pages with a well-formed 40-char lowercase commit SHA
 *   invalid  built by Cloudflare Pages but the SHA is absent/malformed, or the stamp is unreadable - never current
 *   local    not a Pages build (developer machine, CI, tests) - never production, never current
 */

export const STAMP_SCHEMA = 'gfd-pages-release-stamp-1';
export const STAMP_FILE = 'release-stamp.json';
const SHA40 = /^[0-9a-f]{40}$/;

export function buildStamp(env, now = new Date()) {
  const base = { schemaVersion: STAMP_SCHEMA, builtAt: now.toISOString() };
  if (env.CF_PAGES !== '1') {
    return { ...base, source: 'local', state: 'local', sha: null, branch: null, url: null, reason: 'not a Cloudflare Pages build' };
  }
  const sha = env.CF_PAGES_COMMIT_SHA;
  const branch = env.CF_PAGES_BRANCH || null;
  const url = env.CF_PAGES_URL || null;
  if (typeof sha !== 'string' || !SHA40.test(sha)) {
    return { ...base, source: 'cloudflare-pages', state: 'invalid', sha: null, branch, url, reason: 'CF_PAGES_COMMIT_SHA is absent or not a 40-character lowercase SHA' };
  }
  return { ...base, source: 'cloudflare-pages', state: 'stamped', sha, branch, url, reason: null };
}

// CF_PAGES_URL is unique per deployment (https://<id-prefix>.<project>.pages.dev); it distinguishes two deployments of the same commit.
const PAGES_URL = /^https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.pages\.dev\/?$/;
function deploymentUrlOf(value) {
  return typeof value === 'string' && PAGES_URL.test(value) ? value.replace(/\/$/, '') : null;
}

/** Validates a parsed stamp read back at runtime. Anything unexpected is `invalid`, never current. */
export function interpretStamp(value) {
  if (!value || typeof value !== 'object' || value.schemaVersion !== STAMP_SCHEMA) {
    return { state: 'invalid', sha: null, branch: null, builtAt: null, source: null, reason: 'release stamp is not a recognised stamp' };
  }
  const builtAt = typeof value.builtAt === 'string' && Number.isFinite(Date.parse(value.builtAt)) ? new Date(value.builtAt).toISOString() : null;
  if (value.source === 'cloudflare-pages' && value.state === 'stamped' && SHA40.test(value.sha || '') && builtAt) {
    return { state: 'stamped', sha: value.sha, branch: typeof value.branch === 'string' ? value.branch : null, builtAt, source: 'cloudflare-pages', url: deploymentUrlOf(value.url), reason: null };
  }
  if (value.source === 'local' && value.state === 'local') {
    return { state: 'local', sha: null, branch: null, builtAt, source: 'local', reason: 'built outside Cloudflare Pages; never production' };
  }
  return { state: 'invalid', sha: null, branch: null, builtAt, source: value.source ?? null, reason: value.reason || 'release stamp failed validation' };
}

/**
 * Reads the stamp through the Pages static-asset binding. Missing binding or file => `unstamped`.
 * A response that is not a valid stamp (e.g. an SPA fallback page) => `invalid`.
 */
export async function readRuntimeStamp(env, requestUrl) {
  if (!env?.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    return { state: 'unstamped', sha: null, branch: null, builtAt: null, source: null, reason: 'no static-asset binding; not running on Cloudflare Pages' };
  }
  try {
    const response = await env.ASSETS.fetch(new Request(new URL(`/${STAMP_FILE}`, requestUrl)));
    if (response.status === 404) {
      return { state: 'unstamped', sha: null, branch: null, builtAt: null, source: null, reason: 'this deployment carries no release stamp' };
    }
    if (!response.ok) return { state: 'invalid', sha: null, branch: null, builtAt: null, source: null, reason: `release stamp read answered HTTP ${response.status}` };
    return interpretStamp(JSON.parse(await response.text()));
  } catch {
    return { state: 'invalid', sha: null, branch: null, builtAt: null, source: null, reason: 'release stamp is unreadable' };
  }
}
