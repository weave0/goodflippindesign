/**
 * Where the production tooling gets its Cloudflare read credential, selected EXPLICITLY (never a silent fallback):
 *
 *   env      CLOUDFLARE_API_TOKEN from the environment (a read-only Pages token is enough).
 *   wrangler the operator's existing Wrangler login, via Wrangler's supported `wrangler auth token --json`. No new
 *            credential is created or stored. The login can write, so this module only ever hands the token to
 *            read-only GET helpers (fetchPagesControlPlane); the token is never printed, logged, put in argv, written
 *            to evidence or reflected into an error.
 *
 * Both sources feed the same exact control-plane checks (full commit SHA, deployment stage, source repository, domain,
 * D1 binding, secret types); `wrangler` is not a weaker mode.
 */

import { spawnSync } from 'node:child_process';

export const TOKEN_SOURCES = Object.freeze(['env', 'wrangler']);
const TOKEN_SHAPE = /^[A-Za-z0-9._~+/=-]{20,}$/;

/** Pure: parses `wrangler auth token --json` stdout. Returns { token } or { error } (never echoes the output). */
export function parseWranglerAuthToken(stdout) {
  const text = String(stdout || '');
  const start = text.indexOf('{');
  let parsed;
  try { parsed = JSON.parse(text.slice(start >= 0 ? start : 0)); } catch { return { error: 'wrangler auth token did not return JSON (is wrangler logged in?)' }; }
  if (!['oauth', 'api_token'].includes(parsed?.type)) return { error: 'wrangler is not logged in with an OAuth or API token (a global API key is not accepted)' };
  if (typeof parsed.token !== 'string' || !TOKEN_SHAPE.test(parsed.token)) return { error: 'wrangler returned an unusable token' };
  return { token: parsed.token };
}

export function wranglerLoginToken({ spawn = spawnSync, platform = process.platform } = {}) {
  const npx = platform === 'win32' ? 'npx.cmd' : 'npx';
  const run = spawn(npx, ['wrangler', 'auth', 'token', '--json'], { encoding: 'utf8', shell: platform === 'win32', windowsHide: true, timeout: 90000 });
  if (run.status !== 0) return { error: 'wrangler auth token failed (is wrangler logged in?)' };
  return parseWranglerAuthToken(run.stdout);
}

/** @returns { token } | { error }. `source` must be named; an unknown or missing source is an error, never a default. */
export function resolveCloudflareToken({ source, env = process.env, spawn = spawnSync, platform = process.platform } = {}) {
  if (source === 'env') {
    return env.CLOUDFLARE_API_TOKEN ? { token: env.CLOUDFLARE_API_TOKEN } : { error: 'CLOUDFLARE_API_TOKEN is not set; set it, or select --control-plane wrangler to use the Wrangler login' };
  }
  if (source === 'wrangler') return wranglerLoginToken({ spawn, platform });
  return { error: `unknown Cloudflare token source (use one of: ${TOKEN_SOURCES.join(', ')})` };
}
