/**
 * AgentK executor bridge — GFD-side integration scaffolding.
 * Proves: when a platform is AgentK-governed, GFD never calls the provider
 * directly, always defers to the executor's decision, and on losing the
 * executor's own HTTP response falls back only to inspecting the same
 * stable effect identity — never to a direct provider call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:test';
import { bootstrapSchema } from './helpers.js';
import { runScheduler, computeAgentKScopedKey } from '../../workers/social-publisher.js';

const PAST = '2025-01-01T00:00:00.000Z';
const EXECUTOR_URL = 'https://agentk-executor.internal.test';

async function resetSocialTables() {
  await bootstrapSchema(env.DB);
  await env.DB.prepare('DELETE FROM cms_post_variants').run();
  await env.DB.prepare('DELETE FROM cms_social_posts').run();
  await env.DB.prepare('DELETE FROM cms_platform_tokens').run();
}

async function addToken(platform) {
  await env.DB.prepare(`
    INSERT INTO cms_platform_tokens (brand, platform, account_id, encrypted_payload, is_active)
    VALUES ('gfv', ?, ?, ?, 1)
  `).bind(
    platform,
    `${platform}-account`,
    JSON.stringify({ access_token: 'test-token', person_urn: 'urn:li:person:test-person', page_id: 'test-page' })
  ).run();
}

async function addScheduledVariant(platform, overrides = {}) {
  const post = await env.DB.prepare(`
    INSERT INTO cms_social_posts (brand, platform, content, scheduled_at, status, created_by)
    VALUES ('gfv', ?, ?, ?, 'scheduled', 'test-user')
  `).bind(platform, overrides.postContent || 'agentk bridge post', PAST).run();
  const postId = post.meta.last_row_id;

  const variant = await env.DB.prepare(`
    INSERT INTO cms_post_variants (post_id, platform, content, scheduled_at, status, retry_count)
    VALUES (?, ?, ?, ?, 'pending', 0)
  `).bind(postId, platform, overrides.content || 'agentk bridge post', overrides.scheduled_at || PAST).run();

  return { postId, variantId: variant.meta.last_row_id };
}

async function variantById(id) {
  return env.DB.prepare('SELECT * FROM cms_post_variants WHERE id=?').bind(id).first();
}

function fakeFetch(handlers) {
  // Deliberately a plain function, not vi.fn(): this stub simulates several
  // distinct network failures per test (executor submit AND inspect both
  // unreachable), and wrapping it in vi.fn() causes vitest-pool-workers'
  // spy instrumentation to independently flag each thrown rejection as
  // "unhandled" even though the caller (agentKExecutorRequest) awaits and
  // catches every call — a cosmetic quirk of the spy wrapper, not a real
  // unhandled promise in this code path. Call tracking is done directly by
  // each handler pushing into its own array instead.
  return async (url, init) => {
    const href = String(url);
    for (const [matcher, handler] of handlers) {
      if (matcher instanceof RegExp ? matcher.test(href) : href.includes(matcher)) {
        return handler(href, init);
      }
    }
    throw new Error(`fakeFetch: no handler configured for ${href}`);
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('AgentK executor bridge', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await resetSocialTables();
    env.AGENTK_EXECUTOR_URL = EXECUTOR_URL;
    env.AGENTK_EXECUTOR_PLATFORMS = 'linkedin';
    env.AGENTK_EXECUTOR_SECRET = 'test-bridge-secret';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes via the executor and never calls LinkedIn directly on a completed effect', async () => {
    await addToken('linkedin');
    const { variantId } = await addScheduledVariant('linkedin');

    const linkedinDirectCalls = [];
    const submitCalls = [];
    vi.stubGlobal('fetch', fakeFetch([
      [`${EXECUTOR_URL}/submit`, async (url, init) => {
        submitCalls.push(JSON.parse(init.body));
        return jsonResponse({ status: 'completed', result: { externalId: 'urn:li:share:agentk-1', externalUrl: 'https://linkedin.com/x/agentk-1' } });
      }],
      [/api\.linkedin\.com/, async (url) => { linkedinDirectCalls.push(url); return jsonResponse({}); }],
    ]));

    const result = await runScheduler(env);
    expect(result.published).toBe(1);
    expect(submitCalls).toHaveLength(1);
    expect(linkedinDirectCalls).toHaveLength(0);

    const variant = await variantById(variantId);
    expect(variant.status).toBe('published');
    expect(variant.external_id).toBe('urn:li:share:agentk-1');
  });

  it('surfaces executor ambiguity as GFD ambiguous, with no direct provider fallback', async () => {
    await addToken('linkedin');
    const { variantId, postId } = await addScheduledVariant('linkedin');

    const linkedinDirectCalls = [];
    vi.stubGlobal('fetch', fakeFetch([
      [`${EXECUTOR_URL}/submit`, async () => jsonResponse({ status: 'ambiguous' })],
      [/api\.linkedin\.com/, async (url) => { linkedinDirectCalls.push(url); return jsonResponse({}); }],
    ]));

    await runScheduler(env);

    expect(linkedinDirectCalls).toHaveLength(0);
    const variant = await variantById(variantId);
    expect(variant.status).toBe('ambiguous');
    const parent = await env.DB.prepare('SELECT status FROM cms_social_posts WHERE id=?').bind(postId).first();
    expect(parent.status).toBe('ambiguous');
  });

  it('treats executor "retryable" as a confirmed non-commit failure, not ambiguous', async () => {
    await addToken('linkedin');
    const { variantId } = await addScheduledVariant('linkedin');

    vi.stubGlobal('fetch', fakeFetch([
      [`${EXECUTOR_URL}/submit`, async () => jsonResponse({ status: 'retryable', error: 'LinkedIn post failed (401): invalid access token' })],
    ]));

    await runScheduler(env);

    const variant = await variantById(variantId);
    expect(variant.status).toBe('failed');
    expect(variant.error_message).toContain('invalid access token');
  });

  it('on losing the submit response, inspects the same stable identity instead of calling LinkedIn directly', async () => {
    await addToken('linkedin');
    const { variantId, variantId: id } = await addScheduledVariant('linkedin', { content: 'lost-response post' });

    const expectedKey = await computeAgentKScopedKey({
      brand: 'gfv',
      platform: 'linkedin',
      account: 'urn:li:person:test-person',
      variantId: id,
      content: 'lost-response post',
      mediaUrl: null,
    });

    const linkedinDirectCalls = [];
    const inspectCalls = [];
    vi.stubGlobal('fetch', fakeFetch([
      [`${EXECUTOR_URL}/submit`, async () => { throw new TypeError('simulated network failure talking to executor'); }],
      [`${EXECUTOR_URL}/inspect/`, async (url) => {
        inspectCalls.push(url);
        return jsonResponse({ status: 'completed', result: { externalId: 'urn:li:share:recovered', externalUrl: 'https://linkedin.com/x/recovered' } });
      }],
      [/api\.linkedin\.com/, async (url) => { linkedinDirectCalls.push(url); return jsonResponse({}); }],
    ]));

    await runScheduler(env);

    expect(linkedinDirectCalls).toHaveLength(0);
    expect(inspectCalls).toHaveLength(1);
    expect(inspectCalls[0]).toContain(encodeURIComponent(expectedKey));

    const variant = await variantById(variantId);
    expect(variant.status).toBe('published');
    expect(variant.external_id).toBe('urn:li:share:recovered');
  });

  it('becomes ambiguous (never falls back to LinkedIn) when both submit and inspect are unreachable', async () => {
    await addToken('linkedin');
    const { variantId } = await addScheduledVariant('linkedin');

    const linkedinDirectCalls = [];
    vi.stubGlobal('fetch', fakeFetch([
      [`${EXECUTOR_URL}/submit`, async () => { throw new TypeError('simulated network failure'); }],
      [`${EXECUTOR_URL}/inspect/`, async () => { throw new TypeError('simulated network failure on inspect too'); }],
      [/api\.linkedin\.com/, async (url) => { linkedinDirectCalls.push(url); return jsonResponse({}); }],
    ]));

    await runScheduler(env);

    expect(linkedinDirectCalls).toHaveLength(0);
    const variant = await variantById(variantId);
    expect(variant.status).toBe('ambiguous');
  });

  it('leaves non-governed platforms on the direct provider path unchanged', async () => {
    env.AGENTK_EXECUTOR_PLATFORMS = 'linkedin'; // facebook is not governed
    await addToken('facebook');
    const { variantId } = await addScheduledVariant('facebook');

    const fbCalls = [];
    vi.stubGlobal('fetch', fakeFetch([
      [/graph\.facebook\.com/, async (url) => { fbCalls.push(url); return jsonResponse({ id: 'fb-post-1' }); }],
    ]));

    await runScheduler(env);
    // Whatever the exact outcome, the executor must never have been consulted.
    expect(fbCalls.length).toBeGreaterThan(0);
    const variant = await variantById(variantId);
    expect(variant.status).not.toBe('ambiguous');
  });

  describe('fail-closed AgentK configuration validation', () => {
    async function expectNoDispatchAtAll(variantId) {
      const variant = await variantById(variantId);
      expect(variant.status).toBe('failed');
      expect(variant.retry_count).toBe(0);
      expect(variant.error_message).toContain('AgentK executor is not configured');
    }

    it('allowlisted LinkedIn + missing secret -> failed, zero executor calls, zero LinkedIn calls', async () => {
      delete env.AGENTK_EXECUTOR_SECRET;
      await addToken('linkedin');
      const { variantId } = await addScheduledVariant('linkedin');

      const allCalls = [];
      vi.stubGlobal('fetch', fakeFetch([
        [EXECUTOR_URL, async (url) => { allCalls.push(url); return jsonResponse({}); }],
        [/api\.linkedin\.com/, async (url) => { allCalls.push(url); return jsonResponse({}); }],
      ]));

      await runScheduler(env);

      expect(allCalls).toHaveLength(0);
      await expectNoDispatchAtAll(variantId);
    });

    it('allowlisted LinkedIn + whitespace-only secret -> failed, zero executor calls, zero LinkedIn calls', async () => {
      env.AGENTK_EXECUTOR_SECRET = '   ';
      await addToken('linkedin');
      const { variantId } = await addScheduledVariant('linkedin');

      const allCalls = [];
      vi.stubGlobal('fetch', fakeFetch([
        [EXECUTOR_URL, async (url) => { allCalls.push(url); return jsonResponse({}); }],
        [/api\.linkedin\.com/, async (url) => { allCalls.push(url); return jsonResponse({}); }],
      ]));

      await runScheduler(env);

      expect(allCalls).toHaveLength(0);
      await expectNoDispatchAtAll(variantId);
    });

    it('allowlisted LinkedIn + missing executor URL -> failed, zero executor calls, zero LinkedIn calls', async () => {
      delete env.AGENTK_EXECUTOR_URL;
      await addToken('linkedin');
      const { variantId } = await addScheduledVariant('linkedin');

      const linkedinDirectCalls = [];
      vi.stubGlobal('fetch', fakeFetch([
        [/api\.linkedin\.com/, async (url) => { linkedinDirectCalls.push(url); return jsonResponse({}); }],
      ]));

      await runScheduler(env);

      expect(linkedinDirectCalls).toHaveLength(0);
      await expectNoDispatchAtAll(variantId);
    });

    it('URL/secret present but LinkedIn not allowlisted -> existing direct-provider behavior remains intact', async () => {
      env.AGENTK_EXECUTOR_PLATFORMS = ''; // nothing allowlisted, despite full AgentK config being present
      await addToken('linkedin');
      const { variantId } = await addScheduledVariant('linkedin');

      const executorCalls = [];
      const linkedinDirectCalls = [];
      vi.stubGlobal('fetch', fakeFetch([
        [EXECUTOR_URL, async (url) => { executorCalls.push(url); return jsonResponse({}); }],
        [/api\.linkedin\.com\/rest\/posts/, async (url, init) => {
          linkedinDirectCalls.push(url);
          return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:direct-1' } });
        }],
      ]));

      await runScheduler(env);

      expect(executorCalls).toHaveLength(0);
      expect(linkedinDirectCalls).toHaveLength(1);
      const variant = await variantById(variantId);
      expect(variant.status).toBe('published');
      expect(variant.external_id).toBe('urn:li:share:direct-1');
    });
  });
});
