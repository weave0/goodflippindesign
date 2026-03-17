# Asset Intake & Naming SOP

> Standard operating procedure for adding, naming, syncing, and registering media assets across the GFV LLC ecosystem.

---

## 1. Drop Directory: `E:\art`

All original artwork and media lives on the `E:\art` drive, organized by brand:

| Folder | Brand | Files | Notes |
| ------ | ----- | ----- | ----- |
| `AIAIMate/` | aiaimate | 48 | Product screenshots, brand assets |
| `Brand Assets Development/` | mixed | 121 | Cross-brand logo/font/color explorations |
| `Brett/` | personal | 10 | Headshots, personal brand |
| `Cats of IG/` | gfv | 39 | Instagram pet content |
| `CitizenApproved/` | citizenapproved | 18 | App screenshots, brand assets |
| `CultureSherpa/` | culturesherpa | 980 | Cultural images (hero + card pairs) |
| `GFD/` | gfd | 31 | Portfolio screenshots, consultancy branding |
| `GFV/` | gfv | 521 | Art series (Sheriff, Luminous, Posters, etc.) |
| `Media/` | mixed | 239 | Videos, podcasts, raw footage |
| `MUSIC/` | gfv | 91 | Audio tracks, sound design |
| `VECTOR/` | mixed | 39 | SVG/AI source files |
| `2026 Olympics/` | gfv | 11 | Seasonal Olympic-themed art |
| `Archive/` | mixed | 47 | Retired/deprecated assets |
| `Phone Link/` | personal | 29 | Phone camera auto-sync |
| `wip/` | mixed | 8 | Work in progress — not production-ready |

**Total**: ~2,232 files across 15 directories.

---

## 2. File Naming Convention

### Format

```
{brand}-{category}-{descriptor}[-{variant}].{ext}
```

### Rules

1. **Lowercase** everything, hyphens as separators (no spaces, underscores, or camelCase)
2. **Brand prefix** matches D1 `brand` column: `gfv`, `gfd`, `culturesherpa`, `aiaimate`, `citizenapproved`
3. **Category** matches `sync-config.json` source category or D1 `category` column
4. **Descriptor** is 2-4 words max, descriptive of the content
5. **Variant** suffix for size/format variants: `-thumb`, `-hero`, `-card`, `-social`, `-og`
6. **Extensions**: Prefer `.webp` for images (lossy OK for web), `.png` for transparency, `.mp4` for video

### Examples

```
gfv-sheriff-deputy-badge.webp
gfv-luminous-neon-cityscape.webp
gfv-posters-blade-runner-tribute.webp
culturesherpa-cultural-japan-hero.webp
culturesherpa-cultural-japan-card.webp
gfd-portfolio-eliassen-dashboard.png
aiaimate-brand-logo-dark.svg
```

### Existing Series (GFV)

The GFV art series map to these categories (16 subdirectories under `E:\art\GFV`):

| Folder | Category Slug | Files | Status |
| ------ | ------------- | ----- | ------ |
| `Sheriff/` | sheriff | 60 | synced to R2 |
| `art/luminous/` | luminous | 58 | synced to R2 |
| `Posters/` | posters | 25 | synced to R2 |
| `80s Ideas That Didn't/` | 80s-ideas | 17 | synced to R2 |
| `art/mascot/` | mascot | 14 | synced to R2 |
| `Street Life/` | street-life | 14 | synced to R2 |
| `Oscars/` | oscars | 10 | synced to R2 |
| `Zebra/` | zebra | 10 | synced to R2 |
| `PIckleFish/` | picklfish | 9 | synced to R2 |
| `art/abstract/` | abstract | 8 | synced to R2 |
| `art/comedy/` | comedy | 8 | synced to R2 |
| `Chill Bee's/` | chill-bees | 7 | synced to R2 |
| `Paddy Dill/` | paddy-dill | 4 | synced to R2 |
| `Flippin Rocky/` | flippin-rocky | 3 | synced to R2 |
| `Wii Todd/` | wii-todd | 3 | synced to R2 |
| `Irivine/` | — | — | not in sync config |
| `Logo/` | — | — | not in sync config |
| `Right's Dispute/` | — | — | not in sync config |
| `Toyko Hallwayz/` | — | — | not in sync config |

---

## 3. Sync Pipeline

### Overview

```
E:\art\{brand}\{series}\   ──→   sync-to-r2.js   ──→   R2: gfv-media/{brand}/{category}/
                                      │
                                      └──→   D1: cms_assets (metadata row)
```

### Configuration: `sync-config.json`

The pipeline reads from `sync-config.json` in the project root. Each source entry maps a local directory to an R2 destination:

```json
{
  "id": "art-gfv-sheriff",
  "path": "E:\\art\\GFV\\Sheriff",
  "recursive": false,
  "brand": "gfv",
  "category": "sheriff",
  "enabled": true
}
```

Key fields:
- **id**: Unique identifier for the source (used with `--source` flag)
- **path**: Absolute local path to the directory
- **recursive**: Whether to scan subdirectories
- **brand**: Target brand in D1 (`gfv`, `gfd`, `culturesherpa`, etc.)
- **category**: Category slug for R2 prefix and D1 column
- **enabled**: Set to `false` to skip during bulk syncs

### R2 Bucket Structure

Bucket: **`gfv-media`** (Cloudflare R2)

```
gfv-media/
├── culturesherpa/
│   └── cultural/          ← ~850 webp files
├── gfv/
│   ├── sheriff/           ← 60 files
│   ├── luminous/          ← 58 files
│   ├── posters/           ← 25 files
│   ├── 80s-ideas/         ← 17 files
│   ├── mascot/            ← 14 files
│   ├── street-life/       ← 14 files
│   ├── oscars/            ← 10 files
│   ├── zebra/             ← 10 files
│   ├── picklfish/         ← 9 files
│   ├── abstract/          ← 8 files
│   ├── comedy/            ← 8 files
│   ├── chill-bees/        ← 7 files
│   ├── paddy-dill/        ← 4 files
│   ├── flippin-rocky/     ← 3 files
│   └── wii-todd/          ← 3 files
└── gfd/
    └── portfolio/         ← not yet synced
```

**Total synced**: 1,129 assets (850 CultureSherpa + 279 GFV)

### D1 Registration

Every uploaded file gets a row in `cms_assets`:

| Column | Source |
| ------ | ------ |
| `id` | SHA-256 hash of file content |
| `brand` | From source config |
| `category` | From source config |
| `title` | Filename without extension |
| `file_path` | R2 key (e.g., `gfv/sheriff/deputy-badge.webp`) |
| `media_type` | Inferred from extension (image/video/audio) |
| `mime_type` | Mapped from extension |
| `file_size` | Bytes |
| `review_status` | `draft` (default — requires approval in admin) |

---

## 4. Running the Sync

### Prerequisites

```powershell
# Authenticated with Cloudflare
wrangler login

# R2 bucket exists
wrangler r2 bucket list   # should show gfv-media

# D1 database has cms_assets table
wrangler d1 execute gfd_community --command "SELECT count(*) FROM cms_assets"
```

### Commands

```powershell
# Sync all enabled sources
node scripts/sync-to-r2.js

# Sync a specific source by ID
node scripts/sync-to-r2.js --source art-gfv-sheriff

# Sync all assets for one brand
node scripts/sync-to-r2.js --brand gfv

# Preview changes without uploading
node scripts/sync-to-r2.js --dry-run

# Check current sync status
node scripts/sync-to-r2.js --status

# Re-sync everything (clears local manifest)
node scripts/sync-to-r2.js --reset
```

### Sync Manifest

The script maintains `.sync-manifest.json` locally to track which files have been uploaded. This prevents re-uploading unchanged files on subsequent runs.

---

## 5. Adding New Assets

### New files to an existing series

1. Drop files into the correct `E:\art\{brand}\{series}\` folder
2. Rename to match naming convention (lowercase, hyphens)
3. Run sync: `node scripts/sync-to-r2.js --source {source-id}`
4. Verify in admin panel → Art Management

### New art series

1. Create folder under `E:\art\{brand}\{series-name}\`
2. Add a source entry to `sync-config.json`:
   ```json
   {
     "id": "art-{brand}-{category}",
     "path": "E:\\art\\{brand}\\{series-name}",
     "recursive": false,
     "brand": "{brand}",
     "category": "{category-slug}",
     "enabled": true,
     "note": "Description of the series."
   }
   ```
3. Run sync: `node scripts/sync-to-r2.js --source art-{brand}-{category}`
4. Register in `art-catalog.json` if the series should appear in the gallery

### New brand

1. Create top-level folder `E:\art\{BrandName}\`
2. Add source entries to `sync-config.json` with `"brand": "{slug}"`
3. Ensure D1 `cms_assets` accepts the brand value (the column is free-text)
4. Run sync

---

## 6. Constraints

- **Max file size**: 50 MB (configured in `sync-config.json` → `maxFileSizeMB`)
- **Supported formats**: PNG, JPG, JPEG, WebP, AVIF, SVG, GIF, BMP, TIFF, MP4, MOV, WebM, AVI, MKV, M4V, WAV, MP3, M4A, FLAC, AAC, OGG, PSD, AI, FIG, Sketch, XD, INDD
- **No duplicate content**: The SHA-256 hash-based ID prevents duplicate uploads
- **Design files**: PSD/AI/Sketch are tracked but not served publicly from R2
- **Review workflow**: All new uploads land as `review_status = 'draft'` until approved via admin panel

---

## 7. Unsorted / Future Sources

These `E:\art` folders are not yet in the sync pipeline:

| Folder | Action Needed |
| ------ | ------------- |
| `Archive/` | Audit — some may be worth preserving |
| `Brand Assets Development/` | Extract final versions → brand folders |
| `Brett/` | Personal — keep out of ecosystem pipeline |
| `Cats of IG/` | Add sync config if activating on social platforms |
| `Media/` | Large (239 files) — needs video/audio triage |
| `MUSIC/` | Audio pipeline — needs separate handling for streaming |
| `Phone Link/` | Personal — keep out of pipeline |
| `VECTOR/` | Source files — sync to R2 as "design" type |
| `wip/` | Not production — exclude permanently |
| `GFV/Irivine/` | Needs sync-config entry |
| `GFV/Logo/` | Brand logos — consider separate source entry |
| `GFV/Right's Dispute/` | Needs sync-config entry |
| `GFV/Toyko Hallwayz/` | Needs sync-config entry |
