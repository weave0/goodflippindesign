# Good Flippin Design - AI Coding Agent Instructions

## Project Overview

This is a **static portfolio website** for Brett Weaver's web development consultancy (GFV LLC DBA Good Flippin Vibes). Built as a **single-file architecture** with vanilla HTML/CSS/JavaScript—no build tools, no frameworks. Priority: WCAG 2.1 AA accessibility, GPU-accelerated animations, and 97.2% test coverage.

## Architecture Decisions

### Single-File Pattern

- **[index.html](../index.html)**: Production site (1044 lines) - all styles inline, all JavaScript inline
- **[temp_review.html](../temp_review.html)**: Testing target - mirror of index.html for test runs
- **Why**: Zero dependencies, instant load, no compilation step, GitOps-friendly deployment
- **Cache busting**: Manual HTML comment `<!-- Cache bust: YYYY-MM-DD-HH:MM -->` updated via [cache-bust.txt](../cache-bust.txt)

### CSS Architecture

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

## ⚠️ Enterprise Readiness Gaps

### Critical Missing Infrastructure

**1. CI/CD Pipeline (HIGH PRIORITY)**

```yaml
# Missing: .github/workflows/ci.yml
# Should include:
# - Automated test runs on PR
# - Accessibility audits (Lighthouse CI)
# - Visual regression testing
# - Auto-sync index.html → temp_review.html
# - Cache bust automation
# - Deploy to GitHub Pages/Cloudflare
```

**2. Manual Sync Risk (CRITICAL)**

- **Problem**: index.html and temp_review.html manually kept in sync
- **Risk**: Divergence causes false test passes/failures
- **Solution**: Pre-commit hook or GitHub Action to auto-sync

```bash
# Should exist: scripts/sync-review.sh
cp index.html temp_review.html
```

**3. Cache Busting Automation**

- **Current**: Manual HTML comment update via cache-bust.txt
- **Should be**: Automated timestamp injection during build/deploy

```javascript
// Missing: scripts/update-cache-bust.js
const timestamp = new Date().toISOString().slice(0, 16).replace("T", "-");
```

**4. Security Headers (MISSING)**

```nginx
# Should configure via _headers (Netlify) or wrangler.toml (Cloudflare):
Content-Security-Policy: default-src 'self' https://fonts.googleapis.com
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

**5. Configuration Management**

- **Missing**: Environment variables for:
  - Formspree form ID (currently hardcoded placeholder)
  - Analytics IDs
  - API keys for future integrations
- **Should be**: `.env.example` committed, `.env` in .gitignore (already done)

### Process Improvements Needed

**Git Workflow**

```bash
# Missing: Branch protection rules
# - Require PR reviews
# - Require status checks (tests pass)
# - No direct commits to main

# Missing: Pre-commit hooks (.husky/)
npm install -D husky
npx husky init
# Add: lint, test, sync-review checks
```

**Development Server**

```json
// Should add to package.json:
"scripts": {
  "dev": "npx live-server --port=3000 --watch=index.html",
  "test": "node tests/run-all-tests.js",
  "test:watch": "nodemon --watch index.html --watch tests/ --exec 'npm test'",
  "sync": "cp index.html temp_review.html",
  "build": "node scripts/build.js",  // Minify, cache bust, etc.
  "deploy": "npm run build && wrangler pages publish ."
}
```

**Code Quality Automation**

```json
// Missing: .vscode/settings.json (workspace standards)
{
  "editor.formatOnSave": true,
  "editor.codeActionsOnSave": {
    "source.fixAll": true
  },
  "files.associations": {
    "*.html": "html"
  }
}
```

**Monitoring & Analytics**

- No error tracking (Sentry, LogRocket)
- No performance monitoring (Web Vitals)
- No user analytics (privacy-respecting option like Plausible)
- No uptime monitoring

### Immediate Action Items (Priority Order)

**Week 1: Automation**

1. Create `.github/workflows/ci.yml` - run tests on PR
2. Create `.github/workflows/deploy.yml` - auto-deploy to Cloudflare Pages
3. Add pre-commit hook to sync index.html → temp_review.html
4. Automate cache bust timestamp

**Week 2: Security & Config**

1. Set up environment variables (`.env.example`)
2. Configure Formspree with real form ID
3. Add security headers via `_headers` or `wrangler.toml`
4. Set up branch protection rules

**Week 3: Monitoring**

1. Add Plausible Analytics (privacy-friendly)
2. Set up uptime monitoring (UptimeRobot free tier)
3. Add Web Vitals tracking to JS
4. Configure error boundary for JS errors

**Week 4: Developer Experience**

1. Add npm scripts for dev workflow
2. Create `.vscode/settings.json` with standards
3. Add Lighthouse CI to GitHub Actions
4. Document deployment process

### Configuration Files Needed

```
.github/
  workflows/
    ci.yml           # ❌ Missing
    deploy.yml       # ❌ Missing
    lighthouse.yml   # ❌ Missing
.vscode/
  settings.json    # ❌ Missing
  extensions.json  # ❌ Missing
scripts/
  sync-review.sh   # ❌ Missing
  update-cache-bust.js # ❌ Missing
  build.js         # ❌ Missing
.env.example       # ❌ Missing
wrangler.toml      # ❌ Missing (if using Cloudflare)
_headers           # ❌ Missing (security headers)
.husky/
  pre-commit       # ❌ Missing
```

### Architecture Decision: Stay Single-File or Modularize?

**Current State**: All-in-one HTML (1044 lines)

**Enterprise Considerations**:

- ✅ **Keep** for sites under 2000 lines
- ✅ Zero build complexity (current advantage)
- ⚠️ **Consider build step** if:
  - Adding 5+ more portfolio items (will exceed 1500 lines)
  - Need component reuse across multiple pages
  - Want TypeScript for JS sections
  - Need CSS autoprefixer for broader browser support

**Recommended**: Stay single-file BUT add build pipeline for:

- Minification (production optimization)
- Cache busting automation
- Security header injection
- HTML validation
- Asset optimization (image compression)

### Quick Win: GitHub Actions Template

Create `.github/workflows/ci.yml`:

```yaml
name: CI
on: [pull_request, push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: cp index.html temp_review.html # Auto-sync
      - run: npm test
      - name: Lighthouse CI
        uses: treosh/lighthouse-ci-action@v10
        with:
          urls: http://localhost:3000
          uploadArtifacts: true
```
