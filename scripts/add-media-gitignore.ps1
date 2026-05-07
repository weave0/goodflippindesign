$targets = @(
    "Z:\GFD\.gitignore",
    "Z:\GFD\GFD Dev Projects\AI\.gitignore",
    "Z:\GFD\GFD Dev Projects\CitizenApproved\.gitignore",
    "Z:\GFD\GFD Dev Projects\CultureSherpa\.gitignore",
    "Z:\GFD\GFD Dev Projects\Foxyana\.gitignore",
    "Z:\GFD\GFD Dev Projects\GFY\.gitignore",
    "Z:\GFD\GFD Dev Projects\Globaldeets\.gitignore",
    "Z:\GFD\GFD Dev Projects\minnesotapeace\.gitignore",
    "Z:\GFD\GFD Dev Projects\ThyOwn\.gitignore",
    "Z:\GFD\GFD Dev Projects\Weave\.gitignore",
    "Z:\GFD\GFD Dev Projects\SummitView\.gitignore"
)

$block = @"

# -- Media assets - never commit (use R2 / S3 / CDN / local-only) ----------
*.mp3
*.mp4
*.m4a
*.wav
*.flac
*.ogg
*.aiff
*.aif
*.webm
*.mkv
*.mov
*.avi
*.wmv
# ---------------------------------------------------------------------------
"@

foreach ($f in $targets) {
    if (Test-Path $f) {
        $existing = Get-Content $f -Raw
        if ($existing -match "Media assets") {
            Write-Host "SKIP (already has media rules): $f"
        }
        else {
            Add-Content $f $block
            Write-Host "Updated: $f"
        }
    }
    else {
        Set-Content $f $block.TrimStart()
        Write-Host "Created: $f"
    }
}
