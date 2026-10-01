import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

import { createObservedWorkItem } from '../../workers/lib/mission-control-work-items.js';
import {
  createD1WorkItemStore,
  ensureWorkItemSchema,
} from '../../workers/mission-control-work-items.js';
import {
  EFFECT_SCHEMA_VERSION,
  abandonEffect,
  canonicalPayload,
  claimDispatch,
  dispatchOnce,
  ensureOutboxSchema,
  loadEffect,
  planEffect,
  recordReceipt,
} from '../../workers/lib/mission-control-outbox.js';

const T0 = '2026-09-29T12:00:00.000Z';
const T_IN_FLIGHT = '2026-09-29T12:00:30.000Z';
const T_VISIBLE = '2026-09-29T12:02:00.000Z';

async function workItem(findingKey) {
  await ensureWorkItemSchema(env.DB);
  const observed = await createObservedWorkItem({
    producer: 'health-sweep',
    propertyId: 'aiaimate.com',
    findingKey,
    observedAt: '2026-09-29T07:24:48.137Z',
    evidenceDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    severity: 'high',
  });
  const store = createD1WorkItemStore(env.DB);
  return store.save(observed, {
    at: observed.lastSeen,
    from: null,
    to: 'OBSERVED',
    reason: 'fixture',
    actor: 'test',
    detail: {},
  });
}

function intent(item, overrides = {}) {
  return {
    workItemId: item.workItemId,
    requestedLifecycleVersion: item.lifecycleVersion,
    effectType: 'notification',
    target: 'operator:mission-control',
    payload: { summary: 'needs a look', propertyId: 'aiaimate.com' },
    now: T0,
    ...overrides,
  };
}

async function effectCount(workItemId) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM mc_effects WHERE work_item_id = ?',
  ).bind(workItemId).first();
  return Number(row.n);
}

async function eventCount(workItemId, eventType) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND event_type = ?',
  ).bind(workItemId, eventType).first();
  return Number(row.n);
}

// Wraps D1 so a test can run a competing write just before the fenced batch
// whose SQL mentions the marker; schema-setup batches pass straight through.
function racingDb(marker, beforeBatch) {
  let armed = false;
  return {
    prepare: (sql) => {
      if (sql.includes(marker)) armed = true;
      return env.DB.prepare(sql);
    },
    batch: async (statements) => {
      if (armed) {
        armed = false;
        await beforeBatch();
      }
      return env.DB.batch(statements);
    },
  };
}

describe('mission control effect outbox', () => {
  it('rejects authority-bearing payloads before any write', async () => {
    const item = await workItem('outbox:forbidden');
    await expect(planEffect(env.DB, intent(item, {
      payload: { summary: 'no', permitted_paths: ['src'] },
    }))).rejects.toThrow(/cannot travel/);
    await expect(planEffect(env.DB, intent(item, {
      payload: { summary: 'ratio', confidenceBps: 1.5 },
    }))).rejects.toThrow(/safe integers/);
    await expect(planEffect(env.DB, intent(item, { effectType: 'repair' }))).rejects.toThrow(/outside the outbox/);
    expect(await effectCount(item.workItemId)).toBe(0);
    expect(canonicalPayload({ b: 1, a: 'x' })).toBe('{"a":"x","b":1}');
  });

  it('commits one intent idempotently and refuses a different payload for that id', async () => {
    const item = await workItem('outbox:idempotent');
    const first = await planEffect(env.DB, intent(item));
    const second = await planEffect(env.DB, intent(item));
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.effect.effectId).toBe(first.effect.effectId);
    expect(second.effect.idempotencyKey).toBe(first.effect.effectId);
    expect(second.effect.schemaVersion).toBe(EFFECT_SCHEMA_VERSION);
    expect(second.effect.status).toBe('PLANNED');
    expect(second.effect.requestedLifecycleVersion).toBe(item.lifecycleVersion);
    expect(await effectCount(item.workItemId)).toBe(1);
    expect(await eventCount(item.workItemId, 'effect_intent')).toBe(1);

    const stored = await env.DB.prepare(
      'SELECT lifecycle_state, lifecycle_version FROM mc_work_items WHERE work_item_id = ?',
    ).bind(item.workItemId).first();
    expect(stored.lifecycle_state).toBe('OBSERVED');
    expect(Number(stored.lifecycle_version)).toBe(item.lifecycleVersion);

    const event = await env.DB.prepare(
      'SELECT from_state, to_state, detail_json FROM mc_work_item_events WHERE event_id = ?',
    ).bind(first.effect.causalEventId).first();
    expect(event.from_state).toBe('OBSERVED');
    expect(event.to_state).toBe('OBSERVED');
    expect(JSON.parse(event.detail_json).payloadDigest).toBe(first.effect.payloadDigest);

    await expect(planEffect(env.DB, intent(item, {
      payload: { summary: 'a different consequence' },
    }))).rejects.toThrow(/different intent/);
    expect(await effectCount(item.workItemId)).toBe(1);
  });

  it('rejects a plan read from a stale lifecycle version and writes nothing', async () => {
    const item = await workItem('outbox:stale-plan');
    await expect(planEffect(env.DB, intent(item, { requestedLifecycleVersion: item.lifecycleVersion + 1 })))
      .rejects.toThrow(/lifecycle version/);
    expect(await effectCount(item.workItemId)).toBe(0);
  });

  it('fences dispatch by lifecycle version and by attempt', async () => {
    const item = await workItem('outbox:fence');
    const planned = await planEffect(env.DB, intent(item, { effectType: 'reverification_request', target: 'production:aiaimate.com' }));
    const claimed = await claimDispatch(env.DB, planned.effect.effectId, { now: T0 });
    expect(claimed.permit.delivery).toBe('at-least-once');
    expect(claimed.permit.attempt).toBe(1);
    expect(claimed.permit.payload.summary).toBe('needs a look');

    const busy = await claimDispatch(env.DB, planned.effect.effectId, { now: T_IN_FLIGHT });
    expect(busy.permit).toBeNull();
    expect(busy.reason).toBe('in_flight');

    await expect(recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 2,
      outcome: 'committed',
      receipt: 'probe:stale',
      now: T_IN_FLIGHT,
    })).rejects.toThrow(/fence/);

    const recovered = await claimDispatch(env.DB, planned.effect.effectId, { now: T_VISIBLE });
    expect(recovered.permit.attempt).toBe(2);

    await expect(recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 1,
      outcome: 'committed',
      receipt: 'probe:late',
      now: T_VISIBLE,
    })).rejects.toThrow(/fence/);

    const recorded = await recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 2,
      outcome: 'committed',
      receipt: 'probe:fresh',
      now: T_VISIBLE,
    });
    expect(recorded.created).toBe(true);
    expect(recorded.effect.status).toBe('COMMITTED');
    expect(recorded.effect.receiptRef).toBe('probe:fresh');
    expect(recorded.effect.providerRef).toBe('probe:fresh');

    const replay = await recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 2,
      outcome: 'committed',
      receipt: 'probe:fresh',
      now: T_VISIBLE,
    });
    expect(replay.created).toBe(false);

    await expect(recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 2,
      outcome: 'committed',
      receipt: 'probe:other',
      now: T_VISIBLE,
    })).rejects.toThrow(/different receipt/);

    await env.DB.prepare('UPDATE mc_work_items SET lifecycle_version = lifecycle_version + 1 WHERE work_item_id = ?')
      .bind(item.workItemId).run();
    const other = await planEffect(env.DB, intent(item, {
      effectType: 'github_issue',
      target: 'weave0/goodflippindesign#340',
      requestedLifecycleVersion: item.lifecycleVersion + 1,
    }));
    await env.DB.prepare('UPDATE mc_work_items SET lifecycle_version = lifecycle_version + 1 WHERE work_item_id = ?')
      .bind(item.workItemId).run();
    const stale = await claimDispatch(env.DB, other.effect.effectId, { now: T0 });
    expect(stale.permit).toBeNull();
    expect(stale.reason).toBe('stale_lifecycle');
    expect(stale.effect.attemptCount).toBe(0);
  });

  it('does not call the executor again after a receipt, and a crash leaves the intent planned', async () => {
    const item = await workItem('outbox:dispatcher');
    const planned = await planEffect(env.DB, intent(item, { effectType: 'reverification_request', target: 'production:aiaimate.com' }));
    let calls = 0;
    const crashed = await dispatchOnce(env.DB, planned.effect.effectId, async () => {
      calls += 1;
      throw new Error('dispatcher died after the remote call');
    }, { now: T0 });
    expect(crashed.dispatched).toBe(false);
    expect(crashed.reason).toBe('executor_failed');
    expect(calls).toBe(1);
    expect((await loadEffect(env.DB, planned.effect.effectId)).status).toBe('PLANNED');
    expect((await loadEffect(env.DB, planned.effect.effectId)).attemptCount).toBe(1);

    const done = await dispatchOnce(env.DB, planned.effect.effectId, async (permit) => {
      calls += 1;
      expect(permit.attempt).toBe(2);
      expect(permit.effectType).toBe('reverification_request');
      return { outcome: 'committed', receipt: 'intent-only' };
    }, { now: T_VISIBLE });
    expect(done.dispatched).toBe(true);
    expect(done.effect.status).toBe('COMMITTED');

    const quiet = await dispatchOnce(env.DB, planned.effect.effectId, async () => {
      calls += 1;
      return { outcome: 'committed', receipt: 'intent-only' };
    }, { now: T_VISIBLE });
    expect(quiet.dispatched).toBe(false);
    expect(quiet.reason).toBe('terminal');
    expect(calls).toBe(2);
  });

  it('abandons a planned effect once and then refuses dispatch', async () => {
    const item = await workItem('outbox:abandon');
    const planned = await planEffect(env.DB, intent(item, { effectType: 'pull_request', target: 'weave0/goodflippindesign' }));
    const abandoned = await abandonEffect(env.DB, planned.effect.effectId, 'operator withdrew the intent', T0);
    expect(abandoned.effect.status).toBe('FAILED');
    expect(abandoned.effect.terminalReason).toBe('operator withdrew the intent');
    const again = await abandonEffect(env.DB, planned.effect.effectId, 'operator withdrew the intent', T_IN_FLIGHT);
    expect(again.created).toBe(false);
    expect(await eventCount(item.workItemId, 'effect_abandoned')).toBe(1);
    const claim = await claimDispatch(env.DB, planned.effect.effectId, { now: T_VISIBLE });
    expect(claim.reason).toBe('terminal');
    await expect(abandonEffect(env.DB, planned.effect.effectId, 'a different story', T_VISIBLE)).rejects.toThrow(/different terminal|only a planned/);
  });

  it('preserves a legacy effect row and refuses to dispatch it or an unknown schema', async () => {
    const item = await workItem('outbox:legacy');
    const legacyId = `gfdeffect_v1_${'ab'.repeat(32)}`;
    await env.DB.prepare(`
      INSERT INTO mc_effects (
        effect_id, work_item_id, effect_type, target, status, created_at
      ) VALUES (?, ?, 'notification', 'operator:legacy', 'PLANNED', ?)
    `).bind(legacyId, item.workItemId, T0).run();
    const legacy = await loadEffect(env.DB, legacyId);
    expect(legacy.legacy).toBe(true);
    expect(legacy.dispatchable).toBe(false);
    await expect(claimDispatch(env.DB, legacyId, { now: T0 })).rejects.toThrow(/pre-contract/);

    const unknownId = `gfdeffect_v1_${'cd'.repeat(32)}`;
    await env.DB.prepare(`
      INSERT INTO mc_effects (
        effect_id, work_item_id, effect_type, target, status, created_at, schema_version
      ) VALUES (?, ?, 'notification', 'operator:unknown', 'PLANNED', ?, 'gfd-effect-99')
    `).bind(unknownId, item.workItemId, T0).run();
    await expect(loadEffect(env.DB, unknownId)).rejects.toThrow(/unsupported effect schema/);
    await expect(claimDispatch(env.DB, unknownId, { now: T0 })).rejects.toThrow(/unsupported effect schema/);
    const stillThere = await env.DB.prepare(
      'SELECT schema_version, status FROM mc_effects WHERE effect_id = ?',
    ).bind(unknownId).first();
    expect(stillThere.schema_version).toBe('gfd-effect-99');
    expect(stillThere.status).toBe('PLANNED');
  });

  it('rejects authority under any key casing and anything outside the closed schema', async () => {
    const item = await workItem('outbox:closed-schema');
    for (const payload of [
      { summary: 'x', apiToken: 't' },
      { summary: 'x', verification_commands: 'npm test' },
      { summary: 'x', repairScope: 'src' },
      { summary: 'x', Command: 'rm' },
      { summary: 'x', unlisted: 'value' },
      { summary: 'x', propertyId: { nested: 'object' } },
    ]) {
      await expect(planEffect(env.DB, intent(item, { payload }))).rejects.toThrow(/cannot travel|payload schema|scalar/);
    }
    expect(await effectCount(item.workItemId)).toBe(0);
  });

  it('refuses a stale caller replaying an existing effect id', async () => {
    const item = await workItem('outbox:stale-replay');
    await planEffect(env.DB, intent(item));
    await expect(planEffect(env.DB, intent(item, { requestedLifecycleVersion: item.lifecycleVersion + 1 })))
      .rejects.toThrow(/lifecycle version/);
    await env.DB.prepare('UPDATE mc_work_items SET lifecycle_version = lifecycle_version + 1 WHERE work_item_id = ?')
      .bind(item.workItemId).run();
    await expect(planEffect(env.DB, intent(item))).rejects.toThrow(/lifecycle version/);
  });

  it('writes nothing when the lifecycle advances between the read and the batch', async () => {
    const item = await workItem('outbox:plan-race');
    const racing = racingDb('effect_intent', () => env.DB
      .prepare('UPDATE mc_work_items SET lifecycle_version = lifecycle_version + 1 WHERE work_item_id = ?')
      .bind(item.workItemId).run());
    await expect(planEffect(racing, intent(item))).rejects.toThrow(/advanced/);
    expect(await effectCount(item.workItemId)).toBe(0);
    expect(await eventCount(item.workItemId, 'effect_intent')).toBe(0);
  });

  it('does not record an abandonment that lost the race to a receipt', async () => {
    const item = await workItem('outbox:abandon-race');
    const planned = await planEffect(env.DB, intent(item, { effectType: 'pull_request', target: 'weave0/goodflippindesign' }));
    await claimDispatch(env.DB, planned.effect.effectId, { now: T0 });
    const racing = racingDb('effect_abandoned', () => recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 1, outcome: 'committed', receipt: 'pr:opened', now: T_VISIBLE,
    }));
    await expect(abandonEffect(racing, planned.effect.effectId, 'operator withdrew', T_VISIBLE))
      .rejects.toThrow(/changed before/);
    expect((await loadEffect(env.DB, planned.effect.effectId)).status).toBe('COMMITTED');
    expect(await eventCount(item.workItemId, 'effect_abandoned')).toBe(0);
  });

  it('refuses to abandon an effect whose executor may still be running', async () => {
    const item = await workItem('outbox:abandon-inflight');
    const planned = await planEffect(env.DB, intent(item));
    await claimDispatch(env.DB, planned.effect.effectId, { now: T0 });
    await expect(abandonEffect(env.DB, planned.effect.effectId, 'too eager', T_IN_FLIGHT)).rejects.toThrow(/may still be running/);
    expect((await loadEffect(env.DB, planned.effect.effectId)).status).toBe('PLANNED');
  });

  it('rejects a non-positive visibility window instead of disabling the fence', async () => {
    const item = await workItem('outbox:visibility');
    const planned = await planEffect(env.DB, intent(item));
    for (const visibilityMs of [0, -5, 1.5]) {
      await expect(claimDispatch(env.DB, planned.effect.effectId, { now: T0, visibilityMs })).rejects.toThrow(/positive integer/);
    }
    expect((await loadEffect(env.DB, planned.effect.effectId)).attemptCount).toBe(0);
  });

  it('rejects an older attempt replaying a receipt after a newer attempt committed', async () => {
    const item = await workItem('outbox:late-replay');
    const planned = await planEffect(env.DB, intent(item));
    await claimDispatch(env.DB, planned.effect.effectId, { now: T0 });
    await claimDispatch(env.DB, planned.effect.effectId, { now: T_VISIBLE });
    await recordReceipt(env.DB, planned.effect.effectId, { attempt: 2, outcome: 'committed', receipt: 'probe:same', now: T_VISIBLE });
    await expect(recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 1, outcome: 'committed', receipt: 'probe:same', now: T_VISIBLE,
    })).rejects.toThrow(/fence/);
  });

  it('refuses a claim when the lifecycle advances between the read and the claim update', async () => {
    const item = await workItem('outbox:claim-race');
    const planned = await planEffect(env.DB, intent(item));
    let armed = false;
    const racing = {
      prepare: (sql) => {
        const statement = env.DB.prepare(sql);
        if (!sql.includes('SET attempt_count = attempt_count + 1')) return statement;
        armed = true;
        return {
          bind: (...args) => {
            const bound = statement.bind(...args);
            return {
              run: async () => {
                if (armed) {
                  armed = false;
                  await env.DB.prepare('UPDATE mc_work_items SET lifecycle_version = lifecycle_version + 1 WHERE work_item_id = ?')
                    .bind(item.workItemId).run();
                }
                return bound.run();
              },
            };
          },
        };
      },
      batch: (statements) => env.DB.batch(statements),
    };
    const claim = await claimDispatch(racing, planned.effect.effectId, { now: T0 });
    expect(claim.permit).toBeNull();
    expect(claim.reason).toBe('stale_lifecycle');
    expect((await loadEffect(env.DB, planned.effect.effectId)).attemptCount).toBe(0);
  });

  it('survives concurrent first use of the schema', async () => {
    await Promise.all([1, 2, 3, 4].map(() => ensureOutboxSchema(env.DB)));
  });

  it('records a terminal executor failure once', async () => {
    const item = await workItem('outbox:failed-receipt');
    const planned = await planEffect(env.DB, intent(item, { effectType: 'deployment', target: 'cloudflare:gfd-health-sweep' }));
    const failed = await dispatchOnce(env.DB, planned.effect.effectId, async () => ({
      outcome: 'failed',
      reason: 'provider rejected the idempotency key',
    }), { now: T0 });
    expect(failed.effect.status).toBe('FAILED');
    expect(failed.effect.terminalReason).toBe('provider rejected the idempotency key');
    const replay = await recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 1,
      outcome: 'failed',
      reason: 'provider rejected the idempotency key',
      now: T_IN_FLIGHT,
    });
    expect(replay.created).toBe(false);
    await expect(recordReceipt(env.DB, planned.effect.effectId, {
      attempt: 1,
      outcome: 'committed',
      receipt: 'deploy:late',
      now: T_VISIBLE,
    })).rejects.toThrow(/different terminal/);
  });
});
