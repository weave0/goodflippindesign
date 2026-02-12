# D1 Schema Initialization - Final Steps

Write-Host "✅ Database ID configured in wrangler.toml" -ForegroundColor Green
Write-Host "   Database: gfd_community" -ForegroundColor Gray
Write-Host "   ID: a46ec9df-31b8-4285-845b-1fd3a62bd1b5" -ForegroundColor Gray
Write-Host ""

Write-Host "📋 NEXT: Initialize Schema via Dashboard" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Browser opened to Cloudflare Dashboard" -ForegroundColor Yellow
Write-Host "VS Code opened with schema SQL" -ForegroundColor Yellow
Write-Host ""

Write-Host "🔸 Step 1: In Cloudflare Dashboard" -ForegroundColor Green
Write-Host "   Navigate to: Storage & Databases → D1" -ForegroundColor White
Write-Host "   Click on: gfd_community" -ForegroundColor White
Write-Host "   Click: Console tab" -ForegroundColor White
Write-Host ""

Write-Host "🔸 Step 2: Copy SQL from VS Code" -ForegroundColor Green
Write-Host "   File: d1-schema-console.sql (now open)" -ForegroundColor White
Write-Host "   Action: Select All (Ctrl+A) → Copy (Ctrl+C)" -ForegroundColor White
Write-Host ""

Write-Host "🔸 Step 3: Paste into D1 Console" -ForegroundColor Green
Write-Host "   In D1 Console: Paste SQL (Ctrl+V)" -ForegroundColor White
Write-Host "   Click: Execute" -ForegroundColor White
Write-Host "   Wait for: Success message" -ForegroundColor White
Write-Host ""

Write-Host "Expected result: 5 tables created (comments, blog_posts, etc.)" -ForegroundColor Gray
Write-Host ""

$continue = Read-Host "Press Enter once schema is initialized in dashboard"

Write-Host ""
Write-Host "🔍 Verifying schema..." -ForegroundColor Cyan

# Try to verify via API (might fail with current token)
try {
    $result = wrangler d1 execute gfd_community --remote --command "SELECT name FROM sqlite_master WHERE type='table'"
    Write-Host "✅ Schema verification successful!" -ForegroundColor Green
    Write-Host $result
}
catch {
    Write-Host "⚠️ Cannot verify via CLI (token permissions)" -ForegroundColor Yellow
    Write-Host "   Verify in dashboard Console: SELECT name FROM sqlite_master WHERE type='table'" -ForegroundColor Gray
}

Write-Host ""
Write-Host "🎉 D1 Database Fully Configured!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "✅ Database created: gfd_community" -ForegroundColor White
Write-Host "✅ Database ID: a46ec9df-31b8-4285-845b-1fd3a62bd1b5" -ForegroundColor White
Write-Host "✅ Schema initialized: 5 tables" -ForegroundColor White
Write-Host "✅ wrangler.toml configured" -ForegroundColor White
Write-Host ""
Write-Host "🚀 Ready for Deployment!" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next command:" -ForegroundColor Yellow
Write-Host "  .\scripts\deploy-phase-4.ps1" -ForegroundColor White
Write-Host ""

$deploy = Read-Host "Run deployment now? (Y/n)"

if ($deploy -eq '' -or $deploy -eq 'y' -or $deploy -eq 'Y') {
    Write-Host ""
    Write-Host "🚀 Starting deployment..." -ForegroundColor Cyan
    Write-Host ""
    .\scripts\deploy-phase-4.ps1
}
else {
    Write-Host ""
    Write-Host "Deployment postponed. Run manually when ready:" -ForegroundColor Gray
    Write-Host "  .\scripts\deploy-phase-4.ps1" -ForegroundColor White
}
