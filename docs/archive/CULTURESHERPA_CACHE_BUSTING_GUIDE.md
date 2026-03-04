# CultureSherpa Cache-Busting Test Instructions

## Problem

You're seeing cached `/explore/` paths because CloudFront hasn't propagated the invalidation yet (only 5.6 minutes elapsed, need 10-15 minutes).

## Option 1: Hard Refresh (Fastest)

### Chrome/Edge

1. Open https://culturesherpa.org/
2. Press **Ctrl + Shift + R** (Windows) or **Cmd + Shift + R** (Mac)
3. Check console - should see NO `/explore/` 404 errors

### Firefox

1. Open https://culturesherpa.org/
2. Press **Ctrl + F5** (Windows) or **Cmd + Shift + R** (Mac)

### Safari

1. Open https://culturesherpa.org/
2. Press **Cmd + Option + R**

## Option 2: Incognito/Private Window

1. Open new **Incognito** (Chrome) or **Private** (Firefox/Safari) window
2. Navigate to https://culturesherpa.org/
3. This bypasses browser cache completely

## Option 3: Clear Browser Cache

### Chrome DevTools Method

1. Open https://culturesherpa.org/
2. Press **F12** to open DevTools
3. Right-click the **Reload** button
4. Select **Empty Cache and Hard Reload**

## Option 4: Direct Cache-Busted URL

```
https://culturesherpa.org/?v=20260210
```

Add query parameter forces fresh load.

## Verification Steps

### ✅ SUCCESS Indicators (After Cache Clear)

```javascript
// Open browser console (F12) - should see:
✅ NO errors mentioning "/explore/"
✅ All CSS loaded (no MIME type errors)
✅ All JavaScript loaded (no failed fetch errors)
✅ Images display correctly
✅ Search functionality works
✅ Map page loads ✅ Navigation functional
```

### ❌ STILL FAILING Indicators

```javascript
// If you still see these after hard refresh:
GET https://culturesherpa.org/explore/_astro/...  404
GET https://culturesherpa.org/explore/cultural_images/...  404

// Then CloudFront edge cache near you hasn't invalidated yet
```

## Timeline

- **23:34** - Build completed
- **23:40** - First test (TOO EARLY - only 5.6 min)
- **23:45** - Try again (10 min) ← **TEST NOW**
- **23:50** - Should definitely work (15 min)

## What's Actually Deployed

The S3 bucket has correct files:

```
✅ /_astro/accessibility.css (root-relative)
✅ /cultural_images/afghan_card.webp (root-relative)
✅ /data/cultures_index.json (root-relative)

❌ NOT /explore/_astro/... (old paths removed)
```

## If Still Failing After 15 Minutes

Run diagnostic:

```powershell
# Test direct S3 access (bypasses CloudFront)
Invoke-WebRequest -Uri "https://culturesherpa-1754407998.s3.amazonaws.com/website/index.html" -Method Head

# Test CloudFront distribution
Invoke-WebRequest -Uri "https://culturesherpa.org/" -Method Head
```

Compare `Last-Modified` headers. If S3 is newer, CloudFront cache is stale.

## Invalidation Status Check

Check AWS Console:

1. Go to CloudFront → Distributions → E3OQS1ELTNU6VK
2. Click **Invalidations** tab
3. Look for invalidation created at ~23:40
4. Status should be "Completed" (not "In Progress")

---

**TL;DR:** Wait until **23:45** (10 minutes total) then hard refresh browser with **Ctrl+Shift+R**.
