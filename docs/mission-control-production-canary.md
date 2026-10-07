# Production canary runbook (MC-CONFLUENCE-002)

One bounded Mission Control → FWOMPS → Mission Control read-only investigation against **production**, for `aiaimate.com` only.
A canary, not an activation. Every gate must be green before the next step; a failed gate is repaired, never weakened.

## Gates, in order

1. **Merged, reviewed code.** #385 → #386 → #387 → #390 (this seam), plus #379 (release stamp + P0–P11 preflight) and #388/#389, are on `main`
   through the required review. FWOMPS evidence must cite a merged FWOMPS revision (`96832d1` or later; host checkout updated or a clean
   worktree of it used — see the provenance note in `docs/mission-control-confluence-gate.md`).
2. **Re-run the acceptance baseline from merged revisions** (fresh clone): `test:workers:mission-control-core`, `test:workers:mission-control`,
   `property-promotion-gate.test.mjs`, estate validation, real-host Tier 2 (`--real-home`), `mc-canary-selftest.mjs`.
   Known unrelated red, reported separately: `tests/workers/auth.test.js` blog M2M (2 tests, 401) on `main`.
3. **Start from a disabled canary and deploy the exact merged `main` revision.** If `MISSION_CONTROL_CANARY` exists, remove it with
   `mc-production-provision.mjs --disable-canary --apply`, then deploy. The runner must have zero usable authority at this point.
4. **Provision production credentials** (plan first). First-time runner creation writes the same freshly generated value to the local
   `GFD_MC_CANARY_RUNNER_TOKEN` and the Pages secret. If the remote runner secret already exists, the plan refuses to guess that the opaque
   remote value still matches the local token; deliberately rotate/re-pair it instead.
   ```bash
   node --no-warnings scripts/mc-production-provision.mjs --fwomps-home ~/.fwomps
   node --no-warnings scripts/mc-production-provision.mjs --fwomps-home ~/.fwomps --apply
   # Existing opaque runner secret: deliberately re-pair rather than assume equality
   node --no-warnings scripts/mc-production-provision.mjs --rotate-canary-runner --apply
   ```
   Prior state (secret names only) is saved under `~/.fwomps/provisioning/`; `--rollback <state.json> --apply` deletes only what that run created.
5. **Redeploy the same merged revision with the canary still OFF.** Prove the valid runner token receives the private `canary_disabled` 404
   and cannot create/mutate/read canary state. A valid credential with a disabled kill switch is the required negative control.
   Redeploy with the pinned retry (it rebuilds the *same commit* of the current production deployment against the current Pages secrets,
   and refuses if that deployment is not `<sha>`; it never builds branch HEAD or local files):
   ```bash
   gh workflow run mc-pages-redeploy.yml -f expected_sha=<sha> -f apply=true      # uses the CLOUDFLARE_API_TOKEN repo secret
   # or locally, with a Pages-write CLOUDFLARE_API_TOKEN in the environment (omit --apply for a read-only plan):
   node --no-warnings scripts/mc-pages-redeploy.mjs --expected-sha <sha> --apply
   ```
   Then run the OFF proof (it writes nothing to production: no probe can create, change, lease or dispatch canary state even if the canary were on; exit 0 only for `OFF_PROVEN`):
   ```bash
   node --no-warnings scripts/mc-production-off-proof.mjs --label initial --expected-sha <sha> \
     --out docs/evidence/mc-canary-off-proof-initial-<date>.json
   ```
   It sends the valid `GFD_MC_CANARY_RUNNER_TOKEN` to all 8 runner-reachable routes and 8 forbidden routes (each must be exactly the
   `canary_disabled` 404), plus two controls (no credential / a forged runner-shaped credential must be 401), and binds the result to the
   production deployment of `<sha>` before and after. `--control-plane wrangler` (recommended; no extra credential) reads the Pages project
   through your existing Wrangler login (`wrangler auth token`, GET only) with the same exact checks (full SHA + stage) as `api`
   (`CLOUDFLARE_API_TOKEN`); `wrangler-list` is the weaker 7-character, no-stage fallback and must be chosen explicitly.
6. **Enable exactly the one canary and redeploy** (same pinned retry as step 5): `mc-production-provision.mjs --enable-canary --apply`; no other property/value is valid.
7. **Preflight** (#379): `node --no-warnings scripts/mc-production-preflight.mjs --expected-sha <merged sha> --expected-worker-id fwomps-host-weave0-01 --fwomps-home ~/.fwomps --control-plane wrangler --json <out>`
   — P0–P11 all green, release stamp equals the merged sha, all seven bindings are present, credential bindings are `secret_text`, key ids/worker id agree, public routes expose nothing, and no repair/deploy/write authority exists.
   Credentials: P1/P2 read the Cloudflare control plane with `--control-plane wrangler` (your Wrangler login; GET only, same exact checks as the
   default `env` = `CLOUDFLARE_API_TOKEN`). P3–P11 consume ONE observation-level read, `GET /api/mission-control/provenance`, which is on the
   canary-runner's accepted surface and returns the same report the human admin gets, so `--probe-identity auto` (default) uses
   `GFD_MC_CANARY_RUNNER_TOKEN`; no Clerk/operator bearer is needed. The identity used is recorded in the evidence. The runner is inert while the
   canary is OFF, so the preflight runs after step 6 (with the canary off P3 says so and P4–P11 are BLOCKED, never passed).
8. **Run the canary once.** The canary item is single-attempt (one lease per signed contract) and only a human admin can expire an abandoned lease,
   so the driver proves what previously spent it **before any production write**: (a) the FWOMPS host's *real* delivery transport reaches the
   Worker, using a credential-less probe (`scripts/mc-production-delivery-path-probe.mjs`, also runnable on its own, with the canary OFF) — the first
   production delivery was blocked at the Cloudflare edge (`403 error code: 1010`, Python's default `urllib` signature) and surfaced as
   `delivery_refused_auth`; FWOMPS must be a revision that sends its fixed `User-Agent`; and (b) the existing canary item, if any, is in a state the
   bounded runner can advance (otherwise the run refuses with the exact reason). Windows Sandbox is single-instance: run nothing else that uses it
   (FWOMPS tests, another specimen) while the specimen executes. `FWOMPS_REPO` must be a clean worktree of merged FWOMPS `origin/main`.
   If an earlier cycle left the canary item DIAGNOSED (e.g. the first specimen: the host's delivery was edge-blocked, then the driver's own byte-identical
   redelivery was accepted), pass `--close-previous`: the runner posts the one healthy observation the lifecycle defines to take it to RESOLVED, and a fresh
   degraded observation reopens it as RECURRENT for a clean cycle whose result the HOST delivers. The earlier diagnosis stays in the event ledger and is
   recorded in the evidence (`previousCycle`). No admin authority is involved; any other non-runnable state is refused before any write.
   ```bash
   GFD_MC_CANARY_RUNNER_TOKEN=<runner bearer> GFD_MC_WORKER_TOKEN=<delivery bearer> FWOMPS_REPO=<merged fwomps> PYTHON=<python> \
   node --no-warnings --import ./tests/acceptance/node-json-hook.mjs scripts/mc-production-canary.mjs \
     --fwomps-home ~/.fwomps --out docs/evidence/mc-production-canary-<date>.json --preflight <preflight.json> --tests "core=72/72" --tests "governed=207/207" --tests "certification=15/15"
   ```
9. **Switch the canary off:** `mc-production-provision.mjs --disable-canary --apply` and redeploy (`mc-pages-redeploy.yml`, step 5). Re-run the negative control
   with the same runner credential (`mc-production-off-proof.mjs --label final ...`) and require `OFF_PROVEN`; then secret-scan the evidence
   (the OFF-proof tool refuses to write evidence containing a credential-shaped value) before closing the production proof. Do not enable another
   property or any write behaviour.

## What the canary does (and does not)

Operator-asserted `mc-canary` observation (the only synthetic input; labelled as such in the journal) → qualify from the governed registry →
production signs a read-only contract → admin `dispatch` plans + claims one durable intent → the worker route mints one signed lease →
the host's fixed registered profile runs in the attested sandbox → the host delivers its own signed result to the registered production
origin → production verifies, projects and DIAGNOSES the same item → replay/tamper/stale/conflict probes against the real origin →
a strictly newer healthy canary observation reverifies it (also operator-asserted).

No substituted receiver (the driver refuses unless the host's configured delivery origin equals the origin under test), no repair/deploy
command or credential, no second property, secrets never in the evidence file. `tests/acceptance/mc-canary-selftest.mjs` proves the driver
end to end against a local GFD + isolated real FWOMPS host (26/26) before it is ever pointed at production.

## The canary-runner identity (replaces a live human browser session for the operator-side steps)

A third Mission Control identity, distinct from the human Clerk `admin` and from `mission-control-worker`:

- Secret: `MISSION_CONTROL_CANARY_RUNNER_TOKEN` (Pages production secret) / local `GFD_MC_CANARY_RUNNER_TOKEN`. 128 lowercase hex (64 random
  bytes), generated by the provisioner, independent of every other secret (never the delivery bearer), rotatable and revocable:
  `mc-production-provision.mjs --rotate-canary-runner | --revoke-canary-runner --apply`, then redeploy. Cloudflare exposes an installed
  secret's name but not its value, so an already-existing remote runner secret is **never** assumed to match a well-formed local token:
  ordinary provisioning fails closed until the operator deliberately re-pairs/rotates it.
- **Authority is exactly zero unless `MISSION_CONTROL_CANARY === 'aiaimate.com'`.** With the switch off a valid token gets the canary's own 404
  (`canary_disabled`); it is never a Clerk admin and is never fed through Clerk.
- Reachable surface (exact method + route): GET provenance, operations (canary material only), work-items (canary item only), work-items/:id
  (canary item only); POST canary-observations, work-items/:id/{transition(to QUALIFIED only), investigate (read-only, repairAuthority=false), dispatch}.
  Never lease/result/expire/recover-dispatch, the evidence root, any other action, any other property or any non-canary item.
- Every mutation it makes is attributed to the actor `gfd-production-canary-runner` in the work-item event ledger (the dispatch intent has no
  actor column in the outbox; its attribution is the structured access log `mc-canary-runner-access`: timestamp, actor, role, method, route,
  workItemId, release, allow/refuse; never headers or secrets).
- The driver prefers `GFD_MC_CANARY_RUNNER_TOKEN`; `GFD_OPERATOR_TOKEN_FEED` / `GFD_OPERATOR_TOKEN` remain for tests and human-admin runs.

## Credentials only the operator can supply

- `GFD_MC_CANARY_RUNNER_TOKEN`: the canary-runner token above (preferred for the specimen; no browser session needed).
- `GFD_OPERATOR_TOKEN`: an admin Clerk session bearer. No longer needed by the preflight or the canary driver (the runner identity covers both); only for human-admin runs.
- `CLOUDFLARE_API_TOKEN` (read-only Pages): optional; `--control-plane wrangler` uses the existing Wrangler login instead. A Pages-write token is used only by the `mc-pages-redeploy.yml` workflow (repository secret).
- The delivery bearer is generated by the provisioner and persisted as a Windows user environment variable on the FWOMPS host.

## Certification record (2026-10-06): PASSED, canary OFF

Raw evidence: [`docs/evidence/`](./evidence) (`mc-canary-off-proof-initial|final-2026-10-06.json`, `mc-production-preflight-2026-10-06.json`,
`mc-production-canary-2026-10-06.json`). Every file was secret-scanned (credential patterns and the actual runner / worker / Wrangler values): clean.

| fact | value |
| --- | --- |
| GFD revision, held fixed for the whole run | `2ccc7b449e069c5367de3391581c87f77cfcdc6c` (`main`) |
| FWOMPS revision (merged `origin/main`, clean detached worktree) | `07e871a3e35ef80909deb0d8565a9d5f9452e1f9` |
| Pages deployments, all the same commit | initial OFF `c2238527-19c6-408a-b516-dae3f13057f5` → canary ON `c0e9f11f-2420-452b-b72c-1c56791c40fb` → final OFF `bf1813c6-a20c-43e1-a333-2ef0a5d56a48` |
| Initial OFF proof | `OFF_PROVEN`: 16/16 probes (valid runner credential → exactly `canary_disabled` 404 on 8 runner + 8 forbidden routes), 2/2 controls (no / forged credential → 401); bound to the full SHA + `deploy:success` |
| Preflight (runner identity, Wrangler control plane) | GREEN, P0–P11 |
| Specimen | 31/31 checks, 8/8 hostile cases; the FWOMPS host executed `web-health-readonly-v1` in the attested sandbox (`not_reproduced`, 1 authoritative receipt) and **the host delivered** its own signed result (acknowledged); the SAME work item DIAGNOSED, lease released, then reverified RESOLVED by a strictly newer healthy canary observation |
| Final OFF proof | `OFF_PROVEN`: 16/16 probes, 2/2 controls, same SHA, new deployment |
| Tests cited in the evidence | core 72/72, governed Mission Control 207/207, certification 15/15 |

Authority used: the canary-runner machine identity for every Mission Control call (no Clerk operator/admin bearer, no `GFD_OPERATOR_TOKEN`); the machine owner's existing
Wrangler login for secret provisioning and read-only control-plane GETs (no `CLOUDFLARE_API_TOKEN` was set); the repository's `CLOUDFLARE_API_TOKEN` secret only inside
`mc-pages-redeploy.yml` for the same-revision retry. The runner role was not broadened.

**Incident in the first attempt (disclosed, evidence under `docs/evidence/mc-confluence-002-incident-1-2026-10-06/`).** The first specimen (GFD `a1f5c66`) reached the real host,
but the host's delivery was blocked at the Cloudflare edge: `403 error code: 1010` for Python's default `urllib` User-Agent, reported as `delivery_refused_auth` while the bearer was
never evaluated. The canary was disabled and proven OFF first. Root cause fixed in FWOMPS (`weave0/fwomps#32`, fixed `User-Agent`) and the driver now proves the host transport reaches
the Worker before any production write (#419), classifies the existing canary item first, and offers `--close-previous` (#420). The aborted run left the item DIAGNOSED (the driver's own
byte-identical redelivery probe was accepted), so the certified run used `--close-previous`: the runner reverified that earlier cycle to RESOLVED and a fresh degraded observation reopened
the same item as RECURRENT. The earlier diagnosis remains in the event ledger and is recorded in the evidence as `previousCycle`.

Limits stated plainly: the canary observations (degraded and healthy) are operator-asserted and labelled as such, not production health probes; the hostile cases are the driver's own
replays; the single-instance Windows Sandbox must not be shared with other work while the specimen runs.