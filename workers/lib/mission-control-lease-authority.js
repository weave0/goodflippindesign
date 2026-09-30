/**
 * Lease authority: no signed lease exists unless durable prior intent authority can be proven.
 *
 * A lease is the only thing that lets FWOMPS act on a work item. It may be issued only under a
 * committed `investigation_dispatch` effect in the outbox that is, all at once:
 *
 *   - known schema (gfd-effect-1): legacy or unknown rows cannot prove eligibility, so they fail closed;
 *   - of type investigation_dispatch, for THIS canonical work item and its canonical target
 *     (`fwomps:<propertyId>`);
 *   - still PLANNED: abandoned/failed/committed/verified intents are consumed or dead;
 *   - bound to the exact signed investigation contract: `candidate_digest` === the contract digest
 *     (the effect id is derived from it, so a legitimate retry after abandonment carries a new
 *     contract digest, hence a new effect id, and never collides with the abandoned one);
 *   - fenced to the work item's current lifecycle version (a transition since planning makes it stale,
 *     and the lease itself advances the version, so one intent authorizes at most one lease);
 *   - under a live claim: the caller presents the claim's attempt (the outbox fence token), it must
 *     equal the effect's current attempt_count, and the claim must still be inside its visibility
 *     window, so a stale claimant cannot lease.
 *
 * `resolveLeaseAuthority` explains a refusal precisely at request time. The AUTHORITATIVE decision is
 * the store's: it re-evaluates a fixed predicate inside the write itself, against the database clock, so an
 * intent abandoned, consumed or expired between this check and the write still fails closed. Nothing here executes anything: GFD records and
 * authorizes intent; FWOMPS remains the isolated read-only executor.
 */

import { WorkItemError } from '../mission-control-work-items.js';
import {
  DEFAULT_VISIBILITY_MS,
  DISPATCH_EFFECT_TYPE,
  EFFECT_SCHEMA_VERSION,
  dispatchTarget,
} from './mission-control-effect-contract.js';

const DIGEST = /^sha256:[0-9a-f]{64}$/;

function refuse(reason, code = 'dispatch_intent_ineligible') {
  return new WorkItemError(code, `dispatch intent is not eligible: ${reason}`, 409);
}

function parseRequest(body) {
  const keys = Object.keys(body || {});
  if (keys.some((key) => key !== 'effect_id' && key !== 'attempt')) {
    throw new WorkItemError('malformed_lease', 'The worker does not choose lease identity or authority', 400);
  }
  if (typeof body?.effect_id !== 'string' || !body.effect_id.trim() || !Number.isInteger(body?.attempt) || body.attempt < 1) {
    throw new WorkItemError(
      'dispatch_intent_required',
      'A lease requires the committed investigation_dispatch intent (effect_id) and its claimed attempt',
      409,
    );
  }
  return { effectId: body.effect_id, attempt: body.attempt };
}

/**
 * Proves lease authority for `item` from durable state, or throws a precise, fail-closed refusal.
 * Returns the guard to hand to store.save so the same predicate holds atomically with the write.
 */
export async function resolveLeaseAuthority(db, item, body, at) {
  const { effectId, attempt } = parseRequest(body);
  const contractDigest = item.investigation?.digest;
  if (!DIGEST.test(contractDigest || '')) {
    throw new WorkItemError('unsigned_contract', 'Investigation contract is not available to lease', 409);
  }
  const row = await db.prepare('SELECT * FROM mc_effects WHERE effect_id = ?').bind(effectId).first();
  if (!row) throw new WorkItemError('dispatch_intent_required', 'No such dispatch intent is recorded', 409);

  const target = dispatchTarget(item.propertyId);
  const visibleAfter = new Date(Date.parse(at) - DEFAULT_VISIBILITY_MS).toISOString();
  if (row.work_item_id !== item.workItemId) throw refuse('it belongs to a different work item');
  if (row.effect_type !== DISPATCH_EFFECT_TYPE) throw refuse('it is not an investigation_dispatch intent');
  if (row.schema_version !== EFFECT_SCHEMA_VERSION) throw refuse('its schema is unknown or pre-contract, so eligibility cannot be proven');
  if (row.status === 'FAILED') throw refuse('it was abandoned or failed');
  if (row.status !== 'PLANNED') throw refuse('it is already consumed');
  if (row.target !== target) throw refuse('its target is not the canonical dispatch target');
  if (row.candidate_digest !== contractDigest) throw refuse('it is not bound to this signed contract digest');
  if (Number(row.requested_lifecycle_version) !== Number(item.lifecycleVersion)) throw refuse('it is stale for the current lifecycle version');
  if (Number(row.attempt_count) < 1 || !row.last_attempt_at) throw refuse('it has not been claimed for dispatch');
  if (Number(row.attempt_count) !== attempt) throw refuse('the presented attempt is not the current claim');
  if (row.last_attempt_at <= visibleAfter) throw refuse('its claim expired');

  // Typed, inert identity only. The store itself builds and evaluates the fixed authority predicate at
  // write time (workers/mission-control-work-items.js, LEASE_AUTHORITY_PREDICATE); this module supplies no SQL.
  return { effectId, attempt, contractDigest };
}
