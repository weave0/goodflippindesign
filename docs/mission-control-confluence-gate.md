# MC-CONFLUENCE-001 — the permanent confluence gate (GFD #371)

**Question this gate answers permanently: did we break confluence?**

`AIAIMate observation → canonical work item → registry qualification → signed contract → durable
investigation_dispatch intent → claim → signed lease → FWOMPS read-only investigation → authenticated
result through the real GFD route → the same work item is DIAGNOSED`, with the hostile matrix from #371
failing closed on the same path.

Repair, promotion and deploy authority are **not** part of this gate and stay disabled.

## Two tiers, and what each one does and does not prove

| | Tier 1 — merge-blocking | Tier 2 — specimen |
|---|---|---|
| File | `tests/workers/mission-control-confluence.test.js` | `tests/acceptance/mc-confluence-specimen.mjs` |
| Runs | every PR, in `npm run test:workers:mission-control` | on a host with an attested FWOMPS sandbox (not GitHub runners) |
| GFD side | real D1, real `workers/auth.js` entry, real sweep observation, real registry binding, real outbox | same, plus real HTTP server, D1 persisted to disk |
| FWOMPS side | **pinned wire format** (#368 vectors), signed with the worker key | **the real FWOMPS published CLI** in its attested Windows sandbox, host-registered profile, real repository clone |
| Proves | the whole GFD chain + every hostile row, on every change | one real bounded GFD→FWOMPS→GFD round trip, and hostile deliveries of FWOMPS's own bytes |
| Does not prove | that real FWOMPS still produces these bytes (that is #368's conformance vectors + tier 2) | anything about CI; it is an operator-run acceptance |

Neither tier grants repair authority, neither imports FWOMPS private modules. Tier 2 uses only FWOMPS's
published `python -m fwomps.mission_control {investigate,deliver}` and its published host-config and
key-store classes to build an **isolated** throwaway `FWOMPS_HOME` (the operator's real `~/.fwomps` is
never read or written).

Honest limits of tier 2: the degraded observation is **synthetic** (constructed, then sent through the
real sweep path); it is not a production incident. Operator identity comes from a stubbed Clerk response
(auth-layer behaviour is covered by the route-authentication tests). Expiry is forced by editing
`lease_expires_at` in tier 1 (no clock injection exists in the worker).

## Running tier 2

```bash
# prerequisites: `npm ci` in this repo; FWOMPS checkout at a merged main; Python 3; node; network access to clone weave0/aiaimate
FWOMPS_REPO=/path/to/fwomps node --no-warnings --import ./tests/acceptance/node-json-hook.mjs \
  tests/acceptance/mc-confluence-specimen.mjs --dir <run dir>
```

Writes `<run dir>/evidence.json`: SHAs, every step, every check, the wire log (request digests, statuses,
refusal codes), and dumps of the D1 work-item, event, lease and effect tables.

## Hostile matrix (#371) → where it is proven

| #371 row | tier 1 test | tier 2 (real bytes) |
|---|---|---|
| duplicate identical delivery, idempotent | `duplicate identical delivery succeeds idempotently…` | byte-identical redelivery 200; FWOMPS redelivery after ack never re-sends |
| concurrent duplicate identical delivery | `concurrent identical deliveries all succeed with exactly one commit` | 4 concurrent, all 200 |
| different result, same attempt | `concurrent different results…` | validly-signed different result → `result_conflict` |
| stale lifecycle version | `a lifecycle transition that beat the claim leaves the intent stale`, `an intent cannot be planned against a lifecycle version the item already left` | — |
| stale/older attempt receipt (same bytes) | `an active claim cannot be abandoned or reclaimed…` | — |
| wrong lease/token | `rejects a wrong lease token, a wrong attempt, and every mismatched identity echo` | `lease_mismatch` (validly signed) |
| wrong attempt | same | `attempt_mismatch` |
| expired lease/result + recovery path | `refuses a result after expiry, then recovers through an explicit, fresh, bounded attempt` | — |
| tampered payload / digest / signature | `rejects tampered payloads, tampered MACs, a foreign key and an unknown key id` | `mac_invalid` ×3, `unknown_key` |
| wrong repository / property / work item | identity-echo test | `identity_mismatch` ×3 (validly signed) |
| wrong evidence revision | identity-echo test | refused (`malformed_result`) |
| unsupported schema/version | `rejects an unsupported result schema…`, unsupported effect row test | `schema_version_mismatch` (signed and unsigned) |
| replay after a newer attempt | recovery test (old envelope after the fresh attempt) | — |
| authority smuggled in payload | `rejects authority smuggled into the result, the lease request and the dispatch intent` | `malformed_result` (signed and unsigned) |
| active claim cannot be abandoned/reclaimed | `an active claim cannot be abandoned or reclaimed until its visibility window passes` | — |
| lifecycle transition racing intent/claim | `concurrent claim and out-of-band lease…` | — |
| result after the work item advanced | `accepts nothing for a result that arrives after the item advanced past DIAGNOSED` | — |
| executor crash/timeout: no implicit retry | `crash after the lease: no implicit retry, no second lease…` | — |
| re-observation during an active investigation | `keeps a fresh observation from disturbing a live investigation or a recorded diagnosis` | — |

Also pinned: diagnosis alone cannot resolve (`RESOLVED`/`REVERIFYING` refused with
`resolution_requires_fresh_evidence`, repair states with `repair_authority_denied`).

## Findings this gate surfaced (recorded, not hidden)

1. **Dispatch intents must bind to the signed contract. — now an enforced invariant** (see "The lease/intent
   invariant" below). The effect id derives from `work item + type + canonical target + contract digest`;
   the digest is required at plan time, so a legitimate retry after abandonment (new contract, new digest)
   is a different intent and never collides, while the same contract always maps to the same intent.
2. **The API did not require an intent before a lease. — closed in production.** No lease can now be
   recorded without a committed, eligible intent; see below.
3. **Every result rejection is HTTP 409** (including MAC/unknown-key failures). It fails closed, and the
   `code` field is specific (`mac_invalid`, `lease_mismatch`, …); the status code is just coarse.
4. **A crash after the lease is recoverable only through expiry.** The claim is lifecycle-fenced, so a
   naive retry is refused (`stale_lifecycle`) and a second lease is refused (single attempt). Recovery is
   `expire` → fresh contract → new intent. This is the intended semantics.
5. **The FWOMPS host has no AIAIMate binding yet.** `~/.fwomps` registers only a `fwomps` workspace.
   Registering `aiaimate.com → workspace aiaimate → web-health-readonly-v1` (host-owned) is an operator
   action; tier 2 proves the binding works in an isolated home.

## The lease/intent invariant (production, not just the harness)

**There is no production lease path unless durable prior intent authority can be proven.** A lease is the
only thing that lets FWOMPS act on a work item, so it is issued only under a committed
`investigation_dispatch` effect that is, all at once:

| condition | refusal if violated |
|---|---|
| a request naming the intent (`{effect_id, attempt}`, closed body) | `dispatch_intent_required` / `malformed_lease` (400 for extra keys) |
| belongs to the **same canonical work item** | `different work item` |
| type `investigation_dispatch`, canonical target `fwomps:<propertyId>` | `not an investigation_dispatch` / `canonical dispatch target` |
| known schema `gfd-effect-1` (legacy/unknown cannot prove eligibility) | `schema is unknown or pre-contract` |
| still `PLANNED` (not abandoned, failed, committed or verified) | `abandoned or failed` / `already consumed` |
| `candidate_digest` = the **exact signed contract digest** | `not bound to this signed contract digest` |
| fenced to the work item's **current lifecycle version** | `stale for the current lifecycle version` |
| under a **live claim**: presented attempt = the effect's current attempt, inside the visibility window | `not been claimed` / `presented attempt is not the current claim` / `claim expired` |

How it is enforced:
- `workers/lib/mission-control-lease-authority.js` proves the above from durable state and explains any refusal.
- The **store refuses to record any new lease** (`store.save`) unless the save carries an authority guard
  (`dispatch_intent_required`), so no caller, present or future, can attach a lease any other way.
- The guard re-asserts the **same predicate inside the compare-and-swap** that writes the lease, so an intent
  abandoned, consumed, reclaimed or expired between the check and the write still fails closed
  (`dispatch_intent_ineligible`), leaving no lease row and no state change.
- One intent authorizes at most one lease: the lease advances the lifecycle version, and concurrent duplicate
  requests still resolve through the existing one-active-lease CAS (exactly one 200).
- `planEffect` applies the same identity rules: a dispatch intent requires the contract digest, the canonical
  target, and an `INVESTIGATION_READY` work item.
- The lease event journals `dispatchIntent: {effectId, attempt, candidateDigest}` so every lease is traceable
  to the intent that authorized it.

Nothing here adds execution authority: GFD records and authorizes intent; FWOMPS remains the isolated
read-only executor. The outbox executes nothing.

**Proven in CI** (`tests/workers/mission-control-lease-authority.test.js`, real worker entry + D1, 16 tests; 24/24
deliberate weakenings of the guards are each caught): no intent / unknown intent / half an intent, another work
item's intent, wrong attempt (unclaimed, expired claim, stale claimant after a reclaim), wrong contract digest,
target and effect type, abandoned, consumed/committed, unknown and legacy schema, stale lifecycle version,
concurrent duplicate requests, smuggled authority, the positive path, retry after abandonment with a new digest
(no identity collision), the store-level structural refusal, and the check-then-write race for every predicate.
**Requires the attested operator specimen** (tier 2): that the real FWOMPS still runs end to end under the
invariant (42/42 on the recorded run), including the two real-wire refusals that must precede the claim.

## Registering the real FWOMPS host binding (host-owner action)

`~/.fwomps` currently registers only a `fwomps` workspace. `scripts/fwomps-aiaimate-host-binding.py` plans,
applies and verifies `aiaimate.com → workspace aiaimate → weave0/aiaimate → web-health-readonly-v1` using only
FWOMPS's published host-config and key-store classes. It is **read-only unless `--apply`**, takes the two shared
keys from environment variables (never arguments, never printed), backs up `config.json` before writing, refuses
to overwrite any conflicting workspace/binding/profile/Mission Control block, and is idempotent.

```bash
# 0. a dedicated CLEAN clone (FWOMPS verifies a clean tree at the contract's evidence revision)
git clone https://github.com/weave0/aiaimate.git <workspace-root>

# 1. plan (read-only): shows exactly what would change, key ids enrolled, which env vars are missing
FWOMPS_REPO=<fwomps checkout> python scripts/fwomps-aiaimate-host-binding.py \
  --workspace-root <workspace-root> --result-origin https://<gfd origin> --worker-id <MISSION_CONTROL_RESULT_WORKER_ID>

# 2. apply, with GFD's own keys exported in THIS shell only (they must equal GFD's secrets):
#    FWOMPS_MC_CONTRACT_KEY_ID/_HEX == MISSION_CONTROL_CONTRACT_KEY_ID/_KEY
#    FWOMPS_MC_WORKER_KEY_ID/_HEX   == MISSION_CONTROL_RESULT_KEY_ID/_KEY
... same arguments ... --apply

# 3. verify (read-only). Also export the GFD worker bearer under the env NAME the config records (default GFD_MC_WORKER_TOKEN)
... same arguments ... --revision <evidence revision> --verify
```

The tool's apply/verify/conflict/no-secret-output behaviour was exercised against an isolated throwaway home; the
real host was only ever planned against (its `config.json` was byte-identical afterwards).
