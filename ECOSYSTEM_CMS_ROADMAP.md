# GFV Ecosystem CMS & Content Platform — Master Roadmap

> **Created**: March 4, 2026
> **Owner**: Brett Weaver / GFV LLC
> **Scope**: All brands — GFV, GFD, AIAimate, CitizenApproved, CultureSherpa, GlobalDeets
> **Status**: LOCKED IN — Active development

---

## Executive Summary

We're building a **cross-brand Content Management System** that operates in two modes:

1. **Cloud Admin** — A web-based admin portal behind auth, accessible from anywhere
2. **Local Desktop** — CLI tools + file-system drop zones + VS Code integration for power users

This isn't a generic WordPress/Contentful clone. It's purpose-built for our ecosystem: AI-generated art, video pipelines, multi-brand publishing, social media distribution, and community engagement — all from a single control plane.

**What already exists** (we just never called it a CMS):

- CultureSherpa's Python CMS (editorial workflow FSM, versioning, diffing, admin CRUD)
- GFV's gallery-assets.json manifest (216 assets, 20 categories, emotion taxonomies)
- GFV's art-generation + video-generation Python pipelines (DALL-E, moviepy, TTS)
- SummitView's documentary content production engine
- ThyOwn's AI model training + agent system
- PromptSynth's prompt engineering engine
- GFD's community portal (Clerk auth, D1 database, gamification)
- Multiple Cloudflare Workers (auth, payments, API routing)

**What we're building**: The connective tissue that unifies all of this into a coherent platform.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                     WEAVE CMS PLATFORM                          │
├─────────────────────┬────────────────────────────────────────────┤
│   CLOUD ADMIN UI    │           LOCAL DESKTOP TOOLS              │
│  (goodflippindesign │   Z:\MediaDrop (master drop zone)          │
│   .com/admin)       │   VS Code workspace integration            │
│                     │   CLI asset processor                      │
│  • Asset browser    │   • File watchers (auto-detect new drops)  │
│  • Gallery manager  │   • WebP conversion + thumbnailing         │
│  • Social scheduler │   • JSON manifest auto-update              │
│  • Analytics dash   │   • Git auto-commit + deploy               │
│  • Brand switcher   │                                            │
│  • Video manager    │                                            │
│  • Newsletter mgmt  │                                            │
├─────────────────────┴────────────────────────────────────────────┤
│                    SHARED DATA LAYER                             │
│  Cloudflare D1 (structured data — users, posts, schedules)      │
│  Cloudflare R2 (binary assets — images, video, audio)           │
│  gallery-assets.json (art manifest — categories, emotions, etc) │
│  git repos (source of truth per brand)                          │
├──────────────────────────────────────────────────────────────────┤
│                    CONTENT PIPELINES                             │
│  art-generation (DALL-E batch gen → MediaDrop → gallery)        │
│  video-generation (storyboard → narrate → assemble → publish)   │
│  SummitView (documentary episodes at $1.39/ep)                  │
│  PromptSynth (prompt engineering for all generation)            │
├──────────────────────────────────────────────────────────────────┤
│                    DISTRIBUTION LAYER                            │
│  Instagram (Meta Graph API — reels, carousels, stories)         │
│  Facebook (same Graph API)                                      │
│  YouTube (YouTube Data API — uploads, shorts)                   │
│  X/Twitter (Twitter API v2 — tweets, media)                     │
│  TikTok (TikTok API — video uploads)                            │
│  Email newsletters (Buttondown / Mailchimp)                     │
│  Website embeds (auto-update IG reels, gallery rows)            │
├──────────────────────────────────────────────────────────────────┤
│                    BRAND SITES (CONSUMERS)                       │
│  goodflippinvibes.com  — art, community, vibes                  │
│  goodflippindesign.com — portfolio, consulting, admin portal    │
│  aiaimate.com          — AI education, interactive content      │
│  citizenapproved.com   — immigration education                  │
│  culturesherpa.org     — cultural learning platform             │
│  globaldeets.com       — BI project hub                         │
└──────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Foundation — Netflix-Style Gallery + Asset Pipeline (Weeks 1–2)

### 1.1 Netflix-Style Art Rows on GFV Homepage

**Status**: 🔄 Starting now
**Effort**: 4–6 hours

Replace the current auto-scrolling strips with **category-specific horizontal scroll rows**, each with:

- Category label + "See All →" link to `/gallery.html?cat=<slug>`
- Horizontally scrollable cards (drag + scroll + snap)
- Hover: scale + glow + title overlay
- Responsive: cards shrink gracefully, row scrolls on mobile
- Data-driven: pulled from `gallery-assets.json` categories, max 12 per row
- **Rows shown**: Featured picks, Cats of Instagram, Film Club, Mascot Scenes, Abstract, Comedy, 80s Ideas, Oscars + "Explore All 20 Collections →" CTA

### 1.2 MediaDrop → Gallery Auto-Processor

**Status**: ✅ Directory structure created
**Effort**: 6–8 hours

Build a unified `process-media-drop.py` script that:

1. **Watches** `Z:\MediaDrop\*` for new files (or runs on-demand)
2. **Converts** PNGs/JPGs → WebP (quality 88, max 1600px)
3. **Generates** thumbnails (140w, 320w, 400w)
4. **Deploys** to `good-flippin-vibes/public/art/<category>/`
5. **Updates** `gallery-assets.json` with new entries (title from filename, category from folder)
6. **Validates** with `verify-gallery-assets.mjs`
7. **Git commits** the changes
8. **Optionally pushes** to deploy

**Desktop shortcut**: ✅ Created at `Desktop\GFV Media Drop.lnk → Z:\MediaDrop`

### 1.3 Gallery Page Enhancement

**Status**: Gallery exists (1,223 lines, 581-line JS engine)
**Effort**: 4–6 hours

Enhance the existing gallery page:

- Video section: YouTube/Instagram embeds for each video-tagged asset
- Sort options: Newest, Most Popular, Category, Emotion
- Grid/List view toggle
- "Save to favorites" persistence (already built — localStorage `gfv_saved_art`)
- Share to social with preview card (Web Share API — already built)
- Lazy-loaded video thumbnails with play badges

---

## Phase 2: Cloud Admin Portal (Weeks 3–5)

### 2.1 Admin Dashboard on GFD

**Status**: Community portal exists (Clerk auth) but has zero CMS features
**Effort**: 2–3 weeks

Build at `goodflippindesign.com/admin` (or `/admin.html`):

#### Core Features

| Feature                | Description                                                 | Backend                        |
| ---------------------- | ----------------------------------------------------------- | ------------------------------ |
| **Brand Switcher**     | Toggle between GFV, GFD, AI Aimate, etc.                    | Client-side routing            |
| **Asset Browser**      | Browse all gallery assets, filter by category/emotion/brand | Reads gallery-assets.json / R2 |
| **Asset Upload**       | Drag-drop upload with auto-category detection               | Cloudflare R2 + Worker         |
| **Gallery Manager**    | Reorder, feature/unfeature, edit metadata, bulk actions     | Workers + D1                   |
| **Social Scheduler**   | Create posts, attach media, schedule publish times          | D1 + cron triggers             |
| **Newsletter Manager** | View subscribers, send broadcasts, manage lists             | Workers + Buttondown API       |
| **Analytics Overview** | GA4 + Plausible summaries per brand                         | GA4 Data API                   |
| **Video Manager**      | Upload/link videos, manage metadata, embed codes            | R2 + D1                        |
| **Content Editor**     | Markdown editor for blog posts, announcements               | D1                             |

#### Auth & Permissions

- Uses existing Clerk setup on GFD
- Admin role check: `profileData.role === 'admin'` (already implemented)
- Add `editor` role for content-only access (no user management)

#### Tech Stack

- Frontend: Vanilla HTML/CSS/JS (consistent with GFD's single-file philosophy) or a lightweight admin SPA
- Backend: Cloudflare Workers + D1 + R2
- Auth: Clerk (already live)
- File storage: Cloudflare R2 (S3-compatible, $0.015/GB/month)

### 2.2 Cloudflare R2 Asset Storage

**Effort**: 1 day setup

| Bucket          | Purpose                        | Access                   |
| --------------- | ------------------------------ | ------------------------ |
| `gfv-media`     | All art, video, audio assets   | Public read, admin write |
| `gfv-originals` | Source files (PNGs, raw video) | Private, admin only      |

- R2 is S3-compatible — works with existing sharp/ffmpeg pipelines
- Custom domain: `media.goodflippinvibes.com` (CNAME to R2)
- Workers serve optimized variants based on `Accept` header (WebP/AVIF)

### 2.3 D1 Schema Extension

**Effort**: 2 hours

Add tables to existing `gfd_community` D1 database:

```sql
-- Content/asset management
CREATE TABLE assets (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,              -- 'gfv', 'gfd', 'aiaimate', etc.
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT NOT NULL,
  r2_key TEXT,                      -- R2 object key
  media_type TEXT DEFAULT 'image',  -- image, video, audio
  tags TEXT,                        -- JSON array
  emotions TEXT,                    -- JSON array
  featured INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  sort_order INTEGER DEFAULT 100,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Social media posts
CREATE TABLE social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  platform TEXT NOT NULL,           -- instagram, facebook, x, youtube, tiktok
  content TEXT NOT NULL,
  media_ids TEXT,                   -- JSON array of asset IDs
  scheduled_at TEXT,
  published_at TEXT,
  external_id TEXT,                 -- Platform's post ID after publish
  status TEXT DEFAULT 'draft',      -- draft, scheduled, published, failed
  created_at TEXT DEFAULT (datetime('now'))
);

-- Newsletter subscribers (backup to Buttondown)
CREATE TABLE subscribers (
  email TEXT PRIMARY KEY,
  brand TEXT DEFAULT 'gfv',
  subscribed_at TEXT DEFAULT (datetime('now')),
  confirmed INTEGER DEFAULT 0,
  source TEXT                       -- 'homepage', 'donate', 'community', etc.
);

-- Content pieces (blog posts, announcements)
CREATE TABLE content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand TEXT NOT NULL,
  type TEXT NOT NULL,               -- blog, announcement, newsletter
  title TEXT NOT NULL,
  body TEXT NOT NULL,               -- Markdown
  slug TEXT UNIQUE,
  status TEXT DEFAULT 'draft',      -- draft, published, archived
  author TEXT,
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
```

---

## Phase 3: Social Media Automation (Weeks 5–7)

### 3.1 Post-to-Social Pipeline

**Effort**: 1–2 weeks

Build `workers/social-publisher.js`:

```
[Admin UI / CLI] → POST /api/social/publish
                     ↓
              [Social Publisher Worker]
                     ↓
         ┌───────────┼───────────┐
         │           │           │
    Instagram     X/Twitter   YouTube
   (Graph API)  (API v2)   (Data API)
```

**API integrations needed:**

| Platform  | API                 | Auth                  | Capabilities                            |
| --------- | ------------------- | --------------------- | --------------------------------------- |
| Instagram | Meta Graph API v21  | Long-lived page token | Reels, carousels, single image, stories |
| Facebook  | Meta Graph API v21  | Same token (pages)    | Posts, photos, videos, links            |
| X/Twitter | Twitter API v2      | OAuth 2.0 (app)       | Tweets, media uploads, threads          |
| YouTube   | YouTube Data API v3 | OAuth 2.0             | Video uploads, shorts, thumbnails       |
| TikTok    | TikTok Content API  | OAuth 2.0             | Video uploads                           |

**Scheduling**: Cloudflare Cron Triggers (`wrangler.toml` → `[triggers] > crons`)

- Check D1 `social_posts` table every 15 minutes
- Publish any posts where `scheduled_at <= now()` and `status = 'scheduled'`
- Update `status` to `published` + store `external_id`

### 3.2 Content Calendar

- Admin UI component showing weekly/monthly view
- Drag-drop to reschedule
- Cross-brand: see GFV, GFD, AI Aimate posts in one calendar
- Suggested posting times based on platform analytics

### 3.3 Auto-Embed Latest Social Content

- Cloudflare Worker cron: fetch latest IG posts via Graph API
- Store embed URLs in D1
- Homepage JS fetches latest embeds and swaps into the Instagram section
- **No more manual embed code pasting** — it auto-updates

---

## Phase 4: Cross-Brand Unification (Weeks 7–10)

### 4.1 Shared Component Library

**Effort**: 1 week

Create `z:\shared\` (or expand existing) with reusable components:

| Component             | Used By      | Type                         |
| --------------------- | ------------ | ---------------------------- |
| Ecosystem nav bar     | All 6 sites  | HTML snippet + CSS           |
| Footer                | All 6 sites  | HTML snippet + CSS           |
| Cookie/privacy banner | All sites    | JS widget                    |
| Social share buttons  | GFV, GFD, GD | JS widget                    |
| Newsletter signup     | GFV, GFD     | JS widget                    |
| Donation widget       | GFV, GFD     | JS widget (Stripe)           |
| Analytics loader      | All sites    | JS snippet (GA4 + Plausible) |

### 4.2 CultureSherpa CMS Extraction

**Effort**: 1 week

CultureSherpa already has the most mature CMS in the ecosystem (Python FSM editorial workflow). Extract and generalize:

- Rename to `weave-cms-core`
- Make brand-configurable (not hardcoded to cultures)
- Add image/media asset support (currently text-only)
- REST API wrapper for the Workers to call

### 4.3 Unified Deployment Script

**Effort**: 2 hours

```powershell
# ecosystem-deploy.ps1
# Deploy any or all brands from one command
param(
    [ValidateSet('all','gfv','gfd','aiaimate','citizenapproved','culturesherpa','globaldeets')]
    [string[]]$Brands = @('all')
)
```

| Brand           | Deploy Command                                             | Platform                |
| --------------- | ---------------------------------------------------------- | ----------------------- |
| GFV             | `cd z:\good-flippin-vibes && npm run deploy`               | Cloudflare Pages        |
| GFD             | `cd z:\GFD && git push origin main`                        | Cloudflare Pages (auto) |
| AI Aimate       | `cd z:\aiaimate && vercel --prod`                          | Vercel                  |
| CitizenApproved | `cd z:\CitizenApproved && npm run deploy`                  | Cloudflare Pages        |
| CultureSherpa   | `cd z:\CultureSherpa && python deploy_enhanced_website.py` | AWS S3 + CloudFront     |
| GlobalDeets     | `cd z:\globaldeets && git push origin main`                | Cloudflare Pages (auto) |

### 4.4 CI/CD for All Repos

**Effort**: 1 day

Add GitHub Actions workflows to repos currently missing them:

- **CitizenApproved**: lint + type-check + build on PR, auto-deploy on merge
- **AI Aimate**: lint + type-check on PR (Vercel handles deploy)
- **CultureSherpa**: lint + test + deploy on merge
- **Branch protection**: Enable on all repos (require PR, no direct push to main)

---

## Phase 5: AI Content Generation Pipeline (Weeks 10–14)

### 5.1 Unified Generation Engine

**Effort**: 2 weeks

Merge `art-generation` + `video-generation` + `PromptSynth` into a single pipeline:

```
[Prompt Input or Schedule]
    → PromptSynth (refine prompt)
    → DALL-E / Midjourney (generate image)
    → MediaDrop/_UNSORTED (auto-deposit)
    → process-media-drop.py (convert, thumb, catalog)
    → Gallery update (JSON + git push)
    → Social post draft (ready to schedule)
```

### 5.2 SummitView Integration

- Connect SummitView documentary pipeline to the CMS
- Episodes auto-publish to YouTube via Data API
- Thumbnails auto-generated and added to gallery
- Episode announcements auto-drafted for social scheduler

### 5.3 ThyOwn AI Model Integration

- Custom models trained via ThyOwn can serve as generation backends
- Local CUDA-accelerated generation for high-volume batches
- Cloud fallback to DALL-E/OpenAI for on-the-go

---

## Phase 6: Local Desktop Application (Weeks 14–18)

### 6.1 Desktop CMS App

**Effort**: 3–4 weeks

Lightweight Electron or Tauri app that provides:

- **Tray icon** with quick actions (open MediaDrop, run processor, view queue)
- **File watcher** on `Z:\MediaDrop\*` — auto-processes new drops
- **Gallery preview** — browse all 216+ assets with search/filter
- **Social queue** — see scheduled posts, quick-draft new ones
- **Brand dashboard** — site status, last deploy, error count per brand
- **Video preview** — play generated videos before publishing
- **One-click deploy** — push changes to any brand

### 6.2 VS Code Extension (lighter alternative)

If a full desktop app is overkill, build a VS Code extension:

- Sidebar panel: asset browser, social queue, deploy status
- Commands: `GFV: Process MediaDrop`, `GFV: Deploy Brand`, `GFV: Schedule Post`
- File watcher integration (already in VS Code's event model)

---

## Phase 7: Monitoring & Observability (Weeks 18–20)

### 7.1 Error Tracking

- Sentry on all Workers (auth worker already has the placeholder)
- Client-side error tracking on GFV + GFD (Sentry browser SDK)

### 7.2 Uptime Monitoring

- UptimeRobot (free tier: 50 monitors, 5-minute intervals)
- All 6 brand sites + API endpoints

### 7.3 Web Vitals Dashboard

- Client-side `web-vitals` library → beacon to analytics
- Display in admin dashboard

### 7.4 Content Performance Metrics

- Track per-asset engagement (views, saves, shares)
- Track social post performance (reach, likes, comments)
- Weekly digest email to admin

---

## Asset Management — Standard Operating Procedure

### Drop Zone: `Z:\MediaDrop`

```
Z:\MediaDrop\
├── _UNSORTED — Drop anything here, we'll sort it/
├── 80s Ideas — Retro 80s themed artwork/
├── Abstract — Geometric, gradient, mood art/
├── Audio — Music, sound effects, narration files/
├── Backgrounds — Page backgrounds, textures, patterns/
├── Badges — Achievement badges, streak icons, trophies/
├── Brand — Logos, ecosystem graphics, identity assets/
├── Cats of Instagram — Cat artwork for IG series/
├── Characters — Character art, one-offs, custom pieces/
├── Comedy — Comedy scenes, memes, humorous art/
├── Film Club — Movie poster art, film tributes/
├── Luminous — Glowing neon, meditation, science art/
├── Mascot — Sheriff mascot scenes and variants/
├── Olympics — Olympic themed artwork/
├── Oscars — Oscar, cinema themed artwork/
├── Portfolio — Client project screenshots, case studies/
├── Social Media — Posts, stories, banners for IG-FB-X/
├── Videos — Raw video files, reels, clips/
└── README.md
```

### Desktop Shortcut

**"GFV Media Drop"** on Desktop → opens `Z:\MediaDrop`

### Workflow

1. Generate or receive new asset
2. Drop into appropriate `Z:\MediaDrop\<Category>` folder (or `_UNSORTED`)
3. Run processor: `cd z:\good-flippin-vibes && python scripts/process-media-drop.py`
4. Review auto-generated gallery entries
5. Push to deploy: `npm run deploy`
6. Optionally schedule social post via admin UI

---

## Technology Decisions

### Why build our own vs. use existing CMS?

| Factor                      | Build Our Own                             | Use Contentful/Sanity/Strapi     |
| --------------------------- | ----------------------------------------- | -------------------------------- |
| **Cost**                    | $0 (Cloudflare free tier)                 | $99-$499/month                   |
| **AI pipeline integration** | Native — our Python scripts talk directly | Webhooks + adapter layers        |
| **Multi-brand**             | First-class — brand switcher built in     | Per-project, separate configs    |
| **Media processing**        | Our GPU + sharp + ffmpeg                  | Their pipeline (limited control) |
| **Social publishing**       | Integrated — same Workers                 | Zapier/Make.com ($20-$100/mo)    |
| **Art catalog model**       | Emotions, vibes, display contexts         | Generic taxonomy                 |
| **Offline/local**           | Desktop app + CLI                         | Cloud-only                       |
| **Lock-in risk**            | Zero — we own everything                  | Medium — proprietary APIs        |

### Tech Stack (Final)

| Layer            | Technology                              | Why                                           |
| ---------------- | --------------------------------------- | --------------------------------------------- |
| Admin Frontend   | Vanilla HTML/JS or Lit elements         | Consistent with GFD, no build complexity      |
| API              | Cloudflare Workers                      | Already running auth + payments + API routing |
| Database         | Cloudflare D1 (SQLite)                  | Already bound, free tier generous             |
| File Storage     | Cloudflare R2                           | S3-compatible, $0.015/GB, no egress fees      |
| Auth             | Clerk                                   | Already live on GFD                           |
| Image Processing | Sharp (Node) + Pillow (Python)          | Already in pipelines                          |
| Video Processing | moviepy + ffmpeg                        | Already in video-generation                   |
| AI Generation    | OpenAI DALL-E + ThyOwn models           | Already integrated                            |
| Scheduling       | Cloudflare Cron Triggers                | Native, free, reliable                        |
| Desktop App      | Tauri (Rust + Web) or VS Code Extension | Lightweight, cross-platform                   |

---

## Priority Matrix

```
IMPACT
  ↑
  │  P1: Netflix rows    P2: Cloud Admin
  │  P1: MediaDrop proc  P2: R2 storage
  │  P1: Social links    P2: Social scheduler    P3: Desktop app
  │                       P2: Auto-embed IG       P3: AI pipeline merge
  │  P1: Gallery enhance  P2: Cross-brand deploy  P3: ThyOwn integration
  │                       P2: D1 schema           P3: Monitoring
  └──────────────────────────────────────────────────→ EFFORT
```

---

## Sprint Calendar

| Sprint       | Dates        | Deliverables                                                   |
| ------------ | ------------ | -------------------------------------------------------------- |
| **Sprint 1** | Mar 4–9      | Netflix rows on GFV, MediaDrop processor, gallery enhancements |
| **Sprint 2** | Mar 10–16    | Cloud admin MVP (asset browser + gallery manager), R2 setup    |
| **Sprint 3** | Mar 17–23    | Social scheduler + auto-embed, newsletter management           |
| **Sprint 4** | Mar 24–30    | Cross-brand deployment, CI/CD for all repos                    |
| **Sprint 5** | Mar 31–Apr 6 | AI pipeline unification, SummitView integration                |
| **Sprint 6** | Apr 7–13     | Content calendar, analytics dashboard                          |
| **Sprint 7** | Apr 14–20    | Desktop app or VS Code extension MVP                           |
| **Sprint 8** | Apr 21–27    | Monitoring, error tracking, performance dashboards             |
| **Sprint 9** | Apr 28–May 4 | Polish, documentation, onboarding flows                        |

---

## Success Metrics

| Metric                         | Current                   | Target (90 days)                           |
| ------------------------------ | ------------------------- | ------------------------------------------ |
| Art pieces in gallery          | 216                       | 500+                                       |
| Social media posts/week        | ~1 (manual)               | 5-7 (scheduled)                            |
| Time to publish new art        | ~30 min (manual pipeline) | ~2 min (drop + auto)                       |
| Brand sites with CI/CD         | 2/6                       | 6/6                                        |
| Admin portal features          | 0                         | 10+ (asset, social, newsletter, analytics) |
| Newsletter subscribers         | 0                         | 100+                                       |
| Social followers (combined)    | Unknown                   | Tracked in dashboard                       |
| Content distribution platforms | 1 (website)               | 5 (IG, FB, X, YouTube, website)            |

---

## Files & References

| Resource             | Location                                             |
| -------------------- | ---------------------------------------------------- |
| This roadmap         | `z:\GFD\ECOSYSTEM_CMS_ROADMAP.md`                    |
| MediaDrop zone       | `Z:\MediaDrop\` (desktop shortcut: "GFV Media Drop") |
| Gallery manifest     | `z:\good-flippin-vibes\public\gallery-assets.json`   |
| Art processing       | `z:\good-flippin-vibes\scripts\process-new-art.py`   |
| Gallery JS engine    | `z:\good-flippin-vibes\src\scripts\gallery.js`       |
| CultureSherpa CMS    | `z:\CultureSherpa\cms\`                              |
| Video pipeline       | `z:\good-flippin-vibes\video-generation\`            |
| Art generation       | `z:\good-flippin-vibes\art-generation\`              |
| SummitView           | `z:\GFD\GFD Dev Projects\SummitView\`                |
| PromptSynth          | `z:\PromptSynth\`                                    |
| GFD community portal | `z:\GFD\community-portal.html`                       |
| GFD worker (API)     | `z:\GFD\_worker.js`                                  |
| Auth worker          | `z:\GFD\workers\auth.js`                             |
| Stripe worker        | `z:\GFD\workers\stripe-payments.js`                  |
