[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Repo = "weave0/goodflippindesign",

    [Parameter(Position = 1)]
    [string[]]$Users,

    [ValidateSet("pull", "triage", "push", "maintain", "admin")]
    [string]$Permission = "push",

    [string]$UsersFile,

    [switch]$DryRun
)

Set-StrictMode -Version Latest

function Split-Users([string]$Raw) {
    if ([string]::IsNullOrWhiteSpace($Raw)) {
        return @()
    }

    return (
        $Raw -split "[,\s]+" |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ }
    )
}

function Read-UsersFromFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Users file not found: $Path"
    }

    $lines = Get-Content -LiteralPath $Path -ErrorAction Stop
    $users = @()

    foreach ($line in $lines) {
        $trim = $line.Trim()
        if (-not $trim) {
            continue
        }
        if ($trim.StartsWith("#")) {
            continue
        }

        $users += Split-Users $trim
    }

    return $users
}

function Ensure-GhInstalled {
    $cmd = Get-Command gh -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "GitHub CLI (gh) not found. Install it from https://cli.github.com/ and run 'gh auth login'."
    }
}

function Ensure-GhAuthed {
    & gh auth status 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Not authenticated with GitHub CLI. Run: gh auth login"
    }
}

Ensure-GhInstalled
Ensure-GhAuthed

if ([string]::IsNullOrWhiteSpace($Repo)) {
    $Repo = (Read-Host "Repo (owner/name)").Trim()
}

if (-not $Users -or $Users.Count -eq 0) {
    if (-not [string]::IsNullOrWhiteSpace($UsersFile)) {
        $Users = Read-UsersFromFile $UsersFile
    }
    else {
        $raw = Read-Host "GitHub usernames (comma-separated)"
        $Users = Split-Users $raw
    }
}

$Users = $Users |
ForEach-Object { $_.Trim() } |
Where-Object { $_ } |
Select-Object -Unique

if (-not $Users -or $Users.Count -eq 0) {
    throw "No GitHub usernames provided."
}

Write-Host ""
Write-Host "Repo:       $Repo"
Write-Host "Permission: $Permission"
Write-Host "Users:      $($Users -join ', ')"
Write-Host ""

foreach ($user in $Users) {
    $endpoint = "repos/$Repo/collaborators/$user"

    if ($DryRun) {
        Write-Host "[dry-run] gh api -X PUT $endpoint -f permission=$Permission"
        continue
    }

    $output = & gh api -X PUT $endpoint -f "permission=$Permission" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Failed to invite/update: $user"
        if ($output) {
            Write-Warning ($output | Out-String)
        }
        continue
    }

    Write-Host "Invited/updated: $user"
}

Write-Host ""
Write-Host "Done. Invited users can accept at: https://github.com/settings/repositories"
