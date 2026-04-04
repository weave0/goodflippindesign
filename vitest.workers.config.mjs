import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      // workers/.dev.vars provides test-only secrets (STRIPE_WEBHOOK_SECRET, etc.)
      wrangler: { configPath: './workers/wrangler.toml' },
    }),
  ],
  test: {
    include: ['tests/workers/**/*.test.js'],
    // stripe-payments.test.js targets a different worker (gfd-stripe); it runs
    // under its own config: vitest.stripe-payments.config.mjs
    exclude: ['tests/workers/stripe-payments.test.js'],
  },
});
