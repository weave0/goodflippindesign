/**
 * Decides, from the canary item as the runner sees it, whether a canary run may start. Decided BEFORE any observation is
 * posted, because a degraded observation can itself change an existing item (a diagnosed item records a failed
 * reverification). Only states the bounded runner can legitimately advance are accepted; everything else needs an
 * authority the runner is deliberately denied (lease expiry / dispatch recovery are admin-only), and is refused with
 * the exact reason instead of mutating production and failing half way.
 *
 *   none                  fresh run
 *   OBSERVED              proceed (qualify first)
 *   RECURRENT, RESOLVED   proceed: a new degraded observation reopens it as RECURRENT, then qualify
 *   QUALIFIED             proceed, skipping the (illegal) qualify transition
 *   anything else         refuse
 */

export const RUNNABLE_STATES = Object.freeze({
  OBSERVED: 'qualify',
  RECURRENT: 'qualify',
  RESOLVED: 'qualify',
  QUALIFIED: 'skip-qualify',
});

const safe = (value) => String(value ?? '').replace(/[^\w:.-]/g, '').slice(0, 60);

/** @param items the runner's work-item list (already restricted to canary-eligible items)
 *  @param options.closePrevious explicit opt-in: a DIAGNOSED item (a previous cycle that already produced its diagnosis) is first
 *         taken to RESOLVED by a strictly newer healthy observation, the ordinary reverification the lifecycle defines, which the
 *         runner is allowed to post. The next degraded observation then reopens it as RECURRENT for a clean cycle. */
export function classifyCanaryItems(items, { closePrevious = false } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return { run: true, action: 'qualify', state: null, reason: 'no canary item exists yet' };
  if (list.length > 1) return { run: false, action: 'refuse', state: null, reason: `${list.length} canary items exist; exactly one is allowed, refusing without changing anything` };
  const [item] = list;
  const state = safe(item?.state);
  if (Object.hasOwn(RUNNABLE_STATES, state)) return { run: true, action: RUNNABLE_STATES[state], state, reason: `the canary item is ${state}` };
  if (state === 'INVESTIGATING') {
    const expires = safe(item?.activeLease?.expiresAt);
    return {
      run: false, action: 'refuse', state,
      reason: `the canary item is INVESTIGATING (a previous run ended mid-flight${expires ? `; its lease expires at ${expires}` : ''}). The bounded runner cannot recover it: a human admin must POST /work-items/<id>/expire after the lease has expired, which returns it to QUALIFIED. Refusing before any mutation.`,
    };
  }
  if (state === 'INVESTIGATION_READY') {
    return { run: false, action: 'refuse', state, reason: 'the canary item holds an issued contract that was never leased; recovering it (recover-dispatch) is admin-only. Refusing before any mutation.' };
  }
  if (state === 'DIAGNOSED' && closePrevious) {
    return { run: true, action: 'close-previous', state, reason: 'the canary item is DIAGNOSED by a previous cycle; it will be reverified to RESOLVED first (explicit --close-previous), then reopened by a fresh degraded observation' };
  }
  if (state === 'DIAGNOSED' || state === 'REVERIFYING') {
    return { run: false, action: 'refuse', state, reason: `the canary item is already ${state}: a previous run produced the diagnosis. This driver runs the whole specimen once and cannot resume mid-lifecycle${state === 'DIAGNOSED' ? '; pass --close-previous to reverify that earlier cycle to RESOLVED first and run a clean new cycle' : ''}. Refusing before any mutation.` };
  }
  return { run: false, action: 'refuse', state, reason: `the canary item is in state ${state || 'unknown'}, which this driver does not advance. Refusing before any mutation.` };
}
