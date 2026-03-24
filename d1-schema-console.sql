-- D1 Schema for GFD Community Platform
-- Copy/paste this ENTIRE block into D1 Console

-- Comments Table
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  article_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_article_id ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_user_id ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_created_at ON comments(created_at DESC);

-- User Metadata Table
CREATE TABLE IF NOT EXISTS user_metadata (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  website TEXT,
  is_anonymous BOOLEAN DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  last_active TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_last_active ON user_metadata(last_active DESC);

-- Blog Posts Table
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  excerpt TEXT,
  author_id TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  tags TEXT,
  featured_image TEXT,
  series TEXT,
  seo_description TEXT,
  seo_og_image TEXT,
  reading_time INTEGER,
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_status ON blog_posts(status);
CREATE INDEX IF NOT EXISTS idx_published_at ON blog_posts(published_at DESC);

-- Reactions Table
CREATE TABLE IF NOT EXISTS reactions (
  id TEXT PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(target_type, target_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_target ON reactions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_user_reactions ON reactions(user_id);

-- Moderation Log Table
CREATE TABLE IF NOT EXISTS moderation_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  moderator_id TEXT NOT NULL,
  moderator_email TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_moderator ON moderation_log(moderator_id);
CREATE INDEX IF NOT EXISTS idx_mod_created ON moderation_log(created_at DESC);
