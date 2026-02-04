# Force Cloudflare Pages Deployment
# Uses CF_FULL_ITHINK token to manually trigger deployment

$ErrorActionPreference = "Stop"

Write-Host "🚀 Forcing Cloudflare Pages deployment..." -ForegroundColor Cyan
Write-Host ""

# Get token from GitHub secret (run this via GitHub Actions) or environment
$apiToken = $env:CF_FULL_ITHINK
if (-not $apiToken) {
    Write-Host "❌ CF_FULL_ITHINK token not found in environment" -ForegroundColor Red
    Write-Host "This script should be run via GitHub Actions workflow" -ForegroundColor Yellow
    exit 1
}

$accountId = "3253d907ea85a18eb442283d7308b193"
$projectName = "goodflippindesign"

# Setup headers
$headers = @{
    "Authorization" = "Bearer $apiToken"
    "Content-Type"  = "application/json"
}

try {
    # Get latest commit info
    Write-Host "📍 Getting latest commit info..." -ForegroundColor Yellow
    $commit = git rev-parse HEAD
    $branch = git branch --show-current
    Write-Host "✅ Commit: $commit" -ForegroundColor Green
    Write-Host "✅ Branch: $branch" -ForegroundColor Green
    Write-Host ""

    # Get project info
    Write-Host "📋 Getting Cloudflare Pages project info..." -ForegroundColor Yellow
    $projectInfo = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/pages/projects/$projectName" -Headers $headers -Method Get

    if ($projectInfo.success) {
        Write-Host "✅ Project found: $($projectInfo.result.name)" -ForegroundColor Green
        Write-Host "   Production branch: $($projectInfo.result.production_branch)" -ForegroundColor Gray
        Write-Host ""
    }

    # Create a new deployment
    Write-Host "🚀 Creating new deployment..." -ForegroundColor Yellow

    $deploymentData = @{
        branch = $branch
    } | ConvertTo-Json

    # Note: Direct deployment creation via API is complex and requires uploading files
    # Instead, we'll trigger a retry of the latest deployment or webhook

    # Get latest deployments
    $deployments = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/pages/projects/$projectName/deployments" -Headers $headers -Method Get

    if ($deployments.result.Count -gt 0) {
        $latestDeployment = $deployments.result[0]
        Write-Host "📦 Latest deployment:" -ForegroundColor Cyan
        Write-Host "   ID: $($latestDeployment.id)" -ForegroundColor Gray
        Write-Host "   Created: $($latestDeployment.created_on)" -ForegroundColor Gray
        Write-Host "   Stage: $($latestDeployment.latest_stage.name)" -ForegroundColor Gray
        Write-Host ""

        # Try to retry the deployment
        Write-Host "♻️  Retrying deployment..." -ForegroundColor Yellow
        try {
            $retryResponse = Invoke-RestMethod -Uri "https://api.cloudflare.com/client/v4/accounts/$accountId/pages/projects/$projectName/deployments/$($latestDeployment.id)/retry" -Headers $headers -Method Post

            if ($retryResponse.success) {
                Write-Host "✅ Deployment retry triggered successfully!" -ForegroundColor Green
                Write-Host ""
                Write-Host "🌐 Monitor deployment at:" -ForegroundColor Cyan
                Write-Host "   https://dash.cloudflare.com/$accountId/pages/view/$projectName" -ForegroundColor Gray
                Write-Host ""
                Write-Host "⏳ Wait 2-3 minutes, then verify:" -ForegroundColor Yellow
                Write-Host "   curl -s https://goodflippindesign.pages.dev/ | Select-String 'Cache bust:'" -ForegroundColor Gray
            }
        }
        catch {
            Write-Host "⚠️  Retry endpoint not available, trying webhook trigger..." -ForegroundColor Yellow

            # If retry doesn't work, we need to trigger via GitHub webhook or reconnect
            Write-Host ""
            Write-Host "📌 Alternative: Trigger via GitHub webhook" -ForegroundColor Cyan
            Write-Host "   The deployment should auto-trigger from GitHub pushes" -ForegroundColor Gray
            Write-Host ""
            Write-Host "🔧 If deployments aren't working, check Cloudflare Pages settings:" -ForegroundColor Yellow
            Write-Host "   1. Go to: https://dash.cloudflare.com/$accountId/pages/view/$projectName/settings/builds" -ForegroundColor Gray
            Write-Host "   2. Verify GitHub connection is active" -ForegroundColor Gray
            Write-Host "   3. Check build settings match production branch" -ForegroundColor Gray
        }
    }

}
catch {
    Write-Host ""
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red

    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host ""
        Write-Host "🔑 Token authentication failed. The CF_FULL_ITHINK token may need these permissions:" -ForegroundColor Yellow
        Write-Host "   - Account → Cloudflare Pages → Edit" -ForegroundColor Gray
        Write-Host "   - Zone → DNS → Edit (optional)" -ForegroundColor Gray
        Write-Host ""
        Write-Host "🔗 Update token permissions at:" -ForegroundColor Cyan
        Write-Host "   https://dash.cloudflare.com/profile/api-tokens" -ForegroundColor Gray
    }

    exit 1
}
