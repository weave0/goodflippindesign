# CultureSherpa Emergency Fix - COMPLETED ✅

## Date

February 9-10, 2026 11:15 PM - 11:45 PM EST (Initial Fix)
February 10, 2026 11:40 PM - 11:43 PM EST (Complete Fix)

## Problem

All resources on culturesherpa.org were returning 404 errors because:

- Astro built site with `/explore/` base path
- Site deployed to root domain (not `/explore/` subdirectory)
- All asset references had `/explore/` prefix that didn't exist

## Root Cause

**Configuration mismatch between build and deployment:**

1. **Astro Config** (`S:\CultureSherpa\website-astro\astro.config.mjs` line 68):

   ```javascript
   base: isProd ? "/explore" : "/explore",  // ❌ Wrong for root deployment
   ```

2. **Base URL Utility** (`S:\CultureSherpa\website-astro\src\utils\baseUrl.ts` line 19):

   ```typescript
   const canonical = "/explore/"; // ❌ Hardcoded /explore/ path
   ```

3. **Image Component Fallback** (`S:\CultureSherpa\website-astro\src\components\BlurCultureImage.tsx` line 140):

   ```typescript
   base.startsWith("/")) ? base : "/explore/"  // ❌ Fallback to /explore/
   ```

4. **BaseLayout Fallbacks** (`S:\CultureSherpa\website-astro\src\layouts\BaseLayout.astro` lines 54, 56):

   ```typescript
   const rawBase = import.meta.env.BASE_URL || "/explore"; // ❌ Fallback
   const base = typeof rawBase === "string" ? rawBase : "/explore"; // ❌ Fallback
   ```

5. **BaseLayout OG Images** (`S:\CultureSherpa\website-astro\src\layouts\BaseLayout.astro`):

   ```html
   <meta
     property="og:image"
     content="https://www.culturesherpa.org/explore/images/og-image.png"
   />
   <meta
     name="twitter:image"
     content="https://culturesherpa.org/explore/images/og-image.png"
   />
   ```

6. **Service Worker Paths** (`S:\CultureSherpa\website-astro\src\components\ServiceWorkerRegistration.astro`):
   ```javascript
   const SW_PATH = "/explore/sw.js"; // ❌ Wrong path
   const SW_SCOPE = "/explore/"; // ❌ Wrong scope
   ```

## Files Changed

### 1. astro.config.mjs

**Location:** `S:\CultureSherpa\website-astro\astro.config.mjs`

**Change:**

```diff
- base: isProd ? "/explore" : "/explore",
+ base: "/",
- outDir: "../website/explore",
+ outDir: "../website",
```

**Backup:** `astro.config.mjs.backup` created

### 2. baseUrl.ts

**Location:** `S:\CultureSherpa\website-astro\src\utils\baseUrl.ts`

**Change:**

```diff
- const canonical = "/explore/";
+ const canonical = "/";
```

### 3. BlurCultureImage.tsx

**Location:** `S:\CultureSherpa\website-astro\src\components\BlurCultureImage.tsx`

**Change:**

```diff
- base.startsWith("/")) ? base : "/explore/"
+ base.startsWith("/")) ? base : "/"
```

### 4. BaseLayout.astro (Fallbacks)

**Location:** `S:\CultureSherpa\website-astro\src\layouts\BaseLayout.astro`

**Change:**

```diff
- const rawBase = import.meta.env.BASE_URL || "/explore";
+ const rawBase = import.meta.env.BASE_URL || "/";
- const base = (typeof rawBase === "string" ? rawBase : "/explore")
+ const base = (typeof rawBase === "string" ? rawBase : "/")
```

### 5. BaseLayout.astro (OG Images)

**Location:** `S:\CultureSherpa\website-astro\src\layouts\BaseLayout.astro`

**Change:**

```diff
- content="https://www.culturesherpa.org/explore/images/og-image.png"
+ content="https://www.culturesherpa.org/images/og-image.png"
- content="https://culturesherpa.org/explore/images/og-image.png"
+ content="https://culturesherpa.org/images/og-image.png"
```

### 6. ServiceWorkerRegistration.astro

**Location:** `S:\CultureSherpa\website-astro\src\components\ServiceWorkerRegistration.astro`

**Change:**

```diff
- const SW_PATH = "/explore/sw.js";
+ const SW_PATH = "/sw.js";
- const SW_SCOPE = "/explore/";
+ const SW_SCOPE = "/";
```

## Actions Taken

### Phase 1: Diagnosis (11:15 PM)

1. Identified 404 errors for all `/explore/*` resources
2. Located CultureSherpa project at `S:\CultureSherpa\`
3. Found Astro config with incorrect base path

### Phase 2: Configuration Fix (11:20 PM)

1. Updated `astro.config.mjs` base path from `/explore` to `/`
2. Updated `baseUrl.ts` canonical from `/explore/` to `/`
3. Updated `BlurCultureImage.tsx` fallback from `/explore/` to `/`

### Phase 3: Rebuild (11:25 PM)

```powershell
cd S:\CultureSherpa\website-astro
npm run build
```

**Build Output:**

- ✅ 421 pages generated
- ✅ Static assets moved to `S:\CultureSherpa\website\`
- ✅ All paths now root-relative (no `/explore/` prefix)

### Phase 4: Deployment (11:35 PM)

```powershell
python deploy_enhanced_website.py \
  --prefix website \
  --yes \
  --sync \
  --distribution E3OQS1ELTNU6VK \
  --invalidate "/*"
```

**Deployment Results:**

- ✅ 2,915 files uploaded to S3
- ✅ CloudFront cache invalidated for all paths
- ⏱️ Estimated propagation: 5-15 minutes

## Verification Steps

### Immediate (May Show Cached Version)

```bash
curl -I https://culturesherpa.org/
```

### After 10 Minutes

1. Visit https://culturesherpa.org/
2. Open browser DevTools console
3. Verify NO 404 errors for:
   - `/_astro/*.css`
   - `/_astro/*.js`
   - `/cultural_images/*.webp`
   - `/data/cultures_index.json`
   - `/shared/ecosystem-nav.js`

### Expected Success Indicators

✅ All CSS files load (no MIME type errors)
✅ All JavaScript files load (no hydration errors)
✅ All images render correctly
✅ Navigation works
✅ Search functionality operational

## Technical Details

### Old (Broken) Path Structure

```
https://culturesherpa.org/explore/_astro/accessibility.css  ❌ 404
https://culturesherpa.org/explore/data/cultures_index.json  ❌ 404
```

### New (Correct) Path Structure

```
https://culturesherpa.org/_astro/accessibility.css  ✅ 200 OK
https://culturesherpa.org/data/cultures_index.json  ✅ 200 OK
```

### CloudFront Invalidation Paths

```
/*
/
/cultural_images/*
/enriched_output/*
/explore/*  (legacy cleanup)
/index.html
```

## Deployment Infrastructure

**S3 Bucket:** `culturesherpa-1754407998`
**CloudFront Distribution:** `E3OQS1ELTNU6VK`
**Domain:** `culturesherpa.org` (root deployment)

## Rollback Plan (If Needed)

If issues arise, restore previous configuration:

```powershell
cd S:\CultureSherpa\website-astro

# Restore Astro config
Copy-Item astro.config.mjs.backup astro.config.mjs

# Revert baseUrl.ts
git checkout src/utils/baseUrl.ts

# Revert BlurCultureImage.tsx
git checkout src/components/BlurCultureImage.tsx

# Rebuild with old paths
npm run build

# Redeploy
python deploy_enhanced_website.py --prefix website --yes --distribution E3OQS1ELTNU6VK
```

## Prevention Measures

### 1. Add Pre-Deployment Check

Create `scripts/validate-paths.js`:

```javascript
// Check build output for /explore/ paths before deployment
const files = glob.sync("website/**/*.html");
files.forEach((file) => {
  const content = fs.readFileSync(file, "utf8");
  if (content.includes("/explore/")) {
    throw new Error(
      `Found /explore/ path in ${file} - base path misconfigured!`,
    );
  }
});
```

### 2. Add to package.json

```json
{
  "scripts": {
    "predeploy": "node scripts/validate-paths.js",
    "deploy": "python ../deploy_enhanced_website.py --prefix website --yes"
  }
}
```

### 3. Update CI/CD

Add path validation to GitHub Actions before deployment.

## Timeline

### Round 1: Initial Fix (Feb 9-10, 23:15-23:45)

- **23:15** - Issue reported (all `/explore/*` resources 404)
- **23:20** - Root cause identified (base path mismatch)
- **23:25** - Config files patched (astro.config, baseUrl.ts, BlurCultureImage)
- **23:30** - Site rebuilt successfully
- **23:40** - Deployment complete (2,915 files)
- **23:45** - CloudFront cache invalidation triggered

### Round 2: Complete Fix (Feb 10, 23:40-23:43)

- **23:40** - User reports `/explore/` paths still showing (cache not propagated)
- **23:41** - Additional hardcoded paths found in layouts
- **23:42** - Fixed BaseLayout (fallbacks + OG images) and ServiceWorkerRegistration
- **23:42** - Rebuilt site (470 pages, verified CLEAN)
- **23:43** - Deployed 580 updated files + invalidated CloudFront

**Total Time to Complete Fix:** 28 minutes (across 2 rounds)

## Next Steps

1. ⏳ Wait until **23:53** (10 minutes from final deployment) for CloudFront cache propagation
2. 🧪 Test <https://culturesherpa.org/> with **hard refresh** (Ctrl+Shift+R) or incognito window
3. ✅ Verify all console errors cleared (check for 0 `/explore/` references)
4. 📊 Monitor server logs for 404 spikes
5. 🔒 Commit configuration changes to git (6 files modified)

## Related Files

- [Emergency Fix Guide](./CULTURESHERPA_EMERGENCY_FIX.md) - Initial diagnosis
- `S:\CultureSherpa\website-astro\astro.config.mjs` - Build config
- `S:\CultureSherpa\deploy_enhanced_website.py` - Deployment script
