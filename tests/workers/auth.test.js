/**
 * Auth Worker — critical path unit tests
 *
 * Tests the gfd-auth worker (workers/auth.js) in a miniflare environment.
 * D1 is an in-memory SQLite store — no real credentials needed.
 *
 * Run: npm run test:workers
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { bootstrapSchema } from './helpers.js';

const BASE = 'https://gfd-auth.example.com';

beforeAll(async () => {
  await bootstrapSchema(env.DB);
});

// ─── CORS ────────────────────────────────────────────────────────────────────

describe('CORS preflight', () => {
  it('OPTIONS /api/health → 200 with ACAO header', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://goodflippinvibes.com',
        'Access-Control-Request-Method': 'GET',
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('OPTIONS /api/community/checkin → 200 with ACAO header', async () => {
    const res = await SELF.fetch(`${BASE}/api/community/checkin`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://culturesherpa.org' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeTruthy();
  });
});

// ─── Health check ─────────────────────────────────────────────────────────────

describe('GET /api/health', () => {
  it('returns 200 with correct shape when DB is available', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service).toBe('gfd-auth-api');
    expect(body.ok).toBe(true);
    expect(body.database).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('includes Sentry config status in response', async () => {
    const res = await SELF.fetch(`${BASE}/api/health`);
    const body = await res.json();
    expect(typeof body.sentryConfigured).toBe('boolean');
  });
});

// ─── Public blog endpoints ────────────────────────────────────────────────────

describe('GET /api/blog (public)', () => {
  it('returns 200 with an array', async () => {
    const res = await SELF.fetch(`${BASE}/api/blog`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it('only returns published posts on public endpoint', async () => {
    // Insert one published and one draft post
    await env.DB.prepare(
      `INSERT INTO blog_posts (id, title, slug, content, author_id, status, created_at)
       VALUES ('p1','Published','pub','Body','sys','published',datetime('now'))`
    ).run();
    await env.DB.prepare(
      `INSERT INTO blog_posts (id, title, slug, content, author_id, status, created_at)
       VALUES ('p2','Draft','drft','Body','sys','draft',datetime('now'))`
    ).run();

    const res = await SELF.fetch(`${BASE}/api/blog`);
    const posts = await res.json();
    expect(posts.every(p => p.status === 'published')).toBe(true);
  });

  it('returns 401 when requesting status=all without auth', async () => {
    const res = await SELF.fetch(`${BASE}/api/blog?status=all`);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/blog/post (public)', () => {
  it('returns 404 for missing slug', async () => {
    const res = await SELF.fetch(`${BASE}/api/blog/post?slug=does-not-exist`);
    expect(res.status).toBe(404);
  });

  it('returns 400 when slug param is missing', async () => {
    const res = await SELF.fetch(`${BASE}/api/blog/post`);
    expect(res.status).toBe(400);
  });
});

// ─── Public community endpoints ───────────────────────────────────────────────

describe('GET /api/community/stats', () => {
  it('returns 200 with numeric stats', async () => {
    const res = await SELF.fetch(`${BASE}/api/community/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.totalMembers).toBe('number');
    expect(typeof body.totalPosts).toBe('number');
    expect(typeof body.totalReactions).toBe('number');
    expect(typeof body.activeToday).toBe('number');
  });
});

describe('GET /api/community/posts', () => {
  it('returns 200 with paginated shape', async () => {
    const res = await SELF.fetch(`${BASE}/api/community/posts`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.posts)).toBe(true);
    expect(typeof body.total).toBe('number');
    expect(typeof body.hasMore).toBe('boolean');
  });

  it('respects limit param (max 50)', async () => {
    const res = await SELF.fetch(`${BASE}/api/community/posts?limit=5`);
    const body = await res.json();
    expect(body.posts.length).toBeLessThanOrEqual(5);
  });
});

describe('GET /api/community/feed', () => {
  it('returns 200 with an array', async () => {
    const res = await SELF.fetch(`${BASE}/api/community/feed`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

describe('GET /api/community/leaderboard', () => {
  it('returns 200 with an array', async () => {
    const res = await SELF.fetch(`${BASE}/api/community/leaderboard`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });
});

// ─── Auth enforcement ─────────────────────────────────────────────────────────

describe('Auth enforcement — protected endpoints require Bearer token', () => {
  const protectedEndpoints = [
    { method: 'POST', path: '/api/comments' },
    { method: 'POST', path: '/api/community/checkin' },
    { method: 'POST', path: '/api/community/post' },
    { method: 'GET',  path: '/api/community/profile' },
    { method: 'GET',  path: '/api/community/notifications' },
  ];

  for (const { method, path } of protectedEndpoints) {
    it(`${method} ${path} → 401 without Authorization`, async () => {
      const res = await SELF.fetch(`${BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      });
      expect(res.status).toBe(401);
    });
  }
});

// ─── Comment validation (input sanitation) ────────────────────────────────────

describe('Comment input validation (checked before auth)', () => {
  // Auth check happens before profanity check — all no-auth requests get 401
  it('POST /api/comments without auth returns 401 even for valid input', async () => {
    const res = await SELF.fetch(`${BASE}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ articleId: 'test-article', text: 'Hello world!' }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── Machine-to-machine blog creation ────────────────────────────────────────

describe('POST /api/blog with X-Internal-Secret', () => {
  it('returns 400 if title or content missing', async () => {
    const res = await SELF.fetch(`${BASE}/api/blog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'int-test-secret',
      },
      body: JSON.stringify({ title: 'Missing content only' }),
    });
    // content is missing → 400
    expect(res.status).toBe(400);
  });

  it('returns 201 for valid M2M blog post', async () => {
    const res = await SELF.fetch(`${BASE}/api/blog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'int-test-secret',
      },
      body: JSON.stringify({
        title: 'Test M2M Post',
        content: 'Body of the test post.',
        status: 'draft',
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('slug');
  });

  it('rejects wrong X-Internal-Secret with 401', async () => {
    const res = await SELF.fetch(`${BASE}/api/blog`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'wrong-secret',
      },
      body: JSON.stringify({ title: 'Attempt', content: 'Body' }),
    });
    // Wrong secret falls through to Clerk auth required path → 401
    expect(res.status).toBe(401);
  });
});

// ─── Unknown routes ───────────────────────────────────────────────────────────

describe('Unknown routes', () => {
  it('returns 401 for unrecognized paths (falls through to auth guard)', async () => {
    const res = await SELF.fetch(`${BASE}/api/totally-unknown-endpoint`);
    expect(res.status).toBe(401);
  });
});
