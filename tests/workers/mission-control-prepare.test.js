// MC-FW-002 PREPARE route and durable grant ledger (Workers runtime + D1).
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { createObservedWorkItem, transitionWorkItem } from '../../workers/lib/mission-control-work-items.js';
import { createD1WorkItemStore, ensureWorkItemSchema } from '../../workers/mission-control-work-items.js';
import { PrepareIssuerError, recordPrepareGrant } from '../../workers/fwomps-prepare-issuer.js';

const SECRET = 'sk_test_mission_control';
const SEED = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
const WORKER_TOKEN = 'mission-control-worker-token-test';

function call(path, { method = 'POST', auth, body, envOverrides } = {}) {
  return worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
    method,
    headers: { ...(auth ? { Authorization: `Bearer ${auth}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), {
    ...env,
    CLERK_SECRET_KEY: SECRET,
    CLERK_SECRET_KEY_GFD: SECRET,
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
    MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-a',
    MISSION_CONTROL_PREPARE_SIGNING_KEY: SEED,
    MISSION_CONTROL_PREPARE_KEY_ID: 'gfdprep_test',
    ...envOverrides,
  });
}

function sessionAs(metadata) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    id: 'sess_user_admin', status: 'active', user_id: 'user_admin',
    user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: metadata },
  }), { status: 200 })));
}

function token() {
  // Same compat-path shape as mission-control-api.test.js: the subject is then confirmed by the
  // (stubbed) Clerk session lookup, never trusted from the token body alone.
  const payload = { sid: 'sess_user_admin', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 3600, azp: 'https://goodflippindesign.com' };
  const body = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  return `header.${body}.signature`;
}

let diagnosed;

beforeAll(async () => {
  await ensureWorkItemSchema(env.DB);
  const store = createD1WorkItemStore(env.DB);
  const observed = await createObservedWorkItem({
    producer: 'health-sweep',
    propertyId: 'aiaimate.com',
    findingKey: 'health:aiaimate:prepare_route_test',
    observedAt: new Date().toISOString(),
    evidenceDigest: `sha256:${'a'.repeat(64)}`,
    severity: 'high',
  });
  const qualified = transitionWorkItem(observed, 'QUALIFIED', {
    repository: 'weave0/aiaimate',
    investigationProfile: 'gfd-property-health',
    verificationProfile: 'gfd-property-health-production',
    verificationScope: 'production',
    verificationPredicate: 'probe again',
  });
  await store.save(qualified, { at: qualified.lastSeen, from: 'OBSERVED', to: 'QUALIFIED', reason: 't', actor: 'test', detail: {} });
  // Force the durable row into the DIAGNOSED snapshot shape the ledger condition checks.
  await env.DB.prepare(`UPDATE mc_work_items SET lifecycle_state = 'DIAGNOSED', evidence_revision = ?
    WHERE work_item_id = ?`).bind('b'.repeat(40), qualified.workItemId).run();
  diagnosed = await store.get(qualified.workItemId);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('POST /api/mission-control/work-items/:id/prepare', () => {
  const path = () => `/api/mission-control/work-items/${encodeURIComponent(diagnosed.workItemId)}/prepare`;
  const body = { requestedPaths: ['src/app.js'], baseSha: 'c'.repeat(40) };

  it('is a 404 unless explicitly enabled', async () => {
    sessionAs({ role: 'admin', permissions: ['mc.prepare.approve'] });
    const response = await call(path(), { auth: token(), body });
    expect(response.status).toBe(404);
    expect((await response.json()).code).toBe('prepare_disabled');
  });

  it('refuses an admin without the explicit mc.prepare.approve permission', async () => {
    sessionAs({ role: 'admin' });
    const response = await call(path(), { auth: token(), body, envOverrides: { MISSION_CONTROL_PREPARE_ENABLED: 'true' } });
    expect(response.status).toBe(403);
    expect((await response.json()).code).toBe('prepare_permission_required');
  });

  it('refuses the OBSERVE worker credential', async () => {
    const response = await call(path(), { auth: WORKER_TOKEN, body, envOverrides: { MISSION_CONTROL_PREPARE_ENABLED: 'true' } });
    // The machine bearer is confined to lease/result intake before routing; it never reaches PREPARE.
    expect([401, 403]).toContain(response.status);
  });

  it('refuses caller-supplied authority fields and unregistered bindings without signing', async () => {
    sessionAs({ role: 'admin', permissions: ['mc.prepare.approve'] });
    const enabled = { MISSION_CONTROL_PREPARE_ENABLED: 'true' };
    const extra = await call(path(), { auth: token(), body: { ...body, workspaceRoot: '/etc' }, envOverrides: enabled });
    expect(extra.status).toBe(400);
    const unbound = await call(path(), { auth: token(), body, envOverrides: enabled });
    expect(unbound.status).toBe(409);
    const payload = await unbound.json();
    expect(['prepare_binding_unavailable', 'diagnostic_changed_since_investigation']).toContain(payload.code);
    expect(JSON.stringify(payload)).not.toContain(SEED);
    const unkeyed = await call(path(), { auth: token(), body, envOverrides: { ...enabled, MISSION_CONTROL_PREPARE_SIGNING_KEY: '' } });
    expect(unkeyed.status).toBe(503);
  });
});

describe('recordPrepareGrant', () => {
  const grant = (id) => ({
    contractId: `mcpc_${id}`,
    contractDigest: `sha256:${id.padEnd(64, '0')}`,
    expiresAt: '2030-01-01T00:00:00Z',
    payload: { lifetime: { nonce: `nonce${id}` } },
  });

  it('records a grant only for the exact DIAGNOSED snapshot it was built from', async () => {
    await recordPrepareGrant(env.DB, grant('1111111111111111'), { workItem: diagnosed, approverId: 'user_admin', issuedAt: '2026-10-07T00:00:00Z' });
    const stale = { ...diagnosed, lifecycleVersion: diagnosed.lifecycleVersion - 1 };
    await expect(recordPrepareGrant(env.DB, grant('2222222222222222'), { workItem: stale, approverId: 'user_admin', issuedAt: '2026-10-07T00:00:00Z' }))
      .rejects.toMatchObject({ code: 'work_item_changed' });
    const moved = { ...diagnosed, lastSeen: '2001-01-01T00:00:00.000Z' };
    await expect(recordPrepareGrant(env.DB, grant('3333333333333333'), { workItem: moved, approverId: 'user_admin', issuedAt: '2026-10-07T00:00:00Z' }))
      .rejects.toBeInstanceOf(PrepareIssuerError);
    await expect(recordPrepareGrant(env.DB, grant('1111111111111111'), { workItem: diagnosed, approverId: 'user_admin', issuedAt: '2026-10-07T00:00:00Z' }))
      .rejects.toThrow();
    const rows = await env.DB.prepare('SELECT contract_id FROM mc_prepare_grants').all();
    expect(rows.results.map((row) => row.contract_id)).toEqual(['mcpc_1111111111111111']);
  });
});
