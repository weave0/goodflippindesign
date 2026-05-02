<#
.SYNOPSIS
  CultureSherpa repo archaeology — move dated/snapshot/zip artifacts to _archive/.

.DESCRIPTION
  This script does NOT delete anything. It moves matching files from the repo
  root into _archive/<YYYY-MM-DD>/ so the working tree shrinks ~70% per the
  ECOSYSTEM_GAP_ANALYSIS_2026-05.md recommendation (CultureSherpa Gap #1).

  RUN FROM: the CultureSherpa repo root (NOT this GFD workspace).
  Confirms the cwd is a CultureSherpa checkout (looks for distinctive markers).

  USE:  powershell -File culturesherpa-archaeology.ps1                  # plan only (dry-run)
        powershell -File culturesherpa-archaeology.ps1 -Apply          # actually move
        powershell -File culturesherpa-archaeology.ps1 -Apply -Verbose # noisy mode

.NOTES
  Source: weave0/goodflippindesign · scratch/cross-repo-paste-bundles/
  Date:   2026-05-01
#>

[CmdletBinding()]
param(
    [switch]$Apply,
    [string]$ArchiveRoot = "_archive"
)

$ErrorActionPreference = 'Stop'

# Sanity check — refuse to run unless we're actually in a CultureSherpa checkout.
$markerFiles = @('package.json', 'README.md')
$allMarkersPresent = $markerFiles | ForEach-Object { Test-Path $_ } | Where-Object { -not $_ }
if ($allMarkersPresent) {
    Write-Error "Run from a repo root containing $($markerFiles -join ', '). Aborting."
    exit 1
}
$readme = Get-Content README.md -Raw -ErrorAction SilentlyContinue
if (-not ($readme -match 'culturesherpa|CultureSherpa|Culture Sherpa')) {
    Write-Error "README.md does not look like CultureSherpa. Aborting (set -Force to override only if certain)."
    exit 1
}

# Patterns considered archive-eligible (based on gap analysis observations).
# All matched against root-level files only (not subfolders).
$patterns = @(
    '*_DEPLOYED*.md',
    '*_DEPLOYED*.MD',
    '*_COMPLETE*.md',
    '*_COMPLETE*.MD',
    '*_FINAL_STATUS*.md',
    '*_LAUNCH_DOD*.md',
    '*_PLAN*.md',                     # multiple competing plans → archive all but canonical (manual pick)
    'lambda_*.zip',
    '*-snapshot-*.json',
    '*_SUMMARY_*.md',
    'COMMUNITY_*.md',
    'AFGHAN_*.md',
    'PHASE_*.md',
    'SPRINT_*.md',
    'WEEK*.md'
)

# Manual safelist — never archive these even if they match.
$keep = @(
    'README.md',
    'CONTRIBUTING.md',
    'LICENSE.md',
    'SECURITY.md',
    'ROADMAP.md',
    'STATUS.md',
    'CHANGELOG.md'
)

$today = Get-Date -Format 'yyyy-MM-dd'
$dest = Join-Path $ArchiveRoot $today

$candidates = @()
foreach ($p in $patterns) {
    Get-ChildItem -File -Path . -Filter $p -ErrorAction SilentlyContinue | ForEach-Object {
        if ($keep -notcontains $_.Name -and $_.FullName -notlike "*\$ArchiveRoot\*") {
            $candidates += $_
        }
    }
}
$candidates = $candidates | Sort-Object FullName -Unique

if (-not $candidates) {
    Write-Host "Nothing to archive. Repo root is already clean." -ForegroundColor Green
    exit 0
}

Write-Host ""
Write-Host "ARCHAEOLOGY PLAN — $($candidates.Count) files would move to $dest/" -ForegroundColor Yellow
$candidates | Format-Table @{N = 'Size(KB)'; E = { [math]::Round($_.Length / 1KB, 1) } }, LastWriteTime, Name -AutoSize

if (-not $Apply) {
    Write-Host ""
    Write-Host "Dry run only. Re-run with -Apply to actually move these files." -ForegroundColor Cyan
    exit 0
}

# Apply — create archive folder, move files, write a manifest.
New-Item -ItemType Directory -Path $dest -Force | Out-Null
$manifest = @()
foreach ($f in $candidates) {
    $target = Join-Path $dest $f.Name
    Move-Item -Path $f.FullName -Destination $target
    $manifest += [pscustomobject]@{
        OriginalName = $f.Name
        ArchivedAt   = $today
        SizeBytes    = $f.Length
    }
}
$manifest | ConvertTo-Json -Depth 3 |
Set-Content -Path (Join-Path $dest 'archive-manifest.json') -Encoding UTF8

Write-Host ""
Write-Host "DONE — moved $($candidates.Count) files to $dest/" -ForegroundColor Green
Write-Host "Next: review with 'git status', then commit:" -ForegroundColor Cyan
Write-Host "  git add $ArchiveRoot && git add -u && git commit -m 'chore: archaeology — archive $($candidates.Count) dated artifacts'" -ForegroundColor Gray
