# Test Stripe Payment System on goodflippindesign.com
# Tests the /create-checkout endpoint with various scenarios

Write-Host "`n🧪 Testing Stripe Payment System" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

# Test cases
$tests = @(
    @{name = '$25 One-Time'; amount = 25; type = 'one-time' },
    @{name = '$50 One-Time'; amount = 50; type = 'one-time' },
    @{name = '$10 Recurring'; amount = 10; type = 'recurring' },
    @{name = 'Minimum $5'; amount = 5; type = 'one-time' },
    @{name = 'Custom $75'; amount = 75; type = 'one-time' }
)

$passed = 0
$failed = 0

foreach ($test in $tests) {
    Write-Host "`n📝 Test: $($test.name)" -ForegroundColor Yellow

    $body = @{
        amount = $test.amount
        type   = $test.type
    } | ConvertTo-Json

    try {
        $response = Invoke-WebRequest -Uri "https://www.goodflippindesign.com/create-checkout" `
            -Method POST `
            -Body $body `
            -ContentType "application/json" `
            -UseBasicParsing `
            -ErrorAction Stop

        $data = $response.Content | ConvertFrom-Json

        if ($data.sessionId -and $data.url -and $data.url -like "https://checkout.stripe.com/*") {
            Write-Host "   ✅ PASS - Session: $($data.sessionId.Substring(0,20))..." -ForegroundColor Green
            Write-Host "   💳 URL: $($data.url.Substring(0,50))..." -ForegroundColor Gray
            $passed++
        }
        else {
            Write-Host "   ❌ FAIL - Invalid response format" -ForegroundColor Red
            Write-Host "   Response: $($response.Content)" -ForegroundColor Gray
            $failed++
        }
    }
    catch {
        Write-Host "   ❌ FAIL - $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = [System.IO.StreamReader]::new($_.Exception.Response.GetResponseStream())
            Write-Host "   Error Details: $($reader.ReadToEnd())" -ForegroundColor Gray
            $reader.Close()
        }
        $failed++
    }
}

# Test error cases
Write-Host "`n🚫 Testing Error Handling" -ForegroundColor Yellow

# Test 1: Amount too low
try {
    $body = @{amount = 3; type = 'one-time' } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "https://www.goodflippindesign.com/create-checkout" `
        -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
    Write-Host "   ❌ FAIL - Should reject <$5 amounts" -ForegroundColor Red
    $failed++
}
catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "   ✅ PASS - Correctly rejected $3 (minimum $5)" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "   ❌ FAIL - Wrong error code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        $failed++
    }
}

# Test 2: Invalid donation type
try {
    $body = @{amount = 25; type = 'invalid' } | ConvertTo-Json
    $response = Invoke-WebRequest -Uri "https://www.goodflippindesign.com/create-checkout" `
        -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -ErrorAction Stop
    Write-Host "   ❌ FAIL - Should reject invalid type" -ForegroundColor Red
    $failed++
}
catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 400) {
        Write-Host "   ✅ PASS - Correctly rejected invalid type" -ForegroundColor Green
        $passed++
    }
    else {
        Write-Host "   ❌ FAIL - Wrong error code: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
        $failed++
    }
}

# Summary
Write-Host "`n📊 Test Summary" -ForegroundColor Cyan
Write-Host "===============" -ForegroundColor Cyan
Write-Host "   Passed: $passed" -ForegroundColor Green
Write-Host "   Failed: $failed" -ForegroundColor Red
Write-Host "   Total:  $($passed + $failed)`n"

if ($failed -eq 0) {
    Write-Host "✅ All tests passed! Payment system is fully operational." -ForegroundColor Green
    exit 0
}
else {
    Write-Host "⚠️  Some tests failed. Check errors above." -ForegroundColor Yellow
    exit 1
}
