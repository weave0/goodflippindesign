# Phase 3 Setup Guide: Clerk Auth + D1 Database

**Prerequisites**:

- Cloudflare account with Pages project set up
- Node.js 18+ installed
- Wrangler CLI installed (`npm install -g wrangler`)

---

## Step 1: Create Clerk Account

1. Go to [https://clerk.com](https://clerk.com)
2. Sign up with `brett.l.weaver@gmail.com`
3. Create new application: **"Good Flippin Vibes Community"**
4. Select **Email** as primary authentication method
5. (Optional) Enable **Google** social login later if requested

**Template Settings**:

- **Design**: Dark theme
- **Logo**: Upload GFV logo (assets/logos/gfv-main-logo.svg)
- **Colors**: Match CSS variables from index.html (`--bg`, `--text`, `--accent`)

---

## Step 2: Get Clerk API Keys

**Dashboard → API Keys**:

```bash
# Copy these values
CLERK_PUBLISHABLE_KEY=pk_live_xxx...
CLERK_SECRET_KEY=sk_live_xxx...
```

**Add to local `.env`** (NOT committed to git):

```bash
cp .env.example .env
# Edit .env and paste Clerk keys
```

---

## Step 3: Create D1 Database

```bash
# Login to Cloudflare
wrangler login

# Create D1 database
wrangler d1 create gfd_community

# Copy the output database_id
# Example: database_id = "a1b2c3d4-e5f6-7890-abcd-1234567890ab"

# Update wrangler.toml with the database_id (line 7)
```

**Initialize schema**:

```bash
# Run SQL schema
wrangler d1 execute gfd_community --file=workers/schema.sql

# Verify tables created
wrangler d1 execute gfd_community --command="SELECT name FROM sqlite_master WHERE type='table';"

# Expected output:
# comments
# user_metadata
# blog_posts
# reactions
# moderation_log
```

---

## Step 4: Deploy Cloudflare Worker

```bash
# Deploy auth worker
wrangler deploy workers/auth.js --name gfd-auth

# Output will show your worker URL:
# https://gfd-auth.<your-subdomain>.workers.dev
```

**Add environment variables to worker**:

```bash
# Via Cloudflare dashboard:
# Workers & Pages → gfd-auth → Settings → Variables

# Add:
CLERK_SECRET_KEY=sk_live_xxx...

# Add D1 binding:
# Variables → D1 Database Bindings → Add binding
# Variable name: DB
# D1 database: gfd_community
```

---

## Step 5: Update Site with Clerk SDK

**Already done** in this branch:

- ✅ Clerk SDK added to `<head>`
- ✅ Auth UI components scaffolded
- ✅ Protected routes configured
- ✅ Comment system wired to Worker API

**Test locally**:

```bash
# Install dependencies (if not already)
npm install

# Start local dev server
npm run dev

# Open http://localhost:8080
# Click "Sign In" → verify Clerk modal opens
# Sign up with test email → verify session works
```

---

## Step 6: Configure Admin Emails

**In Clerk Dashboard**:

1. Go to **Users** tab
2. Find `brett.l.weaver@gmail.com` (after first login)
3. Click user → **Metadata** → **Public Metadata**
4. Add JSON:

```json
{
  "role": "admin",
  "displayName": "Brett Weaver"
}
```

**Automated Assignment** (already in `workers/auth.js`):

- Worker automatically assigns `admin` role to emails in `ADMIN_EMAILS` array
- No manual work needed for future admin emails

---

## Step 7: Test Comment System

**Manual Test Flow**:

1. **Unauthenticated user**:
   - Visit `index.html#work`
   - Scroll to portfolio item
   - See "Sign in to comment" CTA
   - Comments visible but form hidden

2. **Sign up**:
   - Click "Sign In" in nav
   - Enter email (e.g., `test@example.com`)
   - Check email for verification code
   - Enter code → session created

3. **Post comment**:
   - Comment form now visible
   - Type test comment: "Great work!"
   - Click "Post Comment"
   - Comment appears immediately in list

4. **Edit own comment**:
   - Hover over own comment → "Edit" button appears
   - Modify text → "Post Comment" (update mode)
   - Updated comment saves

5. **Admin moderation**:
   - Sign out test user
   - Sign in as admin (`brett.l.weaver@gmail.com`)
   - Visit same article
   - See "Delete" button on ALL comments (not just own)
   - Delete test comment → removed from DB

**Automated Tests** (Phase 3 completion):

```bash
npm run test:auth
```

---

## Step 8: Deploy to Production

**Via GitHub Actions** (already configured):

```bash
# Push to main branch
git add .
git commit -m "Phase 3: Clerk auth + comment system"
git push origin main

# CI/CD workflow will:
# 1. Sync index.html → temp_review.html
# 2. Run test suite
# 3. Update cache bust
# 4. Deploy to Cloudflare Pages
```

**Manual Deploy** (if needed):

```bash
npm run build        # Updates cache bust
npm run deploy       # Pushes to Cloudflare Pages
```

---

## Configuration Checklist

### Clerk Dashboard

- [ ] Application created
- [ ] Email authentication enabled
- [ ] Dark theme configured
- [ ] Logo uploaded
- [ ] Admin user metadata set
- [ ] (Optional) Social logins enabled

### Cloudflare

- [ ] D1 database created (`gfd_community`)
- [ ] Schema initialized (5 tables)
- [ ] Worker deployed (`gfd-auth`)
- [ ] Worker environment variables set (`CLERK_SECRET_KEY`)
- [ ] D1 binding added to worker (`DB`)

### Local Environment

- [ ] `.env` file created with Clerk keys
- [ ] `wrangler.toml` updated with `database_id`
- [ ] Dependencies installed (`npm install`)
- [ ] Dev server runs without errors

### Site Integration

- [ ] Clerk SDK loaded in `<head>`
- [ ] Auth buttons visible in nav
- [ ] Comment forms gated behind login
- [ ] Admin panel visible for admin users

---

## Security Checklist

- [ ] `.env` NOT committed to git (verify `.gitignore`)
- [ ] Clerk Secret Key only in Cloudflare Worker env vars (not client-side)
- [ ] CORS headers restrict origins (update `workers/auth.js` line 150)
- [ ] Rate limiting enabled on worker (Cloudflare dashboard → Rate Limiting)
- [ ] User input sanitized (HTML escaping in comment rendering)
- [ ] Profanity filter active (update word list in `workers/auth.js`)

---

## Troubleshooting

### "Invalid token" error

**Cause**: Clerk session expired or token malformed

**Fix**:

```javascript
// In browser console:
localStorage.clear(); // Clear Clerk cache
location.reload(); // Re-login
```

### Comments not appearing

**Cause**: D1 database not bound to worker

**Fix**:

1. Go to Cloudflare dashboard → Workers → gfd-auth → Settings → Variables
2. Verify D1 binding exists: `DB = gfd_community`
3. If missing, add it and redeploy worker

### "Database error" on comment post

**Cause**: Schema not initialized or table missing

**Fix**:

```bash
# Re-run schema
wrangler d1 execute gfd_community --file=workers/schema.sql

# Check data
wrangler d1 execute gfd_community --command="SELECT COUNT(*) FROM comments;"
```

### Admin role not auto-assigning

**Cause**: Email not in `ADMIN_EMAILS` array or Clerk API error

**Fix**:

1. Check `workers/auth.js` line 9: ensure email is in array
2. Check Cloudflare Worker logs (dashboard → Workers → gfd-auth → Logs)
3. Manually assign role in Clerk dashboard (see Step 6)

---

## Performance Monitoring

**Cloudflare Analytics**:

- Dashboard → Workers → gfd-auth → Metrics
- Track: Request count, error rate, CPU time
- Set alerts for >5% error rate

**D1 Usage**:

- Dashboard → D1 → gfd_community → Metrics
- Monitor: Read/write operations, storage size
- Free tier limits: 5M reads/day, 100K writes/day

**Expected Usage** (10K MAU, 50 comments/user/month):

- **Writes**: ~500K/month (well within free tier)
- **Reads**: ~5M/month (within free tier)
- **Storage**: ~100 MB (within 5 GB free tier)

---

## Next Steps After Setup

1. **Test auth flow** on staging (temp_review.html)
2. **Add auth tests** to test suite (`tests/auth.test.js`)
3. **Implement user profiles** (Phase 3.2)
4. **Add reactions system** (likes, hearts)
5. **Build blog CMS** (admin-only posting, Phase 4)

---

**Questions?** Check [AUTH_PROVIDER_RESEARCH.md](./AUTH_PROVIDER_RESEARCH.md) for architectural details.

**Production Deployment Checklist**: See [ROADMAP.md](../ROADMAP.md) Phase 3 section.
