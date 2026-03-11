/**
 * gfd-health-sweep
 * Cloudflare Worker — daily cron sweep across all GFV LLC ecosystem domains.
 *
 * Checks every owned domain for: HTTP status, response time, HTTPS, CSP,
 * HSTS, X-Frame-Options, X-Content-Type-Options.
 * Writes results to D1 (gfd_community.health_checks).
 * Creates a GitHub Issue with the full report — failures stay open, clean
 * sweeps auto-close immediately so they don't clog the queue.
 *
 * Cron: 0 6 * * * (6 AM UTC daily)
 * Manual trigger: GET /trigger   — open endpoint, rate-limited to 1 per 5 min via D1
 * Last results:   GET /last      — returns last 50 rows from D1 as JSON
 *
 * Required secrets (set via wrangler secret put, see wrangler-health-sweep.toml):
 *   GITHUB_TOKEN  — Fine-grained PAT, weave0/goodflippindesign, Issues: Write
 *   (SWEEP_SECRET removed — trigger is open but D1-rate-limited to prevent spam)
 */

// ── Ecosystem targets ─────────────────────────────────────────────────────────
// Add/remove entries here as the ecosystem grows. brand must match brands.json.
const TARGETS = [
  // ── Good Flippin Design (Cloudflare Pages) ────────────────────────────────
  { brand: 'gfd', name: 'GFD Home',             url: 'https://goodflippindesign.com' },
  { brand: 'gfd', name: 'GFD Community Portal', url: 'https://goodflippindesign.com/community-portal.html' },
  { brand: 'gfd', name: 'GFD Donate',           url: 'https://goodflippindesign.com/donate.html' },
  { brand: 'gfd', name: 'GFD 404',              url: 'https://goodflippindesign.com/404.html' },

  // ── Good Flippin Vibes ────────────────────────────────────────────────────
  { brand: 'gfv', name: 'GFV Home',             url: 'https://goodflippinvibes.com' },

  // ── AI Aimate ─────────────────────────────────────────────────────────────
  { brand: 'aiaimate', name: 'AI Aimate Home',  url: 'https://aiaimate.com' },

  // ── CultureSherpa ─────────────────────────────────────────────────────────
  { brand: 'culturesherpa', name: 'CultureSherpa Home', url: 'https://culturesherpa.org' },

  // ── CitizenApproved ───────────────────────────────────────────────────────
  { brand: 'citizenapproved', name: 'CitizenApproved Home', url: 'https://citizenapproved.org' },

  // ── GlobalDeets ───────────────────────────────────────────────────────────
  { brand: 'globaldeets', name: 'GlobalDeets Home', url: 'https://globaldeets.com' },
];

// Performance thresholds (milliseconds)
const WARN_MS   = 2000;   // ⚠️  degraded — slow but functional
const FAIL_MS   = 8000;   // ❌  unacceptably slow (treat as failure)
const TIMEOUT_MS = 12000; // abort if no response within 12s

// GitHub repo to post health issues to
const GH_REPO = 'weave0/goodflippindesign';

// ── Entry points ──────────────────────────────────────────────────────────────
export default {
  /** Cron-triggered scheduled sweep */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runSweep(env));
  },

  /** HTTP handler — manual trigger + last-results viewer */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS — allow admin panel at goodflippindesign.com to call us directly
    const origin = request.headers.get('origin') || '';
    const corsHeaders = {
      'Access-Control-Allow-Origin': origin.includes('goodflippindesign.com') || origin.includes('localhost') ? origin : 'https://goodflippindesign.com',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '600',
    };
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (url.pathname === '/trigger') {
      // No secret required — this just runs a health check and creates a GitHub Issue.
      // Rate-limited to 1 per 5 minutes via D1 to prevent issue spam.
      if (env.DB) {
        const last = await env.DB
          .prepare(`SELECT checked_at FROM health_checks ORDER BY checked_at DESC LIMIT 1`)
          .first();
        if (last) {
          const elapsedMs = Date.now() - new Date(last.checked_at).getTime();
          if (elapsedMs < 5 * 60 * 1000) {
            const waitSec = Math.ceil((5 * 60 * 1000 - elapsedMs) / 1000);
            return Response.json(
              { status: 'rate_limited', retry_after_seconds: waitSec, last_sweep: last.checked_at },
              { status: 429, headers: { ...corsHeaders, 'Retry-After': String(waitSec) } }
            );
          }
        }
      }
      ctx.waitUntil(runSweep(env));
      return Response.json({ status: 'sweep triggered', ts: new Date().toISOString() }, { headers: corsHeaders });
    }

    if (url.pathname === '/last') {
      // Return recent sweep history from D1
      if (!env.DB) return Response.json({ error: 'DB not configured' }, { status: 503, headers: corsHeaders });
      const { results } = await env.DB
        .prepare('SELECT * FROM health_checks ORDER BY checked_at DESC LIMIT 50')
        .all();
      return Response.json(results || [], { headers: corsHeaders });
    }

    // Basic liveness probe
    return new Response(JSON.stringify({ worker: 'gfd-health-sweep', v: 1, ts: new Date().toISOString() }), {
      headers: { 'content-type': 'application/json', ...corsHeaders }
    });
  }
};

// ── Core sweep orchestrator ───────────────────────────────────────────────────
async function runSweep(env) {
  const checkedAt = new Date().toISOString();

  // Run all checks concurrently — a single slow/dead site won't block others
  const settled = await Promise.allSettled(TARGETS.map(t => checkTarget(t)));

  const checks = settled.map((r, i) => {
    if (r.status === 'fulfilled') {
      return { target: TARGETS[i], ...r.value };
    }
    // Unexpected JS error during check (not network failure — those are caught inside checkTarget)
    return {
      target: TARGETS[i],
      status_code: null,
      response_time_ms: 0,
      is_https: 1,
      redirect_to_https: 0,
      has_csp: 0,
      has_x_frame: 0,
      has_hsts: 0,
      has_xcto: 0,
      error: String(r.reason),
      overall_status: 'fail',
    };
  });

  // Write to D1 (non-blocking — if D1 is unavailable the GitHub report still fires)
  if (env.DB) {
    try {
      await persistChecks(env.DB, checkedAt, checks);
    } catch (err) {
      console.error('[health-sweep] D1 write failed:', err.message);
    }
  }

  // Create GitHub Issue with the full report
  if (env.GITHUB_TOKEN) {
    try {
      await reportToGitHub(checks, checkedAt, env);
    } catch (err) {
      console.error('[health-sweep] GitHub report failed:', err.message);
    }
  } else {
    // Log summary to Worker console when GitHub token isn't set (local dev / first deploy)
    const failing = checks.filter(c => c.overall_status === 'fail');
    const warn    = checks.filter(c => c.overall_status === 'warn');
    console.log(`[health-sweep] ${checkedAt} — ${checks.length - failing.length - warn.length} pass, ${warn.length} warn, ${failing.length} fail`);
    checks.forEach(c => {
      const icon = c.overall_status === 'pass' ? '✅' : c.overall_status === 'warn' ? '⚠️' : '❌';
      console.log(`  ${icon} ${c.target.name}: HTTP ${c.status_code ?? 'ERR'} in ${c.response_time_ms}ms${c.error ? ` — ${c.error}` : ''}`);
    });
  }
}

// ── Individual URL check ──────────────────────────────────────────────────────
async function checkTarget(target) {
  const start      = Date.now();
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(target.url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'GFD-HealthSweep/1.0 (+https://goodflippindesign.com)' },
    });
    clearTimeout(timer);

    const elapsed = Date.now() - start;
    const h       = resp.headers;

    let overall_status;
    if (!resp.ok) {
      overall_status = 'fail';
    } else if (elapsed >= FAIL_MS) {
      overall_status = 'fail';
    } else if (elapsed >= WARN_MS) {
      overall_status = 'warn';
    } else {
      overall_status = 'pass';
    }

    return {
      status_code:       resp.status,
      response_time_ms:  elapsed,
      is_https:          target.url.startsWith('https://') ? 1 : 0,
      redirect_to_https: resp.url.startsWith('https://') ? 1 : 0,
      has_csp:           h.has('content-security-policy') ? 1 : 0,
      has_x_frame:       h.has('x-frame-options') ? 1 : 0,
      has_hsts:          h.has('strict-transport-security') ? 1 : 0,
      has_xcto:          h.has('x-content-type-options') ? 1 : 0,
      error:             null,
      overall_status,
    };
  } catch (err) {
    clearTimeout(timer);
    return {
      status_code:       null,
      response_time_ms:  Date.now() - start,
      is_https:          1,
      redirect_to_https: 0,
      has_csp:           0,
      has_x_frame:       0,
      has_hsts:          0,
      has_xcto:          0,
      error:             err.name === 'AbortError' ? `Timeout after ${TIMEOUT_MS}ms` : err.message,
      overall_status:    'fail',
    };
  }
}

// ── D1 persistence ────────────────────────────────────────────────────────────
async function persistChecks(db, checkedAt, checks) {
  const stmt = db.prepare(`
    INSERT INTO health_checks
      (checked_at, brand, name, url, status_code, response_time_ms,
       is_https, redirect_to_https, has_csp, has_x_frame, has_hsts, has_xcto,
       error, overall_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await db.batch(
    checks.map(c => stmt.bind(
      checkedAt,
      c.target.brand,
      c.target.name,
      c.target.url,
      c.status_code,
      c.response_time_ms,
      c.is_https,
      c.redirect_to_https,
      c.has_csp,
      c.has_x_frame,
      c.has_hsts,
      c.has_xcto,
      c.error,
      c.overall_status,
    ))
  );
}

// ── GitHub Issue reporter ─────────────────────────────────────────────────────
async function reportToGitHub(checks, checkedAt, env) {
  const date    = checkedAt.split('T')[0];
  const failing = checks.filter(c => c.overall_status === 'fail');
  const warning = checks.filter(c => c.overall_status === 'warn');
  const passing = checks.filter(c => c.overall_status === 'pass');
  const allClear = failing.length === 0 && warning.length === 0;

  const icon = failing.length > 0 ? '🚨' : warning.length > 0 ? '⚠️' : '✅';

  // ── Results table ──────────────────────────────────────────────────────────
  const table = [
    '| Status | Brand | Page | HTTP | Time | CSP | HSTS | X-Frame | XCTO |',
    '|--------|-------|------|------|------|-----|------|---------|------|',
    ...checks.map(c => {
      const si = c.overall_status === 'pass' ? '✅' : c.overall_status === 'warn' ? '⚠️' : '❌';
      const sc = c.status_code != null ? String(c.status_code) : 'ERR';
      const rt = c.response_time_ms != null ? `${c.response_time_ms}ms` : '—';
      const yn = v => (v ? '✅' : '❌');
      return `| ${si} | \`${c.target.brand}\` | [${c.target.name}](${c.target.url}) | ${sc} | ${rt} | ${yn(c.has_csp)} | ${yn(c.has_hsts)} | ${yn(c.has_x_frame)} | ${yn(c.has_xcto)} |`;
    }),
  ].join('\n');

  // ── Failure detail block ───────────────────────────────────────────────────
  const failDetail = failing.length > 0
    ? '\n\n### ❌ Failing Endpoints\n' +
      failing.map(c =>
        `- **${c.target.name}** — \`${c.target.url}\`\n  > ${c.error || `HTTP ${c.status_code}`}`
      ).join('\n')
    : '';

  const warnDetail = warning.length > 0
    ? '\n\n### ⚠️ Slow Endpoints (>' + WARN_MS + 'ms)\n' +
      warning.map(c =>
        `- **${c.target.name}** — ${c.response_time_ms}ms`
      ).join('\n')
    : '';

  // ── Issue body ─────────────────────────────────────────────────────────────
  const title = `${icon} Health Sweep — ${date}` +
    (failing.length > 0 ? ` · ${failing.length} failing` : '') +
    (warning.length > 0 ? ` · ${warning.length} slow` : '');

  const body =
    `## ${icon} Ecosystem Health — ${date}\n\n` +
    `**${passing.length}** passing · **${warning.length}** slow · **${failing.length}** failing · ${checks.length} endpoints checked\n\n` +
    table +
    failDetail +
    warnDetail +
    `\n\n---\n<sub>🤖 Automated by [gfd-health-sweep](https://github.com/${GH_REPO}/blob/main/workers/health-sweep.js) · ${checkedAt}</sub>`;

  // Labels: all-clear issues get auto-closed; failures stay open as action items
  const labels = allClear
    ? ['health-sweep', 'automated']
    : ['health-sweep', 'automated', 'needs-attention'];

  // ── Create issue ───────────────────────────────────────────────────────────
  const createResp = await fetch(`https://api.github.com/repos/${GH_REPO}/issues`, {
    method: 'POST',
    headers: ghHeaders(env.GITHUB_TOKEN),
    body: JSON.stringify({ title, body, labels }),
  });

  if (!createResp.ok) {
    const err = await createResp.text();
    throw new Error(`GitHub issue creation failed (${createResp.status}): ${err}`);
  }

  const issue = await createResp.json();
  console.log(`[health-sweep] Created issue #${issue.number}: ${title}`);

  // Auto-close all-clear sweeps — only failures should linger in the queue
  if (allClear) {
    await fetch(`https://api.github.com/repos/${GH_REPO}/issues/${issue.number}`, {
      method: 'PATCH',
      headers: ghHeaders(env.GITHUB_TOKEN),
      body: JSON.stringify({ state: 'closed', state_reason: 'completed' }),
    });
    console.log(`[health-sweep] Auto-closed issue #${issue.number} (all clear)`);
  }
}

// ── Shared GitHub API headers ─────────────────────────────────────────────────
function ghHeaders(token) {
  return {
    'Authorization':        `Bearer ${token}`,
    'Content-Type':         'application/json',
    'Accept':               'application/vnd.github+json',
    'User-Agent':           'gfd-health-sweep/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}
