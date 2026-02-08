# Mobile Testing Checklist - Ecosystem Header Fix
**Date:** February 7, 2026  
**Fix:** Header transparency on mobile when menu open

---

## 🧪 Testing Protocol

### **Per Site Testing** (6 sites total)

#### **Header Transparency Fix**
1. Open site on mobile device (or Chrome DevTools mobile view)
2. Tap ecosystem menu (hamburger icon)
3. ✅ **VERIFY:** Header background is **solid** (not transparent)
4. ✅ **VERIFY:** Text is **readable** (white text on solid dark background)
5. ✅ **VERIFY:** Dark backdrop overlay appears behind menu
6. Tap backdrop (outside menu)
7. ✅ **VERIFY:** Menu closes

#### **Donation Page** (4 sites with new system)
1. Navigate to `/donate.html`
2. Scroll through page on mobile
3. ✅ **VERIFY:** Page loads and is readable
4. Tap a preset donation amount ($10)
5. Tap "Custom Amount" input
6. ✅ **VERIFY:** Keyboard appears, input is focusable
7. **DO NOT SUBMIT** (testing only)

---

## 📋 Site Checklist

### **1. Good Flippin Design**
- 🌐 https://goodflippindesign.com
- **Header Fix:** ❓ Pending test
- **Donation:** ❓ Already deployed (test /donate.html)

### **2. GlobalDeets**
- 🌐 https://globaldeets.com
- **Header Fix:** ❓ Pending test
- **Donation:** ❓ NEW (test /donate.html)

### **3. Good Flippin Vibes**
- 🌐 https://goodflippinvibes.com
- **Header Fix:** ❓ Pending test
- **Donation:** ❓ NEW (test /donate.html)

### **4. AI Aimate**
- 🌐 https://aiaimate.com
- **Header Fix:** ❓ Pending test
- **Donation:** ❓ Existing system (test /contribute)

### **5. CultureSherpa**
- 🌐 https://culturesherpa.org
- **Header Fix:** ❓ Pending test
- **Donation:** ❓ NEW (test /donate.html)

### **6. CitizenApproved**
- 🌐 https://citizenapproved.org
- **Header Fix:** ❓ Pending test
- **Donation:** ⚪ N/A (civic platform, no donations)

---

## ⏱️ Cloudflare Auto-Deploy Timeline

**Estimated completion:** 1-3 minutes after commit  
**Current status:** All commits pushed to GitHub  
**Next:** Wait for Cloudflare Pages auto-deploy

### **Deployment Verification**
Check Cloudflare Pages dashboard for each site:
1. https://dash.cloudflare.com → Pages
2. Verify "Production" shows latest commit hash
3. Status should be "✅ Success"

**Latest commits:**
- GFD: `ab71a8e`
- GlobalDeets: `6ad5b79` (donate) + `ceb8b05` (header)
- GFV: `825da93` (donate) + `968b17c` (header)
- AI Aimate: `9378995`
- CultureSherpa: `ea632eb15` (donate) + `9a03411` (header)
- CitizenApproved: `2a4c18f`

---

## 🚨 Known Issues to Watch For

### **Issue 1: Stripe Configuration**
**Symptom:** Donation page loads but checkout fails with "Payment system configuration error"  
**Cause:** Missing `STRIPE` environment variable in Cloudflare  
**Fix:** Add environment variable (see main deployment doc)

### **Issue 2: Cached Old Version**
**Symptom:** Header still transparent when menu open  
**Cause:** Browser cache or Cloudflare CDN cache  
**Fix:** Hard refresh (Ctrl+Shift+R) or clear cache

### **Issue 3: Menu Toggle Not Working**
**Symptom:** Hamburger icon doesn't open menu  
**Cause:** JavaScript file not loaded  
**Fix:** Check browser console for errors, verify ecosystem-nav.js is accessible

---

## ✅ Success Criteria

### **Header Fix**
- ✅ Solid background when menu open (no transparency)
- ✅ Backdrop overlay visible (70% black)
- ✅ Click backdrop closes menu
- ✅ Text readable on all backgrounds
- ✅ No performance regression (< 300ms transitions)

### **Donation System**
- ✅ Page loads and renders correctly
- ✅ Custom amount input works
- ✅ Stripe integration functional (after env var setup)
- ✅ Mobile UX optimized (44px+ tap targets)
- ✅ Error handling graceful

---

## 📝 Reporting Issues

If you find any issues, report with:
1. **Site URL**
2. **Issue description**
3. **Screenshot** (if visual)
4. **Mobile device/browser** info
5. **Steps to reproduce**

Document in: `MOBILE_TESTING_RESULTS.md`

---

## 🎯 Next Steps After Testing

1. **PASS:** All tests pass → Update STRIPE env vars, final production test
2. **FAIL:** Issues found → Document, prioritize, fix
3. **PARTIAL:** Some sites work → Investigate differences, debug
