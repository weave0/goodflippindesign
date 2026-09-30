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
import { LOADED_VERSION, createD1WorkItemStore, ensureWorkItemSchema, associateLease } from '../../workers/mission-control-work-items.js';
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

describe('the invariant is structural and atomic: the STORE proves it at write time', () => {
  /** A saved-but-unwritten lease for an INVESTIGATION_READY item, exactly as the API route builds it. */
  async function pendingLease(ctx, leaseTokenDigest = `sha256:${'a'.repeat(64)}`) {
    const current = await store().get(ctx.workItemId);
    const at = new Date().toISOString();
    const next = associateLease(current, {
      workerId: 'fwomps-worker-a',
      attempt: 1,
      leaseTokenDigest,
      expiresAt: current.investigation.expiresAt,
      requestId: current.investigation.requestId,
    }, at);
    const event = { at, from: current.state, to: next.state, reason: 'direct store write', actor: 'test', detail: {} };
    return { current, next, event };
  }
  const authorityFor = (auth, ctx) => ({ effectId: auth.effectId, attempt: auth.attempt, contractDigest: ctx.ready.investigation.digest });
  const untouched = async (ctx) => {
    const after = await stateOf(ctx);
    expect(after.state).toBe('INVESTIGATION_READY');
    expect(after.activeLease).toBeNull();
    expect(after.lifecycleVersion).toBe(ctx.ready.lifecycleVersion);
    expect(await leaseRows(ctx.workItemId)).toBe(0);
  };

  it('legitimate typed authority still succeeds and records the lease', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    const { current, next, event } = await pendingLease(ctx);
    const saved = await store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority: authorityFor(auth, ctx) });
    expect(saved.state).toBe('INVESTIGATING');
    expect(saved.activeLease.leaseId).toBe(`sha256:${'a'.repeat(64)}`);
    expect(await leaseRows(ctx.workItemId)).toBe(1);
  });

  it('refuses a new lease with no authority at all, however the caller reaches the store', async () => {
    const ctx = await readyItem();
    const { current, next, event } = await pendingLease(ctx);
    await expect(store().save(next, event)).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion })).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority: undefined })).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority: null })).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    await untouched(ctx);
  });

  it('refuses a forged clause, a permissive predicate, bind arrays and every non-data authority', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    const good = authorityFor(auth, ctx);
    const { current, next, event } = await pendingLease(ctx);
    class Forged { constructor() { Object.assign(this, good); } }
    const forgeries = [
      { clause: ' AND 1 = 1', binds: [] },                                   // the reviewer's permissive predicate
      { clause: ' OR 1 = 1', binds: [] },
      { ...good, clause: ' OR 1 = 1' },                                      // valid data plus a smuggled clause
      { ...good, binds: [1] },
      { ...good, sql: '1=1' },
      { ...good, previousLease: null },                                      // a claim about the previous lease
      { ...good, loadedLease: `sha256:${'a'.repeat(64)}` },
      { effectId: auth.effectId, attempt: auth.attempt },                    // missing contractDigest
      { attempt: auth.attempt, contractDigest: good.contractDigest },        // missing effectId
      { ...good, effectId: "gfdeffect_v1_' OR '1'='1" },                     // injection-shaped identity
      { ...good, effectId: `${auth.effectId} OR 1=1` },
      { ...good, contractDigest: "sha256:' OR 1=1 --" },
      { ...good, attempt: '1 OR 1=1' },
      { ...good, attempt: 0 }, { ...good, attempt: -1 }, { ...good, attempt: 1.5 }, { ...good, attempt: Number.NaN },
      { ...good, attempt: Number.MAX_SAFE_INTEGER + 2 },
      new Forged(),                                                          // class instance with the right fields
      Object.assign(() => {}, good),                                         // function with the right fields
      [good],
      'AND 1=1',
      1,
      {},
    ];
    for (const leaseAuthority of forgeries) {
      await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority }), JSON.stringify(leaseAuthority)).rejects.toMatchObject({ code: 'malformed_lease' });
    }
    await untouched(ctx);
    // and the well-formed version of the same data is what works
    expect((await store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority: good })).state).toBe('INVESTIGATING');
  });

  it('cannot be fooled by spoofed previous-lease state: there is no marker to overwrite', async () => {
    const ctx = await readyItem();
    const { current, next, event } = await pendingLease(ctx);
    // The old design trusted a symbol on the item. Every spelling of it is now inert.
    for (const name of ['gfd.mc.workItem.loadedLease', 'gfd.mc.workItem.loadedVersion', 'loadedLease', 'previousLease']) {
      next[Symbol.for(name)] = next.activeLease.leaseId;
      next[name] = next.activeLease.leaseId;
    }
    next[LOADED_VERSION] = current.lifecycleVersion;
    await expect(store().save(next, event)).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion })).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    await untouched(ctx);
  });

  it('refuses a hand-built item that was never loaded, and a brand-new row that already holds a lease', async () => {
    const ctx = await readyItem();
    const { next } = await pendingLease(ctx);
    // a never-loaded copy cannot update the existing row at all, lease or not
    const forgedCopy = { ...next };
    delete forgedCopy[LOADED_VERSION];
    await expect(store().save(forgedCopy, null)).rejects.toMatchObject({ code: 'version_conflict' }); // a never-loaded copy can only INSERT
    await untouched(ctx);

    // a brand-new row born holding a lease is refused even when its version is forged
    const observed = await createObservedWorkItem({
      producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: 'health:aiaimate:born_leased',
      observedAt: '2026-09-29T07:24:48.137Z', evidenceDigest: `sha256:${'9'.repeat(64)}`, severity: 'high',
    });
    const born = { ...observed, activeLease: { leaseId: `sha256:${'b'.repeat(64)}`, workerId: 'fwomps-worker-a', expiresAt: '2099-01-01T00:00:00.000Z', attempt: 1 } };
    for (const variant of [born, { ...born, [LOADED_VERSION]: born.lifecycleVersion }]) {
      await expect(store().save(variant, null)).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    }
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM mc_work_items WHERE work_item_id = ?').bind(observed.workItemId).first();
    expect(Number(row.n)).toBe(0);
    expect(await leaseRows(observed.workItemId)).toBe(0);
  });

  it('refuses mismatched authority fields: another item, another attempt, another digest, a digest the journal never issued', async () => {
    const a = await readyItem();
    const b = await readyItem();
    const forA = await authorizeDispatch(env.DB, a.ready);
    const forB = await authorizeDispatch(env.DB, b.ready);
    const { current, next, event } = await pendingLease(a);
    const save = (leaseAuthority) => store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority });
    const goodA = authorityFor(forA, a);
    await expect(save({ ...goodA, effectId: forB.effectId })).rejects.toMatchObject({ code: 'dispatch_intent_ineligible' }); // another work item's intent
    await expect(save({ ...goodA, attempt: goodA.attempt + 1 })).rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
    await expect(save({ ...goodA, contractDigest: b.ready.investigation.digest })).rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
    await expect(save({ ...goodA, contractDigest: `sha256:${'f'.repeat(64)}` })).rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
    await untouched(a);

    // A forged intent row bound to a digest the item's persisted issuance journal never produced
    // cannot authorize a lease, even though every other predicate holds.
    const forgedDigest = `sha256:${'e'.repeat(64)}`;
    const forgedId = `gfdeffect_v1_${'c'.repeat(64)}`;
    await env.DB.prepare(`
      INSERT INTO mc_effects (effect_id, work_item_id, effect_type, target, candidate_digest, status, created_at, schema_version,
        requested_lifecycle_version, attempt_count, last_attempt_at, idempotency_key)
      VALUES (?, ?, 'investigation_dispatch', 'fwomps:aiaimate.com', ?, 'PLANNED', ?, 'gfd-effect-1', ?, 1, ?, ?)
    `).bind(forgedId, a.workItemId, forgedDigest, new Date().toISOString(), a.ready.lifecycleVersion, new Date().toISOString(), forgedId).run();
    await expect(save({ effectId: forgedId, attempt: 1, contractDigest: forgedDigest })).rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
    await untouched(a);
    // the legitimate pair still works
    expect((await save(goodA)).state).toBe('INVESTIGATING');
  });

  it('an old contract digest cannot authorize a lease after the item was re-issued a newer contract', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    const { current, next, event } = await pendingLease(ctx);
    // A later issuance event for the same item: the persisted journal now names a different current contract.
    await env.DB.prepare(`
      INSERT INTO mc_work_item_events (event_id, work_item_id, event_type, from_state, to_state, occurred_at, actor_type, actor_id, evidence_digest, detail_json)
      VALUES ('evt_reissued', ?, 'transition', 'QUALIFIED', 'INVESTIGATION_READY', '2099-01-01T00:00:00.000Z', 'runtime', 'test', ?, ?)
    `).bind(ctx.workItemId, current.evidenceDigest, JSON.stringify({ investigation: { digest: `sha256:${'d'.repeat(64)}` } })).run();
    await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority: authorityFor(auth, ctx) }))
      .rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
    await untouched(ctx);
  });

  it('replacing an active lease is also an issuance: it needs authority, while clearing or keeping one does not', async () => {
    const ctx = await readyItem();
    const auth = await authorizeDispatch(env.DB, ctx.ready);
    expect((await lease(ctx, auth.body)).status).toBe(200);
    const leased = await store().get(ctx.workItemId);
    const replaced = { ...leased, activeLease: { ...leased.activeLease, leaseId: `sha256:${'7'.repeat(64)}` } };
    await expect(store().save(replaced, null)).rejects.toMatchObject({ code: 'dispatch_intent_required' });
    expect((await store().get(ctx.workItemId)).activeLease.leaseId).toBe(leased.activeLease.leaseId);
    // keeping the stored lease (an ordinary observation write) is unaffected, and inert authority changes nothing
    const kept = await store().save({ ...leased, occurrenceCount: (leased.occurrenceCount ?? 0) + 1 }, null,
      { leaseAuthority: { effectId: auth.effectId, attempt: auth.attempt, contractDigest: ctx.ready.investigation.digest } });
    expect(kept.activeLease.leaseId).toBe(leased.activeLease.leaseId);
    expect(await leaseRows(ctx.workItemId)).toBe(1);
  });

  it('an intent abandoned, consumed, reclaimed, re-issued or flipped between the check and the write still fails closed', async () => {
    for (const interfere of [
      (effectId) => env.DB.prepare("UPDATE mc_effects SET status = 'FAILED', terminal_reason = 'abandoned mid-flight' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET status = 'COMMITTED', receipt_ref = 'elsewhere' WHERE effect_id = ?").bind(effectId).run(),
      (effectId) => env.DB.prepare('UPDATE mc_effects SET attempt_count = attempt_count + 1 WHERE effect_id = ?').bind(effectId).run(),
      (effectId) => env.DB.prepare("UPDATE mc_effects SET last_attempt_at = '2020-01-01T00:00:00.000Z' WHERE effect_id = ?").bind(effectId).run(),
      // each remaining predicate, flipped after the read-path check passed (so only the store's SQL can catch it)
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
      await expect(store().save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority: proven }))
        .rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
      await untouched(ctx);
    }
  });

  it('CLOCK BOUNDARY: authority valid when read, real elapsed time crosses the 60 s window before the write, nothing persists', async () => {
    const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
    const prepare = async () => {
      const ctx = await readyItem();
      // a claim made 58.5 s ago: comfortably inside the window when it is read
      const planned = await planDispatch(env.DB, ctx.ready, { now: ago(59_000) });
      const claimed = await claimDispatch(env.DB, planned.effect.effectId, { now: ago(58_500) });
      const { current, next, event } = await pendingLease(ctx);
      const proven = await resolveLeaseAuthority(env.DB, current, { effect_id: planned.effect.effectId, attempt: claimed.permit.attempt }, new Date().toISOString());
      return { ctx, current, next, event, proven };
    };

    // control: the very same setup, written immediately, succeeds
    const control = await prepare();
    expect((await store().save(control.next, control.event, { expectedVersion: control.current.lifecycleVersion, leaseAuthority: control.proven })).state).toBe('INVESTIGATING');

    // the subject: identical setup, but real time passes 58.5 s -> 60.5 s between the read and the write
    const stalled = await prepare();
    await sleep(2_000);
    await expect(store().save(stalled.next, stalled.event, { expectedVersion: stalled.current.lifecycleVersion, leaseAuthority: stalled.proven }))
      .rejects.toMatchObject({ code: 'dispatch_intent_ineligible' });
    await untouched(stalled.ctx);
    expect((await loadEffect(env.DB, stalled.proven.effectId)).status).toBe('PLANNED'); // the intent itself is untouched
  }, 20_000);
});

describe('the store owns the schema its predicate reads', () => {
  it('a database that predates the outbox gains the effect-contract columns, even under concurrent first use, and ordinary saves keep working', async () => {
    const contractColumns = ['schema_version', 'requested_lifecycle_version', 'payload_digest', 'payload_json', 'attempt_count',
      'last_attempt_at', 'idempotency_key', 'causal_event_id', 'receipt_ref', 'terminal_reason'];
    await env.DB.prepare('DROP INDEX IF EXISTS idx_mc_effects_dispatch').run();
    for (const column of contractColumns) await env.DB.prepare(`ALTER TABLE mc_effects DROP COLUMN ${column}`).run();
    const before = (await env.DB.prepare('PRAGMA table_info(mc_effects)').all()).results.map((c) => c.name);
    expect(before).not.toContain('schema_version');

    await Promise.all([1, 2, 3].map(() => ensureWorkItemSchema(env.DB)));
    const after = (await env.DB.prepare('PRAGMA table_info(mc_effects)').all()).results.map((c) => c.name);
    for (const column of contractColumns) expect(after).toContain(column);

    // every guarded write evaluates the predicate, so an ordinary save proves the columns are really usable
    const observed = await createObservedWorkItem({
      producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: 'health:aiaimate:pre_outbox_db',
      observedAt: '2026-09-29T07:24:48.137Z', evidenceDigest: `sha256:${'8'.repeat(64)}`, severity: 'high',
    });
    const saved = await store().save(observed, { at: observed.lastSeen, from: null, to: 'OBSERVED', reason: 'test', actor: 'test', detail: {} });
    const again = await store().save({ ...saved, occurrenceCount: (saved.occurrenceCount ?? 0) + 1 }, null);
    expect(again.occurrenceCount).toBe((saved.occurrenceCount ?? 0) + 1);
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
