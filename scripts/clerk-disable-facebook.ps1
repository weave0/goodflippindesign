$sk = $env:CLERK_SECRET_KEY
if (-not $sk) { Write-Error "Set CLERK_SECRET_KEY env var first"; exit 1 }
$h = @{ Authorization = "Bearer $sk"; 'Content-Type' = 'application/json' }

$endpoints = @(
    @{ method='PATCH'; url='https://api.clerk.com/v1/instance/social_connections/oauth_facebook'; body='{"enabled":false,"authenticatable":false}' },
    @{ method='POST';  url='https://api.clerk.com/v1/instance/social_connections/oauth_facebook/disable'; body='{}' },
    @{ method='PATCH'; url='https://api.clerk.com/v1/beta_features/instance_settings'; body='{"oauth_facebook_enabled":false}' },
    @{ method='PUT';   url='https://api.clerk.com/v1/instance/social_connections/oauth_facebook'; body='{"enabled":false,"authenticatable":false}' }
)

foreach ($ep in $endpoints) {
    Write-Host "Trying $($ep.method) $($ep.url)"
    try {
        $r = Invoke-RestMethod -Method $ep.method -Uri $ep.url -Headers $h -Body $ep.body
        Write-Host "SUCCESS: '$r'"
    } catch {
        $msg = $_.Exception.Message
        if ($msg -like '*404*') { Write-Host "  404 not found" }
        elseif ($msg -like '*405*') { Write-Host "  405 method not allowed" }
        elseif ($msg -like '*422*') { Write-Host "  422 unprocessable" }
        else { Write-Host "  FAIL: $msg" }
    }
}

# Verify final state
Write-Host "`n=== FINAL STATE ==="
$env2 = Invoke-RestMethod "https://clerk.goodflippinvibes.com/v1/environment?__clerk_api_version=2025-11-10" -UseBasicParsing
$j = $env2 | ConvertTo-Json -Depth 12
$idx = $j.IndexOf('"oauth_facebook"')
Write-Host $j.Substring($idx, 250)

