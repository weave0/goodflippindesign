#!/usr/bin/env bash
# Fetches every Cloudflare Pages project for an account, aggregating every
# page before printing a result. The Pages project-list endpoint rejects
# per_page as an unsupported parameter (HTTP 400 in production run
# #35319182163); it only supports `page`, reporting result_info.total_pages
# the same way the account's zone-list pagination already does in this
# workflow. Consuming only the unpaginated default first page would silently
# produce an incomplete estate artifact, so this script fails closed instead
# of returning a partial inventory.
#
# Required env: CF_ACCOUNT_ID, CLOUDFLARE_API_TOKEN
# Optional env: CF_API_BASE (default https://api.cloudflare.com/client/v4)
#
# Prints {"success":true,"result":[...]} with every project from every page
# on stdout. Prints a diagnostic to stderr and exits non-zero on any
# rejected request or inconsistent pagination, without printing partial
# results.
set -euo pipefail

: "${CF_ACCOUNT_ID:?CF_ACCOUNT_ID is required}"
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is required}"
CF_API_BASE="${CF_API_BASE:-https://api.cloudflare.com/client/v4}"

# Diagnostics must never become a secret-exfiltration path: scrub the token
# value itself plus any Authorization/Bearer/Cookie-shaped text from a
# message before it is ever echoed, in case a hostile or malformed
# Cloudflare response reflects request headers back in an error body.
cf_redact() {
  local text="$1"
  # Structural patterns first (Authorization/Bearer/Cookie shapes), then a
  # literal mop-up for the actual token value wherever it appears outside
  # those shapes (e.g. reflected raw in an error message or URL).
  text="$(sed -E '
    s/([Aa]uthorization"?[[:space:]]*:[[:space:]]*"?)[^",}]*/\1[REDACTED]/g;
    s/[Bb]earer[[:space:]]+[A-Za-z0-9_.\-]+/Bearer [REDACTED]/g;
    s/([Cc]ookie"?[[:space:]]*:[[:space:]]*"?)[^",}]*/\1[REDACTED]/g
  ' <<<"$text")"
  text="${text//$CLOUDFLARE_API_TOKEN/[REDACTED]}"
  printf '%s' "$text"
}

pages_dir="$(mktemp -d)"
trap 'rm -rf "$pages_dir"' EXIT

page=1
total_pages=1
while [ "$page" -le "$total_pages" ]; do
  url="$CF_API_BASE/accounts/$CF_ACCOUNT_ID/pages/projects?page=$page"
  if ! response="$(curl -sS -w '\n%{http_code}' "$url" -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN")"; then
    echo "Pages project inventory request failed on page $page: unable to reach Cloudflare API (endpoint class: pages/projects)" >&2
    exit 1
  fi
  http_code="${response##*$'\n'}"
  body="${response%$'\n'*}"

  if [[ "$http_code" != 2?? ]] || [ "$(jq -r '.success? // false' <<<"$body" 2>/dev/null || echo false)" != "true" ]; then
    code="$(jq -r '.errors[0].code // "unknown"' <<<"$body" 2>/dev/null || echo unknown)"
    message="$(jq -r '.errors[0].message // "no error detail provided"' <<<"$body" 2>/dev/null || echo "no error detail provided")"
    echo "$(cf_redact "Pages project inventory request rejected on page $page: HTTP $http_code — Cloudflare error $code: $message")" >&2
    exit 1
  fi

  reported_page="$(jq -r '.result_info.page // empty' <<<"$body")"
  reported_total_pages="$(jq -r '.result_info.total_pages // 1' <<<"$body")"

  if [ -n "$reported_page" ] && [ "$reported_page" != "$page" ]; then
    echo "Pages project inventory page mismatch: requested page $page, Cloudflare reported page $reported_page" >&2
    exit 1
  fi

  if [ "$page" -eq 1 ]; then
    total_pages="$reported_total_pages"
  elif [ "$reported_total_pages" != "$total_pages" ]; then
    echo "Pages project inventory pagination became inconsistent: total_pages changed from $total_pages to $reported_total_pages while reading page $page" >&2
    exit 1
  fi

  if ! jq -e '.result | type == "array"' <<<"$body" >/dev/null 2>&1; then
    echo "Pages project inventory page $page did not contain a result array" >&2
    exit 1
  fi

  jq -c '.result' <<<"$body" > "$pages_dir/page-$(printf '%04d' "$page").json"
  page=$((page + 1))
done

projects="$(jq -s 'add' "$pages_dir"/page-*.json)"

project_count="$(jq 'length' <<<"$projects")"
unique_count="$(jq '[.[].id] | unique | length' <<<"$projects")"
if [ "$project_count" != "$unique_count" ]; then
  echo "Pages project inventory contained duplicate project ids across pages" >&2
  exit 1
fi

jq -c '{success:true, result:.}' <<<"$projects"
