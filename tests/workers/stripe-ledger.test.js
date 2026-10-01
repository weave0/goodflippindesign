/**
 * Donation ledger semantics — one settled payment = one donation fact.
 * Run: npx vitest run --config vitest.workers.config.mjs tests/workers/stripe-ledger.test.js
 */
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { SELF, env } from 'cloudflare:test';
import { bootstrapSchema, signStripePayload } from './helpers.js';

const URL_ = 'https://gfd-auth.example.com/api/stripe/webhook';
let seq = 0;

async function send(type, object, { id = `evt_${++seq}`, raw } = {}) {
  const body = raw ?? JSON.stringify({ id, type, created: 1700000000, livemode: false, data: { object } });
  const { sig } = await signStripePayload(body, env.STRIPE_WEBHOOK_SECRET);
  return SELF.fetch(URL_, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig }, body });
}

const rows = async () => (await env.DB.prepare('SELECT * FROM cms_donations ORDER BY id').all()).results;

beforeAll(async () => {
  await bootstrapSchema(env.DB);
});

afterEach(async () => {
  for (const t of ['cms_donations', 'cms_donation_links', 'stripe_webhook_events']) {
    await env.DB.prepare(`DELETE FROM ${t}`).run().catch(() => {});
  }
});

describe('signature hardening', () => {
  it('rejects a correctly signed payload with a stale timestamp (replay)', async () => {
    const body = JSON.stringify({ id: 'evt_old', type: 'payment_intent.succeeded', data: { object: { id: 'pi_old', amount: 100 } } });
    const ts = Math.floor(Date.now() / 1000) - 3600;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.STRIPE_WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${ts}.${body}`));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const res = await SELF.fetch(URL_, { method: 'POST', headers: { 'Stripe-Signature': `t=${ts},v1=${hex}` }, body });
    expect(res.status).toBe(400);
  });
});

describe('one-time Checkout donation', () => {
  const session = {
    id: 'cs_one', mode: 'payment', payment_intent: 'pi_one', customer: null,
    metadata: { project: 'CultureSherpa' },
    customer_details: { email: 'donor@example.com', name: 'Dee Donor' },
  };
  const pi = { id: 'pi_one', amount: 2500, amount_received: 2500, currency: 'usd', metadata: { project: 'CultureSherpa', recurring: 'false' } };

  it('checkout first, then payment: one fact with identity + project', async () => {
    expect((await send('checkout.session.completed', session)).status).toBe(200);
    expect(await rows()).toHaveLength(0); // context only, no fact
    const res = await send('payment_intent.succeeded', pi);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: true });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ stripe_payment_id: 'pi_one', amount_cents: 2500, status: 'succeeded', recurring: 0,
      project: 'CultureSherpa', donor_email: 'donor@example.com', donor_name: 'Dee Donor', stripe_checkout_session_id: 'cs_one' });
  });

  it('payment first, then checkout (out of order): same single enriched fact', async () => {
    await send('payment_intent.succeeded', { ...pi, metadata: {} });
    await send('checkout.session.completed', session);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ project: 'CultureSherpa', donor_email: 'donor@example.com', donor_name: 'Dee Donor', recurring: 0 });
  });
});

describe('subscription donations', () => {
  const session = {
    id: 'cs_sub', mode: 'subscription', payment_intent: null, customer: 'cus_s', subscription: 'sub_1', invoice: 'in_1',
    metadata: { project: 'AI Aimate' }, customer_details: { email: 'patron@example.com', name: 'Pat Ron' },
  };

  it('first invoice (pre-2025 payload shape): checkout + invoice.paid + PI = one recurring fact', async () => {
    await send('checkout.session.completed', session);
    await send('invoice.paid', { id: 'in_1', subscription: 'sub_1', customer: 'cus_s', payment_intent: 'pi_s1', customer_email: 'patron@example.com' });
    await send('payment_intent.succeeded', { id: 'pi_s1', amount: 500, amount_received: 500, currency: 'usd', customer: 'cus_s', invoice: 'in_1' });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ stripe_payment_id: 'pi_s1', recurring: 1, stripe_subscription_id: 'sub_1', stripe_invoice_id: 'in_1',
      project: 'AI Aimate', donor_email: 'patron@example.com', donor_name: 'Pat Ron' });
  });

  it('renewal (basil payload shape, PI before invoice) keeps recurring attribution without duplicating', async () => {
    await send('checkout.session.completed', session);
    await send('payment_intent.succeeded', { id: 'pi_s2', amount: 500, amount_received: 500, currency: 'usd', customer: 'cus_s' });
    await send('invoice.paid', {
      id: 'in_2', customer: 'cus_s', customer_email: 'patron@example.com',
      parent: { subscription_details: { subscription: 'sub_1', metadata: { project: 'AI Aimate' } } },
      payments: { data: [{ payment: { type: 'payment_intent', payment_intent: 'pi_s2' } }] },
    });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ stripe_payment_id: 'pi_s2', recurring: 1, stripe_subscription_id: 'sub_1', stripe_invoice_id: 'in_2', project: 'AI Aimate' });
  });

  it('invoice.paid alone never creates a donation fact', async () => {
    await send('invoice.paid', { id: 'in_9', subscription: 'sub_9', customer: 'cus_9', payment_intent: 'pi_9' });
    expect(await rows()).toHaveLength(0);
  });
});

describe('refunds, failures, duplicates', () => {
  const pi = { id: 'pi_r', amount: 4000, amount_received: 4000, currency: 'usd' };

  it('partial then full refund tracks refunded cents and final status', async () => {
    await send('payment_intent.succeeded', pi);
    await send('charge.refunded', { payment_intent: 'pi_r', amount: 4000, amount_refunded: 1000, refunded: false, currency: 'usd' });
    expect((await rows())[0]).toMatchObject({ status: 'partially_refunded', amount_refunded_cents: 1000 });
    await send('charge.refunded', { payment_intent: 'pi_r', amount: 4000, amount_refunded: 4000, refunded: true, currency: 'usd' });
    expect((await rows())[0]).toMatchObject({ status: 'refunded', amount_refunded_cents: 4000 });
  });

  it('refund delivered before success is not overwritten by the late success', async () => {
    await send('charge.refunded', { payment_intent: 'pi_r', amount: 4000, amount_refunded: 4000, refunded: true, currency: 'usd' });
    await send('payment_intent.succeeded', pi);
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ status: 'refunded', amount_cents: 4000 });
  });

  it('failed attempt later succeeding on the same PI ends as one succeeded fact', async () => {
    await send('payment_intent.payment_failed', { id: 'pi_f', amount: 1500, currency: 'usd' });
    await send('payment_intent.succeeded', { id: 'pi_f', amount: 1500, amount_received: 1500, currency: 'usd' });
    const r = await rows();
    expect(r).toHaveLength(1);
    expect(r[0].status).toBe('succeeded');
  });

  it('duplicate delivery of the same event id is recorded once', async () => {
    const r1 = await send('payment_intent.succeeded', pi, { id: 'evt_dup' });
    const r2 = await send('payment_intent.succeeded', pi, { id: 'evt_dup' });
    expect([r1.status, r2.status]).toEqual([200, 200]);
    expect(await r2.json()).toEqual({ received: true });
    expect(await rows()).toHaveLength(1);
    const ev = await env.DB.prepare("SELECT COUNT(*) n FROM stripe_webhook_events WHERE event_id='evt_dup'").first();
    expect(ev.n).toBe(1);
  });
});
