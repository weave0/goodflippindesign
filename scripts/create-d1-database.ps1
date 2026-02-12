# Create D1 Database via Cloudflare API
# Alternative to wrangler when API token permissions are restricted

$accountId = "3253d907ea85a18eb442283d7308b193"
$databaseName = "gfd_community"

# Try to get API token from environment
$apiToken = $env:CLOUDFLARE_API_TOKEN

if (-not $apiToken) {
    Write-Host "❌ CLOUDFLARE_API_TOKEN not found in environment" -ForegroundColor Red
    exit 1
}

Write-Host "🔧 Creating D1 database: $databaseName..." -ForegroundColor Cyan
Write-Host ""

# Create D1 database via API
$headers = @{
    "Authorization" = "Bearer $apiToken"
    "Content-Type"  = "application/json"
}

$body = @{
    name = $databaseName
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/d1/database" -Method POST -Headers $headers -Body $body

    if ($response.success) {
        $dbId = $response.result.uuid
        Write-Host "✅ D1 Database created successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Database ID: $dbId" -ForegroundColor Yellow
        Write-Host ""

        # Update wrangler.toml
        Write-Host "📝 Updating wrangler.toml..." -ForegroundColor Cyan
        $wranglerContent = Get-Content "wrangler.toml" -Raw
        $wranglerContent = $wranglerContent -replace 'database_id = ""', "database_id = `"$dbId`""
        Set-Content "wrangler.toml" -Value $wranglerContent -NoNewline
        Write-Host "✅ wrangler.toml updated" -ForegroundColor Green
        Write-Host ""

        # Output next steps
        Write-Host "🎉 D1 Database Setup Complete!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Next: Initialize schema with:" -ForegroundColor Cyan
        Write-Host "  wrangler d1 execute gfd_community --remote --file workers/schema.sql" -ForegroundColor White
        Write-Host ""
        Write-Host "Or use this database ID in Cloudflare dashboard:" -ForegroundColor Gray
        Write-Host "  $dbId" -ForegroundColor Gray
    }
    else {
        Write-Host "❌ Failed to create database" -ForegroundColor Red
        Write-Host "Response: $($response | ConvertTo-Json)" -ForegroundColor Gray
    }
}
catch {
    Write-Host "❌ API request failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Fallback: Create via dashboard:" -ForegroundColor Yellow
    Write-Host "   1. Go to: https://dash.cloudflare.com/$accountId/workers-and-pages/d1" -ForegroundColor White
    Write-Host "   2. Click 'Create database'" -ForegroundColor White
    Write-Host "   3. Name: gfd_community" -ForegroundColor White
    Write-Host "   4. Copy the Database ID and run:" -ForegroundColor White
    Write-Host "      Update wrangler.toml line 9 with the ID" -ForegroundColor Gray
}
