# Add GitHub Pages Verification TXT Record
# This adds the verification record needed for GitHub Pages custom domain setup

$ErrorActionPreference = "Stop"

# Configuration
$apiToken = $env:CLOUDFLARE_API_TOKEN
if (-not $apiToken) {
    $apiToken = "LlsGtUHBXcGv-CUzZjyFIGF3VUq5WTdmS3U3XPBA"
}

$accountId = "3253d907ea85a18eb442283d7308b193"
$zoneName = "goodflippindesign.com"

# GitHub Pages verification details
$txtRecordName = "_github-pages-challenge-weave0.goodflippindesign.com"
$txtRecordValue = "ee207bcc20d91911a8d848cb701f24"

Write-Host "🔍 Adding GitHub Pages verification TXT record..." -ForegroundColor Cyan
Write-Host "   Domain: $txtRecordName" -ForegroundColor Gray
Write-Host "   Value: $txtRecordValue" -ForegroundColor Gray
Write-Host ""

# Setup headers
$headers = @{
    "Authorization" = "Bearer $apiToken"
    "Content-Type"  = "application/json"
}

try {
    # Get zone ID for the domain
    Write-Host "📍 Finding zone ID for $zoneName..." -ForegroundColor Yellow
    $zonesResponse = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones?name=$zoneName" -Headers $headers -Method Get

    if ($zonesResponse.result.Count -eq 0) {
        Write-Host "❌ Zone not found for $zoneName" -ForegroundColor Red
        exit 1
    }

    $zoneId = $zonesResponse.result[0].id
    Write-Host "✅ Found zone: $zoneId" -ForegroundColor Green
    Write-Host ""

    # Check if record already exists
    Write-Host "🔍 Checking for existing verification record..." -ForegroundColor Yellow
    $existingRecords = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records?type=TXT&name=$txtRecordName" -Headers $headers -Method Get

    if ($existingRecords.result.Count -gt 0) {
        Write-Host "⚠️  Record already exists. Deleting old record..." -ForegroundColor Yellow
        foreach ($record in $existingRecords.result) {
            $deleteResponse = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records/$($record.id)" -Headers $headers -Method Delete
            Write-Host "🗑️  Deleted record: $($record.id)" -ForegroundColor Gray
        }
    }

    # Create the TXT record
    Write-Host "➕ Creating new TXT record..." -ForegroundColor Yellow
    $recordData = @{
        type    = "TXT"
        name    = "_github-pages-challenge-weave0"
        content = $txtRecordValue
        ttl     = 1  # Auto TTL
        proxied = $false
    } | ConvertTo-Json

    $createResponse = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/zones/$zoneId/dns_records" -Headers $headers -Method Post -Body $recordData

    if ($createResponse.success) {
        Write-Host ""
        Write-Host "✅ SUCCESS! GitHub Pages verification TXT record added!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Record Details:" -ForegroundColor Cyan
        Write-Host "   Type: TXT" -ForegroundColor Gray
        Write-Host "   Name: $txtRecordName" -ForegroundColor Gray
        Write-Host "   Value: $txtRecordValue" -ForegroundColor Gray
        Write-Host "   TTL: Auto" -ForegroundColor Gray
        Write-Host ""
        Write-Host "⏳ DNS propagation can take up to 24 hours, but usually completes within minutes." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "🧪 Verify propagation with:" -ForegroundColor Cyan
        Write-Host "   nslookup -type=TXT _github-pages-challenge-weave0.goodflippindesign.com" -ForegroundColor Gray
        Write-Host ""
        Write-Host "🌐 Now complete GitHub Pages setup:" -ForegroundColor Cyan
        Write-Host "   1. Go to: https://github.com/weave0/goodflippindesign/settings/pages" -ForegroundColor Gray
        Write-Host "   2. Enter custom domain: www.goodflippindesign.com" -ForegroundColor Gray
        Write-Host "   3. Wait for DNS check to pass" -ForegroundColor Gray
        Write-Host "   4. Enable 'Enforce HTTPS'" -ForegroundColor Gray
    }
    else {
        Write-Host "❌ Failed to create record: $($createResponse.errors)" -ForegroundColor Red
        exit 1
    }

}
catch {
    Write-Host ""
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Manual Steps (if API fails):" -ForegroundColor Yellow
    Write-Host "1. Go to: https://dash.cloudflare.com/$accountId/goodflippindesign.com/dns" -ForegroundColor Gray
    Write-Host "2. Click 'Add record'" -ForegroundColor Gray
    Write-Host "3. Select type: TXT" -ForegroundColor Gray
    Write-Host "4. Name: _github-pages-challenge-weave0" -ForegroundColor Gray
    Write-Host "5. Content: $txtRecordValue" -ForegroundColor Gray
    Write-Host "6. TTL: Auto" -ForegroundColor Gray
    Write-Host "7. Proxy: OFF" -ForegroundColor Gray
    Write-Host "8. Click 'Save'" -ForegroundColor Gray
    exit 1
}
