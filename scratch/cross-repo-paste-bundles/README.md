# Cross-Repo Paste Bundles — Ecosystem Attribution & JSON-LD

**Purpose:** Self-contained snippets you can land in **one commit per remote repo** to wire each sister property into the unified Good Flippin Design `@graph` and surface ecosystem attribution.

**Pattern (same for every property):**

1. **Head paste** — drop a `<script type="application/ld+json">` block into `<head>` (after canonical/OG, before fonts). Each defines:
   - `WebSite` node with `@id` matching what `goodflippindesign.com/index.html` already references (e.g. `https://heavymoose.com/#site`).
   - `publisher` → `https://goodflippindesign.com/#studio` (cross-property entity stitching).
   - A property-specific node (Organization / SoftwareApplication / WebApplication / etc.).
   - A minimal stub `Organization` for the studio so the `@id` resolves locally.
2. **Footer paste** — replace existing footer attribution line with the unified ecosystem credit + 6 sister-property links.

**Naming canon (do NOT vary):**

- Studio (parent / production): **Good Flippin Design** — `https://goodflippindesign.com` — `@id` `#studio`
- Brand (consumer / publisher): **Good Flippin Vibes** — `https://goodflippinvibes.com` — `@id` `#site-gfv`
- Founder: **Brett Lee Weaver** — `worksFor` → studio
- Studio `@id` MUST be `https://goodflippindesign.com/#studio` everywhere — that's the join key.

**Files in this folder:**

| File                           | Target repo                             | Status         |
| ------------------------------ | --------------------------------------- | -------------- |
| `heavymoose.html`              | wherever heavymoose.com is hosted       | 📋 paste-ready |
| `citizenapproved.html`         | wherever citizenapproved.org is hosted  | 📋 paste-ready |
| `culturesherpa.html`           | wherever culturesherpa.org is hosted    | 📋 paste-ready |
| `aiaimate.html`                | `weave0/aiaimate` (Next.js — see notes) | 📋 paste-ready |
| `analytics-ga4-webvitals.html` | **all 7 properties** (shared)           | 📋 paste-ready |

**Validation after each paste:** https://validator.schema.org/#url=https%3A%2F%2F<property>/ — should show no errors and resolve `#studio` reference.

**Do NOT change** any existing canonical URLs, robots meta, or Stripe/Clerk/CSP wiring on the target repo — these bundles are additive only.
