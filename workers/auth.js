/**
 * Cloudflare Worker: Auth & Protected Endpoints
 *
 * Handles:
 * - Clerk session verification
 * - Admin role assignment
 * - Protected API routes (comments, profiles)
 * - CORS for cross-ecosystem auth
 * - Error tracking via Sentry (observability)
 */

import * as Sentry from '@sentry/cloudflare';

/**
 * Initialize Sentry error tracking
 * Cost: $0/month for <50K events (current traffic: ~1K/month)
 */
function initSentry(env) {
  if (!env.SENTRY_DSN) {
    console.warn('⚠️ SENTRY_DSN not configured - skipping error tracking');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV || 'production',
    tracesSampleRate: 0.1, // 10% of requests for performance monitoring
    beforeSend(event) {
      // Strip sensitive data (emails, tokens)
      if (event.request?.headers?.['authorization']) {
        delete event.request.headers['authorization'];
      }
      return event;
    },
  });
}

/**
 * Wrap handlers with error boundary + performance tracking
 */
async function withErrorBoundary(handler, context) {
  const transaction = Sentry.startTransaction({
    name: context.name,
    op: context.op || 'http.server',
  });

  try {
    const result = await handler();
    transaction.setStatus('ok');
    return result;
  } catch (error) {
    transaction.setStatus('internal_error');
    Sentry.captureException(error, {
      tags: {
        endpoint: context.name,
        method: context.method,
      },
      extra: context.extra || {},
    });
    console.error(`[${context.name}] Error:`, error);
    throw error;
  } finally {
    transaction.finish();
  }
}

/**
 * Monitor D1 query performance
 */
async function executeD1Query(db, query, bindings, context) {
  const span = Sentry.startSpan({
    name: context.name || 'db.query',
    op: 'db.sql.query',
  });

  const startTime = Date.now();
  try {
    const result = await db.prepare(query).bind(...bindings).run();
    const duration = Date.now() - startTime;

    // Log slow queries (>100ms)
    if (duration > 100) {
      console.warn(`Slow query (${duration}ms): ${context.name}`);
      Sentry.captureMessage(`Slow D1 Query: ${context.name}`, {
        level: 'warning',
        extra: { duration, query: context.name },
      });
    }

    return result;
  } catch (error) {
    Sentry.captureException(error, {
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
 * Verify Clerk session token
 * @param {string} token - JWT from Clerk
 * @returns {object} - User object or null
 */
async function verifyClerkToken(token, env) {
  try {
    const response = await fetch('https://api.clerk.com/v1/sessions/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) return null;

    const session = await response.json();
    return session.user;
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
async function ensureAdminRole(user, env) {
  if (!isAdminEmail(user.emailAddress)) return user;

  // Check if role already assigned
  if (user.publicMetadata?.role === 'admin') return user;

  // Assign admin role via Clerk API
  try {
    await fetch(`https://api.clerk.com/v1/users/${user.id}/metadata`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${env.CLERK_SECRET_KEY}`,
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

  return user;
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

  // Simple profanity check (expand this list)
  const profanityList = ['spam', 'test-profanity']; // TODO: Use real list
  const hasProfanity = profanityList.some(word =>
    text.toLowerCase().includes(word)
  );

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

  try {
    let query = `
      SELECT id, title, slug, excerpt, tags, author_id, published_at, created_at
      FROM blog_posts
    `;

    if (status === 'draft') {
      query += ` WHERE status = 'draft'`;
    } else {
      query += ` WHERE status = 'published'`;
    }

    query += ` ORDER BY published_at DESC`;

    const { results } = await env.DB.prepare(query).all();
      ORDER BY published_at DESC
      LIMIT 50
    `).all();

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
      SET title = ?, content = ?, excerpt = ?, status = ?, tags = ?, featured_image = ?, published_at = ?
      WHERE id = ?
    `).bind(title, content, excerpt, status, tags || '', featured_image || '', publishedAt, id).run();

  try {
    await env.DB.prepare(`
      UPDATE blog_posts
      SET title = ?, content = ?, excerpt = ?, status = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `).bind(title, content, excerpt, status, publishedAt, now, id).run();

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

        // CORS headers for cross-ecosystem requests
        const corsHeaders = {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
          const response = await handleListBlogPosts(request, env);
          return new Response(response.body, {
            ...response,
            headers: { ...response.headers, ...corsHeaders },
          });
        }

    if (url.pathname === '/api/blog/post' && request.method === 'GET') {
      const response = await handleGetBlogPost(request, env);
      return new Response(response.body, {
        ...response,
        headers: { ...response.headers, ...corsHeaders },
      });
    }

    // ------ All routes below require authentication ------

    // Extract Clerk token from Authorization header
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace('Bearer ', '');
    let user = await verifyClerkToken(token, env);

    if (!user) {
      return new Response('Invalid token', { status: 401, headers: corsHeaders });
    }

    // Auto-assign admin role if email is in whitelist
    user = await ensureAdminRole(user, env);

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
