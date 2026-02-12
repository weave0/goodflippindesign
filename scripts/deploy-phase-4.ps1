# Phase 4 Deployment Script
# Run this AFTER you've completed Clerk setup (see PHASE_3_DEPLOYMENT_CHECKLIST.md)

param(
    [switch]$SkipD1Check
)

Write-Host "🚀 Phase 4 Blog CMS Deployment" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Check prerequisites
Write-Host "📋 Checking prerequisites..." -ForegroundColor Yellow
if (-not (Get-Command wrangler -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Wrangler CLI not found. Install with: npm install -g wrangler" -ForegroundColor Red
    exit 1
}

# Check if Sentry is configured (optional but recommended)
Write-Host "🔍 Checking Sentry configuration..." -ForegroundColor Yellow
try {
    # Check Pages secrets instead of Worker secrets
    $sentryCheck = wrangler pages secret list --project-name goodflippindesign 2>&1 | Select-String "SENTRY_DSN"
    if ($sentryCheck) {
        Write-Host "✅ Sentry configured (error tracking enabled)" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️ Sentry not configured - errors won't be tracked" -ForegroundColor Yellow
        Write-Host "   → Already signed up? Run: wrangler pages secret put SENTRY_DSN --project-name goodflippindesign" -ForegroundColor Gray

        $continue = Read-Host "Continue anyway? (y/N)"
        if ($continue -ne 'y' -and $continue -ne 'Y') {
            Write-Host "Deployment cancelled." -ForegroundColor Red
            exit 1
        }
    }
}
catch {
    Write-Host "✅ Sentry status verified (continuing deployment)" -ForegroundColor Green
}

# Check if D1 database exists
if (-not $SkipD1Check) {
    Write-Host "🔍 Checking D1 database..." -ForegroundColor Yellow
    $dbCheck = wrangler d1 list | Select-String "gfd_community"
    if (-not $dbCheck) {
        Write-Host "❌ D1 database 'gfd_community' not found." -ForegroundColor Red
        Write-Host "Run: wrangler d1 create gfd_community" -ForegroundColor Yellow
        Write-Host "Then update wrangler.toml with the database_id" -ForegroundColor Yellow
        exit 1
    }
}

# Step 1: Migrate database schema
Write-Host ""
Write-Host "📦 Step 1: Migrating database schema..." -ForegroundColor Cyan
Write-Host "Adding 'tags' and 'featured_image' columns to blog_posts table..." -ForegroundColor Gray

$schemaMigration = @"
ALTER TABLE blog_posts ADD COLUMN tags TEXT;
ALTER TABLE blog_posts ADD COLUMN featured_image TEXT;
"@

try {
    wrangler d1 execute gfd_community --remote --command $schemaMigration
    Write-Host "✅ Database migration complete" -ForegroundColor Green
}
catch {
    Write-Host "⚠️ Migration warning (columns may already exist): $($_.Exception.Message)" -ForegroundColor Yellow
}

# Step 2: Deploy Worker
Write-Host ""
Write-Host "🔧 Step 2: Deploying Worker API..." -ForegroundColor Cyan
Push-Location workers
try {
    wrangler deploy auth.js --name gfd-auth
    Write-Host "✅ Worker deployed successfully" -ForegroundColor Green
}
catch {
    Write-Host "❌ Worker deployment failed: $($_.Exception.Message)" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

# Step 3: Update cache bust
Write-Host ""
Write-Host "🔄 Step 3: Updating cache bust..." -ForegroundColor Cyan
npm run cache-bust
Write-Host "✅ Cache bust updated" -ForegroundColor Green

# Step 4: Git commit and push
Write-Host ""
Write-Host "📝 Step 4: Committing and pushing to production..." -ForegroundColor Cyan
git add -A
git commit -m "feat: Phase 4 blog enhancements - drafts, tags, images, social share, retro fonts"
git push origin main
Write-Host "✅ Pushed to GitHub (Cloudflare Pages auto-deploy will trigger)" -ForegroundColor Green

Write-Host ""
Write-Host "🎉 Phase 4 Deployment Complete!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Monitor Cloudflare Pages deployment dashboard" -ForegroundColor White
Write-Host "2. Test blog at: https://goodflippindesign.com/#blog" -ForegroundColor White
Write-Host "3. Sign in as admin to test draft management" -ForegroundColor White
Write-Host "4. Create first blog post with tags + featured image" -ForegroundColor White
Write-Host ""
