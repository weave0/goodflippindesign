import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { normalizeOperatorView } from '../../workers/mission-control-api.js';
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
  signResultHolding,
} from '../../workers/fwomps-investigation-adapter.js';

const SECRET = 'sk_test_mission_control';
const CONTRACT_KEY = 'mission-control-test-key';
const RESULT_KEY = 'mission-control-result-key';
const WORKER_TOKEN = 'mission-control-worker-token-test';

function token(payload) {
  const body = btoa(JSON.stringify(payload)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  return `header.${body}.signature`;
}

function liveToken(sub) {
  return token({
    sid: `sess_${sub}`,
    sub,
    exp: Math.floor(Date.now() / 1000) + 3600,
  });
}

function plane(contractName, schemaVersion, extra = {}) {
  return {
    contractName,
    schemaVersion,
    generatedAt: '2026-09-29T12:42:13.837Z',
    ...extra,
  };
}

function evidenceBundle(overrides = {}) {
  return {
    estateHealth: plane('globaldeets-estate-health', '2.0.0', {
      propertyCount: 1,
      summary: { availableZones: 1, availabilityKnownZones: 1, open: 1 },
      freshnessPolicy: {
        probe: { freshWithinHours: 8, expiredAfterHours: 24 },
        audience: { freshWithinHours: 36, expiredAfterHours: 96 },
        businessEvents: { freshWithinHours: 36, expiredAfterHours: 96 },
      },
      properties: [{
        propertyId: 'aiaimate.com',
        displayName: 'AI Aimate',
        availability: { state: 'available', blocked: false, evidenceState: 'measured', observedAt: '2026-09-29T12:42:13.837Z' },
        criticalPath: { state: 'pass', evidenceState: 'measured' },
      }],
    }),
    diagnostics: plane('globaldeets-diagnostics-queue', '2.0.0', {
      summary: { open: 1 },
      items: [],
      findings: {
        risks: [{
          id: 'from-diagnostics-risks',
          title: 'Diagnostics risk shape',
          severity: 'high',
          why: 'The queue used findings.risks.',
          action: 'Normalize this shape.',
          priorityScore: 10,
        }],
      },
    }),
    executive: plane('globaldeets-executive', '1.0.0', {
      headline: {
        statements: [
          { id: 'estate', tone: 'neutral', text: 'One property needs a certified audience before anyone calls it traction.' },
        ],
      },
      findings: {
        risks: [{
          id: 'measurement:audience-certification',
          title: 'Certify human audience metrics',
          severity: 'critical',
          why: 'Edge requests are not people.',
          action: 'Connect a certified audience source.',
          priorityScore: 118,
          confidence: 'high',
        }],
      },
    }),
    history: plane('globaldeets-mission-control-history', '1.2.0'),
    audience: plane('globaldeets-audience', '1.1.0', {
      source: { status: 'partial' },
      estate: { requests: { 28: { evidenceState: 'measured' } } },
    }),
    businessEvents: plane('globaldeets-business-events', '1.0.0', {
      source: { status: 'partial' },
      estate: { totals: { lead: { 28: { evidenceState: 'partial' } } } },
    }),
    probes: plane('globaldeets-probes', '1.1.0', {
      latestAttempt: { at: '2026-09-29T12:42:13.837Z' },
    }),
    ...overrides,
  };
}

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
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
    ...overrides,
  };
}

function call(path, { method = 'GET', auth, workerAuth, body, envOverrides } = {}) {
  return worker.fetch(new Request(`https://goodflippindesign.com${path}`, {
    method,
    headers: {
      ...((workerAuth || auth) ? { Authorization: `Bearer ${workerAuth || auth}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), testEnv(envOverrides));
}

beforeAll(async () => {
  await ensureWorkItemSchema(env.DB);
  await env.DB.prepare('DELETE FROM mc_work_item_events').run();
  await env.DB.prepare('DELETE FROM mc_work_item_leases').run();
  await env.DB.prepare('DELETE FROM mc_effects').run();
  await env.DB.prepare('DELETE FROM mc_work_items').run();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('mission control route authentication', () => {
  it('limits the machine bearer to worker-only intake routes', async () => {
    const workerRead = await call('/api/mission-control', { workerAuth: WORKER_TOKEN });
    expect(workerRead.status).toBe(401);

    const fakeId = 'gfdwi_v1_' + 'a'.repeat(64);
    const adminWorkerAction = await call(`/api/mission-control/work-items/${fakeId}/lease`, {
      method: 'POST',
      auth: liveToken('user_admin'),
      body: {},
    });
    expect(adminWorkerAction.status).toBe(403);

    const missingWorkerAuth = await call(`/api/mission-control/work-items/${fakeId}/result`, {
      method: 'POST',
      body: {},
    });
    expect(missingWorkerAuth.status).toBe(401);
  });


  it('rejects a missing token', async () => {
    const response = await call('/api/mission-control');
    expect(response.status).toBe(401);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });

  it('rejects an authenticated non-admin', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      expect(String(url)).not.toContain('/users/');
      return new Response(JSON.stringify({
        user: { id: 'user_member', emailAddress: 'member@example.com', publicMetadata: { role: 'member' } },
      }), { status: 200 });
    }));
    const response = await call('/api/mission-control', { auth: liveToken('user_member') });
    expect(response.status).toBe(403);
  });

  it('does not trust a decoded subject when session verification fails', async () => {
    const fetchMock = vi.fn(async (url) => {
      if (String(url).includes('/users/')) {
        return new Response(JSON.stringify({
          id: 'user_admin',
          email_addresses: [{ email_address: 'brett.l.weaver@gmail.com' }],
          public_metadata: { role: 'admin' },
        }), { status: 200 });
      }
      return new Response('no', { status: 401 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const response = await call('/api/mission-control', { auth: liveToken('user_admin') });
    expect(response.status).toBe(401);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/users/'))).toBe(false);
  });

  it('allows a verified admin and rejects malformed evidence without returning it', async () => {
    const bundle = evidenceBundle();
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/sessions/')) {
        return new Response(JSON.stringify({
          user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
        }), { status: 200 });
      }
      const match = Object.entries({
        'estate-health.json': bundle.estateHealth,
        'diagnostics.json': bundle.diagnostics,
        'executive.json': bundle.executive,
        'history.json': bundle.history,
        'audience.json': bundle.audience,
        'business-events.json': bundle.businessEvents,
        'probes.json': bundle.probes,
      }).find(([name]) => target.includes(name));
      if (!match) throw new Error(`unexpected fetch ${target}`);
      return new Response(JSON.stringify(match[1]), { status: 200 });
    }));

    const allowed = await call('/api/mission-control', { auth: liveToken('user_admin') });
    expect(allowed.status).toBe(200);
    const payload = await allowed.json();
    expect(payload.operator.statements[0]).toContain('certified audience');
    expect(payload.operator.audienceState).toBe('measured');
    expect(payload.operator.businessEventState).toBe('partial');
    expect(payload.operator.diagnostics.map((item) => item.id)).toEqual([
      'measurement:audience-certification',
      'from-diagnostics-risks',
    ]);
    expect(payload.evidence.diagnostics.findings.risks[0].title).toBe('Diagnostics risk shape');

    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const target = String(url);
      if (target.includes('/sessions/')) {
        return new Response(JSON.stringify({
          user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
        }), { status: 200 });
      }
      if (target.includes('diagnostics.json')) {
        return new Response(JSON.stringify([{ leaked: 'private-estate-sentinel' }]), { status: 200 });
      }
      return new Response(JSON.stringify(bundle.estateHealth), { status: 200 });
    }));
    const rejected = await call('/api/mission-control', { auth: liveToken('user_admin') });
    expect(rejected.status).toBe(502);
    const text = await rejected.text();
    expect(text).not.toContain('private-estate-sentinel');
    expect(text).toContain('rejected');
  });

  it('does not grant a cross-origin preflight', async () => {
    const response = await call('/api/mission-control', {
      method: 'OPTIONS',
    });
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('operator normalization', () => {
  it('reads headline statements and canonical evidenceState', () => {
    const view = normalizeOperatorView(evidenceBundle(), Date.parse('2026-09-29T13:00:00.000Z'));
    expect(view.statements).toEqual([
      'One property needs a certified audience before anyone calls it traction.',
    ]);
    expect(view.audienceState).toBe('measured');
    expect(view.businessEventState).toBe('partial');
    expect(view.properties[0].availability).toBe('available');
  });
});

describe('investigation seam', () => {
  it('issues one signed investigation, accepts one leased result, and stops before repair', async () => {
    const store = createD1WorkItemStore(env.DB);
    const observed = await createObservedWorkItem({
      producer: 'health-sweep',
      propertyId: 'aiaimate.com',
      findingKey: 'health:aiaimate:machine_contract_mismatch',
      observedAt: '2026-09-29T07:24:48.137Z',
      evidenceDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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
      at: qualified.lastSeen,
      from: 'OBSERVED',
      to: 'QUALIFIED',
      reason: 'test qualification',
      actor: 'test',
      detail: {},
    });

    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
    }), { status: 200 })));

    const issued = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/investigate`,
      {
        method: 'POST',
        auth: liveToken('user_admin'),
        body: { evidenceRevision: '257210036bff85961a1b9c96c0572aabcaaa9cd4' },
      },
    );
    expect(issued.status).toBe(200);
    const ready = (await issued.json()).workItem;
    expect(ready.state).toBe('INVESTIGATION_READY');
    expect(ready.investigation.repairAuthority).toBe(false);

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const leased = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/lease`,
      {
        method: 'POST',
        workerAuth: WORKER_TOKEN,
        body: {
          workerId: 'fwomps-worker-a',
          attempt: 1,
          leaseTokenDigest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
          expiresAt,
          requestId: ready.investigation.requestId,
        },
      },
    );
    expect(leased.status).toBe(200);
    expect((await leased.json()).workItem.state).toBe('INVESTIGATING');

    const conflict = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/lease`,
      {
        method: 'POST',
        workerAuth: WORKER_TOKEN,
        body: {
          workerId: 'fwomps-worker-b',
          attempt: 1,
          leaseTokenDigest: 'sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
          expiresAt,
          requestId: ready.investigation.requestId,
        },
      },
    );
    expect(conflict.status).toBe(409);

    const signedResult = await signResultHolding({
      schema_version: 'gfd-investigation-result-holding-1',
      work_item_id: qualified.workItemId,
      request_id: ready.investigation.requestId,
      contract_digest: ready.investigation.digest,
      worker_id: 'fwomps-worker-a',
      diagnosis: { summary: 'The published property id does not match the machine contract.', evidence: ['propertyId'] },
      authentication: { key_id: 'gfd-result-test' },
    }, keyBytesFromEnv(RESULT_KEY));
    const accepted = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/result`,
      { method: 'POST', workerAuth: WORKER_TOKEN, body: signedResult },
    );
    expect(accepted.status).toBe(200);
    const body = await accepted.json();
    expect(body.workItem.state).toBe('DIAGNOSED');
    expect(body.workItem.diagnosis.summary).toContain('property id');
    expect(body.workItem.repairAuthorityRef).toBeNull();

    const repair = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/transition`,
      { method: 'POST', auth: liveToken('user_admin'), body: { to: 'REPAIR_READY' } },
    );
    expect(repair.status).toBe(403);
    const repairBody = await repair.json();
    expect(repairBody.code).toBe('repair_authority_denied');

    const listed = await store.list();
    expect(listed.filter((item) => item.workItemId === qualified.workItemId)).toHaveLength(1);
  });
});
