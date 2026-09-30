/**
 * Constants of the effect/intent contract that both the outbox and the work-item store must agree on.
 * A leaf module (no imports) so the store can build its fixed lease-authority predicate from them
 * without depending on the outbox.
 */

export const EFFECT_SCHEMA_VERSION = 'gfd-effect-1';
export const DEFAULT_VISIBILITY_MS = 60_000;
export const DISPATCH_EFFECT_TYPE = 'investigation_dispatch';

/**
 * The columns the effect/intent contract adds to mc_effects. The work-item store's lease-authority predicate
 * reads them on every guarded write, so the STORE ensures them (ensureWorkItemSchema); the outbox reuses it.
 */
export const EFFECT_CONTRACT_COLUMNS = Object.freeze([
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
]);

/** The one canonical target of a dispatch intent. Anything else can never authorize a lease. */
export const dispatchTarget = (propertyId) => `fwomps:${propertyId}`;
