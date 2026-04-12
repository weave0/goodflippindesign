# CultureSherpa Community Architecture Plan

**Workstream C — Charter §10.3**
**Created**: 2026-03-17
**Owner**: Brett Weaver / GFV LLC
**Governing charter**: `gfd_master_charter.md` §6.6, Workstream C

---

## 1. Phase 1 Baseline — What Exists Today

### Frontend (`community-portal.html` — ~4,045 lines)

| Tab           | ID                  | Status  | Notes                                                   |
| ------------- | ------------------- | ------- | ------------------------------------------------------- |
| Activity Feed | `panel-feed`        | ✅ Live | Reads `community_activity` + polls for new items        |
| Threads       | `panel-threads`     | ✅ Live | Full CRUD via `community_posts`; search; reply collapse |
| Leaderboard   | `panel-leaderboard` | ✅ Live | Top 10 by XP; level badges; current user rank           |
| Badges        | `panel-badges`      | ✅ Live | Earned + unearned badge grid; tooltip on hover          |
| Members       | `panel-members`     | ✅ Live | Member directory; avatar + bio + join date              |

**Also present:**

- Daily check-in widget (XP reward, streak tracking)
- Profile card (avatar, level, XP bar, badge count, streak)
- Onboarding modal (first-sign-in flow — bio + location)
- Notifications bell (unread count + dropdown list)
- Settings modal (3 tabs: profile, preferences, account)

### Data Layer (Cloudflare D1 — binding: `gfd_community`)

| Table                     | Purpose                            | Key Fields                                                         |
| ------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `community_posts`         | Threads + replies                  | `post_type` (discussion/showcase/question/intro/vibe), `parent_id` |
| `community_profiles`      | User profiles + gamification state | `total_xp`, `level`, `current_streak`, `badges` (JSON array)       |
| `community_xp`            | Auditable XP ledger                | `action` (checkin/post/reply/react/streak_7/etc), `amount`         |
| `community_activity`      | Denormalized feed                  | `action_type`, `action_detail` (JSON)                              |
| `community_reactions`     | Emoji reactions                    | `reaction_type` (fire/heart/mind-blown/clap/rocket)                |
| `community_notifications` | Per-user alerts                    | `type` (reply/reaction/badge/level_up/mention/welcome), `is_read`  |

### Auth Layer

- **Clerk** (live): Google + LinkedIn + email/password; session tokens issued
- **`workers/auth.js`**: Verifies Clerk JWT, reads/writes D1 profiles, exposes `/api/*` routes
- **`_worker.js`**: Injects `window.ENV.CLERK_PUBLISHABLE_KEY`; routes `/api/*` to auth worker

---

## 2. Architecture — Data Flow

```
Browser (community-portal.html)
  │
  ├── Clerk JS (window.Clerk.load()) → session token (JWT)
  │
  ├── All API calls → /api/* (Authorization: Bearer <JWT>)
  │         │
  │         ▼
  │   _worker.js (Cloudflare Pages advanced mode)
  │         │  passes /api/* to auth worker
  │         ▼
  │   workers/auth.js
  │         ├── verifyToken(JWT) → Clerk backend → userId
  │         ├── D1 reads/writes (gfd_community binding)
  │         └── returns JSON to frontend
  │
  └── Polling (feed, notifications) — setInterval every 30–60s
```

### Auth Modes

| State                        | Access                                                            |
| ---------------------------- | ----------------------------------------------------------------- |
| Signed out                   | Read-only: activity feed visible, threads visible (no post/react) |
| Signed in (unverified email) | Full community access except moderation tools                     |
| Signed in (admin role)       | Pin posts, delete any post, manage members                        |

---

## 3. Open vs Gated Architecture

| Feature                 | Open (no auth) | Gated (Clerk session required) |
| ----------------------- | -------------- | ------------------------------ |
| Read activity feed      | ✅             | —                              |
| Read threads            | ✅             | —                              |
| Read member list        | ✅             | —                              |
| View badges/leaderboard | ✅             | —                              |
| Post/reply              | —              | ✅                             |
| React to posts          | —              | ✅                             |
| Daily check-in          | —              | ✅                             |
| Edit profile            | —              | ✅                             |
| See notifications       | —              | ✅                             |
| Pin/delete posts        | —              | ✅ admin only                  |

**Implementation**: Auth worker already enforces this via JWT check on mutation routes. The frontend hides action buttons when `Clerk.session === null`.

---

## 4. Phase 2 Priorities (Charter Workstream C Deliverables)

### 4.1 Thread/Forum Layer Refinement

**Current state**: Basic thread CRUD + replies working. Missing:

- Thread categories/tags (topic filter)
- Edit post (UI shows `is_edited` flag; edit endpoint not yet wired)
- Delete own post (soft-delete; admin hard-delete)
- Rich text: currently supports `**bold**`, `*italic*`, `` `code` `` inline only — no block quotes, no image embeds

**Plan:**

1. Add `tags TEXT` column to `community_posts` — comma-separated topic keys
2. Add category filter buttons above thread list (Design, Dev, Creative, General, Introductions)
3. Wire edit endpoint: `PATCH /api/community/posts/:id` (auth worker validates `user_id === post.user_id`)
4. Wire delete endpoint: `DELETE /api/community/posts/:id`
5. Block-level markdown: `>` blockquote, code fences (server-side sanitize with DOMPurify CDN)

### 4.2 Verified User Access Model

**Current state**: All signed-in users have equal permissions. No role system.

**Plan (D1-based roles, no Clerk billing required):**

1. Add `role TEXT DEFAULT 'member'` to `community_profiles` — values: `member`, `moderator`, `admin`
2. Auth worker exposes role in session payload:
   ```json
   { "userId": "...", "role": "member", "displayName": "..." }
   ```
3. Frontend reads role from `/api/auth/session` response
4. Admin-only actions (pin, delete any post, ban user) gated in both auth worker AND frontend UI
5. Role assignment: manual via D1 console (direct SQL `UPDATE community_profiles SET role='admin' WHERE user_id='...'`) until admin panel panel is built

### 4.3 Real-Time Feed Concept

**Current state**: Feed and notifications poll every 30s via `setInterval`.

**Options evaluated:**
| Approach | Pros | Cons |
| -------- | ---- | ---- |
| **Polling (current)** | Simple, works on CF Pages | Latency up to 30s; extra D1 reads |
| **SSE (Server-Sent Events)** | Low latency; CF Workers support via `ReadableStream` | Long-lived connections; CF free tier: 100k req/day |
| **Durable Objects** | True WebSocket; very low latency | Cost; complexity; overkill for current scale |

**Recommendation:** Upgrade polling to SSE for notifications only (high-value, low-volume).

```javascript
// auth worker: GET /api/community/notifications/stream
return new Response(
  new ReadableStream({
    start(controller) {
      const send = (data) =>
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      const interval = setInterval(async () => {
        const notifs = await db
          .prepare(
            "SELECT * FROM community_notifications WHERE user_id=? AND is_read=0 ORDER BY created_at DESC LIMIT 5",
          )
          .bind(userId)
          .all();
        if (notifs.results.length) send(notifs.results);
      }, 10000);
      // cleanup: CF Workers will terminate the stream after 30s; client reconnects
    },
  }),
  {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  },
);
```

**Timeline**: Phase 2.3 — after roles and thread refinement are stable.

### 4.4 Translation Bridge Design

CultureSherpa's mission is cultural exchange — multilingual support is core identity.

**Scope for Phase 2:**

- Language selector in user profile settings (persists to `community_profiles.language TEXT DEFAULT 'en'`)
- UI string externalization: replace hardcoded English strings in `community-portal.html` with a `STRINGS` lookup object
- Browser `Accept-Language` fallback for guest users
- No server-side translation (cost); use browser `Intl` API for dates/numbers

**Supported languages Phase 2:** English, Spanish, French (covers ~60% of CS target audience)

**Implementation pattern:**

```javascript
const STRINGS = {
  en: { feedTitle: 'Activity Feed', postBtn: 'Post', ... },
  es: { feedTitle: 'Feed de Actividad', postBtn: 'Publicar', ... },
  fr: { feedTitle: 'Fil d\'Activité', postBtn: 'Publier', ... },
};
const lang = userProfile?.language || navigator.language.split('-')[0] || 'en';
const S = STRINGS[lang] || STRINGS.en;
```

**Phase 3 (post-Phase 2):** Machine translation of post content via Cloudflare AI Workers (`@cf/meta/m2m100-1.2b`) — free tier allows 10k tokens/day.

### 4.5 Reward / Engagement Loop

**Current state**: XP system + badges exist in D1 and are partially wired. Daily check-in awards XP. Streak bonuses defined in schema.

**Gaps:**

- Streak milestone badges (`streak_7`, `streak_30`) not fully wired to badge award logic
- Level-up notification not triggered when XP threshold crossed
- No "first post" / "first reply" badges awarded on action
- Leaderboard resets weekly (intended) but reset cron job not deployed

**Plan:**

1. Wire `streak_7` → award `streak-7` badge; trigger `level_up` notification if threshold crossed
2. Add first-post/first-reply badge triggers in `POST /api/community/posts`
3. Deploy Cloudflare Cron Trigger: weekly leaderboard reset (Sunday midnight UTC)
   ```toml
   # wrangler.toml (auth worker)
   [triggers]
   crons = ["0 0 * * 0"]  # Sunday 00:00 UTC
   ```
4. Badge UI: show animation when new badge earned (CSS keyframe pop-in; `aria-live="polite"` for a11y)

### 4.6 UX Polish Checklist

| Item                                                 | Priority | Notes                                                                            |
| ---------------------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Mobile: tab bar wraps on 375px                       | High     | Currently 5 tabs may overflow; need scroll or compact mode                       |
| Settings: "More preferences coming soon" placeholder | Medium   | Fill with notification prefs (email/push toggles)                                |
| Thread pagination                                    | High     | No pagination; all posts load at once — add `LIMIT 20 OFFSET ?`                  |
| Empty state illustrations                            | Low      | Feed/Threads show plain text when empty; add friendly SVG states                 |
| Loading skeletons                                    | Medium   | Replace spinning loaders with CSS skeleton screens                               |
| Error boundary                                       | High     | Uncaught fetch errors show blank panels; add `.catch()` with user-facing message |
| Post character count indicator                       | Low      | `maxlength=5000` but no counter visible                                          |

---

## 5. Known Gaps

| Gap                                       | Impact                            | Fix                                                      |
| ----------------------------------------- | --------------------------------- | -------------------------------------------------------- |
| **0% test coverage**                      | High — no regression safety net   | Write Puppeteer suite for community portal (Charter §14) |
| No role system                            | Medium — no moderation tools      | §4.2 above                                               |
| Thread pagination missing                 | High — performance at scale       | Add `LIMIT/OFFSET` to thread query                       |
| No post editing UI                        | Medium                            | §4.1 above                                               |
| Real-time: 30s polling latency            | Low for current traffic           | §4.3 — upgrade to SSE                                    |
| Translation strings hardcoded             | Medium — locks out non-English UX | §4.4 above                                               |
| Cron for leaderboard reset not deployed   | Low                               | §4.5 — wrangler.toml cron                                |
| No CSP test coverage for community-portal | Medium                            | Add to accessibility test suite                          |

---

## 6. Implementation Sequence

```
Phase 2.1 — Thread Polish (1–2 sessions)
  ├── Post edit/delete endpoints + frontend UI
  ├── Thread tags/categories
  └── Thread pagination (LIMIT/OFFSET)

Phase 2.2 — Role System (1 session)
  ├── Add role column to community_profiles
  ├── Auth worker: include role in session payload
  ├── Frontend: show/hide admin actions
  └── First moderator assignment via D1 console

Phase 2.3 — Engagement Loop Completion (1 session)
  ├── Wire streak badge awards
  ├── Wire level-up notifications
  ├── Deploy weekly leaderboard cron
  └── Badge earn animation

Phase 2.4 — Translation Foundation (1–2 sessions)
  ├── Add language field to community_profiles
  ├── Settings UI: language selector
  ├── STRINGS lookup object (en/es/fr)
  └── Browser language fallback for guests

Phase 2.5 — Real-Time Upgrade (1 session)
  └── SSE endpoint for notifications (replace polling)

Phase 2.6 — UX Polish (1 session)
  ├── Mobile tab overflow fix
  ├── Loading skeletons
  ├── Empty state illustrations
  └── Error boundaries on all fetch calls

Phase 3 — Test Suite (separate effort)
  └── Puppeteer tests for community-portal.html
```

---

## 7. Integration Notes

- **Clerk user IDs** are the primary key across all community tables (`user_id = Clerk.userId`)
- **Profile creation**: triggered at first sign-in via `POST /api/auth/profile` (creates row if not exists)
- **CSP**: `community-portal.html` served from `goodflippindesign.com` domain; Clerk JS whitelisted in `_headers`; D1 is server-side only — no client-side DB connection
- **Wrangler**: auth worker deployed separately as `workers/auth.js`; bound to `gfd_community` D1 via `wrangler.toml`; Pages `_worker.js` proxies `/api/*` to it

---

_Last updated: 2026-03-17 · Phase 1 execution_
