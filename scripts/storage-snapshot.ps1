#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Storage governance snapshot for WEAVERASUS — generates a JSON report,
    compares to a saved baseline, and flags significant growth.

.DESCRIPTION
    Scans all logical drives and known hot-spot directories, writes a JSON
    snapshot to the GFD root, and optionally saves it as the new baseline.
    Run manually or via Task Scheduler for recurring governance.

.PARAMETER Silent
    Suppress console output (for scheduled / background runs).

.PARAMETER SetBaseline
    Save the current snapshot as the comparison baseline.

.PARAMETER OutputJson
    Path to write the snapshot JSON. Defaults to GFD root.

.PARAMETER BaselineJson
    Path to the baseline JSON to compare against.

.EXAMPLE
    # Normal run — compare to baseline, flag growth
    .\scripts\storage-snapshot.ps1

.EXAMPLE
    # Save current state as the new baseline
    .\scripts\storage-snapshot.ps1 -SetBaseline

.EXAMPLE
    # Silent mode for Task Scheduler
    .\scripts\storage-snapshot.ps1 -Silent
#>
param(
  [switch]$Silent,
  [switch]$SetBaseline,
  [string]$OutputJson = "$PSScriptRoot\..\storage-snapshot.json",
  [string]$BaselineJson = "$PSScriptRoot\..\storage-baseline.json"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$timestamp = (Get-Date).ToString('o')
$machine = $env:COMPUTERNAME
$user = $env:USERNAME

# ─── helpers ───────────────────────────────────────────────────────────────────

function GB([double]$bytes) { [math]::Round($bytes / 1GB, 2) }

function DirSizeGB([string]$path) {
  if (-not (Test-Path $path)) { return $null }
  try {
    $bytes = (Get-ChildItem $path -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { -not $_.PSIsContainer } |
      Measure-Object -Property Length -Sum).Sum
    return GB $bytes
  }
  catch {
    return $null
  }
}

function DirSizeGBFast([string]$path) {
  # Uses robocopy /L /NFL /NDL for fast size enumeration.
  # NOTE: /NJH and /NJS must NOT be set — they suppress the Bytes summary line.
  if (-not (Test-Path $path)) { return $null }
  try {
    $result = robocopy $path NULL /L /S /NFL /NDL /NC /BYTES 2>&1
    $line = $result | Where-Object { $_ -match 'Bytes\s*:\s*[\d,]+' } | Select-Object -Last 1
    if ($line -match 'Bytes\s*:\s*([\d,]+)') {
      $bytes = [double]($Matches[1] -replace ',', '')
      return GB $bytes
    }
    return $null
  }
  catch {
    return $null
  }
}

function Log([string]$msg) {
  if (-not $Silent) { Write-Host $msg }
}

# ─── 1. DRIVE OVERVIEW ──────────────────────────────────────────────────────

Log "`n[1] Scanning drives..."

$drives = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3 OR DriveType=2 OR DriveType=4" |
Where-Object { $_.FreeSpace -ne $null } |
Sort-Object DeviceID |
ForEach-Object {
  $total = GB $_.Size
  $free = GB $_.FreeSpace
  $used = [math]::Round($total - $free, 2)
  $pctUsed = if ($total -gt 0) { [math]::Round(($used / $total) * 100, 1) } else { 0 }
  [pscustomobject]@{
    drive   = $_.DeviceID
    label   = $_.VolumeName
    usedGB  = $used
    freeGB  = $free
    totalGB = $total
    pctUsed = $pctUsed
  }
}

foreach ($d in $drives) {
  Log ("  {0,-4} {1,-20} {2,7} GB used  {3,7} GB free  ({4}%)" -f
    $d.drive, $d.label, $d.usedGB, $d.freeGB, $d.pctUsed)
}

# ─── 2. HOT-SPOT DIRECTORIES ────────────────────────────────────────────────

Log "`n[2] Scanning hot-spot directories..."

$hotspots = @(
  # --- C: system & user ---
  @{ label = 'C:\Dev (VHDXs)'; path = 'C:\Dev' },
  @{ label = 'C:\Program Files'; path = 'C:\Program Files' },
  @{ label = 'C:\Program Files (x86)'; path = 'C:\Program Files (x86)' },
  @{ label = 'C:\ProgramData'; path = 'C:\ProgramData' },
  @{ label = 'C:\Windows'; path = 'C:\Windows' },
  @{ label = 'Users\brett home'; path = "C:\Users\$user" },
  @{ label = 'Users\brett AppData'; path = "C:\Users\$user\AppData" },
  @{ label = 'AppData\Roaming\Code'; path = "C:\Users\$user\AppData\Roaming\Code" },
  @{ label = 'AppData\Local\Packages'; path = "C:\Users\$user\AppData\Local\Packages" },
  @{ label = 'AppData\Local\Docker'; path = "C:\Users\$user\AppData\Local\Docker" },
  @{ label = 'AppData\Local\pip'; path = "C:\Users\$user\AppData\Local\pip" },
  @{ label = 'AppData\Roaming\Python'; path = "C:\Users\$user\AppData\Roaming\Python" },
  @{ label = 'AppData\Local\ms-playwright'; path = "C:\Users\$user\AppData\Local\ms-playwright" },
  @{ label = '.cache\thyown'; path = "C:\Users\$user\.cache\thyown" },
  @{ label = '.cache\whisper'; path = "C:\Users\$user\.cache\whisper" },
  @{ label = '.vscode\extensions'; path = "C:\Users\$user\.vscode\extensions" },
  @{ label = 'OneDrive'; path = "C:\Users\$user\OneDrive" },
  @{ label = 'Downloads'; path = "C:\Users\$user\Downloads" },
  @{ label = 'Pictures'; path = "C:\Users\$user\Pictures" },
  @{ label = 'CrossDevice'; path = "C:\Users\$user\CrossDevice" },
  # --- npm / package caches ---
  @{ label = 'C:\npm-cache'; path = 'C:\npm-cache' },
  @{ label = 'npm global (AppData)'; path = "C:\Users\$user\AppData\Roaming\npm-cache" },
  # --- VHDX locations ---
  @{ label = 'C:\Dev\Weave0 (WeaveO.vhdx)'; path = 'C:\Dev\Weave0' },
  @{ label = 'C:\Dev\CultureSherpa.vhdx'; path = 'C:\Dev\CultureSherpa.vhdx' },
  @{ label = 'D:\Dev\Weave0 (O: vhdx)'; path = 'D:\Dev\Weave0' },
  # --- Media / E: drive sample ---
  @{ label = 'E: top-level'; path = 'E:\' },
  # --- Z: workspace node_modules ---
  @{ label = 'Z:\GFD node_modules'; path = 'Z:\GFD\node_modules' },
  @{ label = 'Z: GFD workspace'; path = 'Z:\GFD' }
)

$dirResults = foreach ($h in $hotspots) {
  $sizeGB = DirSizeGBFast $h.path
  if ($null -ne $sizeGB) {
    Log ("  {0,-42} {1,7} GB" -f $h.label, $sizeGB)
  }
  [pscustomobject]@{
    label  = $h.label
    path   = $h.path
    sizeGB = $sizeGB
  }
}

# ─── 3. node_modules inventory on Z: ────────────────────────────────────────

Log "`n[3] Finding node_modules on Z:..."

$nodeModules = @()
try {
  $nmPaths = Get-ChildItem 'Z:\' -Filter 'node_modules' -Recurse -Depth 5 -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -notmatch '\\node_modules\\node_modules' }
  foreach ($nm in $nmPaths) {
    $sz = DirSizeGBFast $nm.FullName
    $nodeModules += [pscustomobject]@{
      path   = $nm.FullName
      sizeGB = $sz
    }
    Log ("  {0,-60} {1,6} GB" -f $nm.FullName, $sz)
  }
}
catch {
  Log "  [warn] node_modules scan failed: $_"
}

# ─── 4. LARGEST FILES on C: (top 20, skip system) ────────────────────────────

Log "`n[4] Finding top 20 largest files on C: (non-system)..."

$skipRoots = @('C:\Windows', 'C:\$Recycle.Bin', 'C:\System Volume Information')
$largestFiles = @()
try {
  $largestFiles = Get-ChildItem 'C:\' -Recurse -Force -File -ErrorAction SilentlyContinue |
  Where-Object {
    $fp = $_.FullName
    -not ($skipRoots | Where-Object { $fp.StartsWith($_) })
  } |
  Sort-Object Length -Descending |
  Select-Object -First 20 |
  ForEach-Object {
    [pscustomobject]@{
      path   = $_.FullName
      sizeGB = GB $_.Length
    }
  }
  $largestFiles | ForEach-Object {
    Log ("  {0,-70} {1,6} GB" -f $_.path, $_.sizeGB)
  }
}
catch {
  Log "  [warn] large-file scan incomplete: $_"
}

# ─── 5. ASSEMBLE SNAPSHOT ───────────────────────────────────────────────────

$snapshot = [ordered]@{
  meta         = [ordered]@{
    timestamp = $timestamp
    machine   = $machine
    user      = $user
    version   = '2.0'
  }
  drives       = $drives
  hotspots     = $dirResults
  nodeModules  = $nodeModules
  largestFiles = $largestFiles
  actionItems  = @(
    [ordered]@{ id = 'move-weaveo-vhdx'; label = 'Move WeaveO.vhdx (Z:) → D:\Dev'; potentialGB = 172; status = 'pending'; notes = 'Needs VS Code closed + vhd remount' }
    [ordered]@{ id = 'move-cs-vhdx'; label = 'Move CultureSherpa.vhdx (S:) → D:\Dev'; potentialGB = 61; status = 'pending'; notes = 'Simple file move, remount after' }
    [ordered]@{ id = 'uninstall-clipchamp'; label = 'Uninstall Clipchamp UWP'; potentialGB = 21; status = 'pending'; notes = 'Settings > Apps > Clipchamp' }
    [ordered]@{ id = 'docker-prune'; label = 'docker system prune'; potentialGB = 11; status = 'pending'; notes = 'Run: docker system prune -a' }
    [ordered]@{ id = 'playwright'; label = 'Clear ms-playwright browsers'; potentialGB = 2; status = 'pending'; notes = 'Only if not actively using Playwright' }
    [ordered]@{ id = 'capcut'; label = 'Remove CapCut if unused'; potentialGB = 2; status = 'pending'; notes = 'Settings > Apps' }
    [ordered]@{ id = 'npm-cache-redir'; label = 'Set npm/pip cache → D:'; potentialGB = 0; status = 'pending'; notes = 'npm config set cache D:\npm-cache; pip config set global.cache-dir D:\pip-cache' }
    [ordered]@{ id = 'onedrive-exclude'; label = 'Exclude node_modules from OneDrive'; potentialGB = 0; status = 'pending'; notes = 'OneDrive settings > Excluded folders' }
    [ordered]@{ id = 'diablo-iv'; label = 'Uninstall Diablo IV'; potentialGB = 134; status = 'done'; notes = 'Removed 2026-03-08' }
    [ordered]@{ id = 'thyown-cache'; label = 'Delete .cache\thyown models'; potentialGB = 88; status = 'done'; notes = 'Removed 2026-03-08' }
    [ordered]@{ id = 'eSupport'; label = 'Delete C:\eSupport ASUS bloat'; potentialGB = 7; status = 'done'; notes = 'Removed 2026-03-08' }
    [ordered]@{ id = 'miKTeX'; label = 'Delete C:\MiKTeXRepo'; potentialGB = 5; status = 'done'; notes = 'Removed 2026-03-08' }
    [ordered]@{ id = 'npm-old-cache'; label = 'Delete C:\npm-cache'; potentialGB = 3; status = 'done'; notes = 'Removed 2026-03-08' }
    [ordered]@{ id = 'vhdx-move-o'; label = 'Move Weave0.vhdx (O:) → D:\Dev'; potentialGB = 73; status = 'done'; notes = 'Completed 2026-03-08' }
    [ordered]@{ id = 'gpu-caches'; label = 'Clear NVIDIA/Google/CrashDumps caches'; potentialGB = 11; status = 'done'; notes = 'Removed 2026-03-08' }
  )
}

# ─── 6. BASELINE COMPARISON ─────────────────────────────────────────────────

$comparison = $null
if (Test-Path $BaselineJson) {
  Log "`n[5] Comparing to baseline..."
  try {
    $baseline = Get-Content $BaselineJson -Raw | ConvertFrom-Json
    $baseTime = $baseline.meta.timestamp

    $comparison = @{
      baselineTimestamp = $baseTime
      driveGrowth       = @()
    }

    foreach ($d in $drives) {
      $bd = $baseline.drives | Where-Object { $_.drive -eq $d.drive }
      if ($bd) {
        $growthGB = [math]::Round($d.usedGB - $bd.usedGB, 2)
        $comparison.driveGrowth += [pscustomobject]@{
          drive    = $d.drive
          baseline = $bd.usedGB
          current  = $d.usedGB
          growthGB = $growthGB
          flag     = ($growthGB -gt 10)   # flag if >10 GB growth
        }
        if ($growthGB -gt 10) {
          Log ("  ⚠️  {0} grew {1} GB since {2}" -f $d.drive, $growthGB, $baseTime)
        }
        else {
          Log ("  ✓  {0} delta: {1} GB" -f $d.drive, $growthGB)
        }
      }
    }

    $snapshot['comparison'] = $comparison
  }
  catch {
    Log "  [warn] baseline comparison failed: $_"
  }
}
else {
  Log "`n[5] No baseline found — run with -SetBaseline to save one."
}

# ─── 7. WRITE OUTPUTS ───────────────────────────────────────────────────────

$json = $snapshot | ConvertTo-Json -Depth 8
$OutputJson = [System.IO.Path]::GetFullPath($OutputJson)
$json | Set-Content -Path $OutputJson -Encoding UTF8

Log "`n[6] Snapshot written → $OutputJson"

if ($SetBaseline) {
  $BaselineJson = [System.IO.Path]::GetFullPath($BaselineJson)
  $json | Set-Content -Path $BaselineJson -Encoding UTF8
  Log "    Baseline saved → $BaselineJson"
}

# ─── 8. CONSOLE SUMMARY ─────────────────────────────────────────────────────

if (-not $Silent) {
  $cDrive = $drives | Where-Object { $_.drive -eq 'C:' }
  if ($cDrive) {
    $bar = '#' * [int]($cDrive.pctUsed / 5)
    $empty = '-' * (20 - [int]($cDrive.pctUsed / 5))
    Write-Host "`n━━━ C: Drive ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ("  [{0}{1}] {2}% used  —  {3} GB free / {4} GB total" -f
      $bar, $empty, $cDrive.pctUsed, $cDrive.freeGB, $cDrive.totalGB) -ForegroundColor $(
      if ($cDrive.pctUsed -gt 85) { 'Red' }
      elseif ($cDrive.pctUsed -gt 70) { 'Yellow' }
      else { 'Green' }
    )
  }

  $pending = ($snapshot.actionItems | Where-Object { $_.status -eq 'pending' })
  $pendingGB = ($pending | ForEach-Object { $_.potentialGB } | Measure-Object -Sum).Sum
  if ($pending.Count -gt 0) {
    Write-Host "`n  Pending actions: $($pending.Count) items · ~$pendingGB GB recoverable" -ForegroundColor Yellow
    $pending | ForEach-Object {
      Write-Host ("    • {0,-50} +{1} GB" -f $_.label, $_.potentialGB) -ForegroundColor DarkYellow
    }
  }

  Write-Host "`n  Done. Import storage-snapshot.json in the Admin Portal → Storage Intelligence tab." -ForegroundColor Cyan
}

# Return exit code 0 for Task Scheduler
exit 0
