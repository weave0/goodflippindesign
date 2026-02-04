#!/usr/bin/env pwsh

# Update DNS for Google Workspace across all domains
# Brett Weaver - Good Flippin Design

$ErrorActionPreference = "Stop"

$API_TOKEN = $env:CLOUDFLARE_API_TOKEN
if (-not $API_TOKEN) {
    Write-Error "CLOUDFLARE_API_TOKEN environment variable not set"
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $API_TOKEN"
    "Content-Type"  = "application/json"
}

# Get all zones
Write-Host "`n🔍 Fetching Cloudflare zones..." -ForegroundColor Cyan
$zonesResponse = Invoke-RestMethod -Uri "https://api.cloudflare.com/v4/zones?per_page=50" -Headers $headers -Method Get

if (-not $zonesResponse.success) {
    Write-Error "Failed to fetch zones: $($zonesResponse.errors | ConvertTo-Json)"
    exit 1
}

$zones = $zonesResponse.result | Where-Object { $_.name -in @("aiaimate.com", "goodflippinvibes.com", "goodflippindesign.com") }

Write-Host "Found $($zones.Count) relevant domains" -ForegroundColor Green
$zones | Format-Table name, id -AutoSize

# Google Workspace MX records
$googleMX = @(
    @{ name = "@"; content = "aspmx.l.google.com"; priority = 1 }
    @{ name = "@"; content = "alt1.aspmx.l.google.com"; priority = 5 }
    @{ name = "@"; content = "alt2.aspmx.l.google.com"; priority = 5 }
    @{ name = "@"; content = "alt3.aspmx.l.google.com"; priority = 10 }
    @{ name = "@"; content = "alt4.aspmx.l.google.com"; priority = 10 }
)

# SPF record
$spfRecord = @{
    type    = "TXT"
    name    = "@"
    content = "v=spf1 include:_spf.google.com ~all"
    ttl     = 3600
}

function Get-DNSRecords {
    param([string]$zoneId)

    $response = Invoke-RestMethod -Uri "https://api.cloudflare.com/v4/zones/$zoneId/dns_records?per_page=100" -Headers $headers -Method Get
    return $response.result
}

function Delete-DNSRecord {
    param([string]$zoneId, [string]$recordId, [string]$recordName)

    Write-Host "  ❌ Deleting: $recordName" -ForegroundColor Yellow
    $response = Invoke-RestMethod -Uri "https://api.cloudflare.com/v4/zones/$zoneId/dns_records/$recordId" -Headers $headers -Method Delete
    return $response.success
}

function Add-DNSRecord {
    param([string]$zoneId, [hashtable]$record)

    Write-Host "  ✅ Adding: $($record.type) $($record.name) -> $($record.content) (Priority: $($record.priority))" -ForegroundColor Green
    $body = $record | ConvertTo-Json
    $response = Invoke-RestMethod -Uri "https://api.cloudflare.com/v4/zones/$zoneId/dns_records" -Headers $headers -Method Post -Body $body
    return $response.success
}

# Process each zone
foreach ($zone in $zones) {
    Write-Host "`n========================================" -ForegroundColor Cyan
    Write-Host "Processing: $($zone.name)" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan

    # Get existing DNS records
    $existingRecords = Get-DNSRecords -zoneId $zone.id

    # Find existing MX records
    $existingMX = $existingRecords | Where-Object { $_.type -eq "MX" }

    if ($existingMX) {
        Write-Host "`nExisting MX records:" -ForegroundColor Yellow
        $existingMX | Format-Table name, content, priority -AutoSize

        # Delete Cloudflare Email Routing MX records
        $cloudflareMX = $existingMX | Where-Object { $_.content -like "*.mx.cloudflare.net" }
        if ($cloudflareMX) {
            Write-Host "`n🔧 Removing Cloudflare Email Routing MX records..." -ForegroundColor Yellow
            foreach ($mx in $cloudflareMX) {
                Delete-DNSRecord -zoneId $zone.id -recordId $mx.id -recordName "$($mx.content) (Priority: $($mx.priority))"
            }
        }

        # Check if Google MX already exist
        $googleMXExists = $existingMX | Where-Object { $_.content -like "*.google.com" }
        if ($googleMXExists) {
            Write-Host "`n✅ Google MX records already configured" -ForegroundColor Green
            $googleMXExists | Format-Table name, content, priority -AutoSize
            continue
        }
    }

    # Add Google MX records
    Write-Host "`n🔧 Adding Google Workspace MX records..." -ForegroundColor Cyan
    foreach ($mx in $googleMX) {
        $record = @{
            type     = "MX"
            name     = $mx.name
            content  = $mx.content
            priority = $mx.priority
            ttl      = 3600
            proxied  = $false
        }
        Add-DNSRecord -zoneId $zone.id -record $record
        Start-Sleep -Milliseconds 500
    }

    # Check SPF record
    $existingSPF = $existingRecords | Where-Object { $_.type -eq "TXT" -and $_.content -like "*v=spf1*" }
    if (-not $existingSPF) {
        Write-Host "`n🔧 Adding SPF record..." -ForegroundColor Cyan
        Add-DNSRecord -zoneId $zone.id -record $spfRecord
    }
    else {
        Write-Host "`n✅ SPF record already exists: $($existingSPF.content)" -ForegroundColor Green
    }

    Write-Host "`n✅ $($zone.name) configuration complete!" -ForegroundColor Green
}

Write-Host "`n========================================" -ForegroundColor Green
Write-Host "DNS Updates Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "1. Wait 10-15 minutes for DNS propagation" -ForegroundColor White
Write-Host "2. Go to Google Admin Console → Domains" -ForegroundColor White
Write-Host "3. Add aiaimate.com domain" -ForegroundColor White
Write-Host "4. Verify each domain" -ForegroundColor White
Write-Host "5. Create user accounts (e.g., getsome@aiaimate.com)" -ForegroundColor White
Write-Host ""
