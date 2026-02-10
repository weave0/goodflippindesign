# Uptime Monitoring Setup for Good Flippin Design Ecosystem

## Production Sites to Monitor

| Site | URL | Status | Priority |
|------|-----|--------|----------|
| **Good Flippin Design** | https://goodflippindesign.com | ✅ Live (Cloudflare Pages) | Critical |
| **AI Aimate** | https://aiaimate.com | ✅ Live (Vercel) | Critical |
| **globaldeets** | https://globaldeets.com | ✅ Live | High |
| **Eliassen globaldeets** | https://eliassen.globaldeets.com | ✅ Live | Medium |
| **CitizenApproved** | TBD | 🚧 Deploying soon | High |
| **CultureSherpa** | TBD | 📋 Manual deploy pending | Medium |

---

## UptimeRobot Configuration (Recommended - Free Tier)

### Setup Steps (10 minutes)

1. **Create Account:** https://uptimerobot.com/signUp
   - Free tier: 50 monitors, 5-minute intervals
   - Sufficient for entire ecosystem

2. **Add HTTP(S) Monitors:**

   **Monitor 1: Good Flippin Design**
   - Monitor Type: HTTP(s)
   - Friendly Name: `GFD - Main Site`
   - URL: `https://goodflippindesign.com`
   - Monitoring Interval: 5 minutes
   - Monitor Timeout: 30 seconds
   - Alert Contacts: [Your email]
   - Keyword Monitoring: `Good Flippin Design` (optional - verifies page renders)

   **Monitor 2: AI Aimate**
   - Monitor Type: HTTP(s)
   - Friendly Name: `AI Aimate - Education Platform`
   - URL: `https://aiaimate.com`
   - Monitoring Interval: 5 minutes
   - Monitor Timeout: 30 seconds
   - Keyword Monitoring: `AI Aimate` (optional)

   **Monitor 3: globaldeets Main**
   - Monitor Type: HTTP(s)
   - Friendly Name: `globaldeets - Main Hub`
   - URL: `https://globaldeets.com`
   - Monitoring Interval: 5 minutes
   - Monitor Timeout: 30 seconds

   **Monitor 4: Eliassen Subdomain**
   - Monitor Type: HTTP(s)
   - Friendly Name: `globaldeets - Eliassen`
   - URL: `https://eliassen.globaldeets.com`
   - Monitoring Interval: 5 minutes
   - Monitor Timeout: 30 seconds

3. **Configure Alert Thresholds:**
   - Alert when down for: 2 consecutive checks (10 minutes)
   - Re-check interval: 1 minute when down

4. **Notification Channels:**
   - Email: Primary (included in free tier)
   - SMS: Optional (paid add-on)
   - Slack: Optional (webhook integration)
   - Discord: Optional (webhook via Zapier/IFTTT)

---

## Alternative: Cloudflare Analytics (Already Configured)

Since GFD is on Cloudflare Pages, you already have access to:

**Cloudflare Dashboard → Analytics → Web Analytics**
- Real-time traffic monitoring
- Error rate tracking (4xx, 5xx responses)
- Geographic distribution
- No additional setup needed

**Limitations:** No proactive alerting (use UptimeRobot for that)

---

## Local Monitoring Script

Created: `scripts/check-site-health.ps1`

**Usage:**
```powershell
# Check all sites
.\scripts\check-site-health.ps1

# Check specific site
.\scripts\check-site-health.ps1 -Site "goodflippindesign"

# Export report
.\scripts\check-site-health.ps1 -ExportJson "health-report.json"
```

**Features:**
- HTTP status code verification
- Response time measurement
- SSL certificate expiry check
- Security headers validation
- JSON export for CI/CD integration

---

## GitHub Actions Integration (Optional)

Add scheduled health checks to CI/CD:

**File:** `.github/workflows/uptime-check.yml`

```yaml
name: Scheduled Uptime Check

on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Manual trigger

jobs:
  health-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Check site health
        run: |
          curl -f -s -o /dev/null -w "%{http_code}" https://goodflippindesign.com || exit 1
          curl -f -s -o /dev/null -w "%{http_code}" https://aiaimate.com || exit 1
          
      - name: Notify on failure
        if: failure()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: '🚨 Site Down Alert',
              body: 'One or more sites failed health check. Please investigate.',
              labels: ['monitoring', 'critical']
            })
```

---

## Status Page Options

### Option 1: UptimeRobot Public Status Page (Free)
- Auto-generated from monitors
- URL: `https://stats.uptimerobot.com/[your-id]`
- Displays uptime %, response times, incident history
- Custom domain support (paid)

### Option 2: Cloudflare Workers (DIY)
- Deploy status page as Cloudflare Worker
- Check all sites, return JSON status
- Display on goodflippindesign.com/status

### Option 3: GitHub Actions + GitHub Pages
- Run health checks via Actions
- Generate static status page
- Deploy to GitHub Pages (free)

---

## Recommended Monitoring Stack (Complete Setup)

| Service | Purpose | Cost | Setup Time |
|---------|---------|------|------------|
| **UptimeRobot** | Proactive uptime monitoring | Free | 10 min |
| **Cloudflare Analytics** | Traffic & performance metrics | Free (included) | 0 min (already active) |
| **GitHub Actions** | Scheduled health checks | Free | 5 min |
| **Local Script** | On-demand diagnostics | Free | 0 min (already created) |

**Total Setup Time:** ~15 minutes  
**Monthly Cost:** $0

---

## Quick Start Checklist

- [ ] Create UptimeRobot account (2 min)
- [ ] Add 4 HTTP monitors (goodflippindesign, aiaimate, globaldeets, eliassen) (5 min)
- [ ] Configure email alerts (2 min)
- [ ] Test local health check script: `.\scripts\check-site-health.ps1` (1 min)
- [ ] Optional: Set up public status page (5 min)
- [ ] Optional: Add GitHub Actions uptime workflow (5 min)
- [ ] Document monitor URLs and credentials (2 min)

**Total:** 15-22 minutes

---

## Maintenance

**Weekly:**
- Review UptimeRobot email summaries
- Check Cloudflare Analytics for anomalies

**Monthly:**
- Verify SSL certificate expiry dates (auto-renewed by Cloudflare/Vercel)
- Review response time trends
- Update monitor list if new sites deployed

**Quarterly:**
- Test alert delivery (UptimeRobot → "Test Alert" feature)
- Audit monitored URLs for accuracy

---

## Incident Response Plan

**When alert received:**

1. **Verify outage:** Check site in incognito browser
2. **Check status:**
   - Cloudflare: https://www.cloudflarestatus.com/
   - Vercel: https://www.vercel-status.com/
3. **Review logs:**
   - Cloudflare Pages: Dashboard → Pages → Deployments → Logs
   - Vercel: Dashboard → Project → Deployments → View Logs
4. **Troubleshoot:**
   - Run `.\scripts\check-site-health.ps1 -Site [name]`
   - Check DNS: `nslookup goodflippindesign.com`
   - Check SSL: `https://www.ssllabs.com/ssltest/`
5. **Restore service:**
   - Redeploy if needed: `git push` (triggers auto-deploy)
   - Purge Cloudflare cache if stale
6. **Document incident:**
   - Create GitHub issue with timeline
   - Note root cause and resolution

---

## Next Steps After Setup

1. ✅ Configure UptimeRobot monitors (15 min)
2. ✅ Test alert delivery
3. ✅ Add monitors for CitizenApproved and CultureSherpa when deployed
4. ✅ Optional: Set up Slack/Discord webhooks for instant notifications
5. ✅ Optional: Create public status page
