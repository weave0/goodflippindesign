/**
 * Transactional outbox for Mission Control consequences.
 *
 * A consequential intent is the effect row plus its causal event, written in
 * one D1 batch. D1 batch is a single transaction: a failed statement rolls
 * the batch back. The remote call happens later, in dispatchOnce, only after
 * that commit. Delivery is at-least-once. The attempt count is the fencing
 * token for a receipt; the effect id is the idempotency key. Nothing here
 * calls FWOMPS, GitHub, or a deploy API.
 */

import { deriveEffectId } from './mission-control-work-items.js';
import { ensureWorkItemSchema } from '../mission-control-work-items.js';

export const EFFECT_SCHEMA_VERSION = 'gfd-effect-1';
export const EFFECT_TYPES = Object.freeze([
  'investigation_dispatch',
  'github_issue',
  'pull_request',
  'deployment',
  'notification',
  'reverification_request',
]);
export const DEFAULT_VISIBILITY_MS = 60_000;
export const MAX_PAYLOAD_CHARS = 4096;

const FORBIDDEN_PAYLOAD_KEYS = new Set([
  'permitted_paths',
  'protected_paths',
  'repairAuthority',
  'repair_authority',
  'command',
  'argv',
  'shell',
  'credentials',
  'env',
  'environment',
  'promotion',
  'approval',
  'deployment_token',
  'secret',
  'password',
]);

const ADD_COLUMNS = [
  ['schema_version', 'TEXT'],
  ['requested_lifecycle_version', 'INTEGER'],
  ['payload_digest', 'TEXT'],
  ['payload_json', 'TEXT'],
  ['attempt_count', 'INTEGER NOT NULL DEFAULT 0'],
  ['last_attempt_at', 'TEXT'],
  ['idempotency_key', 'TEXT'],
  ['causal_event_id', 'TEXT'],
  ['receipt_ref', 'TEXT'],
  ['terminal_reason', 'TEXT'],
];

const textEncoder = new TextEncoder();

export class OutboxError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OutboxError';
    this.code = code;
  }
}

function compareUtf16(a, b) {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i += 1) {
    const diff = a.charCodeAt(i) - b.charCodeAt(i);
    if (diff !== 0) return diff;
  }
  return a.length - b.length;
}

function encode(value, path) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
      throw new OutboxError('malformed_payload', `payload numbers must be safe integers at ${path}`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => encode(item, `${path}[${index}]`)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort(compareUtf16);
    return `{${keys.map((key) => `${JSON.stringify(key)}:${encode(value[key], `${path}.${key}`)}`).join(',')}}`;
  }
  throw new OutboxError('malformed_payload', `unsupported payload value at ${path}`);
}

function scanForbidden(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(key)) {
      throw new OutboxError('forbidden_payload', `${path}.${key} cannot travel in an effect payload`);
    }
    scanForbidden(child, `${path}.${key}`);
  }
}

export function canonicalPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OutboxError('malformed_payload', 'effect payload must be an object');
  }
  scanForbidden(payload, 'payload');
  const text = encode(payload, 'payload');
  if (text.length > MAX_PAYLOAD_CHARS) {
    throw new OutboxError('malformed_payload', 'effect payload exceeds the outbox bound');
  }
  return text;
}

export async function digestPayload(canonical) {
  const bytes = await crypto.subtle.digest('SHA-256', textEncoder.encode(canonical));
  const hex = [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `sha256:${hex}`;
}

function requireText(value, name, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new OutboxError('malformed_effect', `${name} must be a non-empty string no longer than ${max} characters`);
  }
  return value;
}

function iso(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new OutboxError('malformed_timestamp', 'timestamp is not a valid instant');
  }
  return date.toISOString();
}

function present(row) {
  if (!row) return null;
  const schemaVersion = row.schema_version ?? null;
  const known = schemaVersion === EFFECT_SCHEMA_VERSION;
  const legacy = schemaVersion == null;
  return {
    schemaVersion,
    effectId: row.effect_id,
    workItemId: row.work_item_id,
    effectType: row.effect_type,
    target: row.target,
    candidateDigest: row.candidate_digest,
    status: row.status,
    requestedLifecycleVersion: row.requested_lifecycle_version,
    payloadDigest: row.payload_digest,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null,
    attemptCount: Number(row.attempt_count || 0),
    lastAttemptAt: row.last_attempt_at,
    idempotencyKey: row.idempotency_key,
    causalEventId: row.causal_event_id,
    providerRef: row.provider_ref,
    receiptRef: row.receipt_ref,
    terminalReason: row.terminal_reason,
    createdAt: row.created_at,
    committedAt: row.committed_at,
    legacy,
    dispatchable: known && row.status === 'PLANNED',
    contractAccepted: known || legacy,
  };
}

async function columnSet(db) {
  const { results } = await db.prepare('PRAGMA table_info(mc_effects)').all();
  return new Set((results || []).map((column) => column.name));
}

export async function ensureOutboxSchema(db) {
  await ensureWorkItemSchema(db);
  const existing = await columnSet(db);
  const pending = ADD_COLUMNS.filter(([name]) => !existing.has(name));
  if (pending.length) {
    await db.batch(pending.map(([name, type]) => db.prepare(`ALTER TABLE mc_effects ADD COLUMN ${name} ${type}`)));
  }
  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_mc_effects_dispatch
    ON mc_effects (status, last_attempt_at)
  `).run();
}

async function readWorkItem(db, workItemId) {
  const row = await db.prepare(`
    SELECT work_item_id, lifecycle_state, lifecycle_version, evidence_digest
    FROM mc_work_items WHERE work_item_id = ?
  `).bind(workItemId).first();
  if (!row) throw new OutboxError('not_found', 'work item was not found');
  return row;
}

async function readEffectRow(db, effectId) {
  return db.prepare('SELECT * FROM mc_effects WHERE effect_id = ?').bind(effectId).first();
}

function sameIntent(existing, proposed) {
  return existing.payload_digest === proposed.payloadDigest
    && existing.effect_type === proposed.effectType
    && existing.target === proposed.target
    && (existing.candidate_digest ?? null) === (proposed.candidateDigest ?? null)
    && existing.work_item_id === proposed.workItemId
    && existing.idempotency_key === proposed.effectId;
}

export async function planEffect(db, input) {
  await ensureOutboxSchema(db);
  const workItemId = requireText(input?.workItemId, 'workItemId', 96);
  if (!Number.isInteger(input?.requestedLifecycleVersion) || input.requestedLifecycleVersion < 1) {
    throw new OutboxError('malformed_effect', 'requestedLifecycleVersion must be a positive integer');
  }
  if (!EFFECT_TYPES.includes(input?.effectType)) {
    throw new OutboxError('unknown_effect_type', 'effect type is outside the outbox contract');
  }
  const target = requireText(input?.target, 'target', 512);
  const candidateDigest = input?.candidateDigest ?? null;
  if (candidateDigest != null && !/^sha256:[0-9a-f]{64}$/.test(candidateDigest)) {
    throw new OutboxError('malformed_effect', 'candidateDigest must be sha256:<64 lowercase hex>');
  }
  const canonical = canonicalPayload(input.payload);
  const payloadDigest = await digestPayload(canonical);
  const effectId = await deriveEffectId({
    workItemId,
    effectType: input.effectType,
    target,
    candidateDigest,
  });
  const existing = await readEffectRow(db, effectId);
  const proposed = {
    effectId,
    workItemId,
    effectType: input.effectType,
    target,
    candidateDigest,
    payloadDigest,
  };
  if (existing) {
    if (!sameIntent(existing, proposed)) {
      throw new OutboxError('effect_conflict', 'this consequence id is already bound to a different intent');
    }
    return { effect: present(existing), created: false };
  }

  const workItem = await readWorkItem(db, workItemId);
  if (Number(workItem.lifecycle_version) !== input.requestedLifecycleVersion) {
    throw new OutboxError('stale_version', 'effect plan does not match the work item lifecycle version');
  }
  const now = iso(input.now || new Date());
  const causalEventId = `evt_${effectId}_intent`;
  const detail = JSON.stringify({
    effectId,
    effectType: input.effectType,
    payloadDigest,
    requestedLifecycleVersion: input.requestedLifecycleVersion,
    schemaVersion: EFFECT_SCHEMA_VERSION,
  });
  try {
    await db.batch([
      db.prepare(`
        INSERT INTO mc_work_item_events (
          event_id, work_item_id, event_type, from_state, to_state, occurred_at,
          actor_type, actor_id, evidence_digest, detail_json
        ) VALUES (?, ?, 'effect_intent', ?, ?, ?, 'outbox', 'mission-control', ?, ?)
      `).bind(
        causalEventId,
        workItemId,
        workItem.lifecycle_state,
        workItem.lifecycle_state,
        now,
        workItem.evidence_digest,
        detail,
      ),
      db.prepare(`
        INSERT INTO mc_effects (
          effect_id, work_item_id, effect_type, target, candidate_digest, status,
          provider_ref, created_at, committed_at, verified_at, last_error,
          schema_version, requested_lifecycle_version, payload_digest, payload_json,
          attempt_count, last_attempt_at, idempotency_key, causal_event_id,
          receipt_ref, terminal_reason
        ) VALUES (?, ?, ?, ?, ?, 'PLANNED', NULL, ?, NULL, NULL, NULL, ?, ?, ?, ?, 0, NULL, ?, ?, NULL, NULL)
      `).bind(
        effectId,
        workItemId,
        input.effectType,
        target,
        candidateDigest,
        now,
        EFFECT_SCHEMA_VERSION,
        input.requestedLifecycleVersion,
        payloadDigest,
        canonical,
        effectId,
        causalEventId,
      ),
    ]);
  } catch (error) {
    const raced = await readEffectRow(db, effectId);
    if (raced && sameIntent(raced, proposed)) return { effect: present(raced), created: false };
    if (raced) throw new OutboxError('effect_conflict', 'this consequence id is already bound to a different intent');
    throw error;
  }
  return { effect: present(await readEffectRow(db, effectId)), created: true };
}

function assertDispatchContract(effect) {
  if (!effect) throw new OutboxError('not_found', 'effect was not found');
  if (effect.legacy || effect.schemaVersion == null) {
    throw new OutboxError('legacy_effect', 'a pre-contract effect row cannot be dispatched');
  }
  if (effect.schemaVersion !== EFFECT_SCHEMA_VERSION) {
    throw new OutboxError('unknown_schema', `unsupported effect schema ${effect.schemaVersion}`);
  }
}

export async function claimDispatch(db, effectId, options = {}) {
  await ensureOutboxSchema(db);
  const effect = present(await readEffectRow(db, effectId));
  assertDispatchContract(effect);
  if (effect.status === 'COMMITTED' || effect.status === 'VERIFIED' || effect.status === 'FAILED') {
    return { permit: null, reason: 'terminal', effect };
  }
  const workItem = await readWorkItem(db, effect.workItemId);
  if (Number(workItem.lifecycle_version) !== effect.requestedLifecycleVersion) {
    return { permit: null, reason: 'stale_lifecycle', effect };
  }
  const now = iso(options.now || new Date());
  const visibilityMs = Number.isInteger(options.visibilityMs) ? options.visibilityMs : DEFAULT_VISIBILITY_MS;
  const visibleBefore = new Date(Date.parse(now) - visibilityMs).toISOString();
  if (effect.lastAttemptAt && effect.lastAttemptAt > visibleBefore) {
    return { permit: null, reason: 'in_flight', effect };
  }
  const claimed = await db.prepare(`
    UPDATE mc_effects
    SET attempt_count = attempt_count + 1, last_attempt_at = ?
    WHERE effect_id = ?
      AND status = 'PLANNED'
      AND schema_version = ?
      AND attempt_count = ?
      AND (last_attempt_at IS NULL OR last_attempt_at <= ?)
  `).bind(now, effect.effectId, EFFECT_SCHEMA_VERSION, effect.attemptCount, visibleBefore).run();
  if (!claimed?.meta?.changes) {
    return { permit: null, reason: 'in_flight', effect: present(await readEffectRow(db, effectId)) };
  }
  const next = present(await readEffectRow(db, effectId));
  return {
    permit: {
      effectId: next.effectId,
      attempt: next.attemptCount,
      effectType: next.effectType,
      target: next.target,
      payloadDigest: next.payloadDigest,
      payload: next.payload,
      delivery: 'at-least-once',
    },
    reason: 'claimed',
    effect: next,
  };
}

export async function recordReceipt(db, effectId, receipt) {
  await ensureOutboxSchema(db);
  const effect = present(await readEffectRow(db, effectId));
  assertDispatchContract(effect);
  if (!Number.isInteger(receipt?.attempt) || receipt.attempt < 1) {
    throw new OutboxError('stale_attempt', 'receipt attempt is not a fencing token');
  }
  if (receipt.outcome !== 'committed' && receipt.outcome !== 'failed') {
    throw new OutboxError('malformed_receipt', 'receipt outcome must be committed or failed');
  }
  const receiptRef = receipt.outcome === 'committed' ? requireText(receipt.receipt, 'receipt', 512) : null;
  const terminalReason = receipt.outcome === 'failed' ? requireText(receipt.reason, 'reason', 512) : null;
  if (effect.status === 'COMMITTED' || effect.status === 'VERIFIED') {
    if (effect.receiptRef === receiptRef && receipt.outcome === 'committed') return { effect, created: false };
    throw new OutboxError('receipt_conflict', 'a different receipt is already recorded for this effect');
  }
  if (effect.status === 'FAILED') {
    if (effect.terminalReason === terminalReason && receipt.outcome === 'failed') return { effect, created: false };
    throw new OutboxError('receipt_conflict', 'a different terminal failure is already recorded for this effect');
  }
  if (effect.attemptCount !== receipt.attempt) {
    throw new OutboxError('stale_attempt', 'receipt attempt does not match the current fence');
  }
  const now = iso(receipt.now || new Date());
  const status = receipt.outcome === 'committed' ? 'COMMITTED' : 'FAILED';
  const written = await db.prepare(`
    UPDATE mc_effects
    SET status = ?, provider_ref = ?, receipt_ref = ?, terminal_reason = ?,
        last_error = ?, committed_at = ?
    WHERE effect_id = ? AND status = 'PLANNED' AND attempt_count = ? AND schema_version = ?
  `).bind(
    status,
    receiptRef,
    receiptRef,
    terminalReason,
    terminalReason,
    now,
    effect.effectId,
    receipt.attempt,
    EFFECT_SCHEMA_VERSION,
  ).run();
  if (!written?.meta?.changes) {
    const current = present(await readEffectRow(db, effectId));
    if (current.status === status && current.receiptRef === receiptRef && current.terminalReason === terminalReason) {
      return { effect: current, created: false };
    }
    throw new OutboxError('stale_attempt', 'receipt lost the fence while it was being recorded');
  }
  return { effect: present(await readEffectRow(db, effectId)), created: true };
}

export async function abandonEffect(db, effectId, reason, now = new Date()) {
  await ensureOutboxSchema(db);
  const effect = present(await readEffectRow(db, effectId));
  assertDispatchContract(effect);
  const terminalReason = requireText(reason, 'reason', 512);
  if (effect.status === 'FAILED' && effect.terminalReason === terminalReason) return { effect, created: false };
  if (effect.status !== 'PLANNED') {
    throw new OutboxError('terminal', 'only a planned effect can be abandoned');
  }
  const at = iso(now);
  const eventId = `evt_${effect.effectId}_abandoned_${effect.attemptCount}`;
  const detail = JSON.stringify({
    effectId: effect.effectId,
    terminalReason,
    schemaVersion: EFFECT_SCHEMA_VERSION,
  });
  await db.batch([
    db.prepare(`
      INSERT INTO mc_work_item_events (
        event_id, work_item_id, event_type, from_state, to_state, occurred_at,
        actor_type, actor_id, evidence_digest, detail_json
      )
      SELECT ?, work_item_id, 'effect_abandoned', lifecycle_state, lifecycle_state, ?, 'outbox', 'mission-control', evidence_digest, ?
      FROM mc_work_items
      WHERE work_item_id = ?
        AND EXISTS (
          SELECT 1 FROM mc_effects
          WHERE effect_id = ? AND status = 'PLANNED' AND schema_version = ?
        )
    `).bind(eventId, at, detail, effect.workItemId, effect.effectId, EFFECT_SCHEMA_VERSION),
    db.prepare(`
      UPDATE mc_effects
      SET status = 'FAILED', terminal_reason = ?, last_error = ?, committed_at = ?
      WHERE effect_id = ? AND status = 'PLANNED' AND schema_version = ?
    `).bind(terminalReason, terminalReason, at, effect.effectId, EFFECT_SCHEMA_VERSION),
  ]);
  const current = present(await readEffectRow(db, effectId));
  if (current.status !== 'FAILED' || current.terminalReason !== terminalReason) {
    throw new OutboxError('in_flight', 'effect changed before it could be abandoned');
  }
  return { effect: current, created: true };
}

export async function dispatchOnce(db, effectId, executor, options = {}) {
  if (typeof executor !== 'function') {
    throw new OutboxError('executor_required', 'dispatch requires an injected executor');
  }
  const claim = await claimDispatch(db, effectId, options);
  if (!claim.permit) return { dispatched: false, reason: claim.reason, effect: claim.effect };
  let outcome;
  try {
    outcome = await executor(claim.permit);
  } catch {
    return { dispatched: false, reason: 'executor_failed', attempt: claim.permit.attempt, effect: claim.effect };
  }
  const recorded = await recordReceipt(db, effectId, {
    attempt: claim.permit.attempt,
    outcome: outcome?.outcome,
    receipt: outcome?.receipt,
    reason: outcome?.reason,
    now: options.now,
  });
  return { dispatched: true, effect: recorded.effect };
}

export async function loadEffect(db, effectId) {
  await ensureOutboxSchema(db);
  const effect = present(await readEffectRow(db, effectId));
  if (!effect) throw new OutboxError('not_found', 'effect was not found');
  if (!effect.contractAccepted) {
    throw new OutboxError('unknown_schema', `unsupported effect schema ${effect.schemaVersion}`);
  }
  return effect;
}
