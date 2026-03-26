# Site Health Check Script
# Monitors uptime, response time, SSL status, and security headers for all production sites

param(
    [string]$Site = "all",
    [string]$ExportJson = "",
    [switch]$Verbose
)

$configPath = Join-Path $PSScriptRoot "..\config\health-targets.json"
if (-not (Test-Path $configPath)) {
    Write-Host "Health target config not found: $configPath" -ForegroundColor Red
    exit 1
}

$config = Get-Content -Raw -Path $configPath | ConvertFrom-Json
$sites = [ordered]@{}
foreach ($target in $config.targets) {
    if ($target.localScript) {
        $sites[$target.id] = @{
            "url"             = $target.url
            "name"            = $target.name
            "critical"        = [bool]$target.critical
            "cookie"          = $target.cookie
            "checkType"       = if ($target.checkType) { $target.checkType } else { 'page' }
            "expectedKeyword" = $target.expectedKeyword
        }
    }
}

function Test-SiteHealth {
    param(
        [string]$Url,
        [string]$Name,
        [string]$Cookie,
        [string]$CheckType = 'page',
        [string]$ExpectedKeyword = ''
    )

    $result = @{
        "url"             = $Url
        "name"            = $Name
        "checkType"       = $CheckType
        "timestamp"       = (Get-Date -Format "o")
        "status"          = "unknown"
        "httpCode"        = 0
        "responseTimeMs"  = 0
        "sslValid"        = $false
        "sslExpiryDays"   = 0
        "securityHeaders" = @{}
        "contentValid"    = $null
        "expectedKeyword" = $ExpectedKeyword
        "errors"          = @()
    }

    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
        if ($Cookie) {
            $uri = [System.Uri]$Url
            $parts = $Cookie -split '='
            $cookieObj = New-Object System.Net.Cookie($parts[0], ($parts[1..($parts.Length - 1)] -join '='), '/', $uri.Host)
            $session.Cookies.Add($cookieObj)
        }
        # MaximumRedirection handles 308 Permanent Redirects (Cloudflare Pages clean-URL redirects)
        $response = Invoke-WebRequest -Uri $Url -Method Get -WebSession $session -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 5 -ErrorAction Stop
        $stopwatch.Stop()

        $result.httpCode = $response.StatusCode
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
        $result.status = "up"

        # Content keyword validation
        if ($ExpectedKeyword -and $response.Content) {
            if ($response.Content.Contains($ExpectedKeyword)) {
                $result.contentValid = $true
            }
            else {
                $result.contentValid = $false
                $result.errors += "Expected keyword '$ExpectedKeyword' not found in response"
            }
        }

        # Check security headers
        $securityHeadersToCheck = @(
            "X-Frame-Options",
            "X-Content-Type-Options",
            "Strict-Transport-Security",
            "Content-Security-Policy",
            "Referrer-Policy"
        )

        foreach ($header in $securityHeadersToCheck) {
            if ($response.Headers[$header]) {
                $result.securityHeaders[$header] = "present"
            }
            else {
                $result.securityHeaders[$header] = "missing"
            }
        }

        # Check SSL certificate
        try {
            $uri = [System.Uri]$Url
            $tcpClient = New-Object System.Net.Sockets.TcpClient($uri.Host, 443)
            $sslStream = New-Object System.Net.Security.SslStream($tcpClient.GetStream(), $false, { $true })
            $sslStream.AuthenticateAsClient($uri.Host)

            $cert = $sslStream.RemoteCertificate
            if ($cert) {
                $result.sslValid = $true
                $expiryDate = [DateTime]::Parse($cert.GetExpirationDateString())
                $result.sslExpiryDays = ($expiryDate - (Get-Date)).Days
            }

            $sslStream.Close()
            $tcpClient.Close()
        }
        catch {
            $result.errors += "SSL check failed: $_"
        }

    }
    catch {
        $result.status = "down"
        $result.errors += $_.Exception.Message
    }

    return $result
}

function Format-HealthReport {
    param($results)

    Write-Host "`n===========================================================" -ForegroundColor Cyan
    Write-Host "  ECOSYSTEM HEALTH CHECK" -ForegroundColor Cyan
    Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
    Write-Host "===========================================================`n" -ForegroundColor Cyan

    $allUp = $true
    $criticalDown = $false

    foreach ($result in $results) {
        if ($result.status -eq "up") {
            Write-Host "[OK] $($result.name)" -ForegroundColor Green
            Write-Host "  URL: $($result.url)" -ForegroundColor Gray
            Write-Host "  Type: $($result.checkType)" -ForegroundColor Gray
            Write-Host "  Status: $($result.httpCode) OK" -ForegroundColor Gray
            Write-Host "  Response Time: $($result.responseTimeMs)ms" -ForegroundColor Gray

            # Content validation
            if ($null -ne $result.contentValid) {
                if ($result.contentValid) {
                    Write-Host "  Content: keyword found [OK]" -ForegroundColor Gray
                }
                else {
                    Write-Host "  Content: expected keyword MISSING [!]" -ForegroundColor Yellow
                    $allUp = $false
                }
            }

            if ($result.sslValid) {
                if ($result.sslExpiryDays -lt 30) {
                    Write-Host "  SSL: Valid (expires in $($result.sslExpiryDays) days) [!]" -ForegroundColor Yellow
                }
                else {
                    Write-Host "  SSL: Valid (expires in $($result.sslExpiryDays) days)" -ForegroundColor Gray
                }
            }
            else {
                Write-Host "  SSL: Could not verify" -ForegroundColor Yellow
            }

            # Security headers summary
            $headersPresent = ($result.securityHeaders.Values | Where-Object { $_ -eq "present" }).Count
            $headersTotal = $result.securityHeaders.Count
            if ($headersPresent -eq $headersTotal) {
                Write-Host "  Security Headers: $headersPresent/$headersTotal [OK]" -ForegroundColor Gray
            }
            else {
                Write-Host "  Security Headers: $headersPresent/$headersTotal [!]" -ForegroundColor Yellow
            }

            if ($Verbose) {
                foreach ($header in $result.securityHeaders.Keys) {
                    $status = $result.securityHeaders[$header]
                    $color = if ($status -eq "present") { "Green" } else { "Yellow" }
                    Write-Host "    - $header`: $status" -ForegroundColor $color
                }
            }

        }
        else {
            Write-Host "[FAIL] $($result.name)" -ForegroundColor Red
            Write-Host "  URL: $($result.url)" -ForegroundColor Gray
            Write-Host "  Status: DOWN" -ForegroundColor Red
            foreach ($errMsg in $result.errors) {
                Write-Host "  Error: $errMsg" -ForegroundColor Red
            }
            $allUp = $false

            # Check if critical site
            $siteKey = $sites.Keys | Where-Object { $sites[$_].url -eq $result.url }
            if ($siteKey -and $sites[$siteKey].critical) {
                $criticalDown = $true
            }
        }

        Write-Host ""
    }

    Write-Host "===========================================================" -ForegroundColor Cyan

    if ($allUp) {
        Write-Host "  ALL SYSTEMS OPERATIONAL [OK]" -ForegroundColor Green
        Write-Host "===========================================================`n" -ForegroundColor Cyan
        return 0
    }
    elseif ($criticalDown) {
        Write-Host "  CRITICAL SITES DOWN - IMMEDIATE ACTION REQUIRED" -ForegroundColor Red
        Write-Host "===========================================================`n" -ForegroundColor Cyan
        return 2
    }
    else {
        Write-Host "  SOME SITES DEGRADED - INVESTIGATION RECOMMENDED" -ForegroundColor Yellow
        Write-Host "===========================================================`n" -ForegroundColor Cyan
        return 1
    }
}

# Main execution
$results = @()

if ($Site -eq "all") {
    Write-Host "Checking all sites..." -ForegroundColor Cyan
    foreach ($key in $sites.Keys) {
        $siteInfo = $sites[$key]
        $result = Test-SiteHealth -Url $siteInfo.url -Name $siteInfo.name -Cookie $siteInfo.cookie -CheckType $siteInfo.checkType -ExpectedKeyword $siteInfo.expectedKeyword
        $results += $result
    }
}
elseif ($sites.Contains($Site)) {
    Write-Host "Checking $($sites[$Site].name)..." -ForegroundColor Cyan
    $result = Test-SiteHealth -Url $sites[$Site].url -Name $sites[$Site].name -Cookie $sites[$Site].cookie -CheckType $sites[$Site].checkType -ExpectedKeyword $sites[$Site].expectedKeyword
    $results += $result
}
else {
    Write-Host "Unknown site: $Site" -ForegroundColor Red
    Write-Host "Available sites: $($sites.Keys -join ', ')" -ForegroundColor Yellow
    exit 1
}

# Display results
$exitCode = Format-HealthReport -results $results

# Export JSON if requested
if ($ExportJson) {
    $jsonOutput = @{
        "timestamp" = (Get-Date -Format "o")
        "results"   = $results
    } | ConvertTo-Json -Depth 5

    $jsonOutput | Out-File -FilePath $ExportJson -Encoding UTF8
    Write-Host "Report exported to: $ExportJson`n" -ForegroundColor Green
}

exit $exitCode
