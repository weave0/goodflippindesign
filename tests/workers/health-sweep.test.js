import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildHealthIncidentBody,
  buildHealthIncidentTitle,
  checkTarget,
  healthFindingKey,
  parseHealthIncidentMarker,
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
