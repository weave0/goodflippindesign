# TI-012 — estate deployment/config evidence (operator runbook)

Built by `scripts/cf-estate-config.mjs` inside the production workflow
(`Acquire bounded Cloudflare estate configuration evidence`), consumed by the
private producer (`gfd-traffic-intelligence`, see its `docs/ESTATE_CONFIG.md`).

## Authority separation

| Fact | Authority | Credential |
| --- | --- | --- |
| Zone list, zone status, DNS | `analytics_credential` | `CF_GFD_TI_ANALYTICS_TOKEN` (intentionally least-privilege) |
| Pages project configuration | `deploy_credential` | `CF_GFD_TI_DEPLOY_TOKEN` via `scripts/cf-pages-projects.sh` |

The analytics credential *intentionally* cannot read Pages configuration. That is
not a defect and produces no finding. The cockpit shows which authority proved
which fact (`Deployment & config authority`, and the property dossier).

## What the run guarantees

1. The Pages inventory is complete (`page` pagination only — never `per_page`, which
   Cloudflare rejects with HTTP 400) or the run fails.
2. Every zone in `CF_EXPECTED_ZONES` is in the artifact exactly once, and each of
   `zone`, `dns`, `pages` is `observed`, `no_project` (a *positive* negative from the
   complete Pages inventory) or `unavailable` **with an explicit reason**.
3. A silently absent zone, an ungoverned/duplicate property, an incomplete inventory,
   or an evidence class unavailable for *every* zone (systemic failure) is a hard
   failure — the artifact is not even written.
4. The producer re-validates the same reconciliation and the workflow re-asserts it
   against the insight sidecar (`estate_config`) before anything is deployed.

Each run writes a per-zone accounting table to the job summary and uploads the
artifact `estate-config-accounting` (14 days).

## Reading a failure

Every rejected Cloudflare request reports the logical operation, HTTP status,
Cloudflare's own error code/message and the endpoint class — never a bare curl error:

```
zone-list request rejected: HTTP 403 — Cloudflare error 10000: Authentication error (endpoint class: zones)
dns-records:example.com request rejected: HTTP 429 — Cloudflare error 971: … (endpoint class: zones/dns_records)
zone-list pagination became inconsistent: total_pages changed from 3 to 2 while reading page 2 (endpoint class: zones)
```

Credentials, `Authorization`/`Cookie` values, other token-shaped strings and control
characters are redacted from anything echoed; unexpected runtime errors are reduced
to their class name. 429/5xx and network errors are retried (bounded) before failing.
One zone's unreadable DNS is recorded as explicit `unavailable` evidence for that zone
(a `::warning::`); it does not hide the rest of the estate.

## Local checks

```
node --test scripts/cf-estate-config.test.mjs
node --test scripts/cf-pages-projects.test.mjs   # spawns a bash script: run on Linux/macOS
```
