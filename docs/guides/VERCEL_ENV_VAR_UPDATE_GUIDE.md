# Vercel Environment Variable Update Process

**Date**: 2026-02-09
**Purpose**: Document manual Vercel env var updates for GA4 migration
**Affected Sites**: CitizenApproved, AI Aimate

---

## 🎯 Overview

Vercel-hosted sites (CitizenApproved and AI Aimate) require environment variables to be updated in the Vercel dashboard. Unlike git-based deployments, env vars must be manually configured through the Vercel UI.

---

## 📋 Required Environment Variables

### CitizenApproved

- **Variable**: `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- **Value**: `G-WM6Q66W9W0`
- **Vercel Project**: `https://vercel.com/weave0/citizenapproved`

### AI Aimate

- **Variable**: `NEXT_PUBLIC_GA_MEASUREMENT_ID`
- **Value**: `G-WM6Q66W9W0`
- **Vercel Project**: `https://vercel.com/weave0/aiaimate`

---

## 🔧 Step-by-Step Update Process

### 1. Access Vercel Dashboard

**For CitizenApproved**:

```powershell
# Open in browser
start https://vercel.com/weave0/citizenapproved/settings/environment-variables
```

**For AI Aimate**:

```powershell
# Open in browser
start https://vercel.com/weave0/aiaimate/settings/environment-variables
```

### 2. Update Environment Variable

1. **Login** to Vercel (if not already logged in)
2. Navigate to **Settings** → **Environment Variables**
3. Find `NEXT_PUBLIC_GA_MEASUREMENT_ID`
   - If it exists: Click **Edit**
   - If it doesn't exist: Click **Add New**
4. Set value to: `G-WM6Q66W9W0`
5. Select environments:
   - ✅ **Production**
   - ✅ **Preview** (optional but recommended)
   - ✅ **Development** (optional)
6. Click **Save**

### 3. Trigger Production Deployment

**Option A: Redeploy via Vercel UI**

1. Go to **Deployments** tab
2. Find latest successful deployment
3. Click three-dots menu → **Redeploy**
4. Select **Use existing Build Cache** (faster)
5. Click **Redeploy**

**Option B: Redeploy via Vercel CLI**

**CitizenApproved**:

```powershell
cd z:\CitizenApproved
vercel --prod
```

**AI Aimate**:

```powershell
cd z:\aiaimate\portal
vercel --prod
```

**Option C: Force new deployment via git**

```powershell
# Empty commit to trigger deployment
git commit --allow-empty -m "chore: Trigger Vercel deployment for GA4 env var"
git push origin main
```

### 4. Verify Deployment

Wait 2-5 minutes for deployment, then verify:

**CitizenApproved**:

```powershell
curl https://citizenapproved.org | Select-String "G-WM6Q66W9W0"
```

**AI Aimate**:

```powershell
curl https://aiaimate.com | Select-String "G-WM6Q66W9W0"
```

Expected output: Should show `gtag.js?id=G-WM6Q66W9W0` in HTML

---

## ⚠️ Common Issues & Solutions

### Issue 1: Environment Variable Not Taking Effect

**Symptom**: Changed env var but old value still in production

**Solution**:

```powershell
# Force clean rebuild (slower but guaranteed)
cd z:\CitizenApproved  # or z:\aiaimate\portal
vercel --prod --force
```

### Issue 2: "Command 'vercel' not found"

**Solution**:

```powershell
# Install Vercel CLI globally
npm install -g vercel

# Login
vercel login
```

### Issue 3: Multiple Vercel Accounts/Teams

**Solution**:

```powershell
# List available teams/accounts
vercel teams list

# Switch to correct team
vercel switch

# Or specify team in command
vercel --prod --scope weave0
```

### Issue 4: Build Fails After Env Var Change

**Symptom**: Deployment fails with build error

**Causes**:

- TypeScript expects different env var format
- Missing related env vars
- Build script references old var

**Solution**:

1. Check Vercel deployment logs
2. Verify all required env vars are set
3. Test build locally:
   ```powershell
   cd z:\CitizenApproved
   npm run build  # Should complete without errors
   ```

---

## 🔍 Verification Checklist

After updating env vars and redeploying:

### Automated Verification

```powershell
cd z:\GFD
.\scripts\verify-ga4-production.ps1
```

### Manual Verification

**CitizenApproved**:

1. Open https://citizenapproved.org
2. Open DevTools (F12) → Network tab
3. Look for request to `gtag/js?id=G-WM6Q66W9W0`
4. Open Console → Type: `window.dataLayer`
5. Should see array with GA4 events

**AI Aimate**:

1. Open https://aiaimate.com
2. Repeat same steps as above

### GA4 DebugView Verification

1. Install [Google Analytics Debugger](https://chrome.google.com/webstore/detail/google-analytics-debugger)
2. Enable debugger (click extension icon)
3. Visit https://analytics.google.com → **Admin** → **DebugView**
4. Visit CitizenApproved and AI Aimate
5. Verify events appear in DebugView

---

## 📊 Deployment Status

### Updated as of 2026-02-09

| Site            | Env Var Set? | Deployed? | Verified? | Notes              |
| --------------- | ------------ | --------- | --------- | ------------------ |
| CitizenApproved | ✅ Yes       | ❌ No     | ❌ No     | Needs redeploy     |
| AI Aimate       | ✅ Yes       | ✅ Yes    | ✅ Yes    | Live in production |

---

## 🎯 Next Actions

### Immediate (Do Now)

1. **CitizenApproved**: Trigger Vercel redeploy to pick up env var
2. **Verify**: Run `verify-ga4-production.ps1` to confirm both sites pass

### After Deployment

3. **GA4 DebugView**: Verify events are flowing to GA4
4. **Update GA4_DEPLOYMENT_COMPLETE.md**: Mark Vercel env vars as complete

---

## 📚 Vercel CLI Reference

### Essential Commands

```powershell
# List all deployments
vercel ls

# Get deployment details
vercel inspect <deployment-url>

# List environment variables
vercel env ls

# Pull environment variables to .env.local
vercel env pull

# Deploy to production
vercel --prod

# Deploy with specific team
vercel --prod --scope weave0
```

### Environment Variable Management

```powershell
# Add new env var
vercel env add VARIABLE_NAME

# Remove env var
vercel env rm VARIABLE_NAME

# Pull latest env vars to local
vercel env pull .env.local
```

---

## 🔗 Resources

- **Vercel Env Var Docs**: https://vercel.com/docs/projects/environment-variables
- **Vercel CLI Docs**: https://vercel.com/docs/cli
- **GA4 Measurement ID**: https://support.google.com/analytics/answer/9539598

---

## ✅ Success Criteria

**Vercel env vars are fully deployed when**:

- ✅ Both sites show `G-WM6Q66W9W0` in production HTML
- ✅ `verify-ga4-production.ps1` shows 4/6 or 6/6 PASS (depending on other site deployments)
- ✅ GA4 DebugView shows events from both sites
- ✅ No build errors in Vercel deployment logs

---

**Last Updated**: 2026-02-09 12:20 PST
**Status**: CitizenApproved pending redeploy, AI Aimate complete ✅
