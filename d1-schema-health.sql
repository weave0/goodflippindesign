-- ──────────────────────────────────────────────────────────────────────────────
-- D1 Schema: Ecosystem Health Checks
-- Stores one row per URL per sweep run.
--
-- Apply:
--   wrangler d1 execute gfd_community --remote --file=d1-schema-health.sql
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS health_checks (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  checked_at        TEXT    NOT NULL,                  -- ISO timestamp of the sweep run
  brand             TEXT    NOT NULL,                  -- gfd, gfv, aiaimate, etc.
  name              TEXT    NOT NULL,                  -- human-readable target name
  url               TEXT    NOT NULL,                  -- full URL that was checked
  check_type        TEXT    NOT NULL DEFAULT 'page',   -- page | service | worker
  status_code       INTEGER,                           -- HTTP status (NULL = network/timeout error)
  response_time_ms  INTEGER,                           -- ms to first byte
  is_https          INTEGER DEFAULT 1,                 -- 1 if target URL scheme is https
  redirect_to_https INTEGER DEFAULT 0,                 -- 1 if final redirected URL is https
  final_url         TEXT,                              -- URL after all redirects (NULL on error)
  redirect_count    INTEGER DEFAULT 0,                 -- number of redirects followed
  content_type      TEXT,                              -- Content-Type header value
  has_csp           INTEGER DEFAULT 0,                 -- Content-Security-Policy header present
  has_x_frame       INTEGER DEFAULT 0,                 -- X-Frame-Options header present
  has_hsts          INTEGER DEFAULT 0,                 -- Strict-Transport-Security header present
  has_xcto          INTEGER DEFAULT 0,                 -- X-Content-Type-Options header present
  content_keyword   TEXT,                              -- expected keyword searched for (NULL if none)
  keyword_found     INTEGER,                           -- 1 found, 0 not found, NULL if no keyword configured
  error             TEXT,                              -- error message (NULL on success)
  overall_status    TEXT    NOT NULL DEFAULT 'pass',   -- pass | warn | fail
  created_at        TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_health_checked_at  ON health_checks(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_health_brand       ON health_checks(brand);
CREATE INDEX IF NOT EXISTS idx_health_status      ON health_checks(overall_status);
CREATE INDEX IF NOT EXISTS idx_health_url         ON health_checks(url);
CREATE INDEX IF NOT EXISTS idx_health_check_type  ON health_checks(check_type);

-- Migration for existing tables: add new columns (safe to re-run — IF NOT EXISTS not supported for ALTER TABLE,
-- but these will no-op with "duplicate column" errors that can be ignored)
-- ALTER TABLE health_checks ADD COLUMN check_type TEXT NOT NULL DEFAULT 'page';
-- ALTER TABLE health_checks ADD COLUMN final_url TEXT;
-- ALTER TABLE health_checks ADD COLUMN redirect_count INTEGER DEFAULT 0;
-- ALTER TABLE health_checks ADD COLUMN content_type TEXT;
-- ALTER TABLE health_checks ADD COLUMN content_keyword TEXT;
-- ALTER TABLE health_checks ADD COLUMN keyword_found INTEGER;
