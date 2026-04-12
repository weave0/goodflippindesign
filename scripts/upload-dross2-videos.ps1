# Upload Heavy Moose "DROSS II" (Album 2) videos to R2 bucket gfv-media
# Usage: .\scripts\upload-dross2-videos.ps1
# Requires: wrangler CLI authenticated with Cloudflare

$ErrorActionPreference = "Stop"

$sourceBase = "GFD Dev Projects\SummitView\output\gfv_music_videos\dross_album_2"
$r2Prefix = "dross-album-2"
$bucket = "gfv-media"

# Track folders -> video filenames
$tracks = @(
    @{ Folder = "track_01_through"; File = "01 - THROUGH.mp4" },
    @{ Folder = "track_02_still_here"; File = "02 - STILL HERE.mp4" },
    @{ Folder = "track_03_heavy_water"; File = "03 - HEAVY WATER.mp4" },
    @{ Folder = "track_04_small_things"; File = "04 - SMALL THINGS.mp4" },
    @{ Folder = "track_05_hands"; File = "05 - HANDS.mp4" },
    @{ Folder = "track_06_furnace"; File = "06 - FURNACE.mp4" },
    @{ Folder = "track_07_the_long_game"; File = "07 - THE LONG GAME.mp4" },
    @{ Folder = "track_08_blood_and_honey"; File = "08 - BLOOD AND HONEY.mp4" },
    @{ Folder = "track_09_we"; File = "09 - WE.mp4" },
    @{ Folder = "track_10_three_am"; File = "10 - THREE AM.mp4" },
    @{ Folder = "track_11_what_we_build"; File = "11 - WHAT WE BUILD.mp4" },
    @{ Folder = "track_12_yield"; File = "12 - YIELD.mp4" }
)

Write-Host "`nUploading Heavy Moose 'DROSS II' videos to R2 ($bucket/$r2Prefix)`n" -ForegroundColor Cyan

$uploaded = 0
$failed = 0

foreach ($t in $tracks) {
    $localPath = Join-Path $sourceBase $t.Folder $t.File
    $r2Key = "$r2Prefix/$($t.File)"

    if (-not (Test-Path $localPath)) {
        Write-Host "  SKIP  $($t.File) (file not found at $localPath)" -ForegroundColor Yellow
        $failed++
        continue
    }

    $sizeMB = [math]::Round((Get-Item $localPath).Length / 1MB, 1)
    Write-Host "  UP    $($t.File) ($sizeMB MB) -> $r2Key" -ForegroundColor Green

    try {
        npx wrangler r2 object put "$bucket/$r2Key" --file $localPath --content-type "video/mp4" --remote
        $uploaded++
    }
    catch {
        Write-Host "  FAIL  $($t.File) : $_" -ForegroundColor Red
        $failed++
    }
}

# Also upload Heavy Moose intro video
$introSource = "GFD Dev Projects\SummitView\output\gfv_music_videos\heavy_moose_intro\Heavy Moose - Chilly Sun.mp4"
$introR2Key = "heavy-moose/Heavy Moose - Chilly Sun.mp4"

if (Test-Path $introSource) {
    $sizeMB = [math]::Round((Get-Item $introSource).Length / 1MB, 1)
    Write-Host "  UP    Heavy Moose intro ($sizeMB MB) -> $introR2Key" -ForegroundColor Green
    try {
        npx wrangler r2 object put "$bucket/$introR2Key" --file $introSource --content-type "video/mp4" --remote
        $uploaded++
    }
    catch {
        Write-Host "  FAIL  Heavy Moose intro : $_" -ForegroundColor Red
        $failed++
    }
}
else {
    Write-Host "  SKIP  Heavy Moose intro (file not found)" -ForegroundColor Yellow
}

Write-Host "`nDone: $uploaded uploaded, $failed failed." -ForegroundColor Cyan
Write-Host "Videos will be served at /api/media/$r2Prefix/<filename>" -ForegroundColor Gray
Write-Host "Intro video at /api/media/heavy-moose/Heavy Moose - Chilly Sun.mp4" -ForegroundColor Gray
