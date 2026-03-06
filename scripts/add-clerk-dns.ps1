#!/usr/bin/env pwsh
# Add Clerk DNS records to goodflippindesign.com

$token = "WtN3sm0oL4dpRlr4Pw_9W_I6lPfPf_Bh8KWXU-9z"
$zoneId = "7564ccf739ec9281fee2c0631180d713"
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type"  = "application/json"
}

$records = @(
    @{ name = "clerk"; target = "frontend-api.clerk.services" },
    @{ name = "accounts"; target = "accounts.clerk.services" },
    @{ name = "clkmail"; target = "mail.k6r91ngsvz3c.clerk.services" },
    @{ name = "clk._domainkey"; target = "dkim1.k6r91ngsvz3c.clerk.services" },
    @{ name = "clk2._domainkey"; target = "dkim2.k6r91ngsvz3c.clerk.services" }
)

Write-Host "📝 Adding Clerk DNS records to goodflippindesign.com..." -ForegroundColor Cyan
Write-Host ""

$added = 0
$skipped = 0
$failed = 0

foreach ($rec in $records) {
    $body = @{
        type    = "CNAME"
        name    = $rec.name
        content = $rec.target
        ttl     = 1
        proxied = $false
    } | ConvertTo-Json

    try {
        $result = Invoke-RestMethod `
            -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" `
            -Headers $headers `
            -Method Post `
            -Body $body `
            -ErrorAction Stop

        Write-Host "  ✅ $($rec.name).goodflippindesign.com → $($rec.target)" -ForegroundColor Green
        $added++
    }
    catch {
        $errDetails = $_.ErrorDetails.Message | ConvertFrom-Json
        $errCode = $errDetails.errors[0].code
        $errMsg = $errDetails.errors[0].message

        if ($errCode -eq 81057) {
            Write-Host "  ⏭️  $($rec.name).goodflippindesign.com (already exists)" -ForegroundColor Yellow
            $skipped++
        }
        else {
            Write-Host "  ❌ $($rec.name): $errMsg" -ForegroundColor Red
            $failed++
        }
    }
}

Write-Host ""
Write-Host "📊 Summary:" -ForegroundColor Cyan
Write-Host "   Added: $added" -ForegroundColor Green
Write-Host "   Skipped: $skipped" -ForegroundColor Yellow
Write-Host "   Failed: $failed" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Gray" })

if ($added + $skipped -eq 5) {
    Write-Host ""
    Write-Host "✅ All 5 DNS records configured!" -ForegroundColor Green
    Write-Host "   DNS propagation takes 5-10 minutes." -ForegroundColor Gray
    Write-Host "   Check Clerk dashboard: https://dashboard.clerk.com/" -ForegroundColor Gray
}
