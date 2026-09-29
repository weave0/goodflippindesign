import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildHealthIncidentBody,
  buildHealthIncidentTitle,
  checkTarget,
  healthFindingKey,
  parseHealthIncidentMarker,
  reportToGitHub,
} from '../../workers/health-sweep.js';

const target = {
  id: 'aiaimate',
  brand: 'aiaimate',
  name: 'AI Aimate',
  url: 'https://aiaimate.com',
  sweepUrl: 'https://aiaimate.com/api/health',
  checkType: 'page',
  expectedKeyword: 'gfd-property-health',
  machineContract: {
    contract: 'gfd-property-health',
    contractVersion: 1,
    propertyId: 'aiaimate.com',
    productId: 'aiaimate',
    status: 'ok',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('machine health contracts', () => {

  it('prefers the Worker-specific origin vantage without changing the public target identity', async () => {
    const gfdTarget = {
      id: 'goodflippindesign',
      brand: 'gfd',
      name: 'Good Flippin Design',
      url: 'https://goodflippindesign.com',
      cloudflareSweepUrl: 'https://goodflippindesign.pages.dev',
      expectedKeyword: 'Good Flippin Design',
    };
    const fetchMock = vi.fn(async () => new Response('<title>Good Flippin Design</title>', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await checkTarget(gfdTarget);

    expect(fetchMock.mock.calls[0][0]).toBe('https://goodflippindesign.pages.dev');
    expect(result.overall_status).toBe('pass');
    expect(result.keyword_found).toBe(1);
  });

  it('uses the browser-compatible estate probe identity required by Cloudflare Bot Fight Mode', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      contract: 'gfd-property-health',
      contractVersion: 1,
      propertyId: 'aiaimate.com',
      productId: 'aiaimate',
      status: 'ok',
    }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await checkTarget(target);

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers['User-Agent']).toContain('Mozilla/5.0');
    expect(init.headers['User-Agent']).toContain('GFDHealthCheck/1.0');
    expect(init.headers.Accept).toContain('text/html');
  });
  it('passes when the structured contract matches even though homepage branding is irrelevant', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      contract: 'gfd-property-health',
      contractVersion: 1,
      propertyId: 'aiaimate.com',
      productId: 'aiaimate',
      status: 'ok',
      deployment: { provider: 'vercel', revision: 'abc123' },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })));

    const result = await checkTarget(target);

    expect(result.overall_status).toBe('pass');
    expect(result.keyword_found).toBe(1);
    expect(result.finding_kind).toBeNull();
    expect(result.content_keyword).toBe('machine:gfd-property-health');
  });

  it('creates a typed mismatch when a required machine field drifts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      contract: 'gfd-property-health',
      contractVersion: 1,
      propertyId: 'wrong.example',
      productId: 'aiaimate',
      status: 'ok',
    }), { status: 200 })));

    const result = await checkTarget(target);

    expect(result.overall_status).toBe('warn');
    expect(result.finding_kind).toBe('machine_contract_mismatch');
    expect(result.content_detail).toContain('propertyId');
  });
});

describe('durable health incident identity', () => {

  it('keeps distinct failure classes separate for the same property', () => {
    const base = { target };
    expect(healthFindingKey({ ...base, finding_kind: 'timeout' }))
      .toBe('health:aiaimate:timeout');
    expect(healthFindingKey({ ...base, finding_kind: 'machine_contract_mismatch' }))
      .toBe('health:aiaimate:machine_contract_mismatch');
  });
  it('round-trips the stable finding key and occurrence state', () => {
    const check = {
      target,
      overall_status: 'warn',
      finding_kind: 'machine_contract_mismatch',
      status_code: 200,
      response_time_ms: 180,
      keyword_found: 0,
      content_keyword: 'machine:gfd-property-health',
      content_detail: 'propertyId expected "aiaimate.com", got "wrong.example"',
      error: null,
    };

    const findingKey = healthFindingKey(check);
    expect(findingKey).toBe('health:aiaimate:machine_contract_mismatch');
    expect(buildHealthIncidentTitle(check)).toContain('machine_contract_mismatch');

    const body = buildHealthIncidentBody(check, {
      findingKey,
      firstSeen: '2026-09-29T01:00:00.000Z',
      lastSeen: '2026-09-29T02:00:00.000Z',
      occurrences: 4,
      lifecycle: 'detected',
    });

    expect(parseHealthIncidentMarker(body)).toEqual({
      findingKey,
      targetId: 'aiaimate',
      findingKind: 'machine_contract_mismatch',
      firstSeen: '2026-09-29T01:00:00.000Z',
      lastSeen: '2026-09-29T02:00:00.000Z',
      occurrences: 4,
      lifecycle: 'detected',
    });
  });
});


describe('GitHub incident convergence', () => {
  const degraded = {
    target,
    overall_status: 'warn',
    finding_kind: 'machine_contract_mismatch',
    status_code: 200,
    response_time_ms: 180,
    keyword_found: 0,
    content_keyword: 'machine:gfd-property-health',
    content_detail: 'propertyId expected "aiaimate.com", got "wrong.example"',
    error: null,
  };

  it('updates the same managed issue on repeat observation instead of creating another', async () => {
    const existingBody = buildHealthIncidentBody(degraded, {
      findingKey: 'health:aiaimate:machine_contract_mismatch',
      firstSeen: '2026-09-28T06:00:00.000Z',
      lastSeen: '2026-09-28T06:00:00.000Z',
      occurrences: 3,
      lifecycle: 'detected',
    });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { number: 338, body: existingBody, title: 'old title' },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ number: 338 }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await reportToGitHub([degraded], '2026-09-29T06:00:00.000Z', { GITHUB_TOKEN: 'test-token' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const updateCall = fetchMock.mock.calls[1];
    expect(updateCall[0]).toContain('/issues/338');
    expect(updateCall[1].method).toBe('PATCH');
    const patch = JSON.parse(updateCall[1].body);
    expect(patch.title).toContain('machine_contract_mismatch');
    const marker = parseHealthIncidentMarker(patch.body);
    expect(marker.occurrences).toBe(4);
    expect(marker.firstSeen).toBe('2026-09-28T06:00:00.000Z');
    expect(marker.lastSeen).toBe('2026-09-29T06:00:00.000Z');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('closes a managed incident when a fresh probe is healthy', async () => {
    const existingBody = buildHealthIncidentBody(degraded, {
      findingKey: 'health:aiaimate:machine_contract_mismatch',
      firstSeen: '2026-09-28T06:00:00.000Z',
      lastSeen: '2026-09-28T06:00:00.000Z',
      occurrences: 3,
      lifecycle: 'detected',
    });
    const healthy = {
      ...degraded,
      overall_status: 'pass',
      finding_kind: null,
      keyword_found: 1,
      content_detail: null,
    };

    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { number: 338, body: existingBody, title: 'old title' },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ number: 338 }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await reportToGitHub([healthy], '2026-09-29T06:00:00.000Z', { GITHUB_TOKEN: 'test-token' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const closeCall = fetchMock.mock.calls[1];
    expect(closeCall[0]).toContain('/issues/338');
    expect(closeCall[1].method).toBe('PATCH');
    const patch = JSON.parse(closeCall[1].body);
    expect(patch.state).toBe('closed');
    expect(patch.state_reason).toBe('completed');
    expect(patch.body).toContain('lifecycle: resolved');
    expect(patch.body).toContain('resolved-at: 2026-09-29T06:00:00.000Z');
  });
});
