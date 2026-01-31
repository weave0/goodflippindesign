# Google Analytics Verification Script
# Comprehensive check for GA4 implementation

Write-Host "`n🔍 GOOGLE ANALYTICS VERIFICATION" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$siteUrl = "https://www.goodflippindesign.com"
$gaId = "G-QPPVJM1B60"

# 1. Check if tag is in HTML
Write-Host "1. Checking HTML for GA tag..." -ForegroundColor Yellow
$html = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing
if ($html.Content -match $gaId) {
    Write-Host "   ✅ GA tag found in HTML" -ForegroundColor Green
} else {
    Write-Host "   ❌ GA tag NOT found in HTML" -ForegroundColor Red
}

# 2. Check CSP headers
Write-Host "`n2. Checking Content Security Policy..." -ForegroundColor Yellow
$headers = $html.Headers
if ($headers['Content-Security-Policy']) {
    $csp = $headers['Content-Security-Policy']
    Write-Host "   CSP Header found:" -ForegroundColor Gray
    
    # Check for required domains
    $requiredDomains = @(
        "googletagmanager.com",
        "google-analytics.com"
    )
    
    foreach ($domain in $requiredDomains) {
        if ($csp -match $domain) {
            Write-Host "   ✅ $domain allowed in CSP" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $domain NOT in CSP" -ForegroundColor Red
        }
    }
} else {
    Write-Host "   ⚠️  No CSP header found (permissive)" -ForegroundColor Yellow
}

# 3. Test if gtag.js is accessible
Write-Host "`n3. Testing gtag.js accessibility..." -ForegroundColor Yellow
$gtagUrl = "https://www.googletagmanager.com/gtag/js?id=$gaId"
try {
    $gtagResponse = Invoke-WebRequest -Uri $gtagUrl -UseBasicParsing -ErrorAction Stop
    if ($gtagResponse.StatusCode -eq 200) {
        Write-Host "   ✅ gtag.js script is accessible" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ gtag.js script NOT accessible" -ForegroundColor Red
}

# 4. Check cache headers
Write-Host "`n4. Checking cache headers..." -ForegroundColor Yellow
if ($headers['Cache-Control']) {
    Write-Host "   Cache-Control: $($headers['Cache-Control'])" -ForegroundColor Gray
    if ($headers['Cache-Control'] -match "no-cache|no-store") {
        Write-Host "   ✅ HTML not cached (good for testing)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  HTML may be cached - clear CDN cache if changes not visible" -ForegroundColor Yellow
    }
}

# 5. Summary and next steps
Write-Host "`n📊 SUMMARY" -ForegroundColor Cyan
Write-Host "==========" -ForegroundColor Cyan

Write-Host "`nIf all checks passed above, your GA is configured correctly!" -ForegroundColor Green
Write-Host "`nGoogle's verification tool may still need:" -ForegroundColor Yellow
Write-Host "  • 24-48 hours to detect the tag" -ForegroundColor Gray
Write-Host "  • Actual pageview data (not just tag presence)" -ForegroundColor Gray
Write-Host "  • CDN cache to clear" -ForegroundColor Gray

Write-Host "`n🧪 REAL-TIME VERIFICATION:" -ForegroundColor Cyan
Write-Host "  1. Visit: $siteUrl" -ForegroundColor White
Write-Host "  2. Open DevTools (F12) → Network tab" -ForegroundColor White
Write-Host "  3. Look for requests to:" -ForegroundColor White
Write-Host "     • googletagmanager.com/gtag/js" -ForegroundColor Gray
Write-Host "     • google-analytics.com/g/collect" -ForegroundColor Gray
Write-Host "`n  If you see 'g/collect' requests, GA IS WORKING! ✅" -ForegroundColor Green

Write-Host "`n📈 ALTERNATIVE VERIFICATION:" -ForegroundColor Cyan
Write-Host "  • Google Analytics → Realtime Report (shows data within 60 seconds)" -ForegroundColor White
Write-Host "  • Google Tag Assistant Chrome Extension" -ForegroundColor White

Write-Host "`n"
