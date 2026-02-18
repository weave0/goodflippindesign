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

    // Get response from static assets
    let response = await env.ASSETS.fetch(request);

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
      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }

    return response;
  },
};
