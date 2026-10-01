import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { authorizeDispatch } from './dispatch-intent.js';

import worker from '../../workers/auth.js';
import {
  createObservedWorkItem,
  transitionWorkItem,
} from '../../workers/lib/mission-control-work-items.js';
import {
  createD1WorkItemStore,
  ensureWorkItemSchema,
} from '../../workers/mission-control-work-items.js';
import {
  keyBytesFromEnv,
  signResultEnvelope,
} from '../../workers/fwomps-investigation-adapter.js';

const SECRET = 'sk_test_mission_control';
const CONTRACT_KEY = 'mission-control-test-key';
const RESULT_KEY = 'mission-control-result-key';
const WORKER_TOKEN = 'mission-control-worker-token-test';
const REVISION = '257210036bff85961a1b9c96c0572aabcaaa9cd4';

function bearer(payload) {
  const body = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  return `header.${body}.signature`;
}

const adminToken = () => bearer({ sid: 'sess_admin', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 3600 });

function testEnv(overrides = {}) {
  return {
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
    ...overrides,
  };
}

function call(path, { method = 'POST', auth, workerAuth, body, envOverrides } = {}) {
  return worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
    method,
    headers: {
      ...((workerAuth || auth) ? { Authorization: `Bearer ${workerAuth || auth}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), testEnv(envOverrides));
}

const sha256Hex = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (text) => Uint8Array.from(text.match(/../g).map((h) => parseInt(h, 16)));

let counter = 0;

async function leasedItem() {
  counter += 1;
  const store = createD1WorkItemStore(env.DB);
  const observed = await createObservedWorkItem({
    producer: 'health-sweep',
    propertyId: 'aiaimate.com',
    findingKey: `health:aiaimate:bridge_case_${counter}`,
    observedAt: '2026-09-29T07:24:48.137Z',
    evidenceDigest: `sha256:${String(counter).padStart(64, 'a')}`,
    severity: 'high',
  });
  const qualified = transitionWorkItem(observed, 'QUALIFIED', {
    repository: 'weave0/aiaimate',
    investigationProfile: 'gfd-property-health',
    verificationProfile: 'gfd-property-health-production',
    verificationScope: 'production',
    verificationPredicate: 'Run the same configured health probe again and require this finding key to be absent.',
  });
  await store.save(qualified, {
    at: qualified.lastSeen, from: 'OBSERVED', to: 'QUALIFIED', reason: 'test', actor: 'test', detail: {},
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
  }), { status: 200 })));
  const id = encodeURIComponent(qualified.workItemId);
  const issued = await call(`/api/mission-control/work-items/${id}/investigate`, {
    auth: adminToken(), body: { evidenceRevision: REVISION },
  });
  expect(issued.status).toBe(200);
  const issuedBody = await issued.json();
  const authority = await authorizeDispatch(env.DB, issuedBody.workItem);
  const leased = await call(`/api/mission-control/work-items/${id}/lease`, { workerAuth: WORKER_TOKEN, body: authority.body });
  expect(leased.status).toBe(200);
  const leaseBody = await leased.json();
  return { store, qualified, id, issuedBody, leaseBody, authority };
}

function baseResult(ctx, patch = {}) {
  const { qualified, issuedBody, leaseBody } = ctx;
  const grant = leaseBody.leaseGrant;
  return {
    schema_version: 'mc-fw-investigation-result-1',
    request_id: issuedBody.workItem.investigation.requestId,
    contract_digest: issuedBody.workItem.investigation.digest,
    attempt: grant.attempt,
    lease_token_digest: grant.lease_token_digest,
    worker: { id: 'fwomps-worker-a', fwomps_version: '0.1.0', completed_at: '2026-09-29T12:00:01Z' },
    source: {
      property_id: qualified.propertyId,
      repository: qualified.repository,
      workspace_name: 'aiaimate',
      inspected_head_sha: REVISION,
      source_state: 'accepted_by_host_policy',
    },
    evidence: {
      revision: REVISION,
      snapshot_digest: issuedBody.contract.evidence.snapshot_digest,
      diagnostic_id: qualified.workItemId,
      diagnostic_digest: issuedBody.contract.diagnostic.digest,
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
  };
}

const sign = (unsigned, keyText = RESULT_KEY) => signResultEnvelope(unsigned, keyBytesFromEnv(keyText));

async function postResult(ctx, envelope, envOverrides) {
  return call(`/api/mission-control/work-items/${ctx.id}/result`, {
    workerAuth: WORKER_TOKEN, body: envelope, envOverrides,
  });
}

const stateOf = async (ctx) => (await ctx.store.get(ctx.qualified.workItemId));

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

describe('result attempt identity (request_id, attempt, lease_token_digest)', () => {
  it('rejects a correctly signed result with the right attempt but the wrong lease token digest', async () => {
    const ctx = await leasedItem();
    const forged = await sign(baseResult(ctx, { lease_token_digest: `sha256:${'9'.repeat(64)}` }));
    const response = await postResult(ctx, forged);
    expect(response.status).toBe(409);
    expect((await stateOf(ctx)).state).toBe('INVESTIGATING');
  });

  it('rejects a correctly signed result with the right token digest but the wrong attempt', async () => {
    const ctx = await leasedItem();
    const forged = await sign(baseResult(ctx, { attempt: 2 }));
    const response = await postResult(ctx, forged);
    expect(response.status).toBe(409);
    expect((await stateOf(ctx)).state).toBe('INVESTIGATING');
  });

  it('rejects every mismatched identity echo even when the MAC is valid', async () => {
    const ctx = await leasedItem();
    const cases = [
      { request_id: 'mci_someone_elses_request' },
      { contract_digest: `sha256:${'7'.repeat(64)}` },
      { evidence: { ...baseResult(ctx).evidence, revision: 'b'.repeat(40) } },
      { evidence: { ...baseResult(ctx).evidence, snapshot_digest: `sha256:${'8'.repeat(64)}` } },
      { evidence: { ...baseResult(ctx).evidence, diagnostic_digest: `sha256:${'6'.repeat(64)}` } },
      { evidence: { ...baseResult(ctx).evidence, diagnostic_id: 'wi_other' } },
      { source: { ...baseResult(ctx).source, repository: 'weave0/other' } },
      { source: { ...baseResult(ctx).source, property_id: 'other.com' } },
    ];
    for (const patch of cases) {
      const response = await postResult(ctx, await sign(baseResult(ctx, patch)));
      expect(response.status, JSON.stringify(Object.keys(patch))).toBeGreaterThanOrEqual(400);
    }
    expect((await stateOf(ctx)).state).toBe('INVESTIGATING');
  });

  it('never accepts a result after its lease expired, and never issues a second lease (single attempt)', async () => {
    const ctx = await leasedItem();
    await env.DB.prepare('UPDATE mc_work_items SET lease_expires_at = ? WHERE work_item_id = ?')
      .bind('2020-01-01T00:00:00.000Z', ctx.qualified.workItemId).run();
    const late = await postResult(ctx, await sign(baseResult(ctx)));
    expect(late.status).toBe(409);
    const relet = await call(`/api/mission-control/work-items/${ctx.id}/lease`, { workerAuth: WORKER_TOKEN, body: ctx.authority.body });
    expect(relet.status).toBe(409);
    const after = await stateOf(ctx);
    expect(after.state).not.toBe('DIAGNOSED');
    expect(after.attemptsIssued).toBe(1);
    expect(after.diagnosis).toBeNull();
  });

  it('is idempotent for a redelivered identical result and records exactly one diagnosis event', async () => {
    const ctx = await leasedItem();
    const signed = await sign(baseResult(ctx));
    const first = await postResult(ctx, signed);
    const second = await postResult(ctx, signed);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const one = (await first.json()).workItem;
    const two = (await second.json()).workItem;
    expect(two.diagnosis.resultDigest).toBe(one.diagnosis.resultDigest);
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND to_state = 'DIAGNOSED'",
    ).bind(ctx.qualified.workItemId).all();
    expect(results[0].n).toBe(1);
  });

  it('fails closed when a different signed result arrives for the same attempt identity', async () => {
    const ctx = await leasedItem();
    expect((await postResult(ctx, await sign(baseResult(ctx)))).status).toBe(200);
    const different = await sign(baseResult(ctx, {
      outcome: 'not_reproduced',
      summary: 'profile gfd-property-health: not_reproduced',
      execution_receipts: [{ ...baseResult(ctx).execution_receipts[0], status: 'pass', exit_code: 0 }],
    }));
    const response = await postResult(ctx, different);
    expect(response.status).toBe(409);
    const stored = await stateOf(ctx);
    expect(stored.diagnosis.outcome).toBe('reproduced');
  });

  it('accepts exactly one of two concurrent different results (durable version check)', async () => {
    const ctx = await leasedItem();
    const a = await sign(baseResult(ctx));
    const b = await sign(baseResult(ctx, {
      outcome: 'inconclusive',
      summary: 'profile gfd-property-health: inconclusive',
      execution_receipts: [{ ...baseResult(ctx).execution_receipts[0], status: 'error', exit_code: null, authoritative_sandbox: false }],
    }));
    const [ra, rb] = await Promise.all([postResult(ctx, a), postResult(ctx, b)]);
    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual([200, 409]);
    const { results } = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM mc_work_item_events WHERE work_item_id = ? AND to_state = 'DIAGNOSED'",
    ).bind(ctx.qualified.workItemId).all();
    expect(results[0].n).toBe(1);
    expect((await stateOf(ctx)).state).toBe('DIAGNOSED');
  });
});

describe('worker identity comes from authentication.key_id, never worker.id', () => {
  it('rejects a valid MAC from a key bound to a different worker', async () => {
    const ctx = await leasedItem();
    const signed = await sign(baseResult(ctx));
    const response = await postResult(ctx, signed, { MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-b' });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await stateOf(ctx)).state).toBe('INVESTIGATING');
  });

  it('rejects a valid MAC whose envelope names a different worker than the key binding', async () => {
    const ctx = await leasedItem();
    const signed = await sign(baseResult(ctx, {
      worker: { id: 'fwomps-worker-b', fwomps_version: '0.1.0', completed_at: '2026-09-29T12:00:01Z' },
    }));
    const response = await postResult(ctx, signed);
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect((await stateOf(ctx)).state).toBe('INVESTIGATING');
  });

  it('rejects an unknown key id and a wrong-key MAC', async () => {
    const ctx = await leasedItem();
    const unknownKey = await sign(baseResult(ctx, { authentication: { key_id: 'someone-elses-key' } }));
    expect((await postResult(ctx, unknownKey)).status).toBeGreaterThanOrEqual(400);
    const wrongKey = await sign(baseResult(ctx), 'a-different-result-key');
    expect((await postResult(ctx, wrongKey)).status).toBeGreaterThanOrEqual(400);
    expect((await stateOf(ctx)).state).toBe('INVESTIGATING');
  });
});

describe('a result is evidence, never repair authority', () => {
  it('rejects any advisory repair scope or non-evidence repairability even with a valid MAC', async () => {
    const ctx = await leasedItem();
    const withScope = await sign(baseResult(ctx, {
      repairability: { state: 'not_indicated', advisory_repair_scope: [{ path: 'src/app.py', reason: 'x' }] },
    }));
    const bounded = await sign(baseResult(ctx, {
      repairability: { state: 'bounded', advisory_repair_scope: [] },
    }));
    expect((await postResult(ctx, withScope)).status).toBeGreaterThanOrEqual(400);
    expect((await postResult(ctx, bounded)).status).toBeGreaterThanOrEqual(400);
    const item = await stateOf(ctx);
    expect(item.state).toBe('INVESTIGATING');
    expect(item.repairAuthorityRef).toBeNull();
  });

  it('leaves no repair authority on an accepted result', async () => {
    const ctx = await leasedItem();
    const response = await postResult(ctx, await sign(baseResult(ctx)));
    expect(response.status).toBe(200);
    const item = await stateOf(ctx);
    expect(item.state).toBe('DIAGNOSED');
    expect(item.repairAuthorityRef).toBeNull();
    expect(JSON.stringify(item)).not.toContain('advisory_repair_scope');
  });
});

describe('lease token and lease minting', () => {
  it('signs only the digest of a 32-byte token and never persists the raw token', async () => {
    const ctx = await leasedItem();
    const tokenHex = ctx.leaseBody.leaseTokenHex;
    expect(tokenHex).toMatch(/^[0-9a-f]{64}$/);
    expect(`sha256:${await sha256Hex(fromHex(tokenHex))}`).toBe(ctx.leaseBody.leaseGrant.lease_token_digest);
    expect(ctx.leaseBody.leaseGrant).not.toHaveProperty('leaseTokenHex');
    expect(JSON.stringify(ctx.leaseBody.leaseGrant)).not.toContain(tokenHex);
    for (const table of ['mc_work_items', 'mc_work_item_events', 'mc_work_item_leases', 'mc_effects']) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      expect(JSON.stringify(results), table).not.toContain(tokenHex);
    }
  });

  it('mints exactly one lease when two lease requests race (compare-and-swap)', async () => {
    counter += 1;
    const store = createD1WorkItemStore(env.DB);
    const observed = await createObservedWorkItem({
      producer: 'health-sweep',
      propertyId: 'aiaimate.com',
      findingKey: `health:aiaimate:bridge_race_${counter}`,
      observedAt: '2026-09-29T07:24:48.137Z',
      evidenceDigest: `sha256:${String(counter).padStart(64, 'b')}`,
      severity: 'high',
    });
    const qualified = transitionWorkItem(observed, 'QUALIFIED', {
      repository: 'weave0/aiaimate',
      investigationProfile: 'gfd-property-health',
      verificationProfile: 'gfd-property-health-production',
      verificationScope: 'production',
      verificationPredicate: 'Run the same configured health probe again and require this finding key to be absent.',
    });
    await store.save(qualified, {
      at: qualified.lastSeen, from: 'OBSERVED', to: 'QUALIFIED', reason: 'test', actor: 'test', detail: {},
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
    }), { status: 200 })));
    const id = encodeURIComponent(qualified.workItemId);
    expect((await call(`/api/mission-control/work-items/${id}/investigate`, {
      auth: adminToken(), body: { evidenceRevision: REVISION },
    })).status).toBe(200);

    const authority = await authorizeDispatch(env.DB, (await store.get(qualified.workItemId)));
    const [one, two] = await Promise.all([
      call(`/api/mission-control/work-items/${id}/lease`, { workerAuth: WORKER_TOKEN, body: authority.body }),
      call(`/api/mission-control/work-items/${id}/lease`, { workerAuth: WORKER_TOKEN, body: authority.body }),
    ]);
    expect([one.status, two.status].sort()).toEqual([200, 409]);
    const winner = await (one.status === 200 ? one : two).json();
    const stored = await store.get(qualified.workItemId);
    expect(stored.activeLease.leaseId).toBe(winner.leaseGrant.lease_token_digest);
    expect(stored.attemptsIssued).toBe(1);
    const { results } = await env.DB.prepare(
      'SELECT lease_id FROM mc_work_item_leases WHERE work_item_id = ?',
    ).bind(qualified.workItemId).all();
    expect(results.map((r) => r.lease_id)).toEqual([winner.leaseGrant.lease_token_digest]);
  });

  it('refuses a lease request that tries to choose worker, attempt, token, or digest', async () => {
    const ctx = await leasedItem();
    for (const body of [
      { workerId: 'fwomps-worker-b' }, { ...ctx.authority.body, attempt: 2, workerId: 'fwomps-worker-b' }, { leaseTokenDigest: `sha256:${'1'.repeat(64)}` },
      { leaseTokenHex: '11'.repeat(32) }, { ...ctx.authority.body, leaseTokenHex: '11'.repeat(32) },
    ]) {
      const response = await call(`/api/mission-control/work-items/${ctx.id}/lease`, { workerAuth: WORKER_TOKEN, body });
      expect(response.status).toBe(400);
    }
  });
});
