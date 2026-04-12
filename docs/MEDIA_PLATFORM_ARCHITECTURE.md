# Weave Media Platform — Architecture

## Vision

A centralized asset management platform that bridges local storage (MediaDrop, E: Art Drive), cloud storage (Cloudflare R2), and live ecosystem websites — enabling brand-organized media to flow from creation to deployment across all sites with drag-and-drop simplicity.

---

## System Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ADMIN UI (admin.html)                        │
│  Asset Library │ Gallery Editor │ Site Browser │ Sync Dashboard      │
├─────────────────────────────────────────────────────────────────────┤
│                     CMS Worker API (cms.js)                         │
│  /assets │ /upload │ /media │ /sites │ /sync │ /galleries │ /crawl  │
├─────────────────────────────────────────────────────────────────────┤
│            D1 (Asset Registry)        │     R2 (Binary Storage)     │
│  cms_assets │ cms_asset_deployments   │     gfv-media bucket        │
│  cms_site_assets │ cms_galleries      │     {brand}/{category}/...  │
├─────────────────────────────────────────────────────────────────────┤
│                    INGESTION LAYER                                  │
│  scan-media-drop.js │ sync-to-r2.js │ crawl-sites.js               │
│  Z:\MediaDrop  │  E:\Art (selected)  │  Live site crawling          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Wire the Pipeline (Local → Cloud)

**Goal**: Files dropped into MediaDrop or selected E: Art folders automatically appear in the admin asset library, stored in R2, queryable by brand.

### New Script: `scripts/sync-to-r2.js`

```
node scripts/sync-to-r2.js                    # Sync all new MediaDrop files
node scripts/sync-to-r2.js --source E:\Art     # Sync E: Art Drive
node scripts/sync-to-r2.js --brand gfv         # Only sync GFV assets
node scripts/sync-to-r2.js --dry-run           # Preview without uploading
```

**Flow**:

1. Scans source directories (reuses `scan-media-drop.js` logic)
2. Filters to new/unprocessed files via manifest
3. Uploads each file to R2 via `wrangler r2 object put` or direct S3 API
4. Creates D1 `cms_assets` record via CMS API (`POST /api/cms/assets`)
5. Updates local manifest with sync status

### E: Art Drive Config

```json
// sync-config.json
{
  "sources": [
    {
      "path": "Z:\\MediaDrop",
      "recursive": true,
      "brandInference": "auto"
    },
    {
      "path": "E:\\Art\\GFV Galleries",
      "recursive": true,
      "brand": "gfv",
      "category": "gallery"
    },
    {
      "path": "E:\\Art\\Portfolio",
      "recursive": true,
      "brand": "gfd",
      "category": "portfolio"
    }
  ],
  "exclude": ["*.psd", "*.ai", "Thumbs.db", ".DS_Store"],
  "maxFileSizeMB": 50,
  "generateThumbnails": true
}
```

---

## Phase 2: Site Asset Discovery (Crawl → Registry)

**Goal**: Automatically discover and index every image/video deployed on ecosystem sites. Each asset in the registry knows which sites use it.

### New Script: `scripts/crawl-site-assets.js`

```
node scripts/crawl-site-assets.js                           # Crawl all sites
node scripts/crawl-site-assets.js --site goodflippinvibes.com  # Single site
```

**Flow**:

1. Fetches each site's HTML pages (configurable page list per domain)
2. Extracts all media references: `<img src>`, `<video src>`, `background-image: url()`, `<source srcset>`
3. Downloads each asset, computes hash for deduplication
4. Inserts into `cms_site_assets` (links discovered asset to source site + element selector)
5. If asset already exists in `cms_assets` (by hash), links them — otherwise creates new record

### New D1 Tables

```sql
-- Track which assets are deployed where
CREATE TABLE IF NOT EXISTS cms_asset_deployments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,                   -- FK to cms_assets.id
  site_domain TEXT NOT NULL,                -- e.g. goodflippinvibes.com
  page_path TEXT NOT NULL DEFAULT '/',      -- e.g. /gallery.html
  element_selector TEXT DEFAULT '',         -- CSS selector where this asset appears
  element_attribute TEXT DEFAULT 'src',     -- src, background-image, srcset, poster
  live_url TEXT NOT NULL,                   -- full URL on the live site
  status TEXT DEFAULT 'active',             -- active, replaced, removed
  last_crawled_at TEXT DEFAULT (datetime('now')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Gallery definitions per site (ordered collections of assets)
CREATE TABLE IF NOT EXISTS cms_galleries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_domain TEXT NOT NULL,                -- which site this gallery belongs to
  gallery_slug TEXT NOT NULL,               -- e.g. "abstract", "film-club"
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  brand TEXT NOT NULL DEFAULT 'gfv',
  sort_order INTEGER DEFAULT 100,
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(site_domain, gallery_slug)
);

-- Gallery items (ordered assets within a gallery)
CREATE TABLE IF NOT EXISTS cms_gallery_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gallery_id INTEGER NOT NULL REFERENCES cms_galleries(id) ON DELETE CASCADE,
  asset_id TEXT NOT NULL,                   -- FK to cms_assets.id
  sort_order INTEGER DEFAULT 100,
  caption TEXT DEFAULT '',
  alt_text TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  added_at TEXT DEFAULT (datetime('now'))
);
```

### Ecosystem Sites Config

```json
// ecosystem-sites.json
{
  "sites": [
    {
      "domain": "goodflippinvibes.com",
      "brand": "gfv",
      "pages": ["/", "/gallery", "/about", "/community"],
      "galleryPages": ["/gallery"],
      "assetBasePaths": ["/assets/", "/images/", "/media/"],
      "canReplace": true
    },
    {
      "domain": "goodflippindesign.com",
      "brand": "gfd",
      "pages": ["/", "/gallery.html", "/admin.html", "/donate.html"],
      "galleryPages": ["/gallery.html"],
      "assetBasePaths": ["/assets/"],
      "canReplace": true
    },
    {
      "domain": "aiaimate.com",
      "brand": "aiaimate",
      "pages": ["/"],
      "galleryPages": [],
      "assetBasePaths": ["/images/", "/assets/"],
      "canReplace": false
    },
    {
      "domain": "culturesherpa.org",
      "brand": "culturesherpa",
      "pages": ["/"],
      "galleryPages": [],
      "assetBasePaths": ["/assets/"],
      "canReplace": false
    },
    {
      "domain": "citizenapproved.org",
      "brand": "citizenapproved",
      "pages": ["/"],
      "galleryPages": [],
      "assetBasePaths": ["/assets/", "/images/"],
      "canReplace": false
    }
  ]
}
```

---

## Phase 3: Cross-Site Sharing & Live Replacement

**Goal**: Share assets between site galleries. Drag-and-drop replace images on live sites.

### New CMS API Routes

| Method   | Path                                   | Purpose                                                   |
| -------- | -------------------------------------- | --------------------------------------------------------- |
| `GET`    | `/api/cms/sites`                       | List ecosystem sites with asset counts                    |
| `GET`    | `/api/cms/sites/:domain/assets`        | Assets deployed on a specific site                        |
| `POST`   | `/api/cms/sites/crawl`                 | Trigger site crawl (returns job ID)                       |
| `GET`    | `/api/cms/galleries`                   | List all galleries across sites                           |
| `GET`    | `/api/cms/galleries/:id/items`         | Items in a gallery (ordered)                              |
| `POST`   | `/api/cms/galleries`                   | Create a gallery                                          |
| `PUT`    | `/api/cms/galleries/:id`               | Update gallery metadata                                   |
| `POST`   | `/api/cms/galleries/:id/items`         | Add asset to gallery                                      |
| `PUT`    | `/api/cms/galleries/:id/items/reorder` | Reorder gallery items                                     |
| `DELETE` | `/api/cms/galleries/:id/items/:itemId` | Remove from gallery                                       |
| `POST`   | `/api/cms/assets/:id/share`            | Copy asset into another brand/gallery                     |
| `POST`   | `/api/cms/assets/:id/replace`          | Replace a deployed asset (updates R2 + deployment record) |
| `POST`   | `/api/cms/sync/trigger`                | Trigger local→R2 sync pipeline                            |
| `GET`    | `/api/cms/sync/status`                 | Sync pipeline status                                      |

### Live Image Replacement Flow

```
Admin UI: Browse site assets → Select deployed image → Drag new file onto it
    ↓
POST /api/cms/assets/:id/replace
  body: { newFile: <binary>, deploymentId: <int> }
    ↓
Worker:
  1. Upload new file to R2 (same key as old file → instant CDN update)
  2. Update cms_assets record (version++, file_size, updated_at)
  3. Update cms_asset_deployments (status: 'replaced', points to new asset)
  4. Purge Cloudflare cache for the old URL
  5. Log audit trail
    ↓
Result: Image replaced on live site within seconds (Cloudflare edge cache purge)
```

### GFV Gallery Editor Flow

```
Admin UI: Select "goodflippinvibes.com" → "Art Galleries" tab
    ↓
Shows galleries: Abstract, Film Club, Luminous, Mascot, etc.
Each gallery: sortable grid of thumbnails
    ↓
Actions:
  - Drag to reorder
  - Click to edit caption/alt text
  - Drag from Asset Library to add
  - Share to another site's gallery
  - Remove from gallery
    ↓
Save → PATCH /api/cms/galleries/:id/items/reorder
    ↓
Gallery site reads from CMS API instead of static JSON
```

---

## Phase 4: External System Integration

**Goal**: Future-proof API that external tools and services can consume.

### API Authentication (for external systems)

```
Authorization: Bearer <clerk-token>         # Admin UI (existing)
Authorization: ApiKey <key>                 # External systems (new)
```

New table: `cms_api_keys` — scoped read/write permissions per brand.

### Webhooks

```sql
CREATE TABLE IF NOT EXISTS cms_webhooks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,                        -- HTTPS endpoint to POST to
  events TEXT NOT NULL DEFAULT '[]',        -- JSON: ["asset.upload", "gallery.update", ...]
  brand TEXT DEFAULT '',                    -- filter to specific brand
  secret TEXT NOT NULL,                     -- HMAC signing secret
  active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);
```

Events emitted:

- `asset.upload` — new file uploaded to R2
- `asset.replace` — live asset replaced
- `asset.delete` — asset deactivated
- `gallery.update` — gallery items changed
- `sync.complete` — local→R2 sync batch finished

### S3-Compatible Access

R2 is natively S3-compatible. External tools (Figma plugins, Adobe Bridge, CLI tools) can access the bucket directly:

```
Endpoint: https://<account-id>.r2.cloudflarestorage.com
Bucket: gfv-media
Access: R2 API token (created in Cloudflare dashboard)
```

---

## Data Model Summary

```
cms_assets (existing, extended)
  ├── id, brand, category, title, file_path (R2 key)
  ├── source_type: 'upload' | 'local_sync' | 'crawled' | 'shared'
  ├── source_path: local filesystem path (if synced)
  ├── content_hash: SHA-256 for dedup (new)
  ├── r2_key: explicit R2 key (new, mirrors file_path)
  └── variants: JSON of {thumb, og, hero} paths (new)

cms_asset_deployments (new)
  ├── asset_id → cms_assets.id
  ├── site_domain, page_path, element_selector
  ├── live_url, status
  └── last_crawled_at

cms_galleries (new)
  ├── site_domain, gallery_slug, title, brand
  └── sort_order, active

cms_gallery_items (new)
  ├── gallery_id → cms_galleries.id
  ├── asset_id → cms_assets.id
  ├── sort_order, caption, alt_text
  └── active

cms_api_keys (future)
  ├── key_hash, brand, permissions
  └── rate_limit, active

cms_webhooks (future)
  ├── url, events, brand, secret
  └── active
```

---

## Implementation Order

### Now (Phase 1) — Wire the Pipeline

1. ✅ `sync-config.json` — source directory configuration
2. ✅ `scripts/sync-to-r2.js` — local → R2 + D1 upload pipeline
3. ✅ `d1-schema-media-platform.sql` — schema extensions
4. ✅ New CMS routes for galleries and site assets

### Next (Phase 2) — Discovery & Galleries

5. `scripts/crawl-site-assets.js` — site asset crawler
6. `ecosystem-sites.json` — site configuration
7. Gallery editor UI in admin.html
8. Connect `gallery.html` to CMS API

### Then (Phase 3) — Replace & Share

9. Live asset replacement flow
10. Cross-site gallery sharing
11. Cloudflare cache purge integration

### Future (Phase 4) — External

12. API key authentication
13. Webhook system
14. S3-compatible access documentation

---

## Cost Impact

All within Cloudflare free tier:

- **R2**: 10 GB storage, zero egress, 1M class A ops/month → plenty for media library
- **D1**: 5M reads/day, 100K writes/day, 5 GB → handles asset registry easily
- **Workers**: 100K requests/day → sufficient for admin + gallery API calls
- **No additional services required** — everything runs on existing infrastructure
