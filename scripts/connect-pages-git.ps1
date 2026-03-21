#!/usr/bin/env pwsh
# connect-pages-git.ps1
# Patches Cloudflare Pages projects to connect their GitHub repos.
# Auto-resolves the CF API token from env or .env file.
# Run: .\scripts\connect-pages-git.ps1

param(
  [string]$ApiToken = ""
)

$AccountId = "3253d907ea85a18eb442283d7308b193"

# --- Token resolution (no manual input needed) ---
if (-not $ApiToken) {
  # 1. Check environment variable
  $ApiToken = $env:CLOUDFLARE_API_TOKEN

  # 2. Parse from .env file (handles commented lines too)
  if (-not $ApiToken) {
    $EnvFile = Join-Path $PSScriptRoot ".." ".env"
    if (Test-Path $EnvFile) {
      $line = Get-Content $EnvFile |
      Where-Object { $_ -match 'CLOUDFLARE_API_TOKEN\s*=\s*([^\s#]+)' } |
      Select-Object -First 1
      if ($line -match 'CLOUDFLARE_API_TOKEN\s*=\s*([^\s#]+)') {
        $ApiToken = $Matches[1].Trim()
      }
    }
  }
}

if (-not $ApiToken) {
  Write-Host "ERROR: No Cloudflare API token found." -ForegroundColor Red
  Write-Host "  Set CLOUDFLARE_API_TOKEN in your environment or .env file, then re-run." -ForegroundColor Yellow
  exit 1
}

Write-Host "Token resolved. ($($ApiToken.Substring(0,6))...)" -ForegroundColor DarkGray

$AccountId = "3253d907ea85a18eb442283d7308b193"

$Connections = @(
  @{ Project = "minnesotapeace"; Owner = "weave0"; Repo = "jamie-mediation"; Branch = "main" },
  @{ Project = "citizenapproved"; Owner = "weave0"; Repo = "CitizenApproved"; Branch = "main" }
)

$Headers = @{
  "Authorization" = "Bearer $ApiToken"
  "Content-Type"  = "application/json"
}

function Get-ProjectInfo($ProjectName) {
  $Url = "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$ProjectName"
  try {
    $r = Invoke-RestMethod -Uri $Url -Method Get -Headers $Headers
    if ($r.success) { return $r.result } else { return $null }
  }
  catch { return $null }
}

Write-Host "`n=== Cloudflare Pages Git Connection Script ===" -ForegroundColor White
Write-Host "Account: $AccountId`n" -ForegroundColor DarkGray

# Step 1: Pre-flight — show current state
Write-Host "--- Current state ---" -ForegroundColor Yellow
foreach ($c in $Connections) {
  $info = Get-ProjectInfo $c.Project
  if ($null -eq $info) {
    Write-Host "  $($c.Project): NOT FOUND or auth error" -ForegroundColor Red
  }
  else {
    $currentRepo = $info.source.config.repo_name ?? "(none)"
    $currentOwner = $info.source.config.owner ?? "(none)"
    $currentType = $info.source.type ?? "(none)"
    Write-Host "  $($c.Project): source=$currentType  repo=$currentOwner/$currentRepo" -ForegroundColor DarkGray
  }
}

Write-Host ""

# Step 2: Patch each project
Write-Host "--- Patching ---" -ForegroundColor Yellow
$SuccessCount = 0
$FailCount = 0

foreach ($c in $Connections) {
  $Body = @{
    source = @{
      type   = "github"
      config = @{
        owner               = $c.Owner
        repo_name           = $c.Repo
        production_branch   = $c.Branch
        pr_comments_enabled = $true
        deployments_enabled = $true
      }
    }
  } | ConvertTo-Json -Depth 10

  $Url = "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$($c.Project)"

  Write-Host "  Connecting $($c.Project) → $($c.Owner)/$($c.Repo) (branch: $($c.Branch)) ..." -ForegroundColor Cyan

  try {
    $Response = Invoke-RestMethod -Uri $Url -Method Patch -Headers $Headers -Body $Body
    if ($Response.success) {
      Write-Host "    ✓ Patched successfully" -ForegroundColor Green
      $SuccessCount++
    }
    else {
      Write-Host "    ✗ API errors:" -ForegroundColor Red
      $Response.errors | ForEach-Object { Write-Host "      [code $($_.code)] $($_.message)" -ForegroundColor Red }
      $FailCount++
    }
  }
  catch {
    $statusCode = $_.Exception.Response?.StatusCode?.value__ ?? "?"
    Write-Host "    ✗ HTTP $statusCode — $($_.ErrorDetails.Message ?? $_)" -ForegroundColor Red
    $FailCount++
  }
}

Write-Host ""

# Step 3: Post-flight — confirm new state
Write-Host "--- Verified state after patch ---" -ForegroundColor Yellow
foreach ($c in $Connections) {
  $info = Get-ProjectInfo $c.Project
  if ($null -eq $info) {
    Write-Host "  $($c.Project): could not verify" -ForegroundColor DarkYellow
  }
  else {
    $newRepo = $info.source.config.repo_name ?? "(none)"
    $newOwner = $info.source.config.owner ?? "(none)"
    $newType = $info.source.type ?? "(none)"
    $ok = ($newType -eq "github") -and ($newRepo -eq $c.Repo)
    if ($ok) {
      Write-Host "  ✓ $($c.Project): $newType → $newOwner/$newRepo" -ForegroundColor Green
    }
    else {
      Write-Host "  ✗ $($c.Project): still showing $newType/$newOwner/$newRepo" -ForegroundColor Red
    }
  }
}

Write-Host ""
Write-Host "Result: $SuccessCount patched, $FailCount failed." -ForegroundColor ($FailCount -eq 0 ? "Green" : "Red")
if ($FailCount -gt 0) {
  Write-Host @"

Troubleshooting:
  1. Ensure the Cloudflare GitHub App has access to the repos:
     GitHub → Settings → Applications → Cloudflare Pages → Configure → Repository access
  2. Confirm your API token has 'Cloudflare Pages:Edit' permission
  3. Re-run the script after granting access
"@ -ForegroundColor Yellow
}
