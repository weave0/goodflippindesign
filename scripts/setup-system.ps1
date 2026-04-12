#!/usr/bin/env pwsh
# setup-system.ps1 — Configure all Cloudflare secrets and deploy the social publisher
#
# Run this ONCE to make the entire GFD command center functional.
# Prerequisites:
#   - wrangler installed globally (npm i -g wrangler) and logged in (wrangler login)
#   - OAuth developer credentials from each platform dashboard
#   - STRIPE_PUBLISHABLE_KEY already set (skip if done)
#
# Usage:
#   pwsh ./setup-system.ps1
#   pwsh ./setup-system.ps1 -SkipPublisher   # skip deploying the social publisher
#   pwsh ./setup-system.ps1 -SkipPlatformOAuth  # skip platform OAuth (use Manual Token tab)

param(
  [switch]$SkipPublisher,
  [switch]$SkipPlatformOAuth
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Step { param([string]$msg) Write-Host "`n>>> $msg" -ForegroundColor Cyan }
function Write-OK { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn { param([string]$msg) Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Write-Info { param([string]$msg) Write-Host "       $msg" -ForegroundColor Gray }

# ─────────────────────────────────────────────────────────────────
#  Step 1 — Generate shared secrets (TOKEN_ENCRYPTION_KEY, INTERNAL_SECRET)
# ─────────────────────────────────────────────────────────────────
Write-Step "Generating cryptographic secrets"

function New-RandomSecret {
  param([int]$bytes = 32)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $buf = New-Object byte[] $bytes
  $rng.GetBytes($buf)
  return [Convert]::ToBase64String($buf)
}

$tokenEncKey = New-RandomSecret -bytes 32
$internalSecret = New-RandomSecret -bytes 32

Write-Info "Generated TOKEN_ENCRYPTION_KEY (32 bytes, base64)"
Write-Info "Generated INTERNAL_SECRET      (32 bytes, base64)"
Write-Warn "Store these in a password manager — they encrypt all OAuth tokens in D1."
Write-Info ""
Write-Info "TOKEN_ENCRYPTION_KEY = $tokenEncKey"
Write-Info "INTERNAL_SECRET      = $internalSecret"
Write-Info ""

# ─────────────────────────────────────────────────────────────────
#  Step 2 — Set Pages secrets (main GFD site)
# ─────────────────────────────────────────────────────────────────
Write-Step "Setting Cloudflare Pages secrets (main GFD worker)"

function Set-PageSecret {
  param([string]$name, [string]$value)
  Write-Host "  Setting $name..." -NoNewline
  $value | wrangler pages secret put $name --project-name goodflippindesign 2>&1 | Out-Null
  Write-OK $name
}

Set-PageSecret "TOKEN_ENCRYPTION_KEY" $tokenEncKey
Set-PageSecret "META_APP_ID" "882897501450706"

# ─────────────────────────────────────────────────────────────────
#  Step 3 — OAuth platform credentials (requires developer portal values)
# ─────────────────────────────────────────────────────────────────
if (-not $SkipPlatformOAuth) {
  Write-Step "OAuth platform credentials"
  Write-Warn "You need credentials from each platform's developer console."
  Write-Warn "Skip platforms you don't use — use the Manual Token tab instead."
  Write-Info ""

  $platforms = @(
    @{
      name    = "Meta (Instagram + Facebook)"
      secrets = @("META_APP_SECRET")
      url     = "https://developers.facebook.com/apps/882897501450706/settings/basic/"
      note    = "Settings > Basic > App Secret > Show"
    },
    @{
      name    = "X / Twitter"
      secrets = @("X_CLIENT_ID", "X_CLIENT_SECRET")
      url     = "https://developer.twitter.com/en/portal/projects-and-apps"
      note    = "Your App > Keys and Tokens > OAuth 2.0 Client ID and Secret"
    },
    @{
      name    = "LinkedIn"
      secrets = @("LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET")
      url     = "https://www.linkedin.com/developers/apps"
      note    = "Your App > Auth > Client ID and Primary Client Secret"
    },
    @{
      name    = "Pinterest"
      secrets = @("PINTEREST_APP_ID", "PINTEREST_APP_SECRET")
      url     = "https://developers.pinterest.com/apps/"
      note    = "Your App > App ID and App Secret Key"
    },
    @{
      name    = "TikTok"
      secrets = @("TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET")
      url     = "https://developers.tiktok.com/app/"
      note    = "Your App > Client Key and Client Secret"
    },
    @{
      name    = "YouTube (Google)"
      secrets = @("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET")
      url     = "https://console.cloud.google.com/apis/credentials"
      note    = "OAuth 2.0 Client IDs > your app > Client ID and Secret"
    },
    @{
      name    = "Threads"
      secrets = @("THREADS_APP_ID", "THREADS_APP_SECRET")
      url     = "https://developers.facebook.com/apps/1248220120837224/settings/basic/"
      note    = "Settings > Basic > App Secret > Show  (App ID: 1248220120837224)"
    }
  )

  foreach ($p in $platforms) {
    Write-Info ""
    Write-Host "  Platform: $($p.name)" -ForegroundColor White
    Write-Info "  Dashboard: $($p.url)"
    Write-Info "  Location:  $($p.note)"

    $doSet = Read-Host "  Configure $($p.name) now? (y/N)"
    if ($doSet.ToLower() -eq 'y') {
      foreach ($secretName in $p.secrets) {
        $secretValue = Read-Host "  $secretName"
        if ($secretValue.Trim()) {
          $secretValue.Trim() | wrangler pages secret put $secretName --project-name goodflippindesign 2>&1 | Out-Null
          Write-OK "Set $secretName"
        }
        else {
          Write-Warn "Skipped $secretName (empty)"
        }
      }
    }
    else {
      Write-Warn "Skipped $($p.name) — use Manual Token tab in admin.html"
    }
  }

  Write-Info ""
  Write-Info "Redirect URL to register in each platform's developer console:"
  Write-Info "  https://goodflippindesign.com/api/cms/oauth/callback/{provider}"
  Write-Info "  Replace {provider} with: meta, x, linkedin, pinterest, tiktok, youtube, threads"
}

# ─────────────────────────────────────────────────────────────────
#  Step 4 — Deploy social publisher worker
# ─────────────────────────────────────────────────────────────────
if (-not $SkipPublisher) {
  Write-Step "Deploying social publisher worker (gfv-social-publisher)"

  # Set secrets for social publisher worker
  Write-Info "Setting TOKEN_ENCRYPTION_KEY on social publisher..."
  $tokenEncKey | wrangler secret put TOKEN_ENCRYPTION_KEY --config wrangler-social.toml 2>&1 | Out-Null
  Write-OK "TOKEN_ENCRYPTION_KEY set on social publisher"

  Write-Info "Setting INTERNAL_SECRET on social publisher..."
  $internalSecret | wrangler secret put INTERNAL_SECRET --config wrangler-social.toml 2>&1 | Out-Null
  Write-OK "INTERNAL_SECRET set on social publisher"

  # Optional: also copy META_APP_SECRET to social publisher for token refresh
  $doMeta = Read-Host "  Copy META_APP_SECRET to social publisher for token auto-refresh? (y/N)"
  if ($doMeta.ToLower() -eq 'y') {
    $ms = Read-Host "  META_APP_SECRET value"
    if ($ms.Trim()) {
      $ms.Trim() | wrangler secret put META_APP_SECRET --config wrangler-social.toml 2>&1 | Out-Null
      Write-OK "META_APP_SECRET set on social publisher"
    }
  }

  Write-Info "Deploying worker..."
  $deployOutput = wrangler deploy --config wrangler-social.toml 2>&1
  Write-Host $deployOutput

  # Parse out the deployed URL
  $urlMatch = $deployOutput | Select-String -Pattern 'https://gfv-social-publisher\.[a-z0-9-]+\.workers\.dev'
  if ($urlMatch) {
    $publisherUrl = $urlMatch.Matches[0].Value
    Write-OK "Deployed to: $publisherUrl"

    # Set SOCIAL_PUBLISHER_URL + INTERNAL_SECRET on the Pages worker
    Write-Info "Setting SOCIAL_PUBLISHER_URL on Pages worker..."
    $publisherUrl | wrangler pages secret put SOCIAL_PUBLISHER_URL --project-name goodflippindesign 2>&1 | Out-Null
    Write-OK "SOCIAL_PUBLISHER_URL set"

    Write-Info "Setting INTERNAL_SECRET on Pages worker..."
    $internalSecret | wrangler pages secret put INTERNAL_SECRET --project-name goodflippindesign 2>&1 | Out-Null
    Write-OK "INTERNAL_SECRET set on Pages worker"
  }
  else {
    Write-Warn "Could not auto-detect deployed URL from wrangler output."
    Write-Warn "Manually set SOCIAL_PUBLISHER_URL in Cloudflare Pages dashboard:"
    Write-Warn "  Settings > Environment Variables > SOCIAL_PUBLISHER_URL"
    Write-Warn "  Value: https://gfv-social-publisher.<your-account>.workers.dev"
    Write-Warn ""
    Write-Warn "Also set INTERNAL_SECRET = $internalSecret"
  }
}

# ─────────────────────────────────────────────────────────────────
#  Step 5 — Summary
# ─────────────────────────────────────────────────────────────────
Write-Step "Setup complete"
Write-Info ""
Write-Host "  Next steps:" -ForegroundColor White
Write-Info "  1. git add . && git commit -m 'fix: add threads to PROVIDER_INFO' && git push"
Write-Info "     → Cloudflare Pages auto-deploys in ~2 min"
Write-Info ""
Write-Info "  2. Open https://goodflippindesign.com/admin.html"
Write-Info "     → Platform Connect tab should show which providers are configured"
Write-Info "     → Click a configured provider to run the OAuth flow"
Write-Info ""
Write-Info "  3. After connecting at least one account:"
Write-Info "     → Upload an asset (PNG/JPG/MP4)"
Write-Info "     → Use Post Composer or Drip Builder to schedule a variant"
Write-Info "     → Click 'Run Queue Now' — should trigger the social publisher"
Write-Info ""
Write-Info "  4. Verify gallery feed:"
Write-Info "     → GET https://goodflippindesign.com/api/cms/gallery/gfd"
Write-Info "     → Should return { items: [], categories: [] } (empty is fine until you upload)"
Write-Info ""
Write-Warn "Remember: Save TOKEN_ENCRYPTION_KEY and INTERNAL_SECRET securely."
Write-Warn "If lost, all stored OAuth tokens in D1 will be unrecoverable."
