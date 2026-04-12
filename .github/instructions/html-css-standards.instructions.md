---
description: "Use when writing, editing, or reviewing HTML/CSS/JS in index.html, community-portal.html, donate.html, admin.html, gallery.html, or any site page. Covers GPU animation rules, WCAG AA contrast, touch target sizes, IIFE pattern, no-framework rule, responsive breakpoints, and the required sync-to-temp_review step."
applyTo: "index.html, community-portal.html, donate.html, admin.html, gallery.html, 404.html, privacy.html, terms.html"
---

# GFD HTML/CSS/JS Standards

## Non-Negotiable Rules

### Animations — GPU only

```css
/* ✅ Allowed */
transition:
  transform 0.3s ease,
  opacity 0.3s ease,
  color 0.3s ease,
  background-color 0.3s ease,
  border-color 0.3s ease;
will-change: transform; /* Only on frequently-animated elements */

/* ❌ Forbidden */
transition: all 0.3s; /* causes layout thrashing */
transition: top 0.2s; /* non-GPU property */
transition: width 0.2s; /* non-GPU property */
```

Max transition duration: **500ms**.

### WCAG 2.1 AA — Contrast

- `--text-muted` must be `#8a8a8a` or **darker** (never lighter) to maintain 4.5:1 on `--bg: #0d0d0d`
- Verify new colors with the `ColorUtils.getContrastRatio()` helper in tests/test-utils.js before committing
- Run `npm run test:a11y` after any color change

### Touch Targets

All interactive elements (`a`, `button`, `input`, `select`, `textarea`) must have minimum **44×44px** hit area.

### CSS Variables (design tokens)

```css
:root {
  --bg: #0d0d0d;
  --text: #f5f5f5;
  --text-muted: #8a8a8a; /* minimum for WCAG AA */
  --border: rgba(255, 255, 255, 0.06);
}
```

Never hardcode these colors — always use the variable.

## JavaScript Pattern

All JS in site pages must be wrapped in an IIFE:

```javascript
(function () {
  "use strict";
  // all code here — no global scope pollution
})();
```

- `debounce()` helper must be defined before use
- Email address must remain obfuscated: never write `getsome@goodflippinvibes.com` as a literal string

## No Frameworks Rule

These pages are **vanilla HTML/CSS/JS only**. Do not add React, Vue, jQuery, or any npm-managed framework. CDN fonts (Google Fonts) are the only external dependency allowed in HTML files (beyond Clerk, Stripe, and Formspree on their specific pages).

## Responsive Breakpoints

```css
@media (max-width: 900px) {
  /* Tablet */
}
@media (max-width: 600px) {
  /* Mobile */
}
```

- Mobile font minimum: **14px** (0.875rem)
- Grid: `grid-template-columns: repeat(auto-fit, minmax(340px, 1fr))`

## Accessibility Requirements

- Skip link must exist, hidden until focused, using `transform` (not `top`) to hide/show
- All `<section>` elements need an `id` for anchor navigation
- External links: `rel="noopener"` is required
- Structural landmarks: `<main>`, `<nav>`, `<header>`, `<footer>` — always semantic

## Critical: Sync Step

After editing **index.html**, you MUST sync to test target:

```powershell
npm run sync       # or: node scripts/sync-review.js
npm test           # runs full suite (pretest hook syncs automatically)
npm run test:quick # faster: sync + a11y only
```

`temp_review.html` is what the test suite targets — if it's out of sync, tests are meaningless.

## CSP Changes

If adding a new external resource (script, font, image CDN):

1. Edit `scripts/csp-config.js` — this is the source of truth
2. Run `npm run gen:csp` to regenerate `_headers`
3. Commit both files
   Never hand-edit `_headers` directly.
