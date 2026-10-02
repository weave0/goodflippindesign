# Property promotion gate

**Goal:** any estate property can be promoted from registry-only to dispatch-ready through one governed,
evidence-producing process, instead of a hand-edit that we hope is complete (AIAIMate was promoted by hand once;
this makes it repeatable).

The gate is a **report command**, not a state machine. It reuses what already exists: the estate operating-readiness
analyzer (debt codes), the canonical `VERIFICATION_SCOPES`, `resolveEstateBinding` / `qualifyFromRegistry`, and the
real Mission Control API, outbox, work-item store and result bridge exercised against an **in-memory D1** that is
created for the run and discarded. It never edits the registry, never touches production, never writes to an FWOMPS
host (the host config is only *read*, and only with `--fwomps-home`), and never grants repair/write authority: the
probes issue a read-only contract and accept an authenticated read-only result, nothing more.

```bash
node --no-warnings scripts/property-promotion-gate.mjs                          # every governed property
node --no-warnings scripts/property-promotion-gate.mjs --property aiaimate.com  # one property, per-check detail
node --no-warnings scripts/property-promotion-gate.mjs --fwomps-home ~/.fwomps  # also READ the FWOMPS host config
node --no-warnings scripts/property-promotion-gate.mjs --json out.json          # machine-readable report + inventory
node --no-warnings scripts/property-promotion-gate.mjs --require <property-id>  # exit 1 unless promotable
```

## The ten checks

| id | check | how it is decided |
|---|---|---|
| C1 | registry binding valid | governed; canonical repository authority; no registry/`brands.json` drift |
| C2 | verification scope/predicate valid | all four closed-loop declarations present; scope in the canonical set; predicate non-empty |
| C3 | FWOMPS investigation profile known | declared and well-formed → `PENDING_OPERATOR` (registration is host-owned); `PASS`/`FAIL` when `--fwomps-home` verifies it |
| C4 | host/workspace binding | explicitly `PENDING_OPERATOR`; with `--fwomps-home`: enabled, bound to the same profile and repository, workspace registered and present |
| C5 | canonical target derivable | `fwomps:<propertyId>` from a canonical lowercase hostname equal to the domain |
| C6 | signed contract issuable | **real path**: observation → qualify from the registry → signed read-only contract |
| C7 | durable dispatch intent plannable | **real outbox**: `investigation_dispatch` bound to the exact contract digest |
| C8 | lease-authority invariant | **real API + store**: a lease is *refused* without an intent (`dispatch_intent_required`) and *issued* under the claimed one |
| C9 | read-only executor/result bridge compatible | **real bridge**: an authenticated read-only result is accepted, the same item is `DIAGNOSED`, lease released, no repair/deploy authority recorded |
| C10 | verification path declared | verification profile + a governed health target + a versioned machine-health contract (so re-observation can be deterministic) |

Statuses: `PASS`, `FAIL`, `PENDING_OPERATOR` (explicitly an operator action, not a defect), `BLOCKED` (a check it
depends on failed; shown, never guessed).

**GFD-side promotable** = no `FAIL`/`BLOCKED`; `PENDING_OPERATOR` host steps are allowed and *named*. **Host verified**
= C3 and C4 both `PASS` from a real `--fwomps-home`. A registry the probes did not exercise is never promotable.

The probes run the **committed** registry through the real code, so the gate answers for what would actually run.
Because C8 checks both the refusal and the success path, a tree without the lease invariant fails C8 (proven by a
system-level mutation in the gate's tests).

## Promoting a property (the repeatable process)

1. **Registry PR** declares the four fields (`investigation_profile`, `verification_profile`, `verification_scope`,
   `verification_predicate`) for that property only, using real, existing semantics (never inferred generics).
2. **Gate in the PR**: `property-promotion-gate.mjs --require <id>` must exit 0 (C1, C2, C5, C6–C10 `PASS`; C3/C4
   `PENDING_OPERATOR`). A failing check names exactly what is missing.
3. **Operator** registers the host binding (host-owned, below), then re-runs with `--fwomps-home` until C3 and C4 are
   `PASS`.
4. **Operator specimen** (`tests/acceptance/mc-confluence-specimen.mjs`) for that property, evidence recorded.
5. Only then is the property counted as dispatch-ready in operations.

## Baseline (2026-09-30, main `7be8a1f`, plus #375/#376 invariants): 1 of 25

Promotable: **`aiaimate.com`** (C1, C2, C5, C6, C7, C8, C9, C10 `PASS`; C3 and C4 `PENDING_OPERATOR`, the real host has no AIAIMate binding).

The other **24 are not promotable**. Universal gap (all 24): none declares an investigation profile, verification
profile, scope or predicate (C2/C3 `FAIL`), so none can qualify (C6 `FAIL`) and C7–C9 are `BLOCKED`. Beyond that,
grouped by what is actually missing:

| missing prerequisite | count | properties (`*` = unclassified) |
|---|---|---|
| nothing beyond the four declarations | 0 | (none: every one of the 24 also lacks repository authority or a machine-health contract) |
| health target lacks a versioned machine-health contract | 5 | citizenapproved.org, culturesherpa.org, globaldeets.com, goodflippindesign.com, goodflippinvibes.com |
| no governed health target | 2 | goodflippinluck.com, goodflippinnews.com |
| no repository authority **and** health target lacks a machine contract | 1 | minnesotapeace.com* |
| no repository authority **and** no health target | 16 | agentkagent.com*, artificelligance.com*, artificelligence.com*, brettleeweaver.com*, culturesherpa.com*, cyancanoe.com*, flipskillet.com*, flipskillit.com*, foxyana.com*, fwomps.com*, fwomp.us*, gflippinv.com*, goodflippinyikes.com*, heavymoose.com*, lowertownstpaul.org*, redleopardofstpaul.com* |

Root causes in the readiness analyzer's own vocabulary: `missing_investigation_profile` 24, `missing_verification_profile` 24,
`missing_verification_scope` 24, `missing_verification_predicate` 24, `missing_deployment_provider` 21, `missing_health_target` 18,
`unclassified_property` 17, `missing_repository_authority` 17, `missing_machine_health_contract` 6.

The shortest paths to a second promotable property are the **5 that already have a repository and a health target but no
machine-health contract**: each needs a versioned `/api/health` machine contract on the property, then the four declarations.
This inventory is read-only analysis; nothing was promoted.

## Applying the real AIAIMate host binding (operator sequence)

**Status (2026-10-01): applied on the operator's FWOMPS host** — evidence in `docs/evidence/mc-aiaimate-host-binding-2026-10-01.json`
(additive config diff only, 0 removed/changed keys, prior config kept as `config.json.bak-20261001-155335`, one fixed read-only
profile command, only `aiaimate.com` bound). `--verify` is 14/15: the single failure is the delivery bearer
(`GFD_MC_WORKER_TOKEN`) not being present in the verifying shell because production has not been provisioned with the shared
keys/worker token yet. The promotion gate against the real home reports C1–C10 PASS, `promotable=true`, `hostVerified=true`.
Registered worker id `fwomps-host-weave0-01`; key ids `gfd-mc-contract-2026-10` / `gfd-mc-result-2026-10`. Production must be given
the SAME two secrets (and a worker bearer) before any production round trip; that is a separate, deliberate step.

Host-owned and not applied by anyone but the operator. Tool: `scripts/fwomps-aiaimate-host-binding.py` (read-only by
default). Secrets are only ever passed as environment variables and are never printed.

```bash
# 0. a dedicated CLEAN clone (FWOMPS verifies a clean tree at the contract's evidence revision)
git clone https://github.com/weave0/aiaimate.git <workspace-root>

# 1. PLAN (read-only). Shows what would change, key ids already enrolled, which env vars are still missing.
FWOMPS_REPO=<fwomps checkout> python scripts/fwomps-aiaimate-host-binding.py \
  --workspace-root <workspace-root> --result-origin https://<gfd origin> --worker-id <MISSION_CONTROL_RESULT_WORKER_ID>

# 2. Environment variables required for --apply (set in THIS shell only; values must equal GFD's own secrets):
#    FWOMPS_MC_CONTRACT_KEY_ID  FWOMPS_MC_CONTRACT_KEY_HEX   == MISSION_CONTROL_CONTRACT_KEY_ID / MISSION_CONTROL_CONTRACT_KEY (64 hex)
#    FWOMPS_MC_WORKER_KEY_ID    FWOMPS_MC_WORKER_KEY_HEX     == MISSION_CONTROL_RESULT_KEY_ID   / MISSION_CONTROL_RESULT_KEY   (64 hex)
#    GFD_MC_WORKER_TOKEN        (the delivery bearer; only its NAME is stored in the config)

# 3. APPLY: same arguments plus --apply. Backs up config.json first and prints the backup path.

# 4. VERIFY (read-only), two independent views:
FWOMPS_REPO=<fwomps checkout> python scripts/fwomps-aiaimate-host-binding.py <same args> --revision <evidence revision> --verify
node --no-warnings scripts/property-promotion-gate.mjs --property aiaimate.com --fwomps-home <FWOMPS home>
#    expected: C3 and C4 move from PENDING_OPERATOR to PASS, hostVerified=true
```

**Rollback / recovery** (nothing runs automatically; FWOMPS only acts when invoked with a signed contract + lease):
1. `config.json` is backed up as `config.json.bak-<timestamp>` before any write. Restore it:
   `cp <home>/config.json.bak-<timestamp> <home>/config.json`. That removes the workspace, binding, profile and Mission Control block.
2. Remove **only** the key files the tool reported as `enrolled` (not "already enrolled"):
   `<home>/mission-control/contract-keys/<id>.json` and `<home>/mission-control/worker-keys/<id>.json`.
3. The workspace clone is separate and can simply be deleted; unset the shell variables.
4. Confirm the host is back to its prior state: `node scripts/property-promotion-gate.mjs --property aiaimate.com --fwomps-home <home>`
   must show C3/C4 `FAIL` (not bound), and `fwomps workspace list` must no longer list `aiaimate`.
5. The tool refuses (exit 2) rather than overwrite any conflicting workspace, binding, profile or Mission Control block, so a
   half-applied state cannot arise from a conflict; if a run is interrupted, re-running `--apply` is idempotent.

## What this does not claim

CI proves C1–C10 for the committed registry (the probes use an in-memory D1 and the pinned wire format; the FWOMPS side of
C9 is the GFD bridge's acceptance of a correctly signed read-only result, not the real FWOMPS binary). Whether real FWOMPS
executes a property's profile in its attested sandbox is **operator-specimen** territory (C3/C4 and step 4 above). No real
production incident has been dogfooded.
