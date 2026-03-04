# CultureSherpa - Service Worker Cache Fix

## 🚨 Problem

Your browser's **Service Worker** is serving OLD cached HTML with `/explore/` paths.

**Evidence:**
```
[SW] Registered with scope: https://www.culturesherpa.org/explore/
```

This old service worker is intercepting ALL requests and serving cached pages that have links like:
- `/explore/culture/scottish` ❌ (OLD)
- `/explore/data/cultures.json` ❌ (OLD)  
- `/explore/_astro/...` ❌ (OLD)

**Correct paths:**
- `/culture/scottish` ✅ (NEW)
- `/data/cultures.json` ✅ (NEW)
- `/_astro/...` ✅ (NEW)

---

## ✅ Complete Fix (Chrome/Edge)

### Step 1: Unregister Service Worker

1. Open DevTools: `F12`
2. Go to **Application** tab
3. Click **Service Workers** in left sidebar
4. Find `https://www.culturesherpa.org/explore/`
5. Click **Unregister**

### Step 2: Clear All Caches

Still in **Application** tab:

1. Click **Cache Storage** in left sidebar
2. Right-click each cache → **Delete**
3. Click **Storage** in left sidebar  
4. Click **Clear site data** button

### Step 3: Hard Refresh

```
Ctrl + Shift + R
```

### Step 4: Verify

Open console and check:
- [ ] No `[SW]` messages about `/explore/` scope
- [ ] All requests go to paths WITHOUT `/explore/` prefix
- [ ] No 404 errors

---

## ✅ Complete Fix (Firefox)

### Step 1: Unregister Service Worker

1. Open DevTools: `F12`
2. Go to **Application** → **Service Workers**
3. Click **Unregister** next to culturesherpa.org worker

### Step 2: Clear Caches

1. `Ctrl + Shift + Delete`
2. Select:
   - [x] Cookies and Site Data
   - [x] Cached Web Content  
3. Click **Clear Now**

### Step 3: Hard Refresh

```
Ctrl + F5
```

---

## 🧪 Test After Clearing

Visit: https://www.culturesherpa.org/culture/scottish/

**Expected:**
- ✅ Page loads successfully
- ✅ No 404 errors in console
- ✅ Service worker (if registered) has scope `https://www.culturesherpa.org/` (no /explore/)

---

## 🔍 Why This Happened

1. **Old deployment** (Feb 9): Service worker registered with `/explore/` scope
2. **Intermediate fix** (Feb 10): Built with correct paths but deployed to wrong S3 location  
3. **Today** (Feb 11): Deployed to correct location BUT your browser still has old service worker

**Service workers are VERY persistent** - they survive:
- Regular page refreshes
- Closing the browser
- Clearing cookies
- Hard refresh (Ctrl+Shift+R)

Only way to clear: **Manual unregistration** or waiting 24 hours for browser to detect update.

---

## 🚀 Alternative: Incognito/Private Window

If you want to test immediately without clearing caches:

**Chrome/Edge:**
```
Ctrl + Shift + N
```

**Firefox:**
```
Ctrl + Shift + P
```

Then visit: https://www.culturesherpa.org/

This will bypass all cached service workers and load fresh content.

---

## 📊 CloudFront Status

The **server-side** is now correct:

- ✅ S3 has correct files (0 `/explore/` paths)
- ✅ CloudFront cache cleared (Invalidation: I6JGOOFAGRMZI4QK0HOA7RVLT9)  
- ✅ New service worker deployed with scope `https://www.culturesherpa.org/`

**The issue is 100% client-side caching** (your browser's old service worker).

---

## ⚡ Quick Commands (If Using DevTools)

Open console and run:

```javascript
// Unregister all service workers
navigator.serviceWorker.getRegistrations().then(registrations => {
  registrations.forEach(reg => reg.unregister());
  console.log('✅ All service workers unregistered');
});

// Clear all caches
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
  console.log('✅ All caches cleared');
});

// Then reload
location.reload(true);
```

---

**Status:** Server fixed ✅ | Client cache needs manual clear ⏳
