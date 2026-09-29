import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Points at the gfd-stripe worker (stripe-payments.js), not gfd-auth.
      // The fake Stripe key exists only inside Miniflare; production Wrangler
      // config never contains a placeholder for the live secret binding.
      wrangler: { configPath: './workers/wrangler-stripe.toml' },
      miniflare: {
        bindings: { STRIPE_SECRET_KEY: 'sk_test_placeholder' },
      },
    }),
  ],
  test: {
    include: ['tests/workers/stripe-payments.test.js'],
  },
});
