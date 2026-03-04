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

    // Inject environment variables into HTML responses
    if (response.headers.get('content-type')?.includes('text/html')) {
      const html = await response.text();

      // Inject ENV object with sensitive keys (never commit to git)
      const envScript = `<script>window.ENV = ${JSON.stringify({
        STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || null,
        CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY || null
      })}</script>`;

      const injectedHtml = html.replace('</head>', `${envScript}</head>`);

      // Create new response with injected HTML
      response = new Response(injectedHtml, {
        headers: new Headers(response.headers)
      });

      // Cache HTML at edge for 5 minutes (balance freshness vs speed)
      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    return response;
  },
};
