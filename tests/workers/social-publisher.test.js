/**
 * Social Publisher Worker — effect-integrity regression tests.
 * Run via: npm run test:workers -- social-publisher
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { bootstrapSchema } from './helpers.js';
import { runScheduler, publishVariant } from '../../workers/social-publisher.js';

const PAST = '2025-01-01T00:00:00.000Z';

async function resetSocialTables() {
  await bootstrapSchema(env.DB);
  await env.DB.prepare('DELETE FROM cms_post_variants').run();
  await env.DB.prepare('DELETE FROM cms_social_posts').run();
  await env.DB.prepare('DELETE FROM cms_platform_tokens').run();
}

async function addToken(platform, payload = {}) {
  await env.DB.prepare(`
    INSERT INTO cms_platform_tokens (brand, platform, account_id, encrypted_payload, is_active)
    VALUES ('gfv', ?, ?, ?, 1)
  `).bind(
    platform,
    payload.account_id || `${platform}-account`,
    JSON.stringify({
      access_token: 'test-token',
      person_urn: 'urn:li:person:test-person',
      page_id: 'test-page',
      ...payload,
    })
  ).run();
}

async function addScheduledVariant(platform = 'linkedin', overrides = {}) {
  const post = await env.DB.prepare(`
    INSERT INTO cms_social_posts (brand, platform, content, scheduled_at, status, created_by)
    VALUES ('gfv', ?, ?, ?, 'scheduled', 'test-user')
  `).bind(platform, overrides.postContent || 'scheduled social post', PAST).run();
  const postId = post.meta.last_row_id;

  const variant = await env.DB.prepare(`
    INSERT INTO cms_post_variants (post_id, platform, content, scheduled_at, status, retry_count)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    postId,
    platform,
    overrides.content || 'scheduled social post',
    overrides.scheduled_at || PAST,
    overrides.status || 'pending',
    overrides.retry_count || 0
  ).run();

  return { postId, variantId: variant.meta.last_row_id };
}

async function variantById(id) {
  return env.DB.prepare('SELECT * FROM cms_post_variants WHERE id=?').bind(id).first();
}

async function postById(id) {
  return env.DB.prepare('SELECT * FROM cms_social_posts WHERE id=?').bind(id).first();
}

describe('social publisher ambiguous dispatch semantics', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetSocialTables();
  });

  it('records committed-but-response-lost dispatch as ambiguous and never dispatches it again', async () => {
    await addToken('linkedin');
    const { variantId } = await addScheduledVariant('linkedin');
    const committed = [];

    vi.stubGlobal('fetch', vi.fn(async (url, init) => {
      committed.push({ url: String(url), body: init?.body || '' });
      throw new TypeError('simulated response loss after provider commit');
    }));

    const first = await runScheduler(env);
    expect(first.processed).toBe(1);
    expect(first.ambiguous).toBe(1);
    expect(committed).toHaveLength(1);

    const afterFirst = await variantById(variantId);
    expect(afterFirst.status).toBe('ambiguous');
    expect(afterFirst.retry_count).toBe(0);
    expect(afterFirst.error_message).toContain('simulated response loss');

    const second = await runScheduler(env);
    expect(second.processed || 0).toBe(0);
    expect(committed).toHaveLength(1);

    const afterSecond = await variantById(variantId);
    expect(afterSecond.status).toBe('ambiguous');
  });

  it('fails missing provider credentials before dispatch and does not become ambiguous', async () => {
    const { variantId } = await addScheduledVariant('linkedin');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await runScheduler(env);
    expect(result.processed).toBe(1);
    expect(fetchSpy).not.toHaveBeenCalled();

    const variant = await variantById(variantId);
    expect(variant.status).toBe('failed');
    expect(variant.retry_count).toBe(0);
    expect(variant.error_message).toContain('No active token');
  });

  it('fails a LinkedIn token row with a blank access_token before dispatch and does not become ambiguous', async () => {
    await addToken('linkedin', { access_token: '' });
    const { variantId } = await addScheduledVariant('linkedin');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await runScheduler(env);

    expect(fetchSpy).not.toHaveBeenCalled();
    const variant = await variantById(variantId);
    expect(variant.status).toBe('failed');
    expect(variant.retry_count).toBe(0);
    expect(variant.error_message).toContain('LinkedIn token missing access_token');
  });

  it('fails a LinkedIn token row with a blank person_urn before dispatch and does not become ambiguous', async () => {
    await addToken('linkedin', { person_urn: '' });
    const { variantId } = await addScheduledVariant('linkedin');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await runScheduler(env);

    expect(fetchSpy).not.toHaveBeenCalled();
    const variant = await variantById(variantId);
    expect(variant.status).toBe('failed');
    expect(variant.retry_count).toBe(0);
    expect(variant.error_message).toContain('LinkedIn token missing person_urn');
  });

  it('fails unsupported platforms before dispatch', async () => {
    const { variantId } = await addScheduledVariant('not-a-platform');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await runScheduler(env);

    expect(fetchSpy).not.toHaveBeenCalled();
    const variant = await variantById(variantId);
    expect(variant.status).toBe('failed');
    expect(variant.error_message).toContain('Unsupported platform');
  });

  it('records successful provider publication as published with provider identifiers', async () => {
    await addToken('linkedin');
    const { variantId } = await addScheduledVariant('linkedin');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('', {
      status: 201,
      headers: { 'x-restli-id': 'urn:li:share:test-success' },
    })));

    await runScheduler(env);

    const variant = await variantById(variantId);
    expect(variant.status).toBe('published');
    expect(variant.external_id).toBe('urn:li:share:test-success');
    expect(variant.external_url).toContain('urn:li:share:test-success');
  });

  it('keeps parent state ambiguous when any child is ambiguous', async () => {
    await addToken('linkedin');
    const { postId, variantId } = await addScheduledVariant('linkedin');
    await env.DB.prepare(`
      INSERT INTO cms_post_variants (post_id, platform, content, scheduled_at, status, external_id)
      VALUES (?, 'facebook', 'already published', ?, 'published', 'fb-post-1')
    `).bind(postId, PAST).run();

    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('simulated response loss after provider commit');
    }));

    await runScheduler(env);

    const variant = await variantById(variantId);
    const parent = await postById(postId);
    expect(variant.status).toBe('ambiguous');
    expect(parent.status).toBe('ambiguous');
  });

  it('cannot redispatch when provider commits but the local published-write fails', async () => {
    await addToken('linkedin');
    const { postId, variantId } = await addScheduledVariant('linkedin');

    let fetchCalls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      fetchCalls += 1;
      return new Response('', {
        status: 201,
        headers: { 'x-restli-id': 'urn:li:share:test-success' },
      });
    }));

    const { results: due } = await env.DB.prepare(`
      SELECT v.*, sp.brand
      FROM cms_post_variants v
      JOIN cms_social_posts sp ON sp.id = v.post_id
      WHERE v.id = ?
    `).bind(variantId).all();
    const variantRow = due[0];

    // A db wrapper whose real reads/writes pass through to the real D1 binding,
    // except the specific post-dispatch "record success" write, which fails —
    // simulating provider commit followed by a local persistence failure.
    const flakyDb = {
      prepare(sql) {
        if (sql.includes("status='published'")) {
          return {
            bind: () => ({
              run: async () => {
                throw new Error('simulated D1 write failure after provider commit');
              },
            }),
          };
        }
        return env.DB.prepare(sql);
      },
    };

    const outcome = await publishVariant(variantRow, flakyDb, env);
    expect(fetchCalls).toBe(1);
    expect(outcome.status).toBe('ambiguous');

    const afterFirst = await variantById(variantId);
    expect(afterFirst.status).toBe('ambiguous');
    expect(afterFirst.error_message).toContain('simulated D1 write failure');

    // Ordinary scheduler rerun (real, unwrapped DB) must not redispatch: the
    // provider already committed, so the effect must stay ambiguous, not pending.
    const rerun = await runScheduler(env);
    expect(rerun.processed || 0).toBe(0);
    expect(fetchCalls).toBe(1);

    const afterRerun = await variantById(variantId);
    expect(afterRerun.status).toBe('ambiguous');
    const parent = await postById(postId);
    expect(parent.status).toBe('ambiguous');
  });
});
