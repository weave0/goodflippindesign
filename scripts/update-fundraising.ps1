# Update Fundraising Counter Script
# Usage: .\update-fundraising.ps1 -Amount 2500 -Supporters 45 -Activity "30 minutes ago"

param(
    [Parameter(Mandatory = $false)]
    [int]$Amount,

    [Parameter(Mandatory = $false)]
    [int]$Supporters,

    [Parameter(Mandatory = $false)]
    [int]$Goal,

    [Parameter(Mandatory = $false)]
    [string]$Activity = "recently",

    [Parameter(Mandatory = $false)]
    [switch]$Deploy
)

Write-Host "`n🚀 Fundraising Counter Update Script" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

$indexFile = "index.html"
$tempFile = "temp_review.html"

if (-not (Test-Path $indexFile)) {
    Write-Host "❌ Error: index.html not found in current directory" -ForegroundColor Red
    exit 1
}

# Read current values from index.html
$content = Get-Content $indexFile -Raw
$configPattern = 'totalRaised:\s*(\d+),\s*.*?totalSupporters:\s*(\d+),\s*.*?goal:\s*(\d+),\s*.*?lastDonationTime:\s*[''"]([^''"]*)[''"]'

if ($content -match $configPattern) {
    $currentAmount = [int]$Matches[1]
    $currentSupporters = [int]$Matches[2]
    $currentGoal = [int]$Matches[3]
    $currentActivity = $Matches[4]

    Write-Host "📊 Current Values:" -ForegroundColor Yellow
    Write-Host "   Amount: $" -NoNewline; Write-Host $currentAmount -ForegroundColor Green
    Write-Host "   Supporters: " -NoNewline; Write-Host $currentSupporters -ForegroundColor Green
    Write-Host "   Goal: $" -NoNewline; Write-Host $currentGoal -ForegroundColor Green
    Write-Host "   Last Activity: " -NoNewline; Write-Host $currentActivity -ForegroundColor Green

    # Use current values if no new values provided
    $newAmount = if ($Amount) { $Amount } else { $currentAmount }
    $newSupporters = if ($Supporters) { $Supporters } else { $currentSupporters }
    $newGoal = if ($Goal) { $Goal } else { $currentGoal }
    $newActivity = $Activity

    Write-Host "`n🎯 New Values:" -ForegroundColor Yellow
    Write-Host "   Amount: $" -NoNewline; Write-Host $newAmount -ForegroundColor Magenta
    Write-Host "   Supporters: " -NoNewline; Write-Host $newSupporters -ForegroundColor Magenta
    Write-Host "   Goal: $" -NoNewline; Write-Host $newGoal -ForegroundColor Magenta
    Write-Host "   Last Activity: " -NoNewline; Write-Host $newActivity -ForegroundColor Magenta

    # Calculate progress
    $percentage = [math]::Round(($newAmount / $newGoal) * 100, 1)
    Write-Host "   Progress: " -NoNewline; Write-Host "$percentage%" -ForegroundColor Cyan

    # Update the configuration
    $newConfig = @"
                totalRaised: $newAmount,        // Update this manually
                totalSupporters: $newSupporters,      // Update this manually
                goal: $newGoal,              // Initial funding goal
                lastDonationTime: '$newActivity', // Update manually
"@

    $oldConfig = @"
                totalRaised: $currentAmount,        // Update this manually
                totalSupporters: $currentSupporters,      // Update this manually
                goal: $currentGoal,              // Initial funding goal
                lastDonationTime: '$currentActivity', // Update manually
"@

    Write-Host "`n🔄 Updating files..." -ForegroundColor Yellow

    # Update index.html
    $updatedContent = $content -replace [regex]::Escape($oldConfig), $newConfig
    $updatedContent | Set-Content -Path $indexFile -Encoding UTF8
    Write-Host "   ✅ Updated index.html" -ForegroundColor Green

    # Update temp_review.html (for testing)
    Copy-Item $indexFile $tempFile -Force
    Write-Host "   ✅ Updated temp_review.html" -ForegroundColor Green

    # Update cache bust timestamp
    $timestamp = Get-Date -Format "yyyy-MM-dd-HH:mm"
    $cacheBustPattern = '<!-- Cache bust: [^>]+ -->'
    $newCacheBust = "<!-- Cache bust: $timestamp -->"

    # Update both files with new timestamp
    (Get-Content $indexFile) -replace $cacheBustPattern, $newCacheBust | Set-Content $indexFile
    (Get-Content $tempFile) -replace $cacheBustPattern, $newCacheBust | Set-Content $tempFile
    Write-Host "   ✅ Updated cache bust: $timestamp" -ForegroundColor Green

    Write-Host "`n📈 Summary of Changes:" -ForegroundColor Cyan
    if ($Amount) {
        $change = $newAmount - $currentAmount
        $symbol = if ($change -gt 0) { "📈 +" } else { "📉 " }
        Write-Host "   Total Raised: $symbol$change ($currentAmount → $newAmount)" -ForegroundColor $(if ($change -gt 0) { "Green" } else { "Red" })
    }
    if ($Supporters) {
        $change = $newSupporters - $currentSupporters
        $symbol = if ($change -gt 0) { "👥 +" } else { "👤 " }
        Write-Host "   Supporters: $symbol$change ($currentSupporters → $newSupporters)" -ForegroundColor $(if ($change -gt 0) { "Green" } else { "Red" })
    }
    if ($Goal) {
        Write-Host "   Goal Updated: $currentGoal → $newGoal" -ForegroundColor Blue
    }

    if ($Deploy) {
        Write-Host "`n🚀 Deploying changes..." -ForegroundColor Yellow
        git add index.html temp_review.html 2>$null
        git commit -m "Update fundraising counter: $newAmount raised, $newSupporters supporters" 2>$null
        Write-Host "   ✅ Changes committed to git" -ForegroundColor Green
        Write-Host "   🌐 Push to deploy to live site" -ForegroundColor Cyan
    }
    else {
        Write-Host "`n💡 Next Steps:" -ForegroundColor Yellow
        Write-Host "   1. Review changes in browser" -ForegroundColor White
        Write-Host "   2. Run with -Deploy flag to commit to git" -ForegroundColor White
        Write-Host "   3. Push to deploy to live site" -ForegroundColor White
    }

    Write-Host "`n🎉 Fundraising counter updated successfully!" -ForegroundColor Green
    Write-Host "Preview at: http://localhost:8000" -ForegroundColor Cyan

}
else {
    Write-Host "❌ Error: Could not find fundraising configuration in index.html" -ForegroundColor Red
    Write-Host "Make sure the fundraising counter is properly installed." -ForegroundColor Yellow
}

Write-Host ""
