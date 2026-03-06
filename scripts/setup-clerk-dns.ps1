# Setup Clerk DNS Records for goodflippindesign.com
# Run this script to add all 5 required CNAME records for Clerk

$domain = "goodflippindesign.com"

# CNAME records from Clerk dashboard
$records = @(
    @{ name = "clerk"; target = "frontend-api.clerk.services"; comment = "Clerk Frontend API" }
    @{ name = "accounts"; target = "accounts.clerk.services"; comment = "Clerk Account Portal" }
    @{ name = "clkmail"; target = "mail.k6r91ngsvz3c.clerk.services"; comment = "Clerk Email" }
    @{ name = "clk._domainkey"; target = "dkim1.k6r91ngsvz3c.clerk.services"; comment = "Clerk DKIM 1" }
    @{ name = "clk2._domainkey"; target = "dkim2.k6r91ngsvz3c.clerk.services"; comment = "Clerk DKIM 2" }
)

Write-Host "🔧 Setting up Clerk DNS records for $domain" -ForegroundColor Cyan
Write-Host ""

# Get zone ID
Write-Host "📡 Fetching Cloudflare zone ID..." -ForegroundColor Yellow
$zones = wrangler zones list --json 2>&1 | ConvertFrom-Json
$zone = $zones | Where-Object { $_.name -eq $domain }

if (-not $zone) {
    Write-Host "❌ Zone '$domain' not found in your Cloudflare account" -ForegroundColor Red
    Write-Host "   Available zones:" -ForegroundColor Yellow
    $zones | ForEach-Object { Write-Host "   - $($_.name)" -ForegroundColor Gray }
    exit 1
}

$zoneId = $zone.id
Write-Host "✅ Found zone: $domain (ID: $zoneId)" -ForegroundColor Green
Write-Host ""

# Add each DNS record
foreach ($record in $records) {
    $fullName = "$($record.name).$domain"
    Write-Host "➕ Adding CNAME: $fullName → $($record.target)" -ForegroundColor Cyan
    
    # Check if record already exists
    $existing = wrangler dns list --zone-id=$zoneId --name=$fullName --json 2>&1 | ConvertFrom-Json
    
    if ($existing -and $existing.Count -gt 0) {
        Write-Host "   ⚠️  Record already exists, skipping..." -ForegroundColor Yellow
        continue
    }
    
    # Add the CNAME record
    try {
        wrangler dns create $domain CNAME $($record.name) $($record.target) --comment "$($record.comment)" 2>&1
        Write-Host "   ✅ Created successfully" -ForegroundColor Green
    } catch {
        Write-Host "   ❌ Failed: $_" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "🎉 DNS setup complete!" -ForegroundColor Green
Write-Host ""
Write-Host "⏳ Next steps:" -ForegroundColor Yellow
Write-Host "   1. Wait 5-10 minutes for DNS propagation"
Write-Host "   2. Go to Clerk dashboard → Domains → goodflippindesign.com"
Write-Host "   3. Verify all 5 records show as 'Verified'"
Write-Host "   4. Wait for SSL certificates to be issued"
Write-Host ""
Write-Host "🔍 To check DNS propagation:" -ForegroundColor Cyan
Write-Host "   nslookup clerk.goodflippindesign.com"
