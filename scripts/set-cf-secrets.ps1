param(
  [string]$ProjectName = "goodflippindesign",
  [string]$AccountId = "3253d907ea85a18eb442283d7308b193"
)
# Use the stored wrangler OAuth token (has pages:write scope) rather than the
# limited API token in .env which only has workers scope.
$wranglerConfig = Get-Content "C:\Users\brett\AppData\Roaming\xdg.config\.wrangler\config\default.toml" -Raw
$token = [regex]::Match($wranglerConfig, 'oauth_token\s*=\s*"([^"]+)"').Groups[1].Value
if (-not $token) { Write-Error "No wrangler OAuth token found"; exit 1 }
$apiBase = "https://api.cloudflare.com/client/v4/accounts/$AccountId/pages/projects/$ProjectName"
$headers = @{ Authorization = "Bearer $token"; "Content-Type" = "application/json" }

function Set-PagesSecret([string]$Name, [string]$Value) {
  $envVars = @{}
  $envVars[$Name] = @{ value = $Value; type = "secret_text" }
  $body = @{ deployment_configs = @{ production = @{ env_vars = $envVars } } } | ConvertTo-Json -Depth 10 -Compress
  try {
    $r = Invoke-WebRequest -Method Patch -Uri $apiBase -Headers $headers -Body $body -UseBasicParsing
    $result = $r.Content | ConvertFrom-Json
    if ($result.success) { Write-Host "[OK] $Name" } else { Write-Host "[FAIL] $Name : $($result.errors | ConvertTo-Json -Compress)" }
  }
  catch {
    Write-Host "[ERR] $Name : $($_.Exception.Message)"
    if ($_.ErrorDetails.Message) { Write-Host $_.ErrorDetails.Message }
  }
}

Write-Host "Setting Cloudflare Pages secrets for: $ProjectName"
Set-PagesSecret "META_APP_ID"          "882897501450706"
Set-PagesSecret "THREADS_APP_ID"       "1248220120837224"

# Load TOKEN_ENCRYPTION_KEY and INTERNAL_SECRET from .env
$envContent = Get-Content "z:\GFD\.env"
$encKey = ($envContent | Where-Object { $_ -match "^TOKEN_ENCRYPTION_KEY=" }) -replace "^TOKEN_ENCRYPTION_KEY=", ""
$intSecret = ($envContent | Where-Object { $_ -match "^INTERNAL_SECRET=" }) -replace "^INTERNAL_SECRET=", ""
if ($encKey) { Set-PagesSecret "TOKEN_ENCRYPTION_KEY" $encKey }    else { Write-Host "[SKIP] TOKEN_ENCRYPTION_KEY not in .env" }
if ($intSecret) { Set-PagesSecret "INTERNAL_SECRET"      $intSecret } else { Write-Host "[SKIP] INTERNAL_SECRET not in .env" }

# Remaining OAuth secrets — uncomment + fill in as you collect them:
# Set-PagesSecret "META_APP_SECRET"        "PASTE_HERE"
# Set-PagesSecret "THREADS_APP_SECRET"     "PASTE_HERE"
# Set-PagesSecret "X_CLIENT_ID"            "PASTE_HERE"
# Set-PagesSecret "X_CLIENT_SECRET"        "PASTE_HERE"
# Set-PagesSecret "LINKEDIN_CLIENT_ID"     "PASTE_HERE"
# Set-PagesSecret "LINKEDIN_CLIENT_SECRET" "PASTE_HERE"
# Set-PagesSecret "PINTEREST_APP_ID"       "PASTE_HERE"
# Set-PagesSecret "PINTEREST_APP_SECRET"   "PASTE_HERE"
# Set-PagesSecret "TIKTOK_CLIENT_KEY"      "PASTE_HERE"
# Set-PagesSecret "TIKTOK_CLIENT_SECRET"   "PASTE_HERE"
# Set-PagesSecret "GOOGLE_CLIENT_ID"       "PASTE_HERE"
# Set-PagesSecret "GOOGLE_CLIENT_SECRET"   "PASTE_HERE"
# Set-PagesSecret "SOCIAL_PUBLISHER_URL"   "PASTE_HERE"

Write-Host "Done."
