# 🎉 Quick Start: Deploy to GFV in 30 Minutes

## What You're Deploying

✅ **Backend** (Cloudflare Workers + D1)
✅ **Authentication** (Clerk)
✅ **Comments System**
✅ **Blog CMS**

---

## Option 1: Automated Script (Recommended)

### Run the Deploy Script

```powershell
# From your GFV repository
cd path/to/goodflippinvibes-repo

# Run deployment script
pwsh Z:\GFD\deploy-to-gfv\deploy-backend.ps1
```

**What it does:**

1. Copies Workers code from GFD
2. Creates D1 database
3. Sets up Clerk secrets
4. Deploys backend API
5. Tests deployment

**Time**: 15-20 minutes

---

## Option 2: Manual Steps

### Step 1: Copy Backend Files (2 min)

```powershell
# Navigate to GFV repo
cd path/to/gfv-repo

# Create workers directory
mkdir workers

# Copy files
cp Z:\GFD\workers\auth.js workers\auth.js
cp Z:\GFD\workers\schema.sql workers\schema.sql
cp Z:\GFD\_headers _headers
cp Z:\GFD\wrangler.toml wrangler.toml
```

### Step 2: Setup D1 Database (5 min)

```powershell
# Login to Cloudflare
wrangler login

# Create database
wrangler d1 create gfv-community-db

# Copy the database_id from output
# Update wrangler.toml line:
# database_id = "PASTE_YOUR_ID_HERE"

# Run schema
wrangler d1 execute gfv-community-db --file=workers/schema.sql
```

### Step 3: Configure Clerk (5 min)

**Create Clerk App:**

1. Go to https://clerk.com/sign-up
2. Create new application: "GFV Community"
3. Enable Google + Email auth
4. Copy:
   - Publishable Key (`pk_test_...`)
   - Secret Key (`sk_test_...`)

**Add to Cloudflare:**

```powershell
wrangler secret put CLERK_PUBLISHABLE_KEY
# Paste pk_test_... when prompted

wrangler secret put CLERK_SECRET_KEY
# Paste sk_test_... when prompted
```

### Step 4: Deploy Backend (2 min)

```powershell
wrangler deploy
```

**Test it:**

```powershell
curl https://YOUR-WORKER.workers.dev/api/blog
```

Should return: `{"posts": [], "count": 0}`

---

## Frontend Integration

### Add to Your GFV HTML

**1. Add Clerk SDK (before closing `</head>`)**

```html
<script src="https://cdn.clerk.dev/npm/@clerk/clerk-js@latest/dist/clerk.browser.js"></script>
```

**2. Add CSS** (in your `<style>` section)

Copy from: `Z:\GFD\deploy-to-gfv\community-platform-styles.css`

Or use minimal version:

```css
/* Auth UI */
.user-menu-container {
  position: relative;
}
.user-menu-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50px;
  cursor: pointer;
}
.user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
}
.user-dropdown {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 200px;
  background: var(--bg, #0d0d0d);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.5rem;
  display: none;
}
.user-dropdown[aria-hidden="false"] {
  display: block;
}
```

**3. Add HTML Components** (in your navigation)

```html
<nav>
  <!-- Your existing nav -->

  <!-- ADD: Auth UI -->
  <button id="sign-in-btn" class="nav-cta" style="display: none;">
    Sign In
  </button>
  <div
    id="user-menu-container"
    class="user-menu-container"
    style="display: none;"
  >
    <button id="user-menu-btn" class="user-menu-btn">
      <img id="user-avatar" class="user-avatar" src="" alt="User avatar" />
      <span id="user-name" class="user-name"></span>
    </button>
    <div
      id="user-dropdown"
      class="user-dropdown"
      role="menu"
      aria-hidden="true"
    >
      <button id="sign-out-btn" class="user-dropdown-link">Sign Out</button>
    </div>
  </div>
</nav>
```

**4. Add JavaScript** (before closing `</body>`)

```html
<script>
  // Configuration - UPDATE THESE VALUES
  const CONFIG = {
    clerkPublishableKey: "pk_test_YOUR_KEY_HERE", // From Clerk dashboard
    apiBaseUrl: "https://YOUR-WORKER.workers.dev", // Your Worker URL
    adminEmails: ["brett.l.weaver@gmail.com", "getsome@goodflippinvibes.com"],
  };

  // Initialize Clerk
  let clerkInstance = null;
  let currentUser = null;

  async function initializeClerk() {
    try {
      clerkInstance = window.Clerk;
      await clerkInstance.load({ publishableKey: CONFIG.clerkPublishableKey });

      if (clerkInstance.user) {
        currentUser = clerkInstance.user;
        showUserMenu(currentUser);
      } else {
        showSignInButton();
      }

      clerkInstance.addListener(({ user }) => {
        currentUser = user;
        user ? showUserMenu(user) : showSignInButton();
      });
    } catch (error) {
      console.error("Clerk init failed:", error);
      showSignInButton();
    }
  }

  function showUserMenu(user) {
    document.getElementById("sign-in-btn").style.display = "none";
    document.getElementById("user-menu-container").style.display = "block";
    document.getElementById("user-avatar").src =
      user.imageUrl ||
      `https://ui-avatars.com/api/?name=${user.firstName || "U"}`;
    document.getElementById("user-name").textContent = user.firstName || "User";
  }

  function showSignInButton() {
    document.getElementById("sign-in-btn").style.display = "inline-block";
    document.getElementById("user-menu-container").style.display = "none";
  }

  // Event Listeners
  document
    .getElementById("sign-in-btn")
    ?.addEventListener("click", () => clerkInstance.openSignIn());
  document
    .getElementById("sign-out-btn")
    ?.addEventListener("click", () => clerkInstance.signOut());
  document.getElementById("user-menu-btn")?.addEventListener("click", () => {
    const dropdown = document.getElementById("user-dropdown");
    const isHidden = dropdown.getAttribute("aria-hidden") === "true";
    dropdown.setAttribute("aria-hidden", !isHidden);
  });

  // Initialize
  document.addEventListener("DOMContentLoaded", initializeClerk);
</script>
```

---

## Test Your Deployment

### Backend Test

```powershell
# Test blog API
curl https://YOUR-WORKER.workers.dev/api/blog

# Test comments API
curl https://YOUR-WORKER.workers.dev/api/comments?article_id=test
```

### Frontend Test

1. Open your GFV site
2. Click "Sign In"
3. Sign in with Google or email
4. Verify your name appears in navigation

---

## Troubleshooting

### "Clerk not loading"

- Check publishable key in JavaScript config
- Verify you're using correct key (test vs production)
- Check browser console for errors

### "API CORS error"

- Update `workers/auth.js` line 104:
  ```javascript
  const ALLOWED_ORIGINS = [
    "https://goodflippinvibes.com",
    "https://www.goodflippinvibes.com",
  ];
  ```
- Redeploy: `wrangler deploy`

### "Database not found"

- Verify `database_id` in `wrangler.toml`
- Check database exists: `wrangler d1 list`

---

## Next Steps

Once basic auth works:

1. **Add Comment System**
   Copy comment HTML/CSS/JS from full guide

2. **Add Blog CMS**
   Copy blog components (admin-only)

3. **Customize Branding**
   Update colors/fonts for GFV wellness theme

4. **Deploy to CultureSherpa**
   Repeat process for second site

---

## Files Reference

**Backend:**

- `Z:\GFD\workers\auth.js` — API endpoints
- `Z:\GFD\workers\schema.sql` — Database schema
- `Z:\GFD\_headers` — Security headers

**Frontend:**

- Full guide: `Z:\GFD\deploy-to-gfv\DEPLOYMENT_GUIDE.md`
- Automated script: `Z:\GFD\deploy-to-gfv\deploy-backend.ps1`

**Documentation:**

- Transfer strategy: `Z:\GFD\docs\COMMUNITY_PLATFORM_TRANSFER_STRATEGY.md`
- Feature docs: `Z:\GFD\docs\COMMUNITY_PLATFORM_COMPLETE.md`

---

## Time Breakdown

| Task                 | Time       |
| -------------------- | ---------- |
| Backend deployment   | 10 min     |
| Clerk setup          | 5 min      |
| Frontend integration | 10 min     |
| Testing              | 5 min      |
| **Total**            | **30 min** |

---

## Support

**Issues?**

- Check full guide: `DEPLOYMENT_GUIDE.md`
- View Worker logs: `wrangler tail`
- Check Clerk logs: [dashboard.clerk.com](https://dashboard.clerk.com)

**Ready to go?**
Run: `pwsh Z:\GFD\deploy-to-gfv\deploy-backend.ps1`
