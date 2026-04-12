<#
.SYNOPSIS
    Scans Z:\*_temp files, finds their original locations in Z:\GFD,
    and generates a restore/cleanup plan.

.DESCRIPTION
    During an emergency deploy, ~262 large files were moved to Z:\ root
    with _temp appended. This script:
    1. Scans all _temp files at Z:\
    2. Searches Z:\GFD recursively for matching original filenames
    3. Categorizes each file as DUPLICATE (original still exists) or ORPHAN (original missing)
    4. Generates restore-temp-files.ps1 (moves orphans back) and delete-temp-duplicates.ps1 (removes duplicates)

.NOTES
    Run from any directory. Review generated scripts before executing them.
#>

$ErrorActionPreference = 'SilentlyContinue'
$root = "z:\"
$searchBase = "z:\GFD"
$outDir = "z:\GFD\scripts"

Write-Host "Scanning _temp files at $root ..." -ForegroundColor Cyan
$tempFiles = Get-ChildItem $root -Filter "*_temp" -File
Write-Host "Found $($tempFiles.Count) _temp files ($([math]::Round(($tempFiles | Measure-Object Length -Sum).Sum / 1GB, 2)) GB)" -ForegroundColor Yellow

# Build a filename index of the GFD tree (files > 1MB to avoid noise)
Write-Host "Building file index of $searchBase (this may take a few minutes)..." -ForegroundColor Cyan
$index = @{}
Get-ChildItem $searchBase -Recurse -File -ErrorAction SilentlyContinue |
Where-Object { $_.Length -gt 1MB } |
ForEach-Object {
    $key = $_.Name.ToLower()
    if (-not $index.ContainsKey($key)) {
        $index[$key] = [System.Collections.Generic.List[string]]::new()
    }
    $index[$key].Add($_.FullName)
}
Write-Host "Indexed $($index.Count) unique large filenames" -ForegroundColor Green

$duplicates = [System.Collections.Generic.List[PSObject]]::new()
$orphans = [System.Collections.Generic.List[PSObject]]::new()
$unknown = [System.Collections.Generic.List[PSObject]]::new()

foreach ($f in $tempFiles) {
    $origName = $f.Name -replace '_temp$', ''
    $key = $origName.ToLower()
    $sizeMB = [math]::Round($f.Length / 1MB, 1)

    if ($index.ContainsKey($key)) {
        $matches = $index[$key]
        # Check if any match has same size (true duplicate)
        $sameSize = $matches | Where-Object { (Get-Item $_).Length -eq $f.Length }
        if ($sameSize) {
            $duplicates.Add([PSCustomObject]@{
                    TempFile = $f.FullName
                    OrigName = $origName
                    SizeMB   = $sizeMB
                    OrigPath = ($sameSize | Select-Object -First 1)
                    Status   = "DUPLICATE"
                })
        }
        else {
            # Same name but different size
            $unknown.Add([PSCustomObject]@{
                    TempFile     = $f.FullName
                    OrigName     = $origName
                    SizeMB       = $sizeMB
                    ClosestMatch = ($matches | Select-Object -First 1)
                    Status       = "SIZE_MISMATCH"
                })
        }
    }
    else {
        $orphans.Add([PSCustomObject]@{
                TempFile = $f.FullName
                OrigName = $origName
                SizeMB   = $sizeMB
                Status   = "ORPHAN"
            })
    }
}

# Report
Write-Host "`n=== RESULTS ===" -ForegroundColor Cyan
Write-Host "DUPLICATES (original exists, safe to delete): $($duplicates.Count) files, $([math]::Round(($duplicates | Measure-Object SizeMB -Sum).Sum / 1024, 2)) GB" -ForegroundColor Green
Write-Host "ORPHANS (original missing, need restore): $($orphans.Count) files, $([math]::Round(($orphans | Measure-Object SizeMB -Sum).Sum / 1024, 2)) GB" -ForegroundColor Yellow
Write-Host "SIZE MISMATCH (needs manual review): $($unknown.Count) files, $([math]::Round(($unknown | Measure-Object SizeMB -Sum).Sum / 1024, 2)) GB" -ForegroundColor Red

# Write detailed report
$reportPath = Join-Path $outDir "temp-file-report.txt"
$report = @()
$report += "=== TEMP FILE CLEANUP REPORT ==="
$report += "Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$report += "Total _temp files: $($tempFiles.Count)"
$report += ""
$report += "--- DUPLICATES (safe to delete) ---"
foreach ($d in $duplicates) {
    $report += "  $($d.OrigName) ($($d.SizeMB) MB)"
    $report += "    Original: $($d.OrigPath)"
}
$report += ""
$report += "--- ORPHANS (need restore - original location unknown) ---"
foreach ($o in $orphans) {
    $report += "  $($o.OrigName) ($($o.SizeMB) MB)"
}
$report += ""
$report += "--- SIZE MISMATCH (manual review) ---"
foreach ($u in $unknown) {
    $report += "  $($u.OrigName) ($($u.SizeMB) MB)"
    $report += "    Closest: $($u.ClosestMatch)"
}
$report | Out-File $reportPath -Encoding utf8
Write-Host "`nDetailed report: $reportPath" -ForegroundColor Cyan

# Generate delete script for duplicates
$deletePath = Join-Path $outDir "delete-temp-duplicates.ps1"
$deleteScript = @()
$deleteScript += "# Auto-generated: delete _temp files whose originals still exist"
$deleteScript += "# Review carefully before running!"
$deleteScript += "# Generated: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$deleteScript += ""
foreach ($d in $duplicates) {
    $deleteScript += "Remove-Item -LiteralPath '$($d.TempFile)' -Force  # Original: $($d.OrigPath)"
}
$deleteScript | Out-File $deletePath -Encoding utf8
Write-Host "Delete script for duplicates: $deletePath" -ForegroundColor Green

Write-Host "`nDone. Review the report and scripts before executing." -ForegroundColor Cyan
