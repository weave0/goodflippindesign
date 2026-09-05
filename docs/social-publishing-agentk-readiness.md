# Social Publishing AgentK Readiness

Date: 2026-09-04
Branch: `agent/gfd-agentk-executor-integration` (built on `agent/gfd-agentk-social-effects`)

> Update (this pass): the architecture decision, effect identity, and durable
> store choice below were independently re-verified and proven end-to-end
> against the real published `@agentkagent/sdk@0.2.0-rc.1` npm package (the
> `next` dist-tag) plus an isolated Postgres instance. See "AgentK Dogfood
> Proof Results" at the bottom of this document.

## Current Safety Boundary

GFD now treats the provider dispatch boundary as externally consequential. Failures before that boundary become `failed`. Failures after that boundary become `ambiguous` unless GFD has authoritative proof that no provider-side publication occurred.

`ambiguous` variants are terminal for the scheduler. They require operator reconciliation and are not reset to `pending` by ordinary queue execution.

## Provider Readiness Matrix

| Provider                   | Current evidence                                                                                                                                                    | End-to-end proof status              | Notes                                                                                                                                                                                                                                      |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| LinkedIn                   | OAuth config requests `openid profile w_member_social`; CMS has a profile test endpoint; publisher implements text and image post paths with `x-restli-id` capture. | Blocked for live proof in this pass. | Recommended first provider because it has the intended write scope and captures a provider identifier on success. Requires operator-authorized test account/token and independent provider-side verification before unattended publishing. |
| Pinterest                  | CMS has a real `test-publish` helper.                                                                                                                               | Not run.                             | The helper creates a public pin and is therefore not test-safe without explicit operator authorization.                                                                                                                                    |
| X                          | OAuth and publisher paths exist.                                                                                                                                    | Blocked.                             | Requires configured token and API write access; no independent proof path was run.                                                                                                                                                         |
| Instagram/Facebook/Threads | Publisher paths exist.                                                                                                                                              | Blocked.                             | Meta account/app state and media prerequisites were not proven in this pass.                                                                                                                                                               |
| TikTok/YouTube             | Publisher paths exist.                                                                                                                                              | Blocked.                             | Posting APIs have account/feature restrictions; no configured proof path was run.                                                                                                                                                          |

Non-secret local evidence: `workers/.dev.vars` currently exposes only `CLERK_SECRET_KEY`, `CLERK_SECRET_KEY_GFD`, `INTERNAL_SECRET`, `NODE_ENV`, and `STRIPE_WEBHOOK_SECRET` key names. No local social provider token key was present there.

## Recommended First Provider

LinkedIn remains the recommended first AgentK-governed provider. It is closest to the preferred flow because the code has OAuth scope configuration, profile verification, publication implementation, and provider ID capture. It is not production-authorized until an operator-approved test-safe proof verifies exactly one public/provider-side publication.

## AgentK Architecture Decision

Chosen architecture: **B. AgentK effect-executor service**.

Evidence:

- The actual local AgentK repository is available at `GFD Dev Projects/AgentK` and exports `AgentKRuntime`, `MemoryActionStore`, `runActionStoreConformance`, `ReconciliationCoordinator`, and staging/reconciliation primitives from its built package.
- `@agentkagent/sdk` requires Node `>=22.13.0`.
- AgentK documentation states production support requires a durable store with a truly atomic `claim()` implementation.
- AgentK store conformance requires concurrent exact claims to elect exactly one owner, sticky ambiguity, action-hash conflict detection, and restart durability across backend coordination boundaries.
- No D1-backed AgentK store exists in GFD, and no D1 store has passed AgentK `runActionStoreConformance()` here.
- The published npm metadata currently lists `pg` as a dependency, while the local package exposes SQLite reference stores via `@agentkagent/sdk/sqlite`; neither is a proven Cloudflare Worker durable backend.

Decision: GFD should submit immutable proposed publication effects to a Node `>=22.13` AgentK executor service with a proven durable backend. The Cloudflare scheduler should not own AgentK's effect-integrity state machine and should not implement a GFD-only pseudo-AgentK clone.

## Stable Effect Identity Draft

Use a deterministic identity shaped like:

```text
social.publish:<brand>:<platform>:<variant-id>:<content-identity>
```

The effect arguments bound into the AgentK action hash must include:

- brand;
- platform;
- target account identity;
- variant ID;
- exact content hash;
- media identity/hash when present;
- provider account identity;
- immutable scheduled publication arguments.

Do not include timestamps, attempt numbers, or runtime-generated retry counters in the effect identity.

## Credential/Authority Boundary Decision

Chosen model: **Option B — narrow authenticated GFD provider bridge.**

Provider OAuth tokens remain exactly where they already live today: encrypted
(AES-GCM) in GFD's D1, managed by GFD's existing `getToken()` lifecycle
(including refresh) for eight platforms. The AgentK executor does not hold,
duplicate, or request any provider credential. Instead:

- The executor owns effect identity, the crash-honest dispatch-claim
  protocol, and ambiguity/reconciliation — see `workers/social-publisher.js`
  `dispatchViaAgentKExecutor()` / `isAgentKGoverned()` / `AGENTK_EXECUTOR_URL`
  / `AGENTK_EXECUTOR_PLATFORMS`.
- GFD is a deterministic caller: it submits the same intent fields for the
  same variant every time and never varies them per attempt.
- The bridge (the still-to-be-built authenticated GFD Worker endpoint the
  executor would call to actually perform the LinkedIn HTTP request) must
  contain no automatic retries of its own — the executor is the only thing
  allowed to decide whether a dispatch attempt happens.
- Response loss from that bridge, or from the provider through it, must
  become AgentK ambiguity, never a silent local retry.
- Reconciliation must query authoritative provider evidence, never
  re-invoke publication.

Why not Option A (executor owns provider execution): GFD already has a
working, encrypted, multi-platform OAuth token store and refresh lifecycle.
Rebuilding that inside the executor would duplicate credential material and
lifecycle logic for no correctness benefit in this tranche, and would
increase — not minimize — standing authority. Option B keeps today's
credential authority exactly where it is and adds AgentK strictly as the
dispatch-decision authority on top of it.

Current status: the GFD-side scaffolding (config flags, the
`dispatchViaAgentKExecutor` client, and its no-fallback-on-network-failure
behavior) is implemented and tested against a fake executor HTTP server in
`tests/workers/social-publisher-agentk-bridge.test.js`. The actual bridge
endpoint that would call the real LinkedIn API from inside GFD's Worker, and
a deployed executor process, are **not** built or deployed — `AGENTK_EXECUTOR_URL`
is unset in every real environment, so this path is inert until an operator
explicitly configures it.

## AgentK Dogfood Proof Results

A standalone proof workspace (gitignored, outside both the GFD and AgentK git
histories — not merged or deployed anywhere) exercised the full LinkedIn
dispatch lifecycle against the real published AgentK package:

- `GFD Dev Projects/AgentK-social-executor-proof/` — consumes
  `@agentkagent/sdk@0.2.0-rc.1` from the public npm registry (`next` dist-tag).
- `GFD Dev Projects/AgentK-social-executor-proof-packed/` — same tests,
  consuming a `npm pack` tarball built from `weave0/agentk` commit
  `c6bd353f3f80e0f9fcf3e213a621a56b7b3bb310` (`origin/main` at verification
  time), as a source-pinned proof distinct from the registry install.

Both directories run identical tests (`test/effect-identity.test.mjs`,
`test/dogfood.test.mjs`, `test/failure-matrix.test.mjs`) against an isolated,
throwaway Postgres container (`agentk-dogfood-postgres`, port 5433 — never
the CultureSherpa Postgres container on port 5432) using AgentK's own
`PostgresActionStore`, `ReconciliationCoordinator`, `PostgresReconciliationLedger`,
and `DispatchRecoveryCoordinator`. Results: 14/14 pass in both, repeatably.

Proven directly:

- Resubmitting the exact same publication intent always yields the same
  `scopedKey`/`actionHash`; changing content, media, account, brand, or
  platform always changes it.
- Provider commit followed by response loss becomes durable `ambiguous`
  with exactly one provider invocation.
- Restarting the executor process (new store handle, new dispatch owner id)
  and resubmitting the same intent never redispatches — `in_flight` is
  returned, the provider is not called again.
- A stuck `dispatched` row from a truly killed process cannot be moved by
  ordinary resubmission at all; only `DispatchRecoveryCoordinator`, given
  proof of the old owner's death, moves it — to `ambiguous`, never straight
  back to retryable.
- Reconciliation against fake authoritative provider evidence settles the
  ambiguous effect as `completed`, and the executor never calls the provider
  again afterward, including after settlement.
- The full Phase 8 failure matrix (provider rejects before commit; commits
  and succeeds; commits and loses the response; process dies mid-dispatch;
  concurrent/duplicate resubmission; post-completion resubmission) each
  produce at most one real provider invocation.

## Authorization Status

No production publication was performed. No production credential was
added, changed, printed, or requested. No live LinkedIn API call was made —
every proof above used a deterministic fake LinkedIn provider
(`AgentK-social-executor-proof/src/linkedin-fake-provider.js`) that mirrors
GFD's real request/response contract without ever reaching
`api.linkedin.com`.
