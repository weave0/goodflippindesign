#!/usr/bin/env pwsh
# Deploy Community Platform to Good Flippin Vibes
# Run from GFV repository root

Write-Host "🚀 GFV Community Platform Deployment Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check if we're in the right directory
if (-not (Test-Path "wrangler.toml")) {
    Write-Host "❌ Error: wrangler.toml not found. Are you in the GFV repo root?" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Found wrangler.toml" -ForegroundColor Green

# Step 1: Copy files from GFD
Write-Host "`n📦 Step 1: Copying files from GFD..." -ForegroundColor Yellow

$gfdPath = "Z:\GFD"

if (-not (Test-Path $gfdPath)) {
    Write-Host "❌ Error: GFD directory not found at $gfdPath" -ForegroundColor Red
    exit 1
}

# Create directories if they don't exist
New-Item -ItemType Directory -Force -Path "workers" | Out-Null

# Copy backend files
Copy-Item "$gfdPath\workers\auth.js" -Destination "workers\auth.js" -Force
Copy-Item "$gfdPath\workers\schema.sql" -Destination "workers\schema.sql" -Force
Copy-Item "$gfdPath\_headers" -Destination "_headers" -Force

Write-Host "✅ Files copied successfully" -ForegroundColor Green

# Step 2: Check Cloudflare login
Write-Host "`n🔐 Step 2: Checking Cloudflare login..." -ForegroundColor Yellow

$whoami = wrangler whoami 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Not logged in to Cloudflare. Running login..." -ForegroundColor Yellow
    wrangler login
}

Write-Host "✅ Cloudflare authenticated" -ForegroundColor Green

# Step 3: Create D1 Database
Write-Host "`n🗄️  Step 3: Setting up D1 Database..." -ForegroundColor Yellow

$dbName = "gfv-community-db"

# Check if database already exists
$existingDbs = wrangler d1 list --json 2>&1 | ConvertFrom-Json
$dbExists = $existingDbs | Where-Object { $_.name -eq $dbName }

if ($dbExists) {
    Write-Host "⚠️  Database '$dbName' already exists" -ForegroundColor Yellow
    $overwrite = Read-Host "Do you want to use the existing database? (Y/n)"

    if ($overwrite -ne "n" -and $overwrite -ne "N") {
        $databaseId = $dbExists.uuid
        Write-Host "✅ Using existing database: $databaseId" -ForegroundColor Green
    }
    else {
        Write-Host "❌ Deployment cancelled" -ForegroundColor Red
        exit 1
    }
}
else {
    Write-Host "Creating new database..." -ForegroundColor Yellow
    $createResult = wrangler d1 create $dbName --json 2>&1 | ConvertFrom-Json
    $databaseId = $createResult.uuid
    Write-Host "✅ Database created: $databaseId" -ForegroundColor Green

    # Run schema
    Write-Host "Running schema migration..." -ForegroundColor Yellow
    wrangler d1 execute $dbName --file="workers\schema.sql"
    Write-Host "✅ Schema applied" -ForegroundColor Green
}

# Update wrangler.toml with database ID
Write-Host "`n📝 Updating wrangler.toml..." -ForegroundColor Yellow

$wranglerContent = Get-Content "wrangler.toml" -Raw

if ($wranglerContent -match 'database_id\s*=\s*"([^"]*)"') {
    $currentDbId = $Matches[1]
    if ($currentDbId -eq "TBD" -or $currentDbId -eq "") {
        $wranglerContent = $wranglerContent -replace 'database_id\s*=\s*"[^"]*"', "database_id = `"$databaseId`""
        Set-Content "wrangler.toml" $wranglerContent
        Write-Host "✅ wrangler.toml updated with database ID" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  Database ID already set in wrangler.toml" -ForegroundColor Yellow
    }
}

# Step 4: Check for Clerk keys
Write-Host "`n🔐 Step 4: Checking Clerk configuration..." -ForegroundColor Yellow

Write-Host @"

To complete deployment, you need:
1. Clerk Publishable Key (starts with pk_test_...)
2. Clerk Secret Key (starts with sk_test_...)

Get these from: https://dashboard.clerk.com/

"@ -ForegroundColor Cyan

$hasClerkPubKey = Read-Host "Do you have your Clerk Publishable Key? (y/N)"
$hasClerkSecKey = Read-Host "Do you have your Clerk Secret Key? (y/N)"

if ($hasClerkPubKey -eq "y" -or $hasClerkPubKey -eq "Y") {
    Write-Host "`nTo set Clerk keys, run:" -ForegroundColor Yellow
    Write-Host "  wrangler secret put CLERK_PUBLISHABLE_KEY" -ForegroundColor White
    Write-Host "  wrangler secret put CLERK_SECRET_KEY" -ForegroundColor White
    Write-Host ""

    $setNow = Read-Host "Set them now? (Y/n)"

    if ($setNow -ne "n" -and $setNow -ne "N") {
        Write-Host "`nEnter your Clerk Publishable Key:" -ForegroundColor Yellow
        wrangler secret put CLERK_PUBLISHABLE_KEY

        Write-Host "`nEnter your Clerk Secret Key:" -ForegroundColor Yellow
        wrangler secret put CLERK_SECRET_KEY

        Write-Host "✅ Clerk keys configured" -ForegroundColor Green
    }
    else {
        Write-Host "⚠️  Remember to set Clerk keys before deploying!" -ForegroundColor Yellow
    }
}
else {
    Write-Host "⚠️  Clerk keys not set. You'll need to configure these before auth works." -ForegroundColor Yellow
}

# Step 5: Optional Sentry setup
Write-Host "`n📊 Step 5: Sentry Error Tracking (Optional)..." -ForegroundColor Yellow

$setupSentry = Read-Host "Do you want to setup Sentry for error tracking? (y/N)"

if ($setupSentry -eq "y" -or $setupSentry -eq "Y") {
    Write-Host @"

Get your Sentry DSN from: https://sentry.io/
Format: https://abc123@o123.ingest.sentry.io/456789

"@ -ForegroundColor Cyan

    Write-Host "Enter your Sentry DSN (or press Enter to skip):" -ForegroundColor Yellow
    $sentryDsn = Read-Host

    if ($sentryDsn) {
        Write-Host $sentryDsn | wrangler secret put SENTRY_DSN
        Write-Host "✅ Sentry configured" -ForegroundColor Green
    }
    else {
        Write-Host "⏭️  Skipped Sentry setup" -ForegroundColor Gray
    }
}
else {
    Write-Host "⏭️  Skipped Sentry setup" -ForegroundColor Gray
}

# Step 6: Deploy Worker
Write-Host "`n🚀 Step 6: Deploying Cloudflare Worker..." -ForegroundColor Yellow

wrangler deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Worker deployed successfully!" -ForegroundColor Green
}
else {
    Write-Host "❌ Worker deployment failed" -ForegroundColor Red
    exit 1
}

# Get Worker URL
$workerUrl = wrangler deployments list --json 2>&1 | ConvertFrom-Json | Select-Object -First 1 -ExpandProperty url

if ($workerUrl) {
    Write-Host "`n✅ Worker deployed to: $workerUrl" -ForegroundColor Green
}
else {
    Write-Host "`n⚠️  Couldn't detect Worker URL. Check Cloudflare dashboard." -ForegroundColor Yellow
}

# Step 7: Test backend
Write-Host "`n🧪 Step 7: Testing backend API..." -ForegroundColor Yellow

if ($workerUrl) {
    try {
        $testResponse = Invoke-RestMethod -Uri "$workerUrl/api/blog" -Method Get
        Write-Host "✅ Backend API is responding" -ForegroundColor Green
    }
    catch {
        Write-Host "⚠️  Backend test failed. Check Worker logs with: wrangler tail" -ForegroundColor Yellow
    }
}

# Final instructions
Write-Host @"

╔════════════════════════════════════════════════════════════╗
║           🎉 BACKEND DEPLOYMENT COMPLETE!                  ║
╚════════════════════════════════════════════════════════════╝

Next Steps:
-----------

1. Update your GFV HTML file:
   - Add CSS from: Z:\GFD\deploy-to-gfv\community-platform-styles.css
   - Add HTML components from: Z:\GFD\deploy-to-gfv\community-platform-components.html
   - Add JavaScript from: Z:\GFD\deploy-to-gfv\community-platform-script.js

2. Update JavaScript config with your Worker URL:
   const CONFIG = {
       apiBaseUrl: '$workerUrl',
       clerkPublishableKey: 'YOUR_CLERK_PUBLISHABLE_KEY'
   };

3. Deploy your updated HTML to production

4. Test:
   - Sign in with Clerk
   - Post a comment
   - Create a blog post (if admin)

Troubleshooting:
----------------
- Check Worker logs: wrangler tail
- View database: wrangler d1 execute $dbName --command="SELECT * FROM comments;"
- Check Clerk dashboard: https://dashboard.clerk.com/

Documentation:
--------------
- Full guide: Z:\GFD\deploy-to-gfv\DEPLOYMENT_GUIDE.md

"@ -ForegroundColor Cyan

Write-Host "✨ Ready to add community features to goodflippinvibes.com!" -ForegroundColor Green
