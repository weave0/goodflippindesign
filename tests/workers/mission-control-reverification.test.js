/**
 * Confluence-2 (#371): the pure reverification decision. A healthy production observation is weighed
 * against an existing work item by exactly one function; these tests pin every fence it owns.
 * The D1/API-shaped hostile loop lives in mission-control-confluence.test.js.
 */

import { describe, expect, it } from 'vitest';

import {
  applyObservation,
  createObservedWorkItem,
  reverifyWorkItem,
  transitionWorkItem,
} from '../../workers/lib/mission-control-work-items.js';

const D = (n) => `sha256:${String(n).repeat(64).slice(0, 64)}`;
const IDENTITY = { producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: 'health:aiaimate:machine_contract_mismatch' };
const t = (minute) => `2026-10-01T10:${String(minute).padStart(2, '0')}:00.000Z`;

async function diagnosedItem() {
  let item = await createObservedWorkItem({ ...IDENTITY, observedAt: t(0), evidenceDigest: D(1) });
  item = transitionWorkItem(item, 'QUALIFIED', {
    repository: 'weave0/aiaimate',
    investigationProfile: 'web-health-readonly-v1',
    verificationProfile: 'gfd-property-health-production',
    verificationScope: 'production',
    verificationPredicate: 'aiaimate.com /api/health reports gfd-property-health status ok',
  });
  item = transitionWorkItem(item, 'INVESTIGATION_READY');
  item = { ...item, state: 'INVESTIGATING', activeLease: { leaseId: 'sha256:' + 'a'.repeat(64), workerId: 'w', expiresAt: t(59) } };
  item = { ...item, activeLease: null };
  return transitionWorkItem(item, 'DIAGNOSED', { diagnosis: { resultDigest: D(2), signatureRef: 'sig:1' } });
}
const healthy = (minute, digest = D(3), extra = {}) => ({ ...IDENTITY, observedAt: t(minute), evidenceDigest: digest, ...extra });

describe('reverifyWorkItem', () => {
  it('resolves a diagnosed item only on strictly fresher evidence, through REVERIFYING', async () => {
    const item = await diagnosedItem();
    const { item: next, verdict } = reverifyWorkItem(item, healthy(10), { since: t(5) });
    expect(verdict.result).toBe('resolved');
    expect(next).toMatchObject({ state: 'RESOLVED', resolvedAt: t(10), resolutionEvidenceDigest: D(3), workItemId: item.workItemId });
    expect(next.diagnosis).toEqual(item.diagnosis);
    expect(next.lifecycleVersion).toBeGreaterThan(item.lifecycleVersion);
  });

  it('refuses stale evidence: before, at, or equal to the failing evidence, the state entry, or a prior verdict', async () => {
    const item = await diagnosedItem();
    for (const [minute, options, label] of [
      [0, { since: t(5) }, 'at the first failing observation'],
      [4, { since: t(5) }, 'before the diagnosis'],
      [5, { since: t(5) }, 'at the diagnosis instant'],
      [8, { since: t(5), latest: { observedAt: t(8), evidenceDigest: D(9) } }, 'at a prior verdict'],
      [7, { since: t(5), latest: { observedAt: t(8), evidenceDigest: D(9) } }, 'before a prior verdict'],
    ]) {
      const { item: next, verdict } = reverifyWorkItem(item, healthy(minute), options);
      expect({ label, result: verdict.result }).toEqual({ label, result: 'stale' });
      expect(next).toBe(item);
    }
    const failing = applyObservation(item, { ...IDENTITY, observedAt: t(20), evidenceDigest: D(4) });
    expect(reverifyWorkItem(failing, healthy(20, D(5)), { since: t(5) }).verdict.result).toBe('stale');
    expect(reverifyWorkItem(failing, healthy(19, D(5)), { since: t(5) }).verdict.result).toBe('stale');
    expect(reverifyWorkItem(failing, healthy(21, D(5)), { since: t(5) }).verdict.result).toBe('resolved');
  });

  it('labels an exact replay of already weighed evidence as replayed and never resolves it again', async () => {
    const item = await diagnosedItem();
    const latest = { observedAt: t(8), evidenceDigest: D(7), result: 'still_failing' };
    const { item: next, verdict } = reverifyWorkItem(item, healthy(30, D(7)), { since: t(5), latest });
    expect(verdict.result).toBe('replayed');
    expect(next).toBe(item);
  });

  it('is idempotent once resolved and leaves terminal items alone', async () => {
    const item = await diagnosedItem();
    const { item: resolved } = reverifyWorkItem(item, healthy(10), { since: t(5) });
    for (const minute of [10, 11, 50]) {
      const { item: next, verdict } = reverifyWorkItem(resolved, healthy(minute, D(6)), { since: t(5) });
      expect(verdict.result).toBe('already_resolved');
      expect(next).toBe(resolved);
    }
    const dismissed = { ...item, state: 'DISMISSED' };
    expect(reverifyWorkItem(dismissed, healthy(10), {}).verdict.result).toBe('terminal');
  });

  it('never resolves an item that has no diagnosis, owns an investigation, or is blocked', async () => {
    const item = await diagnosedItem();
    const investigating = { ...item, state: 'INVESTIGATING', activeLease: { leaseId: 'x', workerId: 'w', expiresAt: t(59) } };
    expect(reverifyWorkItem(investigating, healthy(10), {}).verdict.result).toBe('deferred');
    expect(reverifyWorkItem(investigating, healthy(10), {}).item).toBe(investigating);
    const blocked = transitionWorkItem(item, 'NEEDS_HUMAN', { reason: 'hold' });
    expect(reverifyWorkItem(blocked, healthy(10), {}).verdict.result).toBe('blocked');
    const observed = await createObservedWorkItem({ ...IDENTITY, observedAt: t(0), evidenceDigest: D(1) });
    expect(reverifyWorkItem(observed, healthy(10), {}).verdict.result).toBe('not_diagnosed');
  });

  it('cannot verify an item without a registered predicate', async () => {
    const item = { ...(await diagnosedItem()), verificationPredicate: null };
    const { item: next, verdict } = reverifyWorkItem(item, healthy(10), { since: t(5) });
    expect(verdict.result).toBe('unresolvable');
    expect(next).toBe(item);
  });

  it('rejects evidence for a different property or finding: identity is exact', async () => {
    const item = await diagnosedItem();
    expect(() => reverifyWorkItem(item, healthy(10, D(3), { propertyId: 'globaldeets.com' }), {})).toThrow(/identity/);
    expect(() => reverifyWorkItem(item, healthy(10, D(3), { findingKey: 'health:aiaimate:timeout' }), {})).toThrow(/identity/);
    expect(() => reverifyWorkItem(item, healthy(10, D(3), { producer: 'other' }), {})).toThrow(/identity/);
  });

  it('refuses a resolution that is not strictly newer than the last failing observation (state machine fence)', async () => {
    const item = await diagnosedItem();
    const reverifying = transitionWorkItem(item, 'REVERIFYING');
    const verification = {
      result: 'pass', scope: 'production', profile: 'gfd-property-health-production',
      predicate: item.verificationPredicate, evidenceDigest: D(3), observedAt: item.lastSeen,
    };
    expect(() => transitionWorkItem(reverifying, 'RESOLVED', { resolutionVerification: verification })).toThrow(/strictly newer/);
    expect(() => transitionWorkItem(item, 'RESOLVED', { resolutionVerification: { ...verification, observedAt: t(9) } })).toThrow(/invalid lifecycle transition/);
  });

  it('a recurrence keeps the lineage and starts a fresh cycle', async () => {
    const item = await diagnosedItem();
    const { item: resolved } = reverifyWorkItem(item, healthy(10), { since: t(5) });
    const stale = applyObservation(resolved, { ...IDENTITY, observedAt: t(9), evidenceDigest: D(8) });
    expect(stale.state).toBe('RESOLVED');
    const recurrent = applyObservation(resolved, { ...IDENTITY, observedAt: t(40), evidenceDigest: D(8) });
    expect(recurrent).toMatchObject({
      state: 'RECURRENT', recurrenceCount: 1, workItemId: item.workItemId, firstSeen: item.firstSeen, diagnosis: null, resolvedAt: null,
    });
  });

  it('equal-time degraded evidence invalidates a same-instant resolution regardless of writer order', async () => {
    const item = await diagnosedItem();

    // Healthy writer wins first: the equal-time degraded writer must reopen the lineage.
    const { item: resolved } = reverifyWorkItem(item, healthy(10, D(3)), { since: t(5) });
    const degradedSameInstant = { ...IDENTITY, observedAt: t(10), evidenceDigest: D(8) };
    const recurrent = applyObservation(resolved, degradedSameInstant);
    expect(recurrent).toMatchObject({
      state: 'RECURRENT',
      recurrenceCount: 1,
      resolvedAt: null,
      resolutionEvidenceDigest: null,
      diagnosis: null,
    });

    // Degraded writer wins first: a healthy observation at that same instant is stale by the strict freshness fence.
    const failingFirst = applyObservation(item, degradedSameInstant);
    const retriedHealthy = reverifyWorkItem(failingFirst, healthy(10, D(9)), { since: t(5) });
    expect(retriedHealthy.verdict.result).toBe('stale');
    expect(retriedHealthy.item.state).toBe('DIAGNOSED');
  });
});
