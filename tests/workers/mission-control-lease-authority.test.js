/**
 * The lease/intent invariant, through the real worker entry and real D1:
 *
 *   There is no production lease path unless durable prior intent authority can be proven.
 *
 * A lease may be issued only under a committed, eligible investigation_dispatch intent for this work
 * item, this attempt and this exact signed contract digest. Every ineligible intent fails closed, the
 * refusal changes nothing, and the same predicate is re-asserted inside the compare-and-swap that
 * records the lease.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { createObservedWorkItem, transitionWorkItem } from '../../workers/lib/mission-control-work-items.js';
import { createD1WorkItemStore, ensureWorkItemSchema, associateLease } from '../../workers/mission-control-work-items.js';
import {
  abandonEffect,
  claimDispatch,
  dispatchTarget,
  ensureOutboxSchema,
  loadEffect,
  planEffect,
  recordReceipt,
} from '../../workers/lib/mission-control-outbox.js';
import { resolveLeaseAuthority } from '../../workers/lib/mission-control-lease-authority.js';
import { authorizeDispatch, planDispatch } from './dispatch-intent.js';

const SECRET = 'sk_test_mission_control';
const WORKER_TOKEN = 'mission-control-worker-token-test';
const REVISION = '257210036bff85961a1b9c96c0572aabcaaa9cd4';

const bearer = (payload) => `header.${btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}.signature`;
const adminToken = () => bearer({ sid: 'sess_admin', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 3600 });

function testEnv() {
  return {
    ...env,
    CLERK_SECRET_KEY: SECRET,
    CLERK_SECRET_KEY_GFD: SECRET,
    MISSION_CONTROL_GITHUB_TOKEN: 'gh_test',
    MISSION_CONTROL_CONTRACT_KEY: 'mission-control-test-key',
    MISSION_CONTROL_CONTRACT_KEY_ID: 'gfd-mission-control-test',
    MISSION_CONTROL_RESULT_KEY: 'mission-control-result-key',
    MISSION_CONTROL_RESULT_KEY_ID: 'gfd-result-test',
    MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-a',
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
  };
}

const call = (path, { auth, workerAuth, body } = {}) => worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
  method: 'POST',
  headers: { ...((workerAuth || auth) ? { Authorization: `Bearer ${workerAuth || auth}` } : {}), 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
}), testEnv());

const store = () => createD1WorkItemStore(env.DB);
let counter = 0;

/** A canonical work item that is INVESTIGATION_READY with its signed contract issued through the API. */
async function readyItem() {
  counter += 1;
  const observed = await createObservedWorkItem({
    producer: 'health-sweep',
    propertyId: 'aiaimate.com',
    findingKey: `health:aiaimate:lease_authority_${counter}`,
    observedAt: '2026-09-29T07:24:48.137Z',
    evidenceDigest: `sha256:${String(counter).padStart(64, 'b')}`,
    severity: 'high',
  });
  const qualified = transitionWorkItem(observed, 'QUALIFIED', {
    repository: 'weave0/aiaimate',
    investigationProfile: 'web-health-readonly-v1',
    verificationProfile: 'gfd-property-health-production',
    verificationScope: 'production',
    verificationPredicate: 'Run the same configured health probe again and require this finding key to be absent.',
  });
  await store().save(qualified, { at: qualified.lastSeen, from: 'OBSERVED', to: 'QUALIFIED', reason: 'test', actor: 'test', detail: {} });
  const id = encodeURIComponent(qualified.workItemId);
  const issued = await call(`/api/mission-control/work-items/${id}/investigate`, { auth: adminToken(), body: { evidenceRevision: REVISION } });
  expect(issued.status).toBe(200);
  const body = await issued.json();
  return { id, workItemId: qualified.workItemId, ready: body.workItem, issued: body };
}

const lease = (ctx, body) => call(`/api/mission-control/work-items/${ctx.id}/lease`, { workerAuth: WORKER_TOKEN, body });
const leaseRows = async (workItemId) => Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM mc_work_item_leases WHERE work_item_id = ?').bind(workItemId).first()).n);
const stateOf = async (ctx) => (await store().get(ctx.workItemId));
const ago = (ms) => new Date(Date.now() - ms).toISOString();

/** The refusal is precise, fail-closed, and changed nothing. */
async function expectRefused(ctx, response, code, reason) {
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body.code).toBe(code);
  if (reason) expect(body.error).toMatch(reason);
  const after = await stateOf(ctx);
  expect(after.state).toBe('INVESTIGATION_READY');
  expect(after.activeLease).toBeNull();
  expect(await leaseRows(ctx.workItemId)).toBe(0);
  expect(after.lifecycleVersion).toBe(ctx.ready.lifecycleVersion);
}

beforeEach(async () => {
  await ensureWorkItemSchema(env.DB);
  await ensureOutboxSchema(env.DB);
  for (const table of ['mc_work_item_events', 'mc_work_item_leases', 'mc_effects', 'mc_work_items']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
  }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('no lease without a durable, eligible dispatch intent', () => {
  it('refuses a lease request that carries no intent, an unknown intent, or only half of one', async () => {
    const ctx = await readyItem();
    await expectRefused(ctx, await lease(ctx, {}), 'dispatch_intent_required');
    await expectRefused(ctx, await lease(ctx, { attempt: 1 }), 'dispatch_intent_required');
    await expectRefused(ctx, await lease(ctx, { effect_id: `gfdeffect_v1_${'0'.repeat(64)}` }), 'dispatch_intent_required');
    await expectRefused(ctx, await lease(ctx, { effect_id: `gfdeffect_v1_${'0'.repeat(64)}`, attempt: 1 }), 'dispatch_intent_required', /No such dispatch intent/);
  });

  it('refuses an intent that belongs to another work item', async () => {
    const a = await readyItem();
    const b = await readyItem();
    const forB = await authorizeDispatch(env.DB, b.ready);
    await expectRefused(a, await lease(a, forB.body), 'dispatch_intent_ineligible', /different work item/);
    expect((await stateOf(b)).state).toBe('INVESTIGATION_READY'); // and B's intent was not consumed by the attempt
    expect((await loadEffect(env.DB, forB.effectId)).status).toBe('PLANNED');
  });

  it('refuses the wrong attempt: unclaimed, expired claim, and a stale claimant after a reclaim', async () => {
    const ctx = await readyItem();
    const planned = await planDispatch(env.DB, ctx.ready, { now: ago(1_000) });
    const effectId = planned.effect.effectId;
    // planned but never claimed
    await expectRefused(ctx, await lease(ctx, { effect_id: effectId, attempt: 1 }), 'dispatch_intent_ineligible', /not been claimed/);
    // claimed, but the claim lapsed long ago
    await claimDispatch(env.DB, effectId, { now: ago(200_000) });
    await expectRefused(ctx, await lease(ctx, { effect_id: effectId, attempt: 1 }), 'dispatch_intent_ineligible', /claim expired/);
    // reclaimed by a second executor: the first claimant (attempt 1) is fenced out, attempt 2 is current
    const reclaimed = await claimDispatch(env.DB, effectId, { now: new Date().toISOString() });
    expect(reclaimed.permit.attempt).toBe(2);
    await expectRefused(ctx, await lease(ctx, { effect_id: effectId, attempt: 1 }), 'dispatch_intent_ineligible', /presented attempt/);
    await expectRefused(ctx, await lease(ctx, { effect_id: effectId, attempt: 3 }), 'dispatch_intent_ineligible', /presented attempt/);
    const current = await lease(ctx, { effect_id: effectId, attempt: 2 });
    expect(current.status).toBe(200); // the live claim is what authorizes
  });

  it('refuses an intent bound to a different contract digest, target, or effect type', async () => {
    const ctx = await readyItem();
    const other = await authorizeDispatch(env.DB, ctx.ready, { candidateDigest: `sha256:${'c'.repeat(64)}` });
    await expectRefused(ctx, await lease(ctx, other.body), 'dispatch_intent_ineligible', /not bound to this signed contract digest/);

    const good = await authorizeDispatch(env.DB, ctx.ready);
    await env.DB.prepare('UPDATE mc_effects SET target = ? WHERE effect_id = ?').bind('fwomps:other.com', good.effectId).run();
    await expectRefused(ctx, await lease(ctx, good.body), 'dispatch_intent_ineligible', /canonical dispatch target/);

    const notification = await planEffect(env.DB, {
      workItemId: ctx.workItemId,
      requestedLifecycleVersion: ctx.ready.lifecycleVersion,
      effectType: 'notification',
      target: 'operator:mission-control',
      payload: { summary: 'not a dispatch' },
    });
    const claimed = await claimDispatch(env.DB, notification.effect.effectId, { now: new Date().toISOString() });
    await expectRefused(ctx, await lease(ctx, { effect_id: notification.effect.effectId, attempt: claimed.permit.attempt }), 'dispatch_intent_ineligible', /not an investigation_dispatch/);
  });

  it('refuses an abandoned intent, even one that was validly claimed', async () => {
    const ctx = await readyItem();
    const planned = await planDispatch(env.DB, ctx.ready, { now: ago(300_000) });
    await claimDispatch(env.DB, planned.effect.effectId, { now: ago(200_000) });
    await abandonEffect(env.DB, planned.effect.effectId, 'operator withdrew the dispatch', new Date());
    expect((await loadEffect(env.DB, planned.effect.effectId)).status).toBe('FAILED');
    await expectRefused(ctx, await lease(ctx, { effect_id: planned.effect.effectId, attempt: 1 }), 'dispatch_intent_ineligible', /abandoned or failed/);
  });

  it('refuses an intent that is already consumed, and a second lease under the intent that authorized the first', async () => {
    const ctx = await readyItem();
    const committed = await authorizeDispatch(env.DB, ctx.ready);
    await recordReceipt(env.DB, committed.effectId, { attempt: committed.attempt, outcome: 'committed', receipt: 'dispatched:elsewhere' });
    await expectRefused(ctx, await lease(ctx, committed.body), 'dispatch_intent_ineligible', /already consumed/);

    const fresh = await readyItem();
    const auth = await authorizeDispatch(env.DB, fresh.ready);
    expect((await lease(fresh, auth.body)).status).toBe(200);
    const again = await lease(fresh, auth.body);
    expect(again.status).toBe(409);
    expect((await again.json()).code).toBe('dispatch_intent_ineligible'); // stale: the lease itself advanced the version
    expect(await leaseRows(fresh.workItemId)).toBe(1);
  });

  it('refuses an intent whose schema cannot prove eligibility (unknown or pre-contract)', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    await env.DB.prepare('UPDATE mc_effects SET schema_version = ? WHERE effect_id = ?').bind('gfd-effect-99', auth.effectId).run();
    await expectRefused(ctx, await lease(ctx, auth.body), 'dispatch_intent_ineligible', /unknown or pre-contract/);
    await env.DB.prepare('UPDATE mc_effects SET schema_version = NULL WHERE effect_id = ?').bind(auth.effectId).run();
    await expectRefused(ctx, await lease(ctx, auth.body), 'dispatch_intent_ineligible', /unknown or pre-contract/);
  });

  it('refuses an intent planned for an earlier lifecycle version of the item', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    await env.DB.prepare('UPDATE mc_effects SET requested_lifecycle_version = requested_lifecycle_version - 1 WHERE effect_id = ?').bind(auth.effectId).run();
    await expectRefused(ctx, await lease(ctx, auth.body), 'dispatch_intent_ineligible', /stale for the current lifecycle/);
  });

  it('lets exactly one of several concurrent duplicate lease requests through', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    const responses = await Promise.all([1, 2, 3].map(() => lease(ctx, auth.body)));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409, 409]);
    const after = await stateOf(ctx);
    expect(after.state).toBe('INVESTIGATING');
    expect(after.attemptsIssued).toBe(1);
    expect(await leaseRows(ctx.workItemId)).toBe(1);
  });

  it('refuses smuggled authority in the lease request even beside a valid intent', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    for (const extra of [{ worker_id: 'evil' }, { repair_authority: true }, { lease_token_hex: '11'.repeat(32) }]) {
      const response = await lease(ctx, { ...auth.body, ...extra });
      expect(response.status).toBe(400);
    }
    expect((await stateOf(ctx)).state).toBe('INVESTIGATION_READY');
  });
});

describe('a committed, eligible intent authorizes the lease', () => {
  it('issues exactly one lease, records which intent authorized it, and leaves the intent claimed (not executed)', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    const response = await lease(ctx, auth.body);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.workItem.state).toBe('INVESTIGATING');
    expect(body.leaseGrant.contract_digest).toBe(ctx.ready.investigation.digest);
    expect(await leaseRows(ctx.workItemId)).toBe(1);

    const event = await env.DB.prepare(
      "SELECT detail_json FROM mc_work_item_events WHERE work_item_id = ? AND to_state = 'INVESTIGATING'",
    ).bind(ctx.workItemId).first();
    expect(JSON.parse(event.detail_json).dispatchIntent).toEqual({
      effectId: auth.effectId,
      attempt: 1,
      candidateDigest: ctx.ready.investigation.digest,
    });
    // GFD recorded and authorized intent; it executed nothing and the outbox gained no authority.
    expect(await loadEffect(env.DB, auth.effectId)).toMatchObject({ status: 'PLANNED', attemptCount: 1 });
  });

  it('after an abandoned attempt, a fresh contract digest plans a distinct intent and leases without collision', async () => {
    const ctx = await readyItem();
    const first = await authorizeDispatch(env.DB, ctx.ready);
    expect((await lease(ctx, first.body)).status).toBe(200);
    await env.DB.prepare('UPDATE mc_work_items SET lease_expires_at = ? WHERE work_item_id = ?').bind('2020-01-01T00:00:00.000Z', ctx.workItemId).run();
    const expired = await call(`/api/mission-control/work-items/${ctx.id}/expire`, { auth: adminToken() });
    expect(expired.status).toBe(200);
    const reissued = await call(`/api/mission-control/work-items/${ctx.id}/investigate`, { auth: adminToken(), body: { evidenceRevision: REVISION } });
    expect(reissued.status).toBe(200);
    const ready2 = (await reissued.json()).workItem;
    expect(ready2.investigation.digest).not.toBe(ctx.ready.investigation.digest);

    // Same contract: planning is idempotent. New contract: a different intent, no identity collision.
    const again = await planDispatch(env.DB, ready2);
    const replanned = await planDispatch(env.DB, ready2);
    expect(replanned.created).toBe(false);
    expect(replanned.effect.effectId).toBe(again.effect.effectId);
    expect(again.effect.effectId).not.toBe(first.effectId);

    // The old intent can never authorize the new contract; the new one can.
    const claimed = await claimDispatch(env.DB, again.effect.effectId, { now: new Date().toISOString() });
    const ctx2 = { ...ctx, ready: ready2 };
    const stale = await lease(ctx2, first.body);
    expect(stale.status).toBe(409);
    expect((await stale.json()).code).toBe('dispatch_intent_ineligible');
    const fresh = await lease(ctx2, { effect_id: again.effect.effectId, attempt: claimed.permit.attempt });
    expect(fresh.status).toBe(200);
    expect((await stateOf(ctx)).state).toBe('INVESTIGATING');
  });
});

describe('the invariant is structural and atomic, not only a route check', () => {
  async function pendingLease(ctx) {
    const current = await store().get(ctx.workItemId);
    const at = new Date().toISOString();
    const next = associateLease(current, {
      workerId: 'fwomps-worker-a',
      attempt: 1,
      leaseTokenDigest: `sha256:${'a'.repeat(64)}`,
      expiresAt: current.investigation.expiresAt,
      requestId: current.investigation.requestId,
    }, at);
    const event = { at, from: current.state, to: next.state, reason: 'direct store write', actor: 'test', detail: {} };
    return { current, next, event };
  }

  it('the store refuses to record any new lease that carries no authority guard', async () => {
    const ctx = await readyItem();
    const { current, next, event } = await pendingLease(ctx);
    await expect(store().save(next, event)).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion })).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    expect((await stateOf(ctx)).state).toBe('INVESTIGATION_READY');
    expect(await leaseRows(ctx.workItemId)).toBe(0);
  });

  it('a guard cannot be attached to a save that issues no lease', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    const { guard } = await resolveLeaseAuthority(env.DB, await store().get(ctx.workItemId), auth.body, new Date().toISOString());
    const current = await store().get(ctx.workItemId);
    await expect(store().save(current, null, { expectedVersion: current.lifecycleVersion, leaseAuthority: guard }))
      .rejects.toMatchObject({ code: 'malformed_lease' });
  });

  it('an intent abandoned, consumed or reclaimed between the check and the write still fails closed', async () => {
    for (const interfere of [
      (effectId) => env.DB.prepare("UPDATE mc_effects SET status = 'FAILED', terminal_reason = 'abandoned mid-flight' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET status = 'COMMITTED', receipt_ref = 'elsewhere' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare('UPDATE mc_effects SET attempt_count = attempt_count + 1 WHERE effect_id = ?').bind(effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET last_attempt_at = '2020-01-01T00:00:00.000Z' WHERE effect_id = ?").bind(effectId).run(),
      // each remaining predicate, flipped after the read-path check passed (so only the SQL guard can catch it)
      (effectId) => env.DB.prepare('UPDATE mc_effects SET candidate_digest = ? WHERE effect_id = ?').bind(`sha256:${'f'.repeat(64)}`, effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET schema_version = 'gfd-effect-99' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET work_item_id = 'gfdwi_v1_someone_else' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET target = 'fwomps:other.com' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET effect_type = 'notification' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare('UPDATE mc_effects SET requested_lifecycle_version = requested_lifecycle_version + 1 WHERE effect_id = ?').bind(effectId).run(),
    ]) {
      const ctx = await readyItem();
      const auth = await authorizeDispatch(env.DB, ctx.ready);
      const { current, next, event } = await pendingLease(ctx);
      const proven = await resolveLeaseAuthority(env.DB, current, auth.body, event.at); // eligible right now
      await interfere(auth.effectId); // ...and not by the time the lease is recorded
      await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority: proven.guard }))
        .rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
      const after = await stateOf(ctx);
      expect(after.state).toBe('INVESTIGATION_READY');
      expect(after.activeLease).toBeNull();
      expect(await leaseRows(ctx.workItemId)).toBe(0);
    }
  });
});

describe('dispatch intents are planned under the same identity rules', () => {
  it('requires the contract digest, the canonical target, and an INVESTIGATION_READY work item', async () => {
    const ctx = await readyItem();
    const base = {
      workItemId: ctx.workItemId,
      requestedLifecycleVersion: ctx.ready.lifecycleVersion,
      effectType: 'investigation_dispatch',
      payload: { summary: 'dispatch', propertyId: 'aiaimate.com' },
    };
    await expect(planEffect(env.DB, { ...base, target: dispatchTarget('aiaimate.com') })).rejects.toThrow(/must bind the signed contract digest/);
    await expect(planEffect(env.DB, { ...base, target: 'fwomps:other.com', candidateDigest: ctx.ready.investigation.digest })).rejects.toThrow(/canonical target/);
    const valid = await planEffect(env.DB, { ...base, target: dispatchTarget('aiaimate.com'), candidateDigest: ctx.ready.investigation.digest });
    expect(valid.created).toBe(true);

    // an item that is not INVESTIGATION_READY cannot have a dispatch planned for it
    const observed = await createObservedWorkItem({
      producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: 'health:aiaimate:not_ready',
      observedAt: '2026-09-29T07:24:48.137Z', evidenceDigest: `sha256:${'d'.repeat(64)}`, severity: 'high',
    });
    const saved = await store().save(observed, { at: observed.lastSeen, from: null, to: 'OBSERVED', reason: 'test', actor: 'test', detail: {} });
    await expect(planEffect(env.DB, {
      workItemId: saved.workItemId,
      requestedLifecycleVersion: saved.lifecycleVersion,
      effectType: 'investigation_dispatch',
      target: dispatchTarget('aiaimate.com'),
      candidateDigest: `sha256:${'e'.repeat(64)}`,
      payload: { summary: 'too early' },
    })).rejects.toThrow(/INVESTIGATION_READY/);
  });
});
