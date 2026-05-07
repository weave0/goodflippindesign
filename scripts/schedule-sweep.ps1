<#
.SYNOPSIS
    Registers a Windows Task Scheduler job to run local-sweep.js automatically.

.DESCRIPTION
    Creates (or updates) a scheduled task named "GFD-LocalSweep" that runs
    `npm run sweep` from Z:\GFD every 30 minutes while the machine is unlocked.
    The task is registered under the current user account and runs even if
    the machine is running on battery power.

.PARAMETER Interval
    Run interval in minutes. Default: 30.

.PARAMETER Remove
    Remove the scheduled task (if it exists) and exit.

.EXAMPLE
    .\scripts\schedule-sweep.ps1                # register / update task (30-min interval)
    .\scripts\schedule-sweep.ps1 -Interval 60  # register with 60-min interval
    .\scripts\schedule-sweep.ps1 -Remove        # remove the task
#>
param(
    [int]   $Interval = 30,
    [switch]$Remove
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$TASK_NAME = 'GFD-LocalSweep'
$WORKSPACE = Split-Path $PSScriptRoot -Parent   # z:\GFD
$NODE_EXE = (Get-Command node -ErrorAction SilentlyContinue)?.Source
$SCRIPT = Join-Path $WORKSPACE 'scripts\local-sweep.js'

# ── Remove ────────────────────────────────────────────────────────────────────
if ($Remove) {
    $existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
        Write-Host "✅  Scheduled task '$TASK_NAME' removed." -ForegroundColor Green
    }
    else {
        Write-Host "ℹ️   Task '$TASK_NAME' not found — nothing to remove." -ForegroundColor Yellow
    }
    return
}

# ── Validate prerequisites ────────────────────────────────────────────────────
if (-not $NODE_EXE) {
    Write-Error "node.exe not found in PATH. Install Node.js and retry."
    exit 1
}
if (-not (Test-Path $SCRIPT)) {
    Write-Error "Sweep script not found: $SCRIPT"
    exit 1
}

Write-Host "`n⚙️   Registering '$TASK_NAME' (every $Interval minutes)…" -ForegroundColor Cyan
Write-Host "    Node  : $NODE_EXE"
Write-Host "    Script: $SCRIPT"
Write-Host "    CWD   : $WORKSPACE`n"

# ── Build task components ─────────────────────────────────────────────────────
$action = New-ScheduledTaskAction `
    -Execute    $NODE_EXE `
    -Argument   "`"$SCRIPT`" --quiet" `
    -WorkingDirectory $WORKSPACE

# Repeat every $Interval minutes indefinitely
$trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes $Interval) `
    -Once -At (Get-Date).Date

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 5) `
    -RunOnlyIfNetworkAvailable:$false `
    -DisallowStartIfOnBatteries:$false `
    -StopIfGoingOnBatteries:$false `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId     ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType  Interactive `
    -RunLevel   Limited

# ── Register ──────────────────────────────────────────────────────────────────
$existing = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($existing) {
    Set-ScheduledTask `
        -TaskName  $TASK_NAME `
        -Action    $action `
        -Trigger   $trigger `
        -Settings  $settings `
        -Principal $principal | Out-Null
    Write-Host "✅  Task '$TASK_NAME' updated." -ForegroundColor Green
}
else {
    Register-ScheduledTask `
        -TaskName  $TASK_NAME `
        -Action    $action `
        -Trigger   $trigger `
        -Settings  $settings `
        -Principal $principal `
        -Description "GFD local-sweep — updates local-sweep.json with drive/git/toolchain state." | Out-Null
    Write-Host "✅  Task '$TASK_NAME' registered." -ForegroundColor Green
}

# ── Verify ────────────────────────────────────────────────────────────────────
$task = Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "`n    Status : $($task.State)"
    Write-Host "    Next run: $((Get-ScheduledTaskInfo -TaskName $TASK_NAME).NextRunTime)"
    Write-Host "`n    To run now   : Start-ScheduledTask -TaskName '$TASK_NAME'"
    Write-Host "    To remove    : .\scripts\schedule-sweep.ps1 -Remove"
    Write-Host "    To view JSON : Get-Content Z:\GFD\local-sweep.json | ConvertFrom-Json`n"
}
else {
    Write-Warning "Task registration may have failed — verify in Task Scheduler."
}
