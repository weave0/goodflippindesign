# Community Engine — Deployment Runbook

**Created**: 2026-03-02
**Status**: Ready to deploy
**Tracks**: Track 4 — Community Engine

---

## What Was Built

| Component  | File                        | Lines | Description                                                              |
| ---------- | --------------------------- | ----- | ------------------------------------------------------------------------ |
| Portal UX  | `community-portal.html`     | 1,754 | Complete community app — feed, threads, leaderboard, XP/badges, check-in |
| Worker API | `workers/auth.js`           | 1,457 | Community engine endpoints — XP, badges, streaks, posts, reactions       |
| D1 Schema  | `d1-schema-community.sql`   | 86    | 5 tables — profiles, posts, reactions, XP ledger, activity feed          |
| Backup     | `community-portal-old.html` | 1,054 | Previous brochure version (delete after deploy verification)             |

### XP System

| Action           | XP  | Notes                                 |
| ---------------- | --- | ------------------------------------- |
| Daily check-in   | 10  | Once per day                          |
| Create post      | 25  | Any type                              |
| Reply            | 15  | On any thread                         |
| React            | 5   | Fire, heart, mind-blown, clap, rocket |
| Receive reaction | 3   | Passive XP                            |
| Complete profile | 50  | One-time                              |
| 7-day streak     | 100 | Bonus                                 |
| 14-day streak    | 200 | Bonus                                 |
| 30-day streak    | 500 | Bonus                                 |

### Levels

1. Newcomer (0 XP) → 2. Contributor (50) → 3. Regular (200) → 4. Enthusiast (500) → 5. Champion (1,000) → 6. Veteran (2,500) → 7. Elite (5,000) → 8. Legend (10,000)

### Badges (20 total)

founding-member, first-post, first-reply, on-fire, conversation-starter, helpful, popular-post, prolific, storyteller, community-pillar, early-bird, night-owl, weekend-warrior, streak-master, centurion, liked, beloved, thought-leader, og, completionist

---

## Deployment Steps

### Step 1: Run D1 Schema Migration

```powershell
cd z:\GFD
npx wrangler d1 execute gfd_community --file=d1-schema-community.sql --remote
```

This creates 5 new tables (`community_posts`, `community_profiles`, `community_xp`, `community_activity`, `community_reactions`) alongside the existing tables (comments, reactions, blog_posts, etc.).

### Step 2: Switch Worker Entry Point

The worker wrangler.toml currently points to `auth-simple.js` (274 lines, blog/comments only).
Update to `auth.js` (1,457 lines, full community engine):

```powershell
# In workers/wrangler.toml, change:
#   main = "auth-simple.js"
# To:
#   main = "auth.js"
```

### Step 3: Deploy Worker

```powershell
cd z:\GFD\workers
npx wrangler deploy
```

Verify deployment at: `https://gfd-auth.weave0.workers.dev`

### Step 4: Set Feature Flag

In **Cloudflare Pages Dashboard** → goodflippindesign → Settings → Environment variables:

```
ENABLE_COMMUNITY = true
```

This allows `_worker.js` to inject the flag, which `community-portal.html` reads to show the full UI.

### Step 5: Verify Clerk Configuration

Ensure these secrets are set in the worker:

```powershell
cd z:\GFD\workers
npx wrangler secret list
```

Required secrets:

- `CLERK_SECRET_KEY` — from dashboard.clerk.com → API Keys
- `SENTRY_DSN` — from sentry.io (optional but recommended)

### Step 6: Smoke Test

1. Visit `https://goodflippinvibes.com/community-portal.html`
2. Sign in with Google via Clerk
3. Click "Daily Check-in" → verify +10 XP toast
4. Create a post → verify it appears in feed
5. React to the post → verify reaction count updates
6. Check leaderboard tab → verify your profile appears

### Step 7: Cleanup

After successful verification:

```powershell
# Remove old portal backup
Remove-Item z:\GFD\community-portal-old.html

# Move community schema to workers directory with other schemas
Move-Item z:\GFD\d1-schema-community.sql z:\GFD\workers\schema-community.sql
```

---

## API Endpoints

### Public (no auth required)

| Method | Path                                        | Description                     |
| ------ | ------------------------------------------- | ------------------------------- |
| GET    | `/api/community/feed`                       | Activity feed (latest 50)       |
| GET    | `/api/community/stats`                      | Total members, posts, reactions |
| GET    | `/api/community/posts?type=&limit=&offset=` | List threads                    |
| GET    | `/api/community/leaderboard?limit=`         | Top users by XP                 |

### Authenticated (Clerk token required)

| Method | Path                     | Description                               |
| ------ | ------------------------ | ----------------------------------------- |
| POST   | `/api/community/checkin` | Daily check-in (+10 XP)                   |
| GET    | `/api/community/profile` | Current user's profile + badges           |
| POST   | `/api/community/posts`   | Create post `{title, content, post_type}` |
| POST   | `/api/community/reply`   | Reply `{parent_id, content}`              |
| POST   | `/api/community/react`   | React `{post_id, reaction_type}`          |

---

## Rollback

If anything breaks:

1. Revert worker entry point: `main = "auth-simple.js"` in `workers/wrangler.toml`
2. Redeploy: `cd workers && npx wrangler deploy`
3. Swap portal back: `Move-Item community-portal-old.html community-portal.html`

The D1 community tables are safe to leave — they don't affect existing blog/comment functionality.

---

## Architecture

```
┌─────────────────────────────┐
│  community-portal.html      │
│  (Clerk JS SDK + fetch)     │
└──────────┬──────────────────┘
           │ HTTPS
           ▼
┌─────────────────────────────┐
│  gfd-auth Worker (auth.js)  │
│  ├─ XP Engine               │
│  ├─ Badge System (20)       │
│  ├─ Streak Tracker          │
│  └─ CRUD: posts/reactions   │
└──────────┬──────────────────┘
           │ D1 binding
           ▼
┌─────────────────────────────┐
│  Cloudflare D1              │
│  ├─ community_profiles      │
│  ├─ community_posts         │
│  ├─ community_reactions     │
│  ├─ community_xp            │
│  └─ community_activity      │
└─────────────────────────────┘
```
