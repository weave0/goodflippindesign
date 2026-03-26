# Simple GA Network Test
# Uses Invoke-WebRequest to check if GA resources load

Write-Host "`n🧪 LIVE GOOGLE ANALYTICS TEST" -ForegroundColor Cyan
Write-Host "============================`n" -ForegroundColor Cyan

$siteUrl = "https://www.goodflippindesign.com"
$gaId = "G-QPPVJM1B60"

Write-Host "1. Testing main site loads..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $siteUrl -UseBasicParsing -TimeoutSec 10
    Write-Host "   ✅ Site loads successfully (Status: $($response.StatusCode))" -ForegroundColor Green

    # Check if GA script tag is present
    if ($response.Content -match "gtag/js\?id=$gaId") {
        Write-Host "   ✅ GA script tag found in HTML" -ForegroundColor Green
    }
    else {
        Write-Host "   ❌ GA script tag NOT found" -ForegroundColor Red
    }

    # Check if gtag config is present
    if ($response.Content -match "gtag\('config', '$gaId'\)") {
        Write-Host "   ✅ GA config call found" -ForegroundColor Green
    }
    else {
        Write-Host "   ❌ GA config NOT found" -ForegroundColor Red
    }

}
catch {
    Write-Host "   ❌ Failed to load site: $_" -ForegroundColor Red
}

Write-Host "`n2. Testing gtag.js script loads..." -ForegroundColor Yellow
try {
    $gtagUrl = "https://www.googletagmanager.com/gtag/js?id=$gaId"
    $gtagResponse = Invoke-WebRequest -Uri $gtagUrl -UseBasicParsing -TimeoutSec 10

    if ($gtagResponse.StatusCode -eq 200) {
        Write-Host "   ✅ gtag.js loads successfully" -ForegroundColor Green
        Write-Host "   Size: $($gtagResponse.Content.Length) bytes" -ForegroundColor Gray

        # Check if it's the right script
        if ($gtagResponse.Content -match "google-analytics.com|analytics") {
            Write-Host "   ✅ Script contains analytics code" -ForegroundColor Green
        }
    }
}
catch {
    Write-Host "   ❌ gtag.js failed to load: $_" -ForegroundColor Red
}

Write-Host "`n3. Checking headers on live site..." -ForegroundColor Yellow
try {
    $headers = Invoke-WebRequest -Uri $siteUrl -Method Head -UseBasicParsing -TimeoutSec 10

    # Check for CSP
    if ($headers.Headers['Content-Security-Policy']) {
        $csp = $headers.Headers['Content-Security-Policy']
        Write-Host "   ✅ CSP header present" -ForegroundColor Green

        if ($csp -match "googletagmanager.com") {
            Write-Host "   ✅ googletagmanager.com in CSP" -ForegroundColor Green
        }
        else {
            Write-Host "   ❌ googletagmanager.com NOT in CSP" -ForegroundColor Red
        }

        if ($csp -match "google-analytics.com") {
            Write-Host "   ✅ google-analytics.com in CSP" -ForegroundColor Green
        }
        else {
            Write-Host "   ❌ google-analytics.com NOT in CSP" -ForegroundColor Red
        }
    }
    else {
        Write-Host "   ⚠️  No CSP header (permissive - scripts allowed)" -ForegroundColor Yellow
    }

    # Check other security headers
    if ($headers.Headers['X-Frame-Options']) {
        Write-Host "   ✅ X-Frame-Options: $($headers.Headers['X-Frame-Options'])" -ForegroundColor Gray
    }

}
catch {
    Write-Host "   ⚠️  Could not check headers: $_" -ForegroundColor Yellow
}

Write-Host "`n" -ForegroundColor Cyan
Write-Host "=" * 70 -ForegroundColor Cyan
Write-Host "`n✅ CONFIGURATION CHECK COMPLETE!`n" -ForegroundColor Green

Write-Host "📊 FINAL VERIFICATION STEPS:" -ForegroundColor Cyan
Write-Host "`n1. MANUAL BROWSER TEST (Most Reliable):" -ForegroundColor Yellow
Write-Host "   • Visit: $siteUrl" -ForegroundColor White
Write-Host "   • Open DevTools (F12) → Network tab" -ForegroundColor White
Write-Host "   • Refresh the page" -ForegroundColor White
Write-Host "   • Look for requests to:" -ForegroundColor White
Write-Host "     - gtag/js?id=$gaId" -ForegroundColor Gray
Write-Host "     - google-analytics.com/g/collect" -ForegroundColor Gray
Write-Host "     - analytics.google.com/g/collect" -ForegroundColor Gray
Write-Host "`n   If you see 'collect' requests → GA IS WORKING! ✅`n" -ForegroundColor Green

Write-Host "2. GOOGLE ANALYTICS DASHBOARD:" -ForegroundColor Yellow
Write-Host "   • Go to: https://analytics.google.com" -ForegroundColor White
Write-Host "   • Click: Realtime → Overview" -ForegroundColor White
Write-Host "   • Visit your site in another tab" -ForegroundColor White
Write-Host "   • You should see yourself as an active user within 60 seconds`n" -ForegroundColor White

Write-Host "3. GOOGLE TAG ASSISTANT (Chrome Extension):" -ForegroundColor Yellow
Write-Host "   • Install: https://bit.ly/google-tag-assistant" -ForegroundColor White
Write-Host "   • Visit your site" -ForegroundColor White
Write-Host "   • Click extension → Should show GA4 firing`n" -ForegroundColor White

Write-Host "⏰ GOOGLE'S VERIFICATION TOOL:" -ForegroundColor Cyan
Write-Host "   May take 24-48 hours to detect tag even if working!" -ForegroundColor Yellow
Write-Host "   Trust the browser DevTools test above for immediate verification.`n" -ForegroundColor Gray
