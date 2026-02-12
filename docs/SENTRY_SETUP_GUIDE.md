# Sentry Error Tracking Setup Guide

**Cost**: $0/month for <50K events (your current traffic: ~1K/month)
**Time to setup**: 10 minutes
**Value**: Catch auth failures, comment errors, DB performance issues BEFORE users ghost your site

---

## 🎯 Why This Matters

**Without Sentry**: If JWT validation breaks, comments fail, or D1 queries timeout, you only know when users complain (or ghost silently).

**With Sentry**: SMS alerts before it impacts >10 users + full stack traces to fix in <1 hour.

---

## 📋 Quick Setup (10 Minutes)

### Step 1: Create Sentry Account (3 min)

1. Go to [sentry.io/signup](https://sentry.io/signup/)
2. Choose **Developer plan** (FREE - no credit card required)
3. Create new project:
   - Platform: **Cloudflare Workers**
   - Project name: `gfd-community`
   - Alert frequency: **On every new issue** (recommended)

### Step 2: Get Your DSN (1 min)

After project creation, copy your DSN. It looks like:

```
https://abc123def456@o987654.ingest.sentry.io/7654321
```

### Step 3: Add to Cloudflare Secrets (2 min)

```powershell
# Navigate to project directory
cd Z:\GFD

# Set Sentry DSN as secret (paste your real DSN when prompted)
wrangler secret put SENTRY_DSN
# When prompted, paste: https://abc123def456@o987654.ingest.sentry.io/7654321
```

**Why a secret?** DSN contains your project ID - not sensitive, but best practice to keep in secrets.

### Step 4: Test Integration (4 min)

```powershell
# Test locally with Sentry enabled
wrangler dev

# In another terminal, trigger a test error:
curl -X POST http://localhost:8787/api/comments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer invalid-token-test" \
  -d '{"articleId": "test", "text": "test comment"}'

# Expected: 401 Unauthorized response
# Check Sentry dashboard - should see "Token verification failed" error
```

### Step 5: Deploy (already included in deploy script)

```powershell
.\scripts\deploy-phase-4.ps1
# Script will check for Sentry config and warn if missing
```

---

## 🔍 What Sentry Tracks

### **Errors Captured** (automatic):

- ✅ JWT token validation failures (auth breaks)
- ✅ D1 database query errors (connection issues)
- ✅ Comment CRUD failures (spam detection, validation)
- ✅ Blog post API errors (permission denied, not found)
- ✅ Unhandled exceptions (JavaScript errors)

### **Performance Monitoring** (10% sample rate):

- ⚡ Request duration (HTTP endpoint speed)
- ⚡ Slow D1 queries (>100ms logged as warnings)
- ⚡ Worker execution time

### **Privacy Protection** (built-in):

- 🔒 Authorization headers stripped automatically
- 🔒 User emails NOT sent to Sentry (ID only)
- 🔒 JWT tokens filtered from error logs

---

## 📊 How To Use Sentry (Daily Workflow)

### **Check Dashboard** (2 min/day):

1. Go to [sentry.io/goodflippindesign/gfd-community](https://sentry.io)
2. Review **Issues** tab for new errors
3. Click on error → see full stack trace, request context, user impact

### **Set Up Alerts** (one-time):

```
Settings → Alerts → Create Alert Rule

Examples:
- Email me when error rate >5% in 1 hour
- Slack notify when same error occurs >10 times
- SMS alert for critical errors (auth system down)
```

### **Performance Insights**:

```
Performance → Endpoints

See:
- Which API routes are slowest
- D1 query performance over time
- Success rate per endpoint
```

---

## 💰 Cost Analysis (Real Numbers)

**Free Tier Limits**:

- 50,000 events/month
- Unlimited team members
- 30-day event retention
- Email + Slack alerts

**Your Current Traffic** (estimated):

- ~30 requests/day (blog reads, comments)
- ~900 events/month
- **Well within free tier** ✅

**When you'd need paid** (Developer tier $29/month):

- > 10K active users
- > 50K errors/month (means bigger problems!)
- Need 90-day retention
- Need advanced integrations (PagerDuty, etc.)

---

## 🚨 Common Issues & Fixes

### "Sentry not configured" warning during deploy

**Cause**: `SENTRY_DSN` secret not set in Cloudflare
**Fix**: Run `wrangler secret put SENTRY_DSN` and paste your DSN

### No errors showing in Sentry dashboard

**Check**:

1. DSN is correct (check Sentry project settings)
2. Worker deployed successfully (`wrangler deployments list`)
3. Trigger test error (see Step 4 above)
4. Check Sentry project filters (might be filtering out worker errors)

### Too many events (approaching 50K limit)

**Options**:

1. Adjust `tracesSampleRate` in `workers/auth.js` (default: 0.1 = 10%)
2. Add error filters (Settings → Inbound Filters)
3. Upgrade to paid tier if justified by traffic

---

## 🎖️ Next Steps After Setup

**Week 1**:

- ✅ Monitor for auth failures (Clerk token issues)
- ✅ Check D1 query performance (should be <50ms avg)
- ✅ Verify no errors from comment spam detection

**Week 2-4**:

- ✅ Set up Slack alerts (if you use Slack)
- ✅ Review performance trends (identify slowest endpoints)
- ✅ Add custom error tracking for critical flows (e.g., payment processing)

**Optional Enhancements**:

```javascript
// In workers/auth.js, add custom context:
Sentry.setContext("user", {
  id: user.id,
  role: user.publicMetadata?.role,
  // NO email or PII!
});

// Track custom metrics:
Sentry.captureMessage("Comment spam detected", {
  level: "warning",
  extra: { articleId, text: text.substring(0, 100) },
});
```

---

## 📚 Resources

- **Sentry Docs**: [docs.sentry.io/platforms/javascript/guides/cloudflare](https://docs.sentry.io/platforms/javascript/guides/cloudflare/)
- **Cloudflare Workers Secrets**: [developers.cloudflare.com/workers/configuration/secrets](https://developers.cloudflare.com/workers/configuration/secrets/)
- **Sentry Pricing**: [sentry.io/pricing](https://sentry.io/pricing/)

---

**Questions?** Check `docs/COMMUNITY_PLATFORM_COMPLETE.md` for full system overview.
