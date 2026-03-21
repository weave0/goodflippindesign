/**
 * GFD Cron Agent Worker — Zero-cost background automations
 *
 * Runs on 3 schedules (configured in wrangler-cron.toml):
 *   0 * * * *     → Hourly: Ecosystem health sweep + auto-flag failing endpoints
 *   0 9 * * *     → Daily:  Auto-resolver — close stale cron-generated ops flags
 *   0 0 * * MON   → Weekly: Studio digest — write metric snapshot to D1
 *
 * Requires D1 binding: DB (gfd_community)
 * Deploy: wrangler deploy --config wrangler-cron.toml
 */

// ── Ecosystem endpoints to monitor ───────────────────────────────────────────
const ENDPOINTS = [
  { brand: 'gfd', name: 'Good Flippin Design',    url: 'https://goodflippindesign.com' },
  { brand: 'gfv', name: 'Good Flippin Vibes',     url: 'https://goodflippinvibes.com' },
  { brand: 'cs',  name: 'CultureSherpa',          url: 'https://www.culturesherpa.org' },
  { brand: 'gd',  name: 'GlobalDeets',            url: 'https://globaldeets.com' },
  { brand: 'gfd', name: 'GFD Stripe Worker',      url: 'https://gfd-stripe.weave0.workers.dev' },
  { brand: 'gfd', name: 'GFD Auth API',           url: 'https://goodflippindesign.com/api/health' },
  { brand: 'gfv', name: 'GFV Community API',      url: 'https://gfv-community.weave0.workers.dev' },
  { brand: 'gfv', name: 'GFV Gratitude Wall',     url: 'https://gfv-gratitude-wall.weave0.workers.dev' },
];

const TIMEOUT_MS = 8000;

// ── Helpers ───────────────────────────────────────────────────────────────────
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function pingEndpoint(endpoint) {
  const start = Date.now();
  try {
    const res = await fetch(endpoint.url, {
      method:  'HEAD',
      signal:  AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'User-Agent': 'GFD-CronAgent/1.0 (health-check)' },
    });
    const ms = Date.now() - start;
    const ok = res.status < 400;
    return {
      ...endpoint,
      status_code:      res.status,
      response_time_ms: ms,
      is_https:         endpoint.url.startsWith('https') ? 1 : 0,
      has_csp:          res.headers.has('content-security-policy') ? 1 : 0,
      has_x_frame:      res.headers.has('x-frame-options') ? 1 : 0,
      has_hsts:         res.headers.has('strict-transport-security') ? 1 : 0,
      has_xcto:         res.headers.has('x-content-type-options') ? 1 : 0,
      overall_status:   ok ? 'pass' : 'fail',
      error:            null,
      ok,
    };
  } catch (err) {
    return {
      ...endpoint,
      status_code:      null,
      response_time_ms: Date.now() - start,
      is_https:         endpoint.url.startsWith('https') ? 1 : 0,
      has_csp:          0,
      has_x_frame:      0,
      has_hsts:         0,
      has_xcto:         0,
      overall_status:   'fail',
      error:            err.message || 'Network error',
      ok:               false,
    };
  }
}

async function ensureSchemas(db) {
  // health_checks — see d1-schema-health.sql (already applied)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS health_checks (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      checked_at        TEXT    NOT NULL,
      brand             TEXT    NOT NULL,
      name              TEXT    NOT NULL,
      url               TEXT    NOT NULL,
      status_code       INTEGER,
      response_time_ms  INTEGER,
      is_https          INTEGER DEFAULT 1,
      redirect_to_https INTEGER DEFAULT 0,
      has_csp           INTEGER DEFAULT 0,
      has_x_frame       INTEGER DEFAULT 0,
      has_hsts          INTEGER DEFAULT 0,
      has_xcto          INTEGER DEFAULT 0,
      error             TEXT,
      overall_status    TEXT    NOT NULL DEFAULT 'pass',
      created_at        TEXT    DEFAULT (datetime('now'))
    )
  `).run();

  // studio_config — see d1-schema-studio.sql (already applied)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS studio_config (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  // admin_ops — see cms.js ensureAdminOpsSchema (already applied)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS admin_ops (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL,
      severity    TEXT NOT NULL DEFAULT 'normal',
      brand       TEXT DEFAULT 'all',
      area        TEXT DEFAULT 'General',
      detail      TEXT DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT DEFAULT NULL
    )
  `).run();
}

// ── Cron Job 1: Hourly health sweep ──────────────────────────────────────────
async function runHealthSweep(env) {
  const db = env.DB;
  await ensureSchemas(db);

  const now = new Date().toISOString();
  const results = await Promise.allSettled(ENDPOINTS.map(pingEndpoint));
  const checks  = results.map((r) => r.status === 'fulfilled' ? r.value : { ...ENDPOINTS[results.indexOf(r)], ok: false, error: 'Promise rejected', overall_status: 'fail', status_code: null, response_time_ms: null });

  // Write health_checks rows
  const stmt = db.prepare(`
    INSERT INTO health_checks
      (checked_at, brand, name, url, status_code, response_time_ms, is_https,
       has_csp, has_x_frame, has_hsts, has_xcto, error, overall_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  await db.batch(checks.map((c) => stmt.bind(
    now, c.brand, c.name, c.url,
    c.status_code ?? null, c.response_time_ms ?? null,
    c.is_https ?? 1, c.has_csp ?? 0, c.has_x_frame ?? 0,
    c.has_hsts ?? 0, c.has_xcto ?? 0,
    c.error ?? null, c.overall_status
  )));

  // Auto-flag failing endpoints in admin_ops (upsert by deterministic ID)
  const failingChecks = checks.filter((c) => !c.ok);
  const passingIds    = checks.filter((c) => c.ok).map((c) => `cron-health-${slugify(c.name)}`);

  for (const c of failingChecks) {
    const id    = `cron-health-${slugify(c.name)}`;
    const title = `[CRON] ${c.name} health check failing (HTTP ${c.status_code ?? 'timeout'})`;
    const detail = c.error ? `Error: ${c.error}` : `Returned HTTP ${c.status_code}. Checked at ${now}.`;
    await db.prepare(`
      INSERT INTO admin_ops (id, title, severity, brand, area, detail, created_at, updated_at)
      VALUES (?, ?, 'critical', ?, 'Ecosystem Health', ?, datetime('now'), datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        title      = excluded.title,
        detail     = excluded.detail,
        updated_at = excluded.updated_at,
        completed_at = NULL
    `).bind(id, title, c.brand, detail).run();
  }

  // Auto-close ops flags for endpoints that are now passing
  for (const id of passingIds) {
    await db.prepare(`
      UPDATE admin_ops
      SET completed_at = datetime('now'), updated_at = datetime('now'),
          detail = detail || ' [Auto-resolved by cron agent ' || ? || ']'
      WHERE id = ? AND completed_at IS NULL
    `).bind(now, id).run();
  }

  // Prune health_checks older than 30 days to keep D1 lean
  await db.prepare(`
    DELETE FROM health_checks WHERE checked_at < datetime('now', '-30 days')
  `).run();

  // Record last sweep time
  await db.prepare(`
    INSERT INTO studio_config (key, value, updated_at)
    VALUES ('cron_last_health_sweep', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(now).run();

  console.log(`[cron-agent] Health sweep done. ${failingChecks.length} failing, ${passingIds.length} passing.`);
}

// ── Cron Job 2: Daily auto-resolver ──────────────────────────────────────────
// Auto-closes cron-generated ops flags that have been open for more than 3 days
// without recurrence (i.e., the endpoint has started passing again but the flag
// wasn't closed because the cron hadn't run since).
async function runAutoResolver(env) {
  const db = env.DB;
  await ensureSchemas(db);

  // Close cron-generated flags older than 3 days (stale — endpoint likely recovered)
  const result = await db.prepare(`
    UPDATE admin_ops
    SET completed_at = datetime('now'),
        updated_at   = datetime('now'),
        detail       = detail || ' [Auto-closed: stale cron flag older than 3 days]'
    WHERE id LIKE 'cron-%'
      AND completed_at IS NULL
      AND created_at < datetime('now', '-3 days')
  `).run();

  // Also close duplicate cron health flags (same endpoint, more than one open row)
  // Keeps only the most recent one
  await db.prepare(`
    UPDATE admin_ops SET completed_at = datetime('now'), updated_at = datetime('now')
    WHERE id LIKE 'cron-health-%'
      AND completed_at IS NULL
      AND rowid NOT IN (
        SELECT MIN(rowid) FROM admin_ops
        WHERE id LIKE 'cron-health-%' AND completed_at IS NULL
        GROUP BY id
      )
  `).run();

  const closed = result.meta?.changes ?? 0;
  console.log(`[cron-agent] Auto-resolver: closed ${closed} stale flag(s).`);
}

// ── Cron Job 3: Weekly studio digest ─────────────────────────────────────────
// Reads current D1 metric counts and writes a JSON snapshot to studio_config.
// The Studio HQ Self-Advisor can surface this without any extra API call.
async function runWeeklyDigest(env) {
  const db = env.DB;
  await ensureSchemas(db);

  const week = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Gather counts in parallel
  const [assets, posts, variants, ops, health, profiles, donations] = await Promise.all([
    db.prepare(`SELECT COUNT(*) as n FROM cms_assets WHERE review_status = 'approved'`).first().catch(() => ({ n: 0 })),
    db.prepare(`SELECT COUNT(*) as n FROM cms_social_posts`).first().catch(() => ({ n: 0 })),
    db.prepare(`SELECT COUNT(*) as n FROM cms_social_posts WHERE status = 'scheduled'`).first().catch(() => ({ n: 0 })),
    db.prepare(`SELECT COUNT(*) as n FROM admin_ops WHERE completed_at IS NULL`).first().catch(() => ({ n: 0 })),
    db.prepare(`SELECT COUNT(*) as n FROM health_checks WHERE checked_at > datetime('now', '-7 days') AND overall_status = 'fail'`).first().catch(() => ({ n: 0 })),
    db.prepare(`SELECT COUNT(*) as n FROM community_profiles`).first().catch(() => ({ n: 0 })),
    db.prepare(`SELECT COALESCE(SUM(amount_cents),0) as n FROM cms_donations`).first().catch(() => ({ n: 0 })),
  ]);

  const digest = {
    week,
    generated_at:        new Date().toISOString(),
    approved_assets:     assets?.n ?? 0,
    total_posts:         posts?.n ?? 0,
    scheduled_variants:  variants?.n ?? 0,
    open_ops_flags:      ops?.n ?? 0,
    health_failures_7d:  health?.n ?? 0,
    community_members:   profiles?.n ?? 0,
    donations_total_cents: donations?.n ?? 0,
  };

  await db.prepare(`
    INSERT INTO studio_config (key, value, updated_at)
    VALUES ('weekly_digest', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).bind(JSON.stringify(digest)).run();

  console.log(`[cron-agent] Weekly digest written for ${week}:`, digest);
}

// ── Worker export ─────────────────────────────────────────────────────────────
export default {
  // Cron trigger handler — called by Cloudflare scheduler
  async scheduled(event, env, ctx) {
    const cron = event.cron;
    console.log(`[cron-agent] Triggered by schedule: ${cron}`);

    if (cron === '0 * * * *') {
      ctx.waitUntil(runHealthSweep(env));
    } else if (cron === '0 9 * * *') {
      ctx.waitUntil(runAutoResolver(env));
    } else if (cron === '0 0 * * MON') {
      ctx.waitUntil(runWeeklyDigest(env));
    }
  },

  // Minimal HTTP handler — allows manual trigger via authenticated GET
  // e.g. GET /trigger/health | /trigger/resolver | /trigger/digest
  async fetch(request, env) {
    const url = new URL(request.url);

    // Basic token guard — use the same CLERK_SECRET_KEY as auth worker
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ') || auth.replace('Bearer ', '') !== env.CRON_TRIGGER_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }

    if (url.pathname === '/trigger/health') {
      await runHealthSweep(env);
      return new Response(JSON.stringify({ ok: true, job: 'health-sweep' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.pathname === '/trigger/resolver') {
      await runAutoResolver(env);
      return new Response(JSON.stringify({ ok: true, job: 'auto-resolver' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.pathname === '/trigger/digest') {
      await runWeeklyDigest(env);
      return new Response(JSON.stringify({ ok: true, job: 'weekly-digest' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      name:   'gfd-cron-agent',
      routes: ['/trigger/health', '/trigger/resolver', '/trigger/digest'],
    }), { headers: { 'Content-Type': 'application/json' } });
  },
};
