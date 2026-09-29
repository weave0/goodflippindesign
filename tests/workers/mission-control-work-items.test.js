import { describe, expect, it } from 'vitest';
import {
  applyObservation,
  claimLease,
  createObservedWorkItem,
  deriveEffectId,
  deriveWorkItemId,
  registerEffect,
  releaseLease,
  transitionWorkItem,
} from '../../workers/lib/mission-control-work-items.js';

const D1 = 'sha256:' + '11'.repeat(32);
const D2 = 'sha256:' + '22'.repeat(32);
const D3 = 'sha256:' + '33'.repeat(32);
const D4 = 'sha256:' + '44'.repeat(32);

const observation = (overrides = {}) => ({
  producer: 'health-sweep',
  propertyId: 'aiaimate.com',
  findingKey: 'health:aiaimate:machine_contract_mismatch',
  observedAt: '2026-09-29T10:00:00.000Z',
  evidenceDigest: D1,
  evidenceRevision: 'sweep-001',
  severity: 'warning',
  confidence: 1,
  ...overrides,
});

async function observed(overrides = {}) {
  return createObservedWorkItem(observation(overrides));
}

function qualify(item) {
  return transitionWorkItem(item, 'QUALIFIED', {
    repository: 'weave0/aiaimate',
    investigationProfile: 'aiaimate-health-readonly-v1',
    verificationPredicate: 'health:aiaimate:machine_contract_mismatch is absent on a fresh production probe',
  });
}

describe('canonical work-item identity', () => {
  it('is deterministic for the same producer/property/finding and changes when identity changes', async () => {
    const a = await deriveWorkItemId(observation());
    const b = await deriveWorkItemId(observation({ observedAt: '2026-09-29T11:00:00.000Z', evidenceDigest: D2 }));
    const c = await deriveWorkItemId(observation({ findingKey: 'health:aiaimate:http_failure' }));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^gfdwi_v1_[0-9a-f]{64}$/);
  });

  it('preserves first seen and increments occurrences under repeated observation', async () => {
    const first = await observed();
    const second = applyObservation(first, observation({
      observedAt: '2026-09-29T11:00:00.000Z',
      evidenceDigest: D2,
      evidenceRevision: 'sweep-002',
    }));
    expect(second.workItemId).toBe(first.workItemId);
    expect(second.firstSeen).toBe(first.firstSeen);
    expect(second.lastSeen).toBe('2026-09-29T11:00:00.000Z');
    expect(second.occurrenceCount).toBe(2);
    expect(second.evidenceDigest).toBe(D2);
  });

  it('rejects an observation for a different durable identity', async () => {
    const item = await observed();
    expect(() => applyObservation(item, observation({ propertyId: 'goodflippindesign.com' }))).toThrow(/identity/);
  });
});

describe('qualification and authority separation', () => {
  it('refuses qualification until canonical repository/profile/verification bindings exist', async () => {
    const item = await observed();
    expect(() => transitionWorkItem(item, 'QUALIFIED')).toThrow(/repository/);
  });

  it('records bindings only when qualification succeeds', async () => {
    const item = qualify(await observed());
    expect(item.state).toBe('QUALIFIED');
    expect(item.repository).toBe('weave0/aiaimate');
    expect(item.investigationProfile).toBe('aiaimate-health-readonly-v1');
    expect(item.verificationPredicate).toContain('fresh production probe');
  });

  it('does not let diagnosis implicitly grant repair authority', async () => {
    let item = qualify(await observed());
    item = transitionWorkItem(item, 'INVESTIGATION_READY');
    item = claimLease(item, {
      leaseId: 'lease-1',
      workerId: 'mcw-1',
      expiresAt: '2026-09-29T12:00:00.000Z',
    }, '2026-09-29T11:00:00.000Z');
    item = transitionWorkItem(item, 'INVESTIGATING', { now: '2026-09-29T11:00:00.000Z' });
    item = transitionWorkItem(item, 'DIAGNOSED', {
      diagnosis: { resultDigest: D2, signatureRef: 'fwomps-result:result-1' },
    });
    expect(() => transitionWorkItem(item, 'REPAIR_READY')).toThrow(/repairAuthorityRef/);
    item = transitionWorkItem(item, 'REPAIR_READY', { repairAuthorityRef: 'gfd-repair-contract:rc-1' });
    expect(item.repairAuthorityRef).toBe('gfd-repair-contract:rc-1');
  });
});

describe('leases', () => {
  it('allows idempotent reclaim of the exact live lease but refuses a competing owner', async () => {
    let item = qualify(await observed());
    const lease = { leaseId: 'lease-1', workerId: 'mcw-1', expiresAt: '2026-09-29T12:00:00.000Z' };
    item = claimLease(item, lease, '2026-09-29T11:00:00.000Z');
    expect(claimLease(item, lease, '2026-09-29T11:05:00.000Z')).toBe(item);
    expect(() => claimLease(item, {
      leaseId: 'lease-2',
      workerId: 'mcw-2',
      expiresAt: '2026-09-29T12:30:00.000Z',
    }, '2026-09-29T11:05:00.000Z')).toThrow(/active lease/);
  });

  it('permits a new lease after the previous lease expires and refuses mismatched release', async () => {
    let item = qualify(await observed());
    item = claimLease(item, {
      leaseId: 'lease-1',
      workerId: 'mcw-1',
      expiresAt: '2026-09-29T11:05:00.000Z',
    }, '2026-09-29T11:00:00.000Z');
    item = claimLease(item, {
      leaseId: 'lease-2',
      workerId: 'mcw-2',
      expiresAt: '2026-09-29T12:00:00.000Z',
    }, '2026-09-29T11:06:00.000Z');
    expect(item.activeLease.workerId).toBe('mcw-2');
    expect(() => releaseLease(item, 'lease-1')).toThrow(/different active lease/);
    expect(releaseLease(item, 'lease-2').activeLease).toBeNull();
  });
});

describe('lifecycle guards', () => {
  it('preserves the interrupted state across BLOCKED and only resumes that exact state', async () => {
    let item = qualify(await observed());
    item = transitionWorkItem(item, 'INVESTIGATION_READY');
    item = transitionWorkItem(item, 'BLOCKED', { reason: 'worker unavailable' });
    expect(item.resumeState).toBe('INVESTIGATION_READY');
    expect(() => transitionWorkItem(item, 'QUALIFIED')).toThrow(/exact interrupted state/);
    item = transitionWorkItem(item, 'INVESTIGATION_READY');
    expect(item.resumeState).toBeNull();
  });

  it('refuses INVESTIGATING without a live lease', async () => {
    let item = qualify(await observed());
    item = transitionWorkItem(item, 'INVESTIGATION_READY');
    expect(() => transitionWorkItem(item, 'INVESTIGATING', { now: '2026-09-29T11:00:00.000Z' })).toThrow(/active lease/);
  });

  it('requires candidate and verification evidence before VERIFIED', async () => {
    let item = qualify(await observed());
    item = { ...item, state: 'REPAIRING', repairAuthorityRef: 'gfd-repair-contract:rc-1' };
    item = transitionWorkItem(item, 'CANDIDATE_READY', { candidateDigest: D2 });
    expect(() => transitionWorkItem(item, 'VERIFIED')).toThrow(/verificationEvidenceDigest/);
    item = transitionWorkItem(item, 'VERIFIED', { verificationEvidenceDigest: D3 });
    expect(item.candidateDigest).toBe(D2);
    expect(item.verificationEvidenceDigest).toBe(D3);
  });

  it('requires fresh passing production evidence to resolve', async () => {
    let item = qualify(await observed());
    item = { ...item, state: 'REVERIFYING' };
    expect(() => transitionWorkItem(item, 'RESOLVED')).toThrow(/production verification/);
    expect(() => transitionWorkItem(item, 'RESOLVED', {
      productionVerification: {
        environment: 'staging',
        result: 'pass',
        predicate: item.verificationPredicate,
        evidenceDigest: D4,
        observedAt: '2026-09-29T11:00:00.000Z',
      },
    })).toThrow(/production evidence/);
    item = transitionWorkItem(item, 'RESOLVED', {
      productionVerification: {
        environment: 'production',
        result: 'pass',
        predicate: item.verificationPredicate,
        evidenceDigest: D4,
        observedAt: '2026-09-29T11:00:00.000Z',
      },
    });
    expect(item.state).toBe('RESOLVED');
    expect(item.resolutionEvidenceDigest).toBe(D4);
  });

  it('does not let a stale observation reopen a resolved item, but a fresh recurrence preserves lineage', async () => {
    let item = qualify(await observed());
    item = { ...item, state: 'REVERIFYING' };
    item = transitionWorkItem(item, 'RESOLVED', {
      productionVerification: {
        environment: 'production',
        result: 'pass',
        predicate: item.verificationPredicate,
        evidenceDigest: D3,
        observedAt: '2026-09-29T11:00:00.000Z',
      },
    });
    const stableId = item.workItemId;

    item = applyObservation(item, observation({
      observedAt: '2026-09-29T10:30:00.000Z',
      evidenceDigest: D2,
    }));
    expect(item.state).toBe('RESOLVED');

    item = applyObservation(item, observation({
      observedAt: '2026-09-29T12:00:00.000Z',
      evidenceDigest: D4,
    }));
    expect(item.state).toBe('RECURRENT');
    expect(item.recurrenceCount).toBe(1);
    expect(item.workItemId).toBe(stableId);
  });
});

describe('consequential effect identity', () => {
  it('is deterministic and candidate-bound', async () => {
    const workItemId = await deriveWorkItemId(observation());
    const a = await deriveEffectId({ workItemId, effectType: 'deploy', target: 'aiaimate.com', candidateDigest: D2 });
    const b = await deriveEffectId({ workItemId, effectType: 'deploy', target: 'aiaimate.com', candidateDigest: D2 });
    const c = await deriveEffectId({ workItemId, effectType: 'deploy', target: 'aiaimate.com', candidateDigest: D3 });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^gfdeffect_v1_[0-9a-f]{64}$/);
  });

  it('treats a repeated consequence registration as idempotent and immutable', async () => {
    const workItemId = await deriveWorkItemId(observation());
    const effectId = await deriveEffectId({ workItemId, effectType: 'deploy', target: 'aiaimate.com', candidateDigest: D2 });
    const original = {
      effectId,
      workItemId,
      effectType: 'deploy',
      target: 'aiaimate.com',
      candidateDigest: D2,
      status: 'PLANNED',
    };
    expect(registerEffect(null, original)).toEqual(original);
    expect(registerEffect(original, { ...original, status: 'COMMITTED' })).toBe(original);
    expect(() => registerEffect(original, { ...original, target: 'evil.example' })).toThrow(/immutable field/);
  });
});
