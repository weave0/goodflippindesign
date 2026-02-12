# Quick Sentry DSN Retrieval Script
# Run this to get your DSN and set it up in Cloudflare

Write-Host "🔍 Retrieving Sentry DSN for Deployment" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Open Sentry dashboard
Write-Host "📂 Step 1: Opening Sentry Dashboard..." -ForegroundColor Yellow
Write-Host ""
Write-Host "I'm opening your Sentry dashboard in your default browser." -ForegroundColor White
Write-Host "Look for one of these project names:" -ForegroundColor White
Write-Host "  • goodflippindesign" -ForegroundColor Gray
Write-Host "  • gfd-community" -ForegroundColor Gray
Write-Host "  • good-flippin-design" -ForegroundColor Gray
Write-Host "  • goodflippinvibes" -ForegroundColor Gray
Write-Host ""

# Open Sentry dashboard
Start-Process "https://sentry.io/organizations/weave0/projects/"

Write-Host "⏳ Waiting 5 seconds for browser to open..." -ForegroundColor Gray
Start-Sleep -Seconds 5

# Step 2: Guide to find DSN
Write-Host ""
Write-Host "🔑 Step 2: Find Your DSN" -ForegroundColor Yellow
Write-Host ""
Write-Host "In the Sentry dashboard that just opened:" -ForegroundColor White
Write-Host "  1. Click on your project (goodflippindesign or similar)" -ForegroundColor White
Write-Host "  2. Go to: Settings → Projects → [Your Project] → Client Keys (DSN)" -ForegroundColor White
Write-Host "  3. Copy the DSN (looks like: https://abc123@o456.ingest.sentry.io/789)" -ForegroundColor White
Write-Host ""
Write-Host "Alternative quick path:" -ForegroundColor Gray
Write-Host "  • Settings → Projects → Select project → SDK Setup → Client Keys" -ForegroundColor Gray
Write-Host ""

# Step 3: Prompt for DSN
Write-Host "📋 Step 3: Enter Your DSN" -ForegroundColor Yellow
Write-Host ""
$dsn = Read-Host "Paste your Sentry DSN here (or press Ctrl+C to abort)"

if ([string]::IsNullOrWhiteSpace($dsn)) {
    Write-Host "❌ No DSN provided. Aborting." -ForegroundColor Red
    exit 1
}

# Validate DSN format
if ($dsn -notmatch 'https://[a-f0-9]+@[a-z0-9]+\.ingest\.sentry\.io/[0-9]+') {
    Write-Host "⚠️  Warning: DSN format looks unusual." -ForegroundColor Yellow
    Write-Host "   Expected format: https://abc123@o456.ingest.sentry.io/789" -ForegroundColor Gray
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne 'y' -and $continue -ne 'Y') {
        Write-Host "Aborted." -ForegroundColor Red
        exit 1
    }
}

# Step 4: Set in Cloudflare
Write-Host ""
Write-Host "🔒 Step 4: Setting SENTRY_DSN in Cloudflare..." -ForegroundColor Yellow
Write-Host ""

try {
    # Set the secret
    $dsn | wrangler secret put SENTRY_DSN
    Write-Host "✅ SENTRY_DSN secret set successfully!" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to set secret: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual fallback:" -ForegroundColor Yellow
    Write-Host "  wrangler secret put SENTRY_DSN" -ForegroundColor White
    Write-Host "  # Then paste: $dsn" -ForegroundColor Gray
    exit 1
}

# Step 5: Update .env file
Write-Host ""
Write-Host "💾 Step 5: Updating .env file..." -ForegroundColor Yellow

try {
    $envPath = ".\.env"
    if (Test-Path $envPath) {
        $envContent = Get-Content $envPath -Raw
        if ($envContent -notmatch 'SENTRY_DSN') {
            Add-Content -Path $envPath -Value "`n# Sentry Error Tracking`nSENTRY_DSN=$dsn"
            Write-Host "✅ Added SENTRY_DSN to .env file" -ForegroundColor Green
        }
        else {
            # Update existing SENTRY_DSN line
            $envContent = $envContent -replace 'SENTRY_DSN=.*', "SENTRY_DSN=$dsn"
            Set-Content -Path $envPath -Value $envContent -NoNewline
            Write-Host "✅ Updated SENTRY_DSN in .env file" -ForegroundColor Green
        }
    }
}
catch {
    Write-Host "⚠️  Warning: Could not update .env file: $($_.Exception.Message)" -ForegroundColor Yellow
    Write-Host "   (This is optional - secret is already set in Cloudflare)" -ForegroundColor Gray
}

# Step 6: Verify
Write-Host ""
Write-Host "🔍 Step 6: Verifying secret..." -ForegroundColor Yellow
Write-Host ""

$verification = wrangler secret list 2>&1 | Select-String "SENTRY_DSN"
if ($verification) {
    Write-Host "✅ Verified: SENTRY_DSN is set in Cloudflare!" -ForegroundColor Green
}
else {
    Write-Host "⚠️  Warning: Could not verify secret (may still be set)" -ForegroundColor Yellow
}

# Summary
Write-Host ""
Write-Host "🎉 Sentry DSN Setup Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run: .\scripts\deploy-phase-4.ps1" -ForegroundColor White
Write-Host "  2. Deploy will include error tracking enabled" -ForegroundColor White
Write-Host "  3. Check Sentry dashboard for live error stream" -ForegroundColor White
Write-Host ""
Write-Host "Your DSN (saved for reference): $dsn" -ForegroundColor Gray
Write-Host ""
