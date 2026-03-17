-- ═══════════════════════════════════════════════════════════════
-- D1 Schema: Community Engagement Engine
-- Run AFTER d1-schema-console.sql (depends on existing tables)
-- Copy/paste this ENTIRE block into D1 Console
-- ═══════════════════════════════════════════════════════════════

-- ── Community Posts (threads, discussions, showcases, intros) ──
CREATE TABLE IF NOT EXISTS community_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  title TEXT,
  content TEXT NOT NULL,
  post_type TEXT DEFAULT 'discussion',  -- discussion, showcase, question, intro, vibe
  parent_id TEXT,                        -- NULL = top-level; post ID = reply
  reaction_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  is_pinned INTEGER DEFAULT 0,           -- 1 = pinned by admin
  is_edited INTEGER DEFAULT 0,           -- 1 = edited after creation
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_posts_user ON community_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_type ON community_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_posts_parent ON community_posts(parent_id);
CREATE INDEX IF NOT EXISTS idx_posts_created ON community_posts(created_at DESC);

-- ── Community Profiles (aggregated XP, level, streaks, badges) ──
CREATE TABLE IF NOT EXISTS community_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT DEFAULT '',
  location TEXT DEFAULT '',
  website TEXT DEFAULT '',
  total_xp INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  last_checkin TEXT,
  post_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  reaction_given_count INTEGER DEFAULT 0,
  reaction_received_count INTEGER DEFAULT 0,
  badges TEXT DEFAULT '["founding-member"]',  -- JSON array of earned badge keys
  onboarding_complete INTEGER DEFAULT 0,       -- 0 = show welcome, 1 = completed
  role TEXT DEFAULT 'member',                  -- member | moderator | admin
  suspended INTEGER DEFAULT 0,                 -- 0 = active, 1 = suspended
  created_at TEXT NOT NULL,
  updated_at TEXT
);

-- ── XP Ledger (every XP transaction, auditable) ──
CREATE TABLE IF NOT EXISTS community_xp (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,
  action TEXT NOT NULL,   -- checkin, post, reply, react, receive_reaction, profile_complete, streak_7, streak_14, streak_30
  source_id TEXT,          -- reference to what earned the XP (post ID, etc.)
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_xp_user ON community_xp(user_id);
CREATE INDEX IF NOT EXISTS idx_xp_action ON community_xp(action);
CREATE INDEX IF NOT EXISTS idx_xp_created ON community_xp(created_at DESC);

-- ── Activity Feed (denormalized for fast reads) ──
CREATE TABLE IF NOT EXISTS community_activity (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  action_type TEXT NOT NULL,  -- joined, posted, replied, earned_badge, leveled_up, streak, checkin, reacted
  action_detail TEXT,          -- JSON: { title, badge, level, postId, etc. }
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_activity_created ON community_activity(created_at DESC);

-- ── Post Reactions (emoji reactions on posts/replies) ──
CREATE TABLE IF NOT EXISTS community_reactions (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,  -- fire, heart, mind-blown, clap, rocket
  created_at TEXT NOT NULL,
  UNIQUE(post_id, user_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS idx_creactions_post ON community_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_creactions_user ON community_reactions(user_id);

-- ── Notifications ──
CREATE TABLE IF NOT EXISTS community_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT,
  actor_avatar TEXT,
  type TEXT NOT NULL,             -- reply, reaction, badge, level_up, mention, welcome
  message TEXT NOT NULL,
  reference_id TEXT,              -- post/badge/etc ID for deep linking
  is_read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_user ON community_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON community_notifications(created_at DESC);

-- ── Full-text search on posts ──
CREATE INDEX IF NOT EXISTS idx_posts_title ON community_posts(title);
