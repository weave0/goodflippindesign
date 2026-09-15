# TI-010 live corpus audit (#284–#294)

First production sync after TI-009 created ~11 `ti-work` issues from 67 planned actions.

## Inventory

| # | Title (abbrev) | Priority | Confidence | Verdict |
| --- | --- | --- | --- | --- |
| 284 | estate — source measurement gap: Cloudflare source evidence unavailable | measurement_blocked | (per body) | **Real, distinct** — estate/source gap, not per-property daily coverage |
| 285 | agentkagent.com — Cloudflare daily series has missing dates | measurement_blocked | low | Duplicate of root cause `cloudflare.daily-coverage-gap` |
| 286 | artificelligance.com — same | measurement_blocked | low | Duplicate |
| 287 | artificelligence.com — same | measurement_blocked | low | Duplicate |
| 288 | culturesherpa.org — same | measurement_blocked | low | Duplicate |
| 289 | cyancanoe.com — same | measurement_blocked | low | Duplicate |
| 290 | flipskillet.com — same | measurement_blocked | low | Duplicate |
| 291 | flipskillit.com — same | measurement_blocked | low | Duplicate |
| 292 | fwomp.us — same | measurement_blocked | low | Duplicate |
| 293 | fwomps.com — same | measurement_blocked | low | Duplicate |
| 294 | redleopardofstpaul.com traffic rose 79.9% (28d) | healthy | (high path) | Opportunity auto-work; prefer **recommend** as review, not repair |

## Root cause

Issues #285–#293 share finding pattern `*.daily-coverage-gap` / title “Cloudflare daily series has missing dates”. Auto-creating one issue per property with **low** confidence flooded the queue and obscured higher-value work.

## Remediation (TI-010)

1. **Scoring** ranks traffic/security/act_now above low-confidence measurement noise.
2. **Consolidation** groups #285–#293 under one primary issue (`cloudflare.daily-coverage-gap`); member `action_id`s retained.
3. **Supersede migration** (idempotent): comment + `ti-superseded` + close duplicates with pointer to primary.
4. **Eligibility**: low-confidence measurement_blocked → recommend unless consolidated primary auto (one issue).
5. **Healthy rises** (#294 class) → recommend unless explicitly flagged `ti-auto-opportunity=true`.
6. **Evidence / verify / reopen** close the loop with fresh measurements — no synthetic success.

## Manual verification (post-merge sync)

1. Run `npm run sync:work` against live insights (or dry-run first).
2. Confirm one open consolidated issue for daily-coverage-gap; #285–#293 commented/closed superseded.
3. Confirm #284 remains distinct.
4. Confirm #294-class healthy items are `recommend` unless flagged.
5. Open TI Overview: metrics strip + ranked “What should we work on next?” show impact-ordered actionable work.
6. Exercise Verify on a real fix; confirm next sync uses fresh insights for clearance → resolved.
