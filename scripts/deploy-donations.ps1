# Donation System - Automated Deployment Script
# This script completes the donation system deployment for all sites

Write-Host "`n╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🚀 DONATION SYSTEM - AUTOMATED DEPLOYMENT                      ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Configuration
$STRIPE_KEY_FILE = "Z:\GFD\STRIPE_API_KEY.txt"
$STRIPE_KEY = if (Test-Path $STRIPE_KEY_FILE) { Get-Content $STRIPE_KEY_FILE -Raw | ForEach-Object { $_.Trim() } } else { $null }

if (!$STRIPE_KEY) {
    Write-Host "❌ STRIPE_API_KEY.txt not found!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Loaded STRIPE key from $STRIPE_KEY_FILE`n" -ForegroundColor Green

# Function to check if page is live
function Test-DonationPage {
    param([string]$URL, [string]$Name)

    try {
        $response = Invoke-WebRequest -Uri $URL -Method Head -TimeoutSec 5 -ErrorAction Stop
        Write-Host "  ✅ $($Name.PadRight(15)) - LIVE (200 OK)" -ForegroundColor Green
        return $true
    }
    catch {
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "  ⏳ $($Name.PadRight(15)) - 404 (still deploying)" -ForegroundColor Yellow
        }
        else {
            Write-Host "  ⚠️  $($Name.PadRight(15)) - Error: $($_.Exception.Message)" -ForegroundColor Yellow
        }
        return $false
    }
}

# Step 1: Verify deployments were triggered
Write-Host "📊 STEP 1: Verify deployment triggers`n" -ForegroundColor Cyan

$deployments = @(
    @{
        Name = "GlobalDeets"
        Path = "Z:\GFD\GFD Dev Projects\Globaldeets"
        Repo = "globaldeets"
    },
    @{
        Name = "GFV"
        Path = "Z:\GFD\GFD Dev Projects\GFV\website"
        Repo = "goodflippinvibes"
    }
)

foreach ($deploy in $deployments) {
    cd $deploy.Path
    $lastCommit = git log -1 --oneline
    Write-Host "  $($deploy.Name): $lastCommit" -ForegroundColor White
}

Write-Host "`n⏱️  Waiting 2 minutes for Cloudflare Pages to deploy...`n" -ForegroundColor Yellow
Start-Sleep -Seconds 120

# Step 2: Check if pages are live
Write-Host "📊 STEP 2: Check deployment status`n" -ForegroundColor Cyan

$sites = @(
    @{Name = "GFD"; URL = "https://goodflippindesign.com/donate.html"; NeedsStripe = $true },
    @{Name = "GlobalDeets"; URL = "https://globaldeets.com/donate.html"; NeedsStripe = $true },
    @{Name = "GFV"; URL = "https://goodflippinvibes.com/donate.html"; NeedsStripe = $false }
)

$allLive = $true
foreach ($site in $sites) {
    $isLive = Test-DonationPage -URL $site.URL -Name $site.Name
    if (!$isLive) { $allLive = $false }
}

if (!$allLive) {
    Write-Host "`n⏳ Some pages still deploying. Waiting another minute...`n" -ForegroundColor Yellow
    Start-Sleep -Seconds 60

    Write-Host "Rechecking...`n" -ForegroundColor Cyan
    foreach ($site in $sites) {
        Test-DonationPage -URL $site.URL -Name $site.Name | Out-Null
    }
}

# Step 3: STRIPE Configuration Instructions
Write-Host "`n╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🔑 STRIPE CONFIGURATION REQUIRED                               ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "⚠️  Automated STRIPE configuration requires Cloudflare API access." -ForegroundColor Yellow
Write-Host "You'll need to manually add the STRIPE environment variables.`n" -ForegroundColor Yellow

Write-Host "📋 REQUIRED ACTIONS:`n" -ForegroundColor Cyan

Write-Host "1️⃣  CLOUDFLARE PAGES (GFD + GlobalDeets):" -ForegroundColor Yellow
Write-Host "    Go to: https://dash.cloudflare.com/pages`n" -ForegroundColor White

Write-Host "    For 'goodflippindesign' project:" -ForegroundColor Cyan
Write-Host "      • Settings → Environment variables → Add variable" -ForegroundColor White
Write-Host "      • Name: STRIPE" -ForegroundColor White
Write-Host "      • Value: $STRIPE_KEY" -ForegroundColor Gray
Write-Host "      • Environment: ✅ Production" -ForegroundColor Green
Write-Host "      • Save → Deployments → Retry deployment`n" -ForegroundColor White

Write-Host "    For 'globaldeets' project:" -ForegroundColor Cyan
Write-Host "      • Settings → Environment variables → Add variable" -ForegroundColor White
Write-Host "      • Name: STRIPE" -ForegroundColor White
Write-Host "      • Value: $STRIPE_KEY" -ForegroundColor Gray
Write-Host "      • Environment: ✅ Production" -ForegroundColor Green
Write-Host "      • Save → Deployments → Retry deployment`n" -ForegroundColor White

Write-Host "2️⃣  VERCEL (AI Aimate - optional):" -ForegroundColor Yellow
Write-Host "    Go to: https://vercel.com/dashboard`n" -ForegroundColor White

Write-Host "    For 'ai-aimate' project:" -ForegroundColor Cyan
Write-Host "      • Settings → Environment Variables → Add" -ForegroundColor White
Write-Host "      • Name: STRIPE_SECRET_KEY (⚠️ different from Cloudflare!)" -ForegroundColor Yellow
Write-Host "      • Value: $STRIPE_KEY" -ForegroundColor Gray
Write-Host "      • Environment: Production" -ForegroundColor Green
Write-Host "      • Deployments → Redeploy`n" -ForegroundColor White

# Step 4: Testing instructions
Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🧪 PAYMENT TESTING                                              ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "After configuring STRIPE env vars and redeploying, test payments:`n" -ForegroundColor Yellow

Write-Host "Test URLs:" -ForegroundColor Cyan
Write-Host "  • https://goodflippindesign.com/donate.html" -ForegroundColor White
Write-Host "  • https://globaldeets.com/donate.html" -ForegroundColor White
Write-Host "  • https://goodflippinvibes.com/donate.html`n" -ForegroundColor White

Write-Host "Test Card:" -ForegroundColor Cyan
Write-Host "  Card Number: 4242 4242 4242 4242" -ForegroundColor White
Write-Host "  Expiry: Any future date" -ForegroundColor White
Write-Host "  CVC: Any 3 digits`n" -ForegroundColor White

Write-Host "Expected Flow:" -ForegroundColor Cyan
Write-Host "  1. Select donation amount" -ForegroundColor White
Write-Host "  2. Click 'Continue with Card'" -ForegroundColor White
Write-Host "  3. Stripe checkout opens" -ForegroundColor White
Write-Host "  4. Enter test card details" -ForegroundColor White
Write-Host "  5. Payment completes" -ForegroundColor White
Write-Host "  6. Success message displays`n" -ForegroundColor White

# Summary
Write-Host "╔══════════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  ✅ DEPLOYMENT STATUS SUMMARY                                    ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

Write-Host "Automated Tasks Completed:" -ForegroundColor Green
Write-Host "  ✅ GitHubweb triggers sent (empty commits)" -ForegroundColor White
Write-Host "  ✅ 2-minute deployment wait completed" -ForegroundColor White
Write-Host "  ✅ Donation page availability checked`n" -ForegroundColor White

Write-Host "Manual Tasks Remaining:" -ForegroundColor Yellow
Write-Host "  ⏳ Add STRIPE env var to GFD (Cloudflare Pages)" -ForegroundColor White
Write-Host "  ⏳ Add STRIPE env var to GlobalDeets (Cloudflare Pages)" -ForegroundColor White
Write-Host "  ⏳ Retry deployments after adding STRIPE" -ForegroundColor White
Write-Host "  ⏳ Test payment flows on all 3 sites`n" -ForegroundColor White

Write-Host "Estimated time to complete manual tasks: 10-15 minutes`n" -ForegroundColor Cyan

Write-Host "📚 Full Documentation: Z:\GFD\DONATION_DEPLOYMENT_STATUS.md`n" -ForegroundColor White

Write-Host "🎯 Next: Add STRIPE env vars in Cloudflare Pages dashboard" -ForegroundColor Magenta
Write-Host "    https://dash.cloudflare.com/pages`n" -ForegroundColor White
