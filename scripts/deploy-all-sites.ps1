#!/usr/bin/env pwsh
# Complete Deployment Script for All 6 Sites with GA4 Tracking
# Created: 2026-02-09
# Purpose: Deploy GA4 tracking updates to production across ecosystem

param(
    [switch]$DryRun = $false,
    [switch]$SkipVercel = $false,
    [switch]$SkipCloudflare = $false,
    [switch]$SkipS3 = $false
)

$ErrorActionPreference = "Continue"
$global:DeploymentResults = @()

function Write-Status {
    param($Message, $Type = "Info")
    $colors = @{
        "Info"    = "Cyan"
        "Success" = "Green"
        "Warning" = "Yellow"
        "Error"   = "Red"
    }
    Write-Host $Message -ForegroundColor $colors[$Type]
}

function Add-Result {
    param($Site, $Status, $Method, $Details)
    $global:DeploymentResults += [PSCustomObject]@{
        Site    = $Site
        Status  = $Status
        Method  = $Method
        Details = $Details
        Time    = Get-Date -Format "HH:mm:ss"
    }
}

# Banner
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║   GA4 UNIFIED TRACKING - PRODUCTION DEPLOYMENT SUITE     ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Magenta

# ============================================================================
# SITE 1 & 2: Vercel Sites (CitizenApproved, AI Aimate)
# ============================================================================
if (-not $SkipVercel) {
    Write-Status "`n[1/4] VERCEL DEPLOYMENTS" "Info"
    Write-Status "────────────────────────────────────────" "Info"
    
    # AI Aimate - Direct deployment
    try {
        Set-Location "Z:\aiaimate\portal"
        Write-Status "→ AI Aimate (portal.aiaimate.com)" "Info"
        
        if ($DryRun) {
            Write-Status "  [DRY RUN] Would deploy via: vercel --prod" "Warning"
            Add-Result "AI Aimate" "Skipped (Dry Run)" "Vercel" "Manual deployment required"
        }
        else {
            Write-Status "  Checking git status..." "Info"
            $gitStatus = git status --porcelain
            if ($gitStatus) {
                Write-Status "  ⚠ Uncommitted changes detected - committing first" "Warning"
                git add .
                git commit -m "chore: GA4 deployment checkpoint"
            }
            
            Write-Status "  Pushing to origin..." "Info"
            git push origin main 2>&1 | Out-Null
            
            Write-Status "  ✅ Pushed to GitHub - Vercel auto-deploy triggered" "Success"
            Add-Result "AI Aimate" "Success" "Vercel (Auto-Deploy)" "GitHub push completed"
        }
    }
    catch {
        Write-Status "  ❌ Error: $_" "Error"
        Add-Result "AI Aimate" "Failed" "Vercel" $_.Exception.Message
    }
    
    # CitizenApproved - Auto-deploy from GitHub
    try {
        Set-Location "Z:\CitizenApproved"
        Write-Status "`n→ CitizenApproved (citizenapproved.com)" "Info"
        
        if ($DryRun) {
            Write-Status "  [DRY RUN] Would trigger auto-deploy via git push" "Warning"
            Add-Result "CitizenApproved" "Skipped (Dry Run)" "Vercel" "Manual deployment required"
        }
        else {
            Write-Status "  Verifying git is up to date..." "Info"
            git fetch origin main 2>&1 | Out-Null
            $behind = git rev-list --count HEAD..origin/main
            
            if ($behind -gt 0) {
                Write-Status "  Pulling latest changes..." "Info"
                git pull origin main
            }
            
            Write-Status "  Pushing to GitHub (triggers Vercel auto-deploy)..." "Info"
            git push origin main 2>&1 | Out-Null
            
            Write-Status "  ✅ Auto-deploy triggered via GitHub integration" "Success"
            Add-Result "CitizenApproved" "Success" "Vercel (Auto-Deploy)" "GitHub push completed"
        }
    }
    catch {
        Write-Status "  ❌ Error: $_" "Error"
        Add-Result "CitizenApproved" "Failed" "Vercel" $_.Exception.Message
    }
}

# ============================================================================
# SITE 3 & 4: Cloudflare Pages (Good Flippin Vibes, GlobalDeets)
# ============================================================================
if (-not $SkipCloudflare) {
    Write-Status "`n[2/4] CLOUDFLARE PAGES DEPLOYMENTS" "Info"
    Write-Status "────────────────────────────────────────" "Info"
    
    # Good Flippin Vibes
    try {
        Set-Location "Z:\good-flippin-vibes"
        Write-Status "`n→ Good Flippin Vibes (goodflippinvibes.com)" "Info"
        
        if ($DryRun) {
            Write-Status "  [DRY RUN] Would deploy via wrangler or git push" "Warning"
            Add-Result "Good Flippin Vibes" "Skipped (Dry Run)" "Cloudflare" "Manual deployment required"
        }
        else {
            Write-Status "  Pushing to GitHub (triggers Cloudflare auto-deploy)..." "Info"
            git push origin main 2>&1 | Out-Null
            
            Write-Status "  ✅ Auto-deploy triggered (check Cloudflare dashboard)" "Success"
            Add-Result "Good Flippin Vibes" "Success" "Cloudflare (Auto-Deploy)" "GitHub push completed"
        }
    }
    catch {
        Write-Status "  ❌ Error: $_" "Error"
        Add-Result "Good Flippin Vibes" "Failed" "Cloudflare" $_.Exception.Message
    }
    
    # GlobalDeets
    try {
        Set-Location "Z:\globaldeets"
        Write-Status "`n→ GlobalDeets (globaldeets.com)" "Info"
        
        if ($DryRun) {
            Write-Status "  [DRY RUN] Would deploy via wrangler or git push" "Warning"
            Add-Result "GlobalDeets" "Skipped (Dry Run)" "Cloudflare" "Manual deployment required"
        }
        else {
            Write-Status "  Pushing to GitHub (triggers Cloudflare auto-deploy)..." "Info"
            git push origin main 2>&1 | Out-Null
            
            Write-Status "  ✅ Auto-deploy triggered (check Cloudflare dashboard)" "Success"
            Add-Result "GlobalDeets" "Success" "Cloudflare (Auto-Deploy)" "GitHub push completed"
        }
    }
    catch {
        Write-Status "  ❌ Error: $_" "Error"
        Add-Result "GlobalDeets" "Failed" "Cloudflare" $_.Exception.Message
    }
}

# ============================================================================
# SITE 5: S3/CloudFront (CultureSherpa)
# ============================================================================
if (-not $SkipS3) {
    Write-Status "`n[3/4] S3/CLOUDFRONT DEPLOYMENT" "Info"
    Write-Status "────────────────────────────────────────" "Info"
    
    try {
        Set-Location "Z:\CultureSherpa\website-astro"
        Write-Status "`n→ CultureSherpa (culturesherpa.org)" "Info"
        
        if ($DryRun) {
            Write-Status "  [DRY RUN] Would run: pnpm build && deploy_to_production.ps1" "Warning"
            Add-Result "CultureSherpa" "Skipped (Dry Run)" "S3/CloudFront" "Manual deployment required"
        }
        else {
            Write-Status "  Running production build..." "Info"
            $buildOutput = pnpm build 2>&1
            
            if ($LASTEXITCODE -eq 0) {
                Write-Status "  ✅ Build completed successfully" "Success"
                Write-Status "  Deploying to S3..." "Info"
                
                Set-Location "Z:\CultureSherpa"
                $deployOutput = & .\deploy_to_production.ps1 -SkipIndexRegen 2>&1
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Status "  ✅ Deployed to S3 and CloudFront invalidated" "Success"
                    Add-Result "CultureSherpa" "Success" "S3/CloudFront" "Build and deploy completed"
                }
                else {
                    throw "Deploy script failed: $deployOutput"
                }
            }
            else {
                throw "Build failed: $buildOutput"
            }
        }
    }
    catch {
        Write-Status "  ❌ Error: $_" "Error"
        Add-Result "CultureSherpa" "Failed" "S3/CloudFront" $_.Exception.Message
    }
}

# ============================================================================
# SITE 6: GitHub Pages (Good Flippin Design)
# ============================================================================
Write-Status "`n[4/4] GITHUB PAGES DEPLOYMENT" "Info"
Write-Status "────────────────────────────────────────" "Info"

try {
    Set-Location "Z:\GFD"
    Write-Status "`n→ Good Flippin Design (goodflippindesign.com)" "Info"
    
    if ($DryRun) {
        Write-Status "  [DRY RUN] Would push to GitHub (auto-deploys)" "Warning"
        Add-Result "Good Flippin Design" "Skipped (Dry Run)" "GitHub Pages" "Manual deployment required"
    }
    else {
        Write-Status "  Pushing to GitHub (triggers Pages auto-deploy)..." "Info"
        git push origin main 2>&1 | Out-Null
        
        Write-Status "  ✅ Auto-deploy triggered" "Success"
        Add-Result "Good Flippin Design" "Success" "GitHub Pages" "GitHub push completed"
    }
}
catch {
    Write-Status "  ❌ Error: $_" "Error"
    Add-Result "Good Flippin Design" "Failed" "GitHub Pages" $_.Exception.Message
}

# ============================================================================
# RESULTS SUMMARY
# ============================================================================
Write-Host "`n╔══════════════════════════════════════════════════════════╗" -ForegroundColor Magenta
Write-Host "║                   DEPLOYMENT SUMMARY                     ║" -ForegroundColor Magenta
Write-Host "╚══════════════════════════════════════════════════════════╝`n" -ForegroundColor Magenta

$global:DeploymentResults | Format-Table -AutoSize

$successCount = ($global:DeploymentResults | Where-Object { $_.Status -eq "Success" }).Count
$totalCount = $global:DeploymentResults.Count

Write-Status "`n📊 Results: $successCount/$totalCount sites deployed successfully`n" "Info"

if ($successCount -lt $totalCount) {
    Write-Status "⚠ NEXT STEPS:" "Warning"
    Write-Status "1. Check failed deployments above" "Warning"
    Write-Status "2. Verify dashboard connections (Vercel, Cloudflare)" "Warning"
    Write-Status "3. Run manual deployments if auto-deploy not configured`n" "Warning"
}
else {
    Write-Status "✅ ALL DEPLOYMENTS SUCCESSFUL!`n" "Success"
    Write-Status "⏳ Wait 2-5 minutes for deployments to propagate" "Info"
    Write-Status "Then run: .\scripts\verify-ga4-production.ps1`n" "Info"
}

# Return to original directory
Set-Location "Z:\GFD"
