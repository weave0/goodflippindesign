Set-Location "Z:\GFD\GFD Dev Projects\SummitView"

# Find all tracked media files and untrack them
$tracked = git ls-files | Select-String "\.mp3$|\.mp4$|\.m4a$|\.wav$|\.flac$|\.ogg$|\.aiff$|\.aif$|\.webm$|\.mkv$|\.mov$|\.avi$|\.wmv$" | ForEach-Object { $_.ToString().Trim() }

if ($tracked.Count -gt 0) {
    Write-Host "Untracking $($tracked.Count) media files..."
    $tracked | ForEach-Object { git rm --cached --quiet $_ }
    Write-Host "Done."
}
else {
    Write-Host "No tracked media files found."
}

# Re-stage all functional changes (gitignore will exclude the media files)
git add -A

# Show what we're about to commit
Write-Host "`nStaged changes:"
git diff --cached --stat | Select-Object -Last 5

# Commit
git commit -m "chore: analytics data sync - metrics, provenance, fairness queue, config updates"
Write-Host "`nCommit done. Checking size..."
git diff HEAD origin/main --stat | Select-Object -Last 3
