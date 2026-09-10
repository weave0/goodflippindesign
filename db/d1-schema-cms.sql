-- ═══════════════════════════════════════════════════════════════
-- D1 Schema: CMS — Assets, Social Posts, Content
-- Run AFTER d1-schema-console.sql and d1-schema-community.sql
-- Copy/paste this ENTIRE block into D1 Console
-- ═══════════════════════════════════════════════════════════════

-- ── Media Assets (images, videos, audio across all brands) ────
CREATE TABLE IF NOT EXISTS cms_assets (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL DEFAULT 'gfv',        -- gfv, gfd, aiaimate, citizenapproved, culturesherpa
  category TEXT NOT NULL DEFAULT 'uncategorized',
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  file_path TEXT NOT NULL,                  -- relative path within R2 or local
  media_type TEXT NOT NULL DEFAULT 'image', -- image, video, audio, document
  mime_type TEXT DEFAULT '',
  file_size INTEGER DEFAULT 0,             -- bytes
  width INTEGER DEFAULT 0,
  height INTEGER DEFAULT 0,
  thumbnail_path TEXT DEFAULT '',           -- path to generated thumbnail
  tags TEXT DEFAULT '[]',                   -- JSON array
  emotions TEXT DEFAULT '[]',              -- JSON array (GFV art taxonomy)
  video_embed_url TEXT DEFAULT '',         -- YouTube/IG/TikTok embed
  video_source TEXT DEFAULT '',            -- youtube, instagram, tiktok, self-hosted
  version INTEGER DEFAULT 1,
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 100,
  uploaded_by TEXT DEFAULT '',             -- Clerk user ID
  review_status TEXT DEFAULT 'draft',      -- draft | approved | rejected
  approved_by TEXT DEFAULT '',             -- Clerk user ID who approved
  approved_at TEXT DEFAULT '',             -- ISO timestamp of approval
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Migration for existing DBs (safe to run multiple times — SQLite ignores duplicate columns)
-- Run once in Cloudflare D1 console:
--   ALTER TABLE cms_assets ADD COLUMN review_status TEXT DEFAULT 'draft';
--   ALTER TABLE cms_assets ADD COLUMN approved_by TEXT DEFAULT '';
--   ALTER TABLE cms_assets ADD COLUMN approved_at TEXT DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_cms_assets_brand ON cms_assets(brand);
CREATE INDEX IF NOT EXISTS idx_cms_assets_review ON cms_assets(review_status);
CREATE INDEX IF NOT EXISTS idx_cms_assets_category ON cms_assets(category);
CREATE INDEX IF NOT EXISTS idx_cms_assets_type ON cms_assets(media_type);
CREATE INDEX IF NOT EXISTS idx_cms_assets_featured ON cms_assets(featured);
CREATE INDEX IF NOT EXISTS idx_cms_assets_active ON cms_assets(active);
CREATE INDEX IF NOT EXISTS idx_cms_assets_created ON cms_assets(created_at DESC);

-- ── Social Media Posts (scheduling + tracking) ────────────────
CREATE TABLE IF NOT EXISTS cms_social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL DEFAULT 'gfv',
  platform TEXT NOT NULL,                   -- instagram, facebook, x, youtube, tiktok, linkedin, pinterest
  content TEXT NOT NULL,
  media_ids TEXT DEFAULT '[]',             -- JSON array of cms_assets IDs
  scheduled_at TEXT,                        -- when to publish (NULL = draft)
  published_at TEXT,                        -- when actually published
  external_id TEXT DEFAULT '',             -- platform's post ID after publish
  external_url TEXT DEFAULT '',            -- link to live post
  status TEXT DEFAULT 'draft',             -- draft, scheduled, publishing, published, failed, ambiguous
  error_message TEXT DEFAULT '',           -- if status = failed or ambiguous
  campaign_id INTEGER,                     -- FK to cms_campaigns(id)
  objective TEXT DEFAULT '',               -- campaign objective copy
  watermark_profile TEXT DEFAULT '',       -- watermark branding preset
  created_by TEXT DEFAULT '',              -- Clerk user ID
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_social_brand ON cms_social_posts(brand);
CREATE INDEX IF NOT EXISTS idx_cms_social_platform ON cms_social_posts(platform);
CREATE INDEX IF NOT EXISTS idx_cms_social_status ON cms_social_posts(status);
CREATE INDEX IF NOT EXISTS idx_cms_social_scheduled ON cms_social_posts(scheduled_at);

-- ── Content Pieces (markdown articles, announcements) ─────────
CREATE TABLE IF NOT EXISTS cms_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL DEFAULT 'gfv',
  content_type TEXT NOT NULL DEFAULT 'article', -- article, announcement, newsletter, page
  title TEXT NOT NULL,
  slug TEXT UNIQUE,
  body TEXT NOT NULL DEFAULT '',            -- Markdown
  excerpt TEXT DEFAULT '',
  featured_image_id TEXT DEFAULT '',        -- FK to cms_assets.id
  status TEXT DEFAULT 'draft',             -- draft, published, archived
  author_id TEXT DEFAULT '',               -- Clerk user ID
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_content_brand ON cms_content(brand);
CREATE INDEX IF NOT EXISTS idx_cms_content_type ON cms_content(content_type);
CREATE INDEX IF NOT EXISTS idx_cms_content_status ON cms_content(status);
CREATE INDEX IF NOT EXISTS idx_cms_content_slug ON cms_content(slug);

-- ── Audit Log (track all CMS mutations) ──────────────────────
CREATE TABLE IF NOT EXISTS cms_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,                    -- asset.create, asset.update, asset.delete, social.schedule, etc.
  target_type TEXT NOT NULL,               -- asset, social_post, content
  target_id TEXT NOT NULL,
  details TEXT DEFAULT '',                 -- JSON with changed fields
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_audit_user ON cms_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_cms_audit_action ON cms_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_cms_audit_created ON cms_audit_log(created_at DESC);

-- ── Platform OAuth Tokens (one row per brand+platform combo) ──
-- Encrypting the token column client-side before INSERT is recommended.
-- Store: access_token, refresh_token, expiry all in encrypted_payload JSON.
CREATE TABLE IF NOT EXISTS cms_platform_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,                     -- gfv, gfd, aiaimate, etc.
  platform TEXT NOT NULL,                  -- instagram, facebook, x, linkedin, pinterest, tiktok, youtube
  account_label TEXT DEFAULT '',           -- human-readable "@handle" or "Page Name"
  account_id TEXT DEFAULT '',             -- platform's user/page ID
  encrypted_payload TEXT NOT NULL,         -- JSON: {access_token, refresh_token, expires_at, scope}
  is_active INTEGER DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(brand, platform, account_id)
);

CREATE INDEX IF NOT EXISTS idx_cms_tokens_brand ON cms_platform_tokens(brand);
CREATE INDEX IF NOT EXISTS idx_cms_tokens_platform ON cms_platform_tokens(platform);
CREATE INDEX IF NOT EXISTS idx_cms_tokens_active ON cms_platform_tokens(is_active);

-- ── Post Platform Variants (per-platform version of a scheduled post) ──
-- A single "campaign post" fans out to multiple platform-specific variants.
CREATE TABLE IF NOT EXISTS cms_post_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL REFERENCES cms_social_posts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  content TEXT NOT NULL,                   -- platform-specific caption (char limits enforced)
  media_asset_id TEXT DEFAULT '',         -- which asset to use (may differ per platform)
  format TEXT DEFAULT '',                  -- image_spec used: square, portrait, landscape, story, etc.
  char_count INTEGER DEFAULT 0,
  hashtags TEXT DEFAULT '[]',             -- JSON array
  scheduled_at TEXT,
  status TEXT DEFAULT 'pending',           -- pending, publishing, published, failed, ambiguous
  retry_count INTEGER DEFAULT 0,           -- manual retry count; ambiguous rows are never auto-retried
  external_id TEXT DEFAULT '',
  external_url TEXT DEFAULT '',
  error_message TEXT DEFAULT '',
  published_at TEXT,
  updated_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_variants_post ON cms_post_variants(post_id);
CREATE INDEX IF NOT EXISTS idx_cms_variants_platform ON cms_post_variants(platform);
CREATE INDEX IF NOT EXISTS idx_cms_variants_status ON cms_post_variants(status);
CREATE INDEX IF NOT EXISTS idx_cms_variants_scheduled ON cms_post_variants(scheduled_at);

-- ── Campaign Planner (annual strategy + execution windows) ─────────────
CREATE TABLE IF NOT EXISTS cms_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL DEFAULT 'gfd',
  name TEXT NOT NULL,
  objective TEXT DEFAULT '',
  cadence TEXT DEFAULT '',               -- daily, weekly, monthly, burst
  platforms TEXT DEFAULT '[]',           -- JSON array
  start_date TEXT,
  end_date TEXT,
  status TEXT DEFAULT 'planned',         -- planned, active, paused, completed, archived
  notes TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_campaigns_brand ON cms_campaigns(brand);
CREATE INDEX IF NOT EXISTS idx_cms_campaigns_status ON cms_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_cms_campaigns_start ON cms_campaigns(start_date);

-- Migration note (applied 2026-03-11): campaign_id, objective, watermark_profile
-- now live in the base table above. On existing D1 instances the ALTER TABLEs in
-- ensureCampaignSchema() handle them safely (ignores duplicate-column errors).

-- ── Asset Overrides (live image swap without redeploy) ─────────────────
-- When _worker.js serves any brand page, it checks this table.
-- Any <img src> matching url_pattern is rewritten to point to the R2 CDN URL.
-- This enables drag-and-replace in admin UI with zero code deploys.
CREATE TABLE IF NOT EXISTS asset_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,                     -- gfv, gfd, aiaimate, etc.
  site_domain TEXT NOT NULL,               -- e.g. goodflippinvibes.com
  url_pattern TEXT NOT NULL,               -- original asset path/URL pattern being replaced
  r2_key TEXT NOT NULL,                    -- replacement asset key in R2 (brand/cat/ts_file)
  label TEXT DEFAULT '',                   -- human-readable description
  active INTEGER DEFAULT 1,
  applied_by TEXT DEFAULT '',              -- Clerk user ID
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_overrides_brand ON asset_overrides(brand);
CREATE INDEX IF NOT EXISTS idx_overrides_domain ON asset_overrides(site_domain);
CREATE INDEX IF NOT EXISTS idx_overrides_active ON asset_overrides(active);

-- ── Asset Brands (many-to-many cross-brand sharing) ────────────────────
-- A single asset in R2/D1 can be shared to multiple brands.
-- The cms_assets.brand column is the "home" brand; this table adds secondaries.
CREATE TABLE IF NOT EXISTS asset_brand_shares (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL REFERENCES cms_assets(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,                     -- secondary brand this asset is shared into
  shared_by TEXT DEFAULT '',              -- Clerk user ID
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(asset_id, brand)
);

CREATE INDEX IF NOT EXISTS idx_shares_asset ON asset_brand_shares(asset_id);
CREATE INDEX IF NOT EXISTS idx_shares_brand ON asset_brand_shares(brand);

-- ── Discovered Assets (scraped from deployed sites) ────────────────────
-- assets found on live sites that aren't yet in R2/cms_assets.
-- Admin can "claim" them (upload original to R2, link override).
CREATE TABLE IF NOT EXISTS discovered_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  site_domain TEXT NOT NULL,
  page_url TEXT NOT NULL,                  -- page the asset was found on
  asset_url TEXT NOT NULL,                 -- full URL of the discovered asset
  asset_type TEXT DEFAULT 'image',         -- image, video, audio
  alt_text TEXT DEFAULT '',
  dimensions TEXT DEFAULT '',              -- "1200x630" if determinable
  cms_asset_id TEXT DEFAULT '',           -- set once claimed → links to cms_assets.id
  status TEXT DEFAULT 'discovered',        -- discovered, claimed, ignored
  discovered_at TEXT DEFAULT (datetime('now')),
  UNIQUE(asset_url)
);

CREATE INDEX IF NOT EXISTS idx_discovered_brand ON discovered_assets(brand);
CREATE INDEX IF NOT EXISTS idx_discovered_domain ON discovered_assets(site_domain);
CREATE INDEX IF NOT EXISTS idx_discovered_status ON discovered_assets(status);

-- ── Social Account Registry ──────────────────────────────────────────────
-- One row per brand × platform handle. Tracks public profile metadata
-- separately from the OAuth token (cms_platform_tokens). Synced periodically.
CREATE TABLE IF NOT EXISTS social_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,                       -- gfd, gfv, aiaimate, culturesherpa, globaldeets
  platform TEXT NOT NULL,                    -- instagram, x, linkedin, facebook, tiktok, youtube, pinterest
  handle TEXT NOT NULL,                      -- @handle or page name
  display_name TEXT DEFAULT '',
  profile_url TEXT DEFAULT '',
  avatar_r2_key TEXT DEFAULT '',             -- cached avatar in R2
  followers_count INTEGER DEFAULT 0,
  following_count INTEGER DEFAULT 0,
  post_count INTEGER DEFAULT 0,
  bio TEXT DEFAULT '',
  verified INTEGER DEFAULT 0,
  is_primary INTEGER DEFAULT 1,             -- 1 = primary posting account for this brand+platform
  last_synced TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(brand, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_social_accounts_brand ON social_accounts(brand);
CREATE INDEX IF NOT EXISTS idx_social_accounts_platform ON social_accounts(platform);

-- ── Brand Workflows ──────────────────────────────────────────────────────
-- Per-brand publishing config: which platforms are enabled, approval gates,
-- default post cadence, cross-post preferences, and watermark settings.
CREATE TABLE IF NOT EXISTS brand_workflows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL UNIQUE,               -- gfd, gfv, aiaimate, culturesherpa, globaldeets
  enabled_platforms TEXT DEFAULT '[]',      -- JSON array of active platform slugs
  default_cadence TEXT DEFAULT 'weekly',    -- hourly, daily, weekly, manual
  require_approval INTEGER DEFAULT 0,       -- 1 = posts stay in 'pending' until admin approves
  auto_cross_post TEXT DEFAULT '[]',        -- JSON array of brands to auto-copy posts to
  watermark_default TEXT DEFAULT '',        -- default watermark profile slug
  hashtag_sets TEXT DEFAULT '{}',          -- JSON: { instagram: ["tag1","tag2"], ... }
  post_time_utc TEXT DEFAULT '14:00',       -- preferred UTC publish time (HH:MM)
  post_days TEXT DEFAULT '[1,2,3,4,5]',    -- JSON array: 0=Sun … 6=Sat
  timezone TEXT DEFAULT 'America/New_York',
  notes TEXT DEFAULT '',
  updated_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ── Content Studio: Prompt Registries ────────────────────────────────────────
-- Stores scene-by-scene AI prompt registries for video content production.
-- Each registry represents a piece of content (episode, special, promo)
-- with brand/series context and a full JSON array of scene prompts.
CREATE TABLE IF NOT EXISTS cms_prompt_registries (
  id TEXT PRIMARY KEY,                       -- e.g. "gfv__irish_pickle__70s-reel"
  brand TEXT NOT NULL,                       -- gfv, gfd, aiaimate, etc.
  series_id TEXT NOT NULL DEFAULT '',        -- e.g. "irish_pickle"
  type TEXT NOT NULL DEFAULT 'episode',      -- episode, special, campaign, promo
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  scene_count INTEGER DEFAULT 0,
  scenes_json TEXT NOT NULL DEFAULT '[]',    -- full scene prompts as JSON array
  source_file TEXT DEFAULT '',               -- original .py or story.json path hint
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registries_brand ON cms_prompt_registries(brand);
CREATE INDEX IF NOT EXISTS idx_registries_series ON cms_prompt_registries(series_id);

-- ── Content Studio: Generated Assets ─────────────────────────────────────────
-- Links generated images/frames back to their source prompt and registry scene.
CREATE TABLE IF NOT EXISTS cms_generated_assets (
  id TEXT PRIMARY KEY,
  registry_id TEXT NOT NULL REFERENCES cms_prompt_registries(id),
  scene_number INTEGER NOT NULL,
  prompt_index INTEGER NOT NULL DEFAULT 0,
  prompt_text TEXT NOT NULL,
  asset_id TEXT DEFAULT '',                  -- FK to cms_assets.id once generated + saved
  r2_key TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',             -- pending, generating, done, failed
  error_message TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Donation Transactions ────────────────────────────────────────────────────
-- Records processed Stripe donations for admin dashboard KPIs and reporting.
-- Populated via admin manual entry or future Stripe webhook integration.
CREATE TABLE IF NOT EXISTS cms_donations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  stripe_payment_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'usd',
  project TEXT,
  donor_email TEXT,
  donor_name TEXT,
  status TEXT DEFAULT 'succeeded',
  recurring INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── Admin Operations Board ────────────────────────────────────────────────────
-- Personal task board for the solo operator. Surfaced in the Overview panel
-- alongside static GAP_FLAGS. Severity: critical | warning | normal | done.
CREATE TABLE IF NOT EXISTS admin_ops (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal',
  brand TEXT DEFAULT 'all',
  area TEXT DEFAULT 'General',
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT DEFAULT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_ops_severity ON admin_ops(severity);
CREATE INDEX IF NOT EXISTS idx_admin_ops_completed ON admin_ops(completed_at);

CREATE INDEX IF NOT EXISTS idx_donations_status ON cms_donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_created ON cms_donations(created_at);

CREATE INDEX IF NOT EXISTS idx_gen_assets_registry ON cms_generated_assets(registry_id);
CREATE INDEX IF NOT EXISTS idx_gen_assets_status ON cms_generated_assets(status);

-- Seed default workflow rows for all known brands
INSERT OR IGNORE INTO brand_workflows (brand, enabled_platforms, default_cadence)
VALUES
  ('gfd',          '["instagram","linkedin","x"]',                          'weekly'),
  ('gfv',          '["instagram","x","facebook","tiktok","pinterest"]',     'daily'),
  ('aiaimate',     '["linkedin","x","youtube"]',                            'weekly'),
  ('culturesherpa','["instagram","x","pinterest"]',                         'weekly'),
  ('globaldeets',  '["linkedin","x"]',                                      'weekly');

CREATE INDEX IF NOT EXISTS idx_brand_workflows_brand ON brand_workflows(brand);

-- ── Ecosystem Cross-Post Links ────────────────────────────────────────────
-- Records when a post in one brand is syndicated to another brand.
-- Enables "share to ecosystem" with full attribution and diff tracking.
CREATE TABLE IF NOT EXISTS cross_post_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_post_id INTEGER NOT NULL,           -- cms_social_posts.id of originating post
  target_brand TEXT NOT NULL,
  target_post_id INTEGER,                    -- set once target post is created
  adapted_content TEXT DEFAULT '',           -- modified caption for the target brand's voice
  status TEXT DEFAULT 'pending',             -- pending, adapted, published, skipped
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')),
  published_at TEXT DEFAULT '',
  UNIQUE(source_post_id, target_brand)
);

CREATE INDEX IF NOT EXISTS idx_cross_post_source ON cross_post_links(source_post_id);
CREATE INDEX IF NOT EXISTS idx_cross_post_target ON cross_post_links(target_brand);
