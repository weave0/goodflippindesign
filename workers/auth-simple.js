/**
 * Cloudflare Worker: Auth & Protected Endpoints (Simplified)
 * Handles blog posts, comments, and Clerk authentication
 */

// Admin email whitelist
const ADMIN_EMAILS = [
  'brett.l.weaver@gmail.com',
  'getsome@goodflippinvibes.com',
  'community@culturesherpa.org',
  'hello@aiaimate.com',
];

// CORS headers for cross-domain requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Verify Clerk session token
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
 * Check if user is admin
 */
function isAdminEmail(email) {
  return ADMIN_EMAILS.some(admin => admin.toLowerCase() === email.toLowerCase());
}

/**
 * Handle blog post creation
 */
async function handleCreateBlogPost(request, user, env) {
  if (!isAdminEmail(user.emailAddress)) {
    return {
      status: 403,
      body: JSON.stringify({ error: 'Only admins can create blog posts' }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  const data = await request.json();
  const postId = crypto.randomUUID();
  const now = new Date().toISOString();
  const slug = data.title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  await env.DB.prepare(`
    INSERT INTO blog_posts (id, title, slug, content, excerpt, author_id, status, tags, featured_image, published_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    postId,
    data.title,
    slug,
    data.content,
    data.excerpt || '',
    user.id,
    data.status || 'draft',
    data.tags || '',
    data.featured_image || '',
    data.status === 'published' ? now : null,
    now,
    now
  ).run();

  return {
    status: 201,
    body: JSON.stringify({ id: postId, slug }),
    headers: { 'Content-Type': 'application/json' },
  };
}

/**
 * Handle comment creation
 */
async function handleCreateComment(request, user, env) {
  const data = await request.json();
  const commentId = crypto.randomUUID();
  const now = new Date().toISOString();

  await env.DB.prepare(`
    INSERT INTO comments (id, article_id, user_id, user_email, user_name, text, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    commentId,
    data.article_id,
    user.id,
    user.emailAddress,
    user.firstName + ' ' + (user.lastName || ''),
    data.text,
    now
  ).run();

  return {
    status: 201,
    body: JSON.stringify({
      id: commentId,
      article_id: data.article_id,
      user_name: user.firstName + ' ' + (user.lastName || ''),
      text: data.text,
      created_at: now
    }),
    headers: { 'Content-Type': 'application/json' },
  };
}

/**
 * Get published blog posts
 */
async function getPublishedBlogPosts(env) {
  const { results } = await env.DB.prepare(`
    SELECT id, title, slug, excerpt, tags, published_at, created_at
    FROM blog_posts
    WHERE status = 'published'
    ORDER BY published_at DESC
    LIMIT 50
  `).all();

  return {
    status: 200,
    body: JSON.stringify(results),
    headers: { 'Content-Type': 'application/json' },
  };
}

/**
 * Get blog post by slug
 */
async function getBlogPostBySlug(slug, env) {
  const post = await env.DB.prepare(`
    SELECT * FROM blog_posts WHERE slug = ? AND status = 'published'
  `).bind(slug).first();

  if (!post) {
    return {
      status: 404,
      body: JSON.stringify({ error: 'Post not found' }),
      headers: { 'Content-Type': 'application/json' },
    };
  }

  return {
    status: 200,
    body: JSON.stringify(post),
    headers: { 'Content-Type': 'application/json' },
  };
}

/**
 * Get comments for article
 */
async function getComments(articleId, env) {
  const { results } = await env.DB.prepare(`
    SELECT id, user_name, text, created_at, updated_at
    FROM comments
    WHERE article_id = ?
    ORDER BY created_at DESC
  `).bind(articleId).all();

  return {
    status: 200,
    body: JSON.stringify(results),
    headers: { 'Content-Type': 'application/json' },
  };
}

/**
 * Main request handler
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    // Public endpoints (no auth required)
    if (request.method === 'GET') {
      if (url.pathname === '/api/blog') {
        const response = await getPublishedBlogPosts(env);
        return new Response(response.body, {
          status: response.status,
          headers: { ...response.headers, ...corsHeaders },
        });
      }

      if (url.pathname === '/api/blog/post') {
        const slug = url.searchParams.get('slug');
        const response = await getBlogPostBySlug(slug, env);
        return new Response(response.body, {
          status: response.status,
          headers: { ...response.headers, ...corsHeaders },
        });
      }

      if (url.pathname === '/api/comments') {
        const articleId = url.searchParams.get('articleId') || url.searchParams.get('article_id');
        const response = await getComments(articleId, env);
        return new Response(response.body, {
          status: response.status,
          headers: { ...response.headers, ...corsHeaders },
        });
      }
    }

    // Protected endpoints (require auth)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const user = await verifyClerkToken(token, env);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Handle authenticated requests
    if (request.method === 'POST') {
      if (url.pathname === '/api/blog') {
        const response = await handleCreateBlogPost(request, user, env);
        return new Response(response.body, {
          status: response.status,
          headers: { ...response.headers, ...corsHeaders },
        });
      }

      if (url.pathname === '/api/comments') {
        const response = await handleCreateComment(request, user, env);
        return new Response(response.body, {
          status: response.status,
          headers: { ...response.headers, ...corsHeaders },
        });
      }
    }

    return new Response('Not found', {
      status: 404,
      headers: corsHeaders
    });
  },
};
