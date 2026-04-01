/**
 * Stripe Payments Worker — unit tests
 *
 * Tests workers/stripe-payments.js (the gfd-stripe worker):
 *   GET  /health
 *   OPTIONS * (CORS preflight)
 *   POST /api/create-payment-intent
 *   POST /api/create-checkout-session
 *
 * Outbound Stripe API calls are intercepted with vi.stubGlobal('fetch', ...)
 * so no real HTTP requests leave the test runner.  Test and worker code share
 * the same V8 context in vitest-pool-workers, so stubbing globalThis.fetch
 * intercepts the worker's outbound calls while leaving SELF.fetch() (miniflare
 * internal dispatcher) untouched.
 *
 * STRIPE_SECRET_KEY is set to "sk_test_placeholder" in workers/wrangler-stripe.toml
 * [vars] so the test env sees a truthy value.  To test the 503 "unconfigured"
 * guard, set STRIPE_SECRET_KEY = "" in that file and re-run.
 *
 * Run: npm run test:workers:payments
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { SELF } from 'cloudflare:test';

const BASE = 'https://gfd-stripe.example.com';

// ─── Stub lifecycle ───────────────────────────────────────────────────────────

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Stub globalThis.fetch to return a Stripe-shaped success response.
 * Only the stripe integration tests call this — validation tests exit before
 * the outbound fetch, so no stub is needed there.
 */
function mockStripeFetch(responseBody, status = 200) {
  const serialised = JSON.stringify(responseBody);
  vi.stubGlobal(
    'fetch',
    // Use mockImplementation so `new Response(...)` is constructed lazily
    // inside the worker's request I/O context, not ahead of time in the test.
    vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(serialised, {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    ),
  );
}

function mockPaymentIntent(clientSecret = 'pi_test_secret_abc123') {
  mockStripeFetch({ client_secret: clientSecret });
}

function mockCheckoutSession(url = 'https://checkout.stripe.com/pay/cs_test_abc') {
  mockStripeFetch({ id: 'cs_test_abc', url });
}

function mockStripeApiError(message = 'Your card was declined.') {
  mockStripeFetch({ error: { message } }, 402);
}

// ─── Health check ─────────────────────────────────────────────────────────────

describe('stripe-payments — health', () => {
  it('GET /health returns 200 with service name', async () => {
    const res = await SELF.fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('gfd-stripe-payments');
  });

  it('unknown routes return 404', async () => {
    const res = await SELF.fetch(`${BASE}/api/unknown`);
    expect(res.status).toBe(404);
  });

  it('wrong method on known path returns 404', async () => {
    // GET is not handled for /api/create-payment-intent
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, { method: 'GET' });
    expect(res.status).toBe(404);
  });
});

// ─── CORS preflight ───────────────────────────────────────────────────────────

describe('stripe-payments — CORS preflight', () => {
  it('OPTIONS from allowed origin returns 204 with matching ACAO', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://goodflippindesign.com' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://goodflippindesign.com');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });

  it('OPTIONS from disallowed origin does not reflect the origin', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example.com' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).not.toBe('https://evil.example.com');
  });

  it('allowed localhost origin is accepted (developer workflow)', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://localhost:3000' },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:3000');
  });

  it('successful POST response includes ACAO header for allowed origin', async () => {
    mockPaymentIntent();
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://goodflippindesign.com',
      },
      body: JSON.stringify({ amount: 1000 }),
    });
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://goodflippindesign.com');
  });
});

// ─── POST /api/create-payment-intent — input validation ──────────────────────

describe('create-payment-intent — validation', () => {
  it('returns 400 for invalid JSON body', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not{valid}json',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it('returns 400 when amount is below 100 cents (minimum)', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 50 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/100/);
  });

  it('returns 400 when amount exceeds 500000 cents (maximum)', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 600000 }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/500000/);
  });

  it('returns 400 when amount is a float (non-integer cents)', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 9.99 }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when project is not in the allowed list', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000, project: 'Sketchy Corp' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/unknown project/i);
  });
});

// ─── POST /api/create-payment-intent — Stripe integration ────────────────────

describe('create-payment-intent — Stripe calls', () => {
  it('returns clientSecret for a valid one-time donation', async () => {
    mockPaymentIntent('pi_3Abc_secret_xyz');
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 2500, project: 'Good Flippin Design' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe('pi_3Abc_secret_xyz');
  });

  it('returns clientSecret for a recurring donation', async () => {
    mockPaymentIntent('pi_recurring_secret');
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000, recurring: true, project: 'CultureSherpa' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe('pi_recurring_secret');
  });

  it('uses default project when none is provided', async () => {
    mockPaymentIntent('pi_default_project_secret');
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 500 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBeDefined();
  });

  it('returns 502 when Stripe API returns an error', async () => {
    mockStripeApiError('Your card was declined.');
    const res = await SELF.fetch(`${BASE}/api/create-payment-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 1000 }),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/unable to create payment intent/i);
  });
});

// ─── POST /api/create-checkout-session — input validation ────────────────────

describe('create-checkout-session — validation', () => {
  it('returns 400 for invalid JSON body', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad json',
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid json/i);
  });

  it('returns 400 when amount is below $1', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 0.5, type: 'one-time' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/\$1/);
  });

  it('returns 400 when amount exceeds $5000', async () => {
    const res = await SELF.fetch(`${BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 6000, type: 'one-time' }),
    });
    expect(res.status).toBe(400);
  });
});

// ─── POST /api/create-checkout-session — Stripe integration ──────────────────

describe('create-checkout-session — Stripe calls', () => {
  it('returns redirect URL for a one-time checkout session', async () => {
    mockCheckoutSession('https://checkout.stripe.com/pay/cs_test_onetime');
    const res = await SELF.fetch(`${BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://goodflippindesign.com',
      },
      body: JSON.stringify({ amount: 25, type: 'one-time' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/pay/cs_test_onetime');
  });

  it('returns redirect URL for a monthly subscription checkout', async () => {
    mockCheckoutSession('https://checkout.stripe.com/pay/cs_test_monthly');
    const res = await SELF.fetch(`${BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://goodflippindesign.com',
      },
      body: JSON.stringify({ amount: 10, type: 'monthly' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://checkout.stripe.com/pay/cs_test_monthly');
  });

  it('return URL uses origin from allowed Origin header', async () => {
    // Verifies the worker builds success/cancel URLs from the request Origin, not
    // a hardcoded domain — important for ecosystem sites (citizenapproved.org, etc.)
    mockCheckoutSession('https://checkout.stripe.com/pay/cs_test_origin');
    const res = await SELF.fetch(`${BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://culturesherpa.org',
      },
      body: JSON.stringify({ amount: 50, type: 'one-time' }),
    });
    expect(res.status).toBe(200);
  });

  it('returns 502 when Stripe checkout API returns an error', async () => {
    mockStripeApiError('Invalid request.');
    const res = await SELF.fetch(`${BASE}/api/create-checkout-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 25, type: 'one-time' }),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/unable to create checkout session/i);
  });
});
