/**
 * Runtime provenance for the Mission Control API as served by the Cloudflare Pages production runtime.
 *
 * Production topology (pinned by tests/mc-topology.test.mjs):
 *   https://goodflippindesign.com/api/mission-control
 *     -> Cloudflare Pages project `goodflippindesign` (advanced mode)
 *     -> _worker.js -> workers/auth.js -> handleMissionControlRequest
 * The standalone `gfd-auth` Worker (gfd-auth.weave0.workers.dev) is legacy and is NOT this runtime.
 *
 * This report states what the RUNNING code can see about itself: the build stamp written during the Pages build,
 * the protocol/capability contract it implements, whether its bindings are usable, and that its D1 binding is
 * reachable with the Mission Control schema. It is deliberately not the release authority: the preflight
 * cross-checks it against Cloudflare's own deployment record, so a runtime that lies about itself still fails.
 *
 * Binding values are never returned. The three non-secret identifiers (two key ids, the worker id) are exposed
 * only as short SHA-256 fingerprints so an operator can compare them with the FWOMPS host.
 */

import {
  INVESTIGATION_PURPOSE,
  INVESTIGATION_SCHEMA,
  LEASE_PURPOSE,
  LEASE_SCHEMA,
  RESULT_PURPOSE,
  RESULT_SCHEMA,
  keyBytesFromEnv,
} from '../fwomps-investigation-adapter.js';
import { readRuntimeStamp } from './pages-release-stamp.js';
import { keyCheckValue, strongHexKeyBytes, strongTokenBytes } from './key-check-value.js';

export const PROVENANCE_SCHEMA = 'gfd-mc-runtime-provenance-1';
export const MISSION_CONTROL_API_SCHEMA = 'gfd-mission-control-1';
export const RUNTIME_KIND = 'cloudflare-pages-advanced-worker';
export const PAGES_PROJECT = 'goodflippindesign';
export const CANONICAL_MC_ORIGIN = 'https://goodflippindesign.com';
export const REQUIRED_BINDINGS = Object.freeze([
  'MISSION_CONTROL_CONTRACT_KEY',
  'MISSION_CONTROL_CONTRACT_KEY_ID',
  'MISSION_CONTROL_RESULT_KEY',
  'MISSION_CONTROL_RESULT_KEY_ID',
  'MISSION_CONTROL_RESULT_WORKER_ID',
  'MISSION_CONTROL_WORKER_TOKEN',
]);

function nonBlank(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

async function fingerprint(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return `sha256:${[...digest].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

function keyState(value) {
  if (!nonBlank(value)) return 'missing';
  return keyBytesFromEnv(value) ? 'present' : 'invalid';
}

function idState(value) {
  if (!nonBlank(value)) return 'missing';
  return value === value.trim() ? 'present' : 'invalid';
}

function tokenState(value) {
  if (!nonBlank(value)) return 'missing';
  return strongTokenBytes(value) ? 'present' : 'invalid';
}

export async function bindingReadiness(env) {
  const bindings = {
    MISSION_CONTROL_CONTRACT_KEY: { state: keyState(env?.MISSION_CONTROL_CONTRACT_KEY), secret: true },
    MISSION_CONTROL_CONTRACT_KEY_ID: { state: idState(env?.MISSION_CONTROL_CONTRACT_KEY_ID), secret: false },
    MISSION_CONTROL_RESULT_KEY: { state: keyState(env?.MISSION_CONTROL_RESULT_KEY), secret: true },
    MISSION_CONTROL_RESULT_KEY_ID: { state: idState(env?.MISSION_CONTROL_RESULT_KEY_ID), secret: false },
    MISSION_CONTROL_RESULT_WORKER_ID: { state: idState(env?.MISSION_CONTROL_RESULT_WORKER_ID), secret: false },
    MISSION_CONTROL_WORKER_TOKEN: { state: tokenState(env?.MISSION_CONTROL_WORKER_TOKEN), secret: true },
  };
  for (const [name, entry] of Object.entries(bindings)) {
    if (!entry.secret && entry.state === 'present') entry.fingerprint = await fingerprint(env[name]);
    delete entry.secret;
  }
  // Key check values (one-way, role-separated) let the preflight prove the FWOMPS host holds the SAME key material
  // without either side revealing it. Only strong keys get one; a weak string cannot pass interoperability.
  const contract = strongHexKeyBytes(env?.MISSION_CONTROL_CONTRACT_KEY);
  if (bindings.MISSION_CONTROL_CONTRACT_KEY.state === 'present' && contract) bindings.MISSION_CONTROL_CONTRACT_KEY.kcv = await keyCheckValue(contract, 'contract');
  const result = strongHexKeyBytes(env?.MISSION_CONTROL_RESULT_KEY);
  if (bindings.MISSION_CONTROL_RESULT_KEY.state === 'present' && result) bindings.MISSION_CONTROL_RESULT_KEY.kcv = await keyCheckValue(result, 'result');
  const bearer = strongTokenBytes(env?.MISSION_CONTROL_WORKER_TOKEN);
  if (bindings.MISSION_CONTROL_WORKER_TOKEN.state === 'present' && bearer) bindings.MISSION_CONTROL_WORKER_TOKEN.kcv = await keyCheckValue(bearer, 'bearer');
  const unavailable = Object.entries(bindings).filter(([, e]) => e.state !== 'present').map(([name]) => name);
  return { bindings, unavailable };
}

/** Read-only: is a D1 binding present, reachable, and does it carry the Mission Control work-item table? */
export async function d1Readiness(env) {
  if (!env?.DB || typeof env.DB.prepare !== 'function') return { bound: false, reachable: false, workItemSchema: false };
  try {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'mc_work_items'").first();
    return { bound: true, reachable: true, workItemSchema: Number(row?.n) === 1 };
  } catch {
    return { bound: true, reachable: false, workItemSchema: false };
  }
}

export async function buildProvenanceReport(env, { requestUrl = CANONICAL_MC_ORIGIN, now = new Date() } = {}) {
  const release = await readRuntimeStamp(env, requestUrl);
  const { bindings, unavailable } = await bindingReadiness(env);
  const d1 = await d1Readiness(env);
  const blockers = [
    ...(release.state === 'stamped' ? [] : [`release stamp ${release.state}`]),
    ...unavailable.map((name) => `${name} unavailable`),
    ...(d1.reachable ? [] : ['D1 binding unavailable']),
    ...(d1.reachable && !d1.workItemSchema ? ['D1 work-item schema missing'] : []),
  ];
  return {
    schemaVersion: PROVENANCE_SCHEMA,
    runtime: { kind: RUNTIME_KIND, expectedProject: PAGES_PROJECT, servedHost: new URL(requestUrl).hostname },
    observedAt: now.toISOString(),
    release,
    protocol: {
      missionControlApi: MISSION_CONTROL_API_SCHEMA,
      investigationRequest: { schema: INVESTIGATION_SCHEMA, purpose: INVESTIGATION_PURPOSE },
      leaseGrant: { schema: LEASE_SCHEMA, purpose: LEASE_PURPOSE },
      investigationResult: { schema: RESULT_SCHEMA, purpose: RESULT_PURPOSE },
    },
    capabilities: {
      investigation: true,
      readOnly: true,
      repairAuthority: false,
      deployAuthority: false,
      writeAuthority: false,
      maxAttempts: 1,
    },
    bindings,
    d1,
    ready: blockers.length === 0,
    blockers,
  };
}
