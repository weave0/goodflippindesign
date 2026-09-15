# TI work funnel (TI-009 → TI-010)

Traffic Intelligence is an **operational improvement engine**: meaningful findings become trackable GitHub work in `weave0/goodflippindesign`, and every action has a measured verification path back into insights.

TI-010 raises the acceptance bar: an operator opens TI, immediately sees highest-value work, executes it, and later sees **objective evidence** the intervention improved the estate. Live issues are the test corpus — **no synthetic success**.

## Contracts

| Artifact | Path | Contract |
| --- | --- | --- |
| Insights sidecar | `gold/traffic-insights-1.0.json` | `gfd-traffic-insights` |
| Work queue | `gold/ti-work-queue-1.0.json` | `gfd-ti-work-queue` / **`1.1.0`** |

Both Gold paths remain behind the admin wall. The work queue fails soft in the cockpit if missing.

Schema **1.1.0** adds additive `metrics` plus per-item `impact_score`, `impact_class`, `impact_rationale`, `root_cause_key`, `group_role`, `group_member_action_ids`.

## Live corpus audit (first sync)

| Issues | Finding | Remediation |
| --- | --- | --- |
| #284 | Estate source measurement gap (`action.brief._source.measurement`) | **Distinct** root cause — keep as standalone / `cloudflare.source-measurement-gap` |
| #285–#293 | Identical per-property “Cloudflare daily series has missing dates”, often **low** confidence, auto-created | **Noisy duplicates** of one root cause → consolidate under `cloudflare.daily-coverage-gap`; supersede per-property issues with pointer comments |
| #294 | healthy · traffic rose 79.9% | Opportunity auto-work is questionable as **repair** → prefer **recommend** (“review opportunity”) unless `ti-auto-opportunity=true` |

Plan was 67 items → 11 creates. Fix generation quality before expanding volume. Cap remains tight (`AUTO_CREATE_CAP_PER_RUN = 15`).

## Impact scoring

`traffic-intelligence/src/work/scoring.ts` — deterministic score from:

- priority_class, severity, confidence
- materiality magnitude (only when present; never invent zeros)
- persistence (7d / 28d)
- operator-property relevance
- measurement-only vs traffic/security/delivery impact

Outputs: `impact_score` (0–100), `impact_class` (`critical|high|medium|low|informational`), `rationale` string. Drives ranking and create priority.

## Eligibility (`auto` vs `recommend`) — TI-010

| Rule | Result |
| --- | --- |
| `priority_class` ∈ {`act_now`, `investigate`} AND (`brief.confidence === high` OR `priority_class === act_now`) | **auto** |
| `measurement_blocked` / `data_gap` + confidence **high** | **auto** (still consolidates when group ≥ 2) |
| `measurement_blocked` / `data_gap` + confidence low/medium | **recommend**, unless **consolidated primary** with groupSize ≥ 2 → **one** auto group issue |
| `healthy` / `watch` + opportunity/success | **recommend** by default (review opportunity, not repair). **auto** only if limitation `ti-auto-opportunity=true` AND high confidence AND material |
| Pure `healthy` with no opportunity/success signal | **recommend** |
| Everything else | **recommend** |

**Materiality threshold:** `|percent_delta| ≥ 0.1` **or** `|absolute_delta_requests| ≥ 1000` **or** `|absolute_delta_pageviews| ≥ 1000`.

## Root-cause consolidation

- `root_cause_key` from finding kind + normalized title/pattern + **source** (not property).
- Example: all `*.measurement` daily-coverage-gap → `cloudflare.daily-coverage-gap`.
- Sync creates/updates **one primary GitHub issue per group**; body lists member properties + child `action_id`s.
- Member `action_id`s remain in the work-queue pointing at the **same** `issue_number` with `group_role: primary|member`.
- Migration: next sync comments + closes duplicate per-property issues as **superseded** (`ti-superseded`), with pointer to primary — history preserved. Idempotent.

`action_id` identity and dedupe-by-`action_id` are preserved.

## Labels

- `ti-work` — all TI work items
- `ti-eligibility:auto` / `ti-eligibility:recommend`
- `ti-lifecycle:detected|triaged|accepted|in_progress|verify|resolved|dismissed|regressed`
- `ti-priority:<priority_class>`
- `ti-impact:<impact_class>`
- `ti-group:primary` — consolidated root-cause primary
- `ti-superseded` — duplicate closed in favor of consolidated issue
- Optional snooze: label or body marker `ti-snooze-until:YYYY-MM-DD`

## Authoritative bidirectional lifecycle

**GitHub labels are source of truth** for operator-set states (`dismissed`, snooze, `in_progress`, `accepted`, `triaged`).

Conflict rules:

1. GitHub `ti-lifecycle:*` label wins over machine-block lifecycle for operator states.
2. Sync is the **single writer** of queue lifecycle from GH labels + fresh measurements.
3. Cockpit deep-links (Promote/Dismiss/Snooze/Verify) round-trip via GitHub; queue refreshes on next sync.
4. `dismissed` never reopened; snooze skips until date passes.
5. Measurement-driven transitions use **current** insights (finding absence / materiality), never stale body alone / fabricated clearance.

## Evidence on updates

When sync updates an open issue, refresh **Evidence (closed-loop)**:

- **Before:** first detection / prior sync snapshot (materiality, missing_dates count, insights_generated_at, …)
- **Current:** latest values
- **Delta:** `improved` / `worsened` / `unchanged` / `unknown` (fail-closed; no fabricated zeros)

## Repair → verify → resolved

1. Operator sets `ti-lifecycle:verify` after a fix.
2. Sync uses **current** insights: if action/finding absent → comment cleared, stay/set `verify`.
3. Still clear next sync → `resolved` + close issue.
4. Still present after verify → comment **still failing** with current evidence.

## Regression / reopen

If a resolved/closed issue’s `action_id` or group root cause **returns** in new insights: reopen, lifecycle `regressed`, comment with new evidence, preserve `action_id`.

## Work-funnel metrics

Document `metrics` block:

- `planned`, `auto`, `recommend`, `open_issues`
- `by_lifecycle`, `by_impact_class`
- `creates_last_sync`, `updates_last_sync`, `closes_last_sync`
- `consolidated_groups`, `superseded_duplicates`

Overview surfaces a compact metrics strip plus ranked **What should we work on next?** (impact_score desc; members nested under primary).

## Machine block

Each issue body ends with `<!-- ti-work-machine … -->` including TI-010 keys: `root_cause_key`, `group_role`, `group_issue_number`, `impact_score`, `impact_class`, plus TI-009 keys.

## How sync runs

```bash
cd traffic-intelligence
GITHUB_TOKEN=… npm run sync:work -- \
  --insights path/to/traffic-insights.json \
  --out public/gold/ti-work-queue-1.0.json
```

Dry-run: `TI_WORK_DRY_RUN=1` or `--dry-run`.

## Cockpit buttons

| Button | Behavior |
| --- | --- |
| Open work item | Existing issue URL, or prefilled `issues/new` for recommend |
| Assign | Opens issue (assign in GitHub) |
| Dismiss | Opens issue; add `ti-lifecycle:dismissed` |
| Snooze | Opens issue; set `ti-snooze-until:YYYY-MM-DD` |
| Verify fix | Opens issue; set `ti-lifecycle:verify` — sync measures clearance with fresh insights |
| View evidence | Focuses property dossier / evidence refs |
| Promote to work | Prefills GitHub new-issue for recommendations |

Central queue remains `weave0/goodflippindesign`. Operator-property filter preserved (TI-008).
