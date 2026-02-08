# Stripe API Key Configuration Guide
**Date:** February 7, 2026  
**Stripe Live Key:** `sk_live_51So70wBL2ppdbQKq...` (from STRIPE_API_KEY.txt)

---

## 🎯 QUICK SETUP GUIDE

### **Step 1: Access Cloudflare Pages Dashboard**

1. Go to: https://dash.cloudflare.com
2. Click **Workers & Pages** (left sidebar)
3. Look for these projects:

**Cloudflare Pages Projects to Configure:**
- `goodflippindesign` (Good Flippin Design main site)
- `globaldeets` (GlobalDeets)  
- `good-flippin-vibes` (Good Flippin Vibes) ✅ **DONE**
- **Note:** CitizenApproved ✅ **DONE** but doesn't need STRIPE (no donations)

---

### **Step 2: Add STRIPE Environment Variable**

For **each project** (goodflippindesign, globaldeets):

1. Click the project name
2. Go to **Settings** tab
3. Click **Environment variables** (left menu)
4. Click **Add variable**

**Configuration:**
```
Variable name:  STRIPE
Value:          [Your Stripe Live Secret Key from STRIPE_API_KEY.txt]
Environment:    Production (check the box)
```

5. Click **Encrypt** (optional but recommended)
6. Click **Save**

---

### **Step 3: Redeploy**

After adding the variable, **redeploy** the site:

**Option A: Trigger redeploy in Cloudflare**
1. Go to **Deployments** tab
2. Click **•••** (three dots) on latest deployment
3. Click **Retry deployment**

**Option B: Push to GitHub** (faster)
- Any push to `main` branch auto-redeploys

---

## 🔍 TROUBLESHOOTING: Can't Find Projects

### **If you don't see GlobalDeets or GFD in dashboard:**

#### **Check Account/Organization:**
- Top right: Click your profile icon
- Make sure you're in the right account
- Some projects might be under an organization

#### **Check Project Name:**
Projects might be listed as:
- `goodflippindesign` (not "Good Flippin Design")
- `globaldeets` (not "GlobalDeets")  
- Names are lowercase, no spaces

#### **Search Function:**
- Use search bar at top: type "global" or "design"
- Cloudflare Pages auto-connects GitHub repos on first push

#### **If Truly Missing:**
Projects might not be set up yet. Check:
1. Go to **Workers & Pages**
2. Click **Create application**
3. **Pages** tab
4. **Connect to Git**
5. Find `weave0/globaldeets` or `weave0/goodflippindesign`
6. Configure and deploy

---

## ⚠️ SPECIAL CASES

### **AI Aimate (Vercel - NOT Cloudflare)**

**Platform:** Vercel  
**Dashboard:** https://vercel.com/dashboard

**Steps:**
1. Go to Vercel dashboard
2. Find `ai-aimate` project (or similar)
3. **Settings** → **Environment Variables**
4. Add:
   ```
   Name:  STRIPE_SECRET_KEY
   Value: sk_live_51So70wBL2ppdbQKq...
   Environment: Production
   ```
5. **Save**
6. **Redeploy** (Deployments → latest → Redeploy)

---

### **CultureSherpa (AWS S3 - NO SERVER FUNCTIONS)**

**Platform:** AWS S3 + CloudFront  
**Issue:** Static hosting only - Cloudflare Functions won't work

**Status:** ❌ Donation system cannot work as currently configured

**Options:**
1. **Skip donations** - CultureSherpa is cultural/educational (not revenue-focused)
2. **Link to GFD donate page** - redirect to main ecosystem donation
3. **AWS Lambda setup** - 4-6 hours of work (not recommended)

**Recommendation:** Remove `/donate.html` or redirect to `https://goodflippindesign.com/donate.html`

---

## ✅ VERIFICATION AFTER CONFIGURATION

### **Test Donation Pages:**

Once STRIPE is configured, test:

1. **Good Flippin Design:**  
   https://goodflippindesign.com/donate.html

2. **GlobalDeets:**  
   https://globaldeets.com/donate.html

3. **Good Flippin Vibes:**  
   https://goodflippinvibes.com/donate.html

**Test Steps:**
1. Click a preset amount ($10)
2. Click "Donate Now" button
3. Should redirect to Stripe Checkout (not error)
4. **DO NOT complete payment** (just verify checkout loads)

**Success:** Stripe checkout page loads  
**Failure:** Error message "Payment system configuration error"

---

## 📊 CONFIGURATION STATUS

| Site | Platform | STRIPE Configured | Donations Work |
|------|----------|-------------------|----------------|
| **GFD** | Cloudflare Pages | ⏳ **NEED TO ADD** | ❌ Not yet |
| **GlobalDeets** | Cloudflare Pages | ⏳ **NEED TO ADD** | ❌ Not yet |
| **GFV** | Cloudflare Pages | ✅ **DONE** | ✅ Should work |
| **AI Aimate** | Vercel | ⏳ **NEED TO ADD** | ❌ Not yet |
| **CultureSherpa** | AWS S3 | ⚠️ **WON'T WORK** | ❌ Skip |
| **CitizenApproved** | Cloudflare Pages | ⚪ **N/A** | ⚪ No donations |

---

## 🎯 PRIORITY ACTIONS

### **HIGH PRIORITY:**
1. ✅ Add STRIPE to **goodflippindesign** (main site)
2. ✅ Add STRIPE to **globaldeets**
3. ✅ Add STRIPE_SECRET_KEY to **AI Aimate** (Vercel)

### **MEDIUM PRIORITY:**
4. Test all donation pages after configuration
5. Verify checkout redirects work

### **LOW PRIORITY:**
6. Decide on CultureSherpa donation approach (skip or redirect)

---

## 💡 QUICK REFERENCE

**Stripe Live Key Location:**
```
Z:\GFD\STRIPE_API_KEY.txt
```
(Use the key from this file when configuring)

**Cloudflare Dashboard:**  
https://dash.cloudflare.com → Workers & Pages

**Variable Name (Cloudflare):** `STRIPE`  
**Variable Name (Vercel):** `STRIPE_SECRET_KEY`

**Environment:** Production (always)

---

## 🆘 STILL STUCK?

If you can't find a project in Cloudflare dashboard:

1. **List all your Cloudflare Pages projects:**
   - Workers & Pages → Filter by "Pages"
   - Look for partial name matches

2. **Check if it exists at all:**
   - Try accessing https://goodflippindesign.com
   - If site works, project exists somewhere

3. **GitHub might not be connected:**
   - Create → Connect to Git → Select repo
   - This happens if Pages wasn't set up yet

**Need help?** Share screenshot of your Cloudflare Workers & Pages list and I can help identify the right projects.
