#!/usr/bin/env bash
# production-guard.sh — PreToolUse hook (Linux/macOS fallback)
set -euo pipefail

raw=$(cat)
if [ -z "$raw" ]; then echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'; exit 0; fi

tool=$(echo "$raw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null || true)
cmd=$(echo  "$raw" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('command',''))" 2>/dev/null || true)

allow='{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow"}}'

[ "$tool" != "run_in_terminal" ] && echo "$allow" && exit 0

# D1 remote write
if echo "$cmd" | grep -qE 'wrangler\s+d1\s+execute.+--remote'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"D1 remote write detected. Modifies PRODUCTION database. Test locally first."}}'
  exit 0
fi

# Force push
if echo "$cmd" | grep -qE 'git\s+push.+(-f|--force)\b' && ! echo "$cmd" | grep -q 'force-with-lease'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"Force push detected. This overwrites remote history."}}'
  exit 0
fi

echo "$allow"
