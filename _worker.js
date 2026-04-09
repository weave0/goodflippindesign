/**
 * Cloudflare Pages Advanced Mode Worker
 * Routes API requests to auth worker, serves static assets for everything else
 * Injects environment variables into HTML for secure key management
 * Implements edge caching for global performance
 *
 * NOTE: authWorker is loaded dynamically so that a syntax error or import
 * failure in workers/auth.js does NOT crash the entire Pages worker and
 * cause Cloudflare Pages to fall back to SPA-mode (serving index.html for
 * every URL including /donate, /community-portal, etc.).
 */

let _authWorker = null;

async function getAuthWorker() {
  if (_authWorker) return _authWorker;
  try {
    const mod = await import('./workers/auth.js');
    _authWorker = mod.default;
  } catch (e) {
    console.warn('[_worker] Auth worker unavailable:', e.message);
    _authWorker = null;
  }
  return _authWorker;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Canonical domain redirect: goodflippinvibes.com → goodflippindesign.com
    // Prevents duplicate-domain indexing; preserves path + query string.
    if (url.hostname === 'goodflippinvibes.com' || url.hostname === 'www.goodflippinvibes.com') {
      const canonical = new URL(request.url);
      canonical.hostname = 'goodflippindesign.com';
      return Response.redirect(canonical.toString(), 301);
    }

    // Block accidental public access to internal docs, source code, and policy drafts.
    // This repo is a monorepo-style workspace; Cloudflare Pages will serve committed
    // files unless we explicitly deny them.
    const rawPath = url.pathname || '/';
    let decodedPath = rawPath;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      // Leave as-is if decoding fails
    }

    const pathLower = String(decodedPath).toLowerCase();
    const normalizedPath = pathLower.endsWith('/') ? pathLower : `${pathLower}/`;

    // Allowlist critical public files that may otherwise match broad deny rules.
    const allowedExact = new Set(['/robots.txt', '/sitemap.xml', '/admin-panels.js']);

    const blockedPrefixes = [
      '/legal/',
      '/brand assets development/',
      '/business registration/',
      '/official documents/',
      '/organization docs/',
      '/cashmoney/',
      '/deploy-to-gfv/',
      '/docs/',
      '/functions/',
      '/gfd dev projects/',
      '/mediation-site/',
      '/nft_gfv_drop/',
      '/portfolio-manager/',
      '/tests/',
      '/scripts/',
      '/workers/',
      '/.github/',
      '/.husky/',
      '/.git/',
    ];

    const blockedExact = new Set([
      '/_worker.js',
      '/package.json',
      '/package-lock.json',
      '/wrangler.toml',
      '/wrangler-social.toml',
      '/_headers',
      '/.env',
      '/.env.example',
      // Test/staging HTML pages — not for public consumption
      '/temp_donate_review.html',
      '/temp_review.html',
      // Internal tools — not for public access
      '/_social-post-generator.html',
    ]);

    const blockedExtensions = [
      '.md',
      '.sql',
      '.ps1',
      '.sh',
      '.py',
      '.txt',
      '.toml',
      '.yml',
      '.yaml',
      '.bak',
      '.log',
      '.ssml',
    ];

    const isAllowed = allowedExact.has(pathLower);

    // Treat JSON as internal unless it lives under /assets/ (used by gallery/media catalog).
    const isBlockedJson = pathLower.endsWith('.json') && !pathLower.startsWith('/assets/');

    // Block root-level .js files (debug/test/utility scripts — all app JS is inline or CDN).
    // Exception: /admin-panels.js is a static asset served from root (extracted from admin.html).
    const isRootLevelJs = pathLower.endsWith('.js') && !pathLower.slice(1).includes('/');

    const isBlocked =
      !isAllowed &&
      (blockedExact.has(pathLower) ||
        blockedPrefixes.some((prefix) => normalizedPath.startsWith(prefix)) ||
        blockedExtensions.some((ext) => pathLower.endsWith(ext)) ||
        isBlockedJson ||
        isRootLevelJs);

    if (isBlocked) {
      return new Response('Not found', {
        status: 404,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      });
    }

    // Protect /admin.html at the edge — require a Clerk session JWT.
    // Clerk sets __session (a signed JWT starting with 'ey') on the same domain.
    // We can't fully verify the JWT signature here without the secret, but we
    // check that (a) the cookie is present AND (b) its value starts with 'ey'
    // (base64url-encoded JSON header), which prevents trivial cookie spoofing.
    if (pathLower === '/admin.html' || pathLower === '/admin') {
      const cookieHeader = request.headers.get('Cookie') || '';
      // Extract __session value (format: __session=eyJ...)
      const sessionMatch = cookieHeader.match(/(?:^|;\s*)__session=([^;]+)/);
      const sessionVal   = sessionMatch ? sessionMatch[1] : '';
      const hasValidSession =
        (sessionVal.startsWith('ey') && sessionVal.length > 20) ||
        cookieHeader.includes('__client_uat=1');
      if (!hasValidSession) {
        return Response.redirect(`${url.origin}/?auth_required=admin`, 302);
      }
    }

    // Serve public media assets (videos, audio) directly from R2 (no auth required).
    // URL shape: /api/media/{path...}
    // R2 key shape: media/{path...}
    if (url.pathname.startsWith('/api/media/') && request.method === 'GET') {
      if (!env.MEDIA_BUCKET) {
        return new Response('Media storage unavailable', { status: 503 });
      }
      const r2Key = url.pathname.replace(/^\/api\//, ''); // strip leading /api/ → media/...
      const object = await env.MEDIA_BUCKET.get(r2Key);
      if (!object) {
        return new Response('Not found', { status: 404 });
      }
      const headers = new Headers();
      const ext = r2Key.split('.').pop().toLowerCase();
      const mimeMap = { mp4: 'video/mp4', webm: 'video/webm', mp3: 'audio/mpeg', wav: 'audio/wav', jpg: 'image/jpeg', png: 'image/png' };
      headers.set('Content-Type', object.httpMetadata?.contentType || mimeMap[ext] || 'application/octet-stream');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('ETag', object.httpEtag);
      if (object.size) headers.set('Content-Length', String(object.size));
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader) {
        return new Response(object.body, { status: 206, headers });
      }
      return new Response(object.body, { headers });
    }

    // Serve branded media assets directly from R2 (no auth required).
    // URL shape: /api/cms/media/{assetId}-{format}.jpg
    // R2 key shape: cms/media/{assetId}-{format}.jpg
    if (url.pathname.startsWith('/api/cms/media/') && request.method === 'GET') {
      if (!env.MEDIA_BUCKET) {
        return new Response('Media storage unavailable', { status: 503 });
      }
      const r2Key = url.pathname.replace(/^\/api\//, ''); // strip leading /api/
      const object = await env.MEDIA_BUCKET.get(r2Key);
      if (!object) {
        return new Response('Not found', { status: 404 });
      }
      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      headers.set('ETag', object.httpEtag);
      return new Response(object.body, { headers });
    }

    // Route API requests to auth worker (gracefully degrade if unavailable)
    // Exception: /api/stripe-health proxies to Stripe Worker (avoids worker-to-worker *.workers.dev issues)
    if (url.pathname === '/api/stripe-health' && request.method === 'GET') {
      try {
        const resp = await fetch('https://gfd-stripe.weave0.workers.dev/health', {
          headers: { 'User-Agent': 'GFD-Pages-Proxy/1.0' },
        });
        const body = await resp.text();
        return new Response(body, {
          status: resp.status,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ ok: false, error: 'Stripe worker unreachable' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    if (url.pathname.startsWith('/api/')) {
      const authWorker = await getAuthWorker();
      if (authWorker) {
        return authWorker.fetch(request, env, ctx);
      }
      return new Response(JSON.stringify({ error: 'API temporarily unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Checkout readiness probe (used by health monitoring)
    if (url.pathname === '/create-checkout' && request.method === 'GET') {
      const stripeConfigured = Boolean(env.STRIPE_PUBLISHABLE_KEY);
      return new Response(JSON.stringify({
        ok: stripeConfigured,
        service: 'gfd-checkout',
        stripeConfigured,
        timestamp: new Date().toISOString(),
      }), {
        status: stripeConfigured ? 200 : 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Donate page: create Stripe Checkout Session — proxy to stripe-payments worker.
    // donate.html POSTs { amount (dollars), type ('one-time'|'monthly') }
    // and expects { url } to redirect the user to Stripe-hosted checkout.
    if (url.pathname === '/create-checkout' && request.method === 'POST') {
      try {
        const stripeWorkerUrl = 'https://gfd-stripe.weave0.workers.dev/api/create-checkout-session';
        const proxied = await fetch(stripeWorkerUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Origin': url.origin,
          },
          body: request.body,
        });
        const data = await proxied.text();
        return new Response(data, {
          status: proxied.status,
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: 'Checkout unavailable — please try again' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Get response from static assets (Pages provides env.ASSETS automatically).
    // If this worker is built/deployed outside of Pages advanced mode, env.ASSETS
    // may not exist—fail gracefully instead of throwing.
    if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
      return new Response('Static assets unavailable', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    let response = await env.ASSETS.fetch(request);

    // Inject environment variables + apply image overrides for HTML responses
    if (response.headers.get('content-type')?.includes('text/html')) {
      // Load active image overrides for this domain (if D1 is available)
      let overrides = [];
      if (env.DB) {
        try {
          const result = await env.DB.prepare(
            'SELECT url_pattern, r2_key FROM asset_overrides WHERE active = 1 AND site_domain = ?'
          ).bind(url.hostname).all();
          overrides = result.results || [];
        } catch {
          // D1 unavailable — serve page unmodified
        }
      }

      // Inject ENV object with sensitive keys (never commit to git).
      // Feature flags (ENABLE_BLOG_CMS, ENABLE_COMMUNITY) default to true on
      // production — set the corresponding CF secret to 'false' to disable.
      // Defensive: strip any accidental "SENTRY_DSN" key-name prefix from the
      // DSN value (can happen when the secret is set via `echo KEY=value | wrangler …`).
      // Also reject auth tokens (sntrys_…) — a DSN must start with https://.
      const rawDsn = env.SENTRY_DSN || null;
      const strippedDsn = rawDsn ? rawDsn.replace(/^SENTRY_DSN=?/i, '').trim() : null;
      const sentryDsn = strippedDsn && strippedDsn.startsWith('https://') ? strippedDsn : null;
      const envScript = `<script>window.ENV = ${JSON.stringify({
        STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || null,
        CLERK_PUBLISHABLE_KEY:  env.CLERK_PUBLISHABLE_KEY  || null,
        SENTRY_DSN:             sentryDsn,
        ENABLE_COMMUNITY:       env.ENABLE_COMMUNITY !== 'false',
        ENABLE_BLOG_CMS:        env.ENABLE_BLOG_CMS   !== 'false',
        ENABLE_DONATIONS:       env.ENABLE_DONATIONS  !== 'false',
        ENABLE_AI_FEATURES:     env.ENABLE_AI_FEATURES === 'true',
      })}</script>`;

      // Inject Sentry client init when DSN is configured
      const sentryScript = sentryDsn ? `<script src="https://browser.sentry-cdn.com/8.0.0/bundle.min.js" crossorigin="anonymous"></script><script>window.Sentry&&Sentry.init({dsn:${JSON.stringify(sentryDsn)},release:${JSON.stringify(env.CF_PAGES_COMMIT_SHA||'unknown')},environment:'production',tracesSampleRate:0.05,replaysSessionSampleRate:0,ignoreErrors:['ResizeObserver loop','Non-Error exception','cancelled','NetworkError']})</script>` : '';

      // Compact Web Vitals reporter — PerformanceObserver only, zero CDN deps.
      // Reports CLS, LCP, FCP, TTFB, INP to GA4 (gtag) when available.
      const webVitalsScript = `<script>(()=>{const s='object'==typeof performance;if(!s||!window.PerformanceObserver)return;function r(n,v,i){if(window.gtag)gtag('event',n,{value:Math.round('CLS'===n?1e3*v:v),metric_id:i,non_interaction:!0,event_category:'Web Vitals'});}const ob=(t,cb,opts)=>{try{const o=new PerformanceObserver(l=>{for(const e of l.getEntries())cb(e)});o.observe(Object.assign({type:t,buffered:!0},opts||{}));return o}catch(e){}};ob('largest-contentful-paint',e=>r('LCP',e.startTime,e.id||''));ob('first-input',e=>r('FID',e.processingStart-e.startTime,e.id||''));ob('layout-shift',e=>{if(!e.hadRecentInput)r('CLS',e.value,e.id||'');},{durationThreshold:0});ob('event',e=>{if(e.interactionId)r('INP',e.duration,e.interactionId||'');},{durationThreshold:40});const np=performance.getEntriesByType('navigation')[0];if(np)r('TTFB',np.responseStart,np.name||'');})();</script>`;

      if (overrides.length > 0) {
        // Use HTMLRewriter to swap img src/srcset without buffering full HTML
        const overrideMap = new Map(overrides.map(o => [o.url_pattern, o.r2_key]));
        // /pub/ only serves assets with review_status = 'approved' in D1
        const cmsBase = `https://${url.hostname}/api/cms/pub/`;

        response = new HTMLRewriter()
          .on('img', {
            element(el) {
              const src = el.getAttribute('src');
              if (src && overrideMap.has(src)) {
                el.setAttribute('src', `${cmsBase}${overrideMap.get(src)}`);
              }
              // Also handle srcset
              const srcset = el.getAttribute('srcset');
              if (srcset) {
                const newSrcset = srcset.replace(/([^\s,]+)/g, (part) =>
                  overrideMap.has(part) ? `${cmsBase}${overrideMap.get(part)}` : part
                );
                if (newSrcset !== srcset) el.setAttribute('srcset', newSrcset);
              }
            },
          })
          .on('head', {
            element(el) {
              el.append(envScript + sentryScript + webVitalsScript, { html: true });
            },
          })
          .transform(response);
      } else {
        // No overrides — fast path: buffer once + inject ENV
        const html = await response.text();
        const injectedHtml = html.replace('</head>', `${envScript}${sentryScript}${webVitalsScript}</head>`);
        response = new Response(injectedHtml, {
          headers: new Headers(response.headers),
        });
      }

      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    return response;
  },
};
