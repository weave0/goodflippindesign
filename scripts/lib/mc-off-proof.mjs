/**
 * Production canary OFF proof (MC-CONFLUENCE-002 negative control).
 *
 * Claim proven: with the kill switch off, a VALID canary-runner credential is inert. Every route the runner could ever
 * reach, and the routes it must never reach, answers the canary's own structured 404 (`canary_disabled`), and nothing
 * can be created, mutated or read.
 *
 * Design rules (each is pinned by tests/mc-off-proof.test.mjs and tests/workers/mission-control-off-proof.test.js):
 *   - The proof is only meaningful if it cannot itself cause the thing it is disproving. Every probe is inert even if
 *     the canary were unexpectedly ON: POST bodies are rejected before any record is written (`unexpected_fields`) and
 *     item routes name the all-zero work-item id, which can never exist. A failing proof therefore never creates,
 *     changes, leases or dispatches anything. (The only statements the Worker may run on the way are its own idempotent
 *     request-time schema bootstrap, `CREATE ... IF NOT EXISTS`, a no-op on the provisioned production schema;
 *     tests/workers/mission-control-off-proof.test.js asserts no INSERT/UPDATE/DELETE is ever issued.)
 *   - "OFF" is judged strictly: status 404, JSON, and a body that is EXACTLY {error, code:'canary_disabled'}. A generic
 *     404 page, a 403, a redirect, a 5xx or a network error is NOT proof.
 *   - Two controls show the 404 is reached through the real credential only: no credential and a fresh random
 *     runner-shaped credential must both be refused with 401 (never `canary_disabled`).
 *   - The runner credential is sent only to the canonical origin, never over redirects, never logged, never recorded.
 *     A response that reflects it fails the proof, and evidence is secret-scanned before it can be written.
 *   - A proof is bound to a release: the Pages control plane's production deployment must be the expected SHA, and must
 *     be the same deployment before and after the probes.
 */

import { CANONICAL_MC_ORIGIN } from '../../workers/lib/worker-provenance.js';

export const OFF_PROOF_SCHEMA = 'gfd.mission-control.canary-off-proof.v1';
export const RUNNER_ENV = 'GFD_MC_CANARY_RUNNER_TOKEN';
export const DISABLED_BODY = Object.freeze({ error: 'The Mission Control canary is not enabled', code: 'canary_disabled' });

const RUNNER_TOKEN_SHAPE = /^[0-9a-f]{128}$/;
const HEX128_ANYWHERE = /[0-9a-f]{128}/;
const SHA40 = /^[0-9a-f]{40}$/;
// Cloudflare Pages deployment ids are lowercase UUIDs (same pattern as scripts/lib/pages-control-plane.mjs).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const NIL_ITEM = `gfdwi_v1_${'0'.repeat(64)}`;
const BASE = '/api/mission-control';
const item = (action) => `${BASE}/work-items/${NIL_ITEM}${action ? `/${action}` : ''}`;

/** The runner's entire reachable surface (workers/mission-control-api.js canaryRunnerGate), with inert inputs. */
export const SURFACE_PROBES = Object.freeze([
  { id: 'surface:provenance', method: 'GET', path: `${BASE}/provenance` },
  { id: 'surface:operations', method: 'GET', path: `${BASE}/operations` },
  { id: 'surface:work-items', method: 'GET', path: `${BASE}/work-items` },
  { id: 'surface:work-item', method: 'GET', path: item() },
  { id: 'surface:canary-observations', method: 'POST', path: `${BASE}/canary-observations`, body: { off_proof_probe: true } },
  { id: 'surface:transition', method: 'POST', path: item('transition'), body: { to: 'QUALIFIED' } },
  { id: 'surface:investigate', method: 'POST', path: item('investigate'), body: { evidenceRevision: '0'.repeat(40) } },
  { id: 'surface:dispatch', method: 'POST', path: item('dispatch'), body: {} },
]);

/** Routes the runner must never reach even when ON. With the switch off they must still be the canary's own 404. */
export const OUT_OF_SURFACE_PROBES = Object.freeze([
  { id: 'out:lease', method: 'POST', path: item('lease'), body: {} },
  { id: 'out:result', method: 'POST', path: item('result'), body: {} },
  { id: 'out:expire', method: 'POST', path: item('expire'), body: {} },
  { id: 'out:recover-dispatch', method: 'POST', path: item('recover-dispatch'), body: {} },
  { id: 'out:evidence-root', method: 'GET', path: BASE },
  { id: 'out:unknown-route', method: 'GET', path: `${BASE}/off-proof-unknown-route` },
  { id: 'out:unknown-action', method: 'POST', path: item('off-proof-unknown-action'), body: {} },
  { id: 'out:delete-item', method: 'DELETE', path: item() },
]);

export const ALL_PROBES = Object.freeze([...SURFACE_PROBES, ...OUT_OF_SURFACE_PROBES]);

export function isCanonicalOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname === new URL(CANONICAL_MC_ORIGIN).hostname && !url.port && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function randomRunnerShapedToken(avoid) {
  for (;;) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(64));
    const candidate = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (candidate !== avoid) return candidate;
  }
}

async function exchange({ fetchImpl, origin, probe, token, timeoutMs }) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (probe.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(probe.body); }
  try {
    const response = await fetchImpl(new URL(probe.path, origin), {
      method: probe.method, headers, body, redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    const text = String(await response.text()).slice(0, 8192);
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    return {
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      redirected: Boolean(response.headers.get('location')),
      json, text,
    };
  } catch (error) {
    return { error: error?.name === 'TimeoutError' ? 'timed out' : 'network error' };
  }
}

const sameKeys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(Object.keys(expected).sort())
  && Object.keys(expected).every((key) => value[key] === expected[key]);

/** Strict OFF judgement for a probe that used the valid runner credential. */
export function judgeDisabled(observed, secrets = []) {
  if (observed.error) return { ok: false, reason: observed.error };
  if (secrets.some((secret) => secret && observed.text.includes(secret))) return { ok: false, reason: 'response reflected a credential' };
  if (observed.redirected) return { ok: false, reason: 'redirect (credential must never follow redirects)' };
  if (observed.status !== 404) return { ok: false, reason: `status ${observed.status}, expected the canary 404` };
  if (!observed.contentType.toLowerCase().includes('application/json')) return { ok: false, reason: 'not a JSON response' };
  if (!sameKeys(observed.json, DISABLED_BODY)) return { ok: false, reason: `body is not exactly the canary_disabled refusal (code=${typeof observed.json?.code === 'string' ? observed.json.code : 'none'})` };
  return { ok: true, reason: null };
}

/** Control: the credential-less / forged request must be refused at authentication, never reach the canary gate. */
export function judgeRefused(observed, secrets = []) {
  if (observed.error) return { ok: false, reason: observed.error };
  if (secrets.some((secret) => secret && observed.text.includes(secret))) return { ok: false, reason: 'response reflected a credential' };
  if (observed.status !== 401) return { ok: false, reason: `status ${observed.status}, expected 401` };
  if (observed.json?.code === 'canary_disabled') return { ok: false, reason: 'unauthenticated request reached the canary gate' };
  return { ok: true, reason: null };
}

/**
 * Release binding. `snapshot` is { source, id, environment, branch, commitHash, commitIsPrefix, stage }.
 * Both snapshots must name the same production deployment of the expected SHA.
 */
export function bindRelease({ before, after, expectedSha }) {
  const problems = [];
  if (!SHA40.test(expectedSha || '')) problems.push('expected SHA must be a full 40-character lowercase commit SHA');
  for (const [label, snap] of [['before', before], ['after', after]]) {
    if (!snap || snap.error) { problems.push(`${label}: no control-plane snapshot (${snap?.error || 'missing'})`); continue; }
    if (String(snap.environment).toLowerCase() !== 'production') problems.push(`${label}: deployment environment is ${snap.environment}`);
    if (snap.branch !== 'main') problems.push(`${label}: deployment branch is ${snap.branch}, not main`);
    // The binding is "the SAME deployment before and after", which is meaningless without an identity: anything other
    // than a Cloudflare deployment UUID fails closed (two snapshots both lacking an id must never compare equal).
    if (typeof snap.id !== 'string' || !UUID.test(snap.id)) problems.push(`${label}: deployment id is missing or not a deployment UUID`);
    const commit = String(snap.commitHash || '');
    const matches = snap.commitIsPrefix ? commit.length >= 7 && expectedSha.startsWith(commit) : commit === expectedSha;
    if (!matches) problems.push(`${label}: deployed commit ${commit.slice(0, 12) || 'unknown'} is not the expected ${String(expectedSha).slice(0, 12)}`);
    if (snap.stage !== null && snap.stage !== 'deploy:success') problems.push(`${label}: deployment stage is ${snap.stage}`);
  }
  if (before && after && UUID.test(before.id) && UUID.test(after.id) && before.id !== after.id) problems.push('production deployment changed while the proof was running');
  return { ok: problems.length === 0, problems };
}

/** Secret scan of serialized evidence: refuse anything that looks like, or contains, a credential. */
export function scanEvidence(text, secrets = []) {
  const found = [];
  for (const secret of secrets) if (secret && text.includes(secret)) found.push('a supplied credential value');
  if (HEX128_ANYWHERE.test(text)) found.push('a 128-hex string (runner-token shape)');
  if (/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./.test(text)) found.push('a JWT-shaped string');
  if (/Bearer\s+[A-Za-z0-9._-]{16,}/.test(text)) found.push('a bearer credential');
  return found;
}

/**
 * Runs the proof. `controlPlane()` returns a normalized release snapshot (see bindRelease). Never throws for a
 * failing proof; the verdict says what happened. It throws only for unusable inputs, before any request is made.
 */
export async function runOffProof({
  origin = CANONICAL_MC_ORIGIN, runnerToken, expectedSha, label, controlPlane, fetchImpl = fetch,
  extraSecrets = [], timeoutMs = 20000, now = () => new Date(), probes = ALL_PROBES,
}) {
  if (!isCanonicalOrigin(origin)) throw new Error('refusing to send the canary-runner credential to a non-canonical origin');
  if (!RUNNER_TOKEN_SHAPE.test(runnerToken || '')) throw new Error(`${RUNNER_ENV} is not the canonical 128-lowercase-hex token`);
  if (!SHA40.test(expectedSha || '')) throw new Error('--expected-sha must be a full 40-character lowercase commit SHA');
  if (!['initial', 'final'].includes(label)) throw new Error('--label must be initial or final');
  if (typeof controlPlane !== 'function') throw new Error('a control-plane snapshot function is required (a proof must be bound to a release)');
  const secrets = [runnerToken, ...extraSecrets];

  const startedAt = now().toISOString();
  const before = await controlPlane();
  const results = [];

  for (const probe of probes) {
    const observed = await exchange({ fetchImpl, origin, probe, token: runnerToken, timeoutMs });
    const verdict = judgeDisabled(observed, secrets);
    results.push({ id: probe.id, method: probe.method, path: probe.path, kind: 'runner-credential', expect: 'canary_disabled-404', status: observed.status ?? null, code: typeof observed.json?.code === 'string' ? observed.json.code : null, ok: verdict.ok, reason: verdict.reason });
  }

  const controls = [];
  const forged = randomRunnerShapedToken(runnerToken);
  for (const [id, token] of [['control:no-credential', null], ['control:forged-runner-shaped-credential', forged]]) {
    const probe = { id, method: 'GET', path: `${BASE}/provenance` };
    const observed = await exchange({ fetchImpl, origin, probe, token, timeoutMs });
    const verdict = judgeRefused(observed, [...secrets, forged]);
    controls.push({ id, method: probe.method, path: probe.path, kind: 'control', expect: '401-not-canary_disabled', status: observed.status ?? null, code: typeof observed.json?.code === 'string' ? observed.json.code : null, ok: verdict.ok, reason: verdict.reason });
  }

  const after = await controlPlane();
  const release = bindRelease({ before, after, expectedSha });
  const failures = [
    ...results.filter((r) => !r.ok).map((r) => `${r.id}: ${r.reason}`),
    ...controls.filter((c) => !c.ok).map((c) => `${c.id}: ${c.reason}`),
    ...release.problems.map((problem) => `release: ${problem}`),
  ];

  return {
    schema: OFF_PROOF_SCHEMA,
    label,
    origin,
    startedAt,
    finishedAt: now().toISOString(),
    expectedSha,
    credential: { env: RUNNER_ENV, shape: 'canonical-128-lowercase-hex', value: 'never recorded' },
    release: { before: before?.error ? { error: before.error } : before, after: after?.error ? { error: after.error } : after, bound: release.ok },
    probes: results,
    controls,
    summary: { probes: results.length, probesOk: results.filter((r) => r.ok).length, controls: controls.length, controlsOk: controls.filter((c) => c.ok).length },
    failures,
    verdict: failures.length === 0 ? 'OFF_PROVEN' : 'NOT_PROVEN',
  };
}
