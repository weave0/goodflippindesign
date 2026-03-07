-- ═══════════════════════════════════════════════════════════════
-- D1 Schema: Media Platform Extensions
-- Run AFTER d1-schema-cms.sql
-- Adds: source tracking, asset deployments, galleries, API keys
-- ═══════════════════════════════════════════════════════════════

-- ── Extend cms_assets with source tracking ────────────────────
-- These columns track where an asset came from and help with dedup.
-- Using ALTER TABLE so existing data is preserved.

ALTER TABLE cms_assets ADD COLUMN source_type TEXT DEFAULT 'upload';
-- Values: 'upload' (admin UI), 'local_sync' (sync-to-r2.js), 'crawled' (site crawler), 'shared' (cross-site)

ALTER TABLE cms_assets ADD COLUMN source_path TEXT DEFAULT '';
-- Local filesystem path (for synced assets, e.g. Z:\MediaDrop\BrandSpecific\GFV\hero.png)

ALTER TABLE cms_assets ADD COLUMN content_hash TEXT DEFAULT '';
-- SHA-256 hash of file content for deduplication across sources

ALTER TABLE cms_assets ADD COLUMN r2_key TEXT DEFAULT '';
-- Explicit R2 object key (may differ from file_path for legacy assets)

ALTER TABLE cms_assets ADD COLUMN variants TEXT DEFAULT '{}';
-- JSON: {"thumb": "gfv/gallery/thumb_hero.webp", "og": "gfv/gallery/og_hero.png"}

CREATE INDEX IF NOT EXISTS idx_cms_assets_source ON cms_assets(source_type);
CREATE INDEX IF NOT EXISTS idx_cms_assets_hash ON cms_assets(content_hash);


-- ── Asset Deployments (where assets live on the web) ──────────
-- Tracks which assets appear on which ecosystem sites.
-- Populated by the site crawler (scripts/crawl-site-assets.js)
-- and updated when assets are replaced via the admin UI.

CREATE TABLE IF NOT EXISTS cms_asset_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,                   -- FK to cms_assets.id (or '' if unlinked)
  site_domain TEXT NOT NULL,                -- e.g. goodflippinvibes.com
  page_path TEXT NOT NULL DEFAULT '/',      -- e.g. /gallery.html, /index.html
  element_selector TEXT DEFAULT '',         -- CSS selector: img.hero-bg, .gallery-item:nth-child(3) img
  element_attribute TEXT DEFAULT 'src',     -- src, background-image, srcset, poster
  live_url TEXT NOT NULL,                   -- full URL: https://goodflippinvibes.com/assets/hero.jpg
  r2_replacement_key TEXT DEFAULT '',       -- R2 key if this asset was replaced via admin
  status TEXT DEFAULT 'active',             -- active, replaced, removed, broken
  content_hash TEXT DEFAULT '',             -- hash of the live asset for matching
  last_crawled_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_deploy_asset ON cms_asset_deployments(asset_id);
CREATE INDEX IF NOT EXISTS idx_deploy_site ON cms_asset_deployments(site_domain);
CREATE INDEX IF NOT EXISTS idx_deploy_page ON cms_asset_deployments(site_domain, page_path);
CREATE INDEX IF NOT EXISTS idx_deploy_status ON cms_asset_deployments(status);
CREATE INDEX IF NOT EXISTS idx_deploy_hash ON cms_asset_deployments(content_hash);


-- ── Galleries (curated, ordered asset collections per site) ───
-- Each gallery belongs to a specific site and brand.
-- Gallery items reference cms_assets, so the same asset can
-- appear in multiple galleries across different sites.

CREATE TABLE IF NOT EXISTS cms_galleries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_domain TEXT NOT NULL,                -- which site owns this gallery
  gallery_slug TEXT NOT NULL,               -- URL-safe slug: "abstract", "film-club"
  title TEXT NOT NULL,                      -- Display title: "Abstract Art"
  description TEXT DEFAULT '',
  cover_asset_id TEXT DEFAULT '',           -- FK to cms_assets.id for gallery thumbnail
  brand TEXT NOT NULL DEFAULT 'gfv',
  sort_order INTEGER DEFAULT 100,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(site_domain, gallery_slug)
);

CREATE INDEX IF NOT EXISTS idx_gallery_site ON cms_galleries(site_domain);
CREATE INDEX IF NOT EXISTS idx_gallery_brand ON cms_galleries(brand);
CREATE INDEX IF NOT EXISTS idx_gallery_active ON cms_galleries(active);


-- ── Gallery Items (ordered assets within a gallery) ───────────
-- Sort order determines display sequence.
-- Same asset can appear in multiple galleries (cross-site sharing).

CREATE TABLE IF NOT EXISTS cms_gallery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id INTEGER NOT NULL REFERENCES cms_galleries(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,                   -- FK to cms_assets.id
  sort_order INTEGER DEFAULT 100,
  caption TEXT DEFAULT '',
  alt_text TEXT DEFAULT '',
  link_url TEXT DEFAULT '',                 -- optional click-through URL
  active INTEGER DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now')),
  UNIQUE(gallery_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_gitem_gallery ON cms_gallery_items(gallery_id);
CREATE INDEX IF NOT EXISTS idx_gitem_asset ON cms_gallery_items(asset_id);
CREATE INDEX IF NOT EXISTS idx_gitem_order ON cms_gallery_items(gallery_id, sort_order);


-- ── API Keys (for external system access) ─────────────────────
-- Phase 4: Allows external tools to read/write assets via REST API.

CREATE TABLE IF NOT EXISTS cms_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key_hash TEXT NOT NULL UNIQUE,            -- SHA-256 of the API key (never store plaintext)
  label TEXT NOT NULL DEFAULT '',            -- "Figma Plugin", "Adobe Bridge", etc.
  brand TEXT DEFAULT '',                    -- '' = all brands, or 'gfv' = GFV only
  permissions TEXT DEFAULT '["read"]',      -- JSON array: ["read"], ["read","write"], ["read","write","delete"]
  rate_limit INTEGER DEFAULT 1000,          -- requests per hour
  active INTEGER DEFAULT 1,
  last_used_at TEXT,
  created_by TEXT DEFAULT '',               -- Clerk user ID who created this key
  created_at TEXT DEFAULT (datetime('now')),
  expires_at TEXT                            -- NULL = never expires
);

CREATE INDEX IF NOT EXISTS idx_apikey_hash ON cms_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_apikey_active ON cms_api_keys(active);


-- ── Webhooks (event notifications to external systems) ────────
-- Phase 4: POST events to external URLs when assets/galleries change.

CREATE TABLE IF NOT EXISTS cms_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,                        -- HTTPS endpoint to POST to
  events TEXT NOT NULL DEFAULT '[]',        -- JSON: ["asset.upload","gallery.update","sync.complete"]
  brand TEXT DEFAULT '',                    -- '' = all brands
  secret TEXT NOT NULL DEFAULT '',          -- HMAC-SHA256 signing secret
  active INTEGER DEFAULT 1,
  failure_count INTEGER DEFAULT 0,          -- consecutive failures (disable after 10)
  last_triggered_at TEXT,
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_webhook_active ON cms_webhooks(active);
CREATE INDEX IF NOT EXISTS idx_webhook_events ON cms_webhooks(events);
