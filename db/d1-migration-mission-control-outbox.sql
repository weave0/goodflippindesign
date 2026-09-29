-- Additive outbox columns for mc_effects databases created before gfd-effect-1.
-- Safe to re-run only statement-by-statement: SQLite rejects a duplicate ADD COLUMN.
-- The worker applies the same adds from PRAGMA table_info, so this file is the
-- operator copy of that migration. Existing rows keep null contract fields and
-- are not rewritten. Historical mc_work_item_events are not modified.
--
-- Apply:
--   wrangler d1 execute gfd_community --remote --file=db/d1-migration-mission-control-outbox.sql

ALTER TABLE mc_effects ADD COLUMN schema_version TEXT;
ALTER TABLE mc_effects ADD COLUMN requested_lifecycle_version INTEGER;
ALTER TABLE mc_effects ADD COLUMN payload_digest TEXT;
ALTER TABLE mc_effects ADD COLUMN payload_json TEXT;
ALTER TABLE mc_effects ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE mc_effects ADD COLUMN last_attempt_at TEXT;
ALTER TABLE mc_effects ADD COLUMN idempotency_key TEXT;
ALTER TABLE mc_effects ADD COLUMN causal_event_id TEXT;
ALTER TABLE mc_effects ADD COLUMN receipt_ref TEXT;
ALTER TABLE mc_effects ADD COLUMN terminal_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_mc_effects_dispatch
  ON mc_effects (status, last_attempt_at);
