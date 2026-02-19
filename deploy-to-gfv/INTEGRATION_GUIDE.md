# GFV Frontend Integration Guide

## 📦 Files Created

Located in: `Z:\GFD\deploy-to-gfv\`

1. **`gfv-auth-ui.html`** — HTML components for auth UI
2. **`gfv-auth-styles.css`** — Wellness-themed CSS
3. **`gfv-auth-script.js`** — Auth logic & API helpers

---

## 🚀 Quick Integration (5 Steps)

### Step 1: Add Clerk SDK

In your GFV HTML `<head>` section, add:

```html
<!-- Before closing </head> -->
<script src="https://cdn.clerk.dev/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"></script>
```

---

### Step 2: Add CSS Styles

Copy the contents of **`gfv-auth-styles.css`** into your `<style>` section:

```html
<style>
  /* Your existing GFV styles */

  /* ADD: Community Platform Auth Styles */
  /* Copy entire contents of gfv-auth-styles.css here */
</style>
```

**Or** link it as external stylesheet:

```html
<link rel="stylesheet" href="gfv-auth-styles.css" />
```

---

### Step 3: Add HTML Components

#### In your main navigation:

```html
<nav>
  <a href="#home">Home</a>
  <a href="#wellness">Wellness</a>
  <a href="#about">About</a>

  <!-- ADD: Auth UI from gfv-auth-ui.html lines 7-24 -->
  <div id="auth-container" class="auth-container">
    <button id="sign-in-btn" class="nav-cta" style="display: none;">
      Sign In
    </button>
    <div
      id="user-menu-container"
      class="user-menu-container"
      style="display: none;"
    >
      <!-- Full code in gfv-auth-ui.html -->
    </div>
  </div>
</nav>
```

#### In your mobile menu:

```html
<div class="mobile-menu">
  <a href="#home" class="mobile-nav-link">Home</a>
  <a href="#wellness" class="mobile-nav-link">Wellness</a>

  <!-- ADD: Mobile auth from gfv-auth-ui.html lines 27-31 -->
  <div id="mobile-auth-container" class="mobile-auth-container">
    <!-- Full code in gfv-auth-ui.html -->
  </div>
</div>
```

---

### Step 4: Add JavaScript

Before closing `</body>`, add:

```html
<!-- Before closing </body> -->
<script src="gfv-auth-script.js"></script>
```

**Or** inline the script:

```html
<script>
  // Copy entire contents of gfv-auth-script.js here
</script>
```

---

### Step 5: Configure Your Settings

In `gfv-auth-script.js` (or inline), update lines 11-13:

```javascript
const GFV_CONFIG = {
  // UPDATE THESE:
  clerkPublishableKey: "pk_test_YOUR_ACTUAL_KEY", // From Clerk dashboard
  apiBaseUrl: "https://gfv-community-api.YOUR-WORKER.workers.dev", // From Wrangler deploy

  adminEmails: ["brett.l.weaver@gmail.com", "getsome@goodflippinvibes.com"],
};
```

---

## ✅ Test Your Integration

### Quick Test:

1. Open your GFV site in browser
2. Look for "Sign In" button in navigation
3. Click it → Clerk modal should open
4. Sign in with Google or email
5. After login → See your name/avatar in nav
6. Click avatar → Dropdown menu appears

### Browser Console Check:

```javascript
// Should see:
"✨ GFV Community Platform Auth loaded";
"[GFV Auth] Clerk initialized successfully";

// Check current user:
window.GFV.currentUser;
// Returns user object if signed in

// Check if admin:
window.GFV.isAdmin();
// Returns true/false
```

---

## 🎨 Customization

### Update Colors:

In `gfv-auth-styles.css`, edit CSS variables (lines 138-145):

```css
:root {
  --gfv-primary: #7c9885; /* Your sage green */
  --gfv-accent: #e8b4b8; /* Your soft rose */
  --gfv-bg-light: #f5f1e8; /* Your cream background */
  --gfv-text: #2c2c2c; /* Your text color */
}
```

### Update Fonts:

Replace font families to match your GFV typography:

```css
.user-menu-btn {
  font-family: "Your-GFV-Font", sans-serif;
}
```

---

## 🔌 API Integration (After Backend Deployed)

Once backend is deployed, you can use the built-in API helpers:

```javascript
// Make authenticated API call
const posts = await window.GFV.api("/api/blog");

// Post a comment
const comment = await window.GFV.api("/api/comments", {
  method: "POST",
  body: JSON.stringify({
    article_id: "wellness-101",
    content: "Great article!",
  }),
});

// Check auth status
if (window.GFV.currentUser) {
  console.log("User is signed in:", window.GFV.currentUser.firstName);
}

// Check if admin
if (window.GFV.isAdmin()) {
  // Show admin controls
}
```

---

## 🐛 Troubleshooting

### "Sign In button doesn't appear"

**Check:**

- Clerk SDK script loaded? (View Source → search for `clerk.browser.js`)
- JavaScript console for errors
- CSS display properties

**Fix:**

```javascript
// Force show sign-in button for testing
document.getElementById("sign-in-btn").style.display = "inline-block";
```

### "Clerk modal doesn't open"

**Check:**

- `clerkPublishableKey` is set in `GFV_CONFIG`
- Key doesn't have quotes/spaces
- Console shows: `"[GFV Auth] Clerk initialized successfully"`

**Fix:**

- Get new key from [Clerk Dashboard](https://dashboard.clerk.com)
- Make sure using **Publishable Key** (starts with `pk_test_`)

### "User menu doesn't show after login"

**Check:**

- Console errors after sign-in
- `showUserMenu()` function is defined
- User avatar element exists in HTML

**Fix:**

```javascript
// Debug auth state
clerkInstance.addListener(({ user }) => {
  console.log("Auth state changed:", user);
});
```

---

## 📄 Full File Paths

```
Z:\GFD\deploy-to-gfv\
  ├── gfv-auth-ui.html          ← HTML components
  ├── gfv-auth-styles.css       ← Wellness-themed CSS
  ├── gfv-auth-script.js        ← Auth logic
  ├── INTEGRATION_GUIDE.md      ← This file
  ├── QUICK_START.md            ← Backend deployment
  └── deploy-backend.ps1        ← Deployment script
```

---

## 🎯 Next Steps After Auth Works

1. **Add Comment System** (optional)
   - Copy comment UI components
   - Add comment form to blog posts
   - Test posting/editing comments

2. **Add Blog CMS** (optional for admin)
   - Copy blog admin UI
   - Test creating/publishing posts
   - Add blog post listing

3. **Deploy to Production**
   - Update CORS origins in Worker
   - Deploy GFV HTML to hosting
   - Test on live domain

---

## ⏱️ Integration Time

| Step                | Time       |
| ------------------- | ---------- |
| Add Clerk SDK       | 1 min      |
| Copy CSS            | 2 min      |
| Add HTML components | 3 min      |
| Add JavaScript      | 2 min      |
| Configure settings  | 2 min      |
| **Total**           | **10 min** |

---

## ✨ You're Ready!

Your GFV site will now have:

- ✅ Secure authentication (Clerk)
- ✅ User profiles with avatars
- ✅ Admin access control
- ✅ Wellness-themed UI
- ✅ Mobile-responsive design

**Start here:** Copy contents of `gfv-auth-styles.css` into your`<style>` section.
