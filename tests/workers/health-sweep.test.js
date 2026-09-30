import { afterEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';

import {
  buildHealthIncidentBody,
  buildHealthIncidentTitle,
  checkTarget,
  healthFindingKey,
  parseHealthIncidentMarker,
  reportToGitHub,
} from '../../workers/health-sweep.js';
import { createD1WorkItemStore, ensureWorkItemSchema } from '../../workers/mission-control-work-items.js';

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

  it('uses the native Stripe Worker service binding for internal health', async () => {
    const stripeTarget = {
      id: 'gfd-stripe-worker',
      brand: 'gfd',
      name: 'GFD Stripe Worker',
      url: 'https://gfd-stripe.weave0.workers.dev/health',
      cloudflareSweepUrl: 'https://gfd-stripe.internal/health',
      cloudflareServiceBinding: 'STRIPE_WORKER',
      expectedKeyword: 'gfd-stripe-payments',
    };
    const serviceFetch = vi.fn(async () => new Response(
      JSON.stringify({ ok: true, service: 'gfd-stripe-payments' }),
      { status: 200 }
    ));
    const publicFetch = vi.fn(() => {
      throw new Error('public fetch must not be used for a service-bound probe');
    });
    vi.stubGlobal('fetch', publicFetch);

    const result = await checkTarget(stripeTarget, {
      STRIPE_WORKER: { fetch: serviceFetch },
    });

    expect(serviceFetch).toHaveBeenCalledTimes(1);
    expect(serviceFetch.mock.calls[0][0]).toBe('https://gfd-stripe.internal/health');
    expect(publicFetch).not.toHaveBeenCalled();
    expect(result.status_code).toBe(200);
    expect(result.keyword_found).toBe(1);
    expect(result.overall_status).toBe('pass');
  });

  it('fails closed when a configured Worker service binding is absent', async () => {
    const stripeTarget = {
      id: 'gfd-stripe-worker',
      brand: 'gfd',
      name: 'GFD Stripe Worker',
      url: 'https://gfd-stripe.weave0.workers.dev/health',
      cloudflareSweepUrl: 'https://gfd-stripe.internal/health',
      cloudflareServiceBinding: 'STRIPE_WORKER',
      expectedKeyword: 'gfd-stripe-payments',
    };

    const result = await checkTarget(stripeTarget, {});

    expect(result.overall_status).toBe('fail');
    expect(result.finding_kind).toBe('network_failure');
    expect(result.error).toContain('Missing Cloudflare service binding');
  });

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

  it('writes the repeated GitHub observation onto one durable work item', async () => {
    await ensureWorkItemSchema(env.DB);
    const findingKey = 'health:aiaimate:machine_contract_mismatch';
    await env.DB.prepare('DELETE FROM mc_work_item_events WHERE work_item_id IN (SELECT work_item_id FROM mc_work_items WHERE finding_key = ?)').bind(findingKey).run();
    await env.DB.prepare('DELETE FROM mc_work_item_leases WHERE work_item_id IN (SELECT work_item_id FROM mc_work_items WHERE finding_key = ?)').bind(findingKey).run();
    await env.DB.prepare('DELETE FROM mc_work_items WHERE finding_key = ?').bind(findingKey).run();

    const created = buildHealthIncidentBody(degraded, {
      findingKey,
      firstSeen: '2026-09-28T06:00:00.000Z',
      lastSeen: '2026-09-28T06:00:00.000Z',
      occurrences: 1,
      lifecycle: 'detected',
    });
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ number: 353 }), { status: 201 })));
    await reportToGitHub([degraded], '2026-09-28T06:00:00.000Z', { GITHUB_TOKEN: 'test-token', DB: env.DB });

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { number: 353, body: created, title: 'old' },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ number: 353 }), { status: 200 })));
    await reportToGitHub([degraded], '2026-09-29T07:24:48.137Z', { GITHUB_TOKEN: 'test-token', DB: env.DB });

    const items = (await createD1WorkItemStore(env.DB).list())
      .filter((item) => item.findingKey === findingKey);
    expect(items).toHaveLength(1);
    expect(items[0].state).toBe('OBSERVED');
    expect(items[0].propertyId).toBe('aiaimate.com');
    expect(items[0].workItemId.startsWith('gfdwi_v1_')).toBe(true);
    expect(items[0].occurrenceCount).toBe(2);
    expect(items[0].firstSeen).toBe('2026-09-28T06:00:00.000Z');
    expect(items[0].lastSeen).toBe('2026-09-29T07:24:48.137Z');
    expect(items[0].repository).toBeNull();
    expect(items[0].availableBinding.repository).toBe('weave0/aiaimate');
    // AIAIMate is the one dispatch-ready specimen: its registry declarations close every gap, but the
    // observation itself must never self-qualify (repository stays null until an operator qualifies).
    expect(items[0].qualificationGaps).toEqual([]);
    expect(items[0].availableBinding).toMatchObject({
      investigationProfile: 'web-health-readonly-v1',
      verificationProfile: 'gfd-property-health-production',
      verificationScope: 'production',
    });
    expect(items[0].availableBinding.verificationPredicate).toMatch(/same configured health probe/);
  });
});
