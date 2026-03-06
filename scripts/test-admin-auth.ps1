#!/usr/bin/env pwsh
# Test admin.html Clerk auth setup

$ProgressPreference = 'SilentlyContinue'

Write-Host "`n🧪 Testing GFD Admin Panel Auth Setup" -ForegroundColor Cyan
Write-Host "=" * 50 -ForegroundColor Gray

# Fetch admin.html
Write-Host "`n📥 Fetching live admin.html..." -ForegroundColor Yellow
$res = Invoke-WebRequest -UseBasicParsing "https://goodflippindesign.com/admin.html" -Headers @{"Cache-Control" = "no-cache" } -MaximumRedirection 0
$html = $res.Content

# Check CSP headers
Write-Host "`n1️⃣  Content Security Policy" -ForegroundColor Cyan
$csp = $res.Headers['Content-Security-Policy']
if ($csp -match "clerk\.goodflippindesign\.com") {
    Write-Host "   ✅ CSP allows clerk.goodflippindesign.com" -ForegroundColor Green
}
else {
    Write-Host "   ❌ CSP does NOT allow clerk.goodflippindesign.com" -ForegroundColor Red
    Write-Host "      (Deployment may still be in progress)" -ForegroundColor Yellow
}

# Check Clerk domain in HTML
Write-Host "`n2️⃣  Clerk Script Source" -ForegroundColor Cyan
if ($html -match 'clerk\.goodflippindesign\.com/npm/@clerk/clerk-js') {
    Write-Host "   ✅ Script loads from clerk.goodflippindesign.com" -ForegroundColor Green
}
else {
    Write-Host "   ❌ Script NOT using GFD Clerk domain" -ForegroundColor Red
    if ($html -match 'clerk\.goodflippinvibes\.com') {
        Write-Host "      (Still using GFV domain)" -ForegroundColor Yellow
    }
}

# Check publishable key
Write-Host "`n3️⃣  Publishable Key" -ForegroundColor Cyan
if ($html -match 'pk_live_Y2xlcmsuZ29vZGZsaXBwaW5kZXNpZ24uY29tJA') {
    Write-Host "   ✅ Production key: pk_live_Y2xlcmsuZ29vZGZsaXBwaW5kZXNpZ24uY29tJA" -ForegroundColor Green
}
elseif ($html -match 'pk_test_') {
    Write-Host "   ⚠️  Using test key (expected for now)" -ForegroundColor Yellow
}
else {
    Write-Host "   ❌ No recognizable publishable key found" -ForegroundColor Red
}

# Check for old constructor pattern
Write-Host "`n4️⃣  Initialization Method" -ForegroundColor Cyan
if ($html -match 'new window\.Clerk\(') {
    Write-Host "   ❌ Using deprecated constructor (new window.Clerk)" -ForegroundColor Red
}
else {
    Write-Host "   ✅ Not using deprecated constructor" -ForegroundColor Green
}

# DNS check
Write-Host "`n5️⃣  DNS Resolution" -ForegroundColor Cyan
try {
    $dns = Resolve-DnsName "clerk.goodflippindesign.com" -Type CNAME -ErrorAction Stop
    if ($dns.NameHost -eq "frontend-api.clerk.services") {
        Write-Host "   ✅ clerk.goodflippindesign.com → frontend-api.clerk.services" -ForegroundColor Green
    }
    else {
        Write-Host "   ⚠️  Points to: $($dns.NameHost)" -ForegroundColor Yellow
    }
}
catch {
    Write-Host "   ⏳ DNS not propagated yet (wait 5-10 min)" -ForegroundColor Yellow
}

Write-Host "`n" -ForegroundColor Gray
Write-Host "=" * 50 -ForegroundColor Gray

# Summary
Write-Host "`n📊 Summary:" -ForegroundColor Cyan
Write-Host "   If all checks are ✅, the setup is complete." -ForegroundColor Gray
Write-Host "   If any are ❌, wait for Cloudflare deployment or check config." -ForegroundColor Gray
Write-Host "`n⚠️  CRITICAL: Don't forget to set CLERK_SECRET_KEY_GFD in Cloudflare!" -ForegroundColor Yellow
Write-Host "   Without it, auth will fail even if everything else is correct." -ForegroundColor Gray
Write-Host ""
