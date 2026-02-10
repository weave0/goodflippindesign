# UPTIME MONITORING QUICK START
## 15-Minute Setup Guide

### Step 1: Create UptimeRobot Account (2 minutes)
1. Go to: https://uptimerobot.com/signUp
2. Sign up with email (free tier - no credit card required)
3. Verify email and log in

### Step 2: Add Site Monitors (10 minutes)

**Monitor 1: Good Flippin Design (CRITICAL)**
```
Monitor Type: HTTP(s)
Friendly Name: GFD - Main Site
URL: https://goodflippindesign.com
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
```

**Monitor 2: AI Aimate (CRITICAL)**
```
Monitor Type: HTTP(s)
Friendly Name: AI Aimate - Education Platform
URL: https://aiaimate.com
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
```

**Monitor 3: globaldeets Main**
```
Monitor Type: HTTP(s)
Friendly Name: globaldeets - Main Hub
URL: https://globaldeets.com
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
```

**Monitor 4: Eliassen Subdomain**
```
Monitor Type: HTTP(s)
Friendly Name: globaldeets - Eliassen
URL: https://eliassen.globaldeets.com
Monitoring Interval: 5 minutes
Monitor Timeout: 30 seconds
```

### Step 3: Configure Alerts (2 minutes)
- Default email alerts are enabled automatically
- Alert threshold: Down for 2 consecutive checks (10 minutes)
- Re-check interval when down: 1 minute

### Step 4: Optional - Public Status Page (5 minutes)
1. Dashboard → Add Public Status Page
2. Choose monitors to display
3. Get public URL: `https://stats.uptimerobot.com/[your-id]`
4. Share with team or embed on website

---

## Verification

After setup, run local health check to confirm all sites operational:
```powershell
.\scripts\check-site-health.ps1
```

Expected output: **ALL SYSTEMS OPERATIONAL ✓**

---

## What You Now Have

✅ **Proactive monitoring** — 5-minute interval checks on all production sites  
✅ **Email alerts** — Instant notifications when sites go down  
✅ **Local diagnostics** — PowerShell script for detailed health checks  
✅ **Automated checks** — GitHub Actions runs every 6 hours  
✅ **Incident tracking** — Auto-creates GitHub issues on failures  

---

## Next Actions After UptimeRobot Setup

1. Test alert delivery: UptimeRobot Dashboard → Monitor → Actions → Send Test Notification
2. Bookmark status page (if created)
3. Add UptimeRobot dashboard to bookmarks
4. Document credentials in password manager
5. Schedule quarterly alert test (calendar reminder)

---

## Total Setup Time: 15-20 minutes
## Monthly Cost: $0 (free tier)

Full documentation: `docs/UPTIME_MONITORING_SETUP.md`
