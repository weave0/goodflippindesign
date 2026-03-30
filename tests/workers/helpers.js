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
      brand TEXT,
      asset_type TEXT,
      file_name TEXT,
      r2_key TEXT,
      url TEXT,
      alt_text TEXT DEFAULT '',
      review_status TEXT DEFAULT 'pending',
      usage_count INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
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
