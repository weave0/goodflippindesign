#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Automated SEO Infrastructure Deployment Script

.DESCRIPTION
    Deploys sitemap.xml, robots.txt, and enhanced schema markup across
    the entire GFD ecosystem (GFD, AI Aimate, GlobalDeets, GFV).

.PARAMETER Sites
    Array of sites to deploy. Default: all sites

.PARAMETER SkipTests
    Skip validation tests before deployment

.PARAMETER DryRun
    Show what would be deployed without actually deploying

.EXAMPLE
    .\deploy-seo-infrastructure.ps1
    Deploy to all sites with validation

.EXAMPLE
    .\deploy-seo-infrastructure.ps1 -Sites "GFD","GlobalDeets" -DryRun
    Test deployment for specific sites only

.NOTES
    Created: February 3, 2026
    Author: Brett Weaver (Good Flippin Design)
    Version: 1.0.0
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("GFD", "AIAimate", "GlobalDeets", "GFV", "CultureSherpa", "All")]
    [string[]]$Sites = @("All"),

    [Parameter(Mandatory = $false)]
    [switch]$SkipTests,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun
)

# Color output functions
function Write-Success { param($Message) Write-Host "✓ $Message" -ForegroundColor Green }
function Write-Info { param($Message) Write-Host "→ $Message" -ForegroundColor Cyan }
function Write-Warning { param($Message) Write-Host "⚠ $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "✗ $Message" -ForegroundColor Red }
function Write-Header { param($Message) Write-Host "`n═══ $Message ═══`n" -ForegroundColor Magenta }

# Configuration
$script:BaseDir = "Z:\GFD"
$script:DeploymentLog = "$BaseDir\deployment-log-$(Get-Date -Format 'yyyyMMdd-HHmmss').txt"
$script:ErrorCount = 0
$script:WarningCount = 0
$script:SuccessCount = 0

# Site configurations
$script:SiteConfigs = @{
    "GFD"           = @{
        Name         = "Good Flippin Design"
        Path         = $BaseDir
        Domain       = "https://goodflippindesign.com"
        HasSitemap   = $true
        HasRobots    = $true
        DeployMethod = "CloudflarePages"
        GitBranch    = "main"
    }
    "AIAimate"      = @{
        Name         = "AI Aimate"
        Path         = "$BaseDir\GFD Dev Projects\AI\portal"
        Domain       = "https://aiaimate.com"
        HasSitemap   = $true  # Dynamic via sitemap.ts
        HasRobots    = $true   # Dynamic via robots.ts
        DeployMethod = "Vercel"
        GitBranch    = "main"
    }
    "GlobalDeets"   = @{
        Name         = "GlobalDeets Portfolio Hub"
        Path         = "$BaseDir\GFD Dev Projects\Globaldeets"
        Domain       = "https://globaldeets.com"
        HasSitemap   = $true
        HasRobots    = $true
        DeployMethod = "Netlify"
        GitBranch    = "main"
    }
    "GFV"           = @{
        Name         = "Good Flippin Vibes"
        Path         = "$BaseDir\GFD Dev Projects\GFV\website"
        Domain       = "https://goodflippinvibes.com"
        HasSitemap   = $true
        HasRobots    = $true
        DeployMethod = "Netlify"
        GitBranch    = "main"
    }
    "CultureSherpa" = @{
        Name         = "CultureSherpa Cultural Atlas"
        Path         = "S:\CultureSherpa\website-astro"
        Domain       = "https://www.culturesherpa.org"
        HasSitemap   = $true
        HasRobots    = $true
        DeployMethod = "CloudflarePages"
        GitBranch    = "main"
    }
}

# Start deployment
function Start-Deployment {
    Write-Header "SEO Infrastructure Deployment"
    Write-Info "Starting deployment at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"

    if ($DryRun) {
        Write-Warning "DRY RUN MODE - No actual changes will be made"
    }

    # Determine which sites to deploy
    $sitesToDeploy = if ($Sites -contains "All") {
        $SiteConfigs.Keys
    }
    else {
        $Sites
    }

    Write-Info "Sites to deploy: $($sitesToDeploy -join ', ')"

    # Log header
    "SEO INFRASTRUCTURE DEPLOYMENT LOG" | Out-File $DeploymentLog
    "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File $DeploymentLog -Append
    "Sites: $($sitesToDeploy -join ', ')" | Out-File $DeploymentLog -Append
    "Dry Run: $DryRun" | Out-File $DeploymentLog -Append
    "`n" | Out-File $DeploymentLog -Append

    foreach ($site in $sitesToDeploy) {
        Deploy-Site -SiteName $site
    }

    # Summary
    Write-Header "Deployment Summary"
    Write-Success "Successful: $SuccessCount"
    if ($WarningCount -gt 0) {
        Write-Warning "Warnings: $WarningCount"
    }
    if ($ErrorCount -gt 0) {
        Write-Error "Errors: $ErrorCount"
    }

    Write-Info "Full log: $DeploymentLog"
}

# Deploy individual site
function Deploy-Site {
    param([string]$SiteName)

    $config = $SiteConfigs[$SiteName]
    Write-Header "Deploying: $($config.Name)"

    # Validate paths
    if (-not (Test-Path $config.Path)) {
        Write-Error "Site path not found: $($config.Path)"
        $script:ErrorCount++
        return
    }

    Push-Location $config.Path

    try {
        # Step 1: Validate files
        if (-not $SkipTests) {
            Write-Info "Validating SEO files..."

            if ($config.HasSitemap) {
                if ($SiteName -eq "AIAimate") {
                    # Check TypeScript files for Next.js
                    if (-not (Test-Path "app/sitemap.ts")) {
                        Write-Error "sitemap.ts not found"
                        $script:ErrorCount++
                        return
                    }
                    Write-Success "sitemap.ts found"
                }
                else {
                    # Check XML files
                    if (-not (Test-Path "sitemap.xml")) {
                        Write-Error "sitemap.xml not found"
                        $script:ErrorCount++
                        return
                    }

                    # Validate XML syntax
                    try {
                        [xml]$sitemap = Get-Content "sitemap.xml"
                        Write-Success "sitemap.xml valid"
                    }
                    catch {
                        Write-Error "sitemap.xml has invalid XML: $_"
                        $script:ErrorCount++
                        return
                    }
                }
            }

            if ($config.HasRobots) {
                if ($SiteName -eq "AIAimate") {
                    if (-not (Test-Path "app/robots.ts")) {
                        Write-Error "robots.ts not found"
                        $script:ErrorCount++
                        return
                    }
                    Write-Success "robots.ts found"
                }
                else {
                    if (-not (Test-Path "robots.txt")) {
                        Write-Error "robots.txt not found"
                        $script:ErrorCount++
                        return
                    }

                    # Validate robots.txt format
                    $robotsContent = Get-Content "robots.txt" -Raw
                    if ($robotsContent -match "User-agent:" -and $robotsContent -match "Sitemap:") {
                        Write-Success "robots.txt valid"
                    }
                    else {
                        Write-Warning "robots.txt may be malformed"
                        $script:WarningCount++
                    }
                }
            }
        }

        # Step 2: Git status check
        Write-Info "Checking git status..."
        $gitStatus = git status --porcelain

        if ($gitStatus) {
            Write-Info "Uncommitted changes detected:"
            $gitStatus | ForEach-Object { Write-Host "  $_" }

            if (-not $DryRun) {
                # Stage SEO files
                if ($SiteName -eq "AIAimate") {
                    git add app/sitemap.ts app/robots.ts
                }
                else {
                    git add sitemap.xml robots.txt -ErrorAction SilentlyContinue
                }

                # Commit
                $commitMsg = "Deploy SEO infrastructure for $($config.Name)"
                git commit -m $commitMsg
                Write-Success "Changes committed"
            }
            else {
                Write-Info "Would commit: sitemap.xml, robots.txt"
            }
        }
        else {
            Write-Success "No uncommitted changes"
        }

        # Step 3: Deploy based on method
        Write-Info "Deploying via $($config.DeployMethod)..."

        if (-not $DryRun) {
            switch ($config.DeployMethod) {
                "CloudflarePages" {
                    git push origin $config.GitBranch
                    Write-Success "Pushed to Cloudflare Pages (auto-deploy)"
                }
                "Vercel" {
                    if (Get-Command vercel -ErrorAction SilentlyContinue) {
                        npm run build
                        vercel --prod --yes
                        Write-Success "Deployed to Vercel"
                    }
                    else {
                        Write-Warning "Vercel CLI not found - pushing to git (triggers auto-deploy)"
                        git push origin $config.GitBranch
                    }
                }
                "Netlify" {
                    if (Get-Command netlify -ErrorAction SilentlyContinue) {
                        netlify deploy --prod
                        Write-Success "Deployed to Netlify"
                    }
                    else {
                        Write-Warning "Netlify CLI not found - pushing to git (triggers auto-deploy)"
                        git push origin $config.GitBranch
                    }
                }
            }
        }
        else {
            Write-Info "Would deploy via: $($config.DeployMethod)"
        }

        # Step 4: Verify deployment
        Write-Info "Verifying deployment (waiting 30s for propagation)..."
        Start-Sleep -Seconds 30

        if ($SiteName -eq "AIAimate") {
            # Next.js generates sitemap dynamically
            $sitemapUrl = "$($config.Domain)/sitemap.xml"
            $robotsUrl = "$($config.Domain)/robots.txt"
        }
        else {
            $sitemapUrl = "$($config.Domain)/sitemap.xml"
            $robotsUrl = "$($config.Domain)/robots.txt"
        }

        # Test URLs
        try {
            $sitemapResponse = Invoke-WebRequest -Uri $sitemapUrl -UseBasicParsing -TimeoutSec 10
            if ($sitemapResponse.StatusCode -eq 200) {
                Write-Success "Sitemap accessible: $sitemapUrl"
                $script:SuccessCount++
            }
        }
        catch {
            Write-Error "Sitemap not accessible: $sitemapUrl ($_)"
            $script:ErrorCount++
        }

        try {
            $robotsResponse = Invoke-WebRequest -Uri $robotsUrl -UseBasicParsing -TimeoutSec 10
            if ($robotsResponse.StatusCode -eq 200) {
                Write-Success "Robots.txt accessible: $robotsUrl"
                $script:SuccessCount++
            }
        }
        catch {
            Write-Error "Robots.txt not accessible: $robotsUrl ($_)"
            $script:ErrorCount++
        }

        # Log results
        @"
Site: $($config.Name)
Domain: $($config.Domain)
Deployment Method: $($config.DeployMethod)
Sitemap URL: $sitemapUrl
Robots URL: $robotsUrl
Status: $(if ($ErrorCount -eq 0) { "SUCCESS" } else { "FAILED" })

"@ | Out-File $DeploymentLog -Append

    }
    finally {
        Pop-Location
    }
}

# Test sitemap URLs
function Test-SitemapUrls {
    param([string]$SitemapPath)

    Write-Info "Testing URLs in sitemap..."
    [xml]$sitemap = Get-Content $SitemapPath

    $urlCount = 0
    $failedUrls = @()

    foreach ($url in $sitemap.urlset.url) {
        $urlCount++
        $loc = $url.loc

        Write-Host "  Testing: $loc" -NoNewline

        try {
            $response = Invoke-WebRequest -Uri $loc -UseBasicParsing -TimeoutSec 5 -Method Head
            if ($response.StatusCode -eq 200) {
                Write-Host " ✓" -ForegroundColor Green
            }
            else {
                Write-Host " ✗ ($($response.StatusCode))" -ForegroundColor Red
                $failedUrls += $loc
            }
        }
        catch {
            Write-Host " ✗ (Error)" -ForegroundColor Red
            $failedUrls += $loc
        }
    }

    if ($failedUrls.Count -gt 0) {
        Write-Warning "Failed URLs: $($failedUrls.Count)/$urlCount"
        $failedUrls | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        $script:WarningCount += $failedUrls.Count
    }
    else {
        Write-Success "All $urlCount URLs accessible"
    }
}

# Submit to Google Search Console (manual instructions)
function Show-SearchConsoleInstructions {
    Write-Header "Next Steps: Google Search Console"

    Write-Info @"
To complete SEO setup, submit sitemaps to Google Search Console:

1. Go to: https://search.google.com/search-console

2. For each property, submit sitemap:
   - Good Flippin Design → https://goodflippindesign.com/sitemap.xml
   - AI Aimate → https://aiaimate.com/sitemap.xml
   - GlobalDeets → https://globaldeets.com/sitemap.xml
   - Good Flippin Vibes → https://goodflippinvibes.com/sitemap.xml

3. Monitor indexing in Coverage report (24-48 hours)

4. Request indexing for priority pages using URL Inspection tool

Full guide: z:\GFD\SEO_DEPLOYMENT_GUIDE.md
"@
}

# Main execution
try {
    Start-Deployment

    if ($ErrorCount -eq 0) {
        Show-SearchConsoleInstructions
    }

    # Return exit code
    if ($ErrorCount -gt 0) {
        exit 1
    }
    else {
        exit 0
    }

}
catch {
    Write-Error "Deployment failed: $_"
    Write-Host $_.ScriptStackTrace
    exit 1
}
