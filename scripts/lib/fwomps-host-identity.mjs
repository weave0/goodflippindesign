/**
 * Read-only reader for the FWOMPS host's Mission Control identity.
 *
 * The production gate must not go GREEN unless the real host can actually SIGN the result it claims it can
 * produce. config.json naming a worker key id is a claim; the proof is an enrolled key file at the canonical path
 *   <FWOMPS_HOME>/mission-control/worker-keys/<worker_key_id>.json
 * whose content has the shape fwomps.mission_control.keys.WorkerKeyStore writes:
 *   { key_id, worker_id, secret_hex, created_at, revoked }
 * and likewise a contract-key file for the key that verifies GFD's signed contracts and lease grants.
 *
 * This module READS key files to validate their structure and NEVER returns, logs or throws key material:
 * the result carries booleans, non-secret ids and problem codes only.
 */

import { createHmac } from 'node:crypto';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { KCV_LABEL_PREFIX } from '../../workers/lib/key-check-value.js';

// Mirrors fwomps.mission_control.keys._validate_id: 1-64 chars of [A-Za-z0-9_-].
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SECRET_HEX = /^[0-9a-fA-F]{64}$/; // 32 bytes: what GFD's 64-hex key bytes and the HMAC contract use

/** node:crypto twin of workers/lib/key-check-value.js (identical output, tested): HMAC-SHA256(key, label) truncated to 8 bytes. */
export function kcvFromBytes(keyBytes, role) {
  return `kcv:${createHmac('sha256', keyBytes).update(`${KCV_LABEL_PREFIX}${role}`).digest('hex').slice(0, 16)}`;
}
const BEARER_ENV = /^[A-Z][A-Z0-9_]{0,63}$/;

export const isValidKeyId = (value) => typeof value === 'string' && KEY_ID.test(value);

/** Pure structural judgement of one parsed key file. Returns problem codes only (never values). */
export function judgeKeyRecord(record, { keyId, workerId = null, kind }) {
  const problems = [];
  if (!record || typeof record !== 'object' || Array.isArray(record)) return ['not_an_object'];
  if (record.key_id !== keyId) problems.push('key_id_mismatch');
  if (kind === 'worker') {
    if (typeof record.worker_id !== 'string' || !record.worker_id) problems.push('worker_id_missing');
    else if (workerId && record.worker_id !== workerId) problems.push('worker_id_mismatch');
  }
  if (typeof record.secret_hex !== 'string' || !SECRET_HEX.test(record.secret_hex)) problems.push('secret_malformed');
  if (typeof record.created_at !== 'string' || !Number.isFinite(Date.parse(record.created_at))) problems.push('created_at_malformed');
  if (record.revoked !== false) problems.push(record.revoked === true ? 'revoked' : 'revoked_flag_malformed');
  return problems;
}

/** Reads one canonical key file. Never returns file content. */
function inspectKeyFile(dir, keyId, expect) {
  if (!isValidKeyId(keyId)) return { enrolled: false, problems: ['key_id_invalid'] };
  const file = path.join(dir, `${keyId}.json`);
  let stat;
  try { stat = lstatSync(file); } catch { return { enrolled: false, problems: ['file_absent'] }; }
  if (!stat.isFile() || stat.isSymbolicLink()) return { enrolled: false, problems: ['not_a_regular_file'] };
  if (stat.size > 4096) return { enrolled: false, problems: ['file_too_large'] };
  let record;
  try { record = JSON.parse(readFileSync(file, 'utf8')); } catch { return { enrolled: false, problems: ['unreadable_or_malformed_json'] }; }
  const problems = judgeKeyRecord(record, { keyId, ...expect });
  if (problems.length) return { enrolled: false, problems };
  // In-memory comparison value only (a one-way commitment, never the key). The preflight evidence records a boolean.
  return { enrolled: true, problems, kcv: kcvFromBytes(Buffer.from(record.secret_hex, 'hex'), expect.kind === 'worker' ? 'result' : 'contract') };
}

/**
 * @param home FWOMPS home directory
 * @returns null when the host config cannot be read; otherwise non-secret facts. Every contract key file on the
 *   host is inspected (the runtime reports only a fingerprint of its contract key id, so the gate selects the match).
 */
export function readHostIdentity(home) {
  if (!home) return null;
  let mc;
  try { mc = JSON.parse(readFileSync(path.join(home, 'config.json'), 'utf8')).mission_control || {}; } catch { return null; }
  const store = path.join(home, 'mission-control');
  const workerId = typeof mc.worker_id === 'string' && mc.worker_id ? mc.worker_id : null;
  const workerKeyId = typeof mc.worker_key_id === 'string' && mc.worker_key_id ? mc.worker_key_id : null;

  const workerKey = workerKeyId
    ? { keyId: workerKeyId, ...inspectKeyFile(path.join(store, 'worker-keys'), workerKeyId, { kind: 'worker', workerId }) }
    : { keyId: null, enrolled: false, problems: ['worker_key_id_not_configured'] };

  const contractDir = path.join(store, 'contract-keys');
  let stems = [];
  try { stems = readdirSync(contractDir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)); } catch { /* none enrolled */ }
  const contractKeys = stems.filter(isValidKeyId).map((keyId) => ({ keyId, ...inspectKeyFile(contractDir, keyId, { kind: 'contract' }) }));

  const bearerEnv = typeof mc.delivery?.bearer_env === 'string' && BEARER_ENV.test(mc.delivery.bearer_env) ? mc.delivery.bearer_env : null;
  return { workerId, workerKeyId, workerKey, contractKeys, bearerEnv };
}
