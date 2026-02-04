#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy logo + donation link changes to all 5 ecosystem sites
.DESCRIPTION
    Commits and pushes branding fixes to each ecosystem repository
#>

$ErrorActionPreference = "Stop"
$repos = @(
    @{
        Path  = "Z:\GFD\GFD Dev Projects\AI\portal"
        Files = @("components/EcosystemNav.tsx", "components/Footer.tsx")
        Name  = "AI Aimate"
    },
    @{
        Path  = "Z:\GFD\GFD Dev Projects\GFV\website"
        Files = @("index.html", "shared/ecosystem-nav.html")
        Name  = "Good Flippin Vibes"
    },
    @{
        Path  = "Z:\GFD\GFD Dev Projects\Globaldeets"
        Files = @("index.html")
        Name  = "GlobalDeets"
    },
    @{
        Path  = "Z:\GFD\GFD Dev Projects\CultureSherpa\website-astro"
        Files = @("src/layouts/BaseLayout.astro")
        Name  = "CultureSherpa"
    },
    @{
        Path  = "Z:\GFD\GFD Dev Projects\CitizenApproved"
        Files = @("src/app/layout.tsx", "src/app/page.tsx")
        Name  = "CitizenApproved"
    }
)

Write-Host "`n🚀 DEPLOYING BRANDING FIXES TO 5 ECOSYSTEM SITES`n" -ForegroundColor Cyan

foreach ($repo in $repos) {
    Write-Host "📦 Processing: $($repo.Name)" -ForegroundColor Yellow

    if (-not (Test-Path $repo.Path)) {
        Write-Host "   ⚠️  Path not found: $($repo.Path)" -ForegroundColor Red
        continue
    }

    Push-Location $repo.Path

    try {
        # Check if it's a git repo
        $isGitRepo = Test-Path ".git"
        if (-not $isGitRepo) {
            Write-Host "   ⚠️  Not a git repository, skipping" -ForegroundColor Red
            Pop-Location
            continue
        }

        # Stage files
        foreach ($file in $repo.Files) {
            if (Test-Path $file) {
                git add $file
                Write-Host "   ✅ Staged: $file" -ForegroundColor Green
            }
            else {
                Write-Host "   ⚠️  File not found: $file" -ForegroundColor Red
            }
        }

        # Check if there are changes to commit
        $status = git status --porcelain
        if ($status) {
            git commit -m "🎨 Replace trident logo with round logo + add donation link"
            Write-Host "   💾 Committed changes" -ForegroundColor Green

            # Push
            git push
            Write-Host "   🚀 Pushed to remote`n" -ForegroundColor Green
        }
        else {
            Write-Host "   ℹ️  No changes to commit`n" -ForegroundColor Gray
        }

    }
    catch {
        Write-Host "   ❌ Error: $_`n" -ForegroundColor Red
    }
    finally {
        Pop-Location
    }
}

Write-Host "✅ DEPLOYMENT COMPLETE!`n" -ForegroundColor Cyan
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Manually connect Cloudflare to GitHub (see instructions)" -ForegroundColor White
Write-Host "2. Verify each site displays round logo correctly" -ForegroundColor White
Write-Host "3. Test donation links from all footers`n" -ForegroundColor White
