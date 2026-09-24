-- Mission Control business-event counters (worker: gfd-mission-control-events).
-- Count-only by design: no user, email, IP, session or payload columns exist, so nothing personal can be stored.
--
-- Apply:
--   wrangler d1 execute gfd_community --remote --file=db/d1-schema-mission-control-events.sql

-- One row per (property, outcome type) that a producer has announced it can observe.
-- Presence here is what makes a reported zero a *measured* zero in Mission Control.
CREATE TABLE IF NOT EXISTS mc_event_producers (
  property_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  first_seen  TEXT NOT NULL,
  last_seen   TEXT NOT NULL,
  PRIMARY KEY (property_id, event_type)
);

-- Per-UTC-day counters.
CREATE TABLE IF NOT EXISTS mc_event_daily (
  property_id TEXT NOT NULL,
  event_type  TEXT NOT NULL,
  day         TEXT NOT NULL,          -- YYYY-MM-DD (UTC)
  count       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (property_id, event_type, day)
);

CREATE INDEX IF NOT EXISTS idx_mc_event_daily_day ON mc_event_daily (day);

-- Idempotency keys (e.g. Stripe event ids) so a retried or replayed delivery is counted once.
-- Keys carry no personal data and are pruned after 7 days.
CREATE TABLE IF NOT EXISTS mc_event_dedupe (
  property_id TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  day         TEXT NOT NULL,          -- YYYY-MM-DD (UTC) first seen
  PRIMARY KEY (property_id, event_id)
);
