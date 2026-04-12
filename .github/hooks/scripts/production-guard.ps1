#!/usr/bin/env pwsh
# production-guard.ps1 — PreToolUse hook for GFD workspace
# Guards against production-affecting commands that are hard to reverse.
#
# Reads JSON from stdin (tool_name + tool_input.command).
# Returns hookSpecificOutput JSON to stdout.
# Exit 0 always — non-zero exit aborts the tool call entirely.

param()

function Out-HookDecision {
    param (
        [string]$Decision,   # "ask" | "allow" | "deny"
        [string]$Reason = ""
    )
    $output = @{ hookSpecificOutput = @{ hookEventName = "PreToolUse"; permissionDecision = $Decision } }
    if ($Reason) { $output.hookSpecificOutput.permissionDecisionReason = $Reason }
    $output | ConvertTo-Json -Compress -Depth 4
    exit 0
}

# Read stdin
$rawInput = [Console]::In.ReadToEnd()
if (-not $rawInput) { Out-HookDecision "allow" }

$data = $rawInput | ConvertFrom-Json -ErrorAction SilentlyContinue
if (-not $data) { Out-HookDecision "allow" }

$toolName = [string]($data.tool_name)
$command = [string]($data.tool_input.command)

# Only intercept terminal commands
if ($toolName -ne "run_in_terminal") { Out-HookDecision "allow" }

# ── Guard rules (ordered most-specific first) ───────────────────────────────

# 1. D1 remote execute — can corrupt production schema/data
if ($command -match 'wrangler\s+d1\s+execute\b.+--remote') {
    Out-HookDecision "ask" "⚠️  D1 remote write detected. This modifies the PRODUCTION gfd_community database. Confirm you have tested this migration locally first with --local."
}

# 2. Git force push — overwrites remote history
if ($command -match 'git\s+push\b.*(--force|-f)\b' -and $command -notmatch '--force-with-lease') {
    Out-HookDecision "ask" "⚠️  Force push detected. This will overwrite remote history on the target branch. Use --force-with-lease if you must force push."
}

# 3. wrangler pages project delete / worker delete
if ($command -match 'wrangler\s+(pages|workers?)\s+delete\b') {
    Out-HookDecision "ask" "⚠️  This deletes a Cloudflare Pages project or Worker from production. Confirm this is intentional."
}

# 4. Remove entire directory trees that look like source code
if ($command -match '\brm\s.*-[rRf]{2,}') {
    Out-HookDecision "ask" "⚠️  Recursive delete detected. Confirm the target path before proceeding."
}

# All other commands — allow
Out-HookDecision "allow"
