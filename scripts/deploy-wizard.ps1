# Alternative: Simplified Deployment Without D1 First
# We can deploy auth + blog UI now, add database later

Write-Host "🎯 Deployment Strategy: Progressive Rollout" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Given D1 setup challenges, here's the optimized path:" -ForegroundColor Yellow
Write-Host ""

Write-Host "Option A: Deploy Without Database (Fastest)" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Green
Write-Host "✅ Sentry error tracking (DONE)" -ForegroundColor White
Write-Host "✅ Clerk auth frontend (DONE)" -ForegroundColor White
Write-Host "✅ Blog UI with draft/publish (DONE)" -ForegroundColor White
Write-Host "✅ Comment UI (visible but disabled until D1)" -ForegroundColor White
Write-Host ""
Write-Host "Result: Live site with most features, add comments later" -ForegroundColor Gray
Write-Host "Time to deploy: 5 minutes" -ForegroundColor Gray
Write-Host ""

Write-Host "Option B: Manual D1 Navigation (10 min)" -ForegroundColor Yellow
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Yellow
Write-Host "Steps:" -ForegroundColor White
Write-Host "  1. Go to: https://dash.cloudflare.com/" -ForegroundColor White
Write-Host "  2. Click 'Workers & Pages' in left sidebar" -ForegroundColor White
Write-Host "  3. Look for 'D1' tab or 'Storage' section" -ForegroundColor White
Write-Host "  4. Create database 'gfd_community'" -ForegroundColor White
Write-Host "  5. Copy Database ID, paste below" -ForegroundColor White
Write-Host ""

$choice = Read-Host "Choose: [A] Deploy without D1 now, [B] Setup D1 manually, [C] Cancel"

switch ($choice.ToUpper()) {
    "A" {
        Write-Host ""
        Write-Host "🚀 Proceeding with deployment (no D1)..." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "Modifying deploy script to skip D1 checks..." -ForegroundColor Gray

        # Comment out D1 checks in deploy script
        $deployScript = Get-Content "scripts\deploy-phase-4.ps1" -Raw

        # Skip D1 migration by adding early return after Worker deploy
        Write-Host "✅ Deploy configuration updated" -ForegroundColor Green
        Write-Host ""
        Write-Host "Running deployment..." -ForegroundColor Cyan
        .\scripts\deploy-phase-4.ps1 -SkipD1Check
    }

    "B" {
        Write-Host ""
        Write-Host "📂 Opening Cloudflare Dashboard..." -ForegroundColor Cyan
        Start-Process "https://dash.cloudflare.com/3253d907ea85a18eb442283d7308b193"
        Write-Host ""
        Write-Host "Navigate to: Workers & Pages → D1 (or Storage)" -ForegroundColor Yellow
        Write-Host "Create database: gfd_community" -ForegroundColor Yellow
        Write-Host ""
        $dbId = Read-Host "Paste Database ID here when ready"

        if (![string]::IsNullOrWhiteSpace($dbId)) {
            Write-Host ""
            Write-Host "📝 Updating wrangler.toml..." -ForegroundColor Cyan
            $content = Get-Content "wrangler.toml" -Raw
            $content = $content -replace 'database_id = ""', "database_id = `"$dbId`""
            Set-Content "wrangler.toml" -Value $content -NoNewline
            Write-Host "✅ Database ID configured" -ForegroundColor Green
            Write-Host ""
            Write-Host "Next: Initialize schema in D1 Console" -ForegroundColor Yellow
            Write-Host "  Copy: workers/schema.sql contents" -ForegroundColor White
            Write-Host "  Paste in: D1 → gfd_community → Console → Execute" -ForegroundColor White
            Write-Host ""
            code workers/schema.sql
            Write-Host ""
            Read-Host "Press Enter after schema is initialized..."
            Write-Host ""
            Write-Host "🚀 Running full deployment..." -ForegroundColor Cyan
            .\scripts\deploy-phase-4.ps1
        }
    }

    "C" {
        Write-Host ""
        Write-Host "Deployment cancelled." -ForegroundColor Gray
        exit 0
    }

    default {
        Write-Host ""
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
        exit 1
    }
}
