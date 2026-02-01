# Good Flippin Design - Brand Asset Production Environment Setup
# Run this ONCE before generating assets

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Good Flippin Design - Environment Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $ProjectRoot

# 1. Check Python
Write-Host "[1/6] Checking Python installation..." -ForegroundColor Yellow
try {
    $pythonVersion = python --version 2>&1
    Write-Host "  ✓ Found: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "  ✗ Python not found! Please install Python 3.9+" -ForegroundColor Red
    exit 1
}

# 2. Activate virtual environment (create if doesn't exist)
Write-Host "[2/6] Setting up Python virtual environment..." -ForegroundColor Yellow
if (-not (Test-Path ".venv")) {
    Write-Host "  Creating new virtual environment..." -ForegroundColor Cyan
    python -m venv .venv
}
& ".venv\Scripts\Activate.ps1"
Write-Host "  ✓ Virtual environment activated" -ForegroundColor Green

# 3. Install required Python packages
Write-Host "[3/6] Installing required Python packages..." -ForegroundColor Yellow
$requiredPackages = @(
    "openai>=1.0.0",
    "pillow>=10.0.0",
    "requests>=2.31.0"
)

foreach ($package in $requiredPackages) {
    $packageName = $package.Split(">=")[0]
    Write-Host "  Installing $packageName..." -ForegroundColor Cyan
    pip install $package --quiet --disable-pip-version-check
}
Write-Host "  ✓ All packages installed" -ForegroundColor Green

# 4. Check for OpenAI API key
Write-Host "[4/6] Checking OpenAI API configuration..." -ForegroundColor Yellow
$envFile = Join-Path $ProjectRoot ".env"
$hasApiKey = $false

if (Test-Path $envFile) {
    $envContent = Get-Content $envFile -Raw
    if ($envContent -match "OPENAI_API_KEY=.+") {
        Write-Host "  ✓ API key found in .env file" -ForegroundColor Green
        $hasApiKey = $true
    }
}

if (-not $hasApiKey) {
    if ($env:OPENAI_API_KEY) {
        Write-Host "  ✓ API key found in environment variables" -ForegroundColor Green
        $hasApiKey = $true
    }
}

if (-not $hasApiKey) {
    Write-Host "  ⚠ No OpenAI API key configured" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  To configure your API key, choose ONE option:" -ForegroundColor Cyan
    Write-Host "    Option A: Add to .env file:" -ForegroundColor White
    Write-Host "      OPENAI_API_KEY=sk-proj-..." -ForegroundColor Gray
    Write-Host ""
    Write-Host "    Option B: Set environment variable:" -ForegroundColor White
    Write-Host "      `$env:OPENAI_API_KEY = 'sk-proj-...'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Get your API key at: https://platform.openai.com/api-keys" -ForegroundColor Cyan
    Write-Host ""
}

# 5. Create directory structure
Write-Host "[5/6] Creating brand asset directories..." -ForegroundColor Yellow
$directories = @(
    "Brand Assets Development\Final Assets\01-Logo-Variations",
    "Brand Assets Development\Final Assets\02-Social-Media\Profiles",
    "Brand Assets Development\Final Assets\02-Social-Media\Covers",
    "Brand Assets Development\Final Assets\02-Social-Media\Templates",
    "Brand Assets Development\Final Assets\03-Web-Assets\Favicons",
    "Brand Assets Development\Final Assets\03-Web-Assets\Meta-Images",
    "Brand Assets Development\Final Assets\03-Web-Assets\Headers",
    "Brand Assets Development\Final Assets\04-Print-Assets",
    "Brand Assets Development\Final Assets\05-Brand-Guidelines",
    "Brand Assets Development\Final Assets\06-Source-Files"
)

foreach ($dir in $directories) {
    $fullPath = Join-Path $ProjectRoot $dir
    if (-not (Test-Path $fullPath)) {
        New-Item -ItemType Directory -Path $fullPath -Force | Out-Null
    }
}
Write-Host "  ✓ All directories created" -ForegroundColor Green

# 6. Update .gitignore for large assets
Write-Host "[6/6] Configuring Git for large asset files..." -ForegroundColor Yellow
$gitignorePath = Join-Path $ProjectRoot ".gitignore"
$gitignoreContent = if (Test-Path $gitignorePath) { Get-Content $gitignorePath -Raw } else { "" }

$assetsIgnore = @"

# Brand Assets (large files)
Brand Assets Development/Final Assets/**/*.png
Brand Assets Development/Final Assets/**/*.psd
Brand Assets Development/Final Assets/**/*.ai
Brand Assets Development/Final Assets/**/*.fig
!Brand Assets Development/Final Assets/**/*-preview-*.png
"@

if ($gitignoreContent -notmatch "Brand Assets Development") {
    Add-Content -Path $gitignorePath -Value $assetsIgnore
    Write-Host "  ✓ Updated .gitignore for asset management" -ForegroundColor Green
} else {
    Write-Host "  ✓ .gitignore already configured" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Environment Setup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Ready to generate logo! Run:" -ForegroundColor White
Write-Host "  python 'Brand Assets Development\scripts\generate-dalle-logo.py'" -ForegroundColor Yellow
Write-Host ""
Write-Host "Optional arguments:" -ForegroundColor White
Write-Host "  python generate-dalle-logo.py 1    # Generate 1 variant (default)" -ForegroundColor Gray
Write-Host "  python generate-dalle-logo.py 3    # Generate 3 variants to choose from" -ForegroundColor Gray
Write-Host ""
