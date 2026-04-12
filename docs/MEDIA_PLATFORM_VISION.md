# Weave Media Platform — Product Vision Document

> **Created**: March 4, 2026
> **Updated**: March 7, 2026
> **Owner**: Brett Weaver / GFV LLC
> **Status**: LOCKED IN
> **Implementation Plan**: [ECOSYSTEM_CMS_ROADMAP.md](ECOSYSTEM_CMS_ROADMAP.md)

---

## Core Vision

Build a **lean, best-in-class, future-proof brand operations platform** that centralizes media, social, website asset management, and workflow orchestration across multiple properties — while remaining simple enough for a single operator to run efficiently and powerfully.

### Product Vision Statement

Build a multi-brand command center that unifies asset management, website media control, social account coordination, and workflow automation into one intuitive platform — so that digital ecosystem operations can be executed by one person with exceptional efficiency, consistency, and scale.

### One-Sentence Essence

**Build a world-class, lean multi-brand media and workflow operating system that turns fragmented digital asset and content management into a unified, scalable, high-leverage command center.**

---

## What Is Really Being Created

This platform has five major ambitions.

### 1. A Unified Asset Nervous System

A single place to ingest, organize, tag, search, version, share, and deploy media assets across brands.

Not just storage — an **intelligent asset layer** that understands:

- Brand ownership and context
- Website/gallery placement
- Usage mapping and replacement history
- Cross-brand reuse potential
- Source of truth across the ecosystem

Assets should move cleanly between local drives (`E:\Art Drive`), staging/drop buckets, cloud storage, live site galleries, and future external systems.

### 2. A Cross-Brand Content Command Center

Manage multiple distinct brands and websites from one interface, while preserving separation where needed:

- Shared assets across brands
- Brand-specific galleries
- Social account mapping across brands
- Consistent workflow orchestration
- Centralized oversight with selective isolation

This is not a single-site CMS. It is a **multi-brand orchestration layer**.

### 3. Live Website Media Control Without Fragile Manual Work

- See assets currently deployed on live websites
- Replace them visually from the platform
- Push swaps live without manual redeploy processes
- Edit galleries directly from the admin interface
- Reuse media from one site/gallery in another

**Site-aware asset management** — connected to the live experience, not just a back-office file library.

### 4. Workflow Harmonization and Future-Proofing

- Unify workflows across tools and brands
- Reduce manual fragmentation and repetitive work
- Integrate gracefully with external systems
- Scale from one operator to broader organizational use
- Avoid bloat while remaining enterprise-grade in structure

### 5. Extreme Leverage for a Solo Operator

The system should amplify personal output dramatically — removing repetitive work, making complex ecosystem management feel elegant, and becoming a differentiator others admire and want to emulate.

**The platform should make one person look like an entire high-performing creative/content/ops department.**

---

## Core Mission

Create a centralized multimedia management and publishing platform that allows the team to:

- Organize all creative assets across brands from **one master drop location**
- Quickly ingest and categorize new media with **automated detection and processing**
- Display content in **Netflix-style scrollable gallery rows** by category
- Publish and distribute assets across websites and social platforms
- Scale across multiple brands and projects
- Operate both **locally** (desktop power tools) and via **cloud admin** (browser CMS)

---

## Brands Served

| Brand               | Domain                | Content Focus                         |
| ------------------- | --------------------- | ------------------------------------- |
| Good Flippin Vibes  | goodflippinvibes.com  | Art, community, creative expression   |
| Good Flippin Design | goodflippindesign.com | Portfolio, consulting, platform admin |
| AI AIMATE           | aiaimate.com          | AI education, interactive content     |
| CitizenApproved     | citizenapproved.org   | Immigration education                 |
| CultureSherpa       | culturesherpa.org     | Cultural learning platform            |
| GlobalDeets         | globaldeets.com       | BI project hub                        |

Future brands plug in with zero architecture changes.

---

## What Already Exists (We Just Never Called It a CMS)

- CultureSherpa's Python CMS (editorial workflow FSM, versioning, diffing, admin CRUD)
- GFV's `gallery-assets.json` manifest (216 assets, 20 categories, emotion taxonomies)
- GFV's art-generation + video-generation Python pipelines (DALL-E, moviepy, TTS)
- GFD's community portal (Clerk auth, D1 database, gamification)
- Multiple Cloudflare Workers (auth, payments, API routing)
- `Z:\MediaDrop` unified asset drop zone with categorized subdirectories
- SummitView documentary production engine
- ThyOwn AI model training + agent system
- PromptSynth prompt engineering engine

**What we're building**: The connective tissue that unifies all of this into a coherent platform.

---

## Functional Pillars

| Pillar                          | Description                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| **Asset Ingestion**             | Import from local drives, drop buckets, uploads, and discovered live-site assets         |
| **Asset Intelligence**          | Brand tagging, metadata, usage mapping, cross-brand relationships, versioning, search    |
| **Live Deployment Control**     | Replace media on websites and galleries from the platform without brittle manual steps   |
| **Cross-Brand Governance**      | Manage multiple brands with clean permissions, separations, and sharing rules            |
| **Social Ecosystem Management** | Connect, inventory, and coordinate social accounts and their related assets/workflows    |
| **Workflow Automation**         | Remove repetitive tasks, harmonize tooling, enable intelligent future automation         |
| **Extensibility**               | Support future connectors, DAM behaviors, publishing tools, AI enrichment, external APIs |

---

## Design Principles

- **Lean over bloated**
- **Elegant over patchwork**
- **Centralized but flexible**
- **Powerful for one user, scalable for many**
- **Operationally simple, architecturally strong**
- **Cross-brand by design**
- **Live-site aware**
- **Integration-friendly**
- **Future-proof, not just quick-fixed**
- **Best-in-class UX for serious work**

---

## What Success Looks Like

Success is not just "the admin panel works." Success is:

- Uploads are reliable and automated
- Asset relationships are visible across brands
- Galleries are editable centrally without redeployment
- Cross-brand sharing is intentional, not duplicated
- Social accounts are systematically linked
- Workflows feel unified instead of improvised
- The platform becomes the operating layer for the entire ecosystem
- The operator gains extraordinary leverage from how smoothly everything runs

---

## Implementation Architecture

### 1. One Master Asset Repository

All media assets originate from a single drop location: `Z:\MediaDrop`

No confusion. No duplicate folders. No manual syncing.

```
Z:\MediaDrop\
├── _UNSORTED/              — Drop anything, system will sort
├── Art/
│   ├── Branding/           — Logos, identity assets
│   ├── Illustration/       — Digital art, drawings
│   ├── Product/            — Product shots, mockups
│   └── Concept/            — Concept art, explorations
├── Video/
│   ├── Social/             — Reels, shorts, clips
│   ├── Longform/           — Full videos, episodes
│   ├── Reels/              — Instagram/TikTok reels
│   └── Ads/                — Promotional video
├── Photography/
│   ├── Products/           — Product photography
│   ├── Lifestyle/          — Lifestyle shots
│   └── Events/             — Event coverage
├── Audio/
│   ├── Music/              — Music tracks, beats
│   └── Voiceover/          — Narration, voice recordings
├── Social/
│   ├── Instagram/          — IG-ready posts
│   ├── LinkedIn/           — LinkedIn content
│   └── TikTok/             — TikTok content
├── BrandSpecific/
│   ├── GoodFlippinVibes/   — GFV-only assets
│   ├── GoodFlippinDesign/  — GFD-only assets
│   ├── CultureSherpa/      — CS-only assets
│   ├── CitizenApproved/    — CA-only assets
│   └── AIAimate/           — AIAI-only assets
└── Archive/                — Versioned/retired assets
```

Desktop shortcut: **"Media Drop"** → `Z:\MediaDrop`

### 2. Automated Asset Detection

When new assets appear in MediaDrop, the system:

1. **Detects** new files (file watcher or on-demand scan)
2. **Converts** images to optimized formats (WebP, thumbnails)
3. **Extracts** metadata (dimensions, format, EXIF)
4. **Categorizes** based on drop folder + AI tagging
5. **Adds** to CMS library (gallery-assets.json, D1 database)
6. **Generates** thumbnails at multiple breakpoints

### 3. Netflix-Style Visual Gallery

Homepage rows of scrollable categories:

```
Featured Projects          [ img ] [ img ] [ img ] [ img ] →
Recent Uploads             [ img ] [ img ] [ img ] [ img ] →
Illustration               [ img ] [ img ] [ img ] [ img ] →
Photography                [ img ] [ img ] [ img ] [ img ] →
Video Content              [ img ] [ img ] [ img ] [ img ] →
Branding Work              [ img ] [ img ] [ img ] [ img ] →
CultureSherpa Media        [ img ] [ img ] [ img ] [ img ] →

                    [ View All Categories →]
```

Each row: horizontal scroll, drag, snap, hover effects.

**"View All"** page: Dedicated gallery with grid view, category filtering, search, tags, brand filtering, date sorting.

### 4. Dual-Mode Operation

**Mode 1 — Local Media Manager** (Desktop)

- Fast, private, offline-capable
- Asset ingestion, tagging, batch uploads, thumbnail generation
- Direct GPU-accelerated media processing
- File system watcher on MediaDrop

**Mode 2 — Cloud Admin CMS** (Browser)

- Accessible at `admin.goodflippindesign.com` (or `/admin.html`)
- Gallery management, brand management, social scheduling
- Upload approval, user permissions
- Content publishing across all brand sites

---

## CMS Data Model

```
Asset
 ├─ ID (UUID)
 ├─ File Path (local) / R2 Key (cloud)
 ├─ Asset Type (image, video, audio, document)
 ├─ Brand (gfv, gfd, aiaimate, citizenapproved, culturesherpa)
 ├─ Category
 ├─ Project
 ├─ Tags[] (JSON array)
 ├─ Emotions[] (JSON array — unique to our art taxonomy)
 ├─ Description
 ├─ Upload Date
 ├─ Thumbnails (140w, 320w, 400w)
 ├─ Video Embed URL (YouTube, IG, self-hosted)
 ├─ Version (v1, v2, final)
 ├─ Social Status (draft, scheduled, published)
 ├─ Featured (boolean)
 └─ Active (boolean)
```

Example metadata:

```json
{
  "id": "asset_2026_0304_001",
  "brand": "CultureSherpa",
  "asset_type": "illustration",
  "category": "Education",
  "project": "Culture Card Series",
  "tags": ["culture", "education", "cards"],
  "emotions": ["inspiring", "warm"],
  "created_date": "2026-03-04",
  "version": 1
}
```

---

## Video Integration

Three video sources, unified in one interface:

| Source       | Mechanism                       | Example                   |
| ------------ | ------------------------------- | ------------------------- |
| YouTube      | oEmbed/iframe auto-embed        | Channel videos, tutorials |
| Social Media | API pull (IG Reels, TikTok)     | Latest reels auto-update  |
| Self-Hosted  | Upload to R2, serve via Workers | High-quality originals    |

---

## Social Media Integration

Cross-posting and scheduling across:

| Platform  | API                 | Capabilities                |
| --------- | ------------------- | --------------------------- |
| Instagram | Meta Graph API v21  | Reels, carousels, stories   |
| Facebook  | Meta Graph API v21  | Posts, photos, videos       |
| YouTube   | YouTube Data API v3 | Uploads, shorts, thumbnails |
| X/Twitter | Twitter API v2      | Tweets, media, threads      |
| TikTok    | TikTok Content API  | Video uploads               |
| LinkedIn  | LinkedIn API        | Professional posts          |
| Pinterest | Pinterest API       | Pin creation                |

Future capabilities: queue posts, schedule posts, attach media, publish to multiple platforms simultaneously, content calendar with drag-drop scheduling.

---

## Website Integration

All brand sites pull assets dynamically from the CMS:

```
GET /api/assets?brand=CultureSherpa&type=image&limit=20
GET /api/assets?brand=GFV&category=Featured&format=gallery
GET /api/social/latest?brand=GFV&platform=instagram&limit=6
```

No manual embedding. Sites auto-update when new content is published.

---

## Technical Architecture

| Layer            | Technology                        | Rationale                       |
| ---------------- | --------------------------------- | ------------------------------- |
| Admin Frontend   | Vanilla HTML/JS (or Lit elements) | Consistent with GFD philosophy  |
| API              | Cloudflare Workers                | Already running auth + payments |
| Database         | Cloudflare D1 (SQLite)            | Already bound, free tier        |
| File Storage     | Cloudflare R2                     | S3-compatible, $0.015/GB        |
| Auth             | Clerk                             | Already live on GFD             |
| Image Processing | Sharp (Node) + Pillow (Python)    | Already in pipelines            |
| Video Processing | moviepy + ffmpeg                  | Already in video-generation     |
| AI Generation    | OpenAI DALL-E + ThyOwn models     | Already integrated              |
| Scheduling       | Cloudflare Cron Triggers          | Native, free, reliable          |
| Desktop App      | Tauri (or VS Code Extension)      | Lightweight, cross-platform     |
| Local Drop Zone  | `Z:\MediaDrop` + file watchers    | Already created                 |

---

## Development Roadmap (Detailed in ECOSYSTEM_CMS_ROADMAP.md)

| Phase       | Focus                                                   | Timeline                   |
| ----------- | ------------------------------------------------------- | -------------------------- |
| **Phase 1** | Netflix-style gallery rows + MediaDrop processor        | Sprint 1 (Mar 4–9)         |
| **Phase 2** | Cloud admin portal (asset browser, gallery manager, R2) | Sprint 2–3 (Mar 10–23)     |
| **Phase 3** | Social media automation (scheduler, auto-embed)         | Sprint 3–4 (Mar 17–30)     |
| **Phase 4** | Cross-brand unification (shared components, CI/CD)      | Sprint 4–5 (Mar 24–Apr 6)  |
| **Phase 5** | AI content generation pipeline (unified engine)         | Sprint 5–6 (Mar 31–Apr 13) |
| **Phase 6** | Desktop application (Tauri/VS Code extension)           | Sprint 7 (Apr 14–20)       |
| **Phase 7** | Monitoring & observability                              | Sprint 8 (Apr 21–27)       |

---

## Operational Workflow (Best Practice — Locked In)

```
Create or receive asset
        ↓
Drop into Z:\MediaDrop\<Category>
  (or _UNSORTED if unsure)
        ↓
System detects new files
        ↓
Auto-process: convert, thumbnail, metadata
        ↓
CMS catalogs asset (D1 + gallery-assets.json)
        ↓
Asset appears in admin portal + galleries
        ↓
Schedule for social distribution (optional)
        ↓
Published across brands + platforms
```

---

## Success Metrics (90-Day Targets)

| Metric                  | Current     | Target               |
| ----------------------- | ----------- | -------------------- |
| Art pieces in gallery   | 216         | 500+                 |
| Social posts/week       | ~1 manual   | 5–7 scheduled        |
| Time to publish new art | ~30 min     | ~2 min (drop + auto) |
| Brand sites with CI/CD  | 2/6         | 6/6                  |
| Admin portal features   | 0           | 10+                  |
| Distribution platforms  | 1 (website) | 5+                   |

---

## Long-Term Vision

This platform becomes a **central creative operations system** — not just a CMS:

- **Creative Asset Manager** — organize, version, search all media
- **Social Media Manager** — schedule, publish, track across platforms
- **Publishing Platform** — feed content to all brand websites
- **Brand Media Repository** — single source of truth per brand
- **Marketing Content Hub** — campaign planning, content calendar
- **AI Generation Control Plane** — orchestrate DALL-E, ThyOwn, PromptSynth

All controlled from one ecosystem. All owned by us. Zero vendor lock-in.

---

## Related Documents

| Document                                             | Purpose                                                           |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| [ECOSYSTEM_CMS_ROADMAP.md](ECOSYSTEM_CMS_ROADMAP.md) | Full implementation roadmap with sprints, schemas, tech decisions |
| [ROADMAP.md](ROADMAP.md)                             | GFD-specific development roadmap                                  |
| [START_HERE.md](START_HERE.md)                       | Ecosystem navigation and deployment status                        |
| [DEVELOPER_GUIDE.md](DEVELOPER_GUIDE.md)             | Development conventions and workflows                             |
