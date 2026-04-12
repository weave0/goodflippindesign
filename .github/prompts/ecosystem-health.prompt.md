---
name: ecosystem-health
description: >
  Run a full-stack health check across the GFD 10-brand ecosystem.
  Checks: all Cloudflare Worker endpoints, CI status for all repos,
  D1 table row counts, Sentry DSN status, and secrets completeness.
  Use when: something feels broken, before a release, weekly operational review,
  or when the admin Overview panel shows red KPIs.
mode: agent
tools: [execute, web]
---

# GFD Ecosystem Health Check

You are an infrastructure diagnostics agent for the Good Flippin Design 10-brand ecosystem.

---

## 1. Live Site Reachability

Perform an HTTP HEAD check on each production URL. Report status code, response time, and any redirects.

| Brand            | URL                            |
| ---------------- | ------------------------------ |
| GFD              | https://goodflippindesign.com  |
| GFV              | https://goodflippinvibes.com   |
| CultureSherpa    | https://culturesherpa.org      |
| AIAimate         | https://aiaimate.com           |
| CitizenApproved  | https://citizenapproved.org    |
| GlobalDeets      | https://globaldeets.com        |
| MN Peace         | https://minnesotapeace.com     |
| Brett Lee Weaver | https://www.brettleeweaver.com |

```powershell
$sites = @(
    'https://goodflippindesign.com',
    'https://goodflippinvibes.com',
    'https://culturesherpa.org',
    'https://aiaimate.com',
    'https://citizenapproved.org',
    'https://globaldeets.com',
    'https://minnesotapeace.com',
    'https://www.brettleeweaver.com'
)
foreach ($url in $sites) {
    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $r = Invoke-WebRequest -Uri $url -Method Head -MaximumRedirection 5 -TimeoutSec 10 -ErrorAction Stop
        $ms = $sw.ElapsedMilliseconds
        Write-Host "✓  $($r.StatusCode)  ${ms}ms  $url"
    } catch {
        Write-Host "✗  ERROR  $url  $($_.Exception.Message)"
    }
}
```

---

## 2. Cloudflare Worker Endpoints

Check each worker's health endpoint. A 200 with `{"ok":true}` is healthy.

| Worker           | Health URL                                               |
| ---------------- | -------------------------------------------------------- |
| Auth worker      | https://goodflippindesign.com/api/health                 |
| Stripe worker    | https://gfd-stripe.weave0.workers.dev/health             |
| Social publisher | Check Cloudflare dashboard — no public health endpoint   |
| Health sweep     | Triggered by cron — check last execution in CF dashboard |

```powershell
$workers = @(
    'https://goodflippindesign.com/api/health',
    'https://gfd-stripe.weave0.workers.dev/health'
)
foreach ($url in $workers) {
    try {
        $r = Invoke-RestMethod -Uri $url -TimeoutSec 10 -ErrorAction Stop
        Write-Host "✓  $url  ok=$($r.ok)"
    } catch {
        Write-Host "✗  $url  $($_.Exception.Message)"
    }
}
```

---

## 3. GitHub CI Status

Check the most recent workflow run for key repos. Use the GitHub API (public repos need no auth).

```powershell
$repos = @(
    @{ owner='weave0'; repo='goodflippindesign' },
    @{ owner='weave0'; repo='good-flippin-vibes' },
    @{ owner='weave0'; repo='CultureSherpa' },
    @{ owner='weave0'; repo='CitizenApproved' },
    @{ owner='weave0'; repo='aiaimate' },
    @{ owner='weave0'; repo='globaldeets' }
)
foreach ($r in $repos) {
    $url = "https://api.github.com/repos/$($r.owner)/$($r.repo)/actions/runs?per_page=1"
    try {
        $data = Invoke-RestMethod -Uri $url -Headers @{ 'User-Agent'='gfd-health-check' } -TimeoutSec 10 -ErrorAction Stop
        $run = $data.workflow_runs[0]
        $icon = if ($run.conclusion -eq 'success') { '✓' } elseif ($run.conclusion -eq 'failure') { '✗' } else { '~' }
        Write-Host "$icon  $($r.repo)  $($run.conclusion ?? $run.status)  $($run.name)"
    } catch {
        Write-Host "?  $($r.repo)  Could not reach GitHub API"
    }
}
```

---

## 4. D1 Database Spot Check

Run a quick row-count query against key tables locally (requires wrangler auth).

```powershell
wrangler d1 execute gfd_community --remote --command="
  SELECT 'cms_assets' as tbl, COUNT(*) as rows FROM cms_assets
  UNION ALL SELECT 'cms_content', COUNT(*) FROM cms_content
  UNION ALL SELECT 'cms_post_variants', COUNT(*) FROM cms_post_variants
  UNION ALL SELECT 'social_accounts', COUNT(*) FROM social_accounts
  UNION ALL SELECT 'cms_donations', COUNT(*) FROM cms_donations
  UNION ALL SELECT 'admin_ops', COUNT(*) FROM admin_ops
  ORDER BY tbl;
"
```

Flag if any table that normally has rows shows 0 (potential data loss indicator).

---

## 5. Secret / Environment Completeness

Cross-reference the secrets inventory at `/memories/repo/secrets-inventory.md` against what's deployed.

```powershell
# List secrets for each worker binding
wrangler pages secret list --project-name goodflippindesign
wrangler secret list --name gfd-stripe
wrangler secret list --name gfv-social-publisher
wrangler secret list --name gfd-health-sweep
wrangler secret list --name gfd-cron
```

Expected secrets per worker:

- **goodflippindesign (Pages)**: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `SENTRY_DSN`
- **gfd-stripe**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **gfv-social-publisher**: `CLERK_SECRET_KEY`, `CRON_SECRET`
- **gfd-health-sweep**: `HEALTH_WEBHOOK_URL`
- **gfd-cron**: `CRON_SECRET`, `CLERK_SECRET_KEY`

Report any missing secrets.

---

## 6. Health Report Summary

After running all checks, produce a summary table:

```
┌─────────────────────────────────────────────────────────────┐
│  GFD Ecosystem Health Report — [DATE]                       │
├─────────────────┬──────────┬──────────────────────────────┤
│ Component       │ Status   │ Notes                        │
├─────────────────┼──────────┼──────────────────────────────┤
│ Live Sites      │ n/8 up   │ [any failures]               │
│ Workers         │ n/2 up   │ [any failures]               │
│ CI (all repos)  │ n/6 pass │ [failing repos]              │
│ D1 Tables       │ OK / ⚠️  │ [suspicious zero counts]     │
│ Secrets         │ OK / ⚠️  │ [missing secrets]            │
└─────────────────┴──────────┴──────────────────────────────┘
```

Highlight any red items with recommended next steps from the skill `/gfd-deploy`.
