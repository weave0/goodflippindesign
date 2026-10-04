/**
 * The mission-control-canary-runner identity: a revocable machine credential whose authority is ZERO unless the
 * production kill switch names exactly aiaimate.com, and which can never leave the one read-only canary workflow.
 *
 * Everything below goes through the real workers/auth.js entry (routing + bearer roles) and real D1 persistence.
 * Three authorities stay separate: Clerk admin (human), mission-control-worker (lease/result only), and this runner.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { CANARY_FINDING_KEY, createD1WorkItemStore, ensureWorkItemSchema, settleObservation } from '../../workers/mission-control-work-items.js';
import { ensureOutboxSchema } from '../../workers/lib/mission-control-outbox.js';

const SECRET = 'sk_test_mission_control';
const CONTRACT_KEY = 'mission-control-test-key';
const RESULT_KEY = 'mission-control-result-key';
const WORKER_TOKEN = 'mission-control-worker-token-test';
const RUNNER_TOKEN = 'ab'.repeat(64);
const OTHER_VALID_TOKEN = 'cd'.repeat(64);
const WORKER_ID = 'fwomps-worker-a';
const REVISION = '257210036bff85961a1b9c96c0572aabcaaa9cd4';
const RUNNER_ACTOR = 'gfd-production-canary-runner';
const ON = { MISSION_CONTROL_CANARY: 'aiaimate.com' };

function clerkJwtLike(payload) {
  const body = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  return `header.${body}.signature`;
}
const adminToken = () => clerkJwtLike({ sid: 'sess_admin', sub: 'user_admin', azp: 'https://goodflippindesign.com', exp: Math.floor(Date.now() / 1000) + 3600 });

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
    MISSION_CONTROL_RESULT_WORKER_ID: WORKER_ID,
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
    MISSION_CONTROL_CANARY_RUNNER_TOKEN: RUNNER_TOKEN,
    ...ON,
    ...overrides,
  };
}

function call(path, { method = 'POST', token = RUNNER_TOKEN, body, envOverrides } = {}) {
  return worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
  }), testEnv(envOverrides));
}
const itemPath = (id, action) => `/api/mission-control/work-items/${encodeURIComponent(id)}${action ? `/${action}` : ''}`;
const store = () => createD1WorkItemStore(env.DB);
const json = async (response) => response.json();

function stubClerkAdmin() {
  vi.stubGlobal('fetch', vi.fn(async (input) => {
    const url = String(input?.url || input);
    if (url.includes('api.clerk.com')) {
      return new Response(JSON.stringify({
        id: 'sess_admin', status: 'active', user_id: 'user_admin',
        user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
      }), { status: 200 });
    }
    throw new Error(`unexpected outbound fetch ${url}`);
  }));
}

async function canaryItem() {
  return (await store().list()).find((item) => item.producer === 'mc-canary');
}
async function runnerReadyCanary() {
  expect((await call('/api/mission-control/canary-observations', { body: { status: 'degraded' } })).status).toBe(200);
  let item = await canaryItem();
  item = (await json(await call(itemPath(item.workItemId, 'transition'), { body: { to: 'QUALIFIED' } }))).workItem;
  const issued = await json(await call(itemPath(item.workItemId, 'investigate'), { body: { evidenceRevision: REVISION } }));
  return { item: issued.workItem, issued };
}
async function healthItem() {
  const digest = `sha256:${'1'.repeat(64)}`;
  await settleObservation(store(), {
    producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: 'health:aiaimate:machine_contract_mismatch',
    observedAt: '2026-10-03T12:00:00.000Z', evidenceDigest: digest, severity: 'low',
  }, { status: 'degraded', checkedAt: '2026-10-03T12:00:00.000Z', actor: 'health-sweep' });
  return (await store().list()).find((item) => item.producer !== 'mc-canary');
}
async function decoyCanaryItem() {
  const findingKey = 'canary:decoy:same-property-different-finding';
  const observedAt = '2026-10-03T12:05:00.000Z';
  await settleObservation(store(), {
    producer: 'mc-canary',
    propertyId: 'aiaimate.com',
    findingKey,
    observedAt,
    evidenceDigest: `sha256:${'2'.repeat(64)}`,
    severity: 'low',
  }, { status: 'degraded', checkedAt: observedAt, actor: 'hostile-fixture' });
  return (await store().list()).find((item) => item.findingKey === findingKey);
}
const effectCount = async () => Number((await env.DB.prepare('SELECT COUNT(*) AS n FROM mc_effects').first()).n);
const actorsOf = async (workItemId) => (await env.DB.prepare('SELECT actor_id FROM mc_work_item_events WHERE work_item_id = ?').bind(workItemId).all()).results.map((r) => r.actor_id);

beforeEach(async () => {
  await ensureWorkItemSchema(env.DB);
  await ensureOutboxSchema(env.DB);
  for (const table of ['mc_work_item_events', 'mc_work_item_leases', 'mc_effects', 'mc_work_items']) {
    await env.DB.prepare(`DELETE FROM ${table}`).run();
  }
  stubClerkAdmin();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('canary-runner authentication', () => {
  it('refuses a missing, malformed or wrong runner bearer (they fall through to Clerk and fail)', async () => {
    for (const [label, token] of [
      ['missing', null],
      ['short', 'ab'.repeat(10)],
      ['127 hex', 'ab'.repeat(63) + 'a'],
      ['uppercase', 'AB'.repeat(64)],
      ['non-hex', 'zz'.repeat(64)],
      ['wrong but well formed', OTHER_VALID_TOKEN],
      ['runner token with a suffix', `${RUNNER_TOKEN}0`],
    ]) {
      const response = await call('/api/mission-control/canary-observations', { token, body: { status: 'degraded' } });
      expect(response.status, label).toBe(401);
    }
    expect(await canaryItem()).toBeUndefined();
  });

  it('is unusable when the secret itself is weak, absent, or equal to the worker bearer', async () => {
    for (const [label, overrides] of [
      ['weak secret', { MISSION_CONTROL_CANARY_RUNNER_TOKEN: 'short-runner-secret' }],
      ['absent secret', { MISSION_CONTROL_CANARY_RUNNER_TOKEN: undefined }],
      ['empty secret', { MISSION_CONTROL_CANARY_RUNNER_TOKEN: '' }],
      ['equals the worker bearer', { MISSION_CONTROL_CANARY_RUNNER_TOKEN: RUNNER_TOKEN, MISSION_CONTROL_WORKER_TOKEN: RUNNER_TOKEN }],
    ]) {
      const presented = label === 'weak secret' ? 'short-runner-secret' : RUNNER_TOKEN;
      const response = await call('/api/mission-control/canary-observations', { token: presented, body: { status: 'degraded' }, envOverrides: overrides });
      expect(response.status, label).toBe(401);
    }
    expect(await canaryItem()).toBeUndefined();
  });

  it('the worker bearer cannot use any runner/operator action; Clerk admin cannot use worker intake', async () => {
    const { item } = await runnerReadyCanary();
    const id = item.workItemId;
    for (const [method, path, body] of [
      ['POST', '/api/mission-control/canary-observations', { status: 'degraded' }],
      ['POST', itemPath(id, 'transition'), { to: 'QUALIFIED' }],
      ['POST', itemPath(id, 'investigate'), { evidenceRevision: REVISION }],
      ['POST', itemPath(id, 'dispatch'), {}],
      ['GET', '/api/mission-control/operations'],
      ['GET', '/api/mission-control/work-items'],
      ['GET', '/api/mission-control/provenance'],
    ]) {
      const response = await call(path, { method, token: WORKER_TOKEN, body });
      expect(response.status, `${method} ${path}`).toBeGreaterThanOrEqual(401);
      expect(response.status, `${method} ${path}`).toBeLessThan(500);
    }
    for (const action of ['lease', 'result']) {
      const response = await call(itemPath(id, action), { token: adminToken(), body: {} });
      expect(response.status, `admin ${action}`).toBe(403);
    }
    expect(await effectCount()).toBe(0);
  });
});

describe('canary-runner authority collapses with the kill switch', () => {
  it('valid runner + canary absent/empty/wrong/differently-cased => the canary-disabled 404 on every route, nothing changes', async () => {
    const { item } = await runnerReadyCanary();
    const before = await canaryItem();
    for (const off of [{ MISSION_CONTROL_CANARY: undefined }, { MISSION_CONTROL_CANARY: '' }, { MISSION_CONTROL_CANARY: 'globaldeets.com' }, { MISSION_CONTROL_CANARY: 'AIAIMATE.COM' }, { MISSION_CONTROL_CANARY: 'true' }]) {
      for (const [method, path, body] of [
        ['POST', '/api/mission-control/canary-observations', { status: 'degraded' }],
        ['POST', itemPath(item.workItemId, 'dispatch'), {}],
        ['POST', itemPath(item.workItemId, 'transition'), { to: 'QUALIFIED' }],
        ['GET', '/api/mission-control/provenance'],
        ['GET', '/api/mission-control/operations'],
        ['GET', itemPath(item.workItemId)],
      ]) {
        const response = await call(path, { method, body, envOverrides: off });
        expect([response.status, (await json(response)).code], `${JSON.stringify(off)} ${method} ${path}`).toEqual([404, 'canary_disabled']);
      }
    }
    expect(await effectCount()).toBe(0);
    expect(await canaryItem()).toEqual(before);
  });

  it('disabling the canary immediately makes the same valid token useless; re-enabling restores only the bounded surface', async () => {
    expect((await call('/api/mission-control/canary-observations', { body: { status: 'degraded' } })).status).toBe(200);
    expect((await call('/api/mission-control/canary-observations', { body: { status: 'degraded' }, envOverrides: { MISSION_CONTROL_CANARY: undefined } })).status).toBe(404);
    expect((await call('/api/mission-control/canary-observations', { body: { status: 'degraded' } })).status).toBe(200);
  });
});

describe('canary-runner bounded surface (kill switch exactly aiaimate.com)', () => {
  it('runs the specimen path: observe, qualify, investigate (read-only), dispatch, read, operations, list, provenance', async () => {
    const { item, issued } = await runnerReadyCanary();
    expect(item.state).toBe('INVESTIGATION_READY');
    expect(issued.contract.contract.requested_mode).toBe('read_only');
    expect(issued.workItem.investigation.repairAuthority ?? false).toBe(false);

    const dispatched = await call(itemPath(item.workItemId, 'dispatch'), { body: {} });
    expect(dispatched.status).toBe(200);
    const dispatchBody = await json(dispatched);
    expect(dispatchBody.contractDigest).toBe(item.investigation.digest);
    const effect = await env.DB.prepare('SELECT effect_type, target FROM mc_effects WHERE effect_id = ?').bind(dispatchBody.effectId).first();
    expect([effect.effect_type, effect.target]).toEqual(['investigation_dispatch', 'fwomps:aiaimate.com']);

    expect((await call(itemPath(item.workItemId), { method: 'GET' })).status).toBe(200);
    expect((await call('/api/mission-control/operations', { method: 'GET' })).status).toBe(200);
    const listed = await json(await call('/api/mission-control/work-items', { method: 'GET' }));
    expect(listed.workItems.every((entry) => entry.producer === 'mc-canary' && entry.findingKey === CANARY_FINDING_KEY)).toBe(true);
    expect((await call('/api/mission-control/provenance', { method: 'GET' })).status).toBe(200);
  });

  it('cannot reach lease, result, expire, recover-dispatch, the evidence root, or unlisted actions', async () => {
    const { item } = await runnerReadyCanary();
    for (const [method, path, body] of [
      ['POST', itemPath(item.workItemId, 'lease'), { effect_id: 'x', attempt: 1 }],
      ['POST', itemPath(item.workItemId, 'result'), {}],
      ['POST', itemPath(item.workItemId, 'expire'), {}],
      ['POST', itemPath(item.workItemId, 'recover-dispatch'), {}],
      ['POST', itemPath(item.workItemId, 'repair'), {}],
      ['POST', itemPath(item.workItemId, 'deploy'), {}],
      ['POST', itemPath(item.workItemId, 'publish'), {}],
      ['GET', '/api/mission-control'],
      ['POST', '/api/mission-control/anything-else', {}],
    ]) {
      const response = await call(path, { method, body });
      expect(response.status, `${method} ${path}`).toBe(403);
    }
    expect(await effectCount()).toBe(0);
    expect((await canaryItem()).state).toBe('INVESTIGATION_READY');
  });

  it('cannot select a property, worker, command, target, or authority; transitions are only QUALIFIED', async () => {
    const { item } = await runnerReadyCanary();
    for (const smuggled of [{ propertyId: 'globaldeets.com' }, { command: 'x' }, { argv: ['x'] }, { workerId: 'attacker' }, { repairAuthority: true }, { effectType: 'deployment' }, { target: 'fwomps:other.com' }, { profileId: 'other' }]) {
      const dispatched = await call(itemPath(item.workItemId, 'dispatch'), { body: smuggled });
      expect([dispatched.status, (await json(dispatched)).code], JSON.stringify(smuggled)).toEqual([400, 'unexpected_fields']);
      const observed = await call('/api/mission-control/canary-observations', { body: { status: 'degraded', ...smuggled } });
      expect([observed.status, (await json(observed)).code], JSON.stringify(smuggled)).toEqual([400, 'unexpected_fields']);
      const investigated = await call(itemPath(item.workItemId, 'investigate'), { body: { evidenceRevision: REVISION, ...smuggled } });
      expect([investigated.status, (await json(investigated)).code], JSON.stringify(smuggled)).toEqual([400, 'unexpected_fields']);
    }
    for (const to of ['REPAIR_READY', 'REPAIRING', 'CANDIDATE_READY', 'VERIFIED', 'CHANGE_PUBLISHED', 'DEPLOYED', 'RESOLVED', 'DISMISSED', 'INVESTIGATION_READY', 'DIAGNOSED']) {
      const response = await call(itemPath(item.workItemId, 'transition'), { body: { to } });
      expect([response.status, (await json(response)).code], to).toEqual([403, 'canary_forbidden_transition']);
    }
    const extra = await call(itemPath(item.workItemId, 'transition'), { body: { to: 'QUALIFIED', reason: 'x' } });
    expect(extra.status).toBe(400);
    expect(await effectCount()).toBe(0);
    expect((await canaryItem()).state).toBe('INVESTIGATION_READY');
  });

  it('cannot see, transition, investigate or dispatch a non-canary work item, and never sees it listed', async () => {
    const other = await healthItem();
    expect(other.producer).not.toBe('mc-canary');
    const id = other.workItemId;
    expect((await call(itemPath(id), { method: 'GET' })).status).toBe(404);
    expect((await call(itemPath(id, 'transition'), { body: { to: 'QUALIFIED' } })).status).toBe(404);
    expect((await call(itemPath(id, 'investigate'), { body: { evidenceRevision: REVISION } })).status).toBe(404);
    const dispatched = await call(itemPath(id, 'dispatch'), { body: {} });
    expect([dispatched.status, (await json(dispatched)).code]).toEqual([403, 'canary_ineligible']);
    const listed = await json(await call('/api/mission-control/work-items', { method: 'GET' }));
    expect(listed.workItems).toEqual([]);
    const operations = JSON.stringify(await json(await call('/api/mission-control/operations', { method: 'GET' })));
    expect(operations).not.toContain(id);
    expect((await store().get(id)).state).toBe('OBSERVED');
    expect(await effectCount()).toBe(0);
    // the human admin keeps full visibility of the same item
    const admin = await call(itemPath(id), { method: 'GET', token: adminToken() });
    expect(admin.status).toBe(200);
  });

  it('cannot see or mutate a same-producer/same-property row with a different finding identity', async () => {
    const decoy = await decoyCanaryItem();
    expect(decoy.producer).toBe('mc-canary');
    expect(decoy.propertyId).toBe('aiaimate.com');
    expect(decoy.findingKey).not.toBe(CANARY_FINDING_KEY);

    const id = decoy.workItemId;
    expect((await call(itemPath(id), { method: 'GET' })).status).toBe(404);
    expect((await call(itemPath(id, 'transition'), { body: { to: 'QUALIFIED' } })).status).toBe(404);
    expect((await call(itemPath(id, 'investigate'), { body: { evidenceRevision: REVISION } })).status).toBe(404);
    const dispatched = await call(itemPath(id, 'dispatch'), { body: {} });
    expect([dispatched.status, (await json(dispatched)).code]).toEqual([403, 'canary_ineligible']);

    const listed = await json(await call('/api/mission-control/work-items', { method: 'GET' }));
    expect(listed.workItems.some((entry) => entry.workItemId === id)).toBe(false);
    const operations = JSON.stringify(await json(await call('/api/mission-control/operations', { method: 'GET' })));
    expect(operations).not.toContain(id);
    expect((await store().get(id)).state).toBe('OBSERVED');
  });
});

describe('attribution and secrecy', () => {
  it('every mutation by the runner is durably attributed to the runner actor, not the human admin', async () => {
    const { item } = await runnerReadyCanary();
    const actors = await actorsOf(item.workItemId);
    expect(actors.length).toBeGreaterThanOrEqual(3);
    expect(new Set(actors)).toEqual(new Set([RUNNER_ACTOR]));
    expect(JSON.stringify(item.investigation.signedContract)).toContain(RUNNER_ACTOR); // contract operator.subject_id
    expect(actors).not.toContain('user_admin');
  });

  it('the runner secret never appears in responses, logs or errors; access diagnostics are structured and secret-free', async () => {
    const logs = [];
    for (const channel of ['log', 'error', 'warn', 'info']) vi.spyOn(console, channel).mockImplementation((...args) => { logs.push(args.map(String).join(' ')); });
    const responses = [];
    const { item } = await runnerReadyCanary();
    for (const [method, path, body, token] of [
      ['POST', itemPath(item.workItemId, 'dispatch'), {}, RUNNER_TOKEN],
      ['POST', itemPath(item.workItemId, 'lease'), {}, RUNNER_TOKEN],
      ['GET', '/api/mission-control', undefined, RUNNER_TOKEN],
      ['GET', `/api/mission-control/${RUNNER_TOKEN}`, undefined, RUNNER_TOKEN],
      ['POST', '/api/mission-control/canary-observations', { status: 'degraded' }, OTHER_VALID_TOKEN],
      ['POST', '/api/mission-control/canary-observations', { status: 'degraded', [RUNNER_TOKEN]: true }, RUNNER_TOKEN],
      ['POST', itemPath(item.workItemId, 'investigate'), { evidenceRevision: RUNNER_TOKEN }, RUNNER_TOKEN],
      ['POST', '/api/mission-control/canary-observations', { status: 'degraded' }, RUNNER_TOKEN],
    ]) {
      const response = await call(path, { method, body, token });
      responses.push(await response.text());
    }
    const hostileMethod = await call('/api/mission-control/provenance', { method: RUNNER_TOKEN });
    expect(hostileMethod.status).toBe(403);
    responses.push(await hostileMethod.text());
    const malformedId = await call('/api/mission-control/work-items/%E0%A4%A', { method: 'GET' });
    expect(malformedId.status).toBe(404);
    responses.push(await malformedId.text());
    const off = await call('/api/mission-control/canary-observations', { body: { status: 'degraded' }, envOverrides: { MISSION_CONTROL_CANARY: undefined } });
    responses.push(await off.text());
    for (const text of [...responses, ...logs]) {
      expect(text).not.toContain(RUNNER_TOKEN);
      expect(text).not.toContain(OTHER_VALID_TOKEN);
      expect(text.toLowerCase()).not.toContain('authorization');
    }
    const audit = logs.filter((line) => line.includes('mc-canary-runner-access')).map((line) => JSON.parse(line));
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.every((entry) => entry.actor === RUNNER_ACTOR && entry.role === 'mission-control-canary-runner')).toBe(true);
    expect(audit.some((entry) => entry.result === 'allowed')).toBe(true);
    expect(audit.some((entry) => entry.result === 'refused:out_of_surface')).toBe(true);
    expect(audit.some((entry) => entry.result === 'refused:canary_disabled')).toBe(true);
    expect(audit.some((entry) => entry.route === ':route')).toBe(true);
    expect(audit.some((entry) => entry.method === ':method')).toBe(true);
    expect(audit.some((entry) => entry.route === 'work-items/:id' && entry.workItemId === null)).toBe(true);
    for (const entry of audit) expect(Object.keys(entry).sort()).toEqual(['actor', 'at', 'kind', 'method', 'release', 'result', 'role', 'route', 'workItemId']);
  });
});
