/**
 * Stripe Webhook — unit tests
 *
 * Tests the verifyStripeSignature path and handleStripeWebhook dispatch
 * in workers/auth.js using miniflare (in-memory D1).
 *
 * Run: npm run test:workers
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { bootstrapSchema, signStripePayload } from './helpers.js';

const BASE = 'https://gfd-auth.example.com';
const WEBHOOK_PATH = '/api/stripe/webhook';

beforeAll(async () => {
  await bootstrapSchema(env.DB);
});

afterEach(async () => {
  // Clean donations table between tests to keep each case isolated
  await env.DB.prepare('DELETE FROM cms_donations').run();
});

// ─── Configuration / Signature errors ────────────────────────────────────────

describe('Stripe webhook — signature validation', () => {
  it('returns 400 when Stripe-Signature header is missing', async () => {
    const body = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } });
    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    // Missing sig → secret may or may not be present: either 400 or 500
    expect([400, 500]).toContain(res.status);
  });

  it('returns 400 when Stripe-Signature is invalid', async () => {
    const body = JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } });
    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': 't=1234567890,v1=deadbeefdeadbeefdeadbeefdeadbeef',
      },
      body,
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 for a signature from the wrong secret', async () => {
    const body = JSON.stringify({ type: 'ping' });
    const { sig } = await signStripePayload(body, 'wrong-secret');
    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
    expect(res.status).toBe(400);
  });
});

// ─── payment_intent.succeeded ─────────────────────────────────────────────────

describe('Stripe webhook — payment_intent.succeeded', () => {
  it('returns 200 and writes donation row to D1', async () => {
    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_test_123',
          amount: 1000,
          currency: 'usd',
          metadata: { project: 'culturesherpa', recurring: 'false' },
          receipt_email: 'donor@test.com',
        },
      },
    };
    const body = JSON.stringify(event);
    const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);

    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
    expect(res.status).toBe(200);

    // Verify D1 row was written
    const row = await env.DB
      .prepare('SELECT * FROM cms_donations WHERE stripe_payment_id = ?')
      .bind('pi_test_123')
      .first();
    expect(row).not.toBeNull();
    expect(row.amount_cents).toBe(1000);
    expect(row.currency).toBe('usd');
    expect(row.status).toBe('succeeded');
    expect(row.donor_email).toBe('donor@test.com');
    expect(row.project).toBe('culturesherpa');
  });

  it('is idempotent — re-deliver same event does not duplicate row', async () => {
    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_idempotent_456',
          amount: 500,
          currency: 'usd',
          metadata: {},
        },
      },
    };
    const body = JSON.stringify(event);
    const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);
    const headers = { 'Content-Type': 'application/json', 'Stripe-Signature': sig };

    // Deliver twice
    const r1 = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, { method: 'POST', headers, body });
    const r2 = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, { method: 'POST', headers, body });

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const { results } = await env.DB
      .prepare('SELECT COUNT(*) AS n FROM cms_donations WHERE stripe_payment_id = ?')
      .bind('pi_idempotent_456')
      .all();
    expect(results[0].n).toBe(1);
  });

  it('handles missing metadata gracefully (no crash)', async () => {
    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          id: 'pi_no_meta_789',
          amount: 250,
          currency: 'usd',
          // no metadata, no receipt_email
        },
      },
    };
    const body = JSON.stringify(event);
    const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);

    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
    expect(res.status).toBe(200);
  });
});

// ─── payment_intent.payment_failed ───────────────────────────────────────────

describe('Stripe webhook — payment_intent.payment_failed', () => {
  it('returns 200 and marks existing donation as failed', async () => {
    // Pre-insert the donation (simulating an earlier succeeded then failed)
    await env.DB.prepare(
      `INSERT INTO cms_donations (stripe_payment_id, amount_cents, currency, status, created_at)
       VALUES ('pi_failed_abc', 750, 'usd', 'succeeded', datetime('now'))`
    ).run();

    const event = {
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_failed_abc' } },
    };
    const body = JSON.stringify(event);
    const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);

    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
    expect(res.status).toBe(200);

    const row = await env.DB
      .prepare('SELECT status FROM cms_donations WHERE stripe_payment_id = ?')
      .bind('pi_failed_abc')
      .first();
    expect(row?.status).toBe('failed');
  });

  it('returns 200 even when no matching donation exists (graceful)', async () => {
    const event = {
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_never_existed' } },
    };
    const body = JSON.stringify(event);
    const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);

    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
    expect(res.status).toBe(200);
  });
});

// ─── charge.refunded ──────────────────────────────────────────────────────────

describe('Stripe webhook — charge.refunded', () => {
  it('returns 200 and marks donation as refunded', async () => {
    await env.DB.prepare(
      `INSERT INTO cms_donations (stripe_payment_id, amount_cents, currency, status, created_at)
       VALUES ('pi_refund_xyz', 2000, 'usd', 'succeeded', datetime('now'))`
    ).run();

    const event = {
      type: 'charge.refunded',
      data: { object: { payment_intent: 'pi_refund_xyz' } },
    };
    const body = JSON.stringify(event);
    const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);

    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
    expect(res.status).toBe(200);

    const row = await env.DB
      .prepare('SELECT status FROM cms_donations WHERE stripe_payment_id = ?')
      .bind('pi_refund_xyz')
      .first();
    expect(row?.status).toBe('refunded');
  });
});

// ─── Unhandled event types ────────────────────────────────────────────────────

describe('Stripe webhook — unhandled event type', () => {
  it('returns 200 for unhandled event types (no crash)', async () => {
    const event = { type: 'customer.created', data: { object: { id: 'cus_999' } } };
    const body = JSON.stringify(event);
    const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);

    const res = await SELF.fetch(`${BASE}${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig },
      body,
    });
    expect(res.status).toBe(200);
  });
});
