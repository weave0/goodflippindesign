# Enable GitHub Auto-Deployment (One-Time Setup)

**Status**: ⚠️ Currently deploying via CLI (`wrangler pages deploy`)
**Goal**: Enable FREE auto-deployment from GitHub (no manual deploys)

---

## Quick Setup (5 minutes)

### Option 1: Cloudflare Dashboard (Easiest)

1. **Open Dashboard**:

   ```
   https://dash.cloudflare.com/?to=/:account/pages/view/goodflippindesign/settings/builds-deployments
   ```

2. **Connect to GitHub**:
   - Click **"Connect to Git"** button
   - Authorize Cloudflare to access GitHub
   - Select: **weave0/goodflippindesign** repository

3. **Configure Build**:
   - Production branch: `main`
   - Build command: `npm run build`
   - Build output directory: `.` (current directory)
   - Root directory: `/` (leave empty)

4. **Save** → ✅ Done!

### Option 2: CLI (For Automation Lovers)

```powershell
# Not currently supported by wrangler CLI
# Use Dashboard method above
```

---

## What You Get

### Before (Current State)

- Manual deployment: `wrangler pages deploy .`
- Must remember to deploy after changes
- No automation

### After (Auto-Deploy)

- Push to GitHub → Auto-deploys (FREE)
- No manual steps
- No GitHub Actions needed
- 2-minute time-to-live

---

## Verification

After connecting, verify auto-deploy works:

```powershell
# 1. Make a small change
echo "<!-- Test auto-deploy -->" >> index.html

# 2. Commit and push
git add index.html
git commit -m "test: verify auto-deploy"
git push origin main

# 3. Watch Cloudflare dashboard
# https://dash.cloudflare.com/?to=/:account/pages/view/goodflippindesign

# 4. See deployment start automatically (within 30 seconds)
# ✅ Live in ~2 minutes
```

---

## Current Deployment Method

Until you complete the GitHub connection, continue using CLI:

```powershell
# Manual deploy (current method)
wrangler pages deploy . --project-name=goodflippindesign

# This works but isn't automated
# Complete the GitHub connection to eliminate this step
```

---

## Why This Matters

**Cost**: $0 (Cloudflare Pages is free)
**Time Saved**: 2-3 minutes per deployment
**Automation**: 100% hands-off after push
**Reliability**: No forgotten deployments

---

## Status

- [x] Cloudflare Pages project created
- [x] Custom domain configured (goodflippindesign.com)
- [ ] **← TODO: Connect GitHub for auto-deploy**
- [x] GitHub Actions optimized (tests only)
- [x] Security headers configured

**Next**: Complete the GitHub connection (5 min setup) ✅
