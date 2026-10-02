import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import worker from '../../workers/auth.js';
import { buildProvenanceReport } from '../../workers/lib/worker-provenance.js';
import { buildStamp } from '../../workers/lib/pages-release-stamp.js';
import { keyCheckValue, strongHexKeyBytes, strongTokenBytes } from '../../workers/lib/key-check-value.js';
import { ensureWorkItemSchema } from '../../workers/mission-control-work-items.js';

const SECRET = 'sk_test_provenance';
const SHA = 'a'.repeat(40);
const CONTRACT_KEY = 'f'.repeat(64);
const RESULT_KEY = 'e'.repeat(64);
const WORKER_TOKEN = 'provenance-worker-token-sentinel';
const KEY_ID = 'gfd-contract-key-id-sentinel';
const RESULT_KEY_ID = 'gfd-result-key-id-sentinel';
const WORKER_ID = 'fwomps-worker-id-sentinel';

const BINDINGS = [
  'MISSION_CONTROL_CONTRACT_KEY',
  'MISSION_CONTROL_CONTRACT_KEY_ID',
  'MISSION_CONTROL_RESULT_KEY',
  'MISSION_CONTROL_RESULT_KEY_ID',
  'MISSION_CONTROL_RESULT_WORKER_ID',
  'MISSION_CONTROL_WORKER_TOKEN',
];

function liveToken(sub) {
  const body = btoa(JSON.stringify({ sid: `sess_${sub}`, sub, exp: Math.floor(Date.now() / 1000) + 3600 }))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  return `header.${body}.signature`;
}

const PAGES_URL = 'https://58d05431.goodflippindesign.pages.dev';
const PAGES_STAMP = buildStamp({ CF_PAGES: '1', CF_PAGES_COMMIT_SHA: SHA, CF_PAGES_BRANCH: 'main', CF_PAGES_URL: PAGES_URL }, new Date('2026-09-30T12:00:00.000Z'));

// Stand-in for the Pages static-asset binding. `body` undefined => 404 (no stamp in this deployment).
function assetsServing(body, status = 200) {
  return { fetch: async () => (body === undefined ? new Response('nope', { status: 404 }) : new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })) };
}

beforeAll(async () => { await ensureWorkItemSchema(env.DB); });

function fullEnv(overrides = {}) {
  return {
    ...env,
    CLERK_SECRET_KEY: SECRET,
    CLERK_SECRET_KEY_GFD: SECRET,
    MISSION_CONTROL_CONTRACT_KEY: CONTRACT_KEY,
    MISSION_CONTROL_CONTRACT_KEY_ID: KEY_ID,
    MISSION_CONTROL_RESULT_KEY: RESULT_KEY,
    MISSION_CONTROL_RESULT_KEY_ID: RESULT_KEY_ID,
    MISSION_CONTROL_RESULT_WORKER_ID: WORKER_ID,
    MISSION_CONTROL_WORKER_TOKEN: WORKER_TOKEN,
    ASSETS: assetsServing(PAGES_STAMP),
    ...overrides,
  };
}

function stubClerk(role) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('/sessions/')) {
      return new Response(JSON.stringify({
        user: { id: 'user_x', emailAddress: 'ops@example.com', publicMetadata: { role } },
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  }));
}

function probe({ auth, workerAuth, envOverrides } = {}) {
  return worker.fetch(new Request('https://goodflippindesign.com/api/mission-control/provenance', {
    headers: (workerAuth || auth) ? { Authorization: `Bearer ${workerAuth || auth}` } : {},
  }), fullEnv(envOverrides));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('worker provenance probe: authorization', () => {
  it('refuses an unauthenticated request', async () => {
    const response = await probe();
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(SHA);
  });

  it('refuses the machine worker bearer (it reaches only lease/result intake)', async () => {
    const response = await probe({ workerAuth: WORKER_TOKEN });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain(SHA);
  });

  it('refuses an authenticated non-admin', async () => {
    stubClerk('member');
    const response = await probe({ auth: liveToken('user_x') });
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(SHA);
  });

  it('does not trust a token whose session fails verification', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('no', { status: 401 })));
    expect((await probe({ auth: liveToken('user_x') })).status).toBe(401);
  });
});

describe('worker provenance probe: report', () => {
  it('reports the stamped release, protocol versions and ready bindings without leaking any value', async () => {
    stubClerk('admin');
    const response = await probe({ auth: liveToken('user_x') });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const text = await response.text();
    const report = JSON.parse(text);

    expect(report.release).toMatchObject({ state: 'stamped', sha: SHA, source: 'cloudflare-pages' });
    expect(report.ready).toBe(true);
    expect(report.blockers).toEqual([]);
    expect(report.protocol.investigationRequest.schema).toBe('mc-fw-investigation-request-1');
    expect(report.protocol.leaseGrant.schema).toBe('mc-fw-lease-grant-1');
    expect(report.protocol.investigationResult.schema).toBe('mc-fw-investigation-result-1');
    expect(report.protocol.missionControlApi).toBe('gfd-mission-control-1');
    expect(report.capabilities).toMatchObject({ readOnly: true, repairAuthority: false, deployAuthority: false, writeAuthority: false });
    expect(Object.keys(report.bindings).sort()).toEqual([...BINDINGS].sort());
    for (const name of BINDINGS) expect(report.bindings[name].state).toBe('present');

    for (const secret of [CONTRACT_KEY, RESULT_KEY, WORKER_TOKEN, KEY_ID, RESULT_KEY_ID, WORKER_ID, SECRET]) {
      expect(text).not.toContain(secret);
    }
    // Credentials never get even a fingerprint; only non-secret identifiers do.
    expect(report.bindings.MISSION_CONTROL_CONTRACT_KEY.fingerprint).toBeUndefined();
    expect(report.bindings.MISSION_CONTROL_RESULT_KEY.fingerprint).toBeUndefined();
    expect(report.bindings.MISSION_CONTROL_WORKER_TOKEN.fingerprint).toBeUndefined();
    expect(report.bindings.MISSION_CONTROL_RESULT_WORKER_ID.fingerprint).toMatch(/^sha256:[0-9a-f]{16}$/);
  });

  it('a deployment with no release stamp cannot masquerade as current', async () => {
    stubClerk('admin');
    const response = await probe({ auth: liveToken('user_x'), envOverrides: { ASSETS: assetsServing(undefined) } });
    const report = await response.json();
    expect(report.release.state).toBe('unstamped');
    expect(report.release.sha).toBeNull();
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('release stamp unstamped');
  });

  it('a runtime without the Pages asset binding is unstamped, never stamped', async () => {
    const report = await buildProvenanceReport(fullEnv({ ASSETS: undefined }));
    expect(report.release.state).toBe('unstamped');
    expect(report.ready).toBe(false);
  });

  it('a local/test build stamp is reported as local, never production', async () => {
    const local = buildStamp({ CF_PAGES_COMMIT_SHA: SHA }, new Date());
    const report = await buildProvenanceReport(fullEnv({ ASSETS: assetsServing(local) }));
    expect(report.release.state).toBe('local');
    expect(report.release.sha).toBeNull();
    expect(report.ready).toBe(false);
  });

  it.each([
    ['short sha', { ...PAGES_STAMP, sha: 'abc123' }],
    ['uppercase sha', { ...PAGES_STAMP, sha: 'A'.repeat(40) }],
    ['branch name instead of a sha', { ...PAGES_STAMP, sha: 'main' }],
    ['bad timestamp', { ...PAGES_STAMP, builtAt: 'yesterday' }],
    ['local stamp claiming stamped', { ...PAGES_STAMP, source: 'local' }],
    ['foreign schema', { ...PAGES_STAMP, schemaVersion: 'other-1' }],
    ['Pages build with an invalid sha', buildStamp({ CF_PAGES: '1', CF_PAGES_COMMIT_SHA: 'nope' })],
  ])('a malformed stamp (%s) is not a release identity', async (_name, stamp) => {
    const report = await buildProvenanceReport(fullEnv({ ASSETS: assetsServing(stamp) }));
    expect(report.release.state).toBe('invalid');
    expect(report.release.sha).toBeNull();
    expect(report.ready).toBe(false);
  });

  it('an SPA-fallback page or error in place of the stamp is invalid, not stamped', async () => {
    for (const assets of [assetsServing('<!doctype html><html></html>'), assetsServing('boom', 500), { fetch: async () => { throw new Error('x'); } }]) {
      const report = await buildProvenanceReport(fullEnv({ ASSETS: assets }));
      expect(report.release.state).toBe('invalid');
      expect(report.release.sha).toBeNull();
    }
  });

  it('reports the D1 binding state read-only', async () => {
    const ok = await buildProvenanceReport(fullEnv());
    expect(ok.d1).toEqual({ bound: true, reachable: true, workItemSchema: true });
    const none = await buildProvenanceReport(fullEnv({ DB: undefined }));
    expect(none.d1.bound).toBe(false);
    expect(none.ready).toBe(false);
    expect(none.blockers).toContain('D1 binding unavailable');
    const broken = await buildProvenanceReport(fullEnv({ DB: { prepare() { throw new Error('d1 down'); } } }));
    expect(broken.d1).toEqual({ bound: true, reachable: false, workItemSchema: false });
    expect(JSON.stringify(broken)).not.toContain('d1 down');
  });

  it('publishes one-way key check values for strong keys only, never the keys', async () => {
    const report = await buildProvenanceReport(fullEnv());
    expect(report.bindings.MISSION_CONTROL_CONTRACT_KEY.kcv).toBe(await keyCheckValue(strongHexKeyBytes(CONTRACT_KEY), 'contract'));
    expect(report.bindings.MISSION_CONTROL_RESULT_KEY.kcv).toBe(await keyCheckValue(strongHexKeyBytes(RESULT_KEY), 'result'));
    const shortToken = await buildProvenanceReport(fullEnv({ MISSION_CONTROL_WORKER_TOKEN: 'sixteen-plus-token' }));
    expect(shortToken.bindings.MISSION_CONTROL_WORKER_TOKEN.state).toBe('present');
    expect(shortToken.bindings.MISSION_CONTROL_WORKER_TOKEN.kcv).toBeUndefined(); // under 32 chars: usable, but no check value
    const strongToken = 'a-strong-delivery-bearer-token-0123456789';
    const strong = await buildProvenanceReport(fullEnv({ MISSION_CONTROL_WORKER_TOKEN: strongToken }));
    expect(strong.bindings.MISSION_CONTROL_WORKER_TOKEN.kcv).toBe(await keyCheckValue(strongTokenBytes(strongToken), 'bearer'));
    expect(JSON.stringify(strong)).not.toContain(strongToken);
    // role separation: the same bytes under another role give a different value
    expect(report.bindings.MISSION_CONTROL_CONTRACT_KEY.kcv).not.toBe(await keyCheckValue(strongHexKeyBytes(CONTRACT_KEY), 'result'));
    // a weak (non-64-hex) key is usable by the Worker but gets no check value, so it cannot pass interoperability
    const weak = await buildProvenanceReport(fullEnv({ MISSION_CONTROL_CONTRACT_KEY: 'a-weak-but-16plus-char-string', MISSION_CONTROL_RESULT_KEY: 'another-weak-string-123' }));
    expect(weak.bindings.MISSION_CONTROL_CONTRACT_KEY.state).toBe('present');
    expect(weak.bindings.MISSION_CONTROL_CONTRACT_KEY.kcv).toBeUndefined();
    expect(weak.bindings.MISSION_CONTROL_RESULT_KEY.kcv).toBeUndefined();
    // missing keys never get one
    expect((await buildProvenanceReport(fullEnv({ MISSION_CONTROL_CONTRACT_KEY: '' }))).bindings.MISSION_CONTROL_CONTRACT_KEY.kcv).toBeUndefined();
    expect(JSON.stringify(report)).not.toContain(CONTRACT_KEY);
    expect(JSON.stringify(report)).not.toContain(RESULT_KEY);
  });

  it('reports the deployment URL from the stamp (distinguishes two deployments of one commit)', async () => {
    const report = await buildProvenanceReport(fullEnv());
    expect(report.release.url).toBe(PAGES_URL);
    for (const url of ['http://58d05431.goodflippindesign.pages.dev', 'https://58d05431.goodflippindesign.pages.dev.evil.example', 'https://evil.example/x', 'javascript:alert(1)', 42]) {
      const bad = await buildProvenanceReport(fullEnv({ ASSETS: assetsServing({ ...PAGES_STAMP, url }) }));
      expect(bad.release.state).toBe('stamped');
      expect(bad.release.url).toBeNull();
    }
  });

  it('a reachable D1 without the Mission Control schema is a readiness blocker', async () => {
    const empty = { prepare: () => ({ first: async () => ({ n: 0 }) }) };
    const report = await buildProvenanceReport(fullEnv({ DB: empty }));
    expect(report.d1).toEqual({ bound: true, reachable: true, workItemSchema: false });
    expect(report.ready).toBe(false);
    expect(report.blockers).toContain('D1 work-item schema missing');
  });

  it('reports Pages runtime identity and the host that answered', async () => {
    const report = await buildProvenanceReport(fullEnv(), { requestUrl: 'https://goodflippindesign.com/api/mission-control/provenance' });
    expect(report.runtime).toEqual({ kind: 'cloudflare-pages-advanced-worker', expectedProject: 'goodflippindesign', servedHost: 'goodflippindesign.com' });
    expect(report.schemaVersion).toBe('gfd-mc-runtime-provenance-1');
  });

  it.each(BINDINGS)('a missing %s is unavailable, and nothing leaks', async (name) => {
    stubClerk('admin');
    for (const missing of [undefined, '', '   ']) {
      const response = await probe({ auth: liveToken('user_x'), envOverrides: { [name]: missing } });
      const text = await response.text();
      const report = JSON.parse(text);
      expect(report.bindings[name].state).toBe('missing');
      expect(report.blockers).toContain(`${name} unavailable`);
      expect(report.ready).toBe(false);
      for (const secret of [CONTRACT_KEY, RESULT_KEY, WORKER_TOKEN]) expect(text).not.toContain(secret);
    }
  });

  it('flags unusable credential values as invalid without echoing them', async () => {
    const report = await buildProvenanceReport(fullEnv({
      MISSION_CONTROL_WORKER_TOKEN: 'short',
      MISSION_CONTROL_CONTRACT_KEY: 'tiny',
    }));
    expect(report.bindings.MISSION_CONTROL_WORKER_TOKEN.state).toBe('invalid');
    expect(report.bindings.MISSION_CONTROL_CONTRACT_KEY.state).toBe('invalid');
    expect(report.ready).toBe(false);
    const text = JSON.stringify(report);
    expect(text).not.toContain('short');
    expect(text).not.toContain('tiny');
  });

  it('the checked-in wrangler placeholders (empty strings) read as unavailable', async () => {
    const report = await buildProvenanceReport({
      ...Object.fromEntries(BINDINGS.map((name) => [name, ''])),
    });
    expect(report.ready).toBe(false);
    expect(report.release.state).toBe('unstamped');
    for (const name of BINDINGS) expect(report.bindings[name].state).toBe('missing');
  });
});
