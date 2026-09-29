import { beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';

import {
  reconcileCompleteFindingSnapshot,
} from '../../workers/lib/mission-control-finding-reconciliation.js';
import {
  createD1WorkItemStore,
  ensureWorkItemSchema,
  WorkItemError,
} from '../../workers/mission-control-work-items.js';
import {
  persistReconciliationPlan,
  reconcileAndPersistCompleteFindingSnapshot,
} from '../../workers/mission-control-finding-persistence.js';

const D1 = 'sha256:' + '11'.repeat(32);
const D2 = 'sha256:' + '22'.repeat(32);
const D3 = 'sha256:' + '33'.repeat(32);

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

async function eventCount() {
  const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM mc_work_item_events').first();
  return Number(row?.count || 0);
}

async function eventExists(eventId) {
  return Boolean(await env.DB.prepare(
    'SELECT event_id FROM mc_work_item_events WHERE event_id = ?',
  ).bind(eventId).first());
}

beforeEach(async () => {
  await ensureWorkItemSchema(env.DB);
  await env.DB.prepare('DELETE FROM mc_work_item_events').run();
  await env.DB.prepare('DELETE FROM mc_work_item_leases').run();
  await env.DB.prepare('DELETE FROM mc_effects').run();
  await env.DB.prepare('DELETE FROM mc_work_items').run();
});

describe('Mission Control finding reconciliation persistence', () => {
  it('persists a deterministic plan and treats the exact same plan as an idempotent replay', async () => {
    const store = createD1WorkItemStore(env.DB);
    const plan = await reconcileCompleteFindingSnapshot({
      workItems: [],
      snapshot: snapshot([
        finding(),
        finding({
          propertyId: 'globaldeets.com',
          findingKey: 'operating:missing_verification_profile',
          evidenceDigest: D2,
        }),
      ]),
    });

    const first = await persistReconciliationPlan(store, plan);
    expect(first.stats).toMatchObject({ applied: 2, replayed: 0 });
    expect(await store.list()).toHaveLength(2);
    expect(await eventCount()).toBe(2);

    const replay = await persistReconciliationPlan(store, plan);
    expect(replay.stats).toMatchObject({ applied: 0, replayed: 2 });
    expect(await store.list()).toHaveLength(2);
    expect(await eventCount()).toBe(2);
  });

  it('reads the durable projection, reconciles a later snapshot, and advances one lifecycle version', async () => {
    const store = createD1WorkItemStore(env.DB);
    await reconcileAndPersistCompleteFindingSnapshot(store, snapshot([finding()]));

    const later = finding({
      observedAt: '2026-09-29T11:00:00.000Z',
      evidenceDigest: D2,
    });
    const result = await reconcileAndPersistCompleteFindingSnapshot(
      store,
      snapshot([later], { generatedAt: later.observedAt }),
    );

    expect(result.persistence.stats.applied).toBe(1);
    const [item] = await store.list();
    expect(item.occurrenceCount).toBe(2);
    expect(item.lifecycleVersion).toBe(2);
    expect(item.evidenceDigest).toBe(D2);
    expect(item.lastSeen).toBe(later.observedAt);
    expect(await eventCount()).toBe(2);
  });

  it('fails closed on a stale concurrent plan without recording its event', async () => {
    const store = createD1WorkItemStore(env.DB);
    await reconcileAndPersistCompleteFindingSnapshot(store, snapshot([finding()]));
    const prior = await store.list();

    const firstObservation = finding({
      observedAt: '2026-09-29T11:00:00.000Z',
      evidenceDigest: D2,
    });
    const winningObservation = finding({
      observedAt: '2026-09-29T12:00:00.000Z',
      evidenceDigest: D3,
    });
    const stalePlan = await reconcileCompleteFindingSnapshot({
      workItems: prior,
      snapshot: snapshot([firstObservation], { generatedAt: firstObservation.observedAt }),
    });
    const winningPlan = await reconcileCompleteFindingSnapshot({
      workItems: prior,
      snapshot: snapshot([winningObservation], { generatedAt: winningObservation.observedAt }),
    });

    await persistReconciliationPlan(store, winningPlan);
    await expect(persistReconciliationPlan(store, stalePlan)).rejects.toMatchObject({
      name: 'WorkItemError',
      code: 'version_conflict',
    });

    const [current] = await store.list();
    expect(current.lifecycleVersion).toBe(2);
    expect(current.evidenceDigest).toBe(D3);
    expect(await eventExists(stalePlan.events[0].eventId)).toBe(false);
    expect(await eventExists(winningPlan.events[0].eventId)).toBe(true);
  });

  it('journals absence only as an idempotent candidate event without mutating the work item', async () => {
    const store = createD1WorkItemStore(env.DB);
    await reconcileAndPersistCompleteFindingSnapshot(store, snapshot([finding()]));
    const before = (await store.list())[0];

    const candidatePlan = await reconcileCompleteFindingSnapshot({
      workItems: [before],
      snapshot: snapshot([], { generatedAt: '2026-09-29T11:00:00.000Z' }),
    });
    expect(candidatePlan.events[0].eventType).toBe('RESOLUTION_CANDIDATE');

    const first = await persistReconciliationPlan(store, candidatePlan);
    const replay = await persistReconciliationPlan(store, candidatePlan);
    const after = (await store.list())[0];

    expect(first.stats.candidateEventsApplied).toBe(1);
    expect(replay.stats.candidateEventsReplayed).toBe(1);
    expect(after.state).toBe('OBSERVED');
    expect(after.lifecycleVersion).toBe(before.lifecycleVersion);
    expect(after.evidenceDigest).toBe(before.evidenceDigest);
    expect(await eventExists(candidatePlan.events[0].eventId)).toBe(true);
  });

  it('rejects malformed plans before touching D1', async () => {
    const store = createD1WorkItemStore(env.DB);
    await expect(persistReconciliationPlan(store, {
      contractName: 'wrong',
      schemaVersion: '1.0.0',
      workItems: [],
      events: [],
    })).rejects.toBeInstanceOf(WorkItemError);
    expect(await store.list()).toEqual([]);
    expect(await eventCount()).toBe(0);
  });
});
