# EVERYTHING.md — Ecosystem Master Reference

> **Last updated**: 2026-03-11 | Single source of truth. Update this when anything changes.

---

## 1. The Ecosystem at a Glance

| Brand                         | Domain                         | Stack                   | GitHub Repo                 | CF Project           | Local Path                                 |
| ----------------------------- | ------------------------------ | ----------------------- | --------------------------- | -------------------- | ------------------------------------------ |
| **GFD** (Good Flippin Design) | `goodflippindesign.com`        | Vanilla HTML/CSS/JS     | `weave0/goodflippindesign`  | `goodflippindesign`  | `z:\GFD\`                                  |
| **GFV** (Good Flippin Vibes)  | `goodflippinvibes.com`         | Vite + Vanilla JS       | `weave0/good-flippin-vibes` | `good-flippin-vibes` | `z:\GFD\GFD Dev Projects\GFV\website\`     |
| **CultureSherpa**             | `culturesherpa.com`            | Astro + Python API      | `weave0/CultureSherpa`      | `culturesherpa`      | `z:\GFD\GFD Dev Projects\CultureSherpa\`   |
| **CitizenApproved**           | `citizenapproved.com`          | Next.js 16 + TypeScript | `weave0/CitizenApproved`    | `citizenapproved`    | `z:\GFD\GFD Dev Projects\CitizenApproved\` |
| **AIAimate**                  | `aiaimate.com`                 | Next.js (portal)        | `weave0/aiaimate`           | N/A (Vercel)         | `z:\GFD\GFD Dev Projects\AI\`              |
| **Globaldeets**               | `globaldeets.com`              | Node/static             | `weave0/globaldeets`        | `globaldeets`        | `z:\GFD\GFD Dev Projects\Globaldeets\`     |
| **Jamie Mediation**           | `jamie-rigling-mediation.html` | Standalone HTML         | `weave0/jamie-mediation`    | —                    | `z:\GFD\jamie-rigling-mediation.html`      |
| **ThyOwn**                    | TBD                            | Python                  | — (no remote)               | —                    | `z:\GFD\GFD Dev Projects\ThyOwn\`          |
| **SummitView**                | —                              | Python                  | `weave0/SummitView`         | —                    | `z:\GFD\GFD Dev Projects\SummitView\`      |
| **Weave**                     | —                              | Python                  | — (no remote)               | —                    | `z:\GFD\GFD Dev Projects\Weave\`           |

**Cloudflare Account**: `Weave0` | Account ID: `3253d907ea85a18eb442283d7308b193`
**GitHub Org/User**: `weave0` | Auth: `gh` CLI (OAuth)
**Wrangler Auth**: OAuth token at `%APPDATA%\xdg.config\.wrangler\config\default.toml` (expires periodically — run `npx wrangler login` to refresh)

---

## 2. Cloudflare Infrastructure

### 2.1 Pages Projects

| CF Project           | Repo                        | Build Output    | Deploy Trigger                |
| -------------------- | --------------------------- | --------------- | ----------------------------- |
| `goodflippindesign`  | `weave0/goodflippindesign`  | `.` (repo root) | `git push main` → auto via CF |
| `good-flippin-vibes` | `weave0/good-flippin-vibes` | `dist/`         | `git push main` → auto via CF |
| `culturesherpa`      | `weave0/CultureSherpa`      | `dist/`         | CI → `wrangler pages deploy`  |
| `citizenapproved`    | `weave0/CitizenApproved`    | `out/`          | `wrangler pages deploy out`   |
| `globaldeets`        | `weave0/globaldeets`        | varies          | CF auto-deploy                |

### 2.2 Workers (Standalone — not Pages-bound)

| Worker Name            | Config File                                                           | Endpoint                                  | Purpose                                 |
| ---------------------- | --------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------- |
| `gfd-stripe`           | `z:\GFD\workers\wrangler-stripe.toml`                                 | `gfd-stripe.weave0.workers.dev`           | Stripe payment intents for donate.html  |
| `gfd-health-sweep`     | `z:\GFD\workers\wrangler-health-sweep.toml`                           | `gfd-health-sweep.weave0.workers.dev`     | Nightly ecosystem health checks         |
| `gfv-social-publisher` | `z:\GFD\wrangler-social.toml`                                         | `gfv-social-publisher.weave0.workers.dev` | Social media post scheduling/publishing |
| `gfv-auth`             | `z:\GFD\GFD Dev Projects\GFV\website\workers\wrangler-auth.toml`      | —                                         | GFV auth worker                         |
| `gfv-community`        | `z:\GFD\GFD Dev Projects\GFV\website\workers\wrangler-community.toml` | —                                         | GFV community features                  |
| `gfv-gratitude-wall`   | `z:\GFD\GFD Dev Projects\GFV\website\workers\wrangler-gratitude.toml` | —                                         | GFV gratitude wall                      |
| `sheriff-ai`           | `z:\GFD\GFD Dev Projects\GFV\website\workers\wrangler.toml`           | —                                         | Sheriff AI worker                       |

### 2.3 Workers (Pages Advanced Mode — inline in `_worker.js`)

| Project | Worker File                                                    | Companion Auth Worker    |
| ------- | -------------------------------------------------------------- | ------------------------ |
| GFD     | `z:\GFD\_worker.js`                                            | `z:\GFD\workers\auth.js` |
| GFV     | `z:\GFD\GFD Dev Projects\GFV\website\` (separate worker setup) | —                        |

**GFD `_worker.js` routing logic:**

- `/api/cms/media/{key}` → R2 `gfv-media` bucket (public, cached 1yr)
- `/api/*` → `workers/auth.js` (Clerk JWT verification, D1 ops)
- `/admin.html` → edge cookie check (requires `__session` or `__client_uat`)
- HTML responses → inject `window.ENV` (STRIPE_PUBLISHABLE_KEY, CLERK_PUBLISHABLE_KEY)
- Static → `env.ASSETS.fetch()`
- Blocked: `.md`, `.sql`, `.ps1`, `.sh`, `.py`, `.toml`, `.yml`, JSON (non-assets), root `.js` files, internal paths

**GFD Workers dir** (`z:\GFD\workers/`):

```
auth.js              — Clerk JWT verification, D1 profile ops, signed-in API
cms.js               — CMS API handlers
health-sweep.js      — Health monitoring logic
oauth.js             — OAuth token management
social-publisher.js  — Social platform publishing
stripe-payments.js   — Stripe payment intent creation
```

### 2.4 R2 Buckets

| Bucket                   | Binding                             | Usage                                               | Key Format                               |
| ------------------------ | ----------------------------------- | --------------------------------------------------- | ---------------------------------------- |
| `gfv-media`              | `MEDIA_BUCKET` (in `wrangler.toml`) | GFV + CS media assets; served via `/api/cms/media/` | `cms/media/{brand}-{name}-{hash8}.{ext}` |
| `culturesherpa-cultures` | —                                   | Legacy CS bucket (Dec 2025, ~empty)                 | —                                        |

**Current asset count (as of 2026-03-09):** 1,482 objects in `gfv-media`

- 859 GFV images (from `z:\GFD\GFD Dev Projects\GFV\website\public\` — art/, assets/, icons/, shared/)
- 623 CS images (from `S:\cultural_images\` — CultureSherpa.vhdx mounted as S:)

**CDN URL pattern**: `https://goodflippindesign.com/api/cms/media/{filename}`
**Re-run uploads**: `npm run r2:import` (or `--dry-run`)
**Upload script**: `z:\GFD\scripts\r2-bulk-import.js`

### 2.5 D1 Database

**Database**: `gfd_community` | ID: `a46ec9df-31b8-4285-845b-1fd3a62bd1b5`
**Binding** (in GFD `wrangler.toml`): `DB`

**All Tables:**

```
_cf_KV                  — Cloudflare internal KV
asset_brand_shares      — Cross-brand asset sharing
asset_overrides         — Active R2 image replacements per domain
badges                  — Community achievement badges
blog_posts              — Blog content
brand_workflows         — Brand automation workflows
cms_api_keys            — CMS API authentication
cms_asset_deployments   — Asset deployment tracking
cms_assets              — Primary asset catalog (1,891 rows: 871 gfv, 1,016 cs + others)
cms_audit_log           — CMS action audit trail
cms_campaigns           — Social media campaigns
cms_content             — Generic CMS content
cms_galleries           — Gallery definitions
cms_gallery_items       — Items in each gallery
cms_generated_assets    — DALL-E / AI generated assets
cms_platform_tokens     — OAuth tokens for social platforms
cms_post_variants       — Social post A/B variants
cms_prompt_registries   — DALL-E prompt templates
cms_social_posts        — Scheduled/published social posts
cms_webhooks            — Webhook configurations
comments                — Community comments
community_activity      — User activity feed
community_notifications — In-app notifications
community_posts         — Community posts
community_profiles      — Clerk-linked user profiles
community_reactions     — Post/comment reactions
community_xp            — Gamification XP tracking
cross_post_links        — Cross-site post associations
daily_check_ins         — Wellness check-ins
discovered_assets       — Auto-discovered site assets
gratitude_entries       — Gratitude wall entries
health_checks           — Ecosystem health sweep results
moderation_log          — Content moderation actions
mood_entries            — Mood tracker data
reactions               — Generic reactions
social_accounts         — Social platform account connections
sqlite_sequence         — SQLite auto-increment sequences
user_badges             — User badge assignments
user_metadata           — Extended user data
wellness_insights       — AI-generated wellness analytics
```

**Schema files** (all at `z:\GFD\`):

- `d1-schema-community.sql` — community tables
- `d1-schema-cms.sql` — CMS tables
- `d1-schema-health.sql` — health_checks table
- `d1-schema-media-platform.sql` — media platform tables
- `d1-schema-account-links.sql` — social_accounts table
- `d1-schema-console.sql` — console/admin tables

**D1 batch size limit**: 50 rows per INSERT (SQLITE_TOOBIG above ~200). See `buildInsertSQL()` in `scripts/r2-bulk-import.js`.

---

## 3. Integrations & Third-Party Services

### 3.1 Authentication — Clerk

| Property          | Value                                                                    |
| ----------------- | ------------------------------------------------------------------------ |
| Provider          | [dashboard.clerk.com](https://dashboard.clerk.com)                       |
| Auth methods      | Google OAuth, LinkedIn OAuth, email/password                             |
| Pages that use it | `community-portal.html` (GFD), `admin.html` (GFD)                        |
| Key injection     | `window.ENV.CLERK_PUBLISHABLE_KEY` via `_worker.js`                      |
| Secret            | `CLERK_SECRET_KEY` → set in CF Pages dashboard (GFD) + `workers/auth.js` |
| Local fallback    | Hardcoded pub key in `community-portal.html` for local dev               |
| JWT verification  | `workers/auth.js` — verifies `__session` cookie                          |

### 3.2 Payments — Stripe

| Property          | Value                                                                                     |
| ----------------- | ----------------------------------------------------------------------------------------- |
| Provider          | [dashboard.stripe.com](https://dashboard.stripe.com)                                      |
| Worker            | `gfd-stripe.weave0.workers.dev`                                                           |
| Page              | `donate.html` (GFD)                                                                       |
| Pub key injection | `window.ENV.STRIPE_PUBLISHABLE_KEY` via `_worker.js`                                      |
| Secret key        | `STRIPE_SECRET_KEY` → set on `gfd-stripe` worker                                          |
| Deploy cmd        | `npm run deploy:stripe`                                                                   |
| Secret cmd        | `npm run stripe:secret`                                                                   |
| Also in GFV       | `z:\GFD\GFD Dev Projects\GFV\website\workers\wrangler-stripe.toml` (worker: `gfd-stripe`) |

### 3.3 Contact Form — Formspree

| Property      | Value                                                 |
| ------------- | ----------------------------------------------------- |
| Provider      | [formspree.io](https://formspree.io)                  |
| Form ID       | `xgvgzjbw`                                            |
| Endpoint      | `https://formspree.io/f/xgvgzjbw`                     |
| Used in       | `index.html` (~line 5360), `assets/contact-form.html` |
| Recipient     | `brett.l.weaver@gmail.com`                            |
| Last verified | 2026-03-09 → `{"ok":true,"next":"/thanks"}` ✅        |

### 3.4 Error Tracking — Sentry

| Property         | Value                                                                   |
| ---------------- | ----------------------------------------------------------------------- |
| Provider         | sentry.io                                                               |
| DSN              | Set as CF Pages secret `SENTRY_DSN` (deployed 2026-03-09)               |
| Used in          | `workers/auth.js` (graceful degradation — worker still runs without it) |
| SDK              | `@sentry/cloudflare` in `package.json`                                  |
| Dashboard        | [sentry.io/organizations/...](https://sentry.io)                        |
| Local `.env` key | `SENTRY_DSN`                                                            |

### 3.5 Analytics — GA4

| Site           | Measurement ID                            |
| -------------- | ----------------------------------------- |
| GFD            | `G-XXXXXXXXXX` (in CF dashboard env vars) |
| GFV            | `G-JPV8DZTZH9` (in `.env`)                |
| AIAimate       | `G-JPV8DZTZH9` (in portal `.env.local`)   |
| GFD `.env` key | `GA_TRACKING_ID`                          |

### 3.6 AI — OpenAI

| Property       | Value                                                   |
| -------------- | ------------------------------------------------------- |
| Used in        | GFD CMS (DALL-E 3 generation), AIAimate portal, Weave   |
| Secret         | `OPENAI_API_KEY` — CF Pages secret (GFD) + `.env` files |
| GFD secret cmd | `wrangler secret put OPENAI_API_KEY`                    |
| AIAimate model | `OPENAI_MODEL` in `AI/portal/.env.local`                |

### 3.7 Social Publishing

| Platform       | Secret Key                                     | Status                                                 |
| -------------- | ---------------------------------------------- | ------------------------------------------------------ |
| Facebook/Meta  | `META_APP_ID`, `META_APP_SECRET`               | ⚠️ Needs manual retrieval from Meta Dev Console        |
| X (Twitter)    | `X_CLIENT_ID`, `X_CLIENT_SECRET`               | ⚠️ Needs manual retrieval                              |
| LinkedIn       | `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` | In GFD `.env` ✅                                       |
| Pinterest      | `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`     | ⚠️ Needs manual retrieval                              |
| TikTok         | `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`    | ⚠️ Needs manual retrieval                              |
| YouTube/Google | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`     | In GFD `.env` ✅                                       |
| Threads        | `THREADS_APP_ID`, `THREADS_APP_SECRET`         | ⚠️ Needs manual retrieval (App ID: `1248220120837224`) |

Secrets set via: `npm run social:secret:encrypt` / `npm run social:secret:internal`

### 3.8 Email / Notifications

| Service   | Used By          | Config                                     |
| --------- | ---------------- | ------------------------------------------ |
| Resend    | AIAimate portal  | `RESEND_API_KEY` in `AI/portal/.env.local` |
| Formspree | GFD contact form | endpoint `xgvgzjbw`                        |

---

## 4. Secrets & Environment Variables

### 4.1 GFD (Cloudflare Pages + Workers — `goodflippindesign`)

**CF Pages Secrets** (set via `wrangler pages secret put X --project-name goodflippindesign`):

```
STRIPE_PUBLISHABLE_KEY     ✅ Live
CLERK_PUBLISHABLE_KEY      ✅ Live
CLERK_SECRET_KEY           ✅ Live
SENTRY_DSN                 ✅ Set 2026-03-09
TOKEN_ENCRYPTION_KEY       ⚠️ Needed for social publisher OAuth flows
OPENAI_API_KEY             ⚠️ Needed for CMS DALL-E generation
```

**Social OAuth Secrets** (for `gfv-social-publisher` worker):

```
META_APP_ID / META_APP_SECRET       ⚠️ Not yet set
X_CLIENT_ID / X_CLIENT_SECRET       ⚠️ Not yet set
LINKEDIN_CLIENT_ID/SECRET           ✅ In .env (push to CF)
PINTEREST_APP_ID/SECRET             ⚠️ Not yet set
TIKTOK_CLIENT_KEY/SECRET            ⚠️ Not yet set
GOOGLE_CLIENT_ID/SECRET             ✅ In .env (push to CF)
THREADS_APP_ID/SECRET               ⚠️ Not yet set
```

**GFD `.env`** (local dev, NOT committed — `z:\GFD\.env`):

```
OPENAI_API_KEY, STRIPE_PUBLISHABLE_KEY, GA_TRACKING_ID, SENTRY_DSN,
CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, TOKEN_ENCRYPTION_KEY,
INTERNAL_SECRET, SOCIAL_PUBLISHER_URL, META_APP_SECRET,
THREADS_APP_SECRET, LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET,
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
```

### 4.2 GFV (`z:\GFD\GFD Dev Projects\GFV\website\.env`)

```
CLOUDFLARE_ACCOUNT_ID    — 3253d907ea85a18eb442283d7308b193
GA_MEASUREMENT_ID        — G-JPV8DZTZH9
```

### 4.3 AIAimate (`z:\GFD\GFD Dev Projects\AI\portal\.env.local`)

```
AI_PROVIDER, OPENAI_API_KEY, OPENAI_MODEL, CHROMA_URL,
NEXT_PUBLIC_APP_URL, NEXTAUTH_SECRET, NEXTAUTH_URL,
NEXT_PUBLIC_GA_MEASUREMENT_ID, NEXT_PUBLIC_GITHUB_SPONSOR,
NEXT_PUBLIC_KOFI_USERNAME, NEXT_PUBLIC_TWITTER_HANDLE,
NEWSLETTER_RECIPIENT_EMAIL, RESEND_API_KEY, DEBUG, LOG_LEVEL,
STRIPE_SECRET_KEY, NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
```

### 4.4 Weave (`z:\GFD\GFD Dev Projects\Weave\.env`)

```
OPENAI_API_KEY
```

---

## 5. Repositories & CI/CD

### 5.1 GFD — `weave0/goodflippindesign`

**Workflows** (`z:\GFD\.github\workflows/`):

| File                    | Trigger         | Does                                        |
| ----------------------- | --------------- | ------------------------------------------- |
| `ci.yml`                | PR + push       | Syncs temp_review, runs 144 Puppeteer tests |
| `deploy.yml`            | push main       | Force-triggers CF Pages deployment          |
| `force-deploy.yml`      | Manual          | Emergency CF Pages redeploy                 |
| `lighthouse.yml`        | Push + schedule | Lighthouse CI audit                         |
| `health-check.yml`      | Schedule (cron) | Hits production endpoints                   |
| `connect-github-cf.yml` | Manual          | Connects GitHub → CF Pages                  |

**Branch protection** (set 2026-03-09):

- Requires PR + 1 approving review
- Status check required: `CI - Tests (Cost Optimized) / Run Tests`
- Stale reviews dismissed on push

**Pre-commit hooks** (`.husky/pre-commit`):

- `node scripts/sync-review.js` — syncs `index.html` → `temp_review.html`
- `node scripts/update-cache-bust.js` — updates cache bust comment

**Key npm scripts:**

```
npm test                  — All 144 tests (7 suites, Puppeteer)
npm run test:a11y         — WCAG accessibility only
npm run test:quick        — sync + a11y (fastest)
npm run dev               — http-server localhost:3000
npm run build             — cache-bust + sync
npm run gen:csp           — Regenerate _headers from scripts/csp-config.js
npm run deploy:stripe     — Deploy gfd-stripe worker
npm run deploy:social     — Deploy gfv-social-publisher worker
npm run deploy:health-sweep — Deploy gfd-health-sweep worker
npm run r2:import         — Bulk upload images to R2 + seed D1
npm run r2:import:dry     — Dry run (no uploads)
npm run watermark         — Watermark images
npm run scan:media        — Scan Z:\MediaDrop for new assets
npm run sync:art          — Sync art drive to R2
npm run finance:*         — Finance workspace tools
```

### 5.2 GFV — `weave0/good-flippin-vibes`

**Workflows** (`z:\GFD\GFD Dev Projects\GFV\.github\workflows/`):

- `validate-build.yml` — CI build validation

**Recent git state**: Clean on `main` except 3 modified files (`art-catalog.json`, blog post, emoji audit)

**CF deploy**: `npx wrangler pages deploy dist --project-name good-flippin-vibes --branch main`

### 5.3 CultureSherpa — `weave0/CultureSherpa`

**Workflows** (`z:\GFD\GFD Dev Projects\CultureSherpa\.github\workflows/`):

- `ci.yml` — Build + test
- `deploy-production.yml` — Production deployment
- `gitleaks.yml` — Secret scanning
- `placeholder-gate.yml` — Placeholder content check
- `predeploy-guard.yml` — Pre-deploy safety checks
- `thyown-nightly.yml` — ThyOwn integration nightly check

**Stack**: Astro (frontend, `website-astro/`) + Python FastAPI (backend, `api/`)
**CF wrangler**: `culturesherpa` Pages project

### 5.4 CitizenApproved — `weave0/CitizenApproved`

**Workflows**: None configured yet ⚠️
**Stack**: Next.js 16, React 18, TypeScript, Tailwind CSS
**CF deploy**: `wrangler pages deploy out --project-name citizenapproved`

### 5.5 AIAimate — `weave0/aiaimate`

**Workflows**: `ci.yml` only
**Stack**: Next.js (portal in `AI/portal/`), deployed to Vercel
**Note**: Vercel handles CD — no CF Pages project

### 5.6 Globaldeets — `weave0/globaldeets`

**Workflows**: None ⚠️
**Stack**: Node/static + Python tools
**CF wrangler**: `globaldeets` (worker name: `globaldeets`)
**Notable**: Hosts Jamie Rigling mediation subdomain (`mediation.globaldeets.com`)

---

## 6. Project-Level Architecture

### 6.1 GFD (`z:\GFD\`)

```
index.html              — Main portfolio site (~7,260 lines: CSS 1-2000, HTML 2000-5200, JS 5200-7100)
community-portal.html   — Community platform (Clerk auth, dashboard, notifications)
donate.html             — Donations via Stripe + CF Worker
admin.html              — Admin panel (edge-protected via _worker.js)
temp_review.html        — Test target (mirrors index.html — DO NOT manually edit)
404.html                — Custom 404
privacy.html            — Privacy policy
terms.html              — Terms of service
gallery.html            — Media gallery
assets/contact-form.html — Standalone project inquiry form (Formspree)
jamie-rigling-mediation.html — Mediation landing page (standalone, weave0/jamie-mediation repo)
_worker.js              — CF Pages advanced mode worker (routing, R2, env injection)
_headers                — Security headers (CSP, HSTS, X-Frame-Options)
wrangler.toml           — Pages config (D1 + R2 bindings)
wrangler-social.toml    — Social publisher worker config
```

**CSS Architecture:**

```css
:root {
  --bg: #0d0d0d;
  --text: #f5f5f5;
  --text-muted: #8a8a8a; /* WCAG AA 4.5:1 minimum */
  --border: rgba(255, 255, 255, 0.06);
}
```

Fonts: Inter + JetBrains Mono (Google CDN)
Animations: `transform`/`opacity` only — never `all`, never layout properties

### 6.2 GFV (`z:\GFD\GFD Dev Projects\GFV\website\`)

**Build output**: `dist/`
**Image sources**: `public/art/` (777 images), `public/assets/`, `public/icons/`, `public/shared/`
**Workers**: auth, community, gratitude-wall, stripe, sheriff-ai (see §2.2)
**Modified files** (uncommitted): `art-catalog.json`, blog post, emoji audit

### 6.3 CultureSherpa (`z:\GFD\GFD Dev Projects\CultureSherpa\`)

**Frontend**: `website-astro/` (Astro, builds to `dist/`)
**Backend API**: `api/` (Python FastAPI)
**Image source**: `S:\cultural_images\` (S: drive = `CultureSherpa.vhdx` VHD)
**Auth**: `api/authz.py` → `require_roles("admin")` decorator
**Key files recently fixed**: `api/celebrations.py`, `api/cultural_images.py`, `api/s3_upload.py`, `website-astro/src/pages/admin/profile.astro`

### 6.4 Media Asset Pipeline

```
Source images → scripts/r2-bulk-import.js → R2 gfv-media bucket
                                          → D1 cms_assets table
                                          ↓
                          GFD _worker.js /api/cms/media/{key}
                                          ↓
                               Browser (cached 1yr, immutable)
```

**Watermarking**: `scripts/watermark.js` (supports platform-specific presets)
**Media drop sync**: `scripts/scan-media-drop.js` watches `Z:\MediaDrop\`
**Art drive sync**: `scripts/sync-art-drive.js` → R2
**Asset override**: `D1.asset_overrides` table lets `_worker.js` swap images per domain

### 6.5 Social Publishing Pipeline

```
Admin panel (admin.html)
  → /api/cms/social/* (workers/auth.js → workers/social-publisher.js)
  → D1 cms_social_posts / cms_platform_tokens / cms_campaigns
  → gfv-social-publisher worker
  → Platform APIs (Meta/X/LinkedIn/Pinterest/TikTok/YouTube/Threads)
```

**Encryption**: AES-GCM via `TOKEN_ENCRYPTION_KEY` secret (≥32 chars)

---

## 7. Test Suite

**Target**: `temp_review.html` (never `index.html` directly)
**Runner**: `node tests/run-all-tests.js` or `npm test`
**Framework**: Puppeteer

| Suite         | File                          | Tests                                        |
| ------------- | ----------------------------- | -------------------------------------------- |
| Accessibility | `tests/accessibility.test.js` | 14 — landmarks, ARIA, contrast, keyboard nav |
| Responsive    | `tests/responsive.test.js`    | —                                            |
| Community     | `tests/community.test.js`     | —                                            |
| Donate        | `tests/donate.test.js`        | —                                            |
| All suites    | `tests/run-all-tests.js`      | 144 total                                    |

**Viewports**: 375px (mobile) → 2560px (ultrawide), 7 breakpoints
**WCAG threshold**: 4.5:1 contrast, 44px tap targets, 500ms max transition
**Config**: `tests/test-config.js`
**Utilities**: `tests/test-utils.js` (TestResults, BrowserUtils, ColorUtils, Assertions)

**Coverage gaps**: `community-portal.html`, `donate.html` — 0% automated test coverage ⚠️

---

## 8. Security & Headers

**`_headers` file** (`z:\GFD\_headers`): Cloudflare Pages security headers

- CSP generated from `scripts/csp-config.js` → `npm run gen:csp`
- HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- Update process: edit `scripts/csp-config.js`, run `npm run gen:csp`, commit `_headers`
- CI blocks PRs if `_headers` is out of sync with `csp-config.js`

**Edge blocking** (`_worker.js`): Returns 404 for `.md`, `.sql`, `.ps1`, `.sh`, `.py`, internal paths, root JS files, non-assets JSON

**Admin protection**: `_worker.js` checks for `__session`/`__client_uat` cookie before serving `/admin.html`

**Branch protection** (GFD, set 2026-03-09):

- PR required, 1 review minimum
- `CI - Tests (Cost Optimized) / Run Tests` must pass

---

## 9. Finance & Operations Tools

```
npm run finance:help         — Show all finance commands
npm run finance:bootstrap    — Initialize finance workspace
npm run finance:status       — Current finance status
npm run finance:inventory    — Inventory finance inputs
npm run finance:package      — Package tax/finance submission
npm run finance:ga4:discover — Find GA4 properties
npm run finance:ga4:export   — Export GA4 data
npm run finance:stripe:export — Export Stripe transaction data
```

Finance scripts: `z:\GFD\scripts\finance/`

---

## 10. Local Dev Setup

```powershell
# GFD
Set-Location z:\GFD
npm run dev         # http-server at localhost:3000

# GFV
Set-Location "z:\GFD\GFD Dev Projects\GFV\website"
npm run dev         # Vite dev server

# CultureSherpa frontend
Set-Location "z:\GFD\GFD Dev Projects\CultureSherpa\website-astro"
npm run dev         # Astro dev server

# CultureSherpa API
Set-Location "z:\GFD\GFD Dev Projects\CultureSherpa\api"
# activate venv + uvicorn main:app --reload

# CitizenApproved
Set-Location "z:\GFD\GFD Dev Projects\CitizenApproved"
npm run dev         # Next.js dev server

# AIAimate
Set-Location "z:\GFD\GFD Dev Projects\AI\portal"
npm run dev         # Next.js dev server
```

**Virtual environments**: `z:\GFD\.venv\` (Python), CS has its own venv

---

## 11. Deployment Commands

```powershell
# GFD — auto-deploys on push to main
git -C z:\GFD push origin main
# Force redeploy if CF doesn't pick it up:
gh workflow run force-deploy.yml --repo weave0/goodflippindesign

# GFV — manual deploy from temp clone
$p = "$env:TEMP\copilot-good-flippin-vibes-2"
Set-Location $p; npm ci; npm run build
npx wrangler pages deploy dist --project-name good-flippin-vibes --branch main --commit-dirty=true

# CitizenApproved
$p = "$env:TEMP\copilot-CitizenApproved"
Set-Location $p; npx wrangler pages deploy out --project-name citizenapproved --branch main --commit-dirty=true

# CultureSherpa
# CI workflow handles production, or:
npx wrangler pages deploy dist --project-name culturesherpa

# Workers
npm run deploy:stripe            # gfd-stripe
npm run deploy:social            # gfv-social-publisher
npm run deploy:health-sweep      # gfd-health-sweep
```

---

## 12. Cloudflare CLI Cheat Sheet

```powershell
# Auth
npx wrangler login               # OAuth (opens browser)
npx wrangler whoami              # Verify auth status
gh auth status                   # GitHub CLI auth check

# Pages
npx wrangler pages list          # List all Pages projects
npx wrangler pages secret put KEY --project-name PROJECT

# Workers
npx wrangler deploy --config workers/wrangler-stripe.toml
npx wrangler secret put KEY --config workers/wrangler-stripe.toml

# D1
npx wrangler d1 list             # List all databases
npx wrangler d1 execute gfd_community --command "SELECT ..." --remote
npx wrangler d1 execute gfd_community --file=schema.sql --remote

# R2
npx wrangler r2 bucket list
npx wrangler r2 object list gfv-media --prefix "cms/media/"
# Bulk upload: use npm run r2:import (REST API, not wrangler per-file)

# GitHub branch protection (gh CLI)
gh api repos/weave0/goodflippindesign/branches/main/protection --method PUT \
  --field required_status_checks='{"strict":true,"contexts":["CI - Tests (Cost Optimized) / Run Tests"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true}' \
  --field restrictions=null
```

---

## 13. Known Gaps & Pending Work

### Requires OAuth Redirect (genuinely can't be CLI'd)

- [ ] Meta/Instagram/TikTok/Pinterest/X token refresh — platform login required
- [ ] `META_APP_SECRET`, `X_CLIENT_ID/SECRET`, `PINTEREST_APP_*`, `TIKTOK_CLIENT_*` — retrieve from dev consoles and push via `wrangler pages secret put`

### Code Stubs (CultureSherpa)

- [ ] `celebrations.astro:~1817` — S3/Lambda upload TODO
- [ ] `celebrations.astro:~2208` — "Add Family" dialog "coming soon"
- [ ] `quality.astro:15-30` — hardcoded worklist data (need `/api/quality/worklist` call)
- [ ] `website-astro/src/pages/admin/`: ConnectTab, ResearchTab, CultureRenderer — implement or hide

### Code Stubs (GFD)

- [ ] `workers/oauth.js` — cache invalidation stub at `api/invalidate.json.ts:82`

### CI/CD Gaps

- [ ] CitizenApproved — no GitHub Actions workflows
- [ ] Globaldeets — no GitHub Actions workflows
- [ ] AIAimate — only `ci.yml`, no CD

### Infrastructure

- [ ] GFV uncommitted changes: `art-catalog.json`, blog post, emoji audit
- [ ] `TOKEN_ENCRYPTION_KEY` — not yet set on CF Pages (needed for social OAuth flows)
- [ ] `OPENAI_API_KEY` — not confirmed set on CF Pages (needed for DALL-E in CMS)

### Monitoring

- [ ] Sentry DSN deployed ✅ but not verified receiving events
- [ ] No uptime monitoring (UptimeRobot or equivalent)
- [ ] GA4 deployed to 2/6 ecosystem sites only

---

## 14. Contact & Accounts

| Service        | Login                                                          | Notes                                           |
| -------------- | -------------------------------------------------------------- | ----------------------------------------------- |
| Cloudflare     | `brett.l.weaver@gmail.com`                                     | Account: Weave0, ID: `3253d907...`              |
| GitHub         | `weave0`                                                       | `gh` CLI authenticated                          |
| Clerk          | dashboard.clerk.com                                            | Google + LinkedIn + email/password auth methods |
| Stripe         | —                                                              | Test + live keys                                |
| Formspree      | —                                                              | Form `xgvgzjbw` → brett.l.weaver@gmail.com      |
| Sentry         | sentry.io                                                      | Org `o4510293463728128`                         |
| Google/GA4     | brett.l.weaver@gmail.com                                       | GA4 properties per site                         |
| Wrangler OAuth | Stored at `%APPDATA%\xdg.config\.wrangler\config\default.toml` | Expires periodically                            |
