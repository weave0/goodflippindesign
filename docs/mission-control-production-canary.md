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
   production deployment of `<sha>` before and after. The control plane is the Cloudflare API (`CLOUDFLARE_API_TOKEN`); pass
   `--control-plane wrangler` to use your Wrangler login instead (7-character SHA match, no stage check, recorded in the evidence).
6. **Enable exactly the one canary and redeploy** (same pinned retry as step 5): `mc-production-provision.mjs --enable-canary --apply`; no other property/value is valid.
7. **Preflight** (#379): `node --no-warnings scripts/mc-production-preflight.mjs --expected-sha <merged sha> --expected-worker-id fwomps-host-weave0-01 --fwomps-home ~/.fwomps --json <out>`
   — P0–P11 all green, release stamp equals the merged sha, all seven bindings are present, credential bindings are `secret_text`, key ids/worker id agree, public routes expose nothing, and no repair/deploy/write authority exists.
8. **Run the canary once:**
   ```bash
   GFD_MC_CANARY_RUNNER_TOKEN=<runner bearer> GFD_MC_WORKER_TOKEN=<delivery bearer> FWOMPS_REPO=<merged fwomps> PYTHON=<python> \
   node --no-warnings --import ./tests/acceptance/node-json-hook.mjs scripts/mc-production-canary.mjs \
     --fwomps-home ~/.fwomps --out docs/evidence/mc-production-canary-<date>.json --preflight <preflight.json> --tests "core=70/70" --tests "governed=118/118"
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
- `GFD_OPERATOR_TOKEN`: an admin Clerk session bearer (needed by the #379 preflight's operator probe and for human-admin runs).
- `CLOUDFLARE_API_TOKEN` (read-only Pages) for the #379 control-plane check.
- The delivery bearer is generated by the provisioner and persisted as a Windows user environment variable on the FWOMPS host.
