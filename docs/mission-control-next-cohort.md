# Property readiness after the AIAIMate loop (MC-CONFLUENCE-002 §7)

Facts only, from `scripts/estate-property-readiness-report.mjs` (machine-readable:
`docs/evidence/estate-property-readiness-2026-10-01.json`, generated with `--fwomps-home ~/.fwomps`). Nothing here promotes a
property; the promotion gate (`scripts/property-promotion-gate.mjs`) remains the only authority.

## Where the 25 stand

| prerequisite                                              | properties |
| --------------------------------------------------------- | ---------: |
| governed in the estate registry                           |         25 |
| canonical repository known                                |          8 |
| canonical production URL established (live)               |          6 |
| health evidence producer (health target)                  |          8 |
| machine-health contract (`gfd-property-health`)           |          1 |
| verification profile + scope + predicate declared         |          1 |
| registered on the FWOMPS host                             |          1 |
| **dispatch-ready (gate promotable + host verified)**      |      **1** (`aiaimate.com`) |

Per-property rows (all ten requested facts plus `blockers`) are in the JSON. 17 properties are `unclassified` with no repository
authority, no health target and no deployment provider: they are not candidates until someone declares those facts.

## Next cohort (4)

Rule: governed + live + repository known + health evidence already present + not dispatch-ready, fewest missing prerequisites
first, ties by property id. All four miss the same four things, so the choice among equals is alphabetical; `goodflippinvibes.com`
(also live, repo, health target) is the next candidate and is listed under `excludedCandidates`.

| property | repository | health targets | missing |
| --- | --- | --- | --- |
| `citizenapproved.org` | `weave0/CitizenApproved` | 1 | machine-health contract, verification declaration, reviewed read-only profile, host registration |
| `culturesherpa.org` | `weave0/CultureSherpa` | 1 | same |
| `globaldeets.com` | `weave0/globaldeets` | 1 | same |
| `goodflippindesign.com` | `weave0/goodflippindesign` | 8 | same |

Minimum work per property (one small PR each, plus one operator host step):

1. **Machine-health contract**: the property's health route emits `gfd-property-health` for its canonical `propertyId`, and its
   health target in `config/health-targets.json` declares `machineContract` (the AIAIMate pattern, `weave0/aiaimate#93`).
2. **Verification declaration** in `estate/registry.json` `operating`: `investigation_profile`, `verification_profile`,
   `verification_scope`, `verification_predicate` (the registry validator and C2/C10 enforce the shape).
3. **Reviewed read-only profile**: a profile pinned in this repository (like `web-health-readonly-v1`, whose check is specific to
   AIAIMate's health route) with one fixed read-only argv per property; the host-binding script is generalised or copied, never
   the AIAIMate profile reused for another repository.
4. **Host registration** (operator): clean clone as a workspace, `--apply`, then `property-promotion-gate.mjs --property <id>
   --fwomps-home <home>` must show C3/C4 PASS.

Do the cohort one property at a time; the gate, not this list, says when each is dispatch-ready.
