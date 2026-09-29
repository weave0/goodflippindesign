import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import {
  applyObservation,
  createObservedWorkItem,
  transitionWorkItem,
} from '../../workers/lib/mission-control-work-items.js';
import {
  HEALTH_CONFLICT_RETRIES,
  LOADED_VERSION,
  createD1WorkItemStore,
  ensureWorkItemSchema,
  recordHealthObservation,
} from '../../workers/mission-control-work-items.js';
import { keyBytesFromEnv, signResultEnvelope } from '../../workers/fwomps-investigation-adapter.js';

const SECRET = 'sk_test_mission_control';
const CONTRACT_KEY = 'mission-control-test-key';
const RESULT_KEY = 'mission-control-result-key';
const WORKER_TOKEN = 'mission-control-worker-token-test';
const REVISION = '257210036bff85961a1b9c96c0572aabcaaa9cd4';
const LATER = '2026-09-29T13:00:00.000Z';
const EVEN_LATER = '2026-09-29T14:00:00.000Z';

const bearer = (payload) => `header.${btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}.signature`;
const adminToken = () => bearer({ sid: 'sess_admin', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 3600 });

const testEnv = () => ({
  ...env,
  CLERK_SECRET_KEY: SECRET,
  CLERK_SECRET_KEY_GFD: SECRET,
  MISSION_CONTROL_GITHUB_TOKEN: 'gh_test',
  MISSION_CONTROL_CONTRACT_KEY: CONTRACT_KEY,
  MISSION_CONTROL_CONTRACT_KEY_ID: 'gfd-mission-control-test',
  MISSION_CONTROL_RESULT_KEY: RESULT_KEY,
  MISSION_CONTROL_RESULT_KEY_ID: 'gfd-result-test',
  MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-a',
  MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
});

const call = (path, { auth, workerAuth, body } = {}) => worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
  method: 'POST',
  headers: {
    ...((workerAuth || auth) ? { Authorization: `Bearer ${workerAuth || auth}` } : {}),
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body === undefined ? {} : body),
}), testEnv());

let counter = 0;
const store = () => createD1WorkItemStore(env.DB);

function marker(findingKey) {
  return { findingKey, targetId: 'aiaimate', findingKind: 'machine_contract_mismatch' };
}

async function qualifiedHealthItem() {
  counter += 1;
  const findingKey = `health:aiaimate:race_case_${counter}`;
  const observed = await createObservedWorkItem({
    producer: 'health-sweep',
    propertyId: 'aiaimate.com',
    findingKey,
    observedAt: '2026-09-29T07:24:48.137Z',
    evidenceDigest: `sha256:${String(counter).padStart(64, 'c')}`,
    severity: 'high',
  });
  const qualified = transitionWorkItem(observed, 'QUALIFIED', {
    repository: 'weave0/aiaimate',
    investigationProfile: 'gfd-property-health',
    verificationProfile: 'gfd-property-health-production',
    verificationScope: 'production',
    verificationPredicate: 'Run the same configured health probe again and require this finding key to be absent.',
  });
  await store().save(qualified, {
    at: qualified.lastSeen, from: 'OBSERVED', to: 'QUALIFIED', reason: 'test', actor: 'test', detail: {},
  });
  return { findingKey, workItemId: qualified.workItemId, id: encodeURIComponent(qualified.workItemId), qualified };
}

function adminFetchStub() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
  }), { status: 200 })));
}

async function issue(ctx) {
  adminFetchStub();
  const response = await call(`/api/mission-control/work-items/${ctx.id}/investigate`, {
    auth: adminToken(), body: { evidenceRevision: REVISION },
  });
  expect(response.status).toBe(200);
  return response.json();
}

async function lease(ctx) {
  const response = await call(`/api/mission-control/work-items/${ctx.id}/lease`, { workerAuth: WORKER_TOKEN, body: {} });
  return { response, body: response.status === 200 ? await response.json() : null };
}

async function signedResult(ctx, issued, leased, patch = {}) {
  const grant = leased.leaseGrant;
  return signResultEnvelope({
    schema_version: 'mc-fw-investigation-result-1',
    request_id: issued.workItem.investigation.requestId,
    contract_digest: issued.workItem.investigation.digest,
    attempt: grant.attempt,
    lease_token_digest: grant.lease_token_digest,
    worker: { id: 'fwomps-worker-a', fwomps_version: '0.1.0', completed_at: '2026-09-29T12:00:01Z' },
    source: {
      property_id: ctx.qualified.propertyId,
      repository: ctx.qualified.repository,
      workspace_name: 'aiaimate',
      inspected_head_sha: REVISION,
      source_state: 'accepted_by_host_policy',
    },
    evidence: {
      revision: REVISION,
      snapshot_digest: issued.contract.evidence.snapshot_digest,
      diagnostic_id: ctx.workItemId,
      diagnostic_digest: issued.contract.diagnostic.digest,
    },
    outcome: 'reproduced',
    summary: 'profile gfd-property-health: reproduced',
    observations: ['command 1: fail (exit 1)'],
    execution_receipts: [{
      profile: 'gfd-property-health', index: 0, status: 'fail', exit_code: 1,
      output_digest: `sha256:${'5'.repeat(64)}`, stdout_excerpt: '', stderr_excerpt: 'mismatch',
      output_truncated: false, timed_out: false, authoritative_sandbox: true,
    }],
    repairability: { state: 'not_indicated', advisory_repair_scope: [] },
    stop_reason: null,
    authentication: { key_id: 'gfd-result-test' },
    ...patch,
  }, keyBytesFromEnv(RESULT_KEY));
}

const postResult = (ctx, envelope) => call(`/api/mission-control/work-items/${ctx.id}/result`, {
  workerAuth: WORKER_TOKEN, body: envelope,
});

const rowOf = async (ctx) => env.DB.prepare('SELECT * FROM mc_work_items WHERE work_item_id = ?').bind(ctx.workItemId).first();

/** A store whose first identity read hands back the item, then lets `between()` advance the row. */
function racingStore(real, between, { times = 1 } = {}) {
  let remaining = times;
  return {
    ...real,
    getByIdentity: async (identity) => {
      const loaded = await real.getByIdentity(identity);
      if (remaining > 0) {
        remaining -= 1;
        await between(loaded);
      }
      return loaded;
    },
    save: (...args) => real.save(...args),
  };
}

beforeAll(async () => {
  await ensureWorkItemSchema(env.DB);
  for (const table of ['mc_work_item_events', 'mc_work_item_leases', 'mc_effects', 'mc_work_items']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('no writer can overwrite newer state (durable compare-and-swap for every save)', () => {
  it('rejects a stale health projection that would overwrite an attached lease', async () => {
    const ctx = await qualifiedHealthItem();
    const issued = await issue(ctx);
    const stale = await store().get(ctx.workItemId);
    const leased = (await lease(ctx)).body;
    expect(leased).not.toBeNull();

    const projection = applyObservation(stale, {
      producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: ctx.findingKey,
      observedAt: LATER, evidenceDigest: `sha256:${'d'.repeat(64)}`, severity: 'high',
    });
    await expect(store().save(projection, {
      at: LATER, from: stale.state, to: projection.state, reason: 'stale', actor: 'health-sweep', detail: {},
    })).rejects.toMatchObject({ code: 'version_conflict' });

    const row = await rowOf(ctx);
    expect(row.lifecycle_state).toBe('INVESTIGATING');
    expect(row.active_lease_id).toBe(leased.leaseGrant.lease_token_digest);
    expect(issued.workItem.state).toBe('INVESTIGATION_READY');
  });

  it('rejects a stale observation that would overwrite an accepted diagnosis', async () => {
    const ctx = await qualifiedHealthItem();
    const issued = await issue(ctx);
    const leased = (await lease(ctx)).body;
    const stale = await store().get(ctx.workItemId);
    const accepted = await postResult(ctx, await signedResult(ctx, issued, leased));
    expect(accepted.status).toBe(200);
    const diagnosisDigest = (await accepted.json()).workItem.diagnosis.resultDigest;

    const projection = applyObservation(stale, {
      producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: ctx.findingKey,
      observedAt: LATER, evidenceDigest: `sha256:${'e'.repeat(64)}`, severity: 'high',
    });
    await expect(store().save(projection, {
      at: LATER, from: stale.state, to: projection.state, reason: 'stale', actor: 'health-sweep', detail: {},
    })).rejects.toMatchObject({ code: 'version_conflict' });

    const row = await rowOf(ctx);
    expect(row.lifecycle_state).toBe('DIAGNOSED');
    expect(row.diagnosis_result_digest).toBe(diagnosisDigest);
    expect(row.active_lease_id).toBeNull();
  });

  it('never lets an item that was not loaded from the store update an existing row', async () => {
    const ctx = await qualifiedHealthItem();
    const before = await rowOf(ctx);
    const fabricated = await createObservedWorkItem({
      producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: ctx.findingKey,
      observedAt: LATER, evidenceDigest: `sha256:${'f'.repeat(64)}`, severity: 'high',
    });
    expect(fabricated[LOADED_VERSION]).toBeUndefined();
    await expect(store().save(fabricated, {
      at: LATER, from: null, to: 'OBSERVED', reason: 'fabricated', actor: 'test', detail: {},
    })).rejects.toMatchObject({ code: 'version_conflict' });
    const after = await rowOf(ctx);
    expect(after.lifecycle_state).toBe(before.lifecycle_state);
    expect(after.lifecycle_version).toBe(before.lifecycle_version);
  });

  it('carries the loaded version through derived items, so a second save of the same stale copy fails', async () => {
    const ctx = await qualifiedHealthItem();
    const loaded = await store().get(ctx.workItemId);
    expect(loaded[LOADED_VERSION]).toBe(loaded.lifecycleVersion);
    const derived = applyObservation(loaded, {
      producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: ctx.findingKey,
      observedAt: LATER, evidenceDigest: `sha256:${'a'.repeat(64)}`, severity: 'high',
    });
    expect(derived[LOADED_VERSION]).toBe(loaded.lifecycleVersion);
    const event = { at: LATER, from: loaded.state, to: derived.state, reason: 'obs', actor: 'health-sweep', detail: {} };
    await store().save(derived, event);
    await expect(store().save(derived, { ...event, at: EVEN_LATER })).rejects.toMatchObject({ code: 'version_conflict' });
  });

  it('still applies a legitimate fresh repeated observation (occurrence, evidence, version)', async () => {
    const ctx = await qualifiedHealthItem();
    const first = await recordHealthObservation(store(), marker(ctx.findingKey), { checkedAt: LATER, status: 'degraded' });
    const second = await recordHealthObservation(store(), marker(ctx.findingKey), { checkedAt: EVEN_LATER, status: 'degraded' });
    expect(first.occurrenceCount).toBe(2);
    expect(second.occurrenceCount).toBe(3);
    expect(second.lastSeen).toBe(EVEN_LATER);
    expect(second.evidenceDigest).not.toBe(first.evidenceDigest);
    expect(second.lifecycleVersion).toBe(first.lifecycleVersion + 1);
  });
});

describe('health writer reconciles a lost swap deliberately (reload + re-apply, never last-write-wins)', () => {
  it('re-applies onto the fresh item and preserves an attached lease', async () => {
    const ctx = await qualifiedHealthItem();
    await issue(ctx);
    let leased = null;
    const racing = racingStore(store(), async () => { leased = (await lease(ctx)).body; });

    const saved = await recordHealthObservation(racing, marker(ctx.findingKey), { checkedAt: LATER, status: 'degraded' });

    expect(leased).not.toBeNull();
    expect(saved.state).toBe('INVESTIGATING');
    expect(saved.activeLease.leaseId).toBe(leased.leaseGrant.lease_token_digest);
    expect(saved.occurrenceCount).toBe(2);
    expect(saved.lastSeen).toBe(LATER);
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND actor_id = 'health-sweep'",
    ).bind(ctx.workItemId).all();
    expect(results[0].n).toBe(1);
  });

  it('re-applies onto an accepted diagnosis without disturbing it', async () => {
    const ctx = await qualifiedHealthItem();
    const issued = await issue(ctx);
    const leased = (await lease(ctx)).body;
    let digest = null;
    const racing = racingStore(store(), async () => {
      const accepted = await postResult(ctx, await signedResult(ctx, issued, leased));
      expect(accepted.status).toBe(200);
      digest = (await accepted.json()).workItem.diagnosis.resultDigest;
    });

    const saved = await recordHealthObservation(racing, marker(ctx.findingKey), { checkedAt: LATER, status: 'degraded' });

    expect(saved.state).toBe('DIAGNOSED');
    expect(saved.diagnosis.resultDigest).toBe(digest);
    expect(saved.occurrenceCount).toBe(2);
  });

  it('surfaces a persistent conflict after bounded reconciliation instead of overwriting', async () => {
    const ctx = await qualifiedHealthItem();
    const racing = racingStore(store(), async (loaded) => {
      // Another writer always gets in first: advance the row through a legitimate saved observation.
      const rival = applyObservation(loaded, {
        producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: ctx.findingKey,
        observedAt: EVEN_LATER, evidenceDigest: `sha256:${'b'.repeat(64)}`, severity: 'high',
      });
      await store().save(rival, {
        at: EVEN_LATER, from: loaded.state, to: rival.state, reason: 'rival', actor: 'rival', detail: {},
      });
    }, { times: HEALTH_CONFLICT_RETRIES + 5 });

    await expect(recordHealthObservation(racing, marker(ctx.findingKey), { checkedAt: LATER, status: 'degraded' }))
      .rejects.toMatchObject({ code: 'version_conflict' });

    const row = await rowOf(ctx);
    expect(row.occurrence_count).toBe(1 + HEALTH_CONFLICT_RETRIES);
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND actor_id = 'health-sweep'",
    ).bind(ctx.workItemId).all();
    expect(results[0].n).toBe(0);
  });
});

describe('concurrent identical result delivery is idempotent; a different result is a conflict', () => {
  it('returns success to both of two concurrent identical deliveries with exactly one diagnosis event', async () => {
    const ctx = await qualifiedHealthItem();
    const issued = await issue(ctx);
    const leased = (await lease(ctx)).body;
    const signed = await signedResult(ctx, issued, leased);

    const [one, two, three] = await Promise.all([postResult(ctx, signed), postResult(ctx, signed), postResult(ctx, signed)]);

    expect([one.status, two.status, three.status]).toEqual([200, 200, 200]);
    const digests = [(await one.json()).workItem.diagnosis.resultDigest, (await two.json()).workItem.diagnosis.resultDigest,
      (await three.json()).workItem.diagnosis.resultDigest];
    expect(new Set(digests).size).toBe(1);
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND to_state = 'DIAGNOSED'",
    ).bind(ctx.workItemId).all();
    expect(results[0].n).toBe(1);
  });

  it('fails closed as result_conflict when the losing delivery carries a different result', async () => {
    const ctx = await qualifiedHealthItem();
    const issued = await issue(ctx);
    const leased = (await lease(ctx)).body;
    const a = await signedResult(ctx, issued, leased);
    const b = await signedResult(ctx, issued, leased, {
      outcome: 'inconclusive',
      summary: 'profile gfd-property-health: inconclusive',
      execution_receipts: [{
        profile: 'gfd-property-health', index: 0, status: 'error', exit_code: null,
        output_digest: `sha256:${'4'.repeat(64)}`, stdout_excerpt: '', stderr_excerpt: '',
        output_truncated: false, timed_out: true, authoritative_sandbox: false,
      }],
    });
    const responses = await Promise.all([postResult(ctx, a), postResult(ctx, b)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = responses.find((r) => r.status === 409);
    expect((await loser.json()).error).toMatch(/different result|concurrently|already/i);
    expect((await rowOf(ctx)).lifecycle_state).toBe('DIAGNOSED');
  });

  it('never retries lease creation: two concurrent leases mint exactly one token', async () => {
    const ctx = await qualifiedHealthItem();
    await issue(ctx);
    const [one, two] = await Promise.all([lease(ctx), lease(ctx)]);
    expect([one.response.status, two.response.status].sort()).toEqual([200, 409]);
    const { results } = await env.DB.prepare('SELECT lease_id FROM mc_work_item_leases WHERE work_item_id = ?')
      .bind(ctx.workItemId).all();
    expect(results).toHaveLength(1);
  });
});

describe('expired single-attempt recovery is explicit, proven, and journaled', () => {
  const expireLease = (ctx) => env.DB.prepare('UPDATE mc_work_items SET lease_expires_at = ? WHERE work_item_id = ?')
    .bind('2020-01-01T00:00:00.000Z', ctx.workItemId).run();
  const expire = (ctx, extra = {}) => call(`/api/mission-control/work-items/${ctx.id}/expire`, { auth: adminToken(), ...extra });

  it('cannot abandon a live lease before it expires', async () => {
    const ctx = await qualifiedHealthItem();
    await issue(ctx);
    const leased = (await lease(ctx)).body;
    adminFetchStub();
    const response = await expire(ctx);
    expect(response.status).toBe(409);
    const row = await rowOf(ctx);
    expect(row.lifecycle_state).toBe('INVESTIGATING');
    expect(row.active_lease_id).toBe(leased.leaseGrant.lease_token_digest);
  });

  it('is limited to an item under investigation and to an authenticated operator', async () => {
    const ctx = await qualifiedHealthItem();
    adminFetchStub();
    expect((await expire(ctx)).status).toBe(409); // QUALIFIED: nothing to abandon
    await issue(ctx);
    expect((await expire(ctx)).status).toBe(409); // INVESTIGATION_READY: no lease yet
    await lease(ctx);
    await expireLease(ctx);
    const workerCall = await call(`/api/mission-control/work-items/${ctx.id}/expire`, { workerAuth: WORKER_TOKEN });
    expect([401, 403]).toContain(workerCall.status); // the machine bearer is refused on operator routes
    expect((await rowOf(ctx)).lifecycle_state).toBe('INVESTIGATING');
  });

  it('releases exactly the active lease, journals why, and returns the item to QUALIFIED', async () => {
    const ctx = await qualifiedHealthItem();
    const issued = await issue(ctx);
    const leased = (await lease(ctx)).body;
    await expireLease(ctx);
    adminFetchStub();
    const response = await expire(ctx);
    expect(response.status).toBe(200);
    const item = (await response.json()).workItem;

    expect(item.state).toBe('QUALIFIED');
    expect(item.activeLease).toBeNull();
    expect(item.investigation).toBeNull();
    expect(item.attemptsIssued).toBe(0);
    expect(item.abandonment).toMatchObject({
      reason: 'lease_expired',
      requestId: issued.workItem.investigation.requestId,
      leaseTokenDigest: leased.leaseGrant.lease_token_digest,
      workerId: 'fwomps-worker-a',
    });

    const row = await rowOf(ctx);
    expect(row.active_lease_id).toBeNull();
    const { results: leases } = await env.DB.prepare(
      'SELECT lease_id, released_at, release_reason FROM mc_work_item_leases WHERE work_item_id = ?',
    ).bind(ctx.workItemId).all();
    expect(leases).toHaveLength(1);
    expect(leases[0].lease_id).toBe(leased.leaseGrant.lease_token_digest);
    expect(leases[0].released_at).not.toBeNull();
    expect(leases[0].release_reason).toBe('lease_expired');

    const { results: events } = await env.DB.prepare(
      "SELECT to_state, detail_json FROM mc_work_item_events WHERE work_item_id = ? AND to_state = 'QUALIFIED' ORDER BY occurred_at DESC",
    ).bind(ctx.workItemId).all();
    expect(events.some((e) => JSON.parse(e.detail_json).abandonment?.reason === 'lease_expired')).toBe(true);
  });

  it('refuses a result after expiry, and still refuses that stale result after the reset', async () => {
    const ctx = await qualifiedHealthItem();
    const issued = await issue(ctx);
    const leased = (await lease(ctx)).body;
    const staleSigned = await signedResult(ctx, issued, leased);
    await expireLease(ctx);
    expect((await postResult(ctx, staleSigned)).status).toBe(409); // expired but not yet abandoned
    adminFetchStub();
    expect((await expire(ctx)).status).toBe(200);
    expect((await postResult(ctx, staleSigned)).status).toBe(409); // reset: QUALIFIED accepts nothing
    expect((await rowOf(ctx)).diagnosis_result_digest).toBeNull();
  });

  it('requires a fresh contract: new request id, new lease, attempt 1, old result still refused', async () => {
    const ctx = await qualifiedHealthItem();
    const first = await issue(ctx);
    const firstLease = (await lease(ctx)).body;
    const oldSigned = await signedResult(ctx, first, firstLease);
    await expireLease(ctx);
    adminFetchStub();
    expect((await expire(ctx)).status).toBe(200);

    // The old contract cannot be leased again: the item is not investigation-ready.
    const reuse = await lease(ctx);
    expect(reuse.response.status).toBe(409);

    const second = await issue(ctx);
    expect(second.workItem.investigation.requestId).not.toBe(first.workItem.investigation.requestId);
    expect(second.workItem.investigation.digest).not.toBe(first.workItem.investigation.digest);
    const secondLease = (await lease(ctx));
    expect(secondLease.response.status).toBe(200);
    expect(secondLease.body.leaseGrant.attempt).toBe(1); // never attempt 2
    expect(secondLease.body.leaseGrant.lease_token_digest).not.toBe(firstLease.leaseGrant.lease_token_digest);
    expect(secondLease.body.workItem.attemptsIssued).toBe(1);

    // The stale result of the expired contract stays refused; the fresh one is accepted.
    expect((await postResult(ctx, oldSigned)).status).toBe(409);
    const freshSigned = await signedResult(ctx, second, secondLease.body);
    expect((await postResult(ctx, freshSigned)).status).toBe(200);
    expect((await rowOf(ctx)).lifecycle_state).toBe('DIAGNOSED');
  });

  it('persists no raw lease token from either contract', async () => {
    const ctx = await qualifiedHealthItem();
    await issue(ctx);
    const firstLease = (await lease(ctx)).body;
    await expireLease(ctx);
    adminFetchStub();
    await expire(ctx);
    await issue(ctx);
    const secondLease = (await lease(ctx)).body;
    for (const table of ['mc_work_items', 'mc_work_item_events', 'mc_work_item_leases', 'mc_effects']) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      const dump = JSON.stringify(results);
      expect(dump, table).not.toContain(firstLease.leaseTokenHex);
      expect(dump, table).not.toContain(secondLease.leaseTokenHex);
    }
  });
});
