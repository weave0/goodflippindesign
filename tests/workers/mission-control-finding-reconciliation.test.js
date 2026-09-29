import { describe, expect, it } from 'vitest';

import {
  reconcileCompleteFindingSnapshot,
} from '../../workers/lib/mission-control-finding-reconciliation.js';
import {
  createObservedWorkItem,
  transitionWorkItem,
} from '../../workers/lib/mission-control-work-items.js';

const D1 = 'sha256:' + '11'.repeat(32);
const D2 = 'sha256:' + '22'.repeat(32);
const D3 = 'sha256:' + '33'.repeat(32);
const D4 = 'sha256:' + '44'.repeat(32);

function finding(overrides = {}) {
  return {
    producer: 'estate-operating-readiness',
    propertyId: 'aiaimate.com',
    findingKey: 'operating:missing_repository_authority',
    observedAt: '2026-09-29T10:00:00.000Z',
    evidenceDigest: D1,
    evidenceRevision: 'estate-registry:1.0.0',
    severity: 'high',
    confidence: 1,
    ...overrides,
  };
}

function snapshot(findings, overrides = {}) {
  return {
    contractName: 'gfd-mission-control-finding-feed',
    schemaVersion: '1.0.0',
    producer: 'estate-operating-readiness',
    generatedAt: '2026-09-29T10:00:00.000Z',
    snapshotComplete: true,
    scope: {
      propertyIds: ['aiaimate.com', 'globaldeets.com'],
      findingKeyPrefix: 'operating:',
    },
    findings,
    ...overrides,
  };
}

async function resolvedItem(overrides = {}) {
  let item = await createObservedWorkItem(finding(overrides));
  item = transitionWorkItem(item, 'QUALIFIED', {
    repository: 'weave0/goodflippindesign',
    investigationProfile: 'estate-authority-readonly-v1',
    verificationProfile: 'estate-registry-authority-v1',
    verificationScope: 'control-plane',
    verificationPredicate: 'canonical estate registry contains verified repository authority',
  });
  item = {
    ...item,
    state: 'REVERIFYING',
    diagnosis: {
      resultDigest: D2,
      signatureRef: 'fwomps://investigation/result/test',
    },
  };
  return transitionWorkItem(item, 'RESOLVED', {
    resolutionVerification: {
      scope: item.verificationScope,
      profile: item.verificationProfile,
      result: 'pass',
      predicate: item.verificationPredicate,
      evidenceDigest: D3,
      observedAt: '2026-09-29T11:00:00.000Z',
    },
  });
}

describe('complete finding snapshot reconciliation', () => {
  it('creates canonical work items and deterministic events independent of input order', async () => {
    const findings = [
      finding({
        propertyId: 'globaldeets.com',
        findingKey: 'operating:missing_verification_profile',
        evidenceDigest: D2,
      }),
      finding(),
    ];
    const first = await reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot(findings),
    });
    const second = await reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot([...findings].reverse(), {
        scope: {
          propertyIds: ['globaldeets.com', 'aiaimate.com'],
          findingKeyPrefix: 'operating:',
        },
      }),
    });

    expect(first.contractName).toBe('gfd-mission-control-reconciliation-plan');
    expect(first.workItems).toHaveLength(2);
    expect(first.workItems.every(item => item.state === 'OBSERVED')).toBe(true);
    expect(first.events.every(event => event.eventType === 'WORK_ITEM_CREATED')).toBe(true);
    expect(first.snapshotDigest).toBe(second.snapshotDigest);
    expect(first.events.map(event => event.eventId)).toEqual(second.events.map(event => event.eventId));
    expect(first.workItems.map(item => item.workItemId)).toEqual(second.workItems.map(item => item.workItemId));
  });

  it('updates one stable item per later observation and treats exact replay as a no-op', async () => {
    const initial = await reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot([finding()]),
    });
    const original = initial.workItems[0];
    const replay = await reconcileCompleteFindingSnapshot({
      workItems: initial.workItems,
      snapshot: snapshot([finding()]),
    });

    expect(replay.workItems[0]).toBe(original);
    expect(replay.workItems[0].occurrenceCount).toBe(1);
    expect(replay.events).toEqual([]);
    expect(replay.stats.replayed).toBe(1);

    const laterFinding = finding({
      observedAt: '2026-09-29T12:00:00.000Z',
      evidenceDigest: D2,
    });
    const later = await reconcileCompleteFindingSnapshot({
      workItems: replay.workItems,
      snapshot: snapshot([laterFinding], { generatedAt: laterFinding.observedAt }),
    });

    expect(later.workItems[0].workItemId).toBe(original.workItemId);
    expect(later.workItems[0].occurrenceCount).toBe(2);
    expect(later.workItems[0].lastSeen).toBe(laterFinding.observedAt);
    expect(later.events[0].eventType).toBe('WORK_ITEM_OBSERVED');
  });

  it('marks a fresh post-resolution observation recurrent without losing lineage', async () => {
    const resolved = await resolvedItem();
    const recurring = finding({
      observedAt: '2026-09-29T12:00:00.000Z',
      evidenceDigest: D4,
    });
    const plan = await reconcileCompleteFindingSnapshot({
      workItems: [resolved],
      snapshot: snapshot([recurring], { generatedAt: recurring.observedAt }),
    });

    expect(plan.workItems[0].workItemId).toBe(resolved.workItemId);
    expect(plan.workItems[0].state).toBe('RECURRENT');
    expect(plan.workItems[0].recurrenceCount).toBe(1);
    expect(plan.events[0].eventType).toBe('WORK_ITEM_RECURRENT');
    expect(plan.events[0].fromState).toBe('RESOLVED');
    expect(plan.events[0].toState).toBe('RECURRENT');
  });

  it('emits a candidate event for scoped active absence without resolving or mutating the item', async () => {
    const item = await createObservedWorkItem(finding());
    const before = structuredClone(item);
    const plan = await reconcileCompleteFindingSnapshot({
      workItems: [item],
      snapshot: snapshot([], { generatedAt: '2026-09-29T11:00:00.000Z' }),
    });
    const retry = await reconcileCompleteFindingSnapshot({
      workItems: [item],
      snapshot: snapshot([], { generatedAt: '2026-09-29T11:00:00.000Z' }),
    });

    expect(item).toEqual(before);
    expect(plan.workItems[0]).toBe(item);
    expect(plan.workItems[0].state).toBe('OBSERVED');
    expect(plan.resolutionCandidates).toHaveLength(1);
    expect(plan.resolutionCandidates[0]).toMatchObject({
      eventType: 'RESOLUTION_CANDIDATE',
      fromState: 'OBSERVED',
      toState: null,
      evidenceDigest: plan.snapshotDigest,
      detail: { reason: 'finding_absent_from_complete_snapshot' },
    });
    expect(plan.resolutionCandidates[0]).not.toHaveProperty('effectId');
    expect(plan.resolutionCandidates[0]).not.toHaveProperty('repairAuthorityRef');
    expect(retry.resolutionCandidates[0].eventId).toBe(plan.resolutionCandidates[0].eventId);
  });

  it('does not infer absence outside producer, property, finding-prefix, or active scope', async () => {
    const scopedResolved = await resolvedItem();
    const otherProducer = await createObservedWorkItem(finding({ producer: 'health-sweep' }));
    const otherProperty = await createObservedWorkItem(finding({ propertyId: 'outside.example' }));
    const otherPrefix = await createObservedWorkItem(finding({ findingKey: 'health:aiaimate:http_failure' }));
    const plan = await reconcileCompleteFindingSnapshot({
      workItems: [scopedResolved, otherProducer, otherProperty, otherPrefix],
      snapshot: snapshot([], { generatedAt: '2026-09-29T12:00:00.000Z' }),
    });

    expect(plan.resolutionCandidates).toEqual([]);
    expect(plan.workItems).toHaveLength(4);
  });
});

describe('hostile reconciliation inputs', () => {
  it('rejects incomplete snapshots and findings outside the declared scope', async () => {
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot([], { snapshotComplete: false }),
    })).rejects.toThrow(/snapshotComplete/);

    await expect(reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot([finding({ propertyId: 'outside.example' })]),
    })).rejects.toThrow(/propertyId is outside snapshot scope/);

    await expect(reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot([finding({ findingKey: 'health:aiaimate:http_failure' })]),
    })).rejects.toThrow(/findingKey is outside snapshot scope/);
  });

  it('rejects duplicate findings and conflicting same-time observations', async () => {
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot([finding(), finding()]),
    })).rejects.toThrow(/duplicate finding identity/);

    const existing = await createObservedWorkItem(finding());
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [existing],
      snapshot: snapshot([finding({ evidenceDigest: D2 })]),
    })).rejects.toThrow(/conflicting observation/);
  });

  it('rejects stale destructive absence and same-time absence', async () => {
    const item = await createObservedWorkItem(finding({ observedAt: '2026-09-29T12:00:00.000Z' }));
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [item],
      snapshot: snapshot([], { generatedAt: '2026-09-29T11:00:00.000Z' }),
    })).rejects.toThrow(/stale complete snapshot/);
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [item],
      snapshot: snapshot([], { generatedAt: '2026-09-29T12:00:00.000Z' }),
    })).rejects.toThrow(/same-time active finding/);
  });

  it('binds deterministic event ids to lifecycle state as well as observation evidence', async () => {
    const observed = await createObservedWorkItem(finding());
    const qualified = transitionWorkItem(observed, 'QUALIFIED', {
      repository: 'weave0/goodflippindesign',
      investigationProfile: 'estate-authority-readonly-v1',
      verificationProfile: 'estate-registry-authority-v1',
      verificationScope: 'control-plane',
      verificationPredicate: 'canonical estate registry contains verified repository authority',
    });
    const laterFinding = finding({
      observedAt: '2026-09-29T12:00:00.000Z',
      evidenceDigest: D2,
    });
    const laterSnapshot = snapshot([laterFinding], { generatedAt: laterFinding.observedAt });

    const fromObserved = await reconcileCompleteFindingSnapshot({
      workItems: [observed],
      snapshot: laterSnapshot,
    });
    const fromQualified = await reconcileCompleteFindingSnapshot({
      workItems: [qualified],
      snapshot: laterSnapshot,
    });

    expect(fromObserved.events[0].fromState).toBe('OBSERVED');
    expect(fromQualified.events[0].fromState).toBe('QUALIFIED');
    expect(fromObserved.events[0].eventId).not.toBe(fromQualified.events[0].eventId);
  });

  it('rejects lifecycle states whose required projection invariants are missing', async () => {
    const observed = await createObservedWorkItem(finding());
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [{ ...observed, state: 'QUALIFIED' }],
      snapshot: snapshot([finding()]),
    })).rejects.toThrow(/repository|investigationProfile|verificationProfile/);

    const qualified = transitionWorkItem(observed, 'QUALIFIED', {
      repository: 'weave0/goodflippindesign',
      investigationProfile: 'estate-authority-readonly-v1',
      verificationProfile: 'estate-registry-authority-v1',
      verificationScope: 'control-plane',
      verificationPredicate: 'canonical estate registry contains verified repository authority',
    });
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [{ ...qualified, state: 'INVESTIGATING', activeLease: null }],
      snapshot: snapshot([finding()]),
    })).rejects.toThrow(/active lease/);
  });

  it('rejects corrupt or duplicate prior projection state instead of repairing it silently', async () => {
    const item = await createObservedWorkItem(finding());
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [{ ...item, schemaVersion: 'unknown-work-item-schema' }],
      snapshot: snapshot([finding()]),
    })).rejects.toThrow(/schemaVersion/);
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [{ ...item, stableKey: 'corrupt' }],
      snapshot: snapshot([finding()]),
    })).rejects.toThrow(/stableKey/);
    await expect(reconcileCompleteFindingSnapshot({
      workItems: [item, structuredClone(item)],
      snapshot: snapshot([finding()]),
    })).rejects.toThrow(/duplicate work-item identity/);
  });
});
