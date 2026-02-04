#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Syncs index.html to temp_review.html (test target)
.DESCRIPTION
    Prevents divergence between production site and test target.
    CRITICAL: Run this before tests or they'll give false results.
#>

$ErrorActionPreference = "Stop"

$indexPath = Join-Path $PSScriptRoot "..\index.html"
$reviewPath = Join-Path $PSScriptRoot "..\temp_review.html"

if (-not (Test-Path $indexPath)) {
    Write-Error "index.html not found at: $indexPath"
    exit 1
}

Write-Host "Syncing index.html → temp_review.html..." -ForegroundColor Cyan

try {
    Copy-Item -Path $indexPath -Destination $reviewPath -Force

    $indexHash = (Get-FileHash $indexPath -Algorithm MD5).Hash
    $reviewHash = (Get-FileHash $reviewPath -Algorithm MD5).Hash

    if ($indexHash -eq $reviewHash) {
        Write-Host "✓ Sync successful - files match" -ForegroundColor Green
        exit 0
    }
    else {
        Write-Error "Sync failed - hashes don't match"
        exit 1
    }
}
catch {
    Write-Error "Failed to sync: $_"
    exit 1
}
