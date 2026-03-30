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
  },
});
