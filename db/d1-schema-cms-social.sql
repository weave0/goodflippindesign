-- ═══════════════════════════════════════════════════════════════════════════════
-- D1 Schema: CMS Social, Brand Workflows, Asset Discovery, Cross-Posts,
--            Content Studio Registries & Generated Assets
--
-- Run AFTER d1-schema-cms.sql (depends on cms_assets, cms_social_posts)
-- Run AFTER d1-schema-account-links.sql if you use the social_accounts ↔
--   cms_platform_tokens cross-reference.
--
-- All tables use CREATE TABLE IF NOT EXISTS — safe to re-run.
-- Copy/paste this entire block into the D1 Console (or wrangler d1 execute).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Social Accounts (handle registry, per brand/platform) ────────────────────
-- One row per (brand, platform, handle) triple.
-- Linked to cms_platform_tokens via platform_user_id + token_fingerprint.
CREATE TABLE IF NOT EXISTS social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,                        -- gfd, gfv, aiaimate, culturesherpa, citizenapproved, globaldeets
  platform TEXT NOT NULL,                     -- twitter, instagram, tiktok, linkedin, threads, youtube, pinterest
  handle TEXT NOT NULL,                       -- @-stripped handle or numeric platform ID
  display_name TEXT DEFAULT '',
  profile_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,                 -- 1 = verified badge
  is_primary INTEGER DEFAULT 1,             -- 1 = primary account for this brand/platform
  last_synced TEXT DEFAULT '',               -- ISO timestamp of last profile sync
  platform_user_id TEXT DEFAULT '',          -- external numeric/alphanumeric ID from platform
  token_fingerprint TEXT DEFAULT '',         -- HMAC fingerprint of the linked platform token
  link_status TEXT DEFAULT 'unlinked',        -- unlinked | linked | expired | revoked
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (brand, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_brand ON social_accounts(brand);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts(platform);
CREATE INDEX IF NOT EXISTS idx_social_accounts_link_status ON social_accounts(link_status);


-- ── Brand Workflows (per-brand social publishing configuration) ───────────────
-- One row per brand. Updated via PUT /api/cms/brand-workflows.
-- Seed rows are auto-created by handlePopulateSocialAccounts on first run.
CREATE TABLE IF NOT EXISTS brand_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL UNIQUE,                 -- gfd, gfv, aiaimate, etc.
  enabled_platforms TEXT DEFAULT '[]',        -- JSON array: ["twitter","instagram",...]
  default_cadence TEXT DEFAULT 'daily',       -- daily | weekly | manual
  require_approval INTEGER DEFAULT 1,         -- 1 = posts need manual approval before publish
  auto_cross_post TEXT DEFAULT '[]',          -- JSON array of target brands to auto-syndicate to
  hashtag_sets TEXT DEFAULT '{}',             -- JSON object: { platform: [tags] }
  post_time_utc TEXT DEFAULT '12:00',         -- preferred post time in UTC "HH:MM"
  post_days TEXT DEFAULT '["mon","wed","fri"]', -- JSON array of day abbreviations
  timezone TEXT DEFAULT 'America/Chicago',
  notes TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',                 -- Clerk user ID of last editor
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_brand_workflows_brand ON brand_workflows(brand);


-- ── Discovered Assets (server-side page scanner results) ─────────────────────
-- Populated by POST /api/cms/assets/discover and handleScanPage.
-- Promoted to cms_assets via POST /api/cms/assets/discovered/:id/claim.
CREATE TABLE IF NOT EXISTS discovered_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  site_domain TEXT NOT NULL,                  -- e.g. "goodflippindesign.com"
  page_url TEXT NOT NULL,                     -- full URL of the page scanned
  asset_url TEXT NOT NULL,                    -- full URL of the discovered asset
  asset_type TEXT DEFAULT 'image',            -- image | video | audio | document
  alt_text TEXT DEFAULT '',
  status TEXT DEFAULT 'discovered',           -- discovered | claimed | ignored
  cms_asset_id TEXT DEFAULT NULL,             -- set when claimed → fk to cms_assets.id
  discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (asset_url)
);

CREATE INDEX IF NOT EXISTS idx_discovered_assets_brand ON discovered_assets(brand);
CREATE INDEX IF NOT EXISTS idx_discovered_assets_domain ON discovered_assets(site_domain);
CREATE INDEX IF NOT EXISTS idx_discovered_assets_status ON discovered_assets(status);


-- ── Cross-Post Links (cross-brand syndication queue) ─────────────────────────
-- Created by POST /api/cms/cross-posts. Consumed by the social publisher.
CREATE TABLE IF NOT EXISTS cross_post_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_post_id TEXT NOT NULL,               -- cms_social_posts.id of the original post
  target_brand TEXT NOT NULL,                 -- brand to syndicate to
  adapted_content TEXT DEFAULT '',            -- optional brand-adapted caption/copy
  status TEXT DEFAULT 'queued',               -- queued | published | failed | skipped
  published_at TEXT DEFAULT NULL,
  error_message TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cross_post_links_source ON cross_post_links(source_post_id);
CREATE INDEX IF NOT EXISTS idx_cross_post_links_status ON cross_post_links(status);
CREATE INDEX IF NOT EXISTS idx_cross_post_links_target ON cross_post_links(target_brand);


-- ── Content Studio: Prompt Registries ────────────────────────────────────────
-- CRUD via /api/cms/content-studio/registries.
-- One registry = one series/set of scenes with associated DALL-E prompts.
CREATE TABLE IF NOT EXISTS cms_prompt_registries (
  id TEXT PRIMARY KEY,                        -- slug-style ID, e.g. "gfv-season-1"
  brand TEXT NOT NULL DEFAULT 'gfv',
  series_id TEXT DEFAULT '',                  -- optional grouping ID
  type TEXT DEFAULT 'episode',                -- episode | standalone | collection
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  scene_count INTEGER DEFAULT 0,
  scenes_json TEXT DEFAULT '[]',              -- full prompt scene array as JSON
  source_file TEXT DEFAULT '',                -- filename hint (e.g. "ep-01-prompts.json")
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_prompt_registries_brand ON cms_prompt_registries(brand);
CREATE INDEX IF NOT EXISTS idx_cms_prompt_registries_series ON cms_prompt_registries(series_id);


-- ── Content Studio: Generated Assets ─────────────────────────────────────────
-- Tracks every DALL-E 3 generation job. One row per generated image.
-- Linked to cms_assets (stored in R2) and cms_prompt_registries.
CREATE TABLE IF NOT EXISTS cms_generated_assets (
  id TEXT PRIMARY KEY,                        -- gen_<timestamp>_<uuid-prefix>
  registry_id TEXT DEFAULT '',               -- fk: cms_prompt_registries.id (nullable for one-offs)
  scene_number INTEGER DEFAULT 0,
  prompt_index INTEGER DEFAULT 0,
  prompt_text TEXT NOT NULL,
  asset_id TEXT NOT NULL,                     -- fk: cms_assets.id
  r2_key TEXT NOT NULL,                       -- R2 object key for direct access
  status TEXT DEFAULT 'done',                 -- done | failed | scheduled
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_generated_assets_registry ON cms_generated_assets(registry_id);
CREATE INDEX IF NOT EXISTS idx_cms_generated_assets_status ON cms_generated_assets(status);
CREATE INDEX IF NOT EXISTS idx_cms_generated_assets_asset ON cms_generated_assets(asset_id);
