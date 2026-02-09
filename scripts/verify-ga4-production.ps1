# GA4 Production Verification Script
# Verifies G-WM6Q66W9W0 is deployed and tracking on all 6 ecosystem sites

Write-Host "🔍 GA4 Production Verification - $(Get-Date -Format 'yyyy-MM-dd HH:mm')" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$sites = @(
    @{Name = "Good Flippin Design"; URL = "https://goodflippindesign.com" },
    @{Name = "Good Flippin Vibes"; URL = "https://goodflippinvibes.com" },
    @{Name = "GlobalDeets"; URL = "https://globaldeets.com" },
    @{Name = "CitizenApproved"; URL = "https://citizenapproved.org" },
    @{Name = "AI Aimate"; URL = "https://aiaimate.com" },
    @{Name = "CultureSherpa"; URL = "https://culturesherpa.org" }
)

$measurementId = "G-WM6Q66W9W0"
$results = @()

foreach ($site in $sites) {
    Write-Host "Testing: $($site.Name)" -ForegroundColor Yellow
    Write-Host "  URL: $($site.URL)" -ForegroundColor Gray

    try {
        # Fetch homepage
        $response = Invoke-WebRequest -Uri $site.URL -UseBasicParsing -TimeoutSec 10

        # Check if measurement ID is in HTML
        if ($response.Content -match $measurementId) {
            Write-Host "  ✅ GA4 $measurementId found in HTML" -ForegroundColor Green

            # Check if gtag.js is loaded
            if ($response.Content -match "googletagmanager.com/gtag/js\?id=$measurementId") {
                Write-Host "  ✅ gtag.js script tag present" -ForegroundColor Green
                $status = "PASS"
            }
            else {
                Write-Host "  ⚠️  Measurement ID found but gtag.js script missing" -ForegroundColor Yellow
                $status = "PARTIAL"
            }
        }
        else {
            Write-Host "  ❌ GA4 $measurementId NOT FOUND" -ForegroundColor Red
            $status = "FAIL"
        }

        # Check status code
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✅ Site accessible (HTTP $($response.StatusCode))" -ForegroundColor Green
        }

    }
    catch {
        Write-Host "  ❌ Error fetching site: $($_.Exception.Message)" -ForegroundColor Red
        $status = "ERROR"
    }

    $results += @{
        Site   = $site.Name
        URL    = $site.URL
        Status = $status
    }

    Write-Host ""
}

# Summary Report
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "📊 VERIFICATION SUMMARY" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$passCount = ($results | Where-Object { $_.Status -eq "PASS" }).Count
$failCount = ($results | Where-Object { $_.Status -eq "FAIL" }).Count
$partialCount = ($results | Where-Object { $_.Status -eq "PARTIAL" }).Count
$errorCount = ($results | Where-Object { $_.Status -eq "ERROR" }).Count

Write-Host "Results:"
Write-Host "  ✅ PASS: $passCount" -ForegroundColor Green
if ($partialCount -gt 0) {
    Write-Host "  ⚠️  PARTIAL: $partialCount" -ForegroundColor Yellow
}
if ($failCount -gt 0) {
    Write-Host "  ❌ FAIL: $failCount" -ForegroundColor Red
}
if ($errorCount -gt 0) {
    Write-Host "  ❌ ERROR: $errorCount" -ForegroundColor Red
}
Write-Host ""

# Detailed Results Table
Write-Host "Detailed Results:" -ForegroundColor Cyan
$results | ForEach-Object {
    $color = switch ($_.Status) {
        "PASS" { "Green" }
        "PARTIAL" { "Yellow" }
        "FAIL" { "Red" }
        "ERROR" { "Red" }
    }
    Write-Host "  $($_.Site): $($_.Status)" -ForegroundColor $color
}
Write-Host ""

# Next Steps
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "📋 NEXT STEPS" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

if ($failCount -gt 0 -or $errorCount -gt 0) {
    Write-Host "⚠️  Some sites failed verification:" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "1. Check Vercel environment variables:" -ForegroundColor White
    Write-Host "   - CitizenApproved: NEXT_PUBLIC_GA_MEASUREMENT_ID" -ForegroundColor Gray
    Write-Host "   - AI Aimate: NEXT_PUBLIC_GA_MEASUREMENT_ID" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Redeploy affected sites to pick up env var changes" -ForegroundColor White
    Write-Host ""
    Write-Host "3. Verify CultureSherpa S3/CloudFront deployment is live" -ForegroundColor White
}
else {
    Write-Host "✅ All sites verified! Ready for GA4 DebugView testing:" -ForegroundColor Green
    Write-Host ""
    Write-Host "1. Install Google Analytics Debugger Chrome extension" -ForegroundColor White
    Write-Host "2. Visit https://analytics.google.com → DebugView" -ForegroundColor White
    Write-Host "3. Enable debugger and visit each site" -ForegroundColor White
    Write-Host "4. Verify page_view and session_start events fire correctly" -ForegroundColor White
}
Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "Verification complete: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
