import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { authorizeDispatch } from './dispatch-intent.js';

import worker, { verifyClerkSessionStrict } from '../../workers/auth.js';
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
  signResultEnvelope,
} from '../../workers/fwomps-investigation-adapter.js';

const SECRET = 'sk_test_mission_control';
const CONTRACT_KEY = 'mission-control-test-key';
const RESULT_KEY = 'mission-control-result-key';
const WORKER_TOKEN = 'mission-control-worker-token-test';

const TEST_JWT_KID = 'clerk-test-kid';
let testJwtPrivateKey;
let testJwtPublicJwk;

function base64UrlText(value) {
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function base64UrlBytes(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function signedToken(payload) {
  const header = base64UrlText(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: TEST_JWT_KID }));
  const body = base64UrlText(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = new Uint8Array(await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    testJwtPrivateKey,
    new TextEncoder().encode(signingInput)
  ));
  return `${signingInput}.${base64UrlBytes(signature)}`;
}

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
    MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-a',
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
  const pair = await crypto.subtle.generateKey({
    name: 'RSASSA-PKCS1-v1_5',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
  }, true, ['sign', 'verify']);
  testJwtPrivateKey = pair.privateKey;
  testJwtPublicJwk = {
    ...await crypto.subtle.exportKey('jwk', pair.publicKey),
    kid: TEST_JWT_KID,
    alg: 'RS256',
    use: 'sig',
  };

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
  it('verifies a Clerk JWT through JWKS, then confirms the active Backend API Session', async () => {
    const jwt = await signedToken({
      sid: 'sess_test',
      sub: 'user_admin',
      exp: Math.floor(Date.now() / 1000) + 60,
      azp: 'https://goodflippindesign.com',
    });
    const fetchMock = vi.fn(async (url, init = {}) => {
      const href = String(url);
      if (href === 'https://api.clerk.com/v1/jwks') {
        expect(init.headers?.Authorization).toBe(`Bearer ${SECRET}`);
        return Response.json({ keys: [testJwtPublicJwk] });
      }
      if (href === 'https://api.clerk.com/v1/sessions/sess_test') {
        expect(init.method).toBeUndefined();
        return Response.json({ id: 'sess_test', status: 'active', user_id: 'user_admin' });
      }
      expect(href).toBe('https://api.clerk.com/v1/users/user_admin');
      return Response.json({ id: 'user_admin', public_metadata: { role: 'admin' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const verified = await verifyClerkSessionStrict(jwt, SECRET, {
      authorizedParties: ['https://goodflippindesign.com'],
    });

    expect(verified?.publicMetadata.role).toBe('admin');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/verify'))).toBe(false);
  });

  it('rejects a cryptographically invalid Clerk JWT without falling back to session verification', async () => {
    const payload = {
      sid: 'sess_test',
      sub: 'user_admin',
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const valid = await signedToken(payload);
    const [header, _body, signature] = valid.split('.');
    const tamperedBody = base64UrlText(JSON.stringify({ ...payload, sub: 'user_attacker' }));
    const tampered = `${header}.${tamperedBody}.${signature}`;
    const fetchMock = vi.fn(async (url) => {
      expect(String(url)).toBe('https://api.clerk.com/v1/jwks');
      return Response.json({ keys: [testJwtPublicJwk] });
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await verifyClerkSessionStrict(tampered, SECRET)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps revoked sessions fail-closed after successful JWT signature verification', async () => {
    const jwt = await signedToken({
      sid: 'sess_test',
      sub: 'user_admin',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const fetchMock = vi.fn(async (url) => {
      const href = String(url);
      if (href === 'https://api.clerk.com/v1/jwks') return Response.json({ keys: [testJwtPublicJwk] });
      if (href === 'https://api.clerk.com/v1/sessions/sess_test') {
        return Response.json({ id: 'sess_test', status: 'revoked', user_id: 'user_admin' });
      }
      throw new Error(`unexpected fetch ${href}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    expect(await verifyClerkSessionStrict(jwt, SECRET)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    { id: 'sess_other', status: 'active', user_id: 'user_admin' },
    { id: 'sess_test', status: 'revoked', user_id: 'user_admin' },
    { id: 'sess_test', status: 'active', user_id: 'user_other' },
    { id: 'sess_test', status: 'active' },
  ])('rejects an inconsistent verified session without fetching a user: %j', async (session) => {
    const fetchMock = vi.fn(async () => Response.json(session));
    vi.stubGlobal('fetch', fetchMock);
    expect(await verifyClerkSessionStrict(token({ sid: 'sess_test', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 60 }), SECRET)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockClear();
    fetchMock.mockImplementation(async () => Response.json({ ...session,
      user: { id: 'user_admin', public_metadata: { role: 'admin' } },
    }));
    expect(await verifyClerkSessionStrict(token({ sid: 'sess_test', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 60 }), SECRET)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([403, 200])('rejects a failed or mismatched user lookup (HTTP %i)', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async (url) => String(url).includes('/sessions/')
      ? Response.json({ id: 'sess_test', status: 'active', user_id: 'user_admin' })
      : Response.json({ id: 'user_other' }, { status })));
    expect(await verifyClerkSessionStrict(token({ sid: 'sess_test', sub: 'user_admin', exp: Math.floor(Date.now() / 1000) + 60 }), SECRET)).toBeNull();
  });

  it('limits the machine bearer to worker-only intake routes', async () => {
    const workerRead = await call('/api/mission-control', { workerAuth: WORKER_TOKEN });
    expect(workerRead.status).toBe(401);

    const fakeId = 'gfdwi_v1_' + 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('/sessions/')) {
        return new Response(JSON.stringify({
          id: 'sess_user_admin', status: 'active', user_id: 'user_admin',
          user: { id: 'user_admin', emailAddress: 'ops@example.com', publicMetadata: { role: 'admin' } },
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
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
        id: 'sess_user_member', status: 'active', user_id: 'user_member',
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
          id: 'sess_user_admin', status: 'active', user_id: 'user_admin',
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
          id: 'sess_user_admin', status: 'active', user_id: 'user_admin',
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
      id: 'sess_user_admin', status: 'active', user_id: 'user_admin',
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
    const issuedBody = await issued.json();
    const ready = issuedBody.workItem;

    const invented = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/lease`,
      {
        method: 'POST',
        workerAuth: WORKER_TOKEN,
        body: { workerId: 'fwomps-worker-b', attempt: 1 },
      },
    );
    expect(invented.status).toBe(400);

    expect(ready.state).toBe('INVESTIGATION_READY');
    expect(ready.investigation.repairAuthority).toBe(false);
    expect(issuedBody.contract.schema_version).toBe('mc-fw-investigation-request-1');
    expect(issuedBody.contract.operation).toBe('investigate');
    expect(issuedBody.contract.contract.requested_mode).toBe('read_only');

    const authority = await authorizeDispatch(env.DB, ready);
    const leased = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/lease`,
      { method: 'POST', workerAuth: WORKER_TOKEN, body: authority.body },
    );
    expect(leased.status).toBe(200);
    const leaseBody = await leased.json();
    expect(leaseBody.workItem.state).toBe('INVESTIGATING');
    expect(leaseBody.leaseGrant.schema_version).toBe('mc-fw-lease-grant-1');
    expect(leaseBody.leaseGrant.worker_id).toBe('fwomps-worker-a');
    expect(leaseBody.leaseGrant.request_id).toBe(ready.investigation.requestId);
    expect(leaseBody.leaseGrant.contract_digest).toBe(ready.investigation.digest);
    expect(leaseBody.contract.authentication.mac).toBe(issuedBody.contract.authentication.mac);
    expect(leaseBody.leaseTokenHex).toMatch(/^[0-9a-f]{64}$/);

    const conflict = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/lease`,
      { method: 'POST', workerAuth: WORKER_TOKEN, body: authority.body },
    );
    expect(conflict.status).toBe(409);

    const revision = issuedBody.contract.evidence.revision;
    const signedResult = await signResultEnvelope({
      schema_version: 'mc-fw-investigation-result-1',
      request_id: ready.investigation.requestId,
      contract_digest: ready.investigation.digest,
      attempt: leaseBody.leaseGrant.attempt,
      lease_token_digest: leaseBody.leaseGrant.lease_token_digest,
      worker: {
        id: 'fwomps-worker-a',
        fwomps_version: '0.1.0',
        completed_at: '2026-09-29T12:00:01Z',
      },
      source: {
        property_id: qualified.propertyId,
        repository: qualified.repository,
        workspace_name: 'aiaimate',
        inspected_head_sha: revision,
        source_state: 'accepted_by_host_policy',
      },
      evidence: {
        revision,
        snapshot_digest: issuedBody.contract.evidence.snapshot_digest,
        diagnostic_id: qualified.workItemId,
        diagnostic_digest: issuedBody.contract.diagnostic.digest,
      },
      outcome: 'reproduced',
      summary: 'profile gfd-property-health: reproduced',
      observations: ['command 1: fail (exit 1)'],
      execution_receipts: [{
        profile: 'gfd-property-health',
        index: 0,
        status: 'fail',
        exit_code: 1,
        output_digest: 'sha256:5555555555555555555555555555555555555555555555555555555555555555',
        stdout_excerpt: '',
        stderr_excerpt: 'property id mismatch',
        output_truncated: false,
        timed_out: false,
        authoritative_sandbox: true,
      }],
      repairability: { state: 'not_indicated', advisory_repair_scope: [] },
      stop_reason: null,
      authentication: { key_id: 'gfd-result-test' },
    }, keyBytesFromEnv(RESULT_KEY));
    const accepted = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/result`,
      { method: 'POST', workerAuth: WORKER_TOKEN, body: signedResult },
    );
    expect(accepted.status).toBe(200);
    const body = await accepted.json();
    expect(body.workItem.state).toBe('DIAGNOSED');
    expect(body.workItem.diagnosis.summary).toContain('reproduced');
    expect(body.workItem.diagnosis.outcome).toBe('reproduced');
    expect(body.workItem.repairAuthorityRef).toBeNull();
    expect(body.leaseTokenHex).toBeUndefined();

    const replay = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/result`,
      { method: 'POST', workerAuth: WORKER_TOKEN, body: signedResult },
    );
    expect(replay.status).toBe(200);
    expect((await replay.json()).workItem.diagnosis.resultDigest).toBe(body.workItem.diagnosis.resultDigest);

    const conflicting = await signResultEnvelope({
      ...signedResult,
      outcome: 'not_reproduced',
      summary: 'profile gfd-property-health: not_reproduced',
      authentication: { key_id: 'gfd-result-test' },
    }, keyBytesFromEnv(RESULT_KEY));
    const rejected = await call(
      `/api/mission-control/work-items/${encodeURIComponent(qualified.workItemId)}/result`,
      { method: 'POST', workerAuth: WORKER_TOKEN, body: conflicting },
    );
    expect(rejected.status).toBe(409);
    expect((await rejected.json()).code).toBe('result_conflict');

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
