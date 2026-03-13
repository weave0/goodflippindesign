# Admin Portal Comprehensive Audit Report

**Generated**: 2026-03-10
**Scope**: `admin.html` (14,456 lines), backend workers, D1 schemas, documentation

---

## 1. Executive Summary

The admin portal ("Command Center") is a **14,456-line single-file HTML/CSS/JS application** managing 6 brands across social media scheduling, asset management, content creation, community oversight, NFT minting, blog publishing, and ecosystem health monitoring.

**Implementation status**: **20 of 22 panels are fully implemented**. Only 2 are stubs (Donations, Characters). The backend (`workers/cms.js` at ~3,400 lines, `workers/auth.js` at ~2,100 lines) provides verified handlers for every frontend API call.

| Metric                            | Value        |
| --------------------------------- | ------------ |
| Total lines                       | 14,456       |
| CSS                               | ~5,665 lines |
| HTML body                         | ~2,500 lines |
| JavaScript                        | ~6,300 lines |
| Navigation panels                 | 22           |
| Fully implemented                 | 20           |
| Stubs                             | 2            |
| API endpoints (frontend calls)    | 65+          |
| Backend handlers (verified)       | 65+          |
| Async functions (JS)              | 77           |
| D1 tables (across 6 schema files) | 25+          |
| Brands managed                    | 6            |

---

## 2. File Structure Breakdown

### CSS (`<style>`, lines 1–5665)

| Section                | Lines     | Description                                              |
| ---------------------- | --------- | -------------------------------------------------------- |
| Root variables         | 1–30      | `--bg: #0d0d0d`, `--text: #f5f5f5`, `--accent` per brand |
| Auth gate              | 30–80     | Loading screen while Clerk initializes                   |
| Sidebar                | 80–300    | 260px fixed nav, group headers, active states            |
| Topbar + KPI strip     | 300–500   | Sticky header, metric cards                              |
| View containers        | 500–800   | Grid layouts for all 22 panels                           |
| Tables                 | 800–1200  | Sortable, scrollable responsive tables                   |
| Forms + modals         | 1200–2000 | Modal dialogs, form elements                             |
| Brand colors           | 2000–2200 | 6 brand themes with CSS custom properties                |
| Composer               | 2200–2800 | Multi-platform preview cards                             |
| Library + upload       | 2800–3400 | Drag-drop zone, asset grid                               |
| Content Studio         | 3400–4000 | Registry browser, image generation UI                    |
| Calendar + Planner     | 4000–4500 | Month/week grids, event dots                             |
| Blog Manager           | 4500–4800 | Markdown editor, toolbar, split view                     |
| Daily Culture Calendar | 4800–5200 | Hero cards, post kit modal, platform tabs                |
| NFT Studio             | 5200–5400 | Collection sidebar, token grid                           |
| Responsive overrides   | 5400–5665 | Breakpoints at 1200px, 900px, 600px                      |

### HTML Body (lines 5665–8175)

| Section                 | Lines     | Description                                                                      |
| ----------------------- | --------- | -------------------------------------------------------------------------------- |
| Auth gate overlay       | 5665–5700 | Clerk loading spinner                                                            |
| Sidebar nav             | 5700–5870 | 22 buttons in 5 groups (Core, Content, Studio, Platform, System)                 |
| Topbar                  | 5870–5920 | Brand switcher, user avatar, command palette trigger                             |
| KPI strip               | 5920–5960 | 7 metric cards (connections, assets, campaigns, blog, community, queue, storage) |
| 22 view sections        | 5960–7500 | `<section id="view-*">` for each panel                                           |
| Modal dialogs           | 7500–8000 | Campaign, connection, compose, blog, NFT, post kit, culture calendar             |
| Toast + Command Palette | 8000–8175 | Global toast notification, Ctrl+K command search                                 |

### JavaScript IIFE (lines 8176–14456)

| Section                 | Lines       | Description                                                                                                                                                                          |
| ----------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brand definitions       | 8176–8220   | 6 brands with colors, domains, platforms                                                                                                                                             |
| State object            | 8220–8260   | Central reactive state (`state.assets`, `state.variants`, etc.)                                                                                                                      |
| Utilities               | 8260–8350   | `api()` (auth-aware fetch + 401 retry), `toast()`, `showModal()`                                                                                                                     |
| `initAuth()` + `boot()` | 8350–8460   | Clerk callback → admin check → `boot()` → `refreshAll()`                                                                                                                             |
| Command palette         | 8460–8570   | Ctrl+K fuzzy search, Alt+1–9 panel shortcuts                                                                                                                                         |
| `bindUI()`              | 8570–8700   | Event delegation for all panel interactions                                                                                                                                          |
| `refreshAll()`          | 8700–8950   | Parallel data loading across 9 API calls                                                                                                                                             |
| Data loading            | 8950–9560   | Individual loaders: platform rules, OAuth, stats, connections, social, accounts, workflows, assets, campaigns, calendar                                                              |
| Rendering               | 9560–10500  | Overview, GAP_FLAGS (25 items), brand health, ecosystem matrix, handles, campaigns, composer, upload, library, calendar                                                              |
| CRUD operations         | 10500–12200 | All create/update/delete for campaigns, connections, handles, workflows, scheduling, assets, brand switcher, drip builder, gallery, content studio, site overrides, ecosystem health |
| Blog Manager (IIFE)     | 12340–12830 | Separate `blogFetch('/api/blog')`, markdown toolbar, custom renderer, split/preview modes                                                                                            |
| Lazy panels             | 12830–14410 | Analytics, Community, Queue Health, Characters (stub), Donations (stub), Storage, Daily Culture Calendar, NFT Studio, Brand Registry                                                 |
| Clerk init              | 14450–14456 | `window.__clerkReady.then(initAuth)`                                                                                                                                                 |

---

## 3. All 22 Panels — Implementation Status

### Fully Implemented (20)

| #   | Panel                  | View ID               | Key Features                                                                                                |
| --- | ---------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1   | Overview               | `view-overview`       | KPIs, upcoming queue, connections, recent assets, gap flags, getting started                                |
| 2   | Connections            | `view-connections`    | OAuth provider grid, manual token entry, ecosystem matrix                                                   |
| 3   | Planner                | `view-planner`        | Campaign CRUD, calendar view                                                                                |
| 4   | Composer               | `view-composer`       | Multi-platform scheduling, live character-counted previews, cross-posting                                   |
| 5   | Social Feed            | `view-social-feed`    | Posts grid + post kits gallery                                                                              |
| 6   | Library                | `view-library`        | Upload/bulk ingest, search/filter, batch approve, cross-brand sharing                                       |
| 7   | Drip Builder           | `view-drip`           | Entry builder, JSON import, bulk scheduling                                                                 |
| 8   | Review Queue           | `view-review-queue`   | Discovered assets, proxy thumbnails, claim/ignore                                                           |
| 9   | Site Overrides         | `view-overrides`      | Image override CRUD with active toggle (uses HTMLRewriter at edge)                                          |
| 10  | Galleries              | `view-galleries`      | Gallery CRUD + item management                                                                              |
| 11  | Content Studio         | `view-content-studio` | Prompt registries, DALL-E 3 generation, Prompt Studio sync (localhost:5000/5050)                            |
| 12  | Ecosystem Health       | `view-ecosystem`      | Sweep results from D1, CI repo cards from GitHub API, sweep trigger                                         |
| 13  | Blog Manager           | `view-blog-manager`   | Full markdown editor, CRUD via `/api/blog`, live preview, autosave dots                                     |
| 14  | Storage Intelligence   | `view-storage`        | Client-side localStorage JSON viewer (no server API)                                                        |
| 15  | Analytics              | `view-analytics`      | Reads from `state.variants`, published/failed/scheduled KPIs                                                |
| 16  | Community Members      | `view-community`      | Fetches `/api/community/members`, searchable table with XP/levels                                           |
| 17  | Queue Health           | `view-notifications`  | Failed/pending/published variants, retry all, run queue                                                     |
| 18  | Daily Culture Calendar | `view-daily-cultures` | Deterministic AM/PM rotation, 3 views (today/week/month), Post Kit modal with 4-platform caption generators |
| 19  | NFT Studio             | `view-nft-studio`     | Collections + tokens CRUD, rarity/status tags, IPFS CIDs                                                    |
| 20  | Brand Registry         | `view-brands`         | 6 brand cards, account/workflow counts, sync/populate                                                       |

### Stubs (2)

| #   | Panel      | View ID           | Status                                                                    |
| --- | ---------- | ----------------- | ------------------------------------------------------------------------- |
| 21  | Characters | `view-characters` | Toast: "Character registry is source-controlled in ANIMATION_PIPELINE.md" |
| 22  | Donations  | `view-donations`  | Toast: "Stripe webhook not yet configured. Visit the Stripe Dashboard."   |

---

## 4. Backend Architecture

### Request Flow

```
Browser → Cloudflare CDN
  └─ _worker.js (Pages Advanced Mode)
       ├─ Static files → env.ASSETS.fetch()
       ├─ /api/cms/media/* (public R2 serve, no auth)
       ├─ /admin.html → edge auth gate (requires __session cookie)
       ├─ HTML responses → HTMLRewriter (ENV injection + image overrides)
       └─ /api/* → workers/auth.js
             ├─ Public routes (comments GET, blog GET, community feed/stats/posts/leaderboard/search/members)
             ├─ /api/cms/* → workers/cms.js (admin auth via JWT or ?t= param)
             ├─ /api/blog → blog handlers (admin for POST/PUT/DELETE, public for GET)
             └─ All other /api/* → requires Bearer token → switch/case routing
```

### `_worker.js` (252 lines)

- **Security layer**: Blocks 10+ file extensions, private prefixes (`/workers/`, `/scripts/`, `/.github/`), root-level `.js` files, non-`/assets/` JSON
- **Edge admin gate**: `/admin.html` requires `__session` or `__client_uat` cookie; redirects to `/?auth_required=admin`
- **R2 media shortcut**: `/api/cms/media/*` served directly from R2 with immutable cache headers (bypasses auth worker for public media)
- **ENV injection**: Injects `window.ENV` (Stripe key, Clerk key, Sentry DSN) into all HTML via `<script>`
- **HTMLRewriter**: Swaps `<img>` sources based on `asset_overrides` table for live image replacement
- **Web Vitals**: Injects CLS, LCP, FCP, TTFB, INP reporter to GA4 (zero CDN deps)
- **Sentry client**: Injects browser Sentry SDK when `SENTRY_DSN` is configured

### `workers/auth.js` (2,100 lines)

- **Clerk verification**: JWT decode → session verify via Clerk Backend API → user fetch fallback
- **Admin whitelist**: 4 emails auto-assigned `admin` role via Clerk metadata PATCH
- **Multi-app Clerk**: Selects `CLERK_SECRET_KEY_GFD` for goodflippindesign.com, `CLERK_SECRET_KEY` for everything else
- **Sentry error boundary**: `withErrorBoundary()` wraps all handlers; `executeD1Query()` monitors slow queries >100ms
- **Comment system**: CRUD with profanity filter (35 blocked terms)
- **Blog system**: CRUD for `blog_posts` table, admin-only writes, public reads
- **Community Engine** (~1,000 lines): XP system (8 action types), 8 levels (Newcomer→Legend), 20 badge definitions, daily check-in with streaks (7/14/30-day XP bonuses), badge auto-award, activity feed, notifications, post/reply/react with XP, leaderboard, member directory, search, post pinning, edit/delete with ownership checks

### `workers/cms.js` (~3,400 lines)

- **Router**: `handleCMSRequest()` with 70+ route patterns
- **Auth enforcement**: Public routes (categories, brands, platform-rules, `/pub/*`, OAuth callbacks), all others require admin JWT
- **Asset pipeline**: CRUD, R2 upload (50MB limit), public serving (only `review_status='approved'`), Cloudflare Cache API for edge caching, cache purge on reject
- **Social system**: Posts, variants (multi-platform), campaigns, bulk scheduling (D1 batch at 100), cross-brand syndication, ecosystem calendar, social publisher trigger
- **Brand registry**: 6 brands with connection counts, account counts, workflow config
- **Social accounts**: Handle registry with token fingerprinting (SHA-256), auto-populate from platform tokens
- **Gallery system**: Lazy schema init, CRUD for galleries + items, reordering, public gallery feed
- **Content Studio**: Prompt registries, DALL-E 3 image generation, R2 storage, schedule to social
- **NFT system**: Lazy schema init (collections + tokens), CRUD, mint tracking
- **Asset discovery**: Server-side page scanner (extracts `<img>` + CSS `url()` references), discovered asset claim pipeline, external image proxy with SSRF protection
- **Image overrides**: CRUD for `asset_overrides` table (consumed by `_worker.js` HTMLRewriter)
- **Cross-site sharing**: Asset copy (same R2 file, no duplication), replacement with R2 overwrite + version bump
- **Encryption**: AES-GCM for platform token payloads when `TOKEN_ENCRYPTION_KEY` is configured
- **Audit logging**: Every write operation logged to `cms_audit_log`

---

## 5. API Endpoint Inventory

### CMS Routes (`/api/cms/*`) — 50+ endpoints

| Method              | Path                             | Handler                   | Auth   |
| ------------------- | -------------------------------- | ------------------------- | ------ |
| GET                 | `/categories`                    | List categories           | Public |
| GET                 | `/brands`                        | List brands with counts   | Public |
| GET                 | `/platform-rules`                | Platform character limits | Public |
| GET                 | `/pub/:r2Key`                    | Serve approved assets     | Public |
| \*                  | `/oauth/*`                       | OAuth flows               | Mixed  |
| GET                 | `/assets`                        | List/search assets        | Admin  |
| GET                 | `/assets/:id`                    | Single asset              | Admin  |
| POST                | `/assets`                        | Create asset              | Admin  |
| PUT                 | `/assets`                        | Update asset              | Admin  |
| DELETE              | `/assets`                        | Soft-delete asset         | Admin  |
| POST                | `/assets/discover`               | Discover assets from page | Admin  |
| GET                 | `/assets/discovered`             | List discovered assets    | Admin  |
| POST                | `/assets/discovered/:id/claim`   | Promote to library        | Admin  |
| PUT                 | `/assets/discovered/:id`         | Update discovery status   | Admin  |
| POST                | `/assets/bulk-approve`           | Batch approve drafts      | Admin  |
| POST                | `/assets/:id/approve`            | Approve single asset      | Admin  |
| POST                | `/assets/:id/reject`             | Reject + cache purge      | Admin  |
| GET                 | `/assets/:id/shares`             | List sharing brands       | Admin  |
| POST                | `/assets/:id/share`              | Cross-brand share         | Admin  |
| POST                | `/assets/:id/replace`            | Replace R2 binary         | Admin  |
| GET                 | `/media/:r2Key`                  | Private media preview     | Admin  |
| POST                | `/upload`                        | R2 file upload            | Admin  |
| GET/POST/PUT/DELETE | `/social`                        | Social post CRUD          | Admin  |
| GET                 | `/social/variants`               | List variants (joined)    | Admin  |
| POST                | `/social/campaign`               | Multi-platform post       | Admin  |
| POST                | `/social/run-now`                | Trigger publisher         | Admin  |
| GET/POST/PUT/DELETE | `/social-accounts`               | Handle registry           | Admin  |
| POST                | `/social-accounts/populate`      | Auto-link from tokens     | Admin  |
| GET/PUT             | `/brand-workflows`               | Workflow config           | Admin  |
| GET/POST            | `/cross-posts`                   | Syndication links         | Admin  |
| GET                 | `/ecosystem-calendar`            | Cross-brand calendar      | Admin  |
| GET/POST/PUT/DELETE | `/connections`                   | Platform tokens           | Admin  |
| GET/POST/PUT/DELETE | `/campaigns`                     | Campaign CRUD             | Admin  |
| GET                 | `/campaigns/calendar`            | Campaign calendar         | Admin  |
| POST                | `/campaigns/bulk-schedule`       | Drip scheduling           | Admin  |
| GET/POST            | `/content`                       | CMS content CRUD          | Admin  |
| GET                 | `/stats`                         | Dashboard aggregates      | Admin  |
| POST                | `/scan-page`                     | Server-side page scanner  | Admin  |
| GET                 | `/proxy-img`                     | External image proxy      | Admin  |
| GET/POST/PUT/DELETE | `/assets/overrides`              | Image override CRUD       | Admin  |
| GET/POST            | `/galleries`                     | Gallery CRUD              | Admin  |
| PUT/DELETE          | `/galleries/:id`                 | Update/delete gallery     | Admin  |
| GET/POST            | `/galleries/:id/items`           | Gallery items             | Admin  |
| PUT                 | `/galleries/:id/items/reorder`   | Reorder items             | Admin  |
| DELETE              | `/galleries/:id/items/:itemId`   | Remove item               | Admin  |
| GET                 | `/sites`                         | Site registry             | Admin  |
| GET                 | `/sites/:domain/assets`          | Site assets               | Admin  |
| GET                 | `/gallery/:brand`                | Public gallery feed       | Public |
| GET/POST/PUT/DELETE | `/nft/collections`               | NFT collections           | Admin  |
| GET/POST/PUT/DELETE | `/nft/tokens`                    | NFT tokens                | Admin  |
| POST                | `/nft/tokens/:id/mint`           | Mint token                | Admin  |
| GET                 | `/content-studio/registries`     | Prompt registries         | Admin  |
| GET                 | `/content-studio/registries/:id` | Single registry           | Admin  |
| POST/PUT            | `/content-studio/registries`     | Save registry             | Admin  |
| GET                 | `/content-studio/generated`      | Generated assets          | Admin  |
| POST                | `/content-studio/generate`       | DALL-E 3 generation       | Admin  |
| POST                | `/content-studio/schedule`       | Schedule generated post   | Admin  |

### Auth Routes (`/api/*`) — 20+ endpoints

| Method          | Path                                | Auth                                  |
| --------------- | ----------------------------------- | ------------------------------------- |
| GET             | `/api/comments`                     | Public                                |
| POST/DELETE     | `/api/comments`                     | Authenticated                         |
| GET             | `/api/blog`                         | Public (published) / Admin (all)      |
| GET             | `/api/blog/post`                    | Public                                |
| POST/PUT/DELETE | `/api/blog`                         | Admin                                 |
| GET             | `/api/profile`                      | Authenticated                         |
| GET             | `/api/community/feed`               | Public                                |
| GET             | `/api/community/stats`              | Public                                |
| GET             | `/api/community/posts`              | Public (GET) / Auth (POST/PUT/DELETE) |
| GET             | `/api/community/leaderboard`        | Public                                |
| GET             | `/api/community/search`             | Public                                |
| GET             | `/api/community/members`            | Public                                |
| POST            | `/api/community/checkin`            | Authenticated                         |
| GET/PUT         | `/api/community/profile`            | Authenticated                         |
| POST            | `/api/community/onboarding`         | Authenticated                         |
| GET             | `/api/community/notifications`      | Authenticated                         |
| POST            | `/api/community/notifications/read` | Authenticated                         |
| POST            | `/api/community/reply`              | Authenticated                         |
| POST            | `/api/community/react`              | Authenticated                         |
| PUT             | `/api/community/posts/pin`          | Admin                                 |

---

## 6. D1 Schema Coverage

### Schema Files (6)

| File                           | Tables                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `d1-schema-console.sql`        | `comments`, `user_metadata`, `blog_posts`, `reactions`, `moderation_log`                                                                         |
| `d1-schema-community.sql`      | `community_posts`, `community_profiles`, `community_xp`, `community_activity`, `community_reactions`, `community_notifications`                  |
| `d1-schema-cms.sql`            | `cms_assets`, `cms_social_posts`, `cms_content`, `cms_audit_log`, `cms_platform_tokens`, `cms_post_variants`, `cms_campaigns`, `asset_overrides` |
| `d1-schema-media-platform.sql` | ALTERs to `cms_assets`, `cms_asset_deployments`, `cms_galleries`, `cms_gallery_items`, `cms_api_keys`, `cms_webhooks`                            |
| `d1-schema-health.sql`         | `health_checks`                                                                                                                                  |
| `d1-schema-account-links.sql`  | ALTERs to `social_accounts` ↔ `cms_platform_tokens` cross-reference                                                                              |

### Lazy-Initialized Tables (created at runtime via `ensureSchema()` pattern)

| Table                 | Worker                              |
| --------------------- | ----------------------------------- |
| `cms_campaigns`       | `cms.js` → `ensureCampaignSchema()` |
| `cms_nft_collections` | `cms.js` → `ensureNFTSchema()`      |
| `cms_nft_tokens`      | `cms.js` → `ensureNFTSchema()`      |
| `cms_galleries`       | `cms.js` → `ensureGallerySchema()`  |
| `cms_gallery_items`   | `cms.js` → `ensureGallerySchema()`  |

### Tables Referenced But Not in Schema Files

| Table                   | Used By | Notes                                                   |
| ----------------------- | ------- | ------------------------------------------------------- |
| `discovered_assets`     | cms.js  | Page scanner results — needs schema file                |
| `brand_workflows`       | cms.js  | Brand workflow configs — needs schema file              |
| `social_accounts`       | cms.js  | Handle registry — partially in account-links ALTER file |
| `cross_post_links`      | cms.js  | Syndication links — needs schema file                   |
| `cms_prompt_registries` | cms.js  | Content Studio — needs schema file                      |
| `cms_generated_assets`  | cms.js  | DALL-E output tracking — needs schema file              |

---

## 7. admin.html vs admin.html.bak Comparison

| Aspect                 | admin.html                                             | admin.html.bak                                       |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| Lines                  | 14,456                                                 | 1,197                                                |
| Clerk key              | `pk_live_Y2xlcmsuZ29vZGZsaXBwaW5kZXNpZ24uY29tJA` (GFD) | `pk_live_Y2xlcmsuZ29vZGZsaXBwaW52aWJlcy5jb20k` (GFV) |
| Clerk loading          | Dynamic ES module + `window.__clerkReady` promise      | Static `<script src="cdn.clerk.dev">`                |
| Panels                 | 22                                                     | ~6 basic                                             |
| Brand management       | 6 brands with switcher                                 | Single brand                                         |
| Social scheduling      | Full composer + drip builder                           | None                                                 |
| Content Studio         | DALL-E 3 + Prompt Studio sync                          | None                                                 |
| NFT Studio             | Full CRUD                                              | None                                                 |
| Blog Manager           | Full markdown editor                                   | None                                                 |
| Daily Culture Calendar | Massive Post Kit modal                                 | None                                                 |
| Ecosystem Health       | CI monitoring + sweep trigger                          | None                                                 |
| Size ratio             | **12x larger**                                         | Baseline                                             |

---

## 8. GAP_FLAGS System

25 hardcoded items with severity levels tracking known gaps:

| Severity  | Count | Examples                                                              |
| --------- | ----- | --------------------------------------------------------------------- |
| `blocker` | 4     | Instagram API, TikTok API, video transcoding, 2FA worker              |
| `quality` | 8     | Community moderation, post approval pipeline, brand style enforcement |
| `hygiene` | 10    | Localization, dark/light toggle, password auth, SEO meta              |
| `done`    | 3     | R2 upload, profanity filter, edge auth                                |

---

## 9. Security Architecture

| Layer                | Implementation                                                                  |
| -------------------- | ------------------------------------------------------------------------------- |
| **Edge auth**        | `_worker.js` requires Clerk cookie for `/admin.html`                            |
| **JWT verification** | `verifyClerkToken()` → Clerk Backend API session verify → user fetch fallback   |
| **Admin check**      | `publicMetadata.role === 'admin'` + email whitelist auto-assignment             |
| **Token refresh**    | Frontend refreshes JWT every 55s, 401 retry with session reload                 |
| **Token encryption** | AES-GCM for platform token payloads (when `TOKEN_ENCRYPTION_KEY` configured)    |
| **SSRF protection**  | Image proxy blocks private IPs, loopback, non-HTTP protocols                    |
| **File blocking**    | Worker returns 404 for .md, .sql, .ps1, .sh, .py, .txt, .toml, .yml, .bak, .log |
| **CORS**             | Wildcard `Access-Control-Allow-Origin: *` on all API responses                  |
| **Content gating**   | Public media only serves `review_status='approved'` assets                      |
| **Audit logging**    | Every CMS write logged to `cms_audit_log` with user ID                          |
| **Profanity filter** | 35 blocked terms for community comments                                         |

---

## 10. Key Architectural Patterns

1. **Lazy panel loading**: `window.__adminPanels[viewKey]` — panels load data only on first navigation click
2. **Lazy schema migration**: `ensureCampaignSchema()`, `ensureNFTSchema()`, `ensureGallerySchema()` — CREATE TABLE IF NOT EXISTS at first use
3. **Single auth-aware fetch**: `api(path, opts)` wraps all CMS calls with JWT + 401 retry + toast on error
4. **Blog Manager isolation**: Separate IIFE with its own `blogFetch()` targeting `/api/blog` instead of `/api/cms`
5. **Brand switcher**: `state.currentBrand` propagates to all API calls and rendering
6. **HTMLRewriter edge transform**: Image overrides applied at CDN edge without buffering full HTML
7. **D1 batch chunking**: Bulk schedule uses `env.DB.batch()` chunked at 100 statements for atomicity

---

## 11. Recommendations

### Critical

1. **Missing schema files**: 6 tables (`discovered_assets`, `brand_workflows`, `social_accounts`, `cross_post_links`, `cms_prompt_registries`, `cms_generated_assets`) are created lazily or assumed to exist but have no committed schema file
2. **CORS wildcard**: `Access-Control-Allow-Origin: *` on all API responses — consider restricting to known domains
3. **No automated tests**: admin.html, workers/cms.js, workers/auth.js have 0% test coverage

### Important

4. **Donations panel**: Wire up Stripe webhook to enable transaction display
5. **Characters panel**: Consider loading character metadata from a JSON file instead of being a dead stub
6. **Blog API return format**: `handleCreateBlogPost` returns `{body, status, headers}` object instead of Response — inconsistent with other handlers (works due to routing layer adaptation)

### Nice-to-Have

7. **File splitting**: At 14,456 lines, admin.html would benefit from extracting CSS to a separate file
8. **Bundle size**: Single-file approach means every panel's code loads on every visit regardless of which panel is used
9. **Storage Intelligence**: Currently requires manual PowerShell script + file load — could use a lightweight API endpoint instead
