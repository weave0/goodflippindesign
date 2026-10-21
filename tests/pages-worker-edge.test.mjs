// Edge routing regressions for the Pages advanced-mode worker (_worker.js).
// Run: node --no-warnings tests/pages-worker-edge.test.mjs
import assert from 'node:assert/strict';
import worker from '../_worker.js';

const served = [];
const env = {
  ASSETS: {
    async fetch(request) {
      const { pathname } = new URL(request.url);
      served.push(pathname);
      const type = pathname.endsWith('.js') ? 'text/javascript' : 'text/plain';
      return new Response(`asset:${pathname}`, { status: 200, headers: { 'content-type': type } });
    },
  },
};

async function get(path, headers = {}) {
  return worker.fetch(new Request(`https://goodflippindesign.com${path}`, { headers }), env, {});
}

// 1. GA4 consent loader is a root-level .js that every page includes; it must be served.
{
  const res = await get('/ga4-consent.js');
  assert.equal(res.status, 200, '/ga4-consent.js must not be blocked by the root-level .js rule');
  assert.equal(await res.text(), 'asset:/ga4-consent.js');
  const upper = await get('/GA4-Consent.js');
  assert.equal(upper.status, 200, 'allowlist is case-insensitive like the rest of the edge rules');
}

// 2. Other root-level .js files stay blocked (debug/test scripts).
for (const path of ['/debug.js', '/config.js', '/_worker.js', '/some-test-helper.js']) {
  const res = await get(path);
  assert.equal(res.status, 404, `${path} must stay blocked`);
}

// 3. Admin-only surfaces are not served to anonymous public requests.
const adminPaths = ['/admin.html', '/ADMIN.html', '/admin', '/admin/', '/admin-panels.js', '/admin.css', '/mission-control-admin.js', '/admin%2Ehtml'];
for (const path of adminPaths) {
  served.length = 0;
  const res = await get(path);
  assert.equal(res.status, 404, `${path} must 404 for anonymous requests`);
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(served.length, 0, `${path} must never reach static assets when anonymous`);
}
for (const cookie of ['__client_uat=0', '__session=abc', 'foo=bar', '__client_uat=0; __session=notajwt']) {
  const res = await get('/admin.html', { Cookie: cookie });
  assert.equal(res.status, 404, `signed-out cookie "${cookie}" must not unlock admin.html`);
}

// 4. A Clerk session still reaches the page (client-side Clerk role gate applies there).
{
  const res = await get('/admin.html', { Cookie: '__client_uat=1729551234' });
  assert.equal(res.status, 200, 'signed-in Clerk session still reaches admin.html');
  const jwtish = await get('/admin-panels.js', { Cookie: `__session=ey${'x'.repeat(40)}` });
  assert.equal(jwtish.status, 200, 'signed-in session still loads admin-panels.js');
}

// 5. Prompt Studio no longer bounces anonymous users to the now-hidden admin.html.
{
  const res = await get('/prompt-studio/');
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://goodflippindesign.com/');
}

// 6. Ordinary public pages are untouched.
for (const path of ['/', '/index.html', '/music.html', '/robots.txt']) {
  const res = await get(path);
  assert.equal(res.status, 200, `${path} must stay public`);
}

// 7. /api/media: HEAD support, legacy unprefixed album keys, no wider bucket exposure.
{
  const objects = new Map([
    ['media/aardvarco/01 - Pahk the Mic.mp4', 'prefixed'],
    ['heavy-moose/Heavy Moose - Chilly Sun.mp4', 'legacy'],
    ['cms/private/draft.mp4', 'private'],
  ]);
  const lookups = [];
  const obj = (key) => ({ body: objects.get(key), size: 3, httpEtag: '"e"', httpMetadata: { contentType: 'video/mp4' } });
  const mediaEnv = {
    ...env,
    MEDIA_BUCKET: {
      async get(key) { lookups.push(['get', key]); return objects.has(key) ? obj(key) : null; },
      async head(key) { lookups.push(['head', key]); return objects.has(key) ? { ...obj(key), body: undefined } : null; },
    },
  };
  const call = (path, method = 'GET') => worker.fetch(new Request(`https://goodflippindesign.com${path}`, { method }), mediaEnv, {});

  let res = await call('/api/media/aardvarco/01%20-%20Pahk%20the%20Mic.mp4');
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'prefixed');

  res = await call('/api/media/heavy-moose/Heavy%20Moose%20-%20Chilly%20Sun.mp4');
  assert.equal(res.status, 200, 'legacy unprefixed album key is served');
  assert.equal(await res.text(), 'legacy');

  lookups.length = 0;
  res = await call('/api/media/heavy-moose/Heavy%20Moose%20-%20Chilly%20Sun.mp4', 'HEAD');
  assert.equal(res.status, 200, 'HEAD answers availability');
  assert.equal(await res.text(), '', 'HEAD has no body');
  assert.ok(lookups.every(([op]) => op === 'head'), 'HEAD never downloads the object');

  res = await call('/api/media/heavy-moose/missing.mp4', 'HEAD');
  assert.equal(res.status, 404);

  for (const path of ['/api/media/cms/private/draft.mp4', '/api/media/heavy-moose/../cms/private/draft.mp4', '/api/media/heavy-moose/%2e%2e/cms/private/draft.mp4']) {
    res = await call(path);
    assert.equal(res.status, 404, `${path} must not reach non-media keys`);
  }
  res = await call('/api/media/%E0%A4%A');
  assert.equal(res.status, 404, 'malformed escapes are a 404, not a crash');
}

console.log('pages worker edge checks passed');
