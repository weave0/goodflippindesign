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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

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
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Health check
    if (request.method === 'GET' && path === '/health') {
      return json({ ok: true, service: 'gfd-stripe-payments' });
    }

    // Main endpoint
    if (request.method === 'POST' && path === '/api/create-payment-intent') {
      return handleCreatePaymentIntent(request, env);
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

// ─── Helper ───────────────────────────────────────────────────────────────────

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}
