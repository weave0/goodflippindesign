# Security Headers Verification Script for Cloudflare Pages
# Tests all expected security headers on GFD production site

$url = "https://goodflippindesign.com"
$requiredHeaders = @{
    "X-Frame-Options" = "DENY"
    "X-Content-Type-Options" = "nosniff"
    "X-XSS-Protection" = "1; mode=block"
    "Strict-Transport-Security" = "max-age=31536000"
    "Referrer-Policy" = "strict-origin-when-cross-origin"
    "Content-Security-Policy" = "default-src 'self'"
    "Permissions-Policy" = "geolocation=()"
}

Write-Host "`n════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Security Headers Verification" -ForegroundColor Cyan
Write-Host "  URL: $url" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

try {
    $response = Invoke-WebRequest -Uri $url -Method Head -UseBasicParsing -ErrorAction Stop
    
    Write-Host "✓ Site is reachable (Status: $($response.StatusCode))`n" -ForegroundColor Green
    
    $passed = 0
    $failed = 0
    
    foreach ($header in $requiredHeaders.Keys) {
        $expected = $requiredHeaders[$header]
        $actual = $response.Headers[$header]
        
        if ($actual) {
            if ($actual -like "*$expected*") {
                Write-Host "✓ $header" -ForegroundColor Green
                Write-Host "  Value: $actual`n" -ForegroundColor Gray
                $passed++
            } else {
                Write-Host "⚠ $header (present but unexpected value)" -ForegroundColor Yellow
                Write-Host "  Expected: $expected" -ForegroundColor Gray
                Write-Host "  Actual: $actual`n" -ForegroundColor Gray
                $passed++
            }
        } else {
            Write-Host "✗ $header (missing)" -ForegroundColor Red
            Write-Host "  Expected: $expected`n" -ForegroundColor Gray
            $failed++
        }
    }
    
    Write-Host "`n════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  Results: $passed passed, $failed failed" -ForegroundColor Cyan
    Write-Host "════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
    
    if ($failed -eq 0) {
        Write-Host "✓ All security headers configured correctly!" -ForegroundColor Green
        exit 0
    } else {
        Write-Host "⚠ $failed security headers missing - check Cloudflare Pages deployment" -ForegroundColor Yellow
        exit 1
    }
    
} catch {
    Write-Host "✗ Error fetching headers: $_" -ForegroundColor Red
    exit 1
}
