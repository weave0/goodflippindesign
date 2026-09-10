# Social Publishing AgentK Readiness

Date: 2026-09-04
Branch: `feat/learn-ai-nav-cta`

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

## Authorization Status

No production publication was performed. No production credential was added, changed, printed, or requested.
