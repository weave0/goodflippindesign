<#
.SYNOPSIS
  Smoke-test every published JSON-LD @graph block in the GFD ecosystem.

.DESCRIPTION
  For each URL: fetches the page, extracts <script type="application/ld+json"> blocks,
  parses them, and reports:
    - HTTP status
    - JSON parse OK / fail
    - Whether the studio @id (https://goodflippindesign.com/#studio) is referenced
    - @types declared in the @graph

  Use after deploying any cross-repo paste bundle from scratch/cross-repo-paste-bundles/
  to confirm the @graph stitches into the studio entity correctly.

.NOTES
  This is a SMOKE test, not a full schema.org validator. For exhaustive validation
  pass each URL through https://validator.schema.org/ in a browser.
#>

$ErrorActionPreference = 'Stop'

# All property surfaces currently expected to publish ecosystem JSON-LD.
# (Comment out lines for properties that have NOT yet had paste bundles applied.)
$urls = @(
    'https://goodflippindesign.com/',
    'https://goodflippindesign.com/donate.html',
    'https://goodflippindesign.com/gallery.html',
    'https://goodflippindesign.com/music.html',
    'https://goodflippindesign.com/music-shariff.html',
    'https://goodflippindesign.com/music-djz.html',
    'https://goodflippindesign.com/music-aardvarco.html',
    'https://goodflippindesign.com/music-heavymoose-dross1.html',
    'https://goodflippindesign.com/music-heavymoose-dross2.html',
    'https://goodflippindesign.com/terms.html',
    'https://goodflippindesign.com/privacy.html'
    # Uncomment once cross-repo bundles land:
    # 'https://heavymoose.com/',
    # 'https://citizenapproved.org/',
    # 'https://culturesherpa.org/',
    # 'https://aiaimate.com/',
    # 'https://lowertownstpaul.org/',
    # 'https://www.brettleeweaver.com/'
)

$studioId = 'https://goodflippindesign.com/#studio'
$results = @()

foreach ($url in $urls) {
    Write-Host "Checking $url ..." -ForegroundColor Cyan
    $row = [ordered]@{
        URL       = $url
        Status    = $null
        Blocks    = 0
        ParseOK   = 0
        ParseFail = 0
        StudioRef = $false
        Types     = ''
        Note      = ''
    }
    try {
        $resp = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 20
        $row.Status = $resp.StatusCode
        $matches = [regex]::Matches(
            $resp.Content,
            '(?is)<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>'
        )
        $row.Blocks = $matches.Count
        $allTypes = New-Object System.Collections.Generic.HashSet[string]
        foreach ($m in $matches) {
            $raw = $m.Groups[1].Value.Trim()
            try {
                $doc = $raw | ConvertFrom-Json -ErrorAction Stop
                $row.ParseOK++
                $rawText = $raw
                if ($rawText -like "*$studioId*") { $row.StudioRef = $true }
                $graph = if ($doc.'@graph') { $doc.'@graph' } else { @($doc) }
                foreach ($node in $graph) {
                    $t = $node.'@type'
                    if ($null -eq $t) { continue }
                    if ($t -is [System.Array]) {
                        foreach ($x in $t) { [void]$allTypes.Add($x) }
                    }
                    else {
                        [void]$allTypes.Add([string]$t)
                    }
                }
            }
            catch {
                $row.ParseFail++
                $row.Note = $_.Exception.Message
            }
        }
        $row.Types = ($allTypes | Sort-Object) -join ','
    }
    catch {
        $row.Status = 'ERR'
        $row.Note = $_.Exception.Message
    }
    $results += [pscustomobject]$row
}

Write-Host ""
Write-Host "=== ECOSYSTEM JSON-LD SMOKE REPORT ===" -ForegroundColor Yellow
$results | Format-Table URL, Status, Blocks, ParseOK, ParseFail, StudioRef, Types -AutoSize -Wrap

# Exit non-zero if any URL failed parse or missing studio ref
$bad = $results | Where-Object { $_.Status -ne 200 -or $_.ParseFail -gt 0 -or -not $_.StudioRef }
if ($bad) {
    Write-Host "FAIL: $($bad.Count) issue(s)." -ForegroundColor Red
    exit 1
}
Write-Host "OK: all $($results.Count) URLs returned 200, parsed, and reference $studioId" -ForegroundColor Green
