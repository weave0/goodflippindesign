---
applyTo: "admin.html, admin-panels.js, admin.css"
---

# Admin Panel Development Standards

## Panel Registration Pattern

Every panel is a lazily-loaded function registered on `window.__adminPanels`:

```javascript
(function () {
  "use strict";

  function load() {
    // render the panel into its <div id="view-<key>"> element
  }

  window.__adminPanels = window.__adminPanels || {};
  window.__adminPanels["your-panel-key"] = load;
})();
```

- The registration key **must exactly match** the `data-view` attribute on the corresponding `.nav-btn` and the `id` of its `<div id="view-<key>">` section.
- Use IIFE + `'use strict'` — no global variable leaks.
- `load()` is called once on first navigation; renders into the existing DOM element — don't recreate the container.

### Authoritative Panel Keys (25 panels)

`overview`, `daily-cultures`, `connections`, `planner`, `composer`, `social-feed`,
`library`, `drip`, `review-queue`, `overrides`, `galleries`, `content-studio`,
`ecosystem`, `blog-manager`, `storage`, `donations`, `analytics`, `community`,
`notifications`, `characters`, `nft-studio`, `brands`, `projects`, `deployments`, `settings`

---

## API Call Pattern

Use the shared `api()` helper — never `fetch()` directly from panel code:

```javascript
// Relative path → prepended with API constant ('/api/cms')
const data = await api("/your-endpoint");

// Absolute /api/* path → used as-is (e.g. blog API)
const post = await api("/api/blog/posts");

// With method + body (body is auto-JSON-stringified)
await api("/your-endpoint", { method: "POST", body: { key: "value" } });
```

- `api()` auto-attaches a fresh Clerk JWT as `Authorization: Bearer <token>`.
- On 401 it reloads the Clerk session and retries once automatically.
- Throws `Error` with the server's `error`/`message` field on non-2xx responses.

---

## Auth + Session Token

```javascript
// Get a fresh Clerk token for one-off use
const token = await state.clerk?.session?.getToken();
```

- `state.clerk` is the global Clerk SDK instance, available after `initAuth()` completes.
- Short-lived JWTs (~60s) — always call `getToken()` fresh; the SDK caches and auto-refreshes.
- Media assets use `state.mediaToken` (same JWT, refreshed every 55s by `refreshMediaToken()`).
- Append token to R2-backed media URLs: `assetUrl(asset)` handles this.

---

## Brand System

```javascript
// Current active brand (user-selectable via brand switcher)
let currentBrand = "gfd"; // mutable — read at call time, don't capture at module load

// All brand definitions
const BRAND_DEFS = {
  gfd,
  gfv,
  aiaimate,
  culturesherpa,
  citizenapproved,
  globaldeets,
  minnesotapeace,
  brettleeweaver,
  thyown,
  summitview,
  weave,
};

// Each brand has:
// .name, .shortName, .color, .platforms[], .hashtags[], .highVolumeTags[]
```

- Always use `currentBrand` (not a local copy) for API calls so brand-switcher changes take effect.
- When populating a brand `<select>`, iterate `Object.entries(BRAND_DEFS)` for consistency.

---

## DOM Utilities Available (from the outer IIFE scope)

```javascript
$(id); // document.getElementById(id) — fast shorthand
toast(msg, type); // type: 'success' | 'error' | 'warn' | 'info'
escapeHtml(str); // always escape user/API data before inserting into innerHTML
debounce(fn, ms); // use for search inputs and resize handlers
showConfirm(msg, onConfirm); // in-page confirmation dialog (not window.confirm)
openModal(id) / closeModal(id);
navigateToView(viewKey);
formatDateTime(isoString); // 'Jan 1, 12:00 PM'
```

---

## Security Requirements

- **Always** call `escapeHtml()` on any API-returned string before setting `innerHTML`.
- Never build SQL in the browser — all filtering/sorting belongs in the Worker endpoint.
- Don't expose Clerk secret key or Stripe secret key client-side (they're server-only).
- Use `rel="noopener"` on all `window.open()` / `<a target="_blank">` calls.

---

## CSS Conventions (admin.css)

- Dark theme variables: `--bg`, `--surface`, `--border`, `--text`, `--text-muted`
- Accent utilities: `.btn`, `.btn-primary`, `.btn-danger`, `.btn-micro`, `.tag`, `.tag.ok`, `.tag.fail`
- Status badges follow platform name as class: `<span class="sf-status-badge scheduled">scheduled</span>`
- Use `d-none` class (not `display:none` inline) to toggle visibility where possible.
- Panel containers use `<section id="view-<key>" class="view-section">` — match the nav key exactly.

---

## Adding a New Panel — Checklist

1. Add `<button class="nav-btn" data-view="my-panel">` in the nav sidebar (admin.html).
2. Add `<section id="view-my-panel" class="view-section">` to the main content area.
3. Register `window.__adminPanels['my-panel'] = load` in a new IIFE block (admin-panels.js).
4. Add the key to `VIEWS` array in `initKeyboardShortcuts()` if keyboard shortcut navigation is wanted.
5. Add a `PAGE_CONTEXTS['my-panel']` entry for command palette label.
6. Test: navigate to the panel in a local browser; confirm `load()` fires only once.
