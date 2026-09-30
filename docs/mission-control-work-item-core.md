# Mission Control work-item core

Status: implementation foundation for issue #340.

This document defines the durable operating semantics that sit between estate observations and bounded FWOMPS authority. It is intentionally independent of the Admin UI and independent of FWOMPS execution internals.

## Why this exists

GFD already has useful producer-specific behavior:

- the health sweep emits stable finding keys and updates one GitHub incident instead of opening a new issue every sweep;
- GlobalDeets emits governed Mission Control evidence planes;
- Traffic Intelligence emits grouped findings;
- product systems emit business and instrumentation evidence.

Those are observations. They are not yet one durable work operating system.

The canonical work item gives one underlying condition an identity that survives repeated observation, investigation, diagnosis, repair, deployment and production reverification.

## Identity

A v1 work item is identified only by:

```
producer + propertyId + findingKey
```

The canonical ID is:

```
gfdwi_v1_<sha256(producer NUL propertyId NUL findingKey)>
```

Observation time, severity, evidence revision and current state are deliberately excluded. A later sweep must update the same item.

The first concrete specimen remains the AIAIMate health condition:

```
producer   = health-sweep
property   = aiaimate.com
findingKey = health:aiaimate:machine_contract_mismatch
```

## Lifecycle

Primary path:

```
OBSERVED
  -> QUALIFIED
  -> INVESTIGATION_READY
  -> INVESTIGATING
  -> DIAGNOSED
  -> REPAIR_READY
  -> REPAIRING
  -> CANDIDATE_READY
  -> VERIFIED
  -> CHANGE_PUBLISHED
  -> DEPLOYED
  -> REVERIFYING
  -> RESOLVED
```

Side states:

```
BLOCKED
NEEDS_HUMAN
DISMISSED
SUPERSEDED
RECURRENT
```

BLOCKED and NEEDS_HUMAN remember the exact interrupted state and may only resume that state.

RECURRENT is not an operator button. It is produced by a fresh observation after RESOLVED and preserves the original work_item_id and history.

## Qualification is a real gate

OBSERVED does not imply that the system knows enough to dispatch work.

QUALIFIED requires all of:

- canonical execution repository identity;
- registered investigation profile;
- registered verification profile;
- explicit verification scope;
- verification predicate.

The execution repository is the repository in which the bounded investigation/repair work is authorized. It need not always be the affected property's application repository. For example, a finding that the estate registry is missing repository authority can legitimately dispatch a read-only investigation against the GFD control-plane repository.

The current GFD estate registry does not yet carry those bindings for the whole estate. The system must therefore leave a finding OBSERVED/BLOCKED rather than invent repository or execution authority.

These bindings should be added to the existing governed estate registry. Do not create another property registry.

Recommended property additions:

```json
{
  "repository": "weave0/aiaimate",
  "investigation_profile": "aiaimate-health-readonly-v1",
  "verification_profile": "aiaimate-health-production-v1",
  "verification_scope": "production",
  "deploy_identity": {
    "provider": "vercel",
    "project": "..."
  }
}
```

Unknown values should remain null/unavailable and be visible as confluence debt.

## Authority boundaries

### Observation

An observation may update:

- last_seen;
- occurrence_count;
- severity/confidence;
- evidence revision/digest.

It may not grant a lease, start FWOMPS, mutate source, publish a change or resolve itself.

### Investigation

INVESTIGATING requires an unexpired active lease.

DIAGNOSED requires an authenticated result digest and signature/result reference.

Investigation authority does not create repair authority.

### Repair

REPAIR_READY / REPAIRING requires a separately issued `repairAuthorityRef`.

A diagnosis cannot implicitly cross this boundary.

### Resolution

RESOLVED is accepted only from REVERIFYING and only with:

- a passing verification result;
- the exact registered verification profile;
- the exact registered verification scope;
- the exact registered verification predicate;
- a canonical evidence digest;
- an observation at least as fresh as the last failing observation.

Verification scope is deliberately explicit. Current closed vocabulary:

- `production` — live property/service behavior;
- `control-plane` — GFD Mission Control / estate source-of-truth state;
- `repository` — repository/source state;
- `configuration` — governed desired-state configuration;
- `deployment` — provider/deploy state.

A health defect may require a fresh production probe. A registry-authority defect may require fresh control-plane evidence. A source-state defect may require repository verification. An agent statement such as "fixed" is never resolution evidence in any scope.

## Durable effects

External consequences need a stable identity:

```
gfdeffect_v1_<sha256(workItemId NUL effectType NUL target NUL candidateDigest)>
```

Examples:

- create/update PR;
- merge;
- deploy;
- DNS/config mutation;
- schema migration.

The effect ID is the retry boundary.

Reasoning may retry freely. Consequences may not.

Before retrying an external effect, the caller must first check the durable `mc_effects` row and reconcile the provider state.

## Persistence

`db/d1-schema-mission-control-work-items.sql` adds four logical stores:

- `mc_work_items` — current projection;
- `mc_work_item_events` — append-only audit history;
- `mc_effects` — durable consequence ledger;
- `mc_work_item_leases` — lease history.

The current row is optimized for operator reads. It must not replace the event/effect history.

## Complete finding-snapshot reconciliation

`workers/lib/mission-control-finding-reconciliation.js` is the pure boundary
between a complete producer snapshot and the canonical work-item projection.

It accepts:

- the current set of canonical work-item projections;
- one `gfd-mission-control-finding-feed` document;
- an explicit producer/property/finding-prefix scope;
- `snapshotComplete: true`.

It deterministically returns:

- an OBSERVED work item for each new stable finding identity;
- an updated occurrence for a later observation of an existing identity;
- RECURRENT state when a finding reappears after resolution;
- a candidate resolution event when an active scoped finding is absent from a
  strictly later complete snapshot;
- stable event and snapshot digests suitable for an idempotent future store.

Exact snapshot replay is a no-op. Stale snapshots, duplicate identities,
out-of-scope findings, conflicting same-time observations and corrupt prior
projections fail closed.

Absence does not directly set RESOLVED. It produces only a candidate event.
The normal verification profile, scope, predicate, freshness and evidence
requirements still govern the lifecycle transition. The reducer performs no
D1 writes and grants no investigation, repair, merge, deploy or external-effect
authority.

## Relationship to GitHub issues

GitHub issues are useful operator surfaces and may remain mirrors/references.

They are not the canonical state machine.

A GitHub issue number can be stored as an external effect/reference while `work_item_id` remains stable across issue recreation, recurrence, future non-GitHub operator surfaces and FWOMPS execution.

## Relationship to GlobalDeets

GlobalDeets remains an evidence producer.

It should not become the owner of mutable work authority.

A GlobalDeets diagnostic should provide stable producer/finding identity and evidence references. GFD Mission Control materializes/upserts the corresponding work item.

## Relationship to FWOMPS

The work item is not a FWOMPS Run.

The bridge is:

```
GFD work item
  -> signed mc-fw-investigation-request-1
  -> signed mc-fw-lease-grant-1 (GFD chooses the worker, attempt, and token)
  -> FWOMPS bounded read-only execution
  -> authenticated mc-fw-investigation-result-1
  -> same GFD work item
```

GFD resolves `authentication.key_id` to the enrolled worker and accepts the result only when that worker, the request, the contract digest, the evidence echoes, and the lease attempt all match. The same result digest is idempotent. A different envelope for that investigation is refused. `repairability.advisory_repair_scope` is not stored and is not repair authority.

### Attempt, lease, and result semantics (first bridge: one attempt per contract)

A result's identity is `(request_id, attempt, lease_token_digest)`. GFD accepts a result only when all of the
following hold: the work item, request id, signed contract digest, diagnostic id/digest, evidence revision,
snapshot digest, property and repository all match the issued investigation; the worker is the one bound to
`authentication.key_id` (never looked up from `worker.id`); the MAC verifies under the result purpose;
`result.attempt` and `result.lease_token_digest` equal the active lease's; and the lease has not expired.

**This bridge is bounded to a single attempt per signed contract.** GFD does not yet persist enough attempt
state to distinguish a resume of the same admitted attempt, an expired or abandoned attempt, a greater attempt
after durable abandonment, or a stale prior-attempt result, so it does not claim FWOMPS retry or recovery
semantics. Concretely:

- GFD issues at most one lease per request (`attempt_exhausted`, HTTP 409, even after the first lease expires);
  a retry requires a fresh signed contract with a new request id.
- A result that arrives after its lease expired is refused (`lease_expired`); FWOMPS never uploads one either.
- **Expiry is recovered explicitly, never silently.** An operator calls `POST .../expire`. It succeeds only when the
  active lease has provably expired (`lease_not_expired` otherwise) on an `INVESTIGATING` item; it releases exactly
  that lease durably (`released_at` / `release_reason = lease_expired`), journals an `abandonment` event (request id,
  lease digest, worker, expiry), and returns the item to `QUALIFIED` -- the state from which a *fresh* signed contract
  can be issued. It never reuses the old contract or request and never creates an attempt 2. Attempts are counted per
  signed contract, so the fresh contract's first lease is attempt 1; the expired contract's result stays refused.
- The raw lease token is 32 random bytes returned once to the authorized worker transport as `leaseTokenHex`.
  Only its SHA-256 digest is signed into the grant and stored. A lost response cannot be replayed into a second
  token; the lease simply runs out.
- The worker id, attempt, and token are chosen by GFD; a lease request that supplies any of them is refused.
- Redelivering a byte-equivalent result is idempotent (same result digest, one diagnosis event). A different
  signed result for the same attempt identity is refused (`result_conflict`).
- **Every** write to an existing work item is a durable compare-and-swap on `lifecycle_version`, for the health
  writer as well as the API. Items read from the store carry the version they were loaded at (surviving object
  spread through any lifecycle function); an item that was never loaded can only insert. Of two racing writers
  exactly one commits and the other gets `version_conflict`; the event, lease-release and lease rows are written
  only if the swap applied. The health writer, whose observation is idempotent evidence, deliberately reloads and
  re-applies (bounded, then surfaces the conflict); lease creation and other state-changing actions never retry,
  because a retry could mint a second lease token. On a lost *result* swap only, GFD reloads: if the item is now
  `DIAGNOSED` with exactly the incoming authenticated result digest it is the same delivery and succeeds; a
  different digest is `result_conflict`. Retries are normal; this does not claim exactly-once delivery.
- The result is evidence only. `repairability` must be `not_indicated` with an empty `advisory_repair_scope`;
  anything else is refused and no repair, mutation, PR, or deployment authority is ever derived from it.

Multi-attempt support is a schema change (a durable attempt column plus an abandonment record) and is
deliberately not simulated here.

Only after separate repair authority:

```
DIAGNOSED
  -> RepairContract / repair authority
  -> candidate
  -> authoritative verification
  -> governed effect
  -> production reverification
```

## Confluence debt

This model makes previously invisible stagnation measurable.

Useful derived diagnostics include:

- OBSERVED items that cannot QUALIFY because repository/profile/verification bindings are missing;
- QUALIFIED items aging without investigation;
- blocked items by blocker reason;
- active leases past expiry;
- DIAGNOSED items without an explicit repair/close decision;
- VERIFIED candidates never published;
- published changes never observed deployed;
- deployed changes never production-reverified;
- recurrent conditions;
- estate properties missing repository/deployment truth;
- effects stuck PLANNED or COMMITTED without provider reconciliation.

Those should become first-class Mission Control diagnostics rather than another manually maintained backlog.

## Initial implementation files

- `workers/lib/mission-control-work-items.js`
- `tests/workers/mission-control-work-items.test.js`
- `db/d1-schema-mission-control-work-items.sql`

The initial library is pure by design. No GitHub, D1, Cloudflare or FWOMPS mutation calls are allowed inside it. Persistence/API wiring can consume the library after its invariants are accepted.
