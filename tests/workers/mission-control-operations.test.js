import { describe, expect, it } from 'vitest';

import {
  ATTENTION_ORDER,
  EFFECT_VISIBILITY_MS,
  EVIDENCE_STALE_AFTER_MS,
  OPERATIONS_SCHEMA_VERSION,
  assertOperationsContract,
  projectMissionControlOperations,
} from '../../workers/lib/mission-control-operations.js';

const NOW = '2026-09-29T12:00:00.000Z';
const YOUNG = '2026-09-29T11:30:00.000Z';
const OLD = '2026-09-29T11:00:00.000Z';
const DAY_AGO = '2026-09-28T12:00:00.000Z';
const INSIDE_WINDOW = '2026-09-28T12:00:00.001Z';
const EIGHT_DAYS = '2026-09-21T12:00:00.000Z';

function item(workItemId, overrides = {}) {
  return {
    schemaVersion: 'gfd-work-item-1',
    workItemId,
    propertyId: 'aiaimate.com',
    findingKey: `finding:${workItemId}`,
    producer: 'health-sweep',
    state: 'OBSERVED',
    severity: 'high',
    recurrenceCount: 0,
    repository: 'weave0/aiaimate',
    investigationProfile: 'aiaimate-readonly',
    verificationProfile: 'aiaimate-production',
    verificationScope: 'production',
    verificationPredicate: 'the production probe passes',
    evidenceDigest: `sha256:${'ab'.repeat(32)}`,
    evidenceRevision: 'rev-1',
    firstSeen: YOUNG,
    lastSeen: YOUNG,
    updatedAt: YOUNG,
    ...overrides,
  };
}

function effect(effectId, workItemId, overrides = {}) {
  return {
    schemaVersion: 'gfd-effect-1',
    effectId,
    workItemId,
    effectType: 'notification',
    status: 'PLANNED',
    attemptCount: 0,
    createdAt: YOUNG,
    ...overrides,
  };
}

function project(overrides = {}) {
  return projectMissionControlOperations({
    now: NOW,
    workItems: [],
    events: [],
    effects: [],
    leases: [],
    readiness: null,
    ...overrides,
  });
}

function readinessFixture() {
  const properties = [];
  for (let n = 1; n <= 25; n += 1) {
    properties.push({
      propertyId: `property-${String(n).padStart(2, '0')}`,
      governed: true,
      repository: n <= 10 ? `weave0/property-${n}` : null,
      investigationProfile: n <= 6 ? 'profile' : null,
      verificationProfile: n <= 4 ? 'verify' : null,
      dispatchReady: n <= 3,
    });
  }
  properties.push({
    propertyId: 'ungoverned.example',
    governed: false,
    repository: 'weave0/not-governed',
    investigationProfile: 'profile',
    verificationProfile: 'verify',
    dispatchReady: true,
  });
  return {
    contractName: 'gfd-estate-operating-readiness',
    schemaVersion: '1.0.0',
    properties,
  };
}

describe('mission control operations projection', () => {
  it('rejects an unknown contract and accepts its own document', () => {
    const view = project();
    expect(view.schemaVersion).toBe(OPERATIONS_SCHEMA_VERSION);
    expect(assertOperationsContract(view)).toBe(view);
    expect(() => assertOperationsContract({ schemaVersion: 'gfd-mission-control-operations-99' }))
      .toThrow(/unsupported operations schema/);
    expect(view.rules.attentionOrder).toEqual([...ATTENTION_ORDER]);
    expect(view.authority).toEqual({ repair: false, deployment: false, execution: false });
  });

  it('keeps the same output when records arrive in a different order', () => {
    const workItems = [
      item('wi-b', { state: 'NEEDS_HUMAN', severity: 'low', lastSeen: OLD, updatedAt: OLD, firstSeen: OLD }),
      item('wi-a', { state: 'QUALIFIED', severity: 'critical' }),
    ];
    const events = [
      { eventId: 'e-qual', workItemId: 'wi-a', eventType: 'transition', fromState: 'OBSERVED', toState: 'QUALIFIED', occurredAt: YOUNG },
      { eventId: 'e-obs', workItemId: 'wi-a', eventType: 'transition', fromState: null, toState: 'OBSERVED', occurredAt: OLD },
    ];
    const effects = [effect('fx-1', 'wi-a', { effectType: 'investigation_dispatch' })];
    const leases = [{
      leaseId: 'lease-1', workItemId: 'wi-b', workerId: 'worker-b', issuedAt: OLD, expiresAt: '2026-09-29T12:30:00.000Z',
    }];
    const readiness = readinessFixture();
    const first = project({ workItems, events, effects, leases, readiness });
    const second = project({
      workItems: [...workItems].reverse(),
      events: [...events].reverse(),
      effects: [...effects].reverse(),
      leases: [...leases].reverse(),
      readiness: { ...readiness, properties: [...readiness.properties].reverse() },
    });
    expect(second).toEqual(first);
    expect(first.queues.activeAutomation.map((card) => card.workItemId)).toEqual(['wi-a', 'wi-b']);
    expect(first.queues.attention.map((card) => card.workItemId)).toEqual(['wi-b']);
  });

  it('does not double-count duplicate event ids or semantic duplicates', () => {
    const occurred = '2026-09-29T11:40:00.000Z';
    const duplicate = {
      eventId: 'evt-accept',
      workItemId: 'wi-diag',
      eventType: 'transition',
      fromState: 'INVESTIGATING',
      toState: 'DIAGNOSED',
      occurredAt: occurred,
    };
    const view = project({
      workItems: [item('wi-diag', { state: 'DIAGNOSED' })],
      events: [
        duplicate,
        { ...duplicate },
        { ...duplicate, eventId: 'evt-accept-copy' },
        { eventId: 'evt-obs', workItemId: 'wi-diag', eventType: 'transition', fromState: null, toState: 'OBSERVED', occurredAt: OLD },
        { eventId: 'evt-obs-2', workItemId: 'wi-diag', eventType: 'transition', fromState: null, toState: 'OBSERVED', occurredAt: OLD },
        { eventId: 'evt-qual', workItemId: 'wi-diag', eventType: 'transition', fromState: 'OBSERVED', toState: 'QUALIFIED', occurredAt: YOUNG },
      ],
    });
    expect(view.metrics.resultAcceptance.count).toBe(1);
    expect(view.metrics.observedToQualified).toEqual({ available: true, samples: 1, averageMs: 30 * 60 * 1000, reason: null });
    expect(view.source.events.included).toBe(3);
  });

  it('excludes an unknown durable schema instead of interpreting it', () => {
    const view = project({
      workItems: [
        item('wi-known', { state: 'NEEDS_HUMAN' }),
        { ...item('wi-unknown', { state: 'NEEDS_HUMAN' }), schemaVersion: 'gfd-work-item-9' },
      ],
      effects: [
        effect('fx-bad', 'wi-known', { schemaVersion: 'gfd-effect-99', status: 'FAILED' }),
        effect('fx-legacy', 'wi-known', { schemaVersion: null, status: 'FAILED', attemptCount: null }),
      ],
    });
    const ids = view.queues.needsHuman.map((card) => card.workItemId);
    expect(ids).toContain('wi-known');
    expect(ids).not.toContain('wi-unknown');
    expect(JSON.stringify(view.queues)).not.toContain('fx-bad');
    expect(JSON.stringify(view.queues)).toContain('fx-legacy');
    expect(view.completeness.excludedWorkItems.map((row) => row.reason)).toContain('unsupported_schema');
    expect(view.completeness.excludedEffects.map((row) => row.reason)).toContain('unsupported_schema');
    expect(view.metrics.effectsByStatus.FAILED).toBe(1);
  });

  it('classifies an expired lease and keeps a live lease in automation', () => {
    const expired = project({
      workItems: [item('wi-lease', {
        state: 'INVESTIGATING',
        activeLease: { leaseId: 'lease-old', workerId: 'worker-1', expiresAt: NOW },
      })],
      leases: [{
        leaseId: 'lease-old', workItemId: 'wi-lease', workerId: 'worker-1', issuedAt: OLD, expiresAt: NOW,
      }],
    });
    expect(expired.queues.stale.map((card) => card.workItemId)).toContain('wi-lease');
    expect(expired.queues.activeAutomation.map((card) => card.workItemId)).not.toContain('wi-lease');
    expect(expired.metrics.expiredLeaseCount.count).toBe(1);
    expect(expired.metrics.activeLeaseCount.count).toBe(0);
    expect(expired.queues.stale[0].leaseState).toBe('expired');
    expect(expired.queues.stale[0].workerId).toBe('worker-1');

    const live = project({
      workItems: [item('wi-lease', {
        state: 'INVESTIGATING',
        activeLease: { leaseId: 'lease-new', workerId: 'worker-2', expiresAt: '2026-09-29T12:05:00.000Z' },
      })],
    });
    expect(live.queues.activeAutomation.map((card) => card.workItemId)).toEqual(['wi-lease']);
    expect(live.queues.stale).toEqual([]);
    expect(live.metrics.activeLeaseCount.count).toBe(1);
  });

  it('puts a failed effect on the human queue and a planned effect on automation', () => {
    const failed = project({
      workItems: [item('wi-fail', { state: 'DIAGNOSED' })],
      effects: [effect('fx-fail', 'wi-fail', { status: 'FAILED', attemptCount: 2, terminalReason: 'provider rejected the idempotency key' })],
    });
    expect(failed.queues.needsHuman.map((card) => card.workItemId)).toContain('wi-fail');
    expect(failed.queues.needsHuman[0].reasons).toContain('failed_effect');
    expect(failed.queues.needsHuman[0].effects[0].status).toBe('FAILED');

    const planned = project({
      workItems: [item('wi-run', { state: 'INVESTIGATING' })],
      effects: [effect('fx-run', 'wi-run', {
        effectType: 'investigation_dispatch',
        status: 'PLANNED',
        attemptCount: 1,
        lastAttemptAt: '2026-09-29T11:59:30.000Z',
      })],
    });
    expect(planned.queues.activeAutomation.map((card) => card.effectIds).flat()).toContain('fx-run');
    expect(planned.queues.activeAutomation[0].effects[0].status).toBe('PLANNED');
    expect(planned.queues.needsHuman).toEqual([]);
    expect(JSON.stringify(planned.queues.recentlyResolved)).not.toContain('fx-run');

    const visibleAgain = project({
      workItems: [item('wi-run', { state: 'INVESTIGATING' })],
      effects: [effect('fx-run', 'wi-run', {
        status: 'PLANNED',
        attemptCount: 1,
        lastAttemptAt: new Date(Date.parse(NOW) - EFFECT_VISIBILITY_MS).toISOString(),
      })],
    });
    expect(visibleAgain.queues.stale[0].reasons).toContain('effect_beyond_visibility');
    expect(visibleAgain.queues.activeAutomation[0].effects[0].status).toBe('PLANNED');
  });

  it('classifies stale evidence from the supplied now', () => {
    const records = {
      workItems: [item('wi-evidence', { state: 'INVESTIGATING', lastSeen: DAY_AGO, updatedAt: NOW, firstSeen: DAY_AGO })],
      effects: [],
      events: [],
      leases: [{
        leaseId: 'lease-live', workItemId: 'wi-evidence', workerId: 'worker-1', issuedAt: NOW, expiresAt: '2026-09-29T13:00:00.000Z',
      }],
    };
    const stale = project({ ...records, now: NOW });
    expect(stale.queues.stale.map((card) => card.workItemId)).toEqual(['wi-evidence']);
    expect(stale.metrics.evidenceFreshness.stale).toBe(1);

    const fresh = project({
      ...records,
      workItems: [item('wi-evidence', { state: 'INVESTIGATING', lastSeen: INSIDE_WINDOW, updatedAt: NOW, firstSeen: INSIDE_WINDOW })],
    });
    expect(fresh.queues.stale).toEqual([]);
    expect(fresh.metrics.evidenceFreshness.fresh).toBe(1);
    expect(Date.parse(NOW) - Date.parse(DAY_AGO)).toBe(EVIDENCE_STALE_AFTER_MS);
  });

  it('returns unavailable latency when event timestamps are missing', () => {
    const missing = project({
      workItems: [item('wi-gap', { state: 'QUALIFIED' })],
      events: [
        { eventId: 'evt-obs', workItemId: 'wi-gap', eventType: 'transition', fromState: null, toState: 'OBSERVED', occurredAt: null },
        { eventId: 'evt-qual', workItemId: 'wi-gap', eventType: 'transition', fromState: 'OBSERVED', toState: 'QUALIFIED', occurredAt: null },
      ],
    });
    expect(missing.metrics.observedToQualified.available).toBe(false);
    expect(missing.metrics.observedToQualified.averageMs).toBeNull();
    expect(missing.metrics.observedToQualified.averageMs).not.toBe(0);
    expect(missing.metrics.qualifiedToDiagnosed.averageMs).toBeNull();
    expect(missing.metrics.diagnosedToResolved.averageMs).toBeNull();

    const partial = project({
      workItems: [
        item('wi-known', { state: 'DIAGNOSED' }),
        item('wi-blank', { state: 'DIAGNOSED' }),
      ],
      events: [
        { eventId: 'a-obs', workItemId: 'wi-known', eventType: 'transition', toState: 'OBSERVED', occurredAt: OLD },
        { eventId: 'a-qual', workItemId: 'wi-known', eventType: 'transition', toState: 'QUALIFIED', occurredAt: YOUNG },
        { eventId: 'a-diag', workItemId: 'wi-known', eventType: 'transition', fromState: 'INVESTIGATING', toState: 'DIAGNOSED', occurredAt: '2026-09-29T11:40:00.000Z' },
        { eventId: 'a-res', workItemId: 'wi-known', eventType: 'transition', toState: 'RESOLVED', occurredAt: '2026-09-29T11:50:00.000Z' },
        { eventId: 'b-obs', workItemId: 'wi-blank', eventType: 'transition', toState: 'OBSERVED', occurredAt: null },
        { eventId: 'b-qual', workItemId: 'wi-blank', eventType: 'transition', toState: 'QUALIFIED', occurredAt: null },
      ],
    });
    expect(partial.metrics.observedToQualified).toMatchObject({ available: true, samples: 1, averageMs: 30 * 60 * 1000 });
    expect(partial.metrics.qualifiedToDiagnosed.averageMs).toBe(10 * 60 * 1000);
    expect(partial.metrics.diagnosedToResolved.averageMs).toBe(10 * 60 * 1000);
    expect(partial.metrics.resultRefusal).toEqual({
      available: false,
      count: null,
      reason: 'the event journal has no result-refusal records; a zero would claim that no result was refused',
    });
  });

  it('does not carry repair, deployment, or execution authority', () => {
    const view = project({
      workItems: [item('wi-secret', { repairAuthorityRef: 'repair-secret', state: 'REPAIR_READY' })],
      effects: [effect('fx-secret', 'wi-secret', { effectType: 'deployment', payload: { command: 'deploy' } })],
      leases: [{
        leaseId: 'lease-secret',
        workItemId: 'wi-secret',
        workerId: 'worker-1',
        issuedAt: OLD,
        expiresAt: '2026-09-29T12:30:00.000Z',
        leaseToken: 'token-secret',
      }],
    });
    const encoded = JSON.stringify(view);
    expect(encoded).not.toContain('repair-secret');
    expect(encoded).not.toContain('token-secret');
    expect(encoded).not.toContain('permitted_paths');
    expect(encoded).not.toContain('"repair":true');
    expect(encoded).not.toContain('"deployment":true');
    expect(encoded).not.toContain('"execution":true');
    expect(view.authority.deployment).toBe(false);
  });

  it('does not turn a 25-property readiness snapshot into work items', () => {
    const view = project({
      workItems: [],
      readiness: readinessFixture(),
    });
    expect(view.queues.needsHuman).toEqual([]);
    expect(view.queues.activeAutomation).toEqual([]);
    expect(view.queues.attention).toEqual([]);
    expect(view.metrics.workItemsByLifecycle.counts.OBSERVED).toBe(0);
    expect(Object.values(view.metrics.workItemsByLifecycle.counts).reduce((sum, count) => sum + count, 0)).toBe(0);
    expect(view.metrics.repositoryAuthority).toMatchObject({ available: true, covered: 10, governed: 25, ratio: 0.4 });
    expect(view.metrics.investigationProfile).toMatchObject({ available: true, covered: 6, governed: 25, ratio: 0.24 });
    expect(view.metrics.verificationProfile).toMatchObject({ available: true, covered: 4, governed: 25, ratio: 0.16 });
    expect(view.metrics.dispatchReadiness).toMatchObject({ available: true, covered: 3, governed: 25, ratio: 0.12 });
    expect(JSON.stringify(view.queues)).not.toContain('property-01');

    const drifted = project({
      workItems: [],
      readiness: { ...readinessFixture(), summary: { governedProperties: 99, dispatchReady: 99 } },
    });
    expect(drifted.metrics.dispatchReadiness.available).toBe(false);
    expect(drifted.metrics.dispatchReadiness.covered).toBeNull();
    expect(drifted.queues.needsHuman).toEqual([]);
  });

  it('orders attention by the documented rule and withholds an all-clear when work items are absent', () => {
    const young = { firstSeen: YOUNG, lastSeen: YOUNG, updatedAt: YOUNG };
    const old = { firstSeen: OLD, lastSeen: OLD, updatedAt: OLD };
    const view = project({
      workItems: [
        item('wi-tie-b', { state: 'NEEDS_HUMAN', severity: 'low', ...young }),
        item('wi-tie-a', { state: 'NEEDS_HUMAN', severity: 'low', ...young }),
        item('wi-attempt-1', { state: 'NEEDS_HUMAN', severity: 'low', ...young }),
        item('wi-attempt-4', { state: 'NEEDS_HUMAN', severity: 'low', ...young }),
        item('wi-recur-1', { state: 'NEEDS_HUMAN', severity: 'low', recurrenceCount: 1, ...young }),
        item('wi-recur-4', { state: 'NEEDS_HUMAN', severity: 'low', recurrenceCount: 4, ...young }),
        item('wi-old-low', { state: 'NEEDS_HUMAN', severity: 'low', ...old }),
        item('wi-plain-med', { state: 'NEEDS_HUMAN', severity: 'medium', ...young }),
        item('wi-fail-med', { state: 'NEEDS_HUMAN', severity: 'medium', ...young }),
        item('wi-blocked-high', { state: 'BLOCKED', severity: 'high', resumeState: 'QUALIFIED', ...old }),
        item('wi-human-high', { state: 'NEEDS_HUMAN', severity: 'high', ...young }),
        item('wi-crit', { state: 'OBSERVED', severity: 'critical', ...young }),
      ],
      effects: [
        effect('fx-attempt-4', 'wi-attempt-4', { attemptCount: 4 }),
        effect('fx-attempt-1', 'wi-attempt-1', { attemptCount: 1 }),
        effect('fx-fail-med', 'wi-fail-med', { status: 'FAILED', attemptCount: 2 }),
      ],
    });
    expect(view.queues.attention.map((card) => card.workItemId)).toEqual([
      'wi-crit',
      'wi-human-high',
      'wi-blocked-high',
      'wi-fail-med',
      'wi-plain-med',
      'wi-old-low',
      'wi-recur-4',
      'wi-recur-1',
      'wi-attempt-4',
      'wi-attempt-1',
      'wi-tie-a',
      'wi-tie-b',
    ]);

    const absent = projectMissionControlOperations({ now: NOW, effects: [], events: [], leases: [] });
    expect(absent.queues.needsHuman).toBeNull();
    expect(absent.metrics.humanAttentionQueueDepth.count).toBeNull();
    expect(absent.completeness.limitations.join(' ')).toMatch(/not an all-clear/);
  });

  it('reads snake_case rows, drops conflicting duplicates, and records resolution evidence', () => {
    const snake = project({
      workItems: [{
        schema_version: 'gfd-work-item-1',
        work_item_id: 'wi-snake',
        property_id: 'aiaimate.com',
        finding_key: 'finding:snake',
        producer: 'health-sweep',
        lifecycle_state: 'NEEDS_HUMAN',
        severity: 'warning',
        recurrence_count: 2,
        repository: 'weave0/aiaimate',
        investigation_profile: 'profile',
        verification_profile: 'verify',
        verification_scope: 'production',
        verification_predicate: 'probe passes',
        evidence_digest: `sha256:${'cd'.repeat(32)}`,
        first_seen: YOUNG,
        last_seen: YOUNG,
        updated_at: YOUNG,
      }],
    });
    expect(snake.queues.needsHuman[0].workItemId).toBe('wi-snake');
    expect(snake.queues.needsHuman[0].recurrenceCount).toBe(2);

    const conflict = project({
      workItems: [
        item('wi-conflict', { state: 'OBSERVED' }),
        item('wi-conflict', { state: 'QUALIFIED' }),
      ],
    });
    expect(conflict.queues.attention.map((card) => card.workItemId)).not.toContain('wi-conflict');
    expect(conflict.completeness.limitations.join(' ')).toMatch(/conflicting duplicates/);

    const resolved = project({
      workItems: [
        item('wi-new', { state: 'RESOLVED', resolvedAt: '2026-09-28T12:00:00.000Z', resolutionEvidenceDigest: `sha256:${'ef'.repeat(32)}` }),
        item('wi-old', { state: 'DISMISSED', resolvedAt: EIGHT_DAYS }),
        item('wi-blank', { state: 'SUPERSEDED' }),
      ],
    });
    expect(resolved.queues.recentlyResolved.map((card) => card.workItemId)).toEqual(['wi-new']);
    expect(resolved.queues.recentlyResolved[0].causalEvidence).toBe(`sha256:${'ef'.repeat(32)}`);
    expect(resolved.metrics.resolvedOutsideWindow.count).toBe(1);
    expect(resolved.metrics.resolvedWithoutTimestamp.count).toBe(1);
    expect(JSON.stringify(resolved.queues.recentlyResolved)).not.toContain('wi-blank');

    const lag = project({
      workItems: [item('wi-lag', { state: 'QUALIFIED' })],
      effects: [effect('fx-lag', 'wi-lag', { status: 'COMMITTED', createdAt: NOW, committedAt: OLD, attemptCount: null })],
    });
    expect(lag.metrics.outboxDispatchLag.available).toBe(false);
    expect(lag.metrics.outboxDispatchLag.averageMs).toBeNull();

    const attempts = project({
      workItems: [item('wi-tries', { state: 'INVESTIGATING' })],
      effects: [
        effect('fx-a', 'wi-tries', { attemptCount: 1, lastAttemptAt: YOUNG, createdAt: OLD }),
        effect('fx-b', 'wi-tries', { attemptCount: 3, lastAttemptAt: YOUNG, createdAt: OLD }),
        effect('fx-legacy', 'wi-tries', { schemaVersion: null, attemptCount: null, createdAt: OLD, lastAttemptAt: YOUNG }),
      ],
    });
    expect(attempts.metrics.effectsWithRetries).toMatchObject({ available: true, count: 1, unknown: 1 });
    expect(attempts.metrics.attemptCount).toMatchObject({ available: true, max: 3, average: 2, known: 2, unknown: 1 });
    expect(attempts.metrics.outboxDispatchLag.averageMs).toBe(30 * 60 * 1000);
  });

  it('keeps a blocked item with a live lease out of the human queue', () => {
    const view = project({
      workItems: [item('wi-held', {
        state: 'BLOCKED',
        resumeState: 'INVESTIGATING',
        activeLease: { leaseId: 'lease-held', workerId: 'worker-9', expiresAt: '2026-09-29T12:10:00.000Z' },
      })],
    });
    expect(view.queues.needsHuman).toEqual([]);
    expect(view.queues.activeAutomation.map((card) => card.workItemId)).toEqual(['wi-held']);
  });

  it('shows a DIAGNOSED item as awaiting reverification by the governed sweep, not as human work', () => {
    const view = project({ workItems: [item('wi-idle', { state: 'DIAGNOSED' })] });
    const card = view.queues.activeAutomation.find((entry) => entry.workItemId === 'wi-idle');
    expect(card.reasons).toContain('awaiting_reverification');
    expect(card.reasons).not.toContain('lifecycle_waiting');
    expect(view.queues.needsHuman.map((entry) => entry.workItemId)).not.toContain('wi-idle');
  });

  it('exposes lifecycle facts for every item, scoped to the current recurrence cycle', () => {
    const verdict = (result, at) => JSON.stringify({ reverification: { result, observedAt: at, evidenceDigest: 'sha256:' + 'a'.repeat(64) } });
    const view = project({
      workItems: [item('wi-a', { state: 'DIAGNOSED', occurrenceCount: 3, diagnosis: { resultDigest: 'sha256:' + 'b'.repeat(64) } }), item('wi-b', { state: 'RECURRENT', recurrenceCount: 1 })],
      events: [
        { eventId: 'a-1', workItemId: 'wi-a', eventType: 'observation', toState: 'DIAGNOSED', occurredAt: '2026-09-29T11:00:00.000Z', detail_json: verdict('still_failing', '2026-09-29T11:00:00.000Z') },
        { eventId: 'b-1', workItemId: 'wi-b', eventType: 'observation', toState: 'RESOLVED', occurredAt: '2026-09-28T11:00:00.000Z', detail_json: verdict('resolved', '2026-09-28T11:00:00.000Z') },
        { eventId: 'b-2', workItemId: 'wi-b', eventType: 'transition', fromState: 'RESOLVED', toState: 'RECURRENT', occurredAt: '2026-09-29T09:00:00.000Z' },
      ],
    });
    const byId = Object.fromEntries(view.items.map((entry) => [entry.workItemId, entry.lifecycle]));
    expect(byId['wi-a']).toMatchObject({ occurrenceCount: 3, diagnosisAvailable: true, reverificationRequired: true, reverification: { result: 'still_failing' } });
    expect(byId['wi-b']).toMatchObject({ recurrenceCount: 1, reverification: null, reverificationRequired: false });
  });

  it('applies the visibility timeout to an orphaned planned effect', () => {
    const beyond = new Date(Date.parse(NOW) - EFFECT_VISIBILITY_MS).toISOString();
    const inside = new Date(Date.parse(NOW) - EFFECT_VISIBILITY_MS + 1).toISOString();
    const view = project({
      effects: [
        effect('fx-orphan-old', 'wi-gone', { attemptCount: 1, lastAttemptAt: beyond }),
        effect('fx-orphan-live', 'wi-gone', { attemptCount: 1, lastAttemptAt: inside }),
      ],
    });
    const stale = view.queues.stale.find((card) => card.effectIds.includes('fx-orphan-old'));
    expect(stale.reasons).toContain('effect_beyond_visibility');
    expect(view.queues.attention.map((card) => card.effectIds).flat()).toContain('fx-orphan-old');
    expect(view.queues.stale.map((card) => card.effectIds).flat()).not.toContain('fx-orphan-live');
    expect(view.queues.activeAutomation.map((card) => card.effectIds).flat()).toEqual(
      expect.arrayContaining(['fx-orphan-old', 'fx-orphan-live']),
    );
  });

  it('counts malformed event and lease rows as excluded source rows', () => {
    const view = project({
      workItems: [item('wi-ok', { state: 'NEEDS_HUMAN' })],
      events: [{ garbage: true }, null],
      leases: [{ garbage: true }],
    });
    expect(view.source.events).toMatchObject({ supplied: true, included: 0, excluded: 2 });
    expect(view.source.leases).toMatchObject({ supplied: true, included: 0, excluded: 1 });
  });
});
