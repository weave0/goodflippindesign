/**
 * Mission Control business-event worker — ingest auth, instrumentation honesty and feed shape.
 * Run: npm run test:workers
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { env } from 'cloudflare:test';
import worker, { buildFeed, EVENT_WINDOWS } from '../../workers/mission-control-events.js';

const BASE = 'https://events.example.com';
const TOKENS = { 'aiaimate.com': 'tok-aia', 'goodflippindesign.com': 'tok-gfd' };
const testEnv = () => ({ DB: env.DB, INGEST_TOKENS: JSON.stringify(TOKENS), FEED_TOKEN: 'feed-secret' });

function call(path, { method = 'GET', token, body } = {}) {
  return worker.fetch(
    new Request(BASE + path, {
      method,
      headers: { ...(token ? { authorization: 'Bearer ' + token } : {}), 'content-type': 'application/json' },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    }),
    testEnv()
  );
}

const postEvent = (propertyId, eventType, token = TOKENS[propertyId], eventId) => call('/v1/event', { method: 'POST', token, body: { propertyId, eventType, ...(eventId === undefined ? {} : { eventId }) } });
const heartbeat = (propertyId, eventTypes, token = TOKENS[propertyId]) => call('/v1/heartbeat', { method: 'POST', token, body: { propertyId, eventTypes } });
const feed = async () => (await call('/v1/feed', { token: 'feed-secret' })).json();

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare('DROP TABLE IF EXISTS mc_event_dedupe'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mc_event_producers (property_id TEXT NOT NULL, event_type TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, PRIMARY KEY (property_id, event_type))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mc_event_dedupe (property_id TEXT NOT NULL, event_type TEXT NOT NULL, event_id_hash TEXT NOT NULL, day TEXT NOT NULL, PRIMARY KEY (property_id, event_type, event_id_hash))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS mc_event_daily (property_id TEXT NOT NULL, event_type TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (property_id, event_type, day))'),
  ]);
});

beforeEach(async () => {
  await env.DB.batch([env.DB.prepare('DELETE FROM mc_event_producers'), env.DB.prepare('DELETE FROM mc_event_daily'), env.DB.prepare('DELETE FROM mc_event_dedupe')]);
});

describe('producer authentication', () => {
  it('rejects a missing, wrong, or other-property token without recording anything', async () => {
    expect((await postEvent('aiaimate.com', 'signup', '')).status).toBe(401);
    expect((await postEvent('aiaimate.com', 'signup', 'nope')).status).toBe(401);
    expect((await postEvent('aiaimate.com', 'signup', TOKENS['goodflippindesign.com'])).status).toBe(401);
    expect((await postEvent('unregistered.example', 'signup', 'tok-aia')).status).toBe(401);
    expect((await postEvent('__proto__', 'signup', 'x')).status).toBe(401);
    expect((await feed()).instrumentedProperties).toEqual([]);
  });

  it('rejects event types outside the common vocabulary', async () => {
    expect((await postEvent('aiaimate.com', 'revenue')).status).toBe(400);
  });

  it('rejects malformed and oversized bodies', async () => {
    expect((await call('/v1/event', { method: 'POST', token: 'tok-aia', body: '{not json' })).status).toBe(400);
    expect((await call('/v1/event', { method: 'POST', token: 'tok-aia', body: '[]' })).status).toBe(400);
    expect((await call('/v1/event', { method: 'POST', token: 'tok-aia', body: 'x'.repeat(5000) })).status).toBe(413);
    expect((await call('/v1/event', { method: 'POST', token: 'tok-aia', body: JSON.stringify('😀'.repeat(800)) })).status).toBe(413);
  });

  it('rejects unsupported payload fields after producer authentication', async () => {
    expect((await call('/v1/event', { method: 'POST', token: 'tok-aia', body: { propertyId: 'aiaimate.com', eventType: 'signup', email: 'reader@example.org' } })).status).toBe(400);
    expect((await call('/v1/heartbeat', { method: 'POST', token: 'tok-aia', body: { propertyId: 'aiaimate.com', eventTypes: ['signup'], note: 'private' } })).status).toBe(400);
    expect((await feed()).instrumentedProperties).toEqual([]);
  });

  it('requires the feed token', async () => {
    expect((await call('/v1/feed')).status).toBe(401);
    expect((await call('/v1/feed', { token: 'tok-aia' })).status).toBe(401);
  });

  it('fails closed when no producer tokens are configured', async () => {
    const res = await worker.fetch(new Request(BASE + '/v1/event', { method: 'POST', headers: { authorization: 'Bearer anything' }, body: JSON.stringify({ propertyId: 'aiaimate.com', eventType: 'signup' }) }), { DB: env.DB, FEED_TOKEN: 'feed-secret' });
    expect(res.status).toBe(401);
  });

  it('fails closed when a producer token is not a string', async () => {
    const res = await worker.fetch(new Request(BASE + '/v1/event', { method: 'POST', headers: { authorization: 'Bearer 12345' }, body: JSON.stringify({ propertyId: 'aiaimate.com', eventType: 'signup' }) }), { DB: env.DB, INGEST_TOKENS: JSON.stringify({ 'aiaimate.com': 12345 }), FEED_TOKEN: 'feed-secret' });
    expect(res.status).toBe(401);
  });
});

describe('instrumentation honesty', () => {
  it('lists nothing before any producer has announced', async () => {
    const doc = await feed();
    expect(doc.instrumentedProperties).toEqual([]);
    expect(doc.records).toEqual([]);
  });

  it('a heartbeat makes a property instrumented with measured zeros for exactly the announced types', async () => {
    expect((await heartbeat('aiaimate.com', ['signup'])).status).toBe(200);
    const doc = await feed();
    expect(doc.instrumentedProperties).toEqual(['aiaimate.com']);
    expect(doc.records.map(r => [r.eventType, r.window.days, r.count])).toEqual(EVENT_WINDOWS.map(days => ['signup', days, 0]));
    // purchase was never announced, so it is absent (Mission Control renders it unavailable, not zero)
    expect(doc.records.some(r => r.eventType === 'purchase')).toBe(false);
  });

  it('a first event announces its own type and counts today only after the window closes', async () => {
    expect((await postEvent('goodflippindesign.com', 'lead')).status).toBe(202);
    const doc = await feed();
    expect(doc.instrumentedProperties).toEqual(['goodflippindesign.com']);
    // today's partial day is outside every window
    expect(doc.records.every(r => r.count === 0)).toBe(true);
  });

  it('rejects an invalid heartbeat', async () => {
    expect((await heartbeat('aiaimate.com', [])).status).toBe(400);
    expect((await heartbeat('aiaimate.com', ['bogus'])).status).toBe(400);
  });
});

describe('buildFeed', () => {
  const now = Date.parse('2026-09-24T22:48:00Z');
  const producers = [{ property_id: 'aiaimate.com', event_type: 'signup' }];

  it('emits whole-UTC-day windows whose bounds match their day counts', () => {
    const doc = buildFeed({ producers, daily: [], now });
    for (const record of doc.records) {
      expect(record.window.end).toBe('2026-09-24T00:00:00.000Z');
      expect((Date.parse(record.window.end) - Date.parse(record.window.start)) / 86400000).toBe(record.window.days);
    }
    expect(doc.fixture).toBe(false);
    expect(doc.contractName).toBe('globaldeets-business-events-feed');
  });

  it('counts completed days inside each window and excludes today and older days', () => {
    const daily = [
      { property_id: 'aiaimate.com', event_type: 'signup', day: '2026-09-24', count: 50 }, // today: excluded
      { property_id: 'aiaimate.com', event_type: 'signup', day: '2026-09-23', count: 2 },
      { property_id: 'aiaimate.com', event_type: 'signup', day: '2026-09-17', count: 3 }, // 7 days back: inside 7d
      { property_id: 'aiaimate.com', event_type: 'signup', day: '2026-09-16', count: 4 }, // 8 days back: 28d only
      { property_id: 'aiaimate.com', event_type: 'signup', day: '2026-06-26', count: 7 }, // 90 days back: inside 90d
      { property_id: 'aiaimate.com', event_type: 'signup', day: '2026-06-25', count: 100 }, // 91 days back: outside
      { property_id: 'goodflippindesign.com', event_type: 'signup', day: '2026-09-23', count: 9 }, // other property
    ];
    const doc = buildFeed({ producers, daily, now });
    const byDays = Object.fromEntries(doc.records.map(r => [r.window.days, r.count]));
    expect(byDays).toEqual({ 7: 5, 28: 9, 90: 16 });
  });
});

describe('end to end with the D1 counters', () => {
  it('accumulates repeated events per day', async () => {
    await heartbeat('aiaimate.com', ['signup']);
    await postEvent('aiaimate.com', 'signup');
    await postEvent('aiaimate.com', 'signup');
    const row = await env.DB.prepare('SELECT count FROM mc_event_daily WHERE property_id = ? AND event_type = ?').bind('aiaimate.com', 'signup').first();
    expect(row.count).toBe(2);
  });

  const dailyCount = async (propertyId, eventType) =>
    (await env.DB.prepare('SELECT COALESCE(SUM(count), 0) AS n FROM mc_event_daily WHERE property_id = ? AND event_type = ?').bind(propertyId, eventType).first()).n;

  it('counts an event with an eventId once, however many times it is delivered', async () => {
    for (let i = 0; i < 3; i++) expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'cs_live_123')).status).toBe(202);
    expect(await dailyCount('aiaimate.com', 'purchase')).toBe(1);
    await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'cs_live_456');
    expect(await dailyCount('aiaimate.com', 'purchase')).toBe(2);
  });

  it('scopes eventIds to the property and event type is recorded as instrumented', async () => {
    await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'cs_live_shared1');
    await postEvent('aiaimate.com', 'lead', 'tok-aia', 'cs_live_shared1');
    await postEvent('goodflippindesign.com', 'purchase', 'tok-gfd', 'cs_live_shared1');
    expect(await dailyCount('aiaimate.com', 'purchase')).toBe(1);
    expect(await dailyCount('aiaimate.com', 'lead')).toBe(1);
    expect(await dailyCount('goodflippindesign.com', 'purchase')).toBe(1);
    expect((await feed()).instrumentedProperties).toEqual(['aiaimate.com', 'goodflippindesign.com']);
  });

  it('does not count when the eventId is invalid', async () => {
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', '')).status).toBe(400);
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', null)).status).toBe(400);
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'brett@example.com')).status).toBe(400);
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', '555-123-4567')).status).toBe(400);
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'id_brett_weaver')).status).toBe(400);
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'id_5551234567')).status).toBe(400);
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'https://example.com/id/1')).status).toBe(400);
    expect((await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'x'.repeat(200))).status).toBe(400);
    expect(await dailyCount('aiaimate.com', 'purchase')).toBe(0);
  });

  it('stores only a digest of the eventId and prunes keys outside the replay horizon', async () => {
    await env.DB.prepare("INSERT INTO mc_event_dedupe (property_id, event_type, event_id_hash, day) VALUES ('aiaimate.com', 'purchase', 'old-digest', '2020-01-01')").run();
    await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'cs_live_123');
    await postEvent('aiaimate.com', 'purchase', 'tok-aia', 'cs_live_123');
    const { results } = await env.DB.prepare('SELECT event_id_hash FROM mc_event_dedupe ORDER BY day, event_id_hash').all();
    expect(results).toHaveLength(1);
    expect(results.map(r => r.event_id_hash)).not.toContain('old-digest');
    expect(results.some(r => r.event_id_hash === 'cs_live_123')).toBe(false);
    expect(await dailyCount('aiaimate.com', 'purchase')).toBe(1);
  });

  it('stores only counters — the schema has no personal columns', async () => {
    const { results } = await env.DB.prepare("SELECT name FROM pragma_table_info('mc_event_daily')").all();
    expect(results.map(r => r.name).sort()).toEqual(['count', 'day', 'event_type', 'property_id']);
    const dedupe = await env.DB.prepare("SELECT name FROM pragma_table_info('mc_event_dedupe')").all();
    expect(dedupe.results.map(r => r.name).sort()).toEqual(['day', 'event_id_hash', 'event_type', 'property_id']);
  });
});
