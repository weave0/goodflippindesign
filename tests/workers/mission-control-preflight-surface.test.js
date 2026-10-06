// Preflight / certification surface of the REAL Worker (workers/auth.js) for the bounded canary-runner identity.
//   - The one read the preflight needs (GET provenance) works as the runner, and returns exactly what the human admin gets:
//     it is observation-level, so using the runner for it broadens nothing.
//   - Forged / missing runner credentials fail.
//   - Canary OFF: the exact disabled behaviour on every method x route.
//   - Canary ON: the intended bounded surface and nothing else (no operator/admin route, no lease/result/expire/recover,
//     no non-Mission-Control route).
//   - None of it creates, changes, leases or dispatches ordinary production work.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { settleObservation } from '../../workers/mission-control-work-items.js';
import { ensureWorkItemSchema } from '../../workers/mission-control-work-items.js';
import { ensureOutboxSchema } from '../../workers/lib/mission-control-outbox.js';
import { evaluatePreflight, fetchRuntimeProbe } from '../../scripts/lib/mc-production-preflight.mjs';
import { runOffProof } from '../../scripts/lib/mc-off-proof.mjs';

const RUNNER_TOKEN = 'ab'.repeat(64);
const FORGED_TOKEN = 'cd'.repeat(64);
const WORKER_TOKEN = 'mission-control-worker-token-test';
const SHA = '8f7f62f000f2af3ef6a31cbbf0f004a1e4449ec8';
const NIL = `gfdwi_v1_${'0'.repeat(64)}`;
const ON = { MISSION_CONTROL_CANARY: 'aiaimate.com' };

const clerkJwtLike = (payload) => `header.${btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')}.signature`;
const adminToken = () => clerkJwtLike({ sid: 'sess_admin', sub: 'user_admin', azp: 'https://goodflippindesign.com', exp: Math.floor(Date.now() / 1000) + 3600 });

function testEnv(overrides = {}) {
  return {
    ...env,
    CLERK_SECRET_KEY: 'sk_test_mission_control',
    CLERK_SECRET_KEY_GFD: 'sk_test_mission_control',
    MISSION_CONTROL_GITHUB_TOKEN: 'gh_test',
    MISSION_CONTROL_CONTRACT_KEY: 'mission-control-test-key',
    MISSION_CONTROL_CONTRACT_KEY_ID: 'gfd-mission-control-test',
    MISSION_CONTROL_RESULT_KEY: 'mission-control-result-key',
    MISSION_CONTROL_RESULT_KEY_ID: 'gfd-result-test',
    MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-a',
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
    MISSION_CONTROL_CANARY_RUNNER_TOKEN: RUNNER_TOKEN,
    ...overrides,
  };
}
const call = (path, { method = 'GET', token = RUNNER_TOKEN, body, overrides = {} } = {}) => worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
  method,
  headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
  body: body === undefined || method === 'GET' ? undefined : JSON.stringify(body),
}), testEnv(overrides));
const viaWorker = (overrides) => (url, init) => worker.fetch(new Request(url, init), testEnv(overrides));

const TABLES = ['mc_work_items', 'mc_work_item_events', 'mc_work_item_leases', 'mc_effects'];
async function dump() {
  const out = {};
  for (const table of TABLES) out[table] = (await env.DB.prepare(`SELECT * FROM ${table}`).all()).results;
  return out;
}
async function seedOrdinaryAndCanaryWork() {
  const digest = `sha256:${'1'.repeat(64)}`;
  await settleObservation(
    (await import('../../workers/mission-control-work-items.js')).createD1WorkItemStore(env.DB),
    { producer: 'health-sweep', propertyId: 'aiaimate.com', findingKey: 'health:aiaimate:machine_contract_mismatch', observedAt: '2026-10-03T12:00:00.000Z', evidenceDigest: digest, severity: 'low' },
    { status: 'degraded', checkedAt: '2026-10-03T12:00:00.000Z', actor: 'health-sweep' },
  );
  expect((await call('/api/mission-control/canary-observations', { method: 'POST', body: { status: 'degraded' }, overrides: ON })).status).toBe(200);
  const state = await dump();
  expect(state.mc_work_items.length).toBe(2);
  return state;
}

// The runner's whole accepted surface, as the preflight/specimen use it. Anything not listed must be refused.
const ROUTES = [
  ['', 'root'], ['/provenance', 'provenance'], ['/operations', 'operations'], ['/work-items', 'work-items'], [`/work-items/${NIL}`, 'work-item'],
  ['/canary-observations', 'canary-observations'], [`/work-items/${NIL}/transition`, 'transition'], [`/work-items/${NIL}/investigate`, 'investigate'],
  [`/work-items/${NIL}/dispatch`, 'dispatch'], [`/work-items/${NIL}/lease`, 'lease'], [`/work-items/${NIL}/result`, 'result'],
  [`/work-items/${NIL}/expire`, 'expire'], [`/work-items/${NIL}/recover-dispatch`, 'recover-dispatch'], [`/work-items/${NIL}/bogus`, 'bogus-action'],
  [`/work-items/${NIL}/transition/extra`, 'extra-segment'], ['/bogus', 'bogus-route'], ['/evidence', 'evidence-route'],
];
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const ALLOWED = new Set(['GET provenance', 'GET operations', 'GET work-items', 'GET work-item', 'POST canary-observations', 'POST transition', 'POST investigate', 'POST dispatch']);
const INERT_BODY = { off_proof_probe: true };

beforeEach(async () => {
  await ensureWorkItemSchema(env.DB);
  await ensureOutboxSchema(env.DB);
  for (const table of ['mc_work_item_events', 'mc_work_item_leases', 'mc_effects', 'mc_work_items']) await env.DB.prepare(`DELETE FROM ${table}`).run();
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('the preflight read, as the bounded runner', () => {
  it('canary ON: the runner reads a real provenance report that satisfies the protocol/capability/runtime checks', async () => {
    const probe = await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token: RUNNER_TOKEN, fetchImpl: viaWorker(ON) });
    expect(probe.status).toBe(200);
    const checks = evaluatePreflight({
      expectedSha: SHA, localHeadSha: SHA, expectedOnMain: true, expectedWorkerId: 'fwomps-worker-a', origin: 'https://goodflippindesign.com',
      controlPlane: { error: 'not under test' }, probe, host: null, gate: null, probeIdentity: 'canary-runner',
    });
    expect(checks.probeIdentity).toBe('canary-runner');
    expect(checks.checks.P3.status, checks.checks.P3.reason).toBe('PASS');
    expect(checks.checks.P9.status, checks.checks.P9.reason).toBe('PASS');
    expect(checks.checks.P10.status, checks.checks.P10.reason).toBe('PASS');
    expect(probe.body.bindings.MISSION_CONTROL_CANARY_RUNNER_TOKEN.state).toBe('present');
    // presence, fingerprints and key check values only: no credential value is ever in the report
    const text = JSON.stringify(probe.body);
    for (const secret of [RUNNER_TOKEN, WORKER_TOKEN, 'mission-control-test-key', 'mission-control-result-key']) expect(text).not.toContain(secret);
  });

  it('the runner gets exactly the report the human admin gets (observation-level; nothing is broadened or hidden)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input) => {
      if (String(input?.url || input).includes('api.clerk.com')) {
        return new Response(JSON.stringify({ id: 'sess_admin', status: 'active', user_id: 'user_admin', user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } } }), { status: 200 });
      }
      throw new Error('unexpected outbound fetch');
    }));
    const asRunner = await (await call('/api/mission-control/provenance', { overrides: ON })).json();
    const asAdmin = await (await call('/api/mission-control/provenance', { token: adminToken(), overrides: ON })).json();
    const strip = ({ observedAt, ...rest }) => rest;
    expect(strip(asRunner)).toEqual(strip(asAdmin));
  });

  it('forged or missing runner credentials fail the read, and the preflight reports a refused credential', async () => {
    for (const [label, token] of [['missing', null], ['forged well-formed', FORGED_TOKEN], ['runner token with a suffix', `${RUNNER_TOKEN}0`], ['the worker bearer', WORKER_TOKEN]]) {
      const response = await call('/api/mission-control/provenance', { token, overrides: ON });
      expect(response.status, label).toBe(401);
      if (token) {
        const probe = await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token, fetchImpl: viaWorker(ON) });
        const result = evaluatePreflight({ expectedSha: SHA, localHeadSha: SHA, expectedOnMain: true, origin: 'https://goodflippindesign.com', controlPlane: { error: 'x' }, probe, host: null, gate: null, probeIdentity: 'canary-runner' });
        expect(result.checks.P3.status, label).toBe('FAIL');
        expect(result.checks.P3.reason, label).toMatch(/refused/);
        expect(result.checks.P9.status, label).toBe('BLOCKED');
      }
    }
  });

  it('canary OFF: the valid runner gets the exact disabled refusal, and the preflight says the canary is off', async () => {
    const probe = await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token: RUNNER_TOKEN, fetchImpl: viaWorker({}) });
    expect(probe.status).toBe(404);
    expect(probe.body).toEqual({ error: 'The Mission Control canary is not enabled', code: 'canary_disabled' });
    const result = evaluatePreflight({ expectedSha: SHA, localHeadSha: SHA, expectedOnMain: true, origin: 'https://goodflippindesign.com', controlPlane: { error: 'x' }, probe, host: null, gate: null, probeIdentity: 'canary-runner' });
    expect(result.checks.P3.reason).toMatch(/canary is OFF/);
    for (const code of ['P4', 'P5', 'P6', 'P9', 'P10', 'P11']) expect(result.checks[code].status, code).toBe('BLOCKED');
  });
});

describe('canary OFF: every method x route is the exact disabled behaviour and changes nothing', () => {
  it('valid runner credential, every method and route => 404 canary_disabled, data untouched', async () => {
    const before = await seedOrdinaryAndCanaryWork();
    for (const off of [{ MISSION_CONTROL_CANARY: undefined }, { MISSION_CONTROL_CANARY: '' }, { MISSION_CONTROL_CANARY: 'globaldeets.com' }]) {
      for (const method of METHODS) {
        for (const [suffix, label] of ROUTES) {
          const response = await call(`/api/mission-control${suffix}`, { method, body: INERT_BODY, overrides: off });
          expect([response.status, (await response.json()).code], `${JSON.stringify(off)} ${method} ${label}`).toEqual([404, 'canary_disabled']);
        }
      }
    }
    expect(await dump()).toEqual(before);
  });
});

describe('canary ON: only the intended bounded runner surface', () => {
  it('exactly the 8 documented method+route pairs pass the runner gate; every other pair is refused 403', async () => {
    const before = await seedOrdinaryAndCanaryWork();
    const passed = [];
    for (const method of METHODS) {
      for (const [suffix, label] of ROUTES) {
        const response = await call(`/api/mission-control${suffix}`, { method, body: INERT_BODY, overrides: ON });
        const key = `${method} ${label}`;
        const body = await response.json().catch(() => ({}));
        if (ALLOWED.has(key)) {
          expect(response.status, key).not.toBe(403);
          expect(body.code, key).not.toBe('canary_disabled');
          passed.push(key);
        } else {
          expect(response.status, key).toBe(403);
          expect(String(body.error), key).toMatch(/limited to the canary surface/);
        }
      }
    }
    expect(new Set(passed)).toEqual(ALLOWED);
    // the allowed probes, with inert bodies and the nonexistent all-zero item, wrote nothing
    expect(await dump()).toEqual(before);
  });

  it('the runner credential is useless outside Mission Control (no ordinary operator/admin route accepts it)', async () => {
    for (const [method, path] of [['POST', '/api/blog'], ['GET', '/api/cms/pages'], ['POST', '/api/cms/pages'], ['DELETE', '/api/cms/pages/x'], ['POST', '/api/stripe/webhook'], ['GET', '/api/community/members/someone']]) {
      const response = await call(path, { method, body: INERT_BODY, overrides: ON });
      expect(response.status, `${method} ${path}`).toBeGreaterThanOrEqual(400);
      expect(response.status, `${method} ${path}`).toBeLessThan(500);
      const text = await response.text();
      expect(text).not.toContain(RUNNER_TOKEN);
    }
  });

  it('cannot become an admin or worker by claiming it: role-shaped bodies, headers and query strings change nothing', async () => {
    const before = await seedOrdinaryAndCanaryWork();
    for (const [path, init] of [
      [`/api/mission-control/work-items/${NIL}/lease?role=admin`, { method: 'POST', body: { role: 'admin' } }],
      [`/api/mission-control/work-items/${NIL}/result`, { method: 'POST', body: { actor: 'fwomps-machine' } }],
      ['/api/mission-control/canary-observations', { method: 'POST', body: { property: 'globaldeets.com', status: 'degraded' } }],
      ['/api/mission-control/canary-observations', { method: 'POST', body: { status: 'degraded', worker: 'x', repairAuthority: true } }],
      [`/api/mission-control/work-items/${NIL}/investigate`, { method: 'POST', body: { evidenceRevision: SHA, repairAuthority: true } }],
      [`/api/mission-control/work-items/${NIL}/transition`, { method: 'POST', body: { to: 'RESOLVED' } }],
    ]) {
      const response = await call(path, { ...init, overrides: ON });
      expect([400, 403, 404], `${path}`).toContain(response.status);
    }
    expect(await dump()).toEqual(before);
  });
});

describe('certification probes do not create, change, lease or dispatch ordinary production work', () => {
  it('provenance read + the full OFF proof against a canary that is unexpectedly ON leave all work records untouched', async () => {
    const before = await seedOrdinaryAndCanaryWork();
    const snapshot = { source: 'test', id: '11111111-1111-4111-8111-111111111111', environment: 'production', branch: 'main', commitHash: SHA, commitIsPrefix: false, stage: 'deploy:success' };
    const evidence = await runOffProof({ runnerToken: RUNNER_TOKEN, expectedSha: SHA, label: 'initial', controlPlane: async () => snapshot, fetchImpl: viaWorker(ON) });
    expect(evidence.verdict).toBe('NOT_PROVEN');
    await fetchRuntimeProbe({ origin: 'https://goodflippindesign.com', token: RUNNER_TOKEN, fetchImpl: viaWorker(ON) });
    expect(await dump()).toEqual(before);
    const after = await dump();
    expect(after.mc_effects).toEqual([]);
    expect(after.mc_work_item_leases).toEqual([]);
  });
});
