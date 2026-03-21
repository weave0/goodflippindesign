-- ──────────────────────────────────────────────────────────────────────────────
-- D1 Schema: Studio HQ — persistent key-value config store
--
-- Stores cross-device state for Studio HQ panel:
--   key='kanban'         → JSON array of build pipeline workitems
--   key='weekly_digest'  → JSON summary written by cron agent on Mondays
--   key='cron_last_run'  → ISO timestamp of last cron health sweep
--
-- Apply:
--   wrangler d1 execute gfd_community --remote --file=d1-schema-studio.sql
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS studio_config (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
