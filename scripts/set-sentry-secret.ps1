# Set Sentry DSN in Cloudflare Pages
# This script sets the DSN as an environment variable for the Pages project

$dsn = "https://3305b7dd868d3b26525f650225661b3c@o4510293463728128.ingest.us.sentry.io/4510871217176576"
$projectName = "goodflippindesign"

Write-Host "🔒 Setting SENTRY_DSN in Cloudflare Pages project: $projectName..." -ForegroundColor Cyan
Write-Host ""

try {
    # Set for production environment
    Write-Host "Setting for production environment..." -ForegroundColor Yellow
    $dsn | wrangler pages secret put SENTRY_DSN --project-name $projectName

    Write-Host ""
    Write-Host "✅ SENTRY_DSN secret set successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "🔍 Verifying secrets..." -ForegroundColor Yellow
    wrangler pages secret list --project-name $projectName
    Write-Host ""
    Write-Host "🎉 Sentry configuration complete!" -ForegroundColor Green
}
catch {
    Write-Host "❌ Failed to set secret: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Alternative: Set via Cloudflare dashboard:" -ForegroundColor Yellow
    Write-Host "   1. Go to: https://dash.cloudflare.com" -ForegroundColor White
    Write-Host "   2. Pages → goodflippindesign → Settings → Environment variables" -ForegroundColor White
    Write-Host "   3. Add variable: SENTRY_DSN = $dsn" -ForegroundColor White
    exit 1
}
