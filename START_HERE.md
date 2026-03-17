# GFD Studio — Phase 1 Baseline Inventory

**Charter phase**: Phase 1 — Visibility and Truth
**Last updated**: 2026-03-17 (Phase 1 execution)
**Governing doc**: [gfd_master_charter.md](gfd_master_charter.md)

> This document is the session entry point. Read before starting any work.
> Phase 1 rule: **map before changing**. Understand first, then act.

---

## 1. Ecosystem Map (10 Brands)

| Brand                     | Repo                         | Domain                       | Status       | Notes                                   |
| ------------------------- | ---------------------------- | ---------------------------- | ------------ | --------------------------------------- |
| Good Flippin Design (GFD) | weave0/goodflippindesign     | goodflippindesign.com        | ✅ Live      | Primary site + community portal + admin |
| Good Flippin Vibes (GFV)  | weave0/good-flippin-vibes    | goodflippinvibes.com         | ✅ Live      | Music/culture brand                     |
| CultureSherpa             | weave0/culturesherpa         | culturesherpa.org            | ✅ Live      | Cultural education platform             |
| AIAimate                  | weave0/ai-animate            | aiaimate.com                 | ✅ Live      | AI animation/media                      |
| CitizenApproved           | weave0/citizenApproved       | citizenApproved.com          | ✅ Live      | Civic tech                              |
| GlobalDeets               | weave0/globaldeets           | globaldeets.com (subdomains) | ✅ Live      | Portfolio project host (eliassen, etc.) |
| Jamie Mediation / MNPeace | weave0/jamie-mediation       | mediation.globaldeets.com    | ✅ Live      | Rebranded → MinnesotaPeace              |
| SummitView                | weave0/summitview (or local) | TBD                          | 🔧 Local dev | AI video pipeline project               |
| ThyOwn                    | (local only)                 | TBD                          | 🔧 Local dev | AI model training project (54 GB)       |
| BrettLeeWeaver / Weave    | (local only)                 | brettleeweaver.com (TBD)     | 🔧 Local dev | Personal Python project — intentional   |

---

## 2. Infrastructure Inventory

### 2.1 Cloudflare Workers

| Worker                        | Config                             | URL                                     | Purpose                      |
| ----------------------------- | ---------------------------------- | --------------------------------------- | ---------------------------- |
| GFD Pages worker              | `_worker.js`                       | goodflippindesign.com/api/\*            | Routes, ENV injection, CMS   |
| gfd-stripe                    | workers/wrangler-stripe.toml       | gfd-stripe.weave0.workers.dev           | Stripe payment intents       |
| gfd-health-sweep              | workers/wrangler-health-sweep.toml | gfd-health-sweep.weave0.workers.dev     | Nightly health sweep         |
| gfv-social-publisher          | wrangler-social.toml               | gfv-social-publisher.weave0.workers.dev | Social scheduling/publishing |
| gfd auth (\_worker.js routes) | workers/auth.js                    | /api/\*                                 | Clerk JWT, D1 ops, CMS       |

### 2.2 Data / Storage

| Resource           | Type          | Contents                           | Notes                           |
| ------------------ | ------------- | ---------------------------------- | ------------------------------- |
| gfv-media (R2)     | Cloudflare R2 | 1,482 objects (859 GFV, 623 CS)    | Served via /api/cms/media/      |
| gfd_community (D1) | Cloudflare D1 | 40+ tables, 1,891+ cms_assets rows | Full schema in d1-schema-\*.sql |
| S:\cultural_images | VHD           | CS source images                   | Must be mounted as S:           |
| Z:\MediaDrop\      | Local         | Media intake zone                  | Synced via npm run scan:media   |

### 2.3 Z: Drive Hot-Spots (Phase 1 deep scan — 313.5 GB used)

| Project        | Size   | Biggest item                                    | Reclaimable                                      |
| -------------- | ------ | ----------------------------------------------- | ------------------------------------------------ |
| ThyOwn/        | 54 GB  | SVD-XT model weights (8.9+8.85 GB each)         | ~19 GB venv+cache; 32 GB models archivable to E: |
| SummitView/    | 17 GB  | Dual PyTorch venvs (.venv=5.6 + .venv_cuda=5.1) | ~11 GB venvs; 3 GB output MP4s archivable        |
| OneWhat/       | 10 GB  | ML models/ 9.21 GB                              | ~0.8 GB venv                                     |
| Weave/         | 8.5 GB | piedmont-account-plan 4.5 GB (data files)       | ~0.7 GB venv                                     |
| Z:/.pnpm-store | 1.5 GB | Global pnpm cache                               | Run `pnpm store prune`                           |

**Total quickly reclaimable: ~20 GB (venvs + caches, zero data loss)**
Full detail: [STORAGE_AUDIT_2026-03-08.md](STORAGE_AUDIT_2026-03-08.md) → Phase 1 Deep Scan section

---

## 3. Admin Suite — Current State (admin.html)

**File size**: ~17,500+ lines | **Panels**: 25 | **Fully implemented**: 25/25

| #   | Panel          | Key            | Status                                           |
| --- | -------------- | -------------- | ------------------------------------------------ |
| —   | Overview       | overview       | ✅ Ecosystem map, Quick Launch, Operations board |
| CS  | Daily Cultures | daily-cultures | ✅ 2 cultures/day, swap modal, JSON export       |
| 02  | Connections    | connections    | ✅ Social account OAuth management               |
| 03  | Planner        | planner        | ✅ Calendar scheduling                           |
| 04  | Composer       | composer       | ✅ Multi-platform post preview                   |
| 05  | Social Feed    | social-feed    | ✅ Platform filter, post kit cards               |
| 06  | Library        | library        | ✅ R2 asset browser, URL batch import            |
| 07  | Drip           | drip           | ✅ Drip campaign builder                         |
| 08  | Review Queue   | review-queue   | ✅ Content moderation                            |
| 09  | Overrides      | overrides      | ✅ Per-domain image swaps (D1 asset_overrides)   |
| 10  | Galleries      | galleries      | ✅ Gallery + items manager                       |
| 11  | Content Studio | content-studio | ✅ DALL-E generation, prompt registries          |
| 12  | Ecosystem      | ecosystem      | ✅ Health sweep viewer                           |
| 13  | Blog Manager   | blog-manager   | ✅ Markdown editor, split preview                |
| 14  | Storage        | storage        | ✅ R2/D1 asset visibility                        |
| 15  | Donations      | donations      | ✅ Stripe D1-backed KPIs + table                 |
| 16  | Analytics      | analytics      | ✅ GA4 + Stripe export panel                     |
| 17  | Community      | community      | ✅ Comment moderation, user management           |
| 18  | Notifications  | notifications  | ✅ In-app notification management                |
| 19  | Characters     | characters     | ✅ Character registry with pose status           |
| 20  | NFT Studio     | nft-studio     | ✅ Collection + token manager                    |
| 21  | Brands         | brands         | ✅ Brand switcher + identity                     |

| 22  | Projects       | projects       | ✅ Repo CI status, PRs, branch protection (GitHub API) |
| 23  | Deployments    | deployments    | ✅ Push-event workflow timeline, 7d KPIs               |
| 24  | Settings       | settings       | ✅ Integration health, env vars, worker reachability   |

**Remaining charter module gap:**

| Charter Module    | Gap         | Priority |
| ----------------- | ----------- | -------- |
| Documentation hub | Not present | Phase 3  |

---

## 4. Third-Party Integrations Status

| Service                                  | Purpose                  | Status                                          |
| ---------------------------------------- | ------------------------ | ----------------------------------------------- |
| Clerk                                    | Auth (community + admin) | ✅ Live — Google, LinkedIn, email/password      |
| Stripe                                   | Donations                | ✅ Live — webhook + D1 persist                  |
| Formspree xgvgzjbw                       | Contact form             | ✅ Live — brett.l.weaver@gmail.com              |
| Sentry                                   | Error tracking           | ✅ DSN set 2026-03-09                           |
| GA4                                      | Analytics                | ⚠️ GFD + GFV + AIAimate — measurement IDs vary  |
| OpenAI (DALL-E 3)                        | CMS generation           | ⚠️ Key not yet in CF Pages secrets              |
| Social — LinkedIn                        | Publishing               | ⚠️ Credentials in .env; not pushed to CF worker |
| Social — Meta/X/Pinterest/TikTok/Threads | Publishing               | ❌ Secrets not yet set                          |
| TOKEN_ENCRYPTION_KEY                     | Social OAuth encryption  | ⚠️ Not yet set in CF Pages                      |

---

## 5. CI/CD & Deployment Discipline

| Repo                     | Auto-deploy            | CI Tests                    | Branch Protection |
| ------------------------ | ---------------------- | --------------------------- | ----------------- |
| GFD (goodflippindesign)  | ✅ CF Pages on push    | ✅ Puppeteer 205/206        | ✅ PR + 1 review  |
| GFV (good-flippin-vibes) | ✅ CF Pages on push    | ✅ validate-build           | ⚠️ Not confirmed  |
| CultureSherpa            | ✅ via wrangler deploy | ✅ ci.yml + predeploy-guard | ⚠️ Not confirmed  |
| CitizenApproved          | ✅ via wrangler deploy | ❌ No CI workflows          | ⚠️ Not confirmed  |
| AIAimate                 | ✅ Vercel on push      | ✅ ci.yml                   | ⚠️ Not confirmed  |
| GlobalDeets              | ✅ CF auto-deploy      | ❌ No workflows             | ⚠️ Not confirmed  |

---

## 6. Test Coverage

| Target                            | Pass Rate           | Last Run   |
| --------------------------------- | ------------------- | ---------- |
| index.html (via temp_review.html) | 128/128 — 9 suites  | 2026-03-11 |
| community-portal.html             | 39/39               | 2026-03-11 |
| donate.html                       | 24/24               | 2026-03-11 |
| **Total**                         | **205/206 — 99.5%** | 2026-03-11 |
| CultureSherpa                     | ❌ 0%               | —          |
| CitizenApproved                   | ❌ 0%               | —          |
| AIAimate                          | Unknown             | —          |
| admin.html                        | ❌ 0%               | —          |

---

## 7. Known Gaps & Open Work

### Immediate (Phase 1 / Phase 2)

| Gap                                             | Severity | Notes                                           |
| ----------------------------------------------- | -------- | ----------------------------------------------- |
| Social OAuth secrets not set in CF              | High     | Meta, X, Pinterest, TikTok, Threads all missing |
| TOKEN_ENCRYPTION_KEY not in CF Pages            | High     | Blocks social publisher OAuth flows             |
| OPENAI_API_KEY not in CF Pages                  | Medium   | Blocks DALL-E generation in Content Studio      |
| BrettLeeWeaver.com (Weave) has no remote/domain | Medium   | Local only — intentional for now                |
| Sentry DSN set but not re-verified              | Low      | Set 2026-03-09                                  |

### Resolved This Session (2026-03-16)

| Item | Resolution |
| --- | --- |
| Branch protection on all public repos | ✅ Applied — CitizenApproved, aiaimate, globaldeets, jamie-mediation |
| Admin: Projects panel | ✅ Panel 22 — repo CI, PRs, branch protection |
| Admin: Deployments panel | ✅ Panel 23 — push-event workflow timeline |
| Admin: Settings/integrations panel | ✅ Panel 24 — integration health, env vars, workers |
| Sensitive docs in git history | ✅ Full purge via filter-repo + force push |
| Asset intake SOP | ✅ Added to DEVELOPER_GUIDE.md |
| Deployment/feature-gating rules | ✅ Added to DEVELOPER_GUIDE.md |
| CultureSherpa community plan | ✅ CULTURESHERPA_COMMUNITY_PLAN.md |
| Media pipeline audit | ✅ MEDIA_PIPELINE_AUDIT.md |


### Phase 2 (Structural)

| Gap                                | Notes              |
| ---------------------------------- | ------------------ |
| GA4 unified tracking across brands | Currently fragmented |
| CitizenApproved: CI workflow       | Has CI now — needs test suite |

### Phase 3 (Experience & Capability)

| Gap                            | Notes                |
| ------------------------------ | -------------------- |
| CultureSherpa UX modernization | Charter Workstream C |
| Admin: Documentation hub panel | Charter §10 later    |
| Media/animation pipeline       | Charter Workstream D |
| Cross-brand brand system       | Charter Workstream E |

---

## 8. Phase 1 Completion Checklist

- [x] Baseline ecosystem map produced (this doc)
- [x] Storage usage map — Z: drive hot-spots + large files → see section 2.3 above + [STORAGE_AUDIT_2026-03-08.md](STORAGE_AUDIT_2026-03-08.md) Phase 1 Deep Scan
- [x] Security — sensitive docs removed from repo tip AND full git history purge completed 2026-03-17
- [x] Admin suite module inventory — section 3 above
- [x] Documentation spine established (EVERYTHING.md + this doc + charter)
- [x] Asset intake standard defined — see DEVELOPER_GUIDE.md § Asset Intake SOP
- [x] Deployment/feature-gating rules locked — see DEVELOPER_GUIDE.md § Deployment & Feature-Gating Rules
- [x] CultureSherpa community architecture plan — see [CULTURESHERPA_COMMUNITY_PLAN.md](CULTURESHERPA_COMMUNITY_PLAN.md)
- [x] Media generation pipeline audit — see [MEDIA_PIPELINE_AUDIT.md](MEDIA_PIPELINE_AUDIT.md)
- [x] Branch protection applied to all public repos (2026-03-16)
- [x] Admin panels 22-24 built: Projects, Deployments, Settings (charter §10)

---

## Quick Commands

```powershell
npm test                    # Full Puppeteer suite (205 tests)
npm run dev                 # Local http-server :3000
git push origin main        # Deploy GFD → CF Pages auto (~2 min)
npm run deploy:stripe       # Deploy Stripe worker
npm run deploy:health-sweep # Deploy health sweep worker
npm run r2:import           # Bulk upload images → R2 + D1
```

---

_Last full update: 2026-03-17 — Phase 1 execution_
