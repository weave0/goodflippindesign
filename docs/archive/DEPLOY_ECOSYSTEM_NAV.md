# Ecosystem Navigation - Deployment Checklist

**Created:** February 1, 2026
**Status:** Step 1 of 3 complete (goodflippindesign.com ✅)

---

## 🎯 Deployment Target Sites

### ✅ 1. Good Flippin Design (COMPLETE)
- **URL:** https://goodflippindesign.com
- **Location:** `z:\GFD\`
- **Status:** LIVE - Navigation deployed and tested
- **Test Results:** 94.4% pass rate (136/145 tests)

### ⏳ 2. Good Flippin Vibes (IN PROGRESS)
- **URL:** https://www.goodflippinvibes.com
- **Location:** `z:\GFD\GFD Dev Projects\GFV\website\`
- **Type:** Static HTML site (2073 lines)
- **Status:** Ready to deploy (automated)

### 📋 3. CultureSherpa (MANUAL)
- **URL:** https://culturesherpa.org
- **Location:** `S:\CultureSherpa`
- **Type:** React app with MapboxGL
- **Status:** Manual deployment required (outside workspace)

### 📋 4. AI Aimate (MANUAL)
- **URL:** https://aiaimate.com
- **Location:** `z:\GFD\GFD Dev Projects\AI\portal\` (Next.js)
- **Type:** Next.js 15 app (deployed to Vercel)
- **Status:** Manual deployment required (Next.js build process)

---

## 🚀 Quick Deploy: Good Flippin Vibes (Automated)

**Time Estimate:** 5 minutes

### Step 1: Copy Shared Folder
```powershell
# Already in workspace - just copy shared/ directory
Copy-Item -Path "z:\GFD\shared" -Destination "z:\GFD\GFD Dev Projects\GFV\website\shared" -Recurse -Force
```

### Step 2: Add CSS Link
Find in `index.html`:
```html
<meta charset="UTF-8" />
```

Add after it:
```html
<!-- GFV Ecosystem Navigation -->
<link rel="stylesheet" href="shared/ecosystem-nav.css">
```

### Step 3: Add Navigation HTML
Find in `index.html`:
```html
<body>
```

Add immediately after:
```html
  <!-- GFV Ecosystem Navigation -->
  <nav class="gfv-ecosystem-nav" aria-label="Ecosystem navigation">
    <!-- Copy entire nav block from z:\GFD\index.html lines ~1462-1538 -->
  </nav>
```

### Step 4: Add JavaScript
Find in `index.html`:
```html
</body>
</html>
```

Add before closing body:
```html
  <!-- GFV Ecosystem Navigation JavaScript -->
  <script src="shared/ecosystem-nav.js"></script>
</body>
```

### Step 5: Adjust Existing Navigation (If Needed)
If Good Flippin Vibes has a fixed nav, update CSS:
```css
/* Your existing nav - adjust selector as needed */
body > nav:not(.gfv-ecosystem-nav) {
    top: 60px; /* Below ecosystem nav */
}

/* Your hero/first section */
.hero, .first-section {
    padding-top: 9rem; /* Was likely 6-8rem */
}
```

### Step 6: Test Locally
```powershell
# If using live-server or similar
cd "z:\GFD\GFD Dev Projects\GFV\website"
npx live-server --port=3000
```

Open http://localhost:3000 and verify:
- [x] Ecosystem nav appears at top
- [x] Hamburger menu opens/closes
- [x] All 6 links work
- [x] "Good Flippin Vibes" is highlighted (purple background)
- [x] Dropdown closes on ESC key
- [x] Mobile responsive (resize browser)

---

## 📋 Manual Deploy: CultureSherpa

**Location:** `S:\CultureSherpa`
**Time Estimate:** 15 minutes

### Instructions

1. **Copy Files:**
   ```powershell
   # From PowerShell with access to both drives
   Copy-Item -Path "z:\GFD\shared" -Destination "S:\CultureSherpa\shared" -Recurse -Force
   ```

2. **Find Main HTML/Component:**
   - If React app: Locate `public/index.html` or main App component
   - If static: Locate `index.html` in root

3. **Integrate Navigation:**

   **Option A: React Component (Recommended)**
   ```jsx
   // In src/App.jsx or main layout component
   import './shared/ecosystem-nav.css';

   function App() {
     useEffect(() => {
       // Load ecosystem nav script
       const script = document.createElement('script');
       script.src = '/shared/ecosystem-nav.js';
       script.async = true;
       document.body.appendChild(script);

       return () => {
         document.body.removeChild(script);
       };
     }, []);

     return (
       <>
         {/* Copy nav HTML from z:\GFD\shared\ecosystem-nav.html */}
         <nav className="gfv-ecosystem-nav" aria-label="Ecosystem navigation">
           {/* ... full nav markup ... */}
         </nav>

         {/* Rest of your app */}
       </>
     );
   }
   ```

   **Option B: Static HTML**
   - Follow same steps as Good Flippin Vibes above
   - Add CSS link in `<head>`
   - Add nav HTML at top of `<body>`
   - Add JS script before closing `</body>`

4. **Adjust MapboxGL Container (if needed):**
   ```css
   /* If map is fullscreen, adjust for nav height */
   #map, .mapbox-container {
       top: 60px;
       height: calc(100vh - 60px);
   }
   ```

5. **Test Build:**
   ```bash
   cd S:\CultureSherpa
   npm run build    # Or your build command
   npm run preview  # Test production build
   ```

6. **Deploy:**
   ```bash
   # Depends on your deployment method
   # - Netlify: `netlify deploy --prod`
   # - Vercel: `vercel --prod`
   # - Cloudflare: `wrangler pages publish dist`
   ```

---

## 📋 Manual Deploy: AI Aimate

**Location:** `z:\GFD\GFD Dev Projects\AI\portal\`
**Type:** Next.js 15
**Deployed:** Vercel
**Time Estimate:** 20 minutes

### Instructions

1. **Copy Files:**
   ```powershell
   Copy-Item -Path "z:\GFD\shared" -Destination "z:\GFD\GFD Dev Projects\AI\portal\public\shared" -Recurse -Force
   ```

2. **Create Layout Component:**
   ```tsx
   // In app/layout.tsx or components/EcosystemNav.tsx
   import Script from 'next/script';

   export default function RootLayout({ children }: { children: React.ReactNode }) {
     return (
       <html lang="en">
         <head>
           <link rel="stylesheet" href="/shared/ecosystem-nav.css" />
         </head>
         <body>
           {/* Paste nav HTML from z:\GFD\shared\ecosystem-nav.html */}
           <nav className="gfv-ecosystem-nav" aria-label="Ecosystem navigation">
             <div className="ecosystem-nav-container">
               {/* ... full nav markup ... */}
             </div>
           </nav>

           {children}

           <Script src="/shared/ecosystem-nav.js" strategy="afterInteractive" />
         </body>
       </html>
     );
   }
   ```

3. **Adjust Main Content:**
   ```css
   /* In your global CSS or tailwind */
   main {
       padding-top: 60px; /* Account for ecosystem nav */
   }
   ```

4. **Test Locally:**
   ```bash
   cd "z:\GFD\GFD Dev Projects\AI\portal"
   npm run dev
   ```

   Open http://localhost:3000 and verify navigation works

5. **Build & Deploy:**
   ```bash
   npm run build    # Verify no build errors
   git add .
   git commit -m "Add ecosystem navigation"
   git push origin main

   # Vercel auto-deploys from main branch
   # Or manually: vercel --prod
   ```

---

## ✅ Post-Deployment Verification

For each site, verify:

### Visual Tests
- [ ] Navigation appears at top of page
- [ ] Logo and "GFV Ecosystem" text visible
- [ ] Hamburger menu (☰) on right side
- [ ] Dropdown has proper blur/glassmorphism effect
- [ ] Current site highlighted with purple background
- [ ] All 6 links visible and styled correctly

### Functional Tests
- [ ] Click hamburger → dropdown opens
- [ ] Click hamburger again → dropdown closes
- [ ] Click outside dropdown → closes
- [ ] Press ESC key → closes
- [ ] Arrow Up/Down → navigates links
- [ ] Home key → jumps to first link
- [ ] End key → jumps to last link
- [ ] Click link → navigates to correct site
- [ ] Support CTA → scrolls to #support section

### Responsive Tests
- [ ] Desktop (1920px): Dropdown shows grid layout
- [ ] Tablet (768px): Dropdown stacks to single column
- [ ] Mobile (375px): "GFV Ecosystem" text hides, logo remains

### Analytics Tests
- [ ] Open browser console
- [ ] Open navigation dropdown
- [ ] Verify event: `ecosystem_nav_toggle` fires
- [ ] Click a link
- [ ] Verify event: `ecosystem_nav_click` fires with destination

---

## 🔧 Troubleshooting

### Issue: Dropdown Doesn't Open

**Solution 1:** JavaScript not loaded
```html
<!-- Verify this exists before </body> -->
<script src="shared/ecosystem-nav.js"></script>
```

**Solution 2:** ID conflict
```javascript
// Check browser console for errors
// Look for: "Cannot read property 'classList' of null"
// Ensure id="ecosystem-dropdown" is unique
```

### Issue: Navigation Overlaps Content

**Solution:** Adjust main content padding
```css
/* Add to your global CSS */
body > nav:not(.gfv-ecosystem-nav) {
    top: 60px;
}

main, .hero, .header {
    padding-top: 9rem; /* or margin-top: 60px; */
}
```

### Issue: Current Site Not Highlighted

**Solution:** Check hostname matching
```javascript
// In shared/ecosystem-nav.js, verify:
const currentHostname = window.location.hostname;
// Should match link hrefs without protocol
// e.g., "aiaimate.com" matches "https://aiaimate.com"
```

### Issue: Blur Effect Not Working (Safari)

**Already Fixed!** The CSS includes `-webkit-backdrop-filter` for Safari support.

If still not working:
```css
/* Fallback in shared/ecosystem-nav.css */
.gfv-ecosystem-nav {
    background: rgba(10, 10, 10, 0.98); /* Higher opacity */
}
```

### Issue: Analytics Not Tracking

**Solution:** Verify Google Analytics loaded
```html
<!-- Should exist in <head> of each site -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX"></script>
```

Check browser console:
```javascript
// Should return function
typeof window.gtag
// 'function' = working
// 'undefined' = GA not loaded
```

---

## 📊 Success Metrics

After deploying to all 4 sites, monitor:

### Google Analytics (7-14 days)

**Event: ecosystem_nav_toggle**
- How many users explore the ecosystem nav?
- Which site has highest engagement?
- Mobile vs. desktop open rates

**Event: ecosystem_nav_click**
- Which cross-site links get most clicks?
- Popular journeys (e.g., GFV → AI Aimate)
- Support CTA click-through rate

### Site Performance

**Core Web Vitals:**
- LCP: Should remain <2.5s (nav adds ~100ms)
- CLS: Should remain <0.1 (fixed positioning = no shift)
- FID: Should remain <100ms (lightweight JS)

**Navigation Load Time:**
- CSS: ~5KB (loads in <50ms on 3G)
- JS: ~4KB (loads in <40ms on 3G)
- HTML: Inline, 0ms additional

### User Feedback

**Collect qualitative data:**
- Do users discover new projects?
- Is navigation intuitive?
- Any mobile usability issues?
- Support CTA increasing donations?

---

## 🎯 Next Steps After Deployment

### Week 1: Monitor & Fix
- [ ] Watch analytics for first 3 days
- [ ] Fix any layout issues reported
- [ ] Adjust colors if needed (brand consistency)
- [ ] Gather user feedback

### Week 2: Stripe Audit
- [ ] Search all 4 sites for existing Stripe code
- [ ] Document which sites have donations
- [ ] Create STRIPE_AUDIT.md
- [ ] Decide: Centralized portal vs. embedded widgets

### Week 3: Cross-Linking
- [ ] Add ecosystem footer to all sites
- [ ] Update About pages with sister project mentions
- [ ] Implement Schema.org markup
- [ ] Submit updated sitemaps

### Week 4: Analytics Deep Dive
- [ ] Create custom GA4 dimensions
- [ ] Build cross-site funnel reports
- [ ] Set up automated weekly emails
- [ ] Create ecosystem dashboard

---

## 📝 Deployment Log

| Site | Deployed | By | Method | Verified | Notes |
|------|----------|----|---------|-----------| ------|
| goodflippindesign.com | 2026-02-01 | Agent | Automated | ✅ | 94.4% test pass rate |
| goodflippinvibes.com | 2026-02-01 | Agent | Automated | ⏳ | Awaiting local test |
| culturesherpa.org | | | | | Manual (outside workspace) |
| aiaimate.com | | | | | Manual (Next.js build) |

---

**Created:** February 1, 2026
**Last Updated:** February 1, 2026 05:15 UTC
**Next Update:** After Good Flippin Vibes deployment
