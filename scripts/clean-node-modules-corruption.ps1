# Clean Corrupted node_modules from GFD Dev Projects
# This fixes the recursive node_modules nesting issue
# SAFE: Only deletes node_modules, preserves source code

param(
    [switch]$WhatIf = $false,
    [switch]$Verbose = $false
)

$ErrorActionPreference = "SilentlyContinue"
$rootPath = "Z:\GFD\GFD Dev Projects"

Write-Host "`n=== NODE_MODULES CORRUPTION CLEANUP ===" -ForegroundColor Cyan
Write-Host "Target: $rootPath`n" -ForegroundColor Yellow

if ($WhatIf) {
    Write-Host "⚠️  DRY RUN MODE - No files will be deleted`n" -ForegroundColor Yellow
}

# Find all node_modules directories
Write-Host "Scanning for node_modules directories..." -ForegroundColor Yellow
$nodeModulesDirs = Get-ChildItem -Path $rootPath -Directory -Filter "node_modules" -Recurse
$totalDirs = $nodeModulesDirs.Count
$totalSize = 0

Write-Host "Found $totalDirs node_modules directories`n" -ForegroundColor Green

# Calculate total size
Write-Host "Calculating total size..." -ForegroundColor Yellow
foreach ($dir in $nodeModulesDirs) {
    $size = (Get-ChildItem $dir.FullName -Recurse -File -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $totalSize += $size

    if ($Verbose) {
        $sizeMB = [math]::Round($size / 1MB, 2)
        Write-Host "  $($dir.FullName.Replace($rootPath, '...')): $sizeMB MB"
    }
}

$totalSizeGB = [math]::Round($totalSize / 1GB, 2)
Write-Host "`nTotal size to reclaim: $totalSizeGB GB`n" -ForegroundColor Green

# Confirm before deletion
if (-not $WhatIf) {
    Write-Host "⚠️  WARNING: This will delete $totalDirs directories ($totalSizeGB GB)" -ForegroundColor Red
    Write-Host "Source code will NOT be affected - only dependencies`n" -ForegroundColor Yellow

    $response = Read-Host "Proceed with deletion? (yes/no)"
    if ($response -ne "yes") {
        Write-Host "`n❌ Cancelled by user" -ForegroundColor Red
        exit 0
    }
}

# Delete node_modules directories
Write-Host "`nDeleting node_modules directories..." -ForegroundColor Yellow
$deleted = 0
$failed = 0

foreach ($dir in $nodeModulesDirs) {
    try {
        $relPath = $dir.FullName.Replace($rootPath, "...")

        if ($WhatIf) {
            Write-Host "  [DRY RUN] Would delete: $relPath" -ForegroundColor Gray
        }
        else {
            Remove-Item $dir.FullName -Recurse -Force -ErrorAction Stop
            $deleted++
            Write-Host "  ✓ Deleted: $relPath" -ForegroundColor Green
        }
    }
    catch {
        $failed++
        Write-Host "  ✗ Failed: $relPath - $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Summary
Write-Host "`n=== CLEANUP SUMMARY ===" -ForegroundColor Cyan
if ($WhatIf) {
    Write-Host "DRY RUN completed" -ForegroundColor Yellow
    Write-Host "Would delete: $totalDirs directories ($totalSizeGB GB)" -ForegroundColor Yellow
}
else {
    Write-Host "Deleted: $deleted directories" -ForegroundColor Green
    Write-Host "Failed: $failed directories" -ForegroundColor $(if ($failed -gt 0) { "Red" } else { "Green" })
    Write-Host "Space reclaimed: ~$totalSizeGB GB" -ForegroundColor Green

    Write-Host "`n📌 NEXT STEPS:" -ForegroundColor Cyan
    Write-Host "1. Navigate to each project directory"
    Write-Host "2. Run 'npm install' or 'npm ci' to reinstall clean dependencies"
    Write-Host "3. Projects will work normally with fresh node_modules"
}

Write-Host ""
