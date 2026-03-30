/**
 * Cloudflare Worker: Stripe Payments
 *
 * Replaces AWS Lambda (sd7ug3ha16.execute-api.us-east-1.amazonaws.com/prod)
 * Handles donation payment intent creation for GFD + ecosystem sites.
 *
 * Endpoints:
 *   POST /api/create-payment-intent   → { clientSecret }
 *   GET  /health                      → { ok: true }
 *
 * Required secrets (set via `wrangler secret put`):
 *   STRIPE_SECRET_KEY   — sk_live_... or sk_test_...
 *
 * Deploy:
 *   wrangler deploy --config workers/wrangler-stripe.toml
 */

// Ecosystem origins allowed to call this worker
const ALLOWED_ORIGINS = [
  'https://goodflippindesign.com',
  'https://goodflippindesign.pages.dev',
  'https://goodflippinvibes.com',
  'https://aiaimate.com',
  'https://citizenapproved.org',
  'https://culturesherpa.org',
  'http://localhost:3000',
  'http://localhost:8788',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:8788',
];

function getCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// Allowed donation projects — prevents this endpoint being used for arbitrary charges
const ALLOWED_PROJECTS = [
  'Good Flippin Design',
  'Good Flippin Vibes',
  'CitizenApproved',
  'CultureSherpa',
  'AI Aimate',
  'Jamie Mediation',
];

// Minimum and maximum donation in cents
const MIN_AMOUNT_CENTS = 100;   //  $1.00
const MAX_AMOUNT_CENTS = 500000; // $5,000.00

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: getCorsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (request.method === 'GET' && path === '/health') {
      return json({ ok: true, service: 'gfd-stripe-payments' });
    }

    // Payment Intent — for drop-in Element flows
    if (request.method === 'POST' && path === '/api/create-payment-intent') {
      return handleCreatePaymentIntent(request, env);
    }

    // Checkout Session — donate.html redirect flow
    if (request.method === 'POST' && path === '/api/create-checkout-session') {
      return handleCreateCheckoutSession(request, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};

// ─────────────────────────────────────────────────────────────────────────────

async function handleCreatePaymentIntent(request, env) {
  if (!env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY secret not set');
    return json({ error: 'Payment system not configured' }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { amount, recurring, project } = body;

  // Validate amount
  const amountCents = Number(amount);
  if (!Number.isInteger(amountCents) || amountCents < MIN_AMOUNT_CENTS || amountCents > MAX_AMOUNT_CENTS) {
    return json({
      error: `Amount must be an integer in cents between ${MIN_AMOUNT_CENTS} and ${MAX_AMOUNT_CENTS}`,
    }, 400);
  }

  // Validate project
  const projectLabel = String(project || '').trim();
  if (projectLabel && !ALLOWED_PROJECTS.includes(projectLabel)) {
    return json({ error: 'Unknown project' }, 400);
  }

  // One-time: PaymentIntent
  // Monthly: SetupIntent — frontend uses stripe.confirmSetup(); subscription created server-side on webhook
  // For now both use PaymentIntent to maintain drop-in API compatibility with the old Lambda.
  // To enable true monthly subscriptions, upgrade to SetupIntent + webhook flow.
  const isRecurring = Boolean(recurring);

  try {
    const clientSecret = await createPaymentIntent(env.STRIPE_SECRET_KEY, {
      amountCents,
      projectLabel: projectLabel || 'Good Flippin Design',
      isRecurring,
    });

    return json({ clientSecret });
  } catch (err) {
    console.error('Stripe error:', err.message);
    return json({ error: 'Unable to create payment intent' }, 502);
  }
}

// ─── Stripe API call (no SDK needed) ─────────────────────────────────────────

async function createPaymentIntent(secretKey, { amountCents, projectLabel, isRecurring }) {
  const params = new URLSearchParams({
    amount: String(amountCents),
    currency: 'usd',
    // Automatic payment methods — no method restrictions
    'automatic_payment_methods[enabled]': 'true',
    // Metadata
    'metadata[project]': projectLabel,
    'metadata[recurring]': isRecurring ? 'true' : 'false',
    'metadata[source]': 'gfd-cloudflare-worker',
    'description': `Donation – ${projectLabel}${isRecurring ? ' (monthly)' : ''}`,
  });

  const response = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2023-10-16',
    },
    body: params.toString(),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe API error ${response.status}`);
  }

  return data.client_secret;
}

// ─── Checkout Session (donate.html redirect flow) ─────────────────────────────

async function handleCreateCheckoutSession(request, env) {
  if (!env.STRIPE_SECRET_KEY) {
    console.error('STRIPE_SECRET_KEY secret not set');
    return json({ error: 'Payment system not configured' }, 503, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, request);
  }

  const { amount, type } = body;

  // amount from donate.html is in dollars (e.g. 25 for $25)
  const amountDollars = Number(amount);
  if (!Number.isFinite(amountDollars) || amountDollars < 1 || amountDollars > 5000) {
    return json({ error: 'Amount must be between $1 and $5,000' }, 400, request);
  }
  const amountCents = Math.round(amountDollars * 100);
  const isMonthly = type === 'monthly';

  // Use Origin header to build return URLs; fallback to production domain
  const origin = request.headers.get('Origin') || '';
  const baseUrl = ALLOWED_ORIGINS.includes(origin) ? origin : 'https://goodflippindesign.com';

  try {
    const session = await createCheckoutSession(env.STRIPE_SECRET_KEY, {
      amountCents,
      isMonthly,
      successUrl: `${baseUrl}/donate?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/donate?cancelled=1`,
    });
    return json({ url: session.url }, 200, request);
  } catch (err) {
    console.error('Stripe Checkout Session error:', err.message);
    return json({ error: 'Unable to create checkout session' }, 502, request);
  }
}

async function createCheckoutSession(secretKey, { amountCents, isMonthly, successUrl, cancelUrl }) {
  const productName = isMonthly
    ? 'Monthly Donation – Good Flippin Design'
    : 'One-Time Donation – Good Flippin Design';

  const params = new URLSearchParams({
    mode: isMonthly ? 'subscription' : 'payment',
    'line_items[0][quantity]': '1',
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(amountCents),
    'line_items[0][price_data][product_data][name]': productName,
    'line_items[0][price_data][product_data][description]': 'Supporting AI education, cultural preservation, and civic tech',
    success_url: successUrl,
    cancel_url: cancelUrl,
    'metadata[source]': 'gfd-donate-page',
    'metadata[type]': isMonthly ? 'monthly' : 'one-time',
    'metadata[amountCents]': String(amountCents),
  });

  // recurring is only valid in subscription mode
  if (isMonthly) {
    params.set('line_items[0][price_data][recurring][interval]', 'month');
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Stripe-Version': '2023-10-16',
    },
    body: params.toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Stripe API error ${response.status}`);
  }
  return data; // { id, url, ... }
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function json(body, status = 200, request = null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(request ? getCorsHeaders(request) : getCorsHeaders({ headers: { get: () => '' } })),
      'Content-Type': 'application/json',
    },
  });
}
