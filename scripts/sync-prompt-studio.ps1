<#
.SYNOPSIS
    Syncs SummitView output (HTML/CSS/JS only) to GFD/prompt-studio/

.DESCRIPTION
    Copies the SummitView static hub from GFD Dev Projects/SummitView/output/
    into the prompt-studio/ directory so it can be deployed to Cloudflare Pages
    behind the Clerk admin auth gate.

    Binary media assets (*.mp4, *.jpg, *.png, clips/, blender_rigs/, etc.) are
    intentionally excluded — these are large generated files not suitable for git.

    Re-run this script whenever you rebuild the SummitView catalog.

.NOTES
    After running: git add prompt-studio/ && git commit && git push
    The Cloudflare Pages build picks up the new files automatically.
    Access is gated in _worker.js — any request to /prompt-studio/* without a
    valid Clerk session cookie is redirected to /admin.html.
#>

$ErrorActionPreference = 'Stop'
$root    = Split-Path -Parent $PSScriptRoot
$source  = Join-Path $root 'GFD Dev Projects\SummitView\output'
$dest    = Join-Path $root 'prompt-studio'

if (-not (Test-Path $source)) {
    Write-Error "SummitView output not found at: $source`nRun 'make build-hub' or 'python pipeline/build_hub.py' in the SummitView project first."
    exit 1
}

Write-Host "Source : $source"
Write-Host "Dest   : $dest"
Write-Host ""

# Ensure destination exists
New-Item -ItemType Directory -Force -Path $dest | Out-Null

# ── Root-level HTML files ───────────────────────────────────────────────────
$htmlFiles = Get-ChildItem -Path $source -Filter '*.html' -File
foreach ($f in $htmlFiles) {
    Copy-Item $f.FullName -Destination $dest -Force
    Write-Host "  [html] $($f.Name)"
}

# ── assets/ (CSS, JS, fonts, SVG) — exclude binary dirs ────────────────────
$assetsSource = Join-Path $source 'assets'
if (Test-Path $assetsSource) {
    $assetsDest = Join-Path $dest 'assets'
    New-Item -ItemType Directory -Force -Path $assetsDest | Out-Null

    # Copy files directly under assets/
    Get-ChildItem -Path $assetsSource -File | ForEach-Object {
        Copy-Item $_.FullName -Destination $assetsDest -Force
        Write-Host "  [asset] $($_.Name)"
    }

    # Copy sub-folders containing web assets (css/, js/, fonts/) only
    $webSubFolders = @('css', 'js', 'fonts', 'icons', 'img', 'images')
    foreach ($sub in $webSubFolders) {
        $subPath = Join-Path $assetsSource $sub
        if (Test-Path $subPath) {
            $subDest = Join-Path $assetsDest $sub
            Copy-Item -Path $subPath -Destination $subDest -Recurse -Force
            Write-Host "  [asset] assets/$sub/ (recursive)"
        }
    }
}

# ── prompt_studio/ subdirectory (track library sub-pages) ──────────────────
$psSource = Join-Path $source 'prompt_studio'
if (Test-Path $psSource) {
    $psDest = Join-Path $dest 'prompt_studio'
    Copy-Item -Path $psSource -Destination $psDest -Recurse -Force
    Write-Host "  [dir]   prompt_studio/ (recursive)"
}

# ── youtube_packages/ subdirectory ─────────────────────────────────────────
$ytSource = Join-Path $source 'youtube_packages'
if (Test-Path $ytSource) {
    $ytDest = Join-Path $dest 'youtube_packages'
    New-Item -ItemType Directory -Force -Path $ytDest | Out-Null
    # Copy only HTML/JSON inside — skip any video files
    Get-ChildItem -Path $ytSource -Recurse -File |
        Where-Object { $_.Extension -in @('.html', '.json', '.css', '.js') } |
        ForEach-Object {
            $rel  = $_.FullName.Substring($ytSource.Length + 1)
            $tgt  = Join-Path $ytDest $rel
            $dir  = Split-Path $tgt -Parent
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
            Copy-Item $_.FullName -Destination $tgt -Force
            Write-Host "  [yt]    youtube_packages/$rel"
        }
}

Write-Host ""
Write-Host "Done. Files in: $dest"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  git add prompt-studio/"
Write-Host "  git commit -m 'chore: sync SummitView prompt studio'"
Write-Host "  git push"
Write-Host ""
Write-Host "Access (after deploy): https://goodflippindesign.com/admin.html → Prompt Studio (panel 33)"
Write-Host "Direct URL (auth-gated): https://goodflippindesign.com/prompt-studio/"
