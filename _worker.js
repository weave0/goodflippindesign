/**
 * Cloudflare Pages Advanced Mode Worker
 * Routes API requests to auth worker, serves static assets for everything else
 */

import authWorker from './workers/auth.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API requests to auth worker
    if (url.pathname.startsWith('/api/')) {
      return authWorker.fetch(request, env, ctx);
    }

    // Serve static assets for all other requests
    return env.ASSETS.fetch(request);
  },
};
