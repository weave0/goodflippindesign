/**
 * Cloudflare Pages Advanced Mode Worker
 * Routes API requests to auth worker, serves static assets for everything else
 * Injects environment variables into HTML for secure key management
 * Implements edge caching for global performance
 */

import authWorker from './workers/auth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API requests to auth worker
    if (url.pathname.startsWith('/api/')) {
      return authWorker.fetch(request, env, ctx);
    }

    const isCacheableMethod = request.method === 'GET' || request.method === 'HEAD';
    const acceptHeader = request.headers.get('Accept') || '';
    const likelyHtmlRequest =
      acceptHeader.includes('text/html') || url.pathname === '/' || url.pathname.endsWith('.html');
    const bypassEdgeCache =
      !isCacheableMethod ||
      !likelyHtmlRequest ||
      request.headers.has('Cookie') ||
      request.headers.has('Authorization') ||
      url.searchParams.has('nocache');

    // Edge caching strategy for public HTML
    const cache = caches.default;
    const cacheKey = new Request(url.toString(), { method: 'GET' });

    // Check edge cache first (significant performance boost for global traffic)
    let response;
    if (!bypassEdgeCache) {
      response = await cache.match(cacheKey);
      if (response) {
        response = new Response(response.body, response);
        response.headers.set('X-Cache', 'HIT');
        return response;
      }
    }

    // Cache miss (or bypass) - get from origin
    response = await env.ASSETS.fetch(request);

    // Inject environment variables into HTML responses
    if (response.headers.get('content-type')?.includes('text/html')) {
      const html = await response.text();

      // Inject ENV object with sensitive keys (never commit to git)
      const envScript = `<script>window.ENV = ${JSON.stringify({
        STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || 'pk_live_51So70wBL2ppdbQKqOR38V1sZW6oFrVYkKmsxYxHTIOQ7yXYU1oT2qQtXHdKo9eBx2vxvotcYt5L6ZQXoXfYrx5Wg00X1VibSRz'
      })}</script>`;

      const injectedHtml = html.replace('</head>', `${envScript}</head>`);

      // Create new response with injected HTML
      response = new Response(injectedHtml, {
        headers: new Headers(response.headers)
      });

      // Cache HTML at edge for 5 minutes (balance freshness vs speed)
      response.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
      response.headers.set('X-Cache', bypassEdgeCache ? 'BYPASS' : 'MISS');

      // Store in edge cache (non-blocking)
      if (!bypassEdgeCache && response.ok) {
        ctx.waitUntil(cache.put(cacheKey, response.clone()));
      }
    }

    return response;
  },
};
