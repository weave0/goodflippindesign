import healthTargetsConfig from '../config/health-targets.json';

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
 * Last results:   GET /last      — returns last 100 rows from D1 as JSON
 *
 * Required secrets (set via wrangler secret put, see wrangler-health-sweep.toml):
 *   GITHUB_TOKEN  — Fine-grained PAT, weave0/goodflippindesign, Issues: Write
 *   (SWEEP_SECRET removed — trigger is open but D1-rate-limited to prevent spam)
 */

// ── Ecosystem targets ─────────────────────────────────────────────────────────
// Shared source of truth with the GitHub workflow and the local PowerShell checker.
const TARGETS = healthTargetsConfig.targets.filter((target) => target.cloudflareSweep);

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
        .prepare('SELECT * FROM health_checks ORDER BY checked_at DESC LIMIT 100')
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
      content_detail: null,
      finding_kind: 'probe_exception',
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
export async function checkTarget(target) {
  const start      = Date.now();
  const controller = new AbortController();
  const timer      = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const extraHeaders = target.cookie ? { Cookie: target.cookie } : {};

    const fetchUrl = target.cloudflareSweepUrl || target.sweepUrl || target.url;

    const resp = await fetch(fetchUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GFDHealthCheck/1.0; +https://goodflippindesign.com)',
        'Accept': 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
        ...extraHeaders,
      },
    });
    clearTimeout(timer);

    const elapsed = Date.now() - start;
    const h       = resp.headers;

    // Content validation. Prefer a versioned machine contract when one is
    // configured; fall back to a bounded keyword check for legacy properties.
    let keyword_found = null;
    let content_detail = null;
    const keyword = target.expectedKeyword || null;
    const machineContract = target.machineContract || null;

    if (machineContract && resp.ok) {
      try {
        const payload = await resp.json();
        const mismatches = Object.entries(machineContract)
          .filter(([key, expected]) => payload?.[key] !== expected)
          .map(([key, expected]) => `${key} expected ${JSON.stringify(expected)}, got ${JSON.stringify(payload?.[key])}`);
        keyword_found = mismatches.length === 0 ? 1 : 0;
        content_detail = mismatches.length === 0 ? null : mismatches.join('; ');
      } catch (err) {
        keyword_found = 0;
        content_detail = `invalid machine-health JSON: ${err.message}`;
      }
    } else if (keyword && resp.ok) {
      try {
        const text = await resp.text();
        // Only scan first 50KB to avoid memory issues on large pages.
        const slice = text.substring(0, 51200);
        keyword_found = slice.includes(keyword) ? 1 : 0;
      } catch {
        keyword_found = null;
      }
    }

    let overall_status;
    let finding_kind = null;
    if (!resp.ok) {
      overall_status = 'fail';
      finding_kind = 'http_failure';
    } else if (keyword_found === 0) {
      overall_status = 'warn';
      finding_kind = machineContract ? 'machine_contract_mismatch' : 'content_mismatch';
    } else if (elapsed >= FAIL_MS) {
      overall_status = 'fail';
      finding_kind = 'latency_failure';
    } else if (elapsed >= WARN_MS) {
      overall_status = 'warn';
      finding_kind = 'latency_warning';
    } else {
      overall_status = 'pass';
    }

    return {
      status_code:       resp.status,
      response_time_ms:  elapsed,
      is_https:          target.url.startsWith('https://') ? 1 : 0,
      redirect_to_https: resp.url.startsWith('https://') ? 1 : 0,
      final_url:         resp.url !== target.url ? resp.url : null,
      redirect_count:    resp.redirected ? 1 : 0,   // Workers fetch API doesn't expose exact count
      content_type:      h.get('content-type') || null,
      has_csp:           h.has('content-security-policy') ? 1 : 0,
      has_x_frame:       h.has('x-frame-options') ? 1 : 0,
      has_hsts:          h.has('strict-transport-security') ? 1 : 0,
      has_xcto:          h.has('x-content-type-options') ? 1 : 0,
      content_keyword:   machineContract ? `machine:${machineContract.contract || 'health'}` : keyword,
      keyword_found,
      content_detail,
      finding_kind,
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
      final_url:         null,
      redirect_count:    0,
      content_type:      null,
      has_csp:           0,
      has_x_frame:       0,
      has_hsts:          0,
      has_xcto:          0,
      content_keyword:   target.machineContract ? `machine:${target.machineContract.contract || 'health'}` : (target.expectedKeyword || null),
      keyword_found:     null,
      content_detail:    null,
      finding_kind:      err.name === 'AbortError' ? 'timeout' : 'network_failure',
      error:             err.name === 'AbortError' ? `Timeout after ${TIMEOUT_MS}ms` : err.message,
      overall_status:    'fail',
    };
  }
}

// ── D1 persistence ────────────────────────────────────────────────────────────
async function persistChecks(db, checkedAt, checks) {
  const stmt = db.prepare(`
    INSERT INTO health_checks
      (checked_at, brand, name, url, check_type, status_code, response_time_ms,
       is_https, redirect_to_https, final_url, redirect_count, content_type,
       has_csp, has_x_frame, has_hsts, has_xcto,
       content_keyword, keyword_found, error, overall_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  await db.batch(
    checks.map(c => stmt.bind(
      checkedAt,
      c.target.brand,
      c.target.name,
      c.target.url,
      c.target.checkType || 'page',
      c.status_code,
      c.response_time_ms,
      c.is_https,
      c.redirect_to_https,
      c.final_url,
      c.redirect_count,
      c.content_type,
      c.has_csp,
      c.has_x_frame,
      c.has_hsts,
      c.has_xcto,
      c.content_keyword,
      c.keyword_found,
      c.error,
      c.overall_status,
    ))
  );
}

// ── GitHub Issue reporter ─────────────────────────────────────────────────────
export async function reportToGitHub(checks, checkedAt, env) {
  const openIssuesResp = await fetch(
    `https://api.github.com/repos/${GH_REPO}/issues?state=open&labels=health-sweep&per_page=100`,
    { headers: ghHeaders(env.GITHUB_TOKEN) }
  );
  if (!openIssuesResp.ok) {
    throw new Error(`GitHub issue listing failed (${openIssuesResp.status}): ${await openIssuesResp.text()}`);
  }

  const openIssues = (await openIssuesResp.json()).filter(issue => !issue.pull_request);
  const managed = openIssues
    .map(issue => ({ issue, marker: parseHealthIncidentMarker(issue.body || '') }))
    .filter(entry => entry.marker);

  const activeKeys = new Set();

  for (const check of checks) {
    if (check.overall_status === 'pass') continue;

    const findingKey = healthFindingKey(check);
    activeKeys.add(findingKey);
    const existing = managed.find(entry => entry.marker.findingKey === findingKey);
    const occurrence = existing ? existing.marker.occurrences + 1 : 1;
    const firstSeen = existing?.marker.firstSeen || checkedAt;
    const body = buildHealthIncidentBody(check, {
      findingKey,
      firstSeen,
      lastSeen: checkedAt,
      occurrences: occurrence,
      lifecycle: 'detected',
    });
    const title = buildHealthIncidentTitle(check);

    if (existing) {
      const response = await fetch(`https://api.github.com/repos/${GH_REPO}/issues/${existing.issue.number}`, {
        method: 'PATCH',
        headers: ghHeaders(env.GITHUB_TOKEN),
        body: JSON.stringify({ title, body }),
      });
      if (!response.ok) {
        throw new Error(`GitHub incident update failed (${response.status}): ${await response.text()}`);
      }
      console.log(`[health-sweep] Updated incident #${existing.issue.number}: ${findingKey}`);
    } else {
      const response = await fetch(`https://api.github.com/repos/${GH_REPO}/issues`, {
        method: 'POST',
        headers: ghHeaders(env.GITHUB_TOKEN),
        body: JSON.stringify({
          title,
          body,
          labels: ['health-sweep', 'automated', 'needs-attention'],
        }),
      });
      if (!response.ok) {
        throw new Error(`GitHub incident creation failed (${response.status}): ${await response.text()}`);
      }
      const issue = await response.json();
      console.log(`[health-sweep] Created incident #${issue.number}: ${findingKey}`);
    }
  }

  // A target that is currently healthy closes any managed incident previously
  // opened for that target. If the target is still degraded for a different
  // reason, only superseded finding kinds are closed.
  for (const entry of managed) {
    const targetCheck = checks.find(check => check.target.id === entry.marker.targetId);
    if (!targetCheck) continue;

    const stillActive = activeKeys.has(entry.marker.findingKey);
    if (stillActive) continue;

    const targetHasActiveFinding = targetCheck.overall_status !== 'pass';
    const resolvedAt = checkedAt;
    const resolvedBody = (entry.issue.body || '')
      .replace(/lifecycle: [^\n]+/, 'lifecycle: resolved')
      .replace(/resolved-at: [^\n]+/, `resolved-at: ${resolvedAt}`);

    const response = await fetch(`https://api.github.com/repos/${GH_REPO}/issues/${entry.issue.number}`, {
      method: 'PATCH',
      headers: ghHeaders(env.GITHUB_TOKEN),
      body: JSON.stringify({
        state: 'closed',
        state_reason: 'completed',
        body: resolvedBody.includes('resolved-at:')
          ? resolvedBody
          : `${resolvedBody}\nresolved-at: ${resolvedAt}\n`,
      }),
    });
    if (!response.ok) {
      throw new Error(`GitHub incident resolution failed (${response.status}): ${await response.text()}`);
    }
    console.log(
      `[health-sweep] Resolved incident #${entry.issue.number}: ${entry.marker.findingKey}` +
      (targetHasActiveFinding ? ' (superseded by another active finding)' : '')
    );
  }

  const failing = checks.filter(c => c.overall_status === 'fail').length;
  const warning = checks.filter(c => c.overall_status === 'warn').length;
  const passing = checks.length - failing - warning;
  console.log(`[health-sweep] ${checkedAt} — ${passing} pass, ${warning} warn, ${failing} fail`);
}

export function healthFindingKey(check) {
  const targetId = check?.target?.id;
  const kind = check?.finding_kind;
  if (!targetId || !kind) throw new Error('health finding requires target.id and finding_kind');
  return `health:${targetId}:${kind}`;
}

export function buildHealthIncidentTitle(check) {
  const severity = check.overall_status === 'fail' ? 'FAIL' : 'WARN';
  return `[health:${check.target.id}] ${severity} · ${check.target.name} · ${check.finding_kind}`;
}

export function buildHealthIncidentBody(check, state) {
  const evidence = [];
  if (check.status_code != null) evidence.push(`HTTP ${check.status_code}`);
  if (check.response_time_ms != null) evidence.push(`${check.response_time_ms}ms`);
  if (check.error) evidence.push(check.error);
  if (check.content_detail) evidence.push(check.content_detail);
  if (check.keyword_found === 0 && !check.content_detail) {
    evidence.push(`missing expected content ${JSON.stringify(check.content_keyword)}`);
  }

  return [
    '## Estate health incident',
    '',
    `**Property:** \`${check.target.id}\``,
    `**Target:** [${check.target.name}](${check.target.url})`,
    `**Condition:** \`${check.finding_kind}\``,
    `**Current status:** \`${check.overall_status}\``,
    `**Evidence:** ${evidence.join(' · ') || 'degraded health contract'}`,
    '',
    '### Verification condition',
    'Run the same configured health probe again and require this finding key to be absent.',
    '',
    '<!-- gfd-health-incident',
    `health-finding-key: ${state.findingKey}`,
    `target-id: ${check.target.id}`,
    `finding-kind: ${check.finding_kind}`,
    `first-seen: ${state.firstSeen}`,
    `last-seen: ${state.lastSeen}`,
    `occurrences: ${state.occurrences}`,
    `lifecycle: ${state.lifecycle}`,
    'resolved-at: null',
    '-->',
  ].join('\n');
}

export function parseHealthIncidentMarker(body) {
  const block = body.match(/<!-- gfd-health-incident\n([\s\S]*?)\n-->/);
  if (!block) return null;

  const values = Object.fromEntries(
    block[1]
      .split('\n')
      .map(line => {
        const separator = line.indexOf(': ');
        return separator < 0
          ? null
          : [line.slice(0, separator), line.slice(separator + 2)];
      })
      .filter(Boolean)
  );

  const occurrences = Number.parseInt(values['occurrences'] || '0', 10);
  if (!values['health-finding-key'] || !values['target-id'] || !Number.isFinite(occurrences)) return null;

  return {
    findingKey: values['health-finding-key'],
    targetId: values['target-id'],
    findingKind: values['finding-kind'] || null,
    firstSeen: values['first-seen'] || null,
    lastSeen: values['last-seen'] || null,
    occurrences,
    lifecycle: values['lifecycle'] || null,
  };
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
