[CmdletBinding()]
param(
    [ValidateSet('help', 'status', 'init', 'bootstrap', 'list', 'run')]
    [string]$Action = 'help',

    [string]$Tool,

    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ToolArgs
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$localRoot = Join-Path $repoRoot 'CASHMONEY'
$paths = [ordered]@{
    LocalRoot = $localRoot
    DataRoot = Join-Path $localRoot 'data'
    InboundRoot = Join-Path $localRoot 'data\inbound'
    WorkingRoot = Join-Path $localRoot 'data\working'
    OutRoot = Join-Path $localRoot 'out'
    SubmissionRoot = Join-Path $localRoot 'out\submissions'
    LogsRoot = Join-Path $localRoot 'logs'
    ToolRoot = $PSScriptRoot
}

$localConfigPath = Join-Path $localRoot 'finance-config.json'
$templateConfigPath = Join-Path $PSScriptRoot 'templates\finance-config.example.json'

function Get-PythonRuntime {
    $cashmoneyPython = Join-Path $localRoot '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $cashmoneyPython) {
        return [pscustomobject]@{
            Command = $cashmoneyPython
            FixedArgs = @()
            Source = 'CASHMONEY .venv'
        }
    }

    $repoPython = Join-Path $repoRoot '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $repoPython) {
        return [pscustomobject]@{
            Command = $repoPython
            FixedArgs = @()
            Source = 'repo .venv'
        }
    }

    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pyLauncher) {
        return [pscustomobject]@{
            Command = $pyLauncher.Source
            FixedArgs = @('-3')
            Source = 'py -3 launcher'
        }
    }

    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($pythonCommand) {
        return [pscustomobject]@{
            Command = $pythonCommand.Source
            FixedArgs = @()
            Source = 'python on PATH'
        }
    }

    return $null
}

function Get-TrackedFinanceTools {
    if (-not (Test-Path -LiteralPath $PSScriptRoot)) {
        return @()
    }

    $excludedFiles = @('finance_common.py')
    return @(
        Get-ChildItem -LiteralPath $PSScriptRoot -Filter '*.py' -File |
            Where-Object { $excludedFiles -notcontains $_.Name } |
            Sort-Object Name
    )
}

function Ensure-LocalConfig {
    if (-not (Test-Path -LiteralPath $templateConfigPath)) {
        return $null
    }

    if (Test-Path -LiteralPath $localConfigPath) {
        return 'exists'
    }

    Copy-Item -LiteralPath $templateConfigPath -Destination $localConfigPath -Force
    return 'created'
}

function Initialize-LocalWorkspace {
    $created = @()

    foreach ($entry in $paths.GetEnumerator()) {
        if ($entry.Key -eq 'ToolRoot') {
            continue
        }

        if (-not (Test-Path -LiteralPath $entry.Value)) {
            New-Item -ItemType Directory -Path $entry.Value -Force | Out-Null
            $created += $entry.Value
        }
    }

    $configState = Ensure-LocalConfig

    if ($created.Count -eq 0 -and $configState -ne 'created') {
        Write-Output 'Finance staging directories already exist.'
        return
    }

    if ($created.Count -gt 0) {
        Write-Output 'Created finance staging directories:'
        foreach ($path in $created) {
            Write-Output "  $path"
        }
    }

    if ($configState -eq 'created') {
        Write-Output "Created local finance config: $localConfigPath"
    }
}

function Bootstrap-LocalWorkspace {
    Initialize-LocalWorkspace
    Write-Output ''
    Show-Status
}

function Show-Help {
    @(
        'Finance workspace management',
        '',
        'Actions:',
        '  help   Show this message',
        '  status Show repo, staging, and runtime information',
        '  init   Create local staging directories under CASHMONEY',
        '  bootstrap Create local staging directories and local config, then show status',
        '  list   List tracked Python finance tools under scripts/finance',
        '  run    Run a tracked Python finance tool',
        '',
        'Examples:',
        '  npm run finance:bootstrap',
        '  npm run finance:init',
        '  npm run finance:status',
        '  npm run finance:inventory',
        '  npm run finance:package',
        '  node scripts/finance/run-finance-tool.js package_submission --label q1-audit --dry-run',
        "  pwsh -File scripts/finance/finance-workspace.ps1 -Action run -Tool export_ga4 -ToolArgs '--property-id','123456789','--start-date','2026-01-01','--end-date','2026-01-31'"
    ) | Write-Output
}

function Show-Status {
    $pythonRuntime = Get-PythonRuntime
    $tools = @(Get-TrackedFinanceTools)

    Write-Output "Repo root: $repoRoot"
    Write-Output "Local finance root: $localRoot"
    Write-Output ''
    Write-Output 'Workspace paths:'
    foreach ($entry in $paths.GetEnumerator()) {
        $exists = Test-Path -LiteralPath $entry.Value
        Write-Output ("  {0}: {1} ({2})" -f $entry.Key, $entry.Value, ($(if ($exists) { 'exists' } else { 'missing' })))
    }

    $configStatus = if (Test-Path -LiteralPath $localConfigPath) { 'exists' } else { 'missing' }
    Write-Output ("  LocalConfig: {0} ({1})" -f $localConfigPath, $configStatus)

    Write-Output ''
    if ($pythonRuntime) {
        Write-Output ("Python runtime: {0} ({1})" -f $pythonRuntime.Command, $pythonRuntime.Source)
    }
    else {
        Write-Output 'Python runtime: not found'
    }

    Write-Output ''
    if ($tools.Count -gt 0) {
        Write-Output 'Tracked finance tools:'
        foreach ($toolFile in $tools) {
            Write-Output "  $($toolFile.Name)"
        }
    }
    else {
        Write-Output 'Tracked finance tools: none yet'
        Write-Output 'Recover or add Python tools under scripts/finance before using run.'
    }
}

function Show-ToolList {
    $tools = @(Get-TrackedFinanceTools)
    if ($tools.Count -eq 0) {
        Write-Output 'No tracked Python finance tools found in scripts/finance.'
        return
    }

    $tools | ForEach-Object {
        Write-Output $_.Name
    }
}

function Invoke-TrackedTool {
    if (-not $Tool) {
        throw 'A tool name is required for -Action run.'
    }

    $toolFile = if ($Tool.EndsWith('.py')) { $Tool } else { "$Tool.py" }
    $toolPath = Join-Path $PSScriptRoot $toolFile
    if (-not (Test-Path -LiteralPath $toolPath)) {
        throw "Tracked finance tool not found: $toolPath"
    }

    $pythonRuntime = Get-PythonRuntime
    if (-not $pythonRuntime) {
        throw 'No Python runtime was found. Create CASHMONEY/.venv or repo .venv, or install Python.'
    }

    Initialize-LocalWorkspace

    $arguments = @()
    $arguments += $pythonRuntime.FixedArgs
    $arguments += $toolPath
    if ($ToolArgs) {
        $arguments += $ToolArgs
    }

    Write-Output ("Running {0} with {1}" -f $toolFile, $pythonRuntime.Source)
    & $pythonRuntime.Command @arguments
}

switch ($Action) {
    'help' { Show-Help }
    'status' { Show-Status }
    'init' { Initialize-LocalWorkspace }
    'bootstrap' { Bootstrap-LocalWorkspace }
    'list' { Show-ToolList }
    'run' { Invoke-TrackedTool }
    default { Show-Help }
}
