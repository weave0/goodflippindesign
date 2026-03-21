# Architecture Decision Records

> Log of key architectural decisions for the GFV LLC ecosystem.
> Format: [ADR-NNN] Title — Date — Status

---

## ADR-001: Vanilla HTML/CSS/JS — No Build Tools

**Date**: 2025 (inception)
**Status**: Active
**Decision**: Ship all-in-one HTML files with embedded CSS and JS. No bundler, no framework.
**Context**: Solo-operator consultancy needs fast iteration without toolchain overhead.
**Alternatives**: React/Vue/Svelte + Vite, Next.js SSR.
**Rationale**: Zero build dependencies, instant local dev via `http-server`, every page is self-contained and immediately deployable. Trades developer ergonomics at scale for simplicity and speed.
**Evidence**: `index.html` (~7,260 lines), `community-portal.html`, `donate.html`

---

## ADR-002: Cloudflare Pages + Workers (Edge-First)

**Date**: 2026-02
**Status**: Active
**Decision**: Host static sites on Cloudflare Pages with advanced-mode Workers for dynamic routing.
**Context**: Previously mixed AWS Lambda + S3. Needed unified edge compute + storage + database.
**Alternatives**: Vercel, AWS CloudFront + Lambda@Edge, GitHub Pages + separate API.
**Rationale**: Zero egress, Workers for `/api/*` routing + `window.ENV` injection, R2/D1 co-located, single vendor.
**Evidence**: `_worker.js`, `wrangler.toml`

---

## ADR-003: Cloudflare D1 (SQLite) for Data

**Date**: 2026-02
**Status**: Active
**Decision**: Use D1 as the relational database for community profiles, CMS assets, admin ops.
**Context**: Needed ACID relational storage for user profiles and asset registry without managed DB ops.
**Alternatives**: PostgreSQL (Supabase/Neon), Firebase Firestore, DynamoDB.
**Rationale**: Native Worker binding, serverless, zero egress, 27+ tables deployed, sufficient for current scale.
**Evidence**: `wrangler.toml` (binding `gfd_community`), `d1-schema-*.sql` files, `workers/auth.js`

---

## ADR-004: Cloudflare R2 for Media Storage

**Date**: 2026-03
**Status**: Active
**Decision**: Store all branded media assets in R2 bucket `gfv-media`.
**Context**: 2,200+ art/media files across 5 brands needed centralized cloud storage with CDN access.
**Alternatives**: AWS S3, Google Cloud Storage, self-hosted.
**Rationale**: Zero egress, S3-compatible API, integrates with D1 `cms_assets` registry, 10GB free tier.
**Evidence**: `sync-config.json`, `scripts/sync-to-r2.js`, `MEDIA_PLATFORM_ARCHITECTURE.md`

---

## ADR-005: Clerk for Authentication

**Date**: 2025
**Status**: Active
**Decision**: Outsource auth to Clerk (managed SaaS) for all ecosystem sites.
**Context**: Needed multi-provider auth (Google, LinkedIn, email/password) without building auth infra.
**Alternatives**: Custom JWT, Auth0, Firebase Auth, NextAuth.
**Rationale**: Managed security/compliance, pre-built UI components, JWT verification via Worker, shared identity across GFD/GFV/community portal.
**Evidence**: `workers/auth.js` (JWT verification), `community-portal.html` (Clerk SDK)

---

## ADR-006: Stripe via Cloudflare Worker

**Date**: 2026-02
**Status**: Active
**Decision**: Process payments through a dedicated Cloudflare Worker calling Stripe API.
**Context**: Migrated from AWS Lambda payment handler to align with edge-first strategy.
**Alternatives**: Keep AWS Lambda, Stripe Hosted Checkout only, PayPal.
**Rationale**: Consistent with Cloudflare stack, secrets stay in Workers environment, sub-50ms edge latency.
**Evidence**: `workers/stripe-payments.js` (deployed as `gfd-stripe.weave0.workers.dev`)

---

## ADR-007: Formspree for Contact Forms

**Date**: 2025 (inception)
**Status**: Active
**Decision**: Route all contact/inquiry form submissions through Formspree.
**Alternatives**: SendGrid, Mailgun, custom SMTP handler on Worker.
**Rationale**: No email server to maintain, spam filtering included, supports budget-tier routing for project inquiries.
**Evidence**: `index.html` (~line 5360, endpoint `xgvgzjbw`), `assets/contact-form.html`

---

## ADR-008: Edge `window.ENV` Injection

**Date**: 2026-02
**Status**: Active
**Decision**: Inject publishable keys (Stripe, Clerk) into HTML at edge via `window.ENV` object in `_worker.js`.
**Alternatives**: Hardcoded keys in source, `/api/config` endpoint, build-time env substitution.
**Rationale**: No private keys in HTML source, works for all pages without build step, supports local dev with hardcoded fallback.
**Evidence**: `_worker.js` (HTML response transform)

---

## ADR-009: Test via temp_review.html (Not index.html)

**Date**: 2025
**Status**: Active
**Decision**: Pre-commit hook syncs `index.html` → `temp_review.html`; Puppeteer tests target the copy.
**Alternatives**: Test `index.html` directly, separate test fixtures per section.
**Rationale**: Prevents false positives from in-progress edits, enables parallel edit + test workflows.
**Evidence**: `tests/test-config.js`, `.husky/pre-commit`, `scripts/sync-review.js`

---

## ADR-010: Puppeteer for Full-Page Testing

**Date**: 2025
**Status**: Active
**Decision**: Use Puppeteer headless Chrome for all testing — accessibility, responsive, animations, forms.
**Alternatives**: Jest unit tests, Cypress, Playwright, axe-core standalone.
**Rationale**: GPU-animated transforms require real rendering engine; single tool covers WCAG contrast, tap targets, scroll behavior, and form validation. 144 tests in ~3 minutes.
**Evidence**: `package.json` (puppeteer dep), `tests/*.test.js` (7 suites)

---

## ADR-011: WCAG 2.1 AA as Accessibility Floor

**Date**: 2025
**Status**: Active
**Decision**: Enforce WCAG 2.1 AA across all pages — 4.5:1 contrast, 44px tap targets, keyboard nav, landmarks.
**Alternatives**: WCAG 2.0 AA, no formal standard, AAA.
**Rationale**: Legal ADA compliance baseline, enterprise client expectations (healthcare BI projects), automated Puppeteer enforcement.
**Evidence**: `tests/test-config.js` (thresholds), `tests/accessibility.test.js`

---

## ADR-012: CSP Centralized Generation

**Date**: 2026-02
**Status**: Active
**Decision**: Single source of truth (`scripts/csp-config.js`) generates `_headers` for Cloudflare.
**Alternatives**: Manual header editing, per-page CSP meta tags.
**Rationale**: Prevents CSP drift, shared domain allowlists (Stripe/Clerk/GA4), CI blocks out-of-sync `_headers`.
**Evidence**: `scripts/csp-config.js`, `_headers`, `npm run gen:csp`

---

## ADR-013: Monorepo with Shared Admin + Asset Registry

**Date**: 2026-01
**Status**: Active
**Decision**: Single repo houses GFD + companion brand projects + shared admin infra + media pipeline.
**Alternatives**: Separate repos per brand, npm monorepo (workspaces/pnpm).
**Rationale**: Solo operator needs unified view — one CI pipeline, shared D1/R2 registry, cross-brand asset reuse, centralized admin panel.
**Evidence**: `gfd_master_charter.md`, `admin.html` (24 panels), `GFD Dev Projects/` subdir

---

## ADR-014: Graceful Degradation for Optional Dependencies

**Date**: 2026-02
**Status**: Active
**Decision**: Sentry, auth worker, R2 media, and GA4 all fail gracefully — static sites still serve.
**Alternatives**: Hard-fail on missing dependency, require all services.
**Rationale**: Maximizes uptime, enables local dev without secrets, allows incremental feature rollout.
**Evidence**: `_worker.js` (try/catch around ENV injection), `workers/auth.js` (Sentry optional)

---

## ADR-015: GPU-Only Animation Policy

**Date**: 2025
**Status**: Active
**Decision**: Only `transform` and `opacity` for animations. Never `transition: all`, never layout-triggering properties.
**Alternatives**: Allow `top`/`left`/`width` transitions, CSS animation libraries.
**Rationale**: Eliminates layout thrashing, ensures 60fps on mobile, `will-change` hints for composited layers. Automated tests enforce max 500ms duration.
**Evidence**: `tests/animations.test.js`, `.github/copilot-instructions.md` (Animation Performance section)
