# Upload Heavy Moose "DROSS" (Album 1) videos to R2 bucket gfv-media
# Usage: .\scripts\upload-dross1-videos.ps1
# Requires: wrangler CLI authenticated with Cloudflare

$ErrorActionPreference = "Stop"

$sourceBase = "GFD Dev Projects\SummitView\output\gfv_music_videos\dross_album_1"
$r2Prefix = "dross-album-1"
$bucket = "gfv-media"

# Track folders -> video filenames
$tracks = @(
    @{ Folder = "track_01_prelude_to_glass";                       File = "01 - PRELUDE TO GLASS.mp4" },
    @{ Folder = "track_02_embed";                                  File = "02 - EMBED.mp4" },
    @{ Folder = "track_03_year_long_dark";                         File = "03 - YEAR-LONG DARK.mp4" },
    @{ Folder = "track_04_all_the_friends_i_buried_not_in_ground"; File = "04 - ALL THE FRIENDS I BURIED (NOT IN GROUND).mp4" },
    @{ Folder = "track_05_pressure_surface";                       File = "05 - PRESSURE - SURFACE.mp4" },
    @{ Folder = "track_06_what_grief_weighs";                      File = "06 - WHAT GRIEF WEIGHS.mp4" },
    @{ Folder = "track_07_iron_in_blood";                          File = "07 - IRON IN BLOOD.mp4" },
    @{ Folder = "track_08_meridian_dark";                          File = "08 - MERIDIAN DARK.mp4" },
    @{ Folder = "track_09_extruded";                               File = "09 - EXTRUDED.mp4" },
    @{ Folder = "track_10_threshold";                              File = "10 - THRESHOLD.mp4" }
)

Write-Host "`nUploading Heavy Moose 'DROSS' videos to R2 ($bucket/$r2Prefix)`n" -ForegroundColor Cyan

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

Write-Host "`nDone: $uploaded uploaded, $failed failed." -ForegroundColor Cyan
Write-Host "Videos will be served at /api/media/$r2Prefix/<filename>" -ForegroundColor Gray
