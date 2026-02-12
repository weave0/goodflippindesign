# CultureSherpa Emergency Fix - Base Path Issue

## Problem

All resources failing with 404 because they're requested at `/explore/*` but deployed to root domain.

## Root Cause

Astro config has `base: '/explore/'` but site is deployed to `https://culturesherpa.org/` (not `/explore/` subdirectory).

## Immediate Fix

### 1. Navigate to CultureSherpa Project

```powershell
cd S:\CultureSherpa
```

### 2. Locate and Edit Astro Config

Find one of these files:

- `astro.config.mjs`
- `astro.config.js`
- `astro.config.ts`

### 3. Remove/Comment Base Path

**BEFORE (causing 404s):**

```javascript
export default defineConfig({
  base: "/explore/", // ❌ REMOVE THIS LINE
  // ... other config
});
```

**AFTER (correct for root deployment):**

```javascript
export default defineConfig({
  // base: '/explore/',  // Removed - deploying to root domain
  // ... other config
});
```

OR if you want to deploy to a subdirectory, update your S3/server config to serve from `/explore/` path.

### 4. Rebuild

```powershell
npm run build
# OR
pnpm build
# OR
yarn build
```

### 5. Verify Build Output

Check `dist/index.html` - asset paths should be:

- ✅ `/cultural_images/afghan_card.webp` (root-relative)
- ✅ `/_astro/accessibility.DaJxwHyB.css` (root-relative)
- ❌ NOT `/explore/cultural_images/...`

### 6. Redeploy to S3

```powershell
# Your existing deployment command
aws s3 sync dist/ s3://your-bucket-name/ --delete
```

## Alternative: Keep `/explore/` Path

If you WANT the site at `culturesherpa.org/explore/`:

1. Keep `base: '/explore/'` in config
2. Update S3 bucket routing:
   - Upload dist/ contents to `/explore/` prefix in S3
   - OR configure CloudFront to route `/explore/` to the correct origin

## Verification

After fix, check these URLs manually:

- https://www.culturesherpa.org/ (should load without console errors)
- https://www.culturesherpa.org/_astro/accessibility.*.css (should return CSS, not HTML)

## Files Affected by This Issue

All 404 errors stem from incorrect base path:

- CSS: `_astro/*.css`
- JS: `_astro/*.js`, `shared/ecosystem-nav.js`
- Images: `cultural_images/*.webp`, `hero/**/*.png`, `images/*.png`
- Data: `data/cultures_index.json`

## Time to Fix

- Config change: 2 minutes
- Rebuild: 1-5 minutes (depends on project size)
- Redeploy: 2-10 minutes (depends on S3 upload speed)
- **Total: ~15 minutes**
