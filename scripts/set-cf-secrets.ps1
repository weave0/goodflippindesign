# set-cf-secrets.ps1
# Reads ALL secrets from .env and pushes them to Cloudflare Pages via wrangler CLI.
# Workflow: add a value to .env, run this script. Done.
#
# Usage: .\scripts\set-cf-secrets.ps1

param(
  [string]$ProjectName = "goodflippindesign"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Set-PagesSecret([string]$Name, [string]$Value) {
  Write-Host -NoNewline "  $Name ... "
  $result = ($Value | wrangler pages secret put $Name --project-name $ProjectName 2>&1) | Out-String
  if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK]" -ForegroundColor Green
  }
  else {
    Write-Host "[FAIL]" -ForegroundColor Red
    Write-Host $result.Trim()
  }
  # Brief pause to stay under CF rate limits
  Start-Sleep -Milliseconds 400
}

# Parse .env into a hashtable
$env_vars = @{}
Get-Content "z:\GFD\.env" | Where-Object { $_ -match "^[A-Z_]+=.+" } | ForEach-Object {
  $parts = $_ -split "=", 2
  $env_vars[$parts[0]] = $parts[1]
}

# Map of .env key -> Cloudflare Pages secret name (they are usually identical)
$secretMap = @{
  CLERK_SECRET_KEY       = "CLERK_SECRET_KEY"
  SENTRY_DSN             = "SENTRY_DSN"
  # STRIPE_SECRET_KEY is for the stripe-payments Worker (separate deploy), NOT Pages.
  # Set it with: wrangler secret put STRIPE_SECRET_KEY --config workers/wrangler-stripe.toml
  TOKEN_ENCRYPTION_KEY   = "TOKEN_ENCRYPTION_KEY"
  INTERNAL_SECRET        = "INTERNAL_SECRET"
  # OAuth secrets - add values to .env when you have them:
  META_APP_SECRET        = "META_APP_SECRET"
  THREADS_APP_SECRET     = "THREADS_APP_SECRET"
  X_CLIENT_ID            = "X_CLIENT_ID"
  X_CLIENT_SECRET        = "X_CLIENT_SECRET"
  LINKEDIN_CLIENT_ID     = "LINKEDIN_CLIENT_ID"
  LINKEDIN_CLIENT_SECRET = "LINKEDIN_CLIENT_SECRET"
  PINTEREST_APP_ID       = "PINTEREST_APP_ID"
  PINTEREST_APP_SECRET   = "PINTEREST_APP_SECRET"
  TIKTOK_CLIENT_KEY      = "TIKTOK_CLIENT_KEY"
  TIKTOK_CLIENT_SECRET   = "TIKTOK_CLIENT_SECRET"
  GOOGLE_CLIENT_ID       = "GOOGLE_CLIENT_ID"
  GOOGLE_CLIENT_SECRET   = "GOOGLE_CLIENT_SECRET"
  SOCIAL_PUBLISHER_URL   = "SOCIAL_PUBLISHER_URL"
}

Write-Host "`nSetting Cloudflare Pages secrets for: $ProjectName`n"

# Hardcoded known app IDs (public-safe, no secret)
Set-PagesSecret "META_APP_ID"     "882897501450706"
Set-PagesSecret "THREADS_APP_ID"  "1248220120837224"

# Push everything found in .env
foreach ($envKey in $secretMap.Keys) {
  $val = $env_vars[$envKey]
  if ($val -and $val.Trim() -ne "") {
    Set-PagesSecret $secretMap[$envKey] $val.Trim()
  }
  else {
    Write-Host "[SKIP] $envKey (not in .env)"
  }
}

Write-Host "`nDone. To add more secrets: edit .env, re-run this script.`n"
