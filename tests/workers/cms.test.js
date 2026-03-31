/**
 * CMS Worker — public endpoint + auth-gate integration tests.
 * Tests handleCMSRequest() via SELF.fetch() through auth.js.
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

// ── Public routes (no auth required) ────────────────────────────

describe('GET /api/cms/platform-rules', () => {
  it('returns 200 with all 7 platform definitions', async () => {
    const res = await SELF.fetch(`${BASE}/api/cms/platform-rules`);
    expect(res.status).toBe(200);
    const data = await res.json();
    for (const platform of ['instagram', 'facebook', 'x', 'linkedin', 'pinterest', 'tiktok', 'youtube']) {
      expect(data).toHaveProperty(platform);
      expect(data[platform]).toHaveProperty('maxChars');
      expect(data[platform]).toHaveProperty('maxHashtags');
      expect(data[platform]).toHaveProperty('defaultFormat');
    }
  });
});

describe('GET /api/cms/gallery', () => {
  it('returns 200 with categories and items arrays (no brand filter)', async () => {
    const res = await SELF.fetch(`${BASE}/api/cms/gallery`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.categories)).toBe(true);
    expect(Array.isArray(data.items)).toBe(true);
    // Empty DB — zero approved assets expected
    expect(data.items.length).toBe(0);
  });

  it('returns 200 for a specific brand slug', async () => {
    const res = await SELF.fetch(`${BASE}/api/cms/gallery/gfd`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
  });

  it('returns 200 for brand slug "all"', async () => {
    const res = await SELF.fetch(`${BASE}/api/cms/gallery/all`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
  });
});

describe('GET /api/cms/brands', () => {
  it('returns 200 with a brands array', async () => {
    const res = await SELF.fetch(`${BASE}/api/cms/brands`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.brands)).toBe(true);
    // BRAND_DEFINITIONS has 6 entries (gfd, gfv, aiaimate, culturesherpa, globaldeets, citizenapproved)
    expect(data.brands.length).toBe(6);
  });

  it('each brand includes required fields and workflow config', async () => {
    const res = await SELF.fetch(`${BASE}/api/cms/brands`);
    const { brands } = await res.json();
    for (const brand of brands) {
      expect(brand).toHaveProperty('id');
      expect(brand).toHaveProperty('name');
      expect(brand).toHaveProperty('domain');
      expect(brand).toHaveProperty('platforms');
      expect(brand).toHaveProperty('workflow');
      expect(brand.workflow).toHaveProperty('default_cadence');
      expect(brand.workflow).toHaveProperty('enabled_platforms');
    }
  });
});

describe('GET /api/cms/categories', () => {
  it('returns 200 with an array (empty DB returns empty array)', async () => {
    const res = await SELF.fetch(`${BASE}/api/cms/categories`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
  });
});

// ── Auth enforcement on protected admin routes ───────────────────

describe('Auth enforcement — CMS admin routes return 401 without token', () => {
  const adminRoutes = [
    ['GET',    '/api/cms/assets'],
    ['GET',    '/api/cms/social'],
    ['GET',    '/api/cms/donations'],
    ['GET',    '/api/cms/stats'],
    ['GET',    '/api/cms/automation-center'],
    ['POST',   '/api/cms/upload'],
  ];

  for (const [method, path] of adminRoutes) {
    it(`${method} ${path} → 401`, async () => {
      const init = method === 'POST'
        ? { method, body: '{}', headers: { 'Content-Type': 'application/json' } }
        : { method };
      const res = await SELF.fetch(`${BASE}${path}`, init);
      expect(res.status).toBe(401);
    });
  }
});
