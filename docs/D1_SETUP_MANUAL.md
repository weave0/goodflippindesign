# D1 Database Setup Guide - Manual Steps Required

**Issue**: Your Cloudflare API token needs D1 Database permissions.

---

## Option A: Update API Token Permissions (Recommended)

### Step 1: Update Token Permissions

1. Go to: [Cloudflare API Tokens](https://dash.cloudflare.com/3253d907ea85a18eb442283d7308b193/api-tokens)
2. Find your current API token
3. Click **Edit**
4. Under **Account** permissions, add:
   - **D1** → **Edit**
   - **Workers Scripts** → **Edit** (if not already there)
   - **Pages** → **Edit** (already have this)
5. Save token

### Step 2: Create D1 Database

```powershell
# After updating token permissions, run:
wrangler d1 create gfd_community

# Output will show:
# database_id = "abc123-def456-..."
#
# Copy the database_id
```

### Step 3: Update wrangler.toml

```powershell
# Edit wrangler.toml, line 9:
# Replace: database_id = ""
# With: database_id = "abc123-def456-..." (from step 2)
```

### Step 4: Initialize Schema

```powershell
wrangler d1 execute gfd_community --remote --file workers/schema.sql
```

---

## Option B: Setup via Cloudflare Dashboard (Faster)

### Step 1: Create Database

1. Go to: [Cloudflare D1 Dashboard](https://dash.cloudflare.com/3253d907ea85a18eb442283d7308b193/d1)
2. Click **Create database**
3. Name: `gfd_community`
4. Click **Create**
5. **Copy the Database ID** shown

### Step 2: Update wrangler.toml

Open `wrangler.toml` and update line 9:

```toml
database_id = "PASTE_DATABASE_ID_HERE"
```

### Step 3: Run Schema Initialization

```powershell
# In PowerShell:
wrangler d1 execute gfd_community --remote --file workers/schema.sql
```

If this still fails due to token permissions, use the dashboard:

1. Go to your D1 database → **Console**
2. Copy contents of `workers/schema.sql`
3. Paste into Console
4. Click **Execute**

---

## What the Schema Creates

**Tables** (4 total):

1. **comments**
   - User comments on blog posts
   - Moderation support (admin delete)
   - Timestamps for sorting

2. **blog_posts**
   - Full blog CMS
   - Draft/published status
   - Tags, featured images
   - Author tracking

3. **users** (future)
   - User profiles
   - Display names, avatars

4. **reactions** (future)
   - Likes, upvotes on comments/posts

---

## Verification

After running schema:

```powershell
# List tables in database
wrangler d1 execute gfd_community --remote --command "SELECT name FROM sqlite_master WHERE type='table'"

# Should show: comments, blog_posts
```

---

## Next Steps After D1 Setup

1. ✅ Continue with deployment: `.\scripts\deploy-phase-4.ps1`
2. ✅ Test auth + comments locally: `wrangler dev`
3. ✅ Deploy to production

---

**Choose your path**: Update token (Option A) or Dashboard (Option B)?
