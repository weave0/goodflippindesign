#!/usr/bin/env pwsh
<#
.SYNOPSIS
    SEO Infrastructure Validation Test Suite

.DESCRIPTION
    Comprehensive testing of sitemap.xml, robots.txt, schema markup,
    cross-linking, and Google Analytics integration across all GFD ecosystem sites.

.PARAMETER Site
    Specific site to test. Default: all sites

.PARAMETER TestType
    Type of test to run. Default: all tests

.PARAMETER Verbose
    Show detailed test output

.EXAMPLE
    .\test-seo-infrastructure.ps1
    Run all tests on all sites

.EXAMPLE
    .\test-seo-infrastructure.ps1 -Site GFD -TestType Sitemap -Verbose
    Test only sitemap for GFD with detailed output

.NOTES
    Created: February 3, 2026
    Author: Brett Weaver (Good Flippin Design)
    Version: 1.0.0
#>

param(
    [Parameter(Mandatory = $false)]
    [ValidateSet("GFD", "AIAimate", "GlobalDeets", "GFV", "CultureSherpa", "All")]
    [string]$Site = "All",

    [Parameter(Mandatory = $false)]
    [ValidateSet("Sitemap", "Robots", "Schema", "CrossLinks", "Analytics", "Performance", "All")]
    [string]$TestType = "All",

    [Parameter(Mandatory = $false)]
    [switch]$VerboseOutputOutput
)

# Color output
function Write-TestPass { param($Message) Write-Host "✓ PASS: $Message" -ForegroundColor Green }
function Write-TestFail { param($Message) Write-Host "✗ FAIL: $Message" -ForegroundColor Red }
function Write-TestWarn { param($Message) Write-Host "⚠ WARN: $Message" -ForegroundColor Yellow }
function Write-TestInfo { param($Message) Write-Host "→ $Message" -ForegroundColor Cyan }
function Write-TestHeader { param($Message) Write-Host "`n═══ $Message ═══`n" -ForegroundColor Magenta }

# Test results
$script:PassCount = 0
$script:FailCount = 0
$script:WarnCount = 0
$script:TestResults = @()

# Site configurations
$script:Sites = @{
    "GFD"           = @{
        Domain       = "https://goodflippindesign.com"
        ExpectedUrls = 20
        HasSchema    = $true
        SchemaTypes  = @("ProfessionalService", "WebSite", "Person")
        GA4ID        = "G-QPPVJM1B60"
    }
    "AIAimate"      = @{
        Domain       = "https://aiaimate.com"
        ExpectedUrls = 35
        HasSchema    = $true
        SchemaTypes  = @("EducationalOrganization", "Course", "WebSite")
        GA4ID        = "G-QPPVJM1B60"
    }
    "GlobalDeets"   = @{
        Domain       = "https://globaldeets.com"
        ExpectedUrls = 15
        HasSchema    = $true
        SchemaTypes  = @("CreativeWork", "Person")
        GA4ID        = "G-QPPVJM1B60"
    }
    "GFV"           = @{
        Domain       = "https://goodflippinvibes.com"
        ExpectedUrls = 25
        HasSchema    = $true
        SchemaTypes  = @("Organization", "WebSite")
        GA4ID        = "G-QPPVJM1B60"
    }
    "CultureSherpa" = @{
        Domain       = "https://www.culturesherpa.org"
        ExpectedUrls = 420
        HasSchema    = $true
        SchemaTypes  = @("WebApplication", "Dataset", "Organization")
        GA4ID        = $null  # Add GA4 ID if/when implemented
    }
}

# Test sitemap
function Test-Sitemap {
    param($SiteConfig, $SiteName)

    Write-TestHeader "Testing Sitemap: $SiteName"

    $sitemapUrl = "$($SiteConfig.Domain)/sitemap.xml"
    Write-TestInfo "URL: $sitemapUrl"

    try {
        # Fetch sitemap
        $response = Invoke-WebRequest -Uri $sitemapUrl -UseBasicParsing -TimeoutSec 10

        # Check status code
        if ($response.StatusCode -eq 200) {
            Write-TestPass "Sitemap accessible (HTTP 200)"
            $script:PassCount++
        }
        else {
            Write-TestFail "Unexpected status code: $($response.StatusCode)"
            $script:FailCount++
            return
        }

        # Check content type
        $contentType = $response.Headers['Content-Type']
        if ($contentType -match "xml" -or $contentType -match "text/plain") {
            Write-TestPass "Correct Content-Type: $contentType"
            $script:PassCount++
        }
        else {
            Write-TestWarn "Unexpected Content-Type: $contentType (expected text/xml)"
            $script:WarnCount++
        }

        # Parse XML
        try {
            [xml]$sitemap = $response.Content
            Write-TestPass "Valid XML structure"
            $script:PassCount++
        }
        catch {
            Write-TestFail "Invalid XML: $_"
            $script:FailCount++
            return
        }

        # Check URLs
        $urlCount = $sitemap.urlset.url.Count
        Write-TestInfo "URLs found: $urlCount (expected ~$($SiteConfig.ExpectedUrls))"

        if ($urlCount -ge ($SiteConfig.ExpectedUrls * 0.8)) {
            Write-TestPass "URL count within expected range"
            $script:PassCount++
        }
        else {
            Write-TestWarn "URL count lower than expected ($urlCount < $($SiteConfig.ExpectedUrls))"
            $script:WarnCount++
        }

        # Check required elements
        $hasLoc = $sitemap.urlset.url | Where-Object { $_.loc }
        $hasLastmod = $sitemap.urlset.url | Where-Object { $_.lastmod }
        $hasPriority = $sitemap.urlset.url | Where-Object { $_.priority }

        if ($hasLoc.Count -eq $urlCount) {
            Write-TestPass "All URLs have <loc> element"
            $script:PassCount++
        }
        else {
            Write-TestFail "$($urlCount - $hasLoc.Count) URLs missing <loc>"
            $script:FailCount++
        }

        if ($hasPriority.Count -gt 0) {
            Write-TestPass "Priority values set ($($hasPriority.Count) URLs)"
            $script:PassCount++
        }
        else {
            Write-TestWarn "No priority values set (optional but recommended)"
            $script:WarnCount++
        }

        # Test URL accessibility (sample)
        Write-TestInfo "Testing URL accessibility (sampling 5 URLs)..."
        $sampleUrls = $sitemap.urlset.url | Select-Object -First 5
        $failedUrls = @()

        foreach ($url in $sampleUrls) {
            try {
                $urlResponse = Invoke-WebRequest -Uri $url.loc -UseBasicParsing -TimeoutSec 5 -Method Head
                if ($VerboseOutput) {
                    Write-Host "  ✓ $($url.loc)" -ForegroundColor Green
                }
            }
            catch {
                $failedUrls += $url.loc
                if ($VerboseOutput) {
                    Write-Host "  ✗ $($url.loc) - $_" -ForegroundColor Red
                }
            }
        }

        if ($failedUrls.Count -eq 0) {
            Write-TestPass "All sampled URLs accessible"
            $script:PassCount++
        }
        else {
            Write-TestFail "$($failedUrls.Count)/5 sampled URLs failed"
            $script:FailCount++
        }

    }
    catch {
        Write-TestFail "Could not fetch sitemap: $_"
        $script:FailCount++
    }
}

# Test robots.txt
function Test-Robots {
    param($SiteConfig, $SiteName)

    Write-TestHeader "Testing robots.txt: $SiteName"

    $robotsUrl = "$($SiteConfig.Domain)/robots.txt"
    Write-TestInfo "URL: $robotsUrl"

    try {
        $response = Invoke-WebRequest -Uri $robotsUrl -UseBasicParsing -TimeoutSec 10

        if ($response.StatusCode -eq 200) {
            Write-TestPass "robots.txt accessible (HTTP 200)"
            $script:PassCount++
        }
        else {
            Write-TestFail "Unexpected status code: $($response.StatusCode)"
            $script:FailCount++
            return
        }

        $content = $response.Content

        # Check required directives
        if ($content -match "User-agent:") {
            Write-TestPass "Has User-agent directive"
            $script:PassCount++
        }
        else {
            Write-TestFail "Missing User-agent directive"
            $script:FailCount++
        }

        if ($content -match "Sitemap:\s*https?://") {
            Write-TestPass "Has Sitemap directive"
            $script:PassCount++

            # Extract sitemap URL
            if ($content -match "Sitemap:\s*(https?://[^\s]+)") {
                $sitemapUrl = $matches[1]
                Write-TestInfo "Sitemap URL: $sitemapUrl"

                # Verify it matches expected
                if ($sitemapUrl -eq "$($SiteConfig.Domain)/sitemap.xml") {
                    Write-TestPass "Sitemap URL correct"
                    $script:PassCount++
                }
                else {
                    Write-TestWarn "Sitemap URL differs from expected: $sitemapUrl"
                    $script:WarnCount++
                }
            }
        }
        else {
            Write-TestFail "Missing Sitemap directive"
            $script:FailCount++
        }

        # Check for common patterns
        if ($content -match "Disallow:") {
            Write-TestInfo "Has Disallow directives (blocking some paths)"

            if ($VerboseOutput) {
                $disallows = $content -split "`n" | Where-Object { $_ -match "Disallow:" }
                $disallows | ForEach-Object { Write-Host "  $_" }
            }
        }

        if ($content -match "Allow:") {
            Write-TestInfo "Has Allow directives (explicitly allowing paths)"
        }

        # Check for crawl-delay (optional)
        if ($content -match "Crawl-delay:\s*(\d+)") {
            $delay = $matches[1]
            Write-TestInfo "Crawl-delay set to: $delay seconds"

            if ($delay -le 2) {
                Write-TestPass "Crawl-delay reasonable (<= 2s)"
                $script:PassCount++
            }
            else {
                Write-TestWarn "Crawl-delay may be too high: $delay seconds"
                $script:WarnCount++
            }
        }

    }
    catch {
        Write-TestFail "Could not fetch robots.txt: $_"
        $script:FailCount++
    }
}

# Test schema markup
function Test-Schema {
    param($SiteConfig, $SiteName)

    Write-TestHeader "Testing Schema Markup: $SiteName"

    try {
        $response = Invoke-WebRequest -Uri $SiteConfig.Domain -UseBasicParsing -TimeoutSec 10
        $html = $response.Content

        # Find JSON-LD scripts
        $jsonLdPattern = '<script[^>]*type="application/ld\+json"[^>]*>(.*?)</script>'
        $matches = [regex]::Matches($html, $jsonLdPattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

        if ($matches.Count -gt 0) {
            Write-TestPass "Found $($matches.Count) JSON-LD schema blocks"
            $script:PassCount++

            # Parse each schema
            $foundTypes = @()

            foreach ($match in $matches) {
                $jsonContent = $match.Groups[1].Value

                try {
                    $schema = $jsonContent | ConvertFrom-Json
                    $type = $schema.'@type'
                    $foundTypes += $type

                    if ($VerboseOutput) {
                        Write-Host "  Schema type: $type" -ForegroundColor Cyan
                    }

                    # Validate structure
                    if ($schema.'@context' -eq "https://schema.org" -or $schema.'@context' -eq "http://schema.org") {
                        if ($VerboseOutput) {
                            Write-Host "    ✓ Valid @context" -ForegroundColor Green
                        }
                    }
                    else {
                        Write-TestWarn "Invalid @context in $type schema"
                        $script:WarnCount++
                    }

                }
                catch {
                    Write-TestWarn "Could not parse JSON-LD: $_"
                    $script:WarnCount++
                }
            }

            # Check for expected types
            foreach ($expectedType in $SiteConfig.SchemaTypes) {
                if ($foundTypes -contains $expectedType) {
                    Write-TestPass "Has expected schema type: $expectedType"
                    $script:PassCount++
                }
                else {
                    Write-TestWarn "Missing expected schema type: $expectedType"
                    $script:WarnCount++
                }
            }

        }
        else {
            Write-TestFail "No JSON-LD schema found"
            $script:FailCount++
        }

    }
    catch {
        Write-TestFail "Could not test schema: $_"
        $script:FailCount++
    }
}

# Test cross-linking
function Test-CrossLinks {
    param($SiteConfig, $SiteName)

    Write-TestHeader "Testing Ecosystem Cross-Links: $SiteName"

    try {
        $response = Invoke-WebRequest -Uri $SiteConfig.Domain -UseBasicParsing -TimeoutSec 10
        $html = $response.Content

        # Expected ecosystem sites
        $expectedLinks = @(
            "goodflippindesign.com",
            "aiaimate.com",
            "culturesherpa.org",
            "globaldeets.com",
            "goodflippinvibes.com"
        )

        $foundLinks = @()

        foreach ($link in $expectedLinks) {
            if ($html -match "https?://(www\.)?$link") {
                $foundLinks += $link

                # Check for rel="noopener"
                if ($html -match "href=`"https?://(www\.)?$link`"[^>]*rel=`"[^`"]*noopener") {
                    if ($VerboseOutput) {
                        Write-Host "  ✓ $link (has rel=noopener)" -ForegroundColor Green
                    }
                }
                else {
                    Write-TestWarn "Link to $link missing rel=noopener"
                    $script:WarnCount++
                }
            }
        }

        $linkCount = $foundLinks.Count
        Write-TestInfo "Ecosystem links found: $linkCount/5"

        if ($linkCount -ge 3) {
            Write-TestPass "Has cross-links to other ecosystem sites"
            $script:PassCount++
        }
        else {
            Write-TestFail "Insufficient cross-linking ($linkCount < 3)"
            $script:FailCount++
        }

        # Check for descriptive anchor text (not just URLs)
        $descriptivePattern = '(?:AI Aimate|CultureSherpa|Good Flippin|GlobalDeets)'
        if ($html -match $descriptivePattern) {
            Write-TestPass "Uses descriptive anchor text for links"
            $script:PassCount++
        }
        else {
            Write-TestWarn "May be using non-descriptive link text"
            $script:WarnCount++
        }

    }
    catch {
        Write-TestFail "Could not test cross-links: $_"
        $script:FailCount++
    }
}

# Test Google Analytics
function Test-Analytics {
    param($SiteConfig, $SiteName)

    Write-TestHeader "Testing Google Analytics: $SiteName"

    try {
        $response = Invoke-WebRequest -Uri $SiteConfig.Domain -UseBasicParsing -TimeoutSec 10
        $html = $response.Content

        # Check for GA4 script
        if ($html -match "googletagmanager\.com/gtag/js\?id=$($SiteConfig.GA4ID)") {
            Write-TestPass "GA4 tracking script present"
            $script:PassCount++
        }
        else {
            Write-TestFail "GA4 tracking script not found"
            $script:FailCount++
            return
        }

        # Check for gtag config
        if ($html -match "gtag\('config',\s*'$($SiteConfig.GA4ID)'") {
            Write-TestPass "GA4 config call present"
            $script:PassCount++
        }
        else {
            Write-TestFail "GA4 config call not found"
            $script:FailCount++
        }

        # Check for cross-domain tracking
        if ($html -match "linker.*domains") {
            Write-TestPass "Cross-domain tracking configured"
            $script:PassCount++
        }
        else {
            Write-TestWarn "Cross-domain tracking may not be configured"
            $script:WarnCount++
        }

    }
    catch {
        Write-TestFail "Could not test analytics: $_"
        $script:FailCount++
    }
}

# Test performance basics
function Test-Performance {
    param($SiteConfig, $SiteName)

    Write-TestHeader "Testing Performance: $SiteName"

    try {
        $sw = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri $SiteConfig.Domain -UseBasicParsing -TimeoutSec 30
        $sw.Stop()

        $loadTime = $sw.ElapsedMilliseconds
        Write-TestInfo "Page load time: $loadTime ms"

        if ($loadTime -lt 1000) {
            Write-TestPass "Excellent load time (< 1s)"
            $script:PassCount++
        }
        elseif ($loadTime -lt 3000) {
            Write-TestPass "Good load time (< 3s)"
            $script:PassCount++
        }
        else {
            Write-TestWarn "Slow load time ($loadTime ms)"
            $script:WarnCount++
        }

        # Check compression
        $encoding = $response.Headers['Content-Encoding']
        if ($encoding -match "gzip|br") {
            Write-TestPass "Response compressed: $encoding"
            $script:PassCount++
        }
        else {
            Write-TestWarn "Response not compressed"
            $script:WarnCount++
        }

        # Check caching headers
        $cacheControl = $response.Headers['Cache-Control']
        if ($cacheControl) {
            Write-TestInfo "Cache-Control: $cacheControl"
            $script:PassCount++
        }
        else {
            Write-TestWarn "No Cache-Control header"
            $script:WarnCount++
        }

    }
    catch {
        Write-TestFail "Could not test performance: $_"
        $script:FailCount++
    }
}

# Run all tests
function Invoke-AllTests {
    $sitesToTest = if ($Site -eq "All") { $Sites.Keys } else { @($Site) }

    foreach ($siteName in $sitesToTest) {
        $siteConfig = $Sites[$siteName]

        if ($TestType -eq "All" -or $TestType -eq "Sitemap") {
            Test-Sitemap -SiteConfig $siteConfig -SiteName $siteName
        }

        if ($TestType -eq "All" -or $TestType -eq "Robots") {
            Test-Robots -SiteConfig $siteConfig -SiteName $siteName
        }

        if ($TestType -eq "All" -or $TestType -eq "Schema") {
            Test-Schema -SiteConfig $siteConfig -SiteName $siteName
        }

        if ($TestType -eq "All" -or $TestType -eq "CrossLinks") {
            Test-CrossLinks -SiteConfig $siteConfig -SiteName $siteName
        }

        if ($TestType -eq "All" -or $TestType -eq "Analytics") {
            Test-Analytics -SiteConfig $siteConfig -SiteName $siteName
        }

        if ($TestType -eq "All" -or $TestType -eq "Performance") {
            Test-Performance -SiteConfig $siteConfig -SiteName $siteName
        }
    }
}

# Main execution
Write-TestHeader "SEO Infrastructure Test Suite"
Write-TestInfo "Site: $Site | Test Type: $TestType | Verbose: $VerboseOutputOutput"

Invoke-AllTests

# Summary
Write-TestHeader "Test Summary"
Write-Host "Total Tests: $($PassCount + $FailCount + $WarnCount)"
Write-Host "✓ Passed: $PassCount" -ForegroundColor Green
if ($WarnCount -gt 0) {
    Write-Host "⚠ Warnings: $WarnCount" -ForegroundColor Yellow
}
if ($FailCount -gt 0) {
    Write-Host "✗ Failed: $FailCount" -ForegroundColor Red
}

# Exit code
if ($FailCount -gt 0) {
    exit 1
}
else {
    exit 0
}

