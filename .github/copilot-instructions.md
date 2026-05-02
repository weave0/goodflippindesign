# Good Flippin Design - AI Coding Agent Instructions

## ⚠️ Domain Rule — Read This First

Two domains coexist intentionally; both are first-class:

- **goodflippindesign.com** — the **studio / parent company** surface. The production stack lives here: CF Pages CNAME, Stripe webhook, Clerk app `clerk.goodflippindesign.com`, legal "Site" definition (Terms/Privacy), worker `ALLOWED_ORIGIN`, sitemap, canonicals, health probes. Use this URL when referring to the live deploy, the company, the studio, infrastructure, legal, or production endpoints.
- **goodflippinvibes.com** — the **consumer-facing brand depicted in the content** (the voice the studio publishes under). Has its own Clerk subdomain `clerk.goodflippinvibes.com`, frame-src in CSP, used for the community-portal user surface. Use this URL when referring to the brand, community, audience-facing experience, or the GFV LLC DBA.

Do **not** do blind find-replace from one to the other — they map to different real DNS records, Clerk apps, and Stripe/legal anchors. The GitHub repo `weave0/goodflippindesign` is named after the studio (correct, not a mismatch).

## Project Overview

This is the production website and community platform for Brett Weaver's web development consultancy (GFV LLC DBA Good Flippin Vibes). The site is **multi-page vanilla HTML/CSS/JavaScript** — no build tools, no frameworks. It pairs a portfolio/marketing site with a community portal (Clerk auth), a donation page (Stripe via Cloudflare Worker), and a contact form (Formspree).

**Priorities**: WCAG 2.1 AA accessibility, GPU-accelerated animations, 98.6%+ test coverage.

---

## Site Architecture

### Pages

| File                                                    | Purpose                                                            | Lines         |
| ------------------------------------------------------- | ------------------------------------------------------------------ | ------------- |
| [index.html](../index.html)                             | Main portfolio + contact + blog                                    | ~7,260        |
| [community-portal.html](../community-portal.html)       | Community platform (Clerk auth, dashboard, notifications, members) | ~4,045        |
| [donate.html](../donate.html)                           | Donations via Stripe + Cloudflare Worker                           | ~1,000        |
| [temp_review.html](../temp_review.html)                 | Test target — must mirror index.html changes                       | mirrors index |
| [assets/contact-form.html](../assets/contact-form.html) | Standalone project inquiry form (Formspree)                        | ~400          |
| [404.html](../404.html)                                 | Custom 404                                                         | small         |

### Edge Layer (Cloudflare)

| File                                                        | Purpose                                                                                 |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| [\_worker.js](../_worker.js)                                | Pages advanced-mode worker: routes `/api/*`, injects `window.ENV`, serves static assets |
| [workers/auth.js](../workers/auth.js)                       | Auth worker: Clerk JWT verification, D1 profile ops, signed-in API                      |
| [workers/stripe-payments.js](../workers/stripe-payments.js) | Stripe payment intents (deployed as `gfd-stripe.weave0.workers.dev`)                    |
| [\_headers](../_headers)                                    | Cloudflare security headers (CSP, HSTS, X-Frame-Options)                                |
| [wrangler.toml](../wrangler.toml)                           | Pages config — `nodejs_compat`, D1 binding `gfd_community`                              |

### Environment Variables

`_worker.js` injects a `window.ENV` object into every HTML response:

```javascript
window.ENV = {
  STRIPE_PUBLISHABLE_KEY: env.STRIPE_PUBLISHABLE_KEY || null,
  CLERK_PUBLISHABLE_KEY: env.CLERK_PUBLISHABLE_KEY || null,
};
```

Cloudflare secrets (set via Cloudflare dashboard or `wrangler secret put`):

- `STRIPE_PUBLISHABLE_KEY` — Stripe pub key (Pages worker)
- `STRIPE_SECRET_KEY` — Stripe secret (stripe-payments worker only)
- `CLERK_SECRET_KEY` — Clerk backend secret (auth worker)
- `SENTRY_DSN` — Sentry error tracking (auth worker)

Community portal reads `window.ENV?.CLERK_PUBLISHABLE_KEY` with a hardcoded fallback for local dev.

---

## Previous Architecture (now superseded)

### Single-File Pattern (no longer accurate)

`index.html` grew from ~1,044 to ~7,260 lines as new sections were added. It remains all-in-one (CSS + HTML + JS in a single file), but the project now has companion standalone pages.

---

## CSS Architecture (index.html)

```css
:root {
  --bg: #0d0d0d;
  --text: #f5f5f5;
  --text-muted: #8a8a8a; /* WCAG AA 4.5:1 contrast minimum */
  --border: rgba(255, 255, 255, 0.06);
}
```

- **Design system**: Dark theme, Inter + JetBrains Mono fonts via Google CDN
- **Animation rule**: Use `transform`/`opacity` only (GPU-accelerated), never `all`, never layout-triggering properties
- **Touch targets**: Minimum 44px for all interactive elements (`a, button, input`)
- **Example pattern**:
  ```css
  .portfolio-card {
    transition:
      transform 0.3s ease,
      border-color 0.3s ease;
    will-change: transform; /* GPU hint */
  }
  ```

---

## JavaScript Patterns (index.html)

Located at the **bottom of [index.html](../index.html)** (approximately lines 5200–7100):

- **IIFE wrapper**: All code in `(function() { ... })()` to avoid global scope pollution
- **Utilities first**: `debounce()` helper defined before use
- **Progressive enhancement**: 9+ UX features (form validation, scroll reveals, lazy loading, exit intent, blog modal)
- **Email obfuscation**: `getsome@goodflippinvibes.com` split in JS to avoid bot scrapers
- **Contact form** (~line 5360): async fetch to `https://formspree.io/f/xgvgzjbw`
- **Performance monitoring**: Dev-only `console.warn` if page load > 3000ms

---

## Test Suite (Puppeteer-based)

### Running Tests

```powershell
npm test                   # All 7 suites — 144 tests
npm run test:a11y          # Accessibility only
npm run test:responsive    # Responsive only
npm run test:quick         # sync + accessibility (fastest)
```

### Test Configuration

- **[test-config.js](../tests/test-config.js)**: Centralized config (viewports, timing thresholds, WCAG standards)
- **Target**: `temp_review.html` not `index.html` (to avoid false positives from live edits)
- **Viewports**: 7 breakpoints from 375px (mobile) to 2560px (ultrawide)
- **Thresholds**:
  - Max transition: 500ms
  - Min contrast ratio: 4.5:1 (WCAG AA)
  - Min tap target: 44px

### Test Utilities ([test-utils.js](../tests/test-utils.js))

```javascript
const {
  TestResults,
  BrowserUtils,
  ElementUtils,
  ColorUtils,
  Assertions,
} = require("./test-utils");

// Usage pattern in tests:
const results = new TestResults("Suite Name");
const browser = await BrowserUtils.launchBrowser();
const page = await BrowserUtils.createPage(browser);

// Color contrast check example:
const ratio = await ColorUtils.getContrastRatio(page, selector, property);
Assertions.isGreaterThanOrEqual(ratio, 4.5, "WCAG AA contrast");
```

**⚠️ `community-portal.html` and `donate.html` have no automated tests yet.**

---

## Critical Workflows

### 1. Making HTML/CSS Changes to index.html

```powershell
# 1. Edit index.html
# 2. Run tests (auto-syncs to temp_review.html via pretest hook)
npm test
# 3. Commit — Husky pre-commit updates cache bust + verifies sync
git add . && git commit -m "feat: description"
```

### 2. Editing community-portal.html or donate.html

No automated test suite for these pages — test manually via:

```powershell
npm run dev    # starts http-server at localhost:3000
```

### 3. Deploying

```powershell
git push origin main    # Cloudflare Pages auto-deploys in ~2 min
```

Force-deploy if Cloudflare doesn't auto-trigger:
→ GitHub → Actions → "Force Cloudflare Pages Deployment" → Run workflow

### 4. CSP Updates

```powershell
# 1. Edit scripts/csp-config.js
npm run gen:csp         # regenerates _headers
# 2. Commit _headers — CI blocks PRs if out of sync
```

### 5. Accessibility Requirements

- **Skip link**: Always present, hidden until focused, uses `transform` not `top`
- **Landmarks**: `<main>`, `<nav>`, semantic HTML everywhere
- **External links**: Must have `rel="noopener"` on portfolio cards and all off-site links
- **Color contrast**: Use [ColorUtils.js](../tests/test-utils.js) to verify 4.5:1 ratio minimum

### 6. Animation Performance

**Forbidden**:

```css
transition: all 0.3s; /* ❌ Causes layout thrashing */
transition: top 0.2s; /* ❌ Non-GPU property */
```

**Correct**:

```css
transition:
  transform 0.3s ease,
  opacity 0.3s ease;
will-change: transform; /* GPU hint for frequent animations */
```

---

## Project-Specific Conventions

### Responsive Breakpoints

```css
@media (max-width: 900px) {
  /* Tablet */
}
@media (max-width: 600px) {
  /* Mobile */
}
```

- **Font sizes**: Minimum 14px (0.875rem) on mobile—see `.hero-eyebrow`, `.section-label`
- **Grid collapse**: `grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))`

### Component Patterns

```html
<!-- Service cards: grid with 1px borders via background technique -->
<div class="services-grid" style="gap: 1px; background: var(--border);">
  <div class="service-card" style="background: var(--bg);">
    <!-- content -->
  </div>
</div>
```

### Form Validation (~line 5200)

```javascript
// Real-time validation with visual feedback
emailInput.addEventListener(
  "input",
  debounce(function () {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
    this.style.borderColor = isValid ? "var(--success)" : "var(--error)";
  }, 300),
);
```

---

## Business Context

### Portfolio Projects

- Lives on globaldeets.com subdomain ecosystem
- Examples: `eliassen.globaldeets.com`, `kp-strategic-globalization.netlify.app`
- Focus: Business intelligence dashboards, data visualization, healthcare analytics

### Contact Flow

- Email: `getsome@goodflippinvibes.com` (obfuscated in JS)
- Main form in `index.html`: Formspree `xgvgzjbw` → brett.l.weaver@gmail.com
- Standalone inquiry form: [assets/contact-form.html](../assets/contact-form.html) (same Formspree endpoint)
- Budget tiers: $5K, $5-15K, $15-50K, $50K+ (see [PROJECT_INQUIRY_FLOW.md](../PROJECT_INQUIRY_FLOW.md))

---

## Key Files Reference

| File                                                          | Purpose                | Critical Details                                             |
| ------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| [index.html](../index.html)                                   | Production site        | ~7,260 lines — CSS ~1-2000, HTML ~2000-5200, JS ~5200-7100   |
| [community-portal.html](../community-portal.html)             | Community platform     | ~4,045 lines — Clerk auth, dashboard, notifications, members |
| [donate.html](../donate.html)                                 | Donations              | Stripe + Cloudflare Worker                                   |
| [temp_review.html](../temp_review.html)                       | Test target            | Must mirror index.html                                       |
| [\_worker.js](../_worker.js)                                  | Cloudflare edge worker | Routes /api/\*, injects window.ENV                           |
| [workers/auth.js](../workers/auth.js)                         | Auth worker            | Clerk JWT, D1 ops                                            |
| [workers/stripe-payments.js](../workers/stripe-payments.js)   | Payments worker        | Stripe payment intents                                       |
| [scripts/csp-config.js](../scripts/csp-config.js)             | CSP source of truth    | Edit here, run `npm run gen:csp`                             |
| [tests/test-config.js](../tests/test-config.js)               | Test standards         | WCAG thresholds, viewport configs                            |
| [tests/accessibility.test.js](../tests/accessibility.test.js) | a11y suite             | 14 tests: landmarks, ARIA, contrast, keyboard nav            |

---

## Quick Reference

**Add new portfolio item**:

1. Find `.portfolio-grid` in index.html (search for the class — it's in the HTML section ~3000-5000)
2. Copy existing `.portfolio-card` structure
3. Update `.portfolio-category`, `.portfolio-info h3`, `.portfolio-tech` tags
4. Add `rel="noopener"` if external link
5. `npm test`

**Fix contrast issue**:

1. Check `--text-muted` value in `:root` (must be `#8a8a8a` or darker for 4.5:1)
2. Run: `npm run test:a11y` to verify
3. Update both index.html and temp_review.html

**Performance regression**:

1. Check transitions use only `transform`, `opacity`, `color`, `background-color`, `border-color`
2. Run: `npm run test` (animations suite is included)
3. Verify `will-change` hints on frequently animated elements

---

## Infrastructure Status (as of 2026-03-03)

| Component                        | Status         | Files                                                                                                     |
| -------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| CI/CD Pipeline                   | ✅ 6 workflows | `ci.yml`, `deploy.yml`, `lighthouse.yml`, `force-deploy.yml`, `health-check.yml`, `connect-github-cf.yml` |
| Pre-commit hooks                 | ✅ Husky       | `.husky/pre-commit` — syncs temp_review.html, updates cache bust                                          |
| Cache bust automation            | ✅             | `scripts/update-cache-bust.js`                                                                            |
| Security headers                 | ✅             | `_headers` + CSP generated from `scripts/csp-config.js`                                                   |
| Clerk auth                       | ✅ Live        | Google + LinkedIn + email/password                                                                        |
| Stripe Worker                    | ✅ Live        | `gfd-stripe.weave0.workers.dev`                                                                           |
| Sentry                           | ⚠️             | Worker gracefully degrades; set `SENTRY_DSN` secret to enable                                             |
| D1 database                      | ✅ configured  | `gfd_community` binding in wrangler.toml                                                                  |
| Test coverage (index)            | ✅ 98.6%       | 141/144 passing (as of 2026-01-28 — re-run needed)                                                        |
| Test coverage (community/donate) | ❌ 0%          | No tests written yet                                                                                      |
| Branch protection                | ⚠️             | Direct pushes to `main` still possible                                                                    |

```css
:root {
  --bg: #0d0d0d;
  --text: #f5f5f5;
  --text-muted: #8a8a8a; /* WCAG AA 4.5:1 contrast minimum */
  --border: rgba(255, 255, 255, 0.06);
}
```

- **Design system**: Dark theme, Inter + JetBrains Mono fonts via Google CDN
- **Animation rule**: Use `transform`/`opacity` only (GPU-accelerated), never `all`, never layout-triggering properties
- **Touch targets**: Minimum 44px for all interactive elements (`a, button, input`)
- **Example pattern** (see lines 240-265):
  ```css
  .portfolio-card {
    transition:
      transform 0.3s ease,
      border-color 0.3s ease;
    will-change: transform; /* GPU hint */
  }
  ```

### JavaScript Patterns

Located at bottom of [index.html](../index.html) (lines 800-1040):

- **IIFE wrapper**: All code in `(function() { ... })()` to avoid global scope pollution
- **Utilities first**: `debounce()` helper defined before use
- **Progressive enhancement**: 9 UX features (form validation, scroll reveals, lazy loading)
- **Email obfuscation** (line 1010): `getsome@goodflippinvibes.com` split to avoid bot scrapers
- **Performance monitoring**: Dev-only `console.warn` if page load > 3000ms

## Test Suite (Puppeteer-based)

### Running Tests

```powershell
node tests/run-all-tests.js  # All 144 tests across 7 suites
```

### Test Configuration

- **[test-config.js](../tests/test-config.js)**: Centralized config (viewports, timing thresholds, WCAG standards)
- **Target**: `temp_review.html` not `index.html` (to avoid false positives from live edits)
- **Viewports**: 7 breakpoints from 375px (mobile) to 2560px (ultrawide)
- **Thresholds**:
  - Max transition: 500ms
  - Min contrast ratio: 4.5:1 (WCAG AA)
  - Min tap target: 44px

### Test Utilities ([test-utils.js](../tests/test-utils.js))

```javascript
const {
  TestResults,
  BrowserUtils,
  ElementUtils,
  ColorUtils,
  Assertions,
} = require("./test-utils");

// Usage pattern in tests:
const results = new TestResults("Suite Name");
const browser = await BrowserUtils.launchBrowser();
const page = await BrowserUtils.createPage(browser);

// Color contrast check example:
const ratio = await ColorUtils.getContrastRatio(page, selector, property);
Assertions.isGreaterThanOrEqual(ratio, 4.5, "WCAG AA contrast");
```

## Critical Workflows

### 1. Making HTML/CSS Changes

```powershell
# 1. Edit index.html
# 2. Copy changes to temp_review.html (test target)
# 3. Run tests
node tests/run-all-tests.js
# 4. Update cache bust comment in index.html
# 5. Commit both files
```

### 2. Accessibility Requirements

- **Skip link**: Always present, hidden until focused, uses `transform` not `top` (line 480)
- **Landmarks**: `<main>`, `<nav>`, semantic HTML everywhere
- **External links**: Must have `rel="noopener"` (see portfolio cards line 750)
- **Color contrast**: Use [ColorUtils.js](../tests/test-utils.js) to verify 4.5:1 ratio minimum

### 3. Animation Performance

**Forbidden**:

```css
transition: all 0.3s; /* ❌ Causes layout thrashing */
transition: top 0.2s; /* ❌ Non-GPU property */
```

**Correct**:

```css
transition:
  transform 0.3s ease,
  opacity 0.3s ease;
will-change: transform; /* GPU hint for frequent animations */
```

## Project-Specific Conventions

### Responsive Breakpoints

```css
@media (max-width: 900px) {
  /* Tablet */
}
@media (max-width: 600px) {
  /* Mobile */
}
```

- **Font sizes**: Minimum 14px (0.875rem) on mobile—see `.hero-eyebrow`, `.section-label`
- **Grid collapse**: `grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))`

### Component Patterns

```html
<!-- Service cards: grid with 1px borders via background technique -->
<div class="services-grid" style="gap: 1px; background: var(--border);">
  <div class="service-card" style="background: var(--bg);">
    <!-- content -->
  </div>
</div>
```

### Form Validation (see line 850-890)

```javascript
// Real-time validation with visual feedback
emailInput.addEventListener(
  "input",
  debounce(function () {
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.value);
    this.style.borderColor = isValid ? "var(--success)" : "var(--error)";
  }, 300),
);
```

## Business Context

### Portfolio Projects

- Lives on globaldeets.com subdomain ecosystem
- Examples: `eliassen.globaldeets.com`, `kp-strategic-globalization.netlify.app`
- Focus: Business intelligence dashboards, data visualization, healthcare analytics

### Contact Flow

- Email: `getsome@goodflippinvibes.com` (obfuscated in JS)
- Form: [assets/contact-form.html](../assets/contact-form.html) (Formspree integration)
- Budget tiers: $5K, $5-15K, $15-50K, $50K+ (see [PROJECT_INQUIRY_FLOW.md](../PROJECT_INQUIRY_FLOW.md))

## Key Files Reference

| File                                                                | Purpose         | Critical Details                                            |
| ------------------------------------------------------------------- | --------------- | ----------------------------------------------------------- |
| [index.html](../index.html)                                         | Production site | Lines 1-100: CSS vars, 200-300: components, 800-1040: UX JS |
| [temp_review.html](../temp_review.html)                             | Test target     | Must mirror index.html changes                              |
| [tests/test-config.js](../tests/test-config.js)                     | Test standards  | WCAG thresholds, viewport configs                           |
| [tests/accessibility.test.js](../tests/accessibility.test.js)       | a11y suite      | 14 tests: landmarks, ARIA, contrast, keyboard nav           |
| [UX_PERFORMANCE_IMPROVEMENTS.md](../UX_PERFORMANCE_IMPROVEMENTS.md) | Recent fixes    | Animation perf, accessibility, responsive issues resolved   |

## Quick Reference

**Add new portfolio item**:

1. Find `.portfolio-grid` (~line 650)
2. Copy existing `.portfolio-card` structure
3. Update `.portfolio-category`, `.portfolio-info h3`, `.portfolio-tech` tags
4. Add `rel="noopener"` if external link
5. Mirror to temp_review.html and test

**Fix contrast issue**:

1. Check `--text-muted` value in `:root` (must be `#8a8a8a` or darker for 4.5:1)
2. Run: `node tests/accessibility.test.js` to verify
3. Update both index.html and temp_review.html

**Performance regression**:

1. Check transitions use only `transform`, `opacity`, `color`, `background-color`, `border-color`
2. Run: `node tests/animations.test.js`
3. Verify `will-change` hints on frequently animated elements

## Enterprise Readiness Status (Updated 2026-02-09)

### Infrastructure — All Built ✅

Every item originally listed as "missing" has been implemented:

| Component             | Status         | Files                                                                                                                                    |
| --------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| CI/CD Pipeline        | ✅ 5 workflows | `.github/workflows/ci.yml`, `deploy.yml`, `lighthouse.yml`, `force-deploy.yml`, `connect-github-cf.yml`                                  |
| Pre-commit hooks      | ✅ Husky       | `.husky/pre-commit` — auto-syncs temp_review.html, updates cache bust, blocks node_modules                                               |
| Cache bust automation | ✅             | `scripts/update-cache-bust.js`, auto-runs in pre-commit                                                                                  |
| File sync             | ✅             | `scripts/sync-review.js`, `sync-review.sh`, `sync-review.ps1`                                                                            |
| Build script          | ✅             | `scripts/build.js`                                                                                                                       |
| Security headers      | ✅             | `_headers` (Cloudflare Pages)                                                                                                            |
| Config management     | ✅             | `.env.example`, `wrangler.toml`                                                                                                          |
| VS Code workspace     | ✅             | `.vscode/settings.json` (266 lines), `.vscode/extensions.json` (47 lines)                                                                |
| npm scripts           | ✅ 12 scripts  | `dev`, `sync`, `test`, `test:quick`, `test:watch`, `test:a11y`, `test:responsive`, `cache-bust`, `build`, `format`, `lint:html`, `clean` |

### Architecture Decision: Single-File (Confirmed)

**Current**: All-in-one HTML — staying single-file. Build pipeline handles:

- Cache bust automation (pre-commit + `npm run build`)
- Auto-sync to test target (pre-commit)
- HTML validation (`npm run lint:html`)
- Formatting (`npm run format` via Prettier)

### Remaining Gaps

**Monitoring & Observability** (not yet implemented):

- No error tracking (Sentry, LogRocket, or equivalent)
- No uptime monitoring (UptimeRobot or equivalent)
- No Web Vitals client-side tracking
- GA4 analytics committed but only deployed to 2 of 6 ecosystem sites

**Cross-Ecosystem CI/CD**:

- CitizenApproved — no CI/CD workflows (needs build + type-check on PR, auto-flatten RSC)
- AI Aimate — no CI workflows (Vercel handles CD)
- CultureSherpa — no CI/CD (manual S3 deploy)

**Branch Protection**: Not confirmed on any repository — direct pushes to `main` still possible.

**Formspree**: `.env.example` has placeholder form IDs — production configuration status unclear.
