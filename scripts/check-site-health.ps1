# Site Health Check Script
# Monitors uptime, response time, SSL status, and security headers for all production sites

param(
    [string]$Site = "all",
    [string]$ExportJson = "",
    [switch]$Verbose
)

$sites = @{
    "goodflippindesign" = @{
        "url"      = "https://goodflippindesign.com"
        "name"     = "Good Flippin Design"
        "critical" = $true
    }
    "aiaimate"          = @{
        "url"      = "https://aiaimate.com"
        "name"     = "AI Aimate"
        "critical" = $true
    }
    "globaldeets"       = @{
        "url"      = "https://globaldeets.com"
        "name"     = "globaldeets Main"
        "critical" = $false
    }
    "eliassen"          = @{
        "url"      = "https://eliassen.globaldeets.com"
        "name"     = "Eliassen globaldeets"
        "critical" = $false
    }
}

function Test-SiteHealth {
    param(
        [string]$Url,
        [string]$Name
    )

    $result = @{
        "url"             = $Url
        "name"            = $Name
        "timestamp"       = (Get-Date -Format "o")
        "status"          = "unknown"
        "httpCode"        = 0
        "responseTimeMs"  = 0
        "sslValid"        = $false
        "sslExpiryDays"   = 0
        "securityHeaders" = @{}
        "errors"          = @()
    }

    try {
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        $response = Invoke-WebRequest -Uri $Url -Method Head -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        $stopwatch.Stop()

        $result.httpCode = $response.StatusCode
        $result.responseTimeMs = $stopwatch.ElapsedMilliseconds
        $result.status = "up"

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

    Write-Host "`n═══════════════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  ECOSYSTEM HEALTH CHECK" -ForegroundColor Cyan
    Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan

    $allUp = $true
    $criticalDown = $false

    foreach ($result in $results) {
        if ($result.status -eq "up") {
            Write-Host "✓ $($result.name)" -ForegroundColor Green
            Write-Host "  URL: $($result.url)" -ForegroundColor Gray
            Write-Host "  Status: $($result.httpCode) OK" -ForegroundColor Gray
            Write-Host "  Response Time: $($result.responseTimeMs)ms" -ForegroundColor Gray

            if ($result.sslValid) {
                if ($result.sslExpiryDays -lt 30) {
                    Write-Host "  SSL: Valid (expires in $($result.sslExpiryDays) days) ⚠️" -ForegroundColor Yellow
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
                Write-Host "  Security Headers: $headersPresent/$headersTotal ✓" -ForegroundColor Gray
            }
            else {
                Write-Host "  Security Headers: $headersPresent/$headersTotal ⚠️" -ForegroundColor Yellow
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
            Write-Host "✗ $($result.name)" -ForegroundColor Red
            Write-Host "  URL: $($result.url)" -ForegroundColor Gray
            Write-Host "  Status: DOWN" -ForegroundColor Red
            foreach ($error in $result.errors) {
                Write-Host "  Error: $error" -ForegroundColor Red
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

    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Cyan

    if ($allUp) {
        Write-Host "  ALL SYSTEMS OPERATIONAL ✓" -ForegroundColor Green
        Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
        return 0
    }
    elseif ($criticalDown) {
        Write-Host "  CRITICAL SITES DOWN - IMMEDIATE ACTION REQUIRED" -ForegroundColor Red
        Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
        return 2
    }
    else {
        Write-Host "  SOME SITES DEGRADED - INVESTIGATION RECOMMENDED" -ForegroundColor Yellow
        Write-Host "═══════════════════════════════════════════════════════════`n" -ForegroundColor Cyan
        return 1
    }
}

# Main execution
$results = @()

if ($Site -eq "all") {
    Write-Host "Checking all sites..." -ForegroundColor Cyan
    foreach ($key in $sites.Keys) {
        $siteInfo = $sites[$key]
        $result = Test-SiteHealth -Url $siteInfo.url -Name $siteInfo.name
        $results += $result
    }
}
elseif ($sites.ContainsKey($Site)) {
    Write-Host "Checking $($sites[$Site].name)..." -ForegroundColor Cyan
    $result = Test-SiteHealth -Url $sites[$Site].url -Name $sites[$Site].name
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
