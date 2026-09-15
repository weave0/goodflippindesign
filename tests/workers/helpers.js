/**
 * Shared test helpers for Cloudflare Worker unit tests.
 * Run via: npm run test:workers
 */

/**
 * Bootstrap the minimum D1 schema needed by auth.js and cms.js.
 * Uses CREATE TABLE IF NOT EXISTS so it's idempotent across test files.
 */
export async function bootstrapSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      text TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS blog_posts (
      id TEXT PRIMARY KEY,
      title TEXT,
      slug TEXT,
      content TEXT,
      excerpt TEXT DEFAULT '',
      author_id TEXT,
      status TEXT DEFAULT 'draft',
      tags TEXT DEFAULT '',
      featured_image TEXT DEFAULT '',
      series TEXT DEFAULT '',
      seo_description TEXT DEFAULT '',
      seo_og_image TEXT DEFAULT '',
      reading_time INTEGER DEFAULT 1,
      published_at TEXT,
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS community_profiles (
      user_id TEXT PRIMARY KEY,
      display_name TEXT,
      avatar_url TEXT,
      bio TEXT DEFAULT '',
      location TEXT DEFAULT '',
      website TEXT DEFAULT '',
      role TEXT DEFAULT 'member',
      badges TEXT DEFAULT '[]',
      total_xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      last_checkin TEXT,
      post_count INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      reaction_given_count INTEGER DEFAULT 0,
      reaction_received_count INTEGER DEFAULT 0,
      onboarding_complete INTEGER DEFAULT 0,
      suspended INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS community_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_avatar TEXT DEFAULT '',
      title TEXT DEFAULT '',
      content TEXT,
      post_type TEXT DEFAULT 'discussion',
      parent_id TEXT,
      is_pinned INTEGER DEFAULT 0,
      is_edited INTEGER DEFAULT 0,
      reply_count INTEGER DEFAULT 0,
      reaction_count INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS community_activity (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      user_name TEXT,
      user_avatar TEXT DEFAULT '',
      action_type TEXT,
      action_detail TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS community_reactions (
      id TEXT PRIMARY KEY,
      post_id TEXT,
      user_id TEXT,
      reaction_type TEXT,
      created_at TEXT,
      UNIQUE(post_id, user_id, reaction_type)
    )`,
    `CREATE TABLE IF NOT EXISTS community_notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      actor_id TEXT DEFAULT '',
      actor_name TEXT DEFAULT '',
      actor_avatar TEXT DEFAULT '',
      type TEXT,
      message TEXT,
      reference_id TEXT DEFAULT '',
      is_read INTEGER DEFAULT 0,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS community_xp (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      amount INTEGER,
      action TEXT,
      source_id TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS cms_donations (
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
    )`,
    `CREATE TABLE IF NOT EXISTS cms_assets (
      id TEXT PRIMARY KEY,
      brand TEXT DEFAULT 'gfv',
      category TEXT DEFAULT 'uncategorized',
      title TEXT DEFAULT '',
      description TEXT DEFAULT '',
      alt_text TEXT DEFAULT '',
      file_path TEXT DEFAULT '',
      r2_key TEXT DEFAULT '',
      public_url TEXT DEFAULT '',
      media_type TEXT DEFAULT 'image',
      mime_type TEXT DEFAULT '',
      file_size INTEGER DEFAULT 0,
      width INTEGER DEFAULT 0,
      height INTEGER DEFAULT 0,
      thumbnail_path TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      emotions TEXT DEFAULT '[]',
      video_embed_url TEXT DEFAULT '',
      video_source TEXT DEFAULT '',
      featured INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 100,
      review_status TEXT DEFAULT 'draft',
      active INTEGER DEFAULT 1,
      uploaded_by TEXT DEFAULT '',
      approved_by TEXT DEFAULT '',
      approved_at TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS cms_platform_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      platform TEXT NOT NULL,
      account_label TEXT DEFAULT '',
      account_id TEXT NOT NULL,
      encrypted_payload TEXT DEFAULT '',
      is_active INTEGER DEFAULT 1,
      last_used_at TEXT DEFAULT '',
      token_fingerprint TEXT DEFAULT '',
      social_account_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(brand, platform, account_id)
    )`,
    `CREATE TABLE IF NOT EXISTS cms_social_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL DEFAULT 'gfv',
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      media_ids TEXT DEFAULT '[]',
      scheduled_at TEXT,
      published_at TEXT,
      external_id TEXT DEFAULT '',
      external_url TEXT DEFAULT '',
      status TEXT DEFAULT 'draft',
      error_message TEXT DEFAULT '',
      campaign_id INTEGER,
      objective TEXT DEFAULT '',
      watermark_profile TEXT DEFAULT '',
      created_by TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS cms_post_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES cms_social_posts(id) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      content TEXT NOT NULL,
      media_asset_id TEXT DEFAULT '',
      format TEXT DEFAULT '',
      char_count INTEGER DEFAULT 0,
      hashtags TEXT DEFAULT '[]',
      scheduled_at TEXT,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      external_id TEXT DEFAULT '',
      external_url TEXT DEFAULT '',
      error_message TEXT DEFAULT '',
      published_at TEXT,
      updated_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS social_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brand TEXT NOT NULL,
      platform TEXT NOT NULL,
      handle TEXT NOT NULL,
      display_name TEXT DEFAULT '',
      profile_url TEXT DEFAULT '',
      bio TEXT DEFAULT '',
      followers_count INTEGER DEFAULT 0,
      following_count INTEGER DEFAULT 0,
      post_count INTEGER DEFAULT 0,
      verified INTEGER DEFAULT 0,
      is_primary INTEGER DEFAULT 1,
      last_synced TEXT DEFAULT '',
      platform_user_id TEXT DEFAULT '',
      token_fingerprint TEXT DEFAULT '',
      link_status TEXT DEFAULT 'unlinked',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(brand, platform, handle)
    )`,
    `CREATE TABLE IF NOT EXISTS brand_workflows (
      brand TEXT PRIMARY KEY,
      enabled_platforms TEXT DEFAULT '[]',
      default_cadence TEXT DEFAULT 'weekly',
      require_approval INTEGER DEFAULT 0,
      auto_cross_post TEXT DEFAULT '[]',
      hashtag_sets TEXT DEFAULT '{}',
      post_time_utc TEXT DEFAULT '14:00',
      post_days TEXT DEFAULT '[1,2,3,4,5]',
      timezone TEXT DEFAULT 'America/New_York',
      notes TEXT DEFAULT '',
      updated_by TEXT DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
  ];

  for (const sql of statements) {
    await db.prepare(sql).run();
  }
}

/**
 * Generate a valid Stripe webhook signature for testing.
 * Mirrors the production verifyStripeSignature() logic in auth.js.
 */
export async function signStripePayload(body, secret) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signedPayload = `${timestamp}.${body}`;

  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const macBuffer = await crypto.subtle.sign(
    'HMAC', key, new TextEncoder().encode(signedPayload)
  );
  const macHex = Array.from(new Uint8Array(macBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    sig: `t=${timestamp},v1=${macHex}`,
    timestamp,
  };
}
