import { describe, expect, it, vi } from 'vitest';
import { handleMissionControlRequest, loadMissionControlEvidence, EVIDENCE_FILES } from '../../workers/mission-control-api.js';

function request(method = 'GET') {
  return new Request('https://goodflippindesign.com/api/mission-control', { method });
}

const admin = { publicMetadata: { role: 'admin' } };
const member = { publicMetadata: { role: 'member' } };

function upstreamFetch(overrides = {}) {
  return vi.fn(async (url) => {
    const path = Object.values(EVIDENCE_FILES).find((value) => url.includes(value));
    if (!path) return new Response('not found', { status: 404 });
    const key = Object.entries(EVIDENCE_FILES).find(([, value]) => value === path)[0];
    return new Response(JSON.stringify({
      kind: key,
      ...(key === 'estateHealth' ? { generatedAt: '2026-09-27T20:00:00.000Z', properties: [] } : {}),
      ...overrides[key],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
}

describe('Mission Control evidence broker', () => {
  it('fails closed when the upstream credential is absent', async () => {
    const res = await handleMissionControlRequest(request(), {}, admin, upstreamFetch());
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('rejects authenticated non-admin callers', async () => {
    const fetchImpl = upstreamFetch();
    const res = await handleMissionControlRequest(request(), { MISSION_CONTROL_GITHUB_TOKEN: 'secret' }, member, fetchImpl);
    expect(res.status).toBe(403);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns all governed evidence to an admin and never returns the upstream token', async () => {
    const fetchImpl = upstreamFetch();
    const payload = await loadMissionControlEvidence({ MISSION_CONTROL_GITHUB_TOKEN: 'super-secret' }, fetchImpl);
    expect(Object.keys(payload.evidence).sort()).toEqual(Object.keys(EVIDENCE_FILES).sort());
    expect(JSON.stringify(payload)).not.toContain('super-secret');

    const res = await handleMissionControlRequest(request(), { MISSION_CONTROL_GITHUB_TOKEN: 'super-secret' }, admin, fetchImpl);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(JSON.stringify(await res.json())).not.toContain('super-secret');
  });

  it('fails closed on an upstream error rather than inventing stale data', async () => {
    const fetchImpl = vi.fn(async () => new Response('boom', { status: 500 }));
    const res = await handleMissionControlRequest(request(), { MISSION_CONTROL_GITHUB_TOKEN: 'secret' }, admin, fetchImpl);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.evidence).toBeUndefined();
  });

  it('rejects non-GET methods', async () => {
    const res = await handleMissionControlRequest(request('POST'), { MISSION_CONTROL_GITHUB_TOKEN: 'secret' }, admin, upstreamFetch());
    expect(res.status).toBe(405);
  });
});
