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
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_cms_assets_brand ON cms_assets(brand);
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
  status TEXT DEFAULT 'draft',             -- draft, scheduled, publishing, published, failed
  error_message TEXT DEFAULT '',           -- if status = failed
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
  status TEXT DEFAULT 'pending',           -- pending, publishing, published, failed
  external_id TEXT DEFAULT '',
  external_url TEXT DEFAULT '',
  error_message TEXT DEFAULT '',
  published_at TEXT,
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

-- Optional migration for existing databases:
-- ALTER TABLE cms_social_posts ADD COLUMN campaign_id INTEGER;
-- ALTER TABLE cms_social_posts ADD COLUMN objective TEXT DEFAULT '';
-- ALTER TABLE cms_social_posts ADD COLUMN watermark_profile TEXT DEFAULT '';
