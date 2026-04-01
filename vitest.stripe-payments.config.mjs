import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';

export default defineConfig({
  plugins: [
    cloudflareTest({
      // Points at the gfd-stripe worker (stripe-payments.js), not gfd-auth.
      // STRIPE_SECRET_KEY is declared in [vars] as a placeholder so the test env
      // gets a truthy value; outbound Stripe API calls are intercepted with fetchMock.
      wrangler: { configPath: './workers/wrangler-stripe.toml' },
    }),
  ],
  test: {
    include: ['tests/workers/stripe-payments.test.js'],
  },
});
