/**
 * Cloudflare Pages Advanced Mode Worker
 * Routes API requests to auth worker, serves static assets for everything else
 * Injects environment variables into HTML for secure key management
 * Implements edge caching for global performance
 *
 * NOTE: authWorker is loaded dynamically so that a missing/broken dependency
 * (e.g. @sentry/cloudflare not available in a dev build) does NOT crash the
 * entire worker and cause Cloudflare Pages to fall back to SPA-mode
 * (serving index.html for every URL including /donate, /community-portal, etc.)
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
    const allowedExact = new Set(['/robots.txt', '/sitemap.xml']);

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
    ];

    const isAllowed = allowedExact.has(pathLower);

    // Treat JSON as internal unless it lives under /assets/ (used by gallery/media catalog).
    const isBlockedJson = pathLower.endsWith('.json') && !pathLower.startsWith('/assets/');

    const isBlocked =
      !isAllowed &&
      (blockedExact.has(pathLower) ||
        blockedPrefixes.some((prefix) => normalizedPath.startsWith(prefix)) ||
        blockedExtensions.some((ext) => pathLower.endsWith(ext)) ||
        isBlockedJson);

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

      // Inject ENV object with sensitive keys (never commit to git)
      const envScript = `<script>window.ENV = ${JSON.stringify({
        STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || null,
        CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY || null
      })}</script>`;

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
              el.append(envScript, { html: true });
            },
          })
          .transform(response);
      } else {
        // No overrides — fast path: buffer once + inject ENV
        const html = await response.text();
        const injectedHtml = html.replace('</head>', `${envScript}</head>`);
        response = new Response(injectedHtml, {
          headers: new Headers(response.headers),
        });
      }

      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    return response;
  },
};
