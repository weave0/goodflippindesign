/**
 * Test helper: the durable authority a lease now requires.
 *
 * A lease needs a committed, eligible investigation_dispatch intent bound to the exact signed contract
 * digest, under a live claim. `authorizeDispatch` plans that intent for a work item that is
 * INVESTIGATION_READY (the API projection returned by /investigate) and claims it, returning the
 * request body the lease route requires: { effect_id, attempt }.
 */

import { claimDispatch, dispatchTarget, planEffect } from '../../workers/lib/mission-control-outbox.js';

export async function planDispatch(db, ready, { now = new Date().toISOString(), candidateDigest } = {}) {
  return planEffect(db, {
    workItemId: ready.workItemId,
    requestedLifecycleVersion: ready.lifecycleVersion,
    effectType: 'investigation_dispatch',
    target: dispatchTarget(ready.propertyId),
    candidateDigest: candidateDigest ?? ready.investigation.digest,
    payload: {
      summary: 'dispatch one bounded read-only investigation',
      propertyId: ready.propertyId,
      findingKey: ready.findingKey,
    },
    now,
  });
}

export async function authorizeDispatch(db, ready, options = {}) {
  const planned = await planDispatch(db, ready, options);
  const claimed = await claimDispatch(db, planned.effect.effectId, { now: options.now || new Date().toISOString() });
  if (!claimed.permit) throw new Error(`claim refused: ${claimed.reason}`);
  return {
    effectId: planned.effect.effectId,
    attempt: claimed.permit.attempt,
    body: { effect_id: planned.effect.effectId, attempt: claimed.permit.attempt },
  };
}
