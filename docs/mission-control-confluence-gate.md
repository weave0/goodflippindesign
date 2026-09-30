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

1. **Dispatch intents must bind to the signed contract.** The effect id is derived from
   `work item + effect type + target + candidateDigest`. A second attempt after an abandoned first one
   collides (`effect_conflict`) unless the intent carries the signed contract digest as `candidateDigest`.
   The gate's dispatcher does this; any production dispatcher must too.
2. **The API does not yet require an intent before a lease.** `investigate`/`lease` work without a
   `investigation_dispatch` effect. The gate proves the durable-intent-first ordering and the fences when
   the intent exists, but nothing structurally forces a caller to create one. Enforcing it is a decision
   for the production dispatcher, not assumed here.
3. **Every result rejection is HTTP 409** (including MAC/unknown-key failures). It fails closed, and the
   `code` field is specific (`mac_invalid`, `lease_mismatch`, …); the status code is just coarse.
4. **A crash after the lease is recoverable only through expiry.** The claim is lifecycle-fenced, so a
   naive retry is refused (`stale_lifecycle`) and a second lease is refused (single attempt). Recovery is
   `expire` → fresh contract → new intent. This is the intended semantics.
5. **The FWOMPS host has no AIAIMate binding yet.** `~/.fwomps` registers only a `fwomps` workspace.
   Registering `aiaimate.com → workspace aiaimate → web-health-readonly-v1` (host-owned) is an operator
   action; tier 2 proves the binding works in an isolated home.
