# Quick D1 Setup - Copy/Paste Commands

Write-Host "📋 D1 Database Quick Setup" -ForegroundColor Cyan
Write-Host "===========================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Browser opened to: Cloudflare D1 Dashboard" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔸 Step 1: In the browser that just opened" -ForegroundColor Green
Write-Host "   - Click 'Create database'" -ForegroundColor White
Write-Host "   - Database name: gfd_community" -ForegroundColor White
Write-Host "   - Click 'Create'" -ForegroundColor White
Write-Host ""

Write-Host "🔸 Step 2: Copy the Database ID" -ForegroundColor Green
Write-Host "   - After creation, you'll see: Database ID" -ForegroundColor White
Write-Host "   - Copy it (format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)" -ForegroundColor White
Write-Host ""

Write-Host "🔸 Step 3: Paste Database ID below and press Enter" -ForegroundColor Green
$dbId = Read-Host "Database ID"

if ([string]::IsNullOrWhiteSpace($dbId)) {
    Write-Host "❌ No Database ID provided" -ForegroundColor Red
    exit 1
}

# Update wrangler.toml
Write-Host ""
Write-Host "📝 Updating wrangler.toml..." -ForegroundColor Cyan
try {
    $wranglerPath = "wrangler.toml"
    $content = Get-Content $wranglerPath -Raw
    $content = $content -replace 'database_id = ""', "database_id = `"$dbId`""
    Set-Content $wranglerPath -Value $content -NoNewline
    Write-Host "✅ wrangler.toml updated with Database ID: $dbId" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to update wrangler.toml: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Initialize schema
Write-Host ""
Write-Host "🔸 Step 4: Initializing database schema..." -ForegroundColor Green
Write-Host ""

try {
    wrangler d1 execute gfd_community --remote --file workers/schema.sql
    Write-Host ""
    Write-Host "✅ Schema initialized successfully!" -ForegroundColor Green
}
catch {
    Write-Host ""
    Write-Host "⚠️ Schema initialization via CLI failed (token permissions)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Alternative: Copy/paste into D1 Console in dashboard:" -ForegroundColor Yellow
    Write-Host "   1. In Cloudflare dashboard → D1 → gfd_community → Console" -ForegroundColor White
    Write-Host "   2. Copy contents of: workers/schema.sql" -ForegroundColor White
    Write-Host "   3. Paste into Console and Execute" -ForegroundColor White
    Write-Host ""
    Write-Host "   Opening schema file..." -ForegroundColor Gray
    code workers/schema.sql
    Write-Host ""
    $continue = Read-Host "Press Enter after running schema in dashboard..."
}

Write-Host ""
Write-Host "🎉 D1 Database Setup Complete!" -ForegroundColor Green
Write-Host "==============================" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Database created: gfd_community" -ForegroundColor White
Write-Host "✅ Database ID configured in wrangler.toml" -ForegroundColor White
Write-Host "✅ Schema initialized (comments, blog_posts tables)" -ForegroundColor White
Write-Host ""
Write-Host "Next: Deploy to production" -ForegroundColor Cyan
Write-Host "  .\scripts\deploy-phase-4.ps1" -ForegroundColor White
Write-Host ""
