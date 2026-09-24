/**
 * gfd-mission-control-events
 * Cloudflare Worker — governed business-event feed for Mission Control (GD-031).
 *
 * Property producers (a newsletter route, an inquiry form, a payment webhook) POST a count-only event here when a
 * business outcome actually completes. Mission Control's collector reads the aggregate as a
 * `globaldeets-business-events-feed` 1.0 document. Nothing personal is ever accepted or stored: an event is
 * {propertyId, eventType} and is kept only as a per-day counter.
 *
 * Routes
 *   POST /v1/event      Bearer <property token>  {propertyId, eventType, eventId?}        -> 202
 *                       eventId is hashed before storage and makes the count idempotent.
 *   POST /v1/heartbeat  Bearer <property token>  {propertyId, eventTypes:[...]}          -> 200
 *   GET  /v1/feed       Bearer <feed token>                                              -> feed document
 *   GET  /health                                                                         -> 200
 *
 * Instrumentation honesty (the contract Mission Control enforces):
 *   - A property/eventType is "instrumented" only after its producer announced it (heartbeat, or a first event).
 *     Only instrumented pairs are listed, so a reported 0 is a measured zero and never an unknown.
 *   - A producer must announce only outcomes it can genuinely observe complete (e.g. a payment webhook, not a
 *     checkout-session creation). Un-announced types stay "unavailable" in Mission Control.
 *   - Windows are whole UTC days ending at 00:00Z today, so a window never contains a partial day.
 *
 * Secrets (wrangler secret put …, see wrangler-mission-control-events.toml):
 *   INGEST_TOKENS  JSON object {"<propertyId>":"<token>", …} — one bearer token per producing property
 *   FEED_TOKEN     bearer token given to Mission Control as MISSION_CONTROL_EVENTS_TOKEN
 */

export const FEED_CONTRACT_NAME = 'globaldeets-business-events-feed';
export const FEED_SCHEMA_VERSION = '1.0.0';
export const EVENT_WINDOWS = Object.freeze([7, 28, 90]);
/** Mirrors OUTCOME_VOCABULARY in Mission Control (observatory/mission-control/evidence-semantics.js). */
export const EVENT_TYPES = Object.freeze(['visit', 'engagement', 'cta', 'lead', 'signup', 'application', 'purchase', 'download', 'primary-outcome']);

const DAY_MS = 86400000;
const MAX_BODY_BYTES = 2048;
const MAX_EVENT_ID_CHARS = 128;
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function utcMidnight(ms) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function utcDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function digestEventId(propertyId, eventId) {
  const encoder = new TextEncoder();
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(`${propertyId}\0${eventId}`)));
}

/** Constant-time string comparison (both sides hashed so lengths never leak). */
async function tokensMatch(presented, expected) {
  if (!presented || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(presented)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}

function bearer(request) {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : '';
}

function parseIngestTokens(env) {
  try {
    const parsed = JSON.parse(env.INGEST_TOKENS || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function readJsonBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'Body too large.', status: 413 };
  try {
    const body = JSON.parse(text);
    return body && typeof body === 'object' && !Array.isArray(body) ? { body } : { error: 'Body must be a JSON object.', status: 400 };
  } catch {
    return { error: 'Body must be valid JSON.', status: 400 };
  }
}

/** Authenticates a producer for the property named in its body; returns an error Response or null. */
async function authenticateProducer(request, env, propertyId) {
  const tokens = parseIngestTokens(env);
  const expected = typeof propertyId === 'string' && Object.hasOwn(tokens, propertyId) ? tokens[propertyId] : '';
  // An unknown property and a wrong token are indistinguishable to the caller.
  if (!(await tokensMatch(bearer(request), expected))) return json({ error: 'Unauthorized.' }, 401);
  return null;
}

function producerUpsert(env, propertyId, eventType, nowIso) {
  return env.DB.prepare(
    `INSERT INTO mc_event_producers (property_id, event_type, first_seen, last_seen) VALUES (?1, ?2, ?3, ?3)
     ON CONFLICT(property_id, event_type) DO UPDATE SET last_seen = excluded.last_seen`
  ).bind(propertyId, eventType, nowIso);
}

async function handleEvent(request, env, now) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return json({ error: parsed.error }, parsed.status);
  const { propertyId, eventType, eventId } = parsed.body;
  const denied = await authenticateProducer(request, env, propertyId);
  if (denied) return denied;
  if (!EVENT_TYPES.includes(eventType)) return json({ error: 'eventType is outside the common vocabulary.' }, 400);
  if (eventId !== undefined && (typeof eventId !== 'string' || eventId.length === 0 || eventId.length > MAX_EVENT_ID_CHARS)) return json({ error: 'eventId must be a short string.' }, 400);
  const nowIso = new Date(now).toISOString();
  const day = utcDay(now);
  const counter = env.DB.prepare(
    `INSERT INTO mc_event_daily (property_id, event_type, day, count) VALUES (?1, ?2, ?3, 1)
     ON CONFLICT(property_id, event_type, day) DO UPDATE SET count = count + 1`
  ).bind(propertyId, eventType, day);
  if (eventId === undefined) {
    await env.DB.batch([producerUpsert(env, propertyId, eventType, nowIso), counter]);
    return json({ accepted: true }, 202);
  }
  const eventIdHash = await digestEventId(propertyId, eventId);
  // Idempotent path: the counter runs only if this property-scoped eventId digest was not seen before. `changes()`
  // reads the dedupe insert, so the counter statement must directly follow it.
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO mc_event_dedupe (property_id, event_id_hash, day) VALUES (?1, ?2, ?3)').bind(propertyId, eventIdHash, day),
    env.DB.prepare(
      `INSERT INTO mc_event_daily (property_id, event_type, day, count) SELECT ?1, ?2, ?3, 1 WHERE changes() > 0
       ON CONFLICT(property_id, event_type, day) DO UPDATE SET count = count + 1`
    ).bind(propertyId, eventType, day),
    producerUpsert(env, propertyId, eventType, nowIso),
  ]);
  return json({ accepted: true }, 202);
}

async function handleHeartbeat(request, env, now) {
  const parsed = await readJsonBody(request);
  if (parsed.error) return json({ error: parsed.error }, parsed.status);
  const { propertyId, eventTypes } = parsed.body;
  const denied = await authenticateProducer(request, env, propertyId);
  if (denied) return denied;
  if (!Array.isArray(eventTypes) || eventTypes.length === 0 || eventTypes.length > EVENT_TYPES.length || !eventTypes.every(type => EVENT_TYPES.includes(type))) {
    return json({ error: 'eventTypes must be a non-empty list from the common vocabulary.' }, 400);
  }
  const unique = [...new Set(eventTypes)];
  const nowIso = new Date(now).toISOString();
  await env.DB.batch(unique.map(eventType => producerUpsert(env, propertyId, eventType, nowIso)));
  return json({ announced: unique }, 200);
}

/**
 * Builds the feed document from announced producers and daily counters.
 * Exported for tests. `producers` = [{property_id,event_type}], `daily` = [{property_id,event_type,day,count}].
 */
export function buildFeed({ producers, daily, now }) {
  const end = utcMidnight(now);
  const instrumentedProperties = [...new Set(producers.map(row => row.property_id))].sort();
  const records = [];
  for (const producer of [...producers].sort((a, b) => (a.property_id + a.event_type).localeCompare(b.property_id + b.event_type))) {
    for (const days of EVENT_WINDOWS) {
      const startDay = utcDay(end - days * DAY_MS);
      const endDay = utcDay(end);
      const count = daily
        .filter(row => row.property_id === producer.property_id && row.event_type === producer.event_type && row.day >= startDay && row.day < endDay)
        .reduce((sum, row) => sum + row.count, 0);
      records.push({
        propertyId: producer.property_id,
        eventType: producer.event_type,
        window: { start: new Date(end - days * DAY_MS).toISOString(), end: new Date(end).toISOString(), days },
        count,
      });
    }
  }
  return {
    contractName: FEED_CONTRACT_NAME,
    schemaVersion: FEED_SCHEMA_VERSION,
    fixture: false,
    generatedAt: new Date(now).toISOString(),
    source: { id: 'gfd-mission-control-events', label: 'GFV first-party business-event counters' },
    instrumentedProperties,
    records,
  };
}

async function handleFeed(request, env, now) {
  if (!(await tokensMatch(bearer(request), env.FEED_TOKEN))) return json({ error: 'Unauthorized.' }, 401);
  const end = utcMidnight(now);
  const oldest = utcDay(end - Math.max(...EVENT_WINDOWS) * DAY_MS);
  const [producers, daily] = await Promise.all([
    env.DB.prepare('SELECT property_id, event_type FROM mc_event_producers').all(),
    env.DB.prepare('SELECT property_id, event_type, day, count FROM mc_event_daily WHERE day >= ?1').bind(oldest).all(),
  ]);
  return json(buildFeed({ producers: producers.results || [], daily: daily.results || [], now }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const now = Date.now();
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, service: 'gfd-mission-control-events' });
    if (!env.DB) return json({ error: 'Storage is not configured.' }, 503);
    if (url.pathname === '/v1/feed' && request.method === 'GET') return handleFeed(request, env, now);
    if (url.pathname === '/v1/event' && request.method === 'POST') return handleEvent(request, env, now);
    if (url.pathname === '/v1/heartbeat' && request.method === 'POST') return handleHeartbeat(request, env, now);
    return json({ error: 'Not found.' }, 404);
  },
};
