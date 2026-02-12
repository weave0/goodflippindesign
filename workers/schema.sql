-- Cloudflare D1 Schema for Community Features
-- Run this with: wrangler d1 execute DB --file=workers/schema.sql

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT,

  -- Indexes for performance
  INDEX idx_article_id (article_id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at DESC)
);

-- User Metadata Table (supplement to Clerk data)
CREATE TABLE IF NOT EXISTS user_metadata (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  website TEXT,
  is_anonymous BOOLEAN DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  last_active TEXT,
  created_at TEXT NOT NULL,

  INDEX idx_last_active (last_active DESC)
);

-- Blog Posts Table (for Phase 4: Content Evolution)
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft', -- draft, published, archived
  tags TEXT, -- comma-separated tags (max 5)
  featured_image TEXT, -- URL or base64 data
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,

  INDEX idx_slug (slug),
  INDEX idx_status (status),
  INDEX idx_published_at (published_at DESC)
);

-- Reactions Table (likes, hearts, etc.)
CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL, -- 'comment', 'blog_post', 'update'
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL, -- 'like', 'heart', 'celebrate', etc.
  created_at TEXT NOT NULL,

  -- Prevent duplicate reactions
  UNIQUE(target_type, target_id, user_id, reaction_type),

  INDEX idx_target (target_type, target_id),
  INDEX idx_user_id (user_id)
);

-- Moderation Log (for admin tracking)
CREATE TABLE IF NOT EXISTS moderation_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL, -- 'delete_comment', 'ban_user', 'edit_post', etc.
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  moderator_email TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL,

  INDEX idx_moderator (moderator_id),
  INDEX idx_created_at (created_at DESC)
);

-- Insert sample admin user (for testing)
-- Replace with actual Clerk user ID after first login
INSERT OR IGNORE INTO user_metadata (user_id, display_name, is_anonymous, created_at)
VALUES (
  'sample_admin_id',
  'Brett Weaver',
  0,
  datetime('now')
);
