# TI work funnel (TI-009)

Traffic Intelligence is an **operational improvement engine**: meaningful findings become trackable GitHub work in `weave0/goodflippindesign`, and every action has a measured verification path back into insights.

## Contracts

| Artifact | Path | Contract |
| --- | --- | --- |
| Insights sidecar | `gold/traffic-insights-1.0.json` | `gfd-traffic-insights` |
| Work queue | `gold/ti-work-queue-1.0.json` | `gfd-ti-work-queue` / `1.0.0` |

Both Gold paths remain behind the admin wall. The work queue fails soft in the cockpit if missing.

## Eligibility (`auto` vs `recommend`)

| Rule | Result |
| --- | --- |
| `priority_class` ∈ {`act_now`, `investigate`} AND (`brief.confidence === high` OR `priority_class === act_now`) | **auto** |
| Linked finding `kind === data_gap` AND (confidence high OR `priority_class === measurement_blocked`) | **auto** |
| `priority_class` ∈ {`healthy`, `watch`} AND finding kind ∈ {`opportunity`, `success`} AND confidence high AND **material** | **auto** |
| Everything else | **recommend** |
| Pure `healthy` with no opportunity/success signal | **recommend** (never auto) |

**Materiality threshold (opportunity path):** `|percent_delta| ≥ 0.1` **or** `|absolute_delta_requests| ≥ 1000` **or** `|absolute_delta_pageviews| ≥ 1000`.

Auto-creates are capped at **25 per sync run**, highest priority first.

## Labels

- `ti-work` — all TI work items
- `ti-eligibility:auto` / `ti-eligibility:recommend`
- `ti-lifecycle:detected|triaged|accepted|in_progress|verify|resolved|dismissed`
- `ti-priority:<priority_class>`
- Optional snooze: label or body marker `ti-snooze-until:YYYY-MM-DD`

## Lifecycle & verification

```
detected → triaged → accepted → in_progress → verify → resolved
                                                 ↘ dismissed
```

- Sync **creates/updates** evidence for `auto` items (deduped by stable `action_id` in the machine block).
- Operator-owned lifecycles (`triaged|accepted|in_progress`) are **not** reset to `detected`.
- `dismissed` is never reopened by sync.
- Snoozed items are skipped until the date passes.
- When the underlying action disappears from insights: comment **condition cleared**, set `verify`.
- On a subsequent clear run while already in `verify`: close as `resolved`.
- If still present after `verify`: comment **still failing verification**.

## Machine block

Each issue body ends with an HTML comment block `<!-- ti-work-machine … -->` containing stable keys for sync parse: `action_id`, `lifecycle`, `property_id`, `target_repo`, `insights_generated_at`, `verification_condition`, `snooze_until`, etc.

## How sync runs

```bash
cd traffic-intelligence
GITHUB_TOKEN=… npm run sync:work -- \
  --insights path/to/traffic-insights.json \
  --out public/gold/ti-work-queue-1.0.json
```

- **Deploy-time:** after live insights are validated, the deploy workflow runs sync and injects the queue into `public/gold/` before build.
- **Manual:** workflow_dispatch on `Traffic Intelligence - Work sync` (or the npm script above).
- **Daily cron:** 13:00 UTC — re-acquires producer insights (same pin pattern as deploy) and refreshes the queue / verification loop.

Dry-run: `TI_WORK_DRY_RUN=1` or `--dry-run` (no GitHub mutations).

## Cockpit buttons

| Button | Behavior |
| --- | --- |
| Open work item | Existing issue URL, or prefilled `issues/new` for recommend |
| Assign | Opens issue (assign in GitHub) |
| Dismiss | Opens issue; add `ti-lifecycle:dismissed` (recommend without issue: prefilled dismissed create) |
| Snooze | Opens issue; set `ti-snooze-until:YYYY-MM-DD` in machine block / label |
| Verify fix | Opens issue; set `ti-lifecycle:verify` — sync measures clearance |
| View evidence | Focuses property dossier / evidence refs |
| Promote to work | Prefills GitHub new-issue for recommendations |

Metadata `property_id` + `target_repo` (default `weave0/goodflippindesign`) is preserved for later routing. v1 does **not** fan out to other repos.
