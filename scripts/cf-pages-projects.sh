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
  # sed processes input line by line, so a literal newline in a hostile
  # message would let content past it dodge every rule below ("." never
  # matches "\n"). Flatten to a single line first so end-of-string
  # redaction really does mean the rest of the message, not just the
  # rest of the current line.
  text="${text//$'\n'/ }"
  text="${text//$'\r'/ }"
  # Structural patterns first (Authorization/Bearer/Cookie shapes), then a
  # literal mop-up for the actual token value wherever it appears outside
  # those shapes (e.g. reflected raw in an error message or URL).
  # Redact to end-of-string rather than stopping at a comma/quote/brace: a
  # comma-delimited or quoted scheme value (e.g. Digest's
  # username="...", response="...") would otherwise leave a suffix
  # unredacted. Over-redaction here is intentional and safe.
  text="$(sed -E '
    s/(authorization"?[[:space:]]*:[[:space:]]*"?).*/\1[REDACTED]/gI;
    s/bearer[[:space:]]+[A-Za-z0-9._~+/=-]+/Bearer [REDACTED]/gI;
    s/(cookie"?[[:space:]]*:[[:space:]]*"?).*/\1[REDACTED]/gI
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

  # `jq -r` stringifies JSON strings, so a naive `[ "$(jq -r '.success? // false')" != "true" ]`
  # would treat a hostile `.success: "true"` (a string) the same as the
  # boolean `true`, since both render as the text `true`. Compare the
  # actual JSON value's identity with `jq -e '.success == true'` instead
  # of comparing its rendered text, so only a genuine boolean true passes.
  if [[ "$http_code" != 2?? ]] || ! jq -e '.success == true' <<<"$body" >/dev/null 2>&1; then
    code="$(jq -r '.errors[0].code // "unknown"' <<<"$body" 2>/dev/null || echo unknown)"
    message="$(jq -r '.errors[0].message // "no error detail provided"' <<<"$body" 2>/dev/null || echo "no error detail provided")"
    echo "$(cf_redact "Pages project inventory request rejected on page $page: HTTP $http_code — Cloudflare error $code: $message")" >&2
    exit 1
  fi

  # `(.result_info // {})` treats an explicit JSON false/null result_info
  # the same as an absent key, silently swapping in {} and defaulting
  # every field — and a non-object result_info (e.g. a string or array)
  # makes has() itself raise a jq error, which the `2>/dev/null || echo`
  # fallback then *also* converts to a default. Either path lets a
  # malformed result_info be accepted as "absent" instead of failing
  # closed. Distinguish "result_info absent" (legitimately default) from
  # "result_info present but not an object" (must fail closed) before
  # ever looking at its fields.
  result_info_kind="$(jq -r '
    if has("result_info") then
      if (.result_info | type) == "object" then "object" else "invalid" end
    else "absent" end
  ' <<<"$body" 2>/dev/null || echo "invalid")"

  case "$result_info_kind" in
    absent)
      reported_page="" reported_page_present="false"
      reported_total_pages="1"
      ;;
    object)
      reported_page_present="$(jq -r '.result_info | has("page")' <<<"$body" 2>/dev/null || echo "false")"
      reported_page="$(jq -r '.result_info | if has("page") then (.page | tostring) else "" end' <<<"$body" 2>/dev/null || echo "")"
      # Same absent-vs-invalid distinction at the field level: a naive
      # `// 1` would treat an explicit false/null total_pages the same as
      # absent and skip validation entirely.
      reported_total_pages="$(jq -r '.result_info | if has("total_pages") then (.total_pages | tostring) else "1" end' <<<"$body" 2>/dev/null || echo "1")"
      ;;
    *)
      echo "Pages project inventory returned a non-object result_info on page $page" >&2
      exit 1
      ;;
  esac

  # A 2xx/success response is still an untrusted body: validate these are
  # plain non-negative integers before they ever reach an arithmetic or
  # `[ -eq/-le ]` context. Otherwise a hostile response that reflects a
  # credential into result_info would make bash's own "integer expression
  # expected" runtime error echo that value straight to stderr, bypassing
  # cf_redact entirely — so the failure message here deliberately does not
  # interpolate the offending raw value.
  if [ "$reported_page_present" = "true" ] && ! [[ "$reported_page" =~ ^[1-9][0-9]{0,6}$ ]]; then
    echo "Pages project inventory returned a non-positive-integer result_info.page on page $page" >&2
    exit 1
  fi
  if ! [[ "$reported_total_pages" =~ ^[1-9][0-9]{0,6}$ ]]; then
    # total_pages:0 alongside a page 1 response that has actual results is
    # self-contradictory (Cloudflare reports total_pages=1 even for an
    # empty result set); accepting it would silently truncate a real
    # multi-page inventory to just the first page.
    echo "Pages project inventory returned a non-positive-integer result_info.total_pages on page $page" >&2
    exit 1
  fi

  if [ "$reported_page_present" = "true" ] && [ "$reported_page" != "$page" ]; then
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
