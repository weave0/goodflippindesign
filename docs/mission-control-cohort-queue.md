# Next implementation queue: the four-property cohort

Generated from governed sources and a recorded repository-facts snapshot (`scripts/estate-cohort-plan.mjs` →
`docs/evidence/estate-cohort-plan-2026-10-01.json`). Declarations only: nothing is applied, nothing is promoted, and execution
authority is not broadened. This queue is for **after** the first production canary succeeds; until then it is preparation.

All four already have **repository authority** (registry `operating.repository`, verified 2026-09-29). Each is missing the same four things:

| prerequisite | what generates it | what is still a human step |
| --- | --- | --- |
| machine-health contract | route template per platform + health-target patch (`machineHealthContract`) | merge the route in the property repo; confirm the sweep passes it |
| verification declaration | registry patch (`verificationDeclaration.registryPatch`) | review and merge in this repo (validator + gate enforce shape) |
| reviewed read-only profile | per-property profile name + route path + argv digest (`readOnlyProfile`); `scripts/fwomps-property-host-binding.py` builds the fixed argv | review the digest once |
| host registration | exact commands (`hostRegistration.steps`) | operator runs `--apply`; gate must show C1–C10 PASS, `hostVerified` |

| property | platform (from repo markers) | generated route | specific blockers |
| --- | --- | --- | --- |
| `citizenapproved.org` | Next.js static export on Cloudflare Pages | `src/app/api/gfd-property-health/route.ts` (`force-static`) | none beyond the four |
| `globaldeets.com` | Cloudflare Pages Functions | `functions/api/gfd-property-health.js` | none beyond the four |
| `goodflippindesign.com` | Pages **advanced mode** (`_worker.js`) | none: `functions/` is ignored in advanced mode | add the contract route inside the worker entry (hand-written once, reviewed) |
| `culturesherpa.org` | unknown (multi-surface python/lambda/astro monorepo, private) | none | deploy identity unknown in the registry; platform must be chosen; private repo needs authenticated clone |

Recommendation: do `citizenapproved.org` and `globaldeets.com` first (fully generated); treat `goodflippindesign.com` as a
small hand-written change; defer `culturesherpa.org` until its deploy identity is declared (`goodflippinvibes.com`, also live
with a repo and a health target, is the next candidate — its facts are already in the snapshot).

Reusable machinery added: `scripts/lib/estate-cohort-plan.mjs` (generator), `scripts/fwomps-property-host-binding.py` (the AIAIMate
binding script generalised; with AIAIMate's arguments its plan against the real host shows every line `=`, i.e. a byte-identical profile).
