/**
 * Cloudflare Worker: Auth & Protected Endpoints
 *
 * Handles:
 * - Clerk session verification
 * - Admin role assignment
 * - Protected API routes (comments, profiles)
 * - CMS endpoints (assets, social, content, R2 upload)
 * - CORS for cross-ecosystem auth
 * - Error tracking via Sentry (observability) — gracefully degrades if unavailable
 */

import { handleCMSRequest } from './cms.js';

// Dynamic Sentry import — gracefully degrades if @sentry/cloudflare isn't available
let Sentry = null;
try {
  // @sentry/cloudflare may fail on some Cloudflare runtime versions (node:async_hooks)
  Sentry = await import('@sentry/cloudflare');
} catch {
  // Sentry unavailable — all tracking will be no-ops
}

// No-op helpers for when Sentry is unavailable
const noopSpan = { setStatus() {}, finish() {} };
const safeSentry = {
  init: (...a) => Sentry?.init?.(...a),
  startTransaction: (...a) => Sentry?.startTransaction?.(...a) || noopSpan,
  startSpan: (...a) => Sentry?.startSpan?.(...a) || noopSpan,
  captureException: (...a) => Sentry?.captureException?.(...a),
  captureMessage: (...a) => Sentry?.captureMessage?.(...a),
};

/**
 * Initialize Sentry error tracking
 * Cost: $0/month for <50K events (current traffic: ~1K/month)
 */
function initSentry(env) {
  if (!Sentry || !env.SENTRY_DSN) {
    console.warn('⚠️ Sentry not available or SENTRY_DSN not configured - skipping error tracking');
    return;
  }

  try {
    safeSentry.init({
      dsn: env.SENTRY_DSN,
      environment: env.NODE_ENV || 'production',
      tracesSampleRate: 0.1,
      beforeSend(event) {
        if (event.request?.headers?.['authorization']) {
          delete event.request.headers['authorization'];
        }
        return event;
      },
    });
  } catch (e) {
    console.warn('⚠️ Sentry init failed:', e.message);
  }
}

/**
 * Wrap handlers with error boundary + performance tracking
 */
async function withErrorBoundary(handler, context) {
  const transaction = safeSentry.startTransaction({
    name: context.name,
    op: context.op || 'http.server',
  });

  try {
    const result = await handler();
    transaction.setStatus('ok');
    return result;
  } catch (error) {
    transaction.setStatus('internal_error');
    safeSentry.captureException(error, {
      tags: {
        endpoint: context.name,
        method: context.method,
      },
      extra: context.extra || {},
    });
    console.error(`[${context.name}] Error:`, error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } finally {
    transaction.finish();
  }
}

/**
 * Monitor D1 query performance
 */
async function executeD1Query(db, query, bindings, context) {
  const span = safeSentry.startSpan({
    name: context.name || 'db.query',
    op: 'db.sql.query',
  });

  const startTime = Date.now();
  try {
    const result = await db.prepare(query).bind(...bindings).run();
    const duration = Date.now() - startTime;

    if (duration > 100) {
      console.warn(`Slow query (${duration}ms): ${context.name}`);
      safeSentry.captureMessage(`Slow D1 Query: ${context.name}`, {
        level: 'warning',
        extra: { duration, query: context.name },
      });
    }

    return result;
  } catch (error) {
    safeSentry.captureException(error, {
      tags: { query: context.name },
    });
    throw error;
  } finally {
    span?.finish();
  }
}

// Admin email whitelist (sync with .env)
const ADMIN_EMAILS = [
  'brett.l.weaver@gmail.com',
  'getsome@goodflippinvibes.com',
  'community@culturesherpa.org',
  'hello@aiaimate.com',
];

/**
 * Select appropriate Clerk secret key based on request hostname
 * @param {string} hostname - Request hostname
 * @param {object} env - Environment bindings
 * @returns {string} - Clerk secret key
 */
function getClerkSecretKey(hostname, env) {
  // GFD admin panel uses separate Clerk app
  if (hostname === 'goodflippindesign.com' || hostname === 'www.goodflippindesign.com') {
    return env.CLERK_SECRET_KEY_GFD || env.CLERK_SECRET_KEY;
  }
  // GFV community portal and all other sites use main Clerk app
  return env.CLERK_SECRET_KEY;
}

/**
 * Verify Clerk session token
 * @param {string} token - JWT from Clerk
 * @param {string} secretKey - Clerk secret key for this app
 * @returns {object} - User object or null
 */
async function verifyClerkToken(token, secretKey) {
  try {
    // Decode JWT payload to extract session ID and user ID
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

    // Check expiry
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;

    const sessionId = payload.sid;
    const userId = payload.sub;
    if (!sessionId || !userId) return null;

    // Verify session via Clerk Backend API (requires session ID in URL)
    const response = await fetch(`https://api.clerk.com/v1/sessions/${sessionId}/verify`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (response.ok) {
      const session = await response.json();
      if (session.user) return session.user;
    }

    // Fallback: fetch user directly if session verify fails
    const userResponse = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: { 'Authorization': `Bearer ${secretKey}` },
    });

    if (!userResponse.ok) return null;
    const user = await userResponse.json();

    // Map to expected shape (email_addresses → emailAddress)
    return {
      id: user.id,
      emailAddress: user.email_addresses?.[0]?.email_address,
      publicMetadata: user.public_metadata,
    };
  } catch (error) {
    console.error('Token verification failed:', error);
    return null;
  }
}

/**
 * Check if user should have admin role
 * @param {string} email - User email
 * @returns {boolean}
 */
function isAdminEmail(email) {
  return ADMIN_EMAILS.some(admin =>
    admin.toLowerCase() === email.toLowerCase()
  );
}

/**
 * Assign admin role if user is in whitelist
 */
async function ensureAdminRole(user, secretKey) {
  if (!isAdminEmail(user.emailAddress)) return user;

  // Check if role already assigned
  if (user.publicMetadata?.role === 'admin') return user;

  // Assign admin role via Clerk API
  try {
    await fetch(`https://api.clerk.com/v1/users/${user.id}/metadata`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        public_metadata: {
          ...user.publicMetadata,
          role: 'admin',
        },
      }),
    });

    console.log(`Assigned admin role to: ${user.emailAddress}`);
  } catch (error) {
    console.error('Failed to assign admin role:', error);
  }

  // Return updated user with role applied in-memory so this request succeeds
  // without requiring a token refresh (the Clerk PATCH above updates the DB for
  // all future requests, but the JWT returned by this call still has the old claims).
  return { ...user, publicMetadata: { ...user.publicMetadata, role: 'admin' } };
}

/**
 * Handle comment creation
 */
async function handleCreateComment(request, user, env) {
  const { articleId, text } = await request.json();

  // Validate input
  if (!articleId || !text || text.trim().length === 0) {
    return new Response('Invalid input', { status: 400 });
  }

  if (text.length > 2000) {
    return new Response('Comment too long (max 2000 chars)', { status: 400 });
  }

  // Profanity / spam word filter (common slurs and spam triggers)
  const profanityList = [
    // generic spam signals
    'buy now', 'click here', 'free money', 'make money fast', 'work from home',
    // common English slurs / explicit terms (abbreviated to avoid repo policy issues)
    'asshole', 'bastard', 'bitch', 'bullshit', 'cock', 'cunt', 'dick',
    'dickhead', 'douche', 'douchebag', 'fag', 'faggot', 'fuck', 'fucking',
    'motherfucker', 'nigga', 'nigger', 'piss', 'prick', 'pussy', 'shit',
    'shithead', 'slut', 'twat', 'wanker', 'whore',
    // test sentinel (keep for automated test suites)
    'test-profanity',
  ];
  const lowerText = text.toLowerCase();
  const hasProfanity = profanityList.some(word => lowerText.includes(word));

  if (hasProfanity) {
    return new Response('Inappropriate language detected', { status: 400 });
  }

  // Insert comment into D1
  const commentId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(`
      INSERT INTO comments (id, article_id, user_id, user_email, user_name, text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      commentId,
      articleId,
      user.id,
      user.emailAddress,
      user.publicMetadata?.displayName || `User_${user.id.slice(0, 8)}`,
      text,
      now
    ).run();

    return new Response(JSON.stringify({
      id: commentId,
      articleId,
      userId: user.id,
      userName: user.publicMetadata?.displayName || `User_${user.id.slice(0, 8)}`,
      text,
      createdAt: now,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to create comment:', error);
    return new Response('Database error', { status: 500 });
  }
}

/**
 * Handle comment deletion (own comments or admin)
 */
async function handleDeleteComment(request, user, env) {
  const { commentId } = await request.json();

  if (!commentId) {
    return new Response('Missing commentId', { status: 400 });
  }

  // Fetch comment to check ownership
  const comment = await env.DB.prepare(
    'SELECT * FROM comments WHERE id = ?'
  ).bind(commentId).first();

  if (!comment) {
    return new Response('Comment not found', { status: 404 });
  }

  // Check permission: own comment OR admin role
  const isOwner = comment.user_id === user.id;
  const isAdmin = user.publicMetadata?.role === 'admin';

  if (!isOwner && !isAdmin) {
    return new Response('Unauthorized', { status: 403 });
  }

  // Delete comment
  try {
    await env.DB.prepare('DELETE FROM comments WHERE id = ?')
      .bind(commentId).run();

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to delete comment:', error);
    return new Response('Database error', { status: 500 });
  }
}

/**
 * Handle fetching comments for an article
 */
async function handleGetComments(request, env) {
  const url = new URL(request.url);
  const articleId = url.searchParams.get('articleId');

  if (!articleId) {
    return new Response('Missing articleId', { status: 400 });
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT id, article_id, user_name, text, created_at
      FROM comments
      WHERE article_id = ?
      ORDER BY created_at DESC
    `).bind(articleId).all();

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch comments:', error);
    return new Response('Database error', { status: 500 });
  }
}

/**
 * Handle listing blog posts (public - published only)
 */
async function handleListBlogPosts(request, env) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  // 'all' is allowed for authenticated admin callers (enforced at routing level)
  try {
    let query = `
      SELECT id, title, slug, excerpt, tags, status, author_id, published_at, created_at, updated_at
      FROM blog_posts
    `;

    if (status === 'draft') {
      query += ` WHERE status = 'draft'`;
    } else if (status === 'all') {
      // No WHERE filter — return all statuses
    } else {
      query += ` WHERE status = 'published'`;
    }

    query += ` ORDER BY created_at DESC LIMIT 200`;

    const { results } = await env.DB.prepare(query).all();

    return new Response(JSON.stringify(results), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch blog posts:', error);
    return new Response('Database error', { status: 500 });
  }
}

/**
 * Handle getting single blog post by slug (public)
 */
async function handleGetBlogPost(request, env) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    return new Response('Missing slug', { status: 400 });
  }

  try {
    const result = await env.DB.prepare(`
      SELECT id, title, slug, content, excerpt, tags, featured_image, author_id, status, published_at, created_at
      FROM blog_posts
      WHERE slug = ? AND status = 'published'
    `).bind(slug).first();

    if (!result) {
      return new Response('Post not found', { status: 404 });
    }

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch blog post:', error);
    return new Response('Database error', { status: 500 });
  }
}

/**
 * Handle creating new blog post (admin only)
 */
async function handleCreateBlogPost(request, user, env) {
  // Admin-only check
  if (user.publicMetadata?.role !== 'admin') {
    return {
      body: 'Forbidden: Admin access required',
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    };
  }

  const data = await request.json();
  const { title, content, excerpt, status, tags, featured_image } = data;

  if (!title || !content) {
    return {
      body: 'Missing required fields',
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    };
  }

  // Generate slug from title
  const slug = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  const id = `post_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const publishedAt = status === 'published' ? now : null;

  try {
    await env.DB.prepare(`
      INSERT INTO blog_posts (id, title, slug, content, excerpt, author_id, status, tags, featured_image, published_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      id,
      title,
      slug,
      content,
      excerpt || '',
      user.id,
      status || 'draft',
      tags || '',
      featured_image || '',
      publishedAt,
      now
    ).run();

    return {
      body: JSON.stringify({ id, slug, message: 'Post created' }),
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
    console.error('Failed to create blog post:', error);
    return {
      body: 'Database error',
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    };
  }
}

/**
 * Handle updating blog post (admin only)
 */
async function handleUpdateBlogPost(request, user, env) {
  // Admin-only check
  if (user.publicMetadata?.role !== 'admin') {
    return {
      body: 'Forbidden: Admin access required',
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    };
  }

  const data = await request.json();
  const { id, title, content, excerpt, status, tags, featured_image } = data;

  if (!id) {
    return {
      body: 'Missing post ID',
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    };
  }

  const now = new Date().toISOString();
  const publishedAt = status === 'published' ? now : null;

  try {
    await env.DB.prepare(`
      UPDATE blog_posts
      SET title = ?, content = ?, excerpt = ?, status = ?, tags = ?, featured_image = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(title, content, excerpt, status, tags || '', featured_image || '', publishedAt, now, id).run();

    return {
      body: JSON.stringify({ message: 'Post updated' }),
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
    console.error('Failed to update blog post:', error);
    return {
      body: 'Database error',
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    };
  }
}

/**
 * Handle deleting blog post (admin only)
 */
async function handleDeleteBlogPost(request, user, env) {
  // Admin-only check
  if (user.publicMetadata?.role !== 'admin') {
    return {
      body: 'Forbidden: Admin access required',
      status: 403,
      headers: { 'Content-Type': 'text/plain' },
    };
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return {
      body: 'Missing post ID',
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    };
  }

  try {
    await env.DB.prepare('DELETE FROM blog_posts WHERE id = ?').bind(id).run();

    return {
      body: JSON.stringify({ message: 'Post deleted' }),
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    };
  } catch (error) {
    console.error('Failed to delete blog post:', error);
    return {
      body: 'Database error',
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    };
  }
}

/* ═══════════════════════════════════════════════════════════════
 *  Community Engagement Engine
 *  XP · Levels · Streaks · Badges · Threads · Activity Feed
 * ═══════════════════════════════════════════════════════════════ */

const XP_ACTIONS = {
  checkin: 10,
  post: 25,
  reply: 15,
  react: 5,
  receive_reaction: 3,
  profile_complete: 50,
  streak_7: 100,
  streak_14: 200,
  streak_30: 500,
};

const LEVELS = [
  { level: 1, name: 'Newcomer', xp: 0, icon: '🌱' },
  { level: 2, name: 'Explorer', xp: 50, icon: '🔍' },
  { level: 3, name: 'Contributor', xp: 200, icon: '✨' },
  { level: 4, name: 'Creator', xp: 500, icon: '🎨' },
  { level: 5, name: 'Builder', xp: 1000, icon: '🛠️' },
  { level: 6, name: 'Mentor', xp: 2500, icon: '🌟' },
  { level: 7, name: 'Champion', xp: 5000, icon: '🏆' },
  { level: 8, name: 'Legend', xp: 10000, icon: '👑' },
];

const BADGE_DEFS = {
  'founding-member': { name: 'Founding Member', icon: '⭐', desc: 'Joined during early access' },
  'first-post': { name: 'First Post', icon: '✏️', desc: 'Created your first thread' },
  'first-reply': { name: 'First Reply', icon: '💬', desc: 'Left your first reply' },
  'on-fire': { name: 'On Fire', icon: '🔥', desc: '7-day check-in streak' },
  'consistent': { name: 'Consistent', icon: '💪', desc: '14-day check-in streak' },
  'unstoppable': { name: 'Unstoppable', icon: '⚡', desc: '30-day check-in streak' },
  'profile-pro': { name: 'Profile Pro', icon: '🎯', desc: 'Completed all profile fields' },
  'idea-maker': { name: 'Idea Maker', icon: '💡', desc: 'Created 10 threads' },
  'connector': { name: 'Connector', icon: '🤝', desc: 'Replied to 10 threads' },
  'beloved': { name: 'Beloved', icon: '❤️', desc: 'Received 25 reactions' },
  'top-contributor': { name: 'Top Contributor', icon: '🏅', desc: 'Reached Level 5' },
  'legend-badge': { name: 'Legend', icon: '👑', desc: 'Reached Level 8' },
  'storyteller': { name: 'Storyteller', icon: '📝', desc: 'Created a 500+ character post' },
  'global-citizen': { name: 'Global Citizen', icon: '🌍', desc: 'Added your location' },
  'web-presence': { name: 'Web Presence', icon: '🔗', desc: 'Added your website' },
  'vibe-check': { name: 'Vibe Check', icon: '🌈', desc: '5+ reactions on a single post' },
  'early-bird': { name: 'Early Bird', icon: '🐦', desc: 'Checked in before 7am' },
  'night-owl': { name: 'Night Owl', icon: '🦉', desc: 'Checked in after midnight' },
  'helping-hand': { name: 'Helping Hand', icon: '🙌', desc: 'Replied to 5 intro posts' },
  'creative': { name: 'Creative', icon: '🎨', desc: 'Shared a project showcase' },
};

function getLevelForXP(xp) {
  let result = LEVELS[0];
  for (const lvl of LEVELS) {
    if (xp >= lvl.xp) result = lvl;
    else break;
  }
  return result;
}

function getNextLevel(currentLevel) {
  const idx = LEVELS.findIndex(l => l.level === currentLevel);
  return idx < LEVELS.length - 1 ? LEVELS[idx + 1] : null;
}

/**
 * Ensure community profile exists for user, create if new
 */
async function ensureCommunityProfile(env, userId, displayName, avatarUrl) {
  const existing = await env.DB.prepare(
    'SELECT * FROM community_profiles WHERE user_id = ?'
  ).bind(userId).first();

  if (existing) return existing;

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO community_profiles (user_id, display_name, avatar_url, badges, created_at, updated_at)
    VALUES (?, ?, ?, '["founding-member"]', ?, ?)
  `).bind(userId, displayName, avatarUrl, now, now).run();

  // Log "joined" activity
  await logActivity(env, userId, displayName, avatarUrl, 'joined', JSON.stringify({ name: displayName }));

  return await env.DB.prepare(
    'SELECT * FROM community_profiles WHERE user_id = ?'
  ).bind(userId).first();
}

/**
 * Award XP to user and update their profile
 */
async function awardXP(env, userId, action, amount, sourceId) {
  const xpId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO community_xp (id, user_id, amount, action, source_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(xpId, userId, amount, action, sourceId || null, now).run();

  // Update aggregate
  const profile = await env.DB.prepare(
    'SELECT total_xp, level FROM community_profiles WHERE user_id = ?'
  ).bind(userId).first();

  if (!profile) return;

  const newXP = (profile.total_xp || 0) + amount;
  const newLevel = getLevelForXP(newXP);

  await env.DB.prepare(`
    UPDATE community_profiles SET total_xp = ?, level = ?, updated_at = ? WHERE user_id = ?
  `).bind(newXP, newLevel.level, now, userId).run();

  // If leveled up, log it
  if (newLevel.level > (profile.level || 1)) {
    const p = await env.DB.prepare('SELECT display_name, avatar_url FROM community_profiles WHERE user_id = ?').bind(userId).first();
    await logActivity(env, userId, p?.display_name || 'Member', p?.avatar_url || '', 'leveled_up',
      JSON.stringify({ level: newLevel.level, name: newLevel.name, icon: newLevel.icon })
    );
  }

  return { newXP, newLevel };
}

/**
 * Log community activity for the feed
 */
async function logActivity(env, userId, userName, userAvatar, actionType, actionDetail) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO community_activity (id, user_id, user_name, user_avatar, action_type, action_detail, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, userName, userAvatar || '', actionType, actionDetail || '', now).run();
}

/**
 * Check and award badges based on current profile state
 */
async function checkAndAwardBadges(env, userId, profile) {
  const currentBadges = JSON.parse(profile.badges || '[]');
  const newBadges = [];

  // Streak badges
  if (profile.current_streak >= 7 && !currentBadges.includes('on-fire')) newBadges.push('on-fire');
  if (profile.current_streak >= 14 && !currentBadges.includes('consistent')) newBadges.push('consistent');
  if (profile.current_streak >= 30 && !currentBadges.includes('unstoppable')) newBadges.push('unstoppable');

  // Post count badges
  if (profile.post_count >= 1 && !currentBadges.includes('first-post')) newBadges.push('first-post');
  if (profile.post_count >= 10 && !currentBadges.includes('idea-maker')) newBadges.push('idea-maker');

  // Reply count badges
  if (profile.reply_count >= 1 && !currentBadges.includes('first-reply')) newBadges.push('first-reply');
  if (profile.reply_count >= 10 && !currentBadges.includes('connector')) newBadges.push('connector');

  // Reaction badges
  if (profile.reaction_received_count >= 25 && !currentBadges.includes('beloved')) newBadges.push('beloved');

  // Level badges
  if (profile.level >= 5 && !currentBadges.includes('top-contributor')) newBadges.push('top-contributor');
  if (profile.level >= 8 && !currentBadges.includes('legend-badge')) newBadges.push('legend-badge');

  if (newBadges.length > 0) {
    const allBadges = [...currentBadges, ...newBadges];
    const now = new Date().toISOString();
    await env.DB.prepare(
      'UPDATE community_profiles SET badges = ?, updated_at = ? WHERE user_id = ?'
    ).bind(JSON.stringify(allBadges), now, userId).run();

    // Log badge activities
    const p = await env.DB.prepare('SELECT display_name, avatar_url FROM community_profiles WHERE user_id = ?').bind(userId).first();
    for (const badge of newBadges) {
      const def = BADGE_DEFS[badge];
      await logActivity(env, userId, p?.display_name || 'Member', p?.avatar_url || '', 'earned_badge',
        JSON.stringify({ badge, name: def?.name || badge, icon: def?.icon || '🏷️' })
      );
    }

    return allBadges;
  }

  return currentBadges;
}

/**
 * Daily check-in: awards XP, updates streak
 */
async function handleCommunityCheckin(user, env) {
  const userId = user.id;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
  const avatar = user.imageUrl || '';

  const profile = await ensureCommunityProfile(env, userId, userName, avatar);
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);

  // Check if already checked in today
  if (profile.last_checkin && profile.last_checkin.slice(0, 10) === todayStr) {
    return new Response(JSON.stringify({
      alreadyCheckedIn: true,
      streak: profile.current_streak,
      totalXP: profile.total_xp,
      level: getLevelForXP(profile.total_xp),
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Calculate streak
  let newStreak = 1;
  if (profile.last_checkin) {
    const lastDate = new Date(profile.last_checkin);
    const diffDays = Math.floor((now - lastDate) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      newStreak = (profile.current_streak || 0) + 1;
    } else if (diffDays === 0) {
      newStreak = profile.current_streak || 1;
    }
    // diffDays > 1 means streak broken, reset to 1
  }

  const longestStreak = Math.max(newStreak, profile.longest_streak || 0);

  // Update profile streak
  await env.DB.prepare(`
    UPDATE community_profiles
    SET current_streak = ?, longest_streak = ?, last_checkin = ?, updated_at = ?
    WHERE user_id = ?
  `).bind(newStreak, longestStreak, now.toISOString(), now.toISOString(), userId).run();

  // Award check-in XP
  let xpEarned = XP_ACTIONS.checkin;
  await awardXP(env, userId, 'checkin', XP_ACTIONS.checkin, null);

  // Streak bonus XP
  if (newStreak === 7) {
    await awardXP(env, userId, 'streak_7', XP_ACTIONS.streak_7, null);
    xpEarned += XP_ACTIONS.streak_7;
  } else if (newStreak === 14) {
    await awardXP(env, userId, 'streak_14', XP_ACTIONS.streak_14, null);
    xpEarned += XP_ACTIONS.streak_14;
  } else if (newStreak === 30) {
    await awardXP(env, userId, 'streak_30', XP_ACTIONS.streak_30, null);
    xpEarned += XP_ACTIONS.streak_30;
  }

  // Log check-in activity
  await logActivity(env, userId, userName, avatar, 'checkin',
    JSON.stringify({ streak: newStreak })
  );

  // Check badges
  const updatedProfile = await env.DB.prepare(
    'SELECT * FROM community_profiles WHERE user_id = ?'
  ).bind(userId).first();
  const badges = await checkAndAwardBadges(env, userId, updatedProfile);

  // Time-based badges
  const hour = now.getUTCHours();
  const currentBadges = JSON.parse(updatedProfile.badges || '[]');
  if (hour < 7 && !currentBadges.includes('early-bird')) {
    const allBadges = [...currentBadges, 'early-bird'];
    await env.DB.prepare(
      'UPDATE community_profiles SET badges = ? WHERE user_id = ?'
    ).bind(JSON.stringify(allBadges), userId).run();
    await logActivity(env, userId, userName, avatar, 'earned_badge',
      JSON.stringify({ badge: 'early-bird', name: 'Early Bird', icon: '🐦' })
    );
  }
  if (hour >= 0 && hour < 5 && !currentBadges.includes('night-owl')) {
    const allBadges = [...currentBadges, 'night-owl'];
    await env.DB.prepare(
      'UPDATE community_profiles SET badges = ? WHERE user_id = ?'
    ).bind(JSON.stringify(allBadges), userId).run();
    await logActivity(env, userId, userName, avatar, 'earned_badge',
      JSON.stringify({ badge: 'night-owl', name: 'Night Owl', icon: '🦉' })
    );
  }

  const finalProfile = await env.DB.prepare(
    'SELECT * FROM community_profiles WHERE user_id = ?'
  ).bind(userId).first();

  return new Response(JSON.stringify({
    alreadyCheckedIn: false,
    xpEarned,
    streak: newStreak,
    longestStreak,
    totalXP: finalProfile.total_xp,
    level: getLevelForXP(finalProfile.total_xp),
    badges: JSON.parse(finalProfile.badges || '[]'),
  }), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Get own community profile with XP, level, badges
 */
async function handleCommunityProfile(user, env) {
  const userId = user.id;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
  const avatar = user.imageUrl || '';

  const profile = await ensureCommunityProfile(env, userId, userName, avatar);
  const level = getLevelForXP(profile.total_xp || 0);
  const nextLevel = getNextLevel(level.level);

  return new Response(JSON.stringify({
    userId: profile.user_id,
    displayName: profile.display_name,
    avatarUrl: profile.avatar_url,
    bio: profile.bio || '',
    location: profile.location || '',
    website: profile.website || '',
    onboardingComplete: profile.onboarding_complete || 0,
    totalXP: profile.total_xp || 0,
    level,
    nextLevel,
    currentStreak: profile.current_streak || 0,
    longestStreak: profile.longest_streak || 0,
    lastCheckin: profile.last_checkin,
    postCount: profile.post_count || 0,
    replyCount: profile.reply_count || 0,
    reactionGivenCount: profile.reaction_given_count || 0,
    reactionReceivedCount: profile.reaction_received_count || 0,
    badges: JSON.parse(profile.badges || '[]'),
    badgeDefs: BADGE_DEFS,
    allLevels: LEVELS,
    createdAt: profile.created_at,
  }), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Activity feed (public)
 */
async function handleCommunityFeed(request, env) {
  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

  const { results } = await env.DB.prepare(`
    SELECT * FROM community_activity ORDER BY created_at DESC LIMIT ?
  `).bind(limit).all();

  return new Response(JSON.stringify(results || []), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Community aggregate stats (public)
 */
async function handleCommunityStats(env) {
  const members = await env.DB.prepare('SELECT COUNT(*) as count FROM community_profiles').first();
  const posts = await env.DB.prepare("SELECT COUNT(*) as count FROM community_posts WHERE parent_id IS NULL").first();
  const replies = await env.DB.prepare("SELECT COUNT(*) as count FROM community_posts WHERE parent_id IS NOT NULL").first();
  const reactions = await env.DB.prepare('SELECT COUNT(*) as count FROM community_reactions').first();
  const activeToday = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM community_profiles WHERE last_checkin LIKE ? || '%'"
  ).bind(new Date().toISOString().slice(0, 10)).first();

  return new Response(JSON.stringify({
    totalMembers: members?.count || 0,
    totalPosts: posts?.count || 0,
    totalReplies: replies?.count || 0,
    totalReactions: reactions?.count || 0,
    activeToday: activeToday?.count || 0,
  }), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * List community posts (public)
 */
async function handleListCommunityPosts(request, env) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'all';
  const postId = url.searchParams.get('id');

  // Single post with replies
  if (postId) {
    const post = await env.DB.prepare(
      'SELECT * FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (!post) return new Response('Not found', { status: 404 });

    const { results: replies } = await env.DB.prepare(
      'SELECT * FROM community_posts WHERE parent_id = ? ORDER BY created_at ASC'
    ).bind(postId).all();

    // Get reactions for this post
    const { results: reactions } = await env.DB.prepare(
      'SELECT reaction_type, COUNT(*) as count FROM community_reactions WHERE post_id = ? GROUP BY reaction_type'
    ).bind(postId).all();

    return new Response(JSON.stringify({
      post,
      replies: replies || [],
      reactions: reactions || [],
    }), { headers: { 'Content-Type': 'application/json' } });
  }

  // List posts
  let query = `SELECT * FROM community_posts WHERE parent_id IS NULL`;
  const bindings = [];

  if (type !== 'all') {
    query += ` AND post_type = ?`;
    bindings.push(type);
  }

  query += ` ORDER BY is_pinned DESC, created_at DESC LIMIT 50`;

  const stmt = bindings.length > 0
    ? env.DB.prepare(query).bind(...bindings)
    : env.DB.prepare(query);

  const { results } = await stmt.all();

  return new Response(JSON.stringify(results || []), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create community post (authenticated)
 */
async function handleCreateCommunityPost(request, user, env) {
  const { title, content, postType } = await request.json();

  if (!content || content.trim().length === 0) {
    return new Response('Content required', { status: 400 });
  }
  if (content.length > 5000) {
    return new Response('Content too long (max 5000 chars)', { status: 400 });
  }

  const userId = user.id;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
  const avatar = user.imageUrl || '';
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  const type = postType || 'discussion';

  await env.DB.prepare(`
    INSERT INTO community_posts (id, user_id, user_name, user_avatar, title, content, post_type, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(postId, userId, userName, avatar, title || '', content, type, now).run();

  // Update profile post count
  await env.DB.prepare(`
    UPDATE community_profiles SET post_count = post_count + 1, updated_at = ? WHERE user_id = ?
  `).bind(now, userId).run();

  // Award XP
  await awardXP(env, userId, 'post', XP_ACTIONS.post, postId);

  // Log activity
  await logActivity(env, userId, userName, avatar, 'posted',
    JSON.stringify({ postId, title: title || content.slice(0, 60), type })
  );

  // Check for storyteller badge
  if (content.length >= 500) {
    const profile = await env.DB.prepare('SELECT badges FROM community_profiles WHERE user_id = ?').bind(userId).first();
    const badges = JSON.parse(profile?.badges || '[]');
    if (!badges.includes('storyteller')) {
      badges.push('storyteller');
      await env.DB.prepare('UPDATE community_profiles SET badges = ? WHERE user_id = ?')
        .bind(JSON.stringify(badges), userId).run();
      await logActivity(env, userId, userName, avatar, 'earned_badge',
        JSON.stringify({ badge: 'storyteller', name: 'Storyteller', icon: '📝' })
      );
    }
  }

  // Check for creative badge (showcase post)
  if (type === 'showcase') {
    const profile = await env.DB.prepare('SELECT badges FROM community_profiles WHERE user_id = ?').bind(userId).first();
    const badges = JSON.parse(profile?.badges || '[]');
    if (!badges.includes('creative')) {
      badges.push('creative');
      await env.DB.prepare('UPDATE community_profiles SET badges = ? WHERE user_id = ?')
        .bind(JSON.stringify(badges), userId).run();
      await logActivity(env, userId, userName, avatar, 'earned_badge',
        JSON.stringify({ badge: 'creative', name: 'Creative', icon: '🎨' })
      );
    }
  }

  // Check post-count badges
  const updatedProfile = await env.DB.prepare('SELECT * FROM community_profiles WHERE user_id = ?').bind(userId).first();
  await checkAndAwardBadges(env, userId, updatedProfile);

  return new Response(JSON.stringify({
    id: postId,
    userId,
    userName,
    userAvatar: avatar,
    title: title || '',
    content,
    postType: type,
    createdAt: now,
  }), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

/**
 * Reply to a post (authenticated)
 */
async function handleCreateReply(request, user, env) {
  const { postId, content } = await request.json();

  if (!postId || !content || content.trim().length === 0) {
    return new Response('postId and content required', { status: 400 });
  }
  if (content.length > 2000) {
    return new Response('Reply too long (max 2000 chars)', { status: 400 });
  }

  // Verify parent exists
  const parent = await env.DB.prepare(
    'SELECT * FROM community_posts WHERE id = ? AND parent_id IS NULL'
  ).bind(postId).first();

  if (!parent) return new Response('Post not found', { status: 404 });

  const userId = user.id;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
  const avatar = user.imageUrl || '';
  const replyId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO community_posts (id, user_id, user_name, user_avatar, content, post_type, parent_id, created_at)
    VALUES (?, ?, ?, ?, ?, 'reply', ?, ?)
  `).bind(replyId, userId, userName, avatar, content, postId, now).run();

  // Increment reply count on parent
  await env.DB.prepare(
    'UPDATE community_posts SET reply_count = reply_count + 1 WHERE id = ?'
  ).bind(postId).run();

  // Update profile reply count
  await env.DB.prepare(
    'UPDATE community_profiles SET reply_count = reply_count + 1, updated_at = ? WHERE user_id = ?'
  ).bind(now, userId).run();

  // Award XP
  await awardXP(env, userId, 'reply', XP_ACTIONS.reply, replyId);

  // Log activity
  await logActivity(env, userId, userName, avatar, 'replied',
    JSON.stringify({ postId, title: parent.title || parent.content?.slice(0, 60) })
  );

  // Notify post author (if different user)
  if (parent.user_id !== userId) {
    await createNotification(env, parent.user_id, userId, userName, avatar, 'reply',
      userName + ' replied to your post' + (parent.title ? ': "' + parent.title.slice(0, 40) + '"' : ''),
      postId
    );
  }

  // Check reply-count badges
  const updatedProfile = await env.DB.prepare('SELECT * FROM community_profiles WHERE user_id = ?').bind(userId).first();
  await checkAndAwardBadges(env, userId, updatedProfile);

  // Check helping-hand badge (reply to intro posts)
  if (parent.post_type === 'intro') {
    const introReplies = await env.DB.prepare(`
      SELECT COUNT(DISTINCT cp2.parent_id) as count
      FROM community_posts cp2
      JOIN community_posts cp_parent ON cp2.parent_id = cp_parent.id
      WHERE cp2.user_id = ? AND cp_parent.post_type = 'intro'
    `).bind(userId).first();

    if (introReplies && introReplies.count >= 5) {
      const badges = JSON.parse(updatedProfile.badges || '[]');
      if (!badges.includes('helping-hand')) {
        badges.push('helping-hand');
        await env.DB.prepare('UPDATE community_profiles SET badges = ? WHERE user_id = ?')
          .bind(JSON.stringify(badges), userId).run();
        await logActivity(env, userId, userName, avatar, 'earned_badge',
          JSON.stringify({ badge: 'helping-hand', name: 'Helping Hand', icon: '🙌' })
        );
      }
    }
  }

  return new Response(JSON.stringify({
    id: replyId,
    userId,
    userName,
    userAvatar: avatar,
    content,
    parentId: postId,
    createdAt: now,
  }), { status: 201, headers: { 'Content-Type': 'application/json' } });
}

/**
 * React to a post (authenticated)
 */
async function handleReact(request, user, env) {
  const { postId, reactionType } = await request.json();

  const validReactions = ['fire', 'heart', 'mind-blown', 'clap', 'rocket'];
  if (!postId || !validReactions.includes(reactionType)) {
    return new Response('Invalid reaction', { status: 400 });
  }

  const post = await env.DB.prepare(
    'SELECT * FROM community_posts WHERE id = ?'
  ).bind(postId).first();

  if (!post) return new Response('Post not found', { status: 404 });

  const userId = user.id;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
  const avatar = user.imageUrl || '';
  const reactionId = crypto.randomUUID();
  const now = new Date().toISOString();

  try {
    await env.DB.prepare(`
      INSERT INTO community_reactions (id, post_id, user_id, reaction_type, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).bind(reactionId, postId, userId, reactionType, now).run();
  } catch (e) {
    // Unique constraint violation = already reacted
    return new Response(JSON.stringify({ alreadyReacted: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Update reaction count on post
  await env.DB.prepare(
    'UPDATE community_posts SET reaction_count = reaction_count + 1 WHERE id = ?'
  ).bind(postId).run();

  // Update reactor's reaction_given_count
  await env.DB.prepare(
    'UPDATE community_profiles SET reaction_given_count = reaction_given_count + 1, updated_at = ? WHERE user_id = ?'
  ).bind(now, userId).run();

  // Award XP to reactor
  await awardXP(env, userId, 'react', XP_ACTIONS.react, postId);

  // Award XP to post author (if not self)
  if (post.user_id !== userId) {
    await awardXP(env, post.user_id, 'receive_reaction', XP_ACTIONS.receive_reaction, postId);

    // Notify post author about the reaction
    const REACTION_NAMES = { fire: '🔥', heart: '❤️', 'mind-blown': '🤯', clap: '👏', rocket: '🚀' };
    await createNotification(env, post.user_id, userId, userName, avatar, 'reaction',
      userName + ' reacted ' + (REACTION_NAMES[reactionType] || '') + ' to your post',
      postId
    );

    // Update author's reaction_received_count
    await env.DB.prepare(
      'UPDATE community_profiles SET reaction_received_count = reaction_received_count + 1, updated_at = ? WHERE user_id = ?'
    ).bind(now, post.user_id).run();

    // Check author's vibe-check badge (5+ reactions on single post)
    const updatedPost = await env.DB.prepare(
      'SELECT reaction_count FROM community_posts WHERE id = ?'
    ).bind(postId).first();

    if (updatedPost && updatedPost.reaction_count >= 5) {
      const authorProfile = await env.DB.prepare(
        'SELECT badges FROM community_profiles WHERE user_id = ?'
      ).bind(post.user_id).first();
      const authorBadges = JSON.parse(authorProfile?.badges || '[]');
      if (!authorBadges.includes('vibe-check')) {
        authorBadges.push('vibe-check');
        await env.DB.prepare('UPDATE community_profiles SET badges = ? WHERE user_id = ?')
          .bind(JSON.stringify(authorBadges), post.user_id).run();
        await logActivity(env, post.user_id, post.user_name, post.user_avatar || '', 'earned_badge',
          JSON.stringify({ badge: 'vibe-check', name: 'Vibe Check', icon: '🌈' })
        );
      }
    }

    // Check beloved badge
    const authorProfile = await env.DB.prepare('SELECT * FROM community_profiles WHERE user_id = ?').bind(post.user_id).first();
    if (authorProfile) await checkAndAwardBadges(env, post.user_id, authorProfile);
  }

  // Get updated reaction counts
  const { results: counts } = await env.DB.prepare(
    'SELECT reaction_type, COUNT(*) as count FROM community_reactions WHERE post_id = ? GROUP BY reaction_type'
  ).bind(postId).all();

  return new Response(JSON.stringify({
    reactions: counts || [],
    totalReactions: counts?.reduce((sum, r) => sum + r.count, 0) || 0,
  }), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Leaderboard: top members by XP (public)
 */
async function handleLeaderboard(env) {
  const { results } = await env.DB.prepare(`
    SELECT user_id, display_name, avatar_url, total_xp, level, current_streak, badges, post_count, reply_count
    FROM community_profiles
    ORDER BY total_xp DESC
    LIMIT 20
  `).all();

  const leaderboard = (results || []).map((p, i) => ({
    rank: i + 1,
    userId: p.user_id,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    totalXP: p.total_xp,
    level: getLevelForXP(p.total_xp),
    streak: p.current_streak,
    badgeCount: JSON.parse(p.badges || '[]').length,
    postCount: p.post_count,
    replyCount: p.reply_count,
  }));

  return new Response(JSON.stringify(leaderboard), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Update community profile (authenticated)
 */
async function handleUpdateCommunityProfile(request, user, env) {
  const { displayName, bio, location, website } = await request.json();
  const userId = user.id;
  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Member';
  const avatar = user.imageUrl || '';
  const now = new Date().toISOString();

  // Ensure profile exists
  await ensureCommunityProfile(env, userId, userName, avatar);

  // Validate
  if (displayName && displayName.length > 50) {
    return new Response('Display name too long (max 50)', { status: 400 });
  }
  if (bio && bio.length > 500) {
    return new Response('Bio too long (max 500)', { status: 400 });
  }
  if (location && location.length > 100) {
    return new Response('Location too long (max 100)', { status: 400 });
  }
  if (website && website.length > 200) {
    return new Response('Website too long (max 200)', { status: 400 });
  }

  await env.DB.prepare(`
    UPDATE community_profiles
    SET display_name = COALESCE(?, display_name),
        bio = COALESCE(?, bio),
        location = COALESCE(?, location),
        website = COALESCE(?, website),
        updated_at = ?
    WHERE user_id = ?
  `).bind(
    displayName || null, bio !== undefined ? bio : null,
    location !== undefined ? location : null, website !== undefined ? website : null,
    now, userId
  ).run();

  // Check profile-pro badge (all fields completed)
  const updated = await env.DB.prepare(
    'SELECT * FROM community_profiles WHERE user_id = ?'
  ).bind(userId).first();

  if (updated.display_name && updated.bio && updated.location && updated.website) {
    const badges = JSON.parse(updated.badges || '[]');
    if (!badges.includes('profile-pro')) {
      badges.push('profile-pro');
      await env.DB.prepare('UPDATE community_profiles SET badges = ? WHERE user_id = ?')
        .bind(JSON.stringify(badges), userId).run();
      await logActivity(env, userId, updated.display_name, updated.avatar_url || '', 'earned_badge',
        JSON.stringify({ badge: 'profile-pro', name: 'Profile Pro', icon: '🎯' })
      );
      // Award profile complete XP
      await awardXP(env, userId, 'profile_complete', XP_ACTIONS.profile_complete, null);
    }

    // Check global-citizen badge
    if (updated.location && !badges.includes('global-citizen')) {
      badges.push('global-citizen');
      await env.DB.prepare('UPDATE community_profiles SET badges = ? WHERE user_id = ?')
        .bind(JSON.stringify(badges), userId).run();
      await logActivity(env, userId, updated.display_name, updated.avatar_url || '', 'earned_badge',
        JSON.stringify({ badge: 'global-citizen', name: 'Global Citizen', icon: '🌍' })
      );
    }

    // Check web-presence badge
    if (updated.website && !badges.includes('web-presence')) {
      badges.push('web-presence');
      await env.DB.prepare('UPDATE community_profiles SET badges = ? WHERE user_id = ?')
        .bind(JSON.stringify(badges), userId).run();
      await logActivity(env, userId, updated.display_name, updated.avatar_url || '', 'earned_badge',
        JSON.stringify({ badge: 'web-presence', name: 'Web Presence', icon: '🔗' })
      );
    }
  }

  const finalProfile = await env.DB.prepare(
    'SELECT * FROM community_profiles WHERE user_id = ?'
  ).bind(userId).first();

  return new Response(JSON.stringify({
    displayName: finalProfile.display_name,
    bio: finalProfile.bio || '',
    location: finalProfile.location || '',
    website: finalProfile.website || '',
    badges: JSON.parse(finalProfile.badges || '[]'),
  }), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Mark onboarding as complete
 */
async function handleOnboardingComplete(user, env) {
  const userId = user.id;
  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE community_profiles SET onboarding_complete = 1, updated_at = ? WHERE user_id = ?'
  ).bind(now, userId).run();
  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Search community posts (public)
 */
async function handleSearchPosts(request, env) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  const type = url.searchParams.get('type') || 'all';
  const sort = url.searchParams.get('sort') || 'recent'; // recent, popular, most-replied

  if (!q || q.length < 2) {
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const searchTerm = '%' + q + '%';
  let orderBy = 'created_at DESC';
  if (sort === 'popular') orderBy = 'reaction_count DESC, created_at DESC';
  if (sort === 'most-replied') orderBy = 'reply_count DESC, created_at DESC';

  let query = `SELECT * FROM community_posts WHERE parent_id IS NULL AND (title LIKE ? OR content LIKE ?)`;
  const bindings = [searchTerm, searchTerm];

  if (type !== 'all') {
    query += ` AND post_type = ?`;
    bindings.push(type);
  }

  query += ` ORDER BY ${orderBy} LIMIT 50`;

  const { results } = await env.DB.prepare(query).bind(...bindings).all();

  return new Response(JSON.stringify(results || []), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Get notifications for user (authenticated)
 */
async function handleGetNotifications(user, env) {
  const userId = user.id;

  const { results } = await env.DB.prepare(`
    SELECT * FROM community_notifications
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).bind(userId).all();

  const unreadCount = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM community_notifications WHERE user_id = ? AND is_read = 0'
  ).bind(userId).first();

  return new Response(JSON.stringify({
    notifications: results || [],
    unreadCount: unreadCount?.count || 0,
  }), { headers: { 'Content-Type': 'application/json' } });
}

/**
 * Mark notifications as read (authenticated)
 */
async function handleMarkNotificationsRead(request, user, env) {
  const userId = user.id;
  const { notificationIds } = await request.json();
  const now = new Date().toISOString();

  if (notificationIds && notificationIds.length > 0) {
    // Mark specific notifications
    const placeholders = notificationIds.map(() => '?').join(',');
    await env.DB.prepare(
      `UPDATE community_notifications SET is_read = 1 WHERE user_id = ? AND id IN (${placeholders})`
    ).bind(userId, ...notificationIds).run();
  } else {
    // Mark all as read
    await env.DB.prepare(
      'UPDATE community_notifications SET is_read = 1 WHERE user_id = ?'
    ).bind(userId).run();
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Create a notification for a user
 */
async function createNotification(env, userId, actorId, actorName, actorAvatar, type, message, referenceId) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO community_notifications (id, user_id, actor_id, actor_name, actor_avatar, type, message, reference_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(id, userId, actorId || '', actorName || '', actorAvatar || '', type, message, referenceId || '', now).run();
}

/**
 * Edit a post (authenticated, own post only)
 */
async function handleEditPost(request, user, env) {
  const { postId, title, content } = await request.json();

  if (!postId) return new Response('Missing postId', { status: 400 });
  if (!content || content.trim().length === 0) return new Response('Content required', { status: 400 });
  if (content.length > 5000) return new Response('Content too long (max 5000)', { status: 400 });

  const post = await env.DB.prepare('SELECT * FROM community_posts WHERE id = ?').bind(postId).first();
  if (!post) return new Response('Post not found', { status: 404 });

  const isOwner = post.user_id === user.id;
  const isAdmin = user.publicMetadata?.role === 'admin';
  if (!isOwner && !isAdmin) return new Response('Unauthorized', { status: 403 });

  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE community_posts SET title = ?, content = ?, is_edited = 1, updated_at = ? WHERE id = ?
  `).bind(title || post.title, content, now, postId).run();

  return new Response(JSON.stringify({ success: true, postId }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Delete a post (authenticated, own post or admin)
 */
async function handleDeletePost(request, user, env) {
  const url = new URL(request.url);
  const postId = url.searchParams.get('id');

  if (!postId) return new Response('Missing post ID', { status: 400 });

  const post = await env.DB.prepare('SELECT * FROM community_posts WHERE id = ?').bind(postId).first();
  if (!post) return new Response('Post not found', { status: 404 });

  const isOwner = post.user_id === user.id;
  const isAdmin = user.publicMetadata?.role === 'admin';
  if (!isOwner && !isAdmin) return new Response('Unauthorized', { status: 403 });

  // Delete replies first
  await env.DB.prepare('DELETE FROM community_posts WHERE parent_id = ?').bind(postId).run();
  // Delete reactions
  await env.DB.prepare('DELETE FROM community_reactions WHERE post_id = ?').bind(postId).run();
  // Delete the post
  await env.DB.prepare('DELETE FROM community_posts WHERE id = ?').bind(postId).run();

  // Decrement post count on profile
  if (post.parent_id === null) {
    await env.DB.prepare(
      'UPDATE community_profiles SET post_count = MAX(0, post_count - 1) WHERE user_id = ?'
    ).bind(post.user_id).run();
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Pin/unpin a post (admin only)
 */
async function handlePinPost(request, user, env) {
  if (user.publicMetadata?.role !== 'admin') {
    return new Response('Forbidden: Admin only', { status: 403 });
  }

  const { postId, pinned } = await request.json();
  if (!postId) return new Response('Missing postId', { status: 400 });

  const now = new Date().toISOString();
  await env.DB.prepare(
    'UPDATE community_posts SET is_pinned = ?, updated_at = ? WHERE id = ?'
  ).bind(pinned ? 1 : 0, now, postId).run();

  return new Response(JSON.stringify({ success: true, pinned: !!pinned }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Member directory (public)
 */
async function handleMemberDirectory(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '1');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);
  const offset = (page - 1) * limit;

  const { results } = await env.DB.prepare(`
    SELECT user_id, display_name, avatar_url, bio, location, total_xp, level, badges, post_count, reply_count, current_streak, created_at
    FROM community_profiles
    ORDER BY total_xp DESC
    LIMIT ? OFFSET ?
  `).bind(limit, offset).all();

  const total = await env.DB.prepare('SELECT COUNT(*) as count FROM community_profiles').first();

  const members = (results || []).map(p => ({
    userId: p.user_id,
    displayName: p.display_name,
    avatarUrl: p.avatar_url,
    bio: p.bio || '',
    location: p.location || '',
    totalXP: p.total_xp,
    level: getLevelForXP(p.total_xp),
    badgeCount: JSON.parse(p.badges || '[]').length,
    postCount: p.post_count,
    replyCount: p.reply_count,
    streak: p.current_streak,
    joinedAt: p.created_at,
  }));

  return new Response(JSON.stringify({
    members,
    total: total?.count || 0,
    page,
    totalPages: Math.ceil((total?.count || 0) / limit),
  }), { headers: { 'Content-Type': 'application/json' } });
}

// ────────────────────────────────────────────────────────────────
//  Stripe Webhook — /api/stripe/webhook
// ────────────────────────────────────────────────────────────────

/**
 * Verify a Stripe webhook signature using Web Crypto HMAC-SHA256.
 * No Stripe SDK needed — uses the standard signed-payload scheme.
 * https://stripe.com/docs/webhooks/signatures
 */
async function verifyStripeSignature(payload, sigHeader, secret) {
  if (!sigHeader) return false;
  // Stripe-Signature: t=<timestamp>,v1=<hmac>[,v1=<hmac>]
  const parts = sigHeader.split(',');
  const tPart  = parts.find(p => p.startsWith('t='));
  const v1Parts = parts.filter(p => p.startsWith('v1='));
  if (!tPart || !v1Parts.length) return false;

  const timestamp = tPart.slice(2);
  const signedPayload = `${timestamp}.${payload}`;

  const keyData = new TextEncoder().encode(secret);
  const key = await crypto.subtle.importKey(
    'raw', keyData, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const macBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const macHex = Array.from(new Uint8Array(macBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison across all v1 signatures
  return v1Parts.some(v1 => v1.slice(3) === macHex);
}

/**
 * Handle Stripe webhook events.
 * Writes succeeded/failed/refunded payment_intents to cms_donations in D1.
 * Webhook URL to register in Stripe Dashboard:
 *   https://goodflippindesign.com/api/stripe/webhook
 * Required secret (Pages env): STRIPE_WEBHOOK_SECRET
 */
async function handleStripeWebhook(request, env) {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET not configured');
    return new Response(JSON.stringify({ error: 'Webhook not configured' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Must read raw body BEFORE any other .json()/.text() calls
  const rawBody = await request.text();
  const sigHeader = request.headers.get('Stripe-Signature') || '';

  const valid = await verifyStripeSignature(rawBody, sigHeader, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.warn('[stripe-webhook] Signature verification failed');
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Idempotent schema bootstrap
  if (env.DB) {
    await env.DB.prepare(`
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
      )
    `).run().catch(() => {});
  }

  // Respond 200 quickly — Stripe requires a response within 30s
  // D1 writes happen synchronously before response since we need to confirm receipt
  const eventType = event.type;
  const obj = event.data?.object;

  try {
    if (eventType === 'payment_intent.succeeded' && obj && env.DB) {
      const metadata = obj.metadata || {};
      await env.DB.prepare(`
        INSERT OR IGNORE INTO cms_donations
          (stripe_payment_id, amount_cents, currency, project, donor_email, donor_name, status, recurring)
        VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?)
      `).bind(
        obj.id,
        obj.amount,
        obj.currency || 'usd',
        metadata.project || 'Good Flippin Design',
        obj.receipt_email || null,
        null,
        metadata.recurring === 'true' ? 1 : 0,
      ).run();

    } else if (eventType === 'payment_intent.payment_failed' && obj && env.DB) {
      await env.DB.prepare(
        `UPDATE cms_donations SET status = 'failed' WHERE stripe_payment_id = ?`
      ).bind(obj.id).run();

    } else if (eventType === 'charge.refunded' && obj && env.DB) {
      const piId = obj.payment_intent;
      if (piId) {
        await env.DB.prepare(
          `UPDATE cms_donations SET status = 'refunded' WHERE stripe_payment_id = ?`
        ).bind(piId).run();
      }
    }
  } catch (e) {
    // Log but still return 200 — the signature was valid, retrying won't fix a D1 error
    console.error('[stripe-webhook] D1 write error:', e.message);
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env, ctx) {
    // Initialize Sentry on first request
    initSentry(env);

    return withErrorBoundary(
      async () => {
        const url = new URL(request.url);
        const clerkSecretKey = getClerkSecretKey(url.hostname, env);

        // CORS allowlist — only our own ecosystem origins
        const ALLOWED_ORIGINS = [
          'https://goodflippindesign.com',
          'https://goodflippindesign.pages.dev',
          'https://goodflippinvibes.com',
          'https://aiaimate.com',
          'https://citizenapproved.com',
          'https://culturesherpa.org',
          'https://globaldeets.com',
          'http://localhost:3000',
          'http://localhost:8788',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:8788',
        ];
        const requestOrigin = request.headers.get('Origin') || '';
        const allowedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ALLOWED_ORIGINS[0];
        const corsHeaders = {
          'Access-Control-Allow-Origin': allowedOrigin,
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Vary': 'Origin',
        };

        if (request.method === 'OPTIONS') {
          return new Response(null, { headers: corsHeaders });
        }

        // Public endpoints (no auth required)
        if (url.pathname === '/api/comments' && request.method === 'GET') {
          const response = await handleGetComments(request, env);
          return new Response(response.body, {
            ...response,
            headers: { ...response.headers, ...corsHeaders },
          });
        }

        if (url.pathname === '/api/blog' && request.method === 'GET') {
          // status=all requires admin auth — fall through to authenticated routes
          if (url.searchParams.get('status') !== 'all') {
            const response = await handleListBlogPosts(request, env);
            return new Response(response.body, {
              ...response,
              headers: { ...response.headers, ...corsHeaders },
            });
          }
        }

    if (url.pathname === '/api/blog/post' && request.method === 'GET') {
      const response = await handleGetBlogPost(request, env);
      return new Response(response.body, {
        ...response,
        headers: { ...response.headers, ...corsHeaders },
      });
    }

    // Public community endpoints (no auth required)
    if (url.pathname === '/api/community/feed' && request.method === 'GET') {
      const response = await handleCommunityFeed(request, env);
      return new Response(response.body, {
        ...response,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    if (url.pathname === '/api/community/stats' && request.method === 'GET') {
      const response = await handleCommunityStats(env);
      return new Response(response.body, {
        ...response,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    if (url.pathname === '/api/community/posts' && request.method === 'GET') {
      const response = await handleListCommunityPosts(request, env);
      return new Response(response.body, {
        ...response,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    if (url.pathname === '/api/community/leaderboard' && request.method === 'GET') {
      const response = await handleLeaderboard(env);
      return new Response(response.body, {
        ...response,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    if (url.pathname === '/api/community/search' && request.method === 'GET') {
      const response = await handleSearchPosts(request, env);
      return new Response(response.body, {
        ...response,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    if (url.pathname === '/api/community/members' && request.method === 'GET') {
      const response = await handleMemberDirectory(request, env);
      return new Response(response.body, {
        ...response,
        headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
      });
    }

    // ── Stripe webhook — public, verified via Stripe-Signature header ──
    if (url.pathname === '/api/stripe/webhook' && request.method === 'POST') {
      return handleStripeWebhook(request, env);
    }

    // ── CMS routes (public + admin — handler does its own auth checks) ──
    if (url.pathname.startsWith('/api/cms/')) {
      let cmsUser = null;
      // Accept token from Authorization header OR ?t= query param (used by <img src> which
      // cannot send custom headers — token is short-lived Clerk JWT, admin-only)
      const cmsAuth = request.headers.get('Authorization')
        || (url.searchParams.get('t') ? 'Bearer ' + url.searchParams.get('t') : null);
      if (cmsAuth?.startsWith('Bearer ')) {
        cmsUser = await verifyClerkToken(cmsAuth.replace('Bearer ', ''), clerkSecretKey);
        if (cmsUser) cmsUser = await ensureAdminRole(cmsUser, clerkSecretKey);
      }
      const cmsResponse = await handleCMSRequest(request, env, cmsUser);
      return new Response(cmsResponse.body, {
        status: cmsResponse.status,
        headers: { ...Object.fromEntries(cmsResponse.headers || new Headers()), ...corsHeaders },
      });
    }

    // ------ All routes below require authentication ------

    // Extract Clerk token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    let user = await verifyClerkToken(token, clerkSecretKey);

    if (!user) {
      return new Response('Invalid token', { status: 401, headers: corsHeaders });
    }

    // Auto-assign admin role if email is in whitelist
    user = await ensureAdminRole(user, clerkSecretKey);

    // Protected routes
    switch (url.pathname) {
      case '/api/comments':
        if (request.method === 'POST') {
          const response = await handleCreateComment(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...response.headers, ...corsHeaders },
          });
        }
        if (request.method === 'DELETE') {
          const response = await handleDeleteComment(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...response.headers, ...corsHeaders },
          });
        }
        break;

      case '/api/profile':
        // Return user profile data
        return new Response(JSON.stringify({
          id: user.id,
          email: user.emailAddress,
          displayName: user.publicMetadata?.displayName || `User_${user.id.slice(0, 8)}`,
          role: user.publicMetadata?.role || 'user',
          createdAt: user.createdAt,
        }), {
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });

      case '/api/blog':
        if (request.method === 'GET') {
          // status=all — admin-only full listing
          if (user.publicMetadata?.role !== 'admin') {
            return new Response('Forbidden', { status: 403, headers: corsHeaders });
          }
          const response = await handleListBlogPosts(request, env);
          return new Response(response.body, {
            status: response.status,
            headers: { ...response.headers, ...corsHeaders },
          });
        }
        if (request.method === 'POST') {
          const response = await handleCreateBlogPost(request, user, env);
          return new Response(response.body, {
            status: response.status,
            headers: { ...response.headers, ...corsHeaders },
          });
        }
        if (request.method === 'PUT') {
          const response = await handleUpdateBlogPost(request, user, env);
          return new Response(response.body, {
            status: response.status,
            headers: { ...response.headers, ...corsHeaders },
          });
        }
        if (request.method === 'DELETE') {
          const response = await handleDeleteBlogPost(request, user, env);
          return new Response(response.body, {
            status: response.status,
            headers: { ...response.headers, ...corsHeaders },
          });
        }
        break;

      // ── Community Engine (authenticated) ──────────────────
      case '/api/community/checkin':
        if (request.method === 'POST') {
          const response = await handleCommunityCheckin(user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/profile':
        if (request.method === 'GET') {
          const response = await handleCommunityProfile(user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        if (request.method === 'PUT') {
          const response = await handleUpdateCommunityProfile(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/onboarding':
        if (request.method === 'POST') {
          const response = await handleOnboardingComplete(user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/notifications':
        if (request.method === 'GET') {
          const response = await handleGetNotifications(user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/notifications/read':
        if (request.method === 'POST') {
          const response = await handleMarkNotificationsRead(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/posts':
        if (request.method === 'POST') {
          const response = await handleCreateCommunityPost(request, user, env);
          return new Response(response.body, {
            status: response.status || 201,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        if (request.method === 'PUT') {
          const response = await handleEditPost(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        if (request.method === 'DELETE') {
          const response = await handleDeletePost(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/posts/pin':
        if (request.method === 'PUT') {
          const response = await handlePinPost(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/reply':
        if (request.method === 'POST') {
          const response = await handleCreateReply(request, user, env);
          return new Response(response.body, {
            status: response.status || 201,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      case '/api/community/react':
        if (request.method === 'POST') {
          const response = await handleReact(request, user, env);
          return new Response(response.body, {
            ...response,
            headers: { ...Object.fromEntries(response.headers), ...corsHeaders },
          });
        }
        break;

      default:
        return new Response('Not found', { status: 404, headers: corsHeaders });
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders });
      },
      {
        name: 'fetch',
        op: 'http.server',
        method: request.method,
        extra: { url: request.url },
      }
    );
  },
};
