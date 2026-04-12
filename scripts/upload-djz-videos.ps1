# Upload DJ Z "Wheels Up" album videos to R2 bucket gfv-media
# Usage: .\scripts\upload-djz-videos.ps1
# Requires: wrangler CLI authenticated with Cloudflare

$ErrorActionPreference = "Stop"

$sourceDir = "GFD Dev Projects\SummitView\output\youtube_packages\djzebra_album_1"
$r2Prefix = "gfv-album-2"
$bucket = "gfv-media"

$tracks = @(
    "01 - Lace Up.mp4",
    "02 - First Wheels.mp4",
    "03 - Coast Mode.mp4",
    "04 - Everybody's Good.mp4",
    "05 - Purple Wheels.mp4",
    "06 - DJ Z in the Mix.mp4",
    "07 - Last Lap.mp4",
    "08 - Roll Home.mp4",
    "09 - The Slow One (You Know What It Is).mp4"
)

Write-Host "`nUploading DJ Z 'Wheels Up' videos to R2 ($bucket/$r2Prefix)`n" -ForegroundColor Cyan

$uploaded = 0
$failed = 0

foreach ($track in $tracks) {
    $localPath = Join-Path $sourceDir $track
    $r2Key = "$r2Prefix/$track"

    if (-not (Test-Path $localPath)) {
        Write-Host "  SKIP  $track (file not found)" -ForegroundColor Yellow
        $failed++
        continue
    }

    $sizeMB = [math]::Round((Get-Item $localPath).Length / 1MB, 1)
    Write-Host "  UP    $track ($sizeMB MB) -> $r2Key" -ForegroundColor Green

    try {
        npx wrangler r2 object put "$bucket/$r2Key" --file $localPath --content-type "video/mp4" --remote
        $uploaded++
    }
    catch {
        Write-Host "  FAIL  $track : $_" -ForegroundColor Red
        $failed++
    }
}

Write-Host "`nDone: $uploaded uploaded, $failed failed." -ForegroundColor Cyan
Write-Host "Videos will be served at /api/media/$r2Prefix/<filename>" -ForegroundColor Gray
