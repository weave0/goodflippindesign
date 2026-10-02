-- Donation ledger columns, linkage, and webhook event log for gfd_community.
-- Additive and idempotent at the table level; the worker runs the same migration at runtime
-- (workers/donation-ledger.js ensureDonationLedgerSchema). ADD COLUMN statements fail if the
-- column already exists — skip any that error.
ALTER TABLE cms_donations ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE cms_donations ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE cms_donations ADD COLUMN stripe_invoice_id TEXT;
ALTER TABLE cms_donations ADD COLUMN stripe_checkout_session_id TEXT;
ALTER TABLE cms_donations ADD COLUMN amount_refunded_cents INTEGER DEFAULT 0;
ALTER TABLE cms_donations ADD COLUMN source TEXT DEFAULT '';
ALTER TABLE cms_donations ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_donations_status ON cms_donations(status);
CREATE INDEX IF NOT EXISTS idx_donations_created ON cms_donations(created_at);
CREATE INDEX IF NOT EXISTS idx_donations_customer ON cms_donations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_donations_subscription ON cms_donations(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_donations_invoice ON cms_donations(stripe_invoice_id);

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
);

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  livemode INTEGER DEFAULT 0,
  stripe_created INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Payments on the shared Stripe account not (yet) attributable to GFD; no donor PII.
CREATE TABLE IF NOT EXISTS stripe_unclaimed_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_intent TEXT NOT NULL UNIQUE,
  amount_cents INTEGER DEFAULT 0,
  currency TEXT,
  status TEXT,
  amount_refunded_cents INTEGER DEFAULT 0,
  customer_id TEXT,
  invoice_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_unclaimed_customer ON stripe_unclaimed_payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_unclaimed_invoice ON stripe_unclaimed_payments(invoice_id);
