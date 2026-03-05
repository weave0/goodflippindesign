# Contributing to Good Flippin Design

Thanks for your interest in contributing! This document outlines the process and standards for the project.

## Getting Started

```bash
# Clone and install
git clone https://github.com/weave0/goodflippindesign.git
cd goodflippindesign
npm install

# Start local dev server
npm run dev

# Run the full test suite
npm test
```

## Development Workflow

1. **Branch from `main`** — use descriptive names: `feat/new-section`, `fix/contrast-issue`
2. **Make changes** — edit `index.html` (the single-file production site)
3. **Pre-commit hooks run automatically** (via Husky):
   - Syncs `index.html` → `temp_review.html` (test target)
   - Regenerates CSP security headers
   - Updates cache bust timestamp
   - Blocks `node_modules` from being committed
4. **Run tests** — `npm test` (144 tests across 7 suites)
5. **Open a PR** — CI runs the full test suite and CSP validation

## Code Standards

### HTML / CSS

- **Single-file architecture**: CSS, HTML, and JS all live in `index.html`
- **Semantic HTML**: Use `<main>`, `<nav>`, `<section>`, `<article>`, etc.
- **External links**: Must include `rel="noopener"`
- **Touch targets**: Minimum 44px for all interactive elements

### CSS Conventions

```css
/* ✅ GPU-accelerated properties only */
transition:
  transform 0.3s ease,
  opacity 0.3s ease;
will-change: transform;

/* ❌ NEVER use these */
transition: all 0.3s; /* Layout thrashing */
transition: top 0.2s; /* Non-GPU property */
```

- Design tokens in `:root` — use CSS custom properties
- Responsive breakpoints: `900px` (tablet), `600px` (mobile)
- Minimum font size: `14px` / `0.875rem` on mobile

### JavaScript

- All code wrapped in an IIFE — `(function() { ... })()`
- Define utilities (`debounce`, etc.) before use
- No global scope pollution

## Accessibility (Non-Negotiable)

Every contribution must meet **WCAG 2.1 AA**:

- Color contrast ratio ≥ 4.5:1 (use `--text-muted: #8a8a8a` minimum on `--bg: #0d0d0d`)
- All interactive elements keyboard-accessible
- Skip link present and functional
- Semantic landmarks (`<main>`, `<nav>`)
- Run `npm run test:a11y` to verify

## Testing

```bash
npm test                # Full suite (144 tests)
npm run test:a11y       # Accessibility only
npm run test:responsive # Responsive only
npm run test:quick      # Sync + accessibility (fastest)
```

Tests run against `temp_review.html`, which is auto-synced from `index.html`.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new portfolio card for Project X
fix: correct contrast ratio on muted text
chore: update dependencies
docs: improve README quick start
style: format HTML with Prettier
```

## Updating Security Headers (CSP)

1. Edit `scripts/csp-config.js` (the single source of truth)
2. Run `npm run gen:csp` to regenerate `_headers`
3. Commit both files — CI will block the PR if they're out of sync

## Questions?

Open an issue or reach out to the maintainer.
