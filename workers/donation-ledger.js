/**
 * Donation ledger — Stripe webhook → cms_donations.
 *
 * Invariant: one settled payment = one donation fact, keyed by PaymentIntent id
 * (cms_donations.stripe_payment_id UNIQUE). Only payment_intent.* and charge.refunded
 * write facts. checkout.session.* and invoice.* only write linkage/identity context
 * (cms_donation_links) that is merged onto facts regardless of delivery order.
 */

const STATUS_RANK_SQL = (col) =>
  `CASE ${col} WHEN 'refunded' THEN 4 WHEN 'partially_refunded' THEN 3 WHEN 'succeeded' THEN 2 WHEN 'failed' THEN 1 ELSE 0 END`;

const LEDGER_COLUMNS = {
  stripe_customer_id: 'TEXT',
  stripe_subscription_id: 'TEXT',
  stripe_invoice_id: 'TEXT',
  stripe_checkout_session_id: 'TEXT',
  amount_refunded_cents: 'INTEGER DEFAULT 0',
  source: "TEXT DEFAULT ''",
  updated_at: 'TEXT',
};

// Not memoized: webhook volume is low and a per-isolate flag can go stale if the DB is reset.
export async function ensureDonationLedgerSchema(db) {
  await migrate(db);
}

async function migrate(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS cms_donations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stripe_payment_id TEXT UNIQUE,
      amount_cents INTEGER NOT NULL,
      currency TEXT DEFAULT 'usd',
      project TEXT,
      donor_email TEXT,
      donor_name TEXT,
      status TEXT DEFAULT 'succeeded',
      recurring INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  const { results } = await db.prepare('PRAGMA table_info(cms_donations)').all();
  const existing = new Set((results || []).map((c) => c.name));
  for (const [name, type] of Object.entries(LEDGER_COLUMNS)) {
    if (!existing.has(name)) {
      await db.prepare(`ALTER TABLE cms_donations ADD COLUMN ${name} ${type}`).run();
    }
  }

  await db.batch([
    db.prepare('CREATE INDEX IF NOT EXISTS idx_donations_status ON cms_donations(status)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_donations_created ON cms_donations(created_at)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_donations_customer ON cms_donations(stripe_customer_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_donations_subscription ON cms_donations(stripe_subscription_id)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_donations_invoice ON cms_donations(stripe_invoice_id)'),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS cms_donation_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        link_key TEXT NOT NULL UNIQUE,
        project TEXT,
        donor_email TEXT,
        donor_name TEXT,
        recurring INTEGER,
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        stripe_invoice_id TEXT,
        stripe_checkout_session_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now'))
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS stripe_webhook_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        livemode INTEGER DEFAULT 0,
        stripe_created INTEGER,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `),
  ]);
}

// ── Stripe object helpers (tolerate pre-2025 and "basil" payload shapes) ─────

const idOf = (v) => (typeof v === 'string' ? v : v?.id) || null;

function invoiceSubscription(inv) {
  return idOf(inv.subscription) || idOf(inv.parent?.subscription_details?.subscription);
}

function invoicePaymentIntents(inv) {
  const ids = new Set();
  const direct = idOf(inv.payment_intent);
  if (direct) ids.add(direct);
  for (const p of inv.payments?.data || []) {
    const pi = idOf(p?.payment?.payment_intent);
    if (pi) ids.add(pi);
  }
  return [...ids];
}

function invoiceProject(inv) {
  return (
    inv.parent?.subscription_details?.metadata?.project ||
    inv.subscription_details?.metadata?.project ||
    inv.metadata?.project ||
    inv.lines?.data?.find((l) => l?.metadata?.project)?.metadata?.project ||
    null
  );
}

// ── Writes ───────────────────────────────────────────────────────────────────

async function upsertFact(db, f) {
  await db.prepare(`
    INSERT INTO cms_donations
      (stripe_payment_id, amount_cents, currency, project, donor_email, donor_name, status, recurring,
       stripe_customer_id, stripe_invoice_id, amount_refunded_cents, source, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(stripe_payment_id) DO UPDATE SET
      amount_cents = CASE WHEN excluded.amount_cents > 0 THEN excluded.amount_cents ELSE cms_donations.amount_cents END,
      currency = COALESCE(cms_donations.currency, excluded.currency),
      project = COALESCE(cms_donations.project, excluded.project),
      donor_email = COALESCE(cms_donations.donor_email, excluded.donor_email),
      donor_name = COALESCE(cms_donations.donor_name, excluded.donor_name),
      recurring = MAX(COALESCE(cms_donations.recurring, 0), excluded.recurring),
      stripe_customer_id = COALESCE(cms_donations.stripe_customer_id, excluded.stripe_customer_id),
      stripe_invoice_id = COALESCE(cms_donations.stripe_invoice_id, excluded.stripe_invoice_id),
      amount_refunded_cents = MAX(COALESCE(cms_donations.amount_refunded_cents, 0), excluded.amount_refunded_cents),
      status = CASE WHEN ${STATUS_RANK_SQL('excluded.status')} > ${STATUS_RANK_SQL('cms_donations.status')}
                    THEN excluded.status ELSE cms_donations.status END,
      source = CASE WHEN COALESCE(cms_donations.source, '') = '' THEN excluded.source ELSE cms_donations.source END,
      updated_at = datetime('now')
  `).bind(
    f.paymentIntent,
    f.amountCents || 0,
    (f.currency || 'usd').toLowerCase(),
    f.project || null,
    f.email || null,
    f.name || null,
    f.status,
    f.recurring ? 1 : 0,
    f.customer || null,
    f.invoice || null,
    f.refundedCents || 0,
    f.source,
  ).run();
  await reconcile(db, { paymentIntent: f.paymentIntent });
}

async function upsertLink(db, key, l) {
  await db.prepare(`
    INSERT INTO cms_donation_links
      (link_key, project, donor_email, donor_name, recurring, stripe_customer_id,
       stripe_subscription_id, stripe_invoice_id, stripe_checkout_session_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(link_key) DO UPDATE SET
      project = COALESCE(excluded.project, cms_donation_links.project),
      donor_email = COALESCE(excluded.donor_email, cms_donation_links.donor_email),
      donor_name = COALESCE(excluded.donor_name, cms_donation_links.donor_name),
      recurring = COALESCE(excluded.recurring, cms_donation_links.recurring),
      stripe_customer_id = COALESCE(excluded.stripe_customer_id, cms_donation_links.stripe_customer_id),
      stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, cms_donation_links.stripe_subscription_id),
      stripe_invoice_id = COALESCE(excluded.stripe_invoice_id, cms_donation_links.stripe_invoice_id),
      stripe_checkout_session_id = COALESCE(excluded.stripe_checkout_session_id, cms_donation_links.stripe_checkout_session_id),
      updated_at = datetime('now')
  `).bind(
    key,
    l.project || null,
    l.email || null,
    l.name || null,
    l.recurring === undefined || l.recurring === null ? null : (l.recurring ? 1 : 0),
    l.customer || null,
    l.subscription || null,
    l.invoice || null,
    l.checkoutSession || null,
  ).run();
}

const LINK_TARGETS = { pi: 'stripe_payment_id', in: 'stripe_invoice_id', sub: 'stripe_subscription_id', cus: 'stripe_customer_id' };

async function reconcileByLinkKeys(db, keys) {
  const piIds = new Set();
  for (const key of keys) {
    const [kind, id] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    const col = LINK_TARGETS[kind];
    if (!col || !id) continue;
    const { results } = await db.prepare(`SELECT stripe_payment_id FROM cms_donations WHERE ${col} = ?`).bind(id).all();
    for (const r of results || []) piIds.add(r.stripe_payment_id);
  }
  for (const pi of piIds) await reconcile(db, { paymentIntent: pi });
}

/** Merge link context onto one fact. Precedence: pi > in > sub > cus (most to least specific). */
async function reconcile(db, { paymentIntent }) {
  const row = await db.prepare('SELECT * FROM cms_donations WHERE stripe_payment_id = ?').bind(paymentIntent).first();
  if (!row) return;

  const merged = {};
  const visited = new Set();
  const queue = [`pi:${paymentIntent}`];
  if (row.stripe_invoice_id) queue.push(`in:${row.stripe_invoice_id}`);
  if (row.stripe_subscription_id) queue.push(`sub:${row.stripe_subscription_id}`);

  // Walk pi → in → sub (links may reveal the next hop), then fall back to customer.
  for (let i = 0; i < queue.length; i++) {
    const key = queue[i];
    if (visited.has(key)) continue;
    visited.add(key);
    const link = await db.prepare('SELECT * FROM cms_donation_links WHERE link_key = ?').bind(key).first();
    if (!link) continue;
    mergeInto(merged, link);
    if (link.stripe_invoice_id) queue.push(`in:${link.stripe_invoice_id}`);
    if (link.stripe_subscription_id) queue.push(`sub:${link.stripe_subscription_id}`);
  }
  const customer = row.stripe_customer_id || merged.stripe_customer_id;
  if (customer) {
    const link = await db.prepare('SELECT * FROM cms_donation_links WHERE link_key = ?').bind(`cus:${customer}`).first();
    if (link) mergeInto(merged, link);
  }

  const recurring = row.recurring === 1 ? 1 : (merged.recurring ?? row.recurring ?? 0);
  await db.prepare(`
    UPDATE cms_donations SET
      project = COALESCE(project, ?),
      donor_email = COALESCE(donor_email, ?),
      donor_name = COALESCE(donor_name, ?),
      recurring = ?,
      stripe_customer_id = COALESCE(stripe_customer_id, ?),
      stripe_subscription_id = COALESCE(stripe_subscription_id, ?),
      stripe_invoice_id = COALESCE(stripe_invoice_id, ?),
      stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, ?),
      updated_at = datetime('now')
    WHERE stripe_payment_id = ?
  `).bind(
    merged.project ?? null,
    merged.donor_email ?? null,
    merged.donor_name ?? null,
    recurring,
    merged.stripe_customer_id ?? null,
    merged.stripe_subscription_id ?? null,
    merged.stripe_invoice_id ?? null,
    merged.stripe_checkout_session_id ?? null,
    paymentIntent,
  ).run();
}

function mergeInto(merged, link) {
  for (const k of ['project', 'donor_email', 'donor_name', 'recurring', 'stripe_customer_id',
    'stripe_subscription_id', 'stripe_invoice_id', 'stripe_checkout_session_id']) {
    if (merged[k] === undefined && link[k] !== null && link[k] !== undefined && link[k] !== '') merged[k] = link[k];
  }
}

// ── Event dispatch ───────────────────────────────────────────────────────────

/**
 * Apply one verified Stripe event. Throws on D1 failure so the caller can return
 * a non-2xx and let Stripe retry; every write is idempotent.
 * Returns { duplicate: boolean }.
 */
export async function applyStripeEvent(db, event) {
  await ensureDonationLedgerSchema(db);

  if (event.id) {
    const seen = await db.prepare('SELECT 1 AS x FROM stripe_webhook_events WHERE event_id = ?').bind(event.id).first();
    if (seen) return { duplicate: true };
  }

  const obj = event.data?.object;
  if (obj) await dispatch(db, event.type, obj);

  if (event.id) {
    await db.prepare(`
      INSERT OR IGNORE INTO stripe_webhook_events (event_id, event_type, livemode, stripe_created)
      VALUES (?, ?, ?, ?)
    `).bind(event.id, event.type || '', event.livemode ? 1 : 0, event.created || null).run();
  }
  return { duplicate: false };
}

async function dispatch(db, type, obj) {
  switch (type) {
    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed': {
      if (!obj.id) return;
      const md = obj.metadata || {};
      const succeeded = type === 'payment_intent.succeeded';
      await upsertFact(db, {
        paymentIntent: obj.id,
        amountCents: succeeded ? (obj.amount_received || obj.amount) : obj.amount,
        currency: obj.currency,
        status: succeeded ? 'succeeded' : 'failed',
        project: md.project || null,
        email: obj.receipt_email || null,
        recurring: Boolean(idOf(obj.invoice)) || md.recurring === 'true' || md.type === 'monthly',
        customer: idOf(obj.customer),
        invoice: idOf(obj.invoice),
        source: 'payment_intent',
      });
      return;
    }

    case 'charge.refunded': {
      const pi = idOf(obj.payment_intent);
      if (!pi) return;
      await upsertFact(db, {
        paymentIntent: pi,
        amountCents: obj.amount,
        currency: obj.currency,
        status: obj.refunded ? 'refunded' : 'partially_refunded',
        refundedCents: obj.amount_refunded || 0,
        email: obj.billing_details?.email || obj.receipt_email || null,
        name: obj.billing_details?.name || null,
        customer: idOf(obj.customer),
        invoice: idOf(obj.invoice),
        source: 'charge',
      });
      return;
    }

    case 'checkout.session.completed':
    case 'checkout.session.async_payment_succeeded': {
      const isSub = obj.mode === 'subscription';
      const ctx = {
        project: obj.metadata?.project || null,
        email: obj.customer_details?.email || obj.customer_email || null,
        name: obj.customer_details?.name || null,
        customer: idOf(obj.customer),
        subscription: idOf(obj.subscription),
        invoice: idOf(obj.invoice),
        checkoutSession: obj.id || null,
      };
      const keys = [];
      const pi = idOf(obj.payment_intent);
      if (pi) keys.push([`pi:${pi}`, { ...ctx, recurring: isSub }]);
      if (ctx.invoice) keys.push([`in:${ctx.invoice}`, { ...ctx, recurring: isSub }]);
      const scoped = { ...ctx, invoice: null, checkoutSession: null };
      if (ctx.subscription) keys.push([`sub:${ctx.subscription}`, { ...scoped, recurring: true }]);
      // Customer context carries identity always, but recurring only for subscriptions.
      if (ctx.customer) keys.push([`cus:${ctx.customer}`, { ...scoped, recurring: isSub ? true : null }]);
      for (const [key, l] of keys) await upsertLink(db, key, l);
      await reconcileByLinkKeys(db, keys.map(([k]) => k));
      return;
    }

    case 'invoice.paid':
    case 'invoice.payment_succeeded': {
      if (!obj.id) return;
      const subscription = invoiceSubscription(obj);
      const ctx = {
        project: invoiceProject(obj),
        email: obj.customer_email || null,
        name: obj.customer_name || null,
        customer: idOf(obj.customer),
        subscription,
        invoice: obj.id,
        recurring: subscription ? true : null,
      };
      const keys = [`in:${obj.id}`];
      await upsertLink(db, `in:${obj.id}`, ctx);
      for (const pi of invoicePaymentIntents(obj)) {
        keys.push(`pi:${pi}`);
        await upsertLink(db, `pi:${pi}`, ctx);
      }
      if (subscription) {
        keys.push(`sub:${subscription}`);
        await upsertLink(db, `sub:${subscription}`, { ...ctx, invoice: null });
      }
      await reconcileByLinkKeys(db, keys);
      return;
    }

    default:
      return;
  }
}
