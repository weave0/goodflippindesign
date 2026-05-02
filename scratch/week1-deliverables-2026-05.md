# Week 1 Deliverables — Cross-Ecosystem

> Companion to [ECOSYSTEM_GAP_ANALYSIS_2026-05.md](../ECOSYSTEM_GAP_ANALYSIS_2026-05.md).
> Four artifacts in one file: (1) shared ecosystem footer + JSON-LD `@graph`,
> (2) AIAimate Stripe Subscription plan, (3) CultureSherpa repository archaeology plan,
> (4) Pinterest OAuth setup steps for the social-publisher worker. _(TikTok deferred — see status below.)_
>
> ## Implementation Status (2026-05-01)
>
> | Item                                                                                    | Status                  | Notes                                                                                                                                                                                                                                                                |
> | --------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
> | GFD `index.html` JSON-LD → unified `@graph`                                             | ✅ Shipped              | Replaced 4 separate blocks with one `@graph` (Studio → Brand → Person → 7 WebSites). Studio canonical = `goodflippindesign.com`.                                                                                                                                     |
> | GFD `index.html` footer ecosystem block (studio + 7 props)                              | ✅ Shipped              | Added studio attribution line + Lowertown SP + Heavy Moose. Now lists all 7 properties.                                                                                                                                                                              |
> | GFD secondary pages JSON-LD (`donate`, `gallery`, `music`, 5×album, `terms`, `privacy`) | ✅ Shipped              | Per-page `WebPage` / `CollectionPage` / `MusicAlbum` / `DonateAction` nodes, each `isPartOf` the brand `WebSite` and referencing the studio `Organization`. 9 files. Also fixed `terms`/`privacy` description bug ("for goodflippinvibes.com" → studio + brand).     |
> | `temp_review.html` + `temp_donate_review.html` mirrors                                  | ✅ Synced               | Via `node scripts/sync-review.js`.                                                                                                                                                                                                                                   |
> | Test suite after secondary-page JSON-LD                                                 | ✅ 13/13 pass           | 1 pre-existing warning, no new regressions.                                                                                                                                                                                                                          |
> | Pinterest publisher (`workers/social-publisher.js`)                                     | ✅ Already coded        | `postPinterest()` + OAuth provider in `workers/oauth.js`. Only blocker is registering the dev app + pushing `PINTEREST_APP_ID`/`PINTEREST_APP_SECRET`.                                                                                                               |
> | TikTok                                                                                  | ⏸ Deferred (2026-05-01) | User decision: no phone number for account creation; deprioritized despite platform volume. PLATFORM_SPECS stub left intact — no harm.                                                                                                                               |
> | AIAimate Stripe Subscriptions ($5 / $15 / $50)                                          | 📋 Plan only            | Cross-repo (`weave0/aiaimate`). Section 2 below is the deliverable.                                                                                                                                                                                                  |
> | CultureSherpa repo archaeology                                                          | 📋 Plan only            | Cross-repo (`weave0/culturesherpa`). Section 3 below is the deliverable.                                                                                                                                                                                             |
> | HeavyMoose / CitizenApproved footer + `@graph` paste                                    | 📋 Plan only            | Cross-repo. Section 1 snippets below are paste-ready.                                                                                                                                                                                                                |
> | `scratch/lowertownstpaul-deploy/` JSON-LD + ecosystem footer column                     | ✅ Shipped              | `WebSite` + `Place`/`TouristDestination` (NRHP ref# 83001357) + studio `Organization`. New "Studio & Ecosystem" footer column with 6 sister-property links. Footer-bottom rewritten as "A property of Good Flippin Design · published under Good Flippin Vibes LLC". |
> | `scratch/brettleeweaver-artist-hybrid/` JSON-LD + ecosystem footer line                 | ✅ Shipped              | `WebSite` + `Person` (Brett, `worksFor` studio) + studio `Organization`. Footer concept-direction line replaced with full ecosystem attribution.                                                                                                                     |

---

## 1. Shared ecosystem footer + JSON-LD `@graph` snippet

### Why a shared snippet

All seven properties currently advertise themselves as standalone surfaces. Adding
one footer + one JSON-LD graph that names every property and the studio creates:

- Free internal-link equity (bidirectional backlinks across 7 domains).
- Search-engine understanding of the parent/sibling relationships (`@graph` does this).
- A consistent "Studio + Brand" identity block that resolves the
  goodflippindesign.com (studio) ↔ goodflippinvibes.com (brand) relationship.

### A. HTML footer block (paste into AIAimate, CitizenApproved, HeavyMoose, BrettLeeWeaver, Lowertown, optionally GFD)

Drop this above the closing `</body>`. Tweak the `<aside>` accent color per site
to match local design tokens. The class names are intentionally generic so each
site's existing CSS can target them without conflict.

```html
<!-- BEGIN: Good Flippin Design ecosystem footer (v1, 2026-05) -->
<aside class="gfd-eco-footer" aria-labelledby="gfd-eco-heading">
  <div class="gfd-eco-inner">
    <div class="gfd-eco-studio">
      <p class="gfd-eco-eyebrow">Built by</p>
      <p class="gfd-eco-studio-name">
        <a href="https://goodflippindesign.com" rel="noopener">
          Good Flippin Design
        </a>
      </p>
      <p class="gfd-eco-tagline">
        A Minneapolis design + engineering studio.
        <span class="gfd-eco-brand-line">
          We publish under the brand
          <a href="https://goodflippinvibes.com" rel="noopener"
            >Good Flippin Vibes</a
          >.
        </span>
      </p>
    </div>

    <nav class="gfd-eco-nav" aria-label="Studio properties">
      <h2 id="gfd-eco-heading" class="gfd-eco-heading">Across the studio</h2>
      <ul class="gfd-eco-list">
        <li>
          <a href="https://aiaimate.com" rel="noopener"
            >AI Aimate <span>education</span></a
          >
        </li>
        <li>
          <a href="https://culturesherpa.org" rel="noopener"
            >CultureSherpa <span>cultural intel</span></a
          >
        </li>
        <li>
          <a href="https://citizenapproved.org" rel="noopener"
            >CitizenApproved <span>civic advocacy</span></a
          >
        </li>
        <li>
          <a href="https://lowertownstpaul.org" rel="noopener"
            >Lowertown St. Paul <span>civic showcase</span></a
          >
        </li>
        <li>
          <a href="https://heavymoose.com" rel="noopener"
            >Heavy Moose <span>music canon</span></a
          >
        </li>
        <li>
          <a href="https://brettleeweaver.com" rel="noopener"
            >Brett Lee Weaver <span>practice</span></a
          >
        </li>
        <li>
          <a href="https://goodflippinvibes.com" rel="noopener"
            >Good Flippin Vibes <span>community</span></a
          >
        </li>
      </ul>
    </nav>
  </div>
</aside>

<style>
  .gfd-eco-footer {
    --eco-bg: #0d0d0d;
    --eco-text: #f5f5f5;
    --eco-muted: #8a8a8a;
    --eco-accent: #a855f7;
    --eco-border: rgba(255, 255, 255, 0.08);
    background: var(--eco-bg);
    color: var(--eco-text);
    border-top: 1px solid var(--eco-border);
    padding: 3rem 1.25rem;
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      sans-serif;
  }
  .gfd-eco-inner {
    max-width: 1200px;
    margin: 0 auto;
    display: grid;
    gap: 2.5rem;
    grid-template-columns: 1fr;
  }
  @media (min-width: 768px) {
    .gfd-eco-inner {
      grid-template-columns: 1fr 1.4fr;
      gap: 4rem;
    }
  }
  .gfd-eco-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.75rem;
    color: var(--eco-muted);
    margin: 0 0 0.5rem;
  }
  .gfd-eco-studio-name {
    margin: 0 0 0.75rem;
    font-size: 1.5rem;
    font-weight: 700;
  }
  .gfd-eco-studio-name a {
    color: var(--eco-text);
    text-decoration: none;
  }
  .gfd-eco-studio-name a:hover,
  .gfd-eco-studio-name a:focus-visible {
    color: var(--eco-accent);
  }
  .gfd-eco-tagline {
    margin: 0;
    color: var(--eco-muted);
    line-height: 1.55;
    font-size: 0.95rem;
  }
  .gfd-eco-brand-line {
    display: block;
    margin-top: 0.4rem;
  }
  .gfd-eco-tagline a {
    color: var(--eco-text);
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .gfd-eco-tagline a:hover,
  .gfd-eco-tagline a:focus-visible {
    color: var(--eco-accent);
  }
  .gfd-eco-heading {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--eco-muted);
    margin: 0 0 1rem;
  }
  .gfd-eco-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.5rem;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  }
  .gfd-eco-list a {
    display: flex;
    flex-direction: column;
    padding: 0.6rem 0.75rem;
    color: var(--eco-text);
    text-decoration: none;
    border: 1px solid var(--eco-border);
    border-radius: 8px;
    transition:
      transform 0.2s ease,
      border-color 0.2s ease;
    min-height: 44px; /* WCAG touch target */
  }
  .gfd-eco-list a:hover,
  .gfd-eco-list a:focus-visible {
    transform: translateY(-2px);
    border-color: var(--eco-accent);
  }
  .gfd-eco-list span {
    font-size: 0.7rem;
    color: var(--eco-muted);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-top: 0.2rem;
  }
</style>
<!-- END: Good Flippin Design ecosystem footer -->
```

### B. JSON-LD `@graph` (paste into `<head>` of every property)

One graph wires `Organization` (the studio) → `Brand` (GFV) → seven `WebSite`
nodes. Search engines treat `@graph` entries as a single semantic unit, so every
property gets the relationship payload regardless of which page is crawled.

> **Important on URLs:** the studio's canonical home is goodflippindesign.com.
> The brand surface is goodflippinvibes.com. They are intentionally distinct;
> do not collapse them.

```html
<script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://goodflippindesign.com/#studio",
        "name": "Good Flippin Design",
        "legalName": "GFV LLC",
        "url": "https://goodflippindesign.com",
        "logo": "https://goodflippindesign.com/assets/logos/gfd-circle-mark.png",
        "founder": { "@id": "https://brettleeweaver.com/#person" },
        "address": {
          "@type": "PostalAddress",
          "addressLocality": "Minneapolis",
          "addressRegion": "MN",
          "addressCountry": "US"
        },
        "brand": { "@id": "https://goodflippinvibes.com/#brand" },
        "owns": [
          { "@id": "https://aiaimate.com/#site" },
          { "@id": "https://culturesherpa.org/#site" },
          { "@id": "https://citizenapproved.org/#site" },
          { "@id": "https://lowertownstpaul.org/#site" },
          { "@id": "https://heavymoose.com/#site" },
          { "@id": "https://goodflippinvibes.com/#brand" }
        ],
        "sameAs": [
          "https://github.com/weave0",
          "https://linkedin.com/company/good-flippin-design"
        ]
      },
      {
        "@type": "Brand",
        "@id": "https://goodflippinvibes.com/#brand",
        "name": "Good Flippin Vibes",
        "url": "https://goodflippinvibes.com",
        "parentOrganization": { "@id": "https://goodflippindesign.com/#studio" }
      },
      {
        "@type": "Person",
        "@id": "https://brettleeweaver.com/#person",
        "name": "Brett Weaver",
        "jobTitle": "Founder, Good Flippin Design",
        "url": "https://brettleeweaver.com",
        "worksFor": { "@id": "https://goodflippindesign.com/#studio" }
      },
      {
        "@type": "WebSite",
        "@id": "https://aiaimate.com/#site",
        "name": "AI Aimate",
        "url": "https://aiaimate.com",
        "publisher": { "@id": "https://goodflippindesign.com/#studio" }
      },
      {
        "@type": "WebSite",
        "@id": "https://culturesherpa.org/#site",
        "name": "CultureSherpa",
        "url": "https://culturesherpa.org",
        "publisher": { "@id": "https://goodflippindesign.com/#studio" }
      },
      {
        "@type": "WebSite",
        "@id": "https://citizenapproved.org/#site",
        "name": "CitizenApproved",
        "url": "https://citizenapproved.org",
        "publisher": { "@id": "https://goodflippindesign.com/#studio" }
      },
      {
        "@type": "WebSite",
        "@id": "https://lowertownstpaul.org/#site",
        "name": "Lowertown St. Paul",
        "url": "https://lowertownstpaul.org",
        "publisher": { "@id": "https://goodflippindesign.com/#studio" }
      },
      {
        "@type": "WebSite",
        "@id": "https://heavymoose.com/#site",
        "name": "Heavy Moose",
        "url": "https://heavymoose.com",
        "publisher": { "@id": "https://goodflippindesign.com/#studio" }
      }
    ]
  }
</script>
```

### C. Roll-out order (low risk → higher risk)

1. **HeavyMoose** — paste both blocks. Lowest stakes; smoke test the visual.
2. **CitizenApproved** — paste both blocks; verify Tailwind doesn't shadow `.gfd-eco-*` classes.
3. **AIAimate** — paste both blocks into Next.js `app/layout.tsx` (footer as a server component, JSON-LD via `next/script` strategy="afterInteractive" or directly in `<head>` via metadata).
4. **Lowertown / BrettLeeWeaver** — paste during their MVP/port (already greenfield).
5. **CultureSherpa** — paste _after_ repository archaeology (item 3 below).
6. **GFD (this repo)** — replace the existing 4 separate `<script type="application/ld+json">` blocks (lines ~4233, ~4330, ~4353, ~4392 in `index.html`) with the single `@graph` above. Bigger SEO change → save for last and verify in Search Console after deploy. **Do not start here.**

---

## 2. AIAimate Stripe Subscription integration plan

### Current state (per AIAimate `CURRENT_STATUS.md`)

- One-time donations only, via Stripe Payment Links: $3, $5, $10, $25, $50.
- No subscription product, no customer portal link, no nurture sequence.
- Highest dollar-per-hour gap in the portfolio.

### Recommended tier ladder

| Tier      | Monthly | Positioning                                 | Stripe product type           |
| --------- | ------- | ------------------------------------------- | ----------------------------- |
| Friend    | $5      | Says "this matters" — entry tier            | Recurring subscription        |
| Patron    | $15     | Funds one new article per month             | Recurring subscription        |
| Sustainer | $50     | Funds infrastructure + a learning path      | Recurring subscription        |
| One-time  | any     | Keep all 5 existing Payment Links unchanged | (already live — do not touch) |

Naming rationale: avoids "Member" (implies gated content, which AIAimate doesn't have) and avoids "Supporter" (overused).

### Implementation path (Payment Links route — fastest, no code)

1. In Stripe Dashboard → Products → New product, create three recurring products:
   - `aiaimate-friend-monthly` ($5/mo, USD)
   - `aiaimate-patron-monthly` ($15/mo, USD)
   - `aiaimate-sustainer-monthly` ($50/mo, USD)
2. For each, create a Payment Link → enable "Allow promotion codes" → enable "Customer Portal".
3. Set success URL to `https://aiaimate.com/contribute/thanks?tier={CHECKOUT_SESSION_ID}` and cancel URL to `https://aiaimate.com/contribute`.
4. In AIAimate's `/contribute` page: add a 3-card "Monthly support" section above the existing one-time grid. Each card links to its Payment Link.
5. Add `https://billing.stripe.com/p/login/...` (Customer Portal link from Stripe) so subscribers can self-manage.
6. Wire GA4 events: `view_subscribe`, `select_subscribe_tier` (with `tier` param), `subscribe_complete`.

### Why Payment Links and not Checkout API

Payment Links require zero new server code, work with the existing Vercel deploy,
and ship in under an hour. The Checkout API path is the right move once recurring
revenue exceeds ~$500 MRR (then you'd want webhook-driven entitlement). Until
then, Payment Links + Stripe Customer Portal cover everything.

### Open AIAimate decisions to confirm

- Tier amounts: confirm $5 / $15 / $50 or substitute (e.g., $5 / $10 / $25)?
- Tier naming: confirm Friend / Patron / Sustainer or substitute?
- Should Sustainer-tier subscribers get any visible perk (newsletter "credits" line, badge), or is positioning purely "fund the work"?

---

## 3. CultureSherpa repository archaeology plan

### Why this is Week 1, not "later"

CultureSherpa repo root currently holds hundreds of files including dozens of
historical `*_COMPLETE.md`, `*_DEPLOYED*.md`, multiple `lambda_*.zip` snapshots,
and at least 6 competing `COMMUNITY_*` plans. Every new feature search drags
through this. **Cleanup pays back every future hour spent on the repo.**

### Sweep plan (one focused day)

> Run from the CultureSherpa repo root. None of these commands delete anything —
> they move into `_archive/` so history is preserved and `git mv` keeps blame.

#### Step 1: Create the archive structure

```bash
mkdir -p _archive/2026-completed-reports
mkdir -p _archive/lambda-zips
mkdir -p _archive/community-plans
mkdir -p _archive/deployment-snapshots
```

#### Step 2: Move dated "complete" / "deployed" reports

```bash
# Dry-run first — list what would move
git ls-files | grep -E '_(COMPLETE|DEPLOYED|FIXED|RESOLVED|FINAL)\.md$' | grep -v '^_archive/'

# Then move (review the list above before running)
git ls-files | grep -E '_(COMPLETE|DEPLOYED|FIXED|RESOLVED|FINAL)\.md$' \
  | grep -v '^_archive/' \
  | xargs -I {} git mv {} _archive/2026-completed-reports/
```

#### Step 3: Move lambda zip artifacts

```bash
git ls-files | grep -E '^lambda_.*\.zip$' \
  | xargs -I {} git mv {} _archive/lambda-zips/
```

These should not be in version control at all long-term. After moving, add to `.gitignore`:

```gitignore
# Lambda build artifacts (re-created on demand)
lambda_*.zip
_archive/lambda-zips/*.zip
```

Then the next cleanup can `git rm` them entirely. This sprint, just move them.

#### Step 4: Pick one canonical community plan

Inventory first:

```bash
git ls-files | grep -i 'community.*\.md$'
```

Recommended canonical: `ZERO_COST_COMMUNITY_PLAN.md` (cheapest path, matches
GFD's existing infra patterns — Cloudflare-first, no AWS additions).
Move all _other_ community plans to `_archive/community-plans/` and add a
1-paragraph note at the top of the canonical plan:

```markdown
> **Canonical community plan (selected 2026-05-01).** Earlier community plans
> are preserved under `_archive/community-plans/` for reference but are not
> the active strategy.
```

#### Step 5: Single source of truth for "how many cultures"

Today, docs report 258, 401+, 409, 411, 459. Pick the live DB count as truth:

```sql
-- Run against the production Postgres
SELECT COUNT(*) AS total_cultures FROM cultures WHERE published = true;
```

Then create `docs/CULTURES_COUNT.md` that cites the query and the date the count
was taken. Marketing copy uses "400+" (rounded down from whatever the live DB
returns). Every time the number changes, update only that one file.

#### Step 6: Verify and commit

```bash
# Re-run counts before/after
git ls-files | wc -l                # total tracked files
git ls-files | grep -v '^_archive/' | wc -l   # files in active tree

git status
git commit -m "chore(repo): archive completed reports, lambda zips, superseded community plans

Moves dated *_COMPLETE.md, *_DEPLOYED.md, *_FINAL.md, *_FIXED.md and
lambda_*.zip artifacts into _archive/. Selects ZERO_COST_COMMUNITY_PLAN
as canonical; archives other community plans. No code or active docs
changed. Reduces root-level file noise to make ongoing work tractable."
```

### Acceptance criteria

- Active tree (excluding `_archive/`) has < 100 files in repo root.
- Exactly one `COMMUNITY_*.md` plan remains outside `_archive/`.
- No `lambda_*.zip` outside `_archive/lambda-zips/`.
- `docs/CULTURES_COUNT.md` exists and cites the SQL query that produced the count.
- All tests still pass (the 566-test suite); no source files moved.

### Hard rule for the sprint

**Do not add new features to CultureSherpa until this archaeology PR is merged.**

---

## 4. Pinterest OAuth setup for `social-publisher` worker _(TikTok deferred)_

### Current state

The `social-publisher` worker (`workers/social-publisher.js`, deployed via
`wrangler-social.toml`) supports Twitter/X, Bluesky, LinkedIn, and Facebook.
**Pinterest is already wired in code** — `postPinterest()` lives in
`workers/social-publisher.js` (line ~587) and the OAuth provider config is in
`workers/oauth.js` (line ~60). The only remaining work is registering the
Pinterest dev app and pushing two secrets.

TikTok is **deferred (2026-05-01)** per user decision: account creation
requires a phone number we don't currently have, and the platform was
deprioritized despite its volume. The `tiktok` entries in `PLATFORM_SPECS` and
`workers/oauth.js` are harmless stubs — leave them alone until we revisit.

> **You** create the Pinterest dev app (Pinterest requires a human sign-in).
> **No further code change needed afterward** — just push the two secrets.

### A. Pinterest dev app setup

1. Sign in at <https://developers.pinterest.com/apps/> as the brand account that owns the GFV/GFD presence.
2. Click **Create app**. Use:
   - App name: `GFD Social Publisher`
   - Description: "Cross-posts approved content from the studio CMS to Pinterest."
   - Website: `https://goodflippindesign.com`
   - Redirect URI: `https://goodflippindesign.com/api/social/pinterest/callback`
3. After approval, copy the **App ID** and **App secret token**.
4. Required scopes (request all of these):
   - `boards:read`, `boards:write`
   - `pins:read`, `pins:write`
   - `user_accounts:read`
5. Push secrets to the worker:

   ```powershell
   wrangler secret put PINTEREST_APP_ID --config wrangler-social.toml
   wrangler secret put PINTEREST_APP_SECRET --config wrangler-social.toml
   ```

### B. TikTok dev app setup _(Deferred 2026-05-01 — do not do)_

> Skipped per user decision. Resume this section if/when a phone number is
> available for TikTok account creation. Original notes archived below for
> when we pick it back up:

<details>
<summary>Archived TikTok setup steps (do not run)</summary>

1. Sign in at <https://developers.tiktok.com/> as the brand account.
2. **Manage apps → Create an app**. Use:
   - App name: `GFD Social Publisher`
   - Category: Content publishing
   - Website: `https://goodflippindesign.com`
   - Terms of service URL: `https://goodflippindesign.com/terms.html`
   - Privacy policy URL: `https://goodflippindesign.com/privacy.html`
3. Add the **Content Posting API** product to the app.
4. Set redirect URI: `https://goodflippindesign.com/api/social/tiktok/callback`
5. Copy the **Client key** and **Client secret**.
6. Required scopes:
   - `user.info.basic`
   - `video.upload`
   - `video.publish`
7. Push secrets:

   ```powershell
   wrangler secret put TIKTOK_CLIENT_KEY --config wrangler-social.toml
   wrangler secret put TIKTOK_CLIENT_SECRET --config wrangler-social.toml
   ```

</details>

### C. After secrets are pushed

1. Confirm the `pinterest` provider in `workers/oauth.js` reads the new env vars.
2. Walk the OAuth flow: visit `/api/cms/oauth/authorize/pinterest` from the
   admin Social Publisher panel → grant on Pinterest → returns to
   `/api/cms/oauth/callback/pinterest` → token row appears in `cms_platform_tokens`.
3. Smoke-test from the admin panel by scheduling a single pin to a test board.
4. Watch the worker logs (`wrangler tail --config wrangler-social.toml`) for the
   first cron run that picks it up.

### D. Notes

- TikTok content posting requires app review for production scopes. Plan ~5–10
  business days between submission and approval. **Submit the day you create
  the app**, not later.
- Pinterest tokens have a 30-day default expiry and require a refresh-token
  flow. The worker will need a scheduled refresher (or refresh-on-publish).
- Both platforms reject text-only posts; the publisher must always include
  media. The R2 asset pipeline already produces these.

---

## Next decisions needed from you

1. Approve this footer copy ("A Minneapolis design + engineering studio. We publish under the brand Good Flippin Vibes.") — or rewrite the line.
2. Approve AIAimate tiers (Friend $5 / Patron $15 / Sustainer $50, monthly) — or substitute.
3. Approve `ZERO_COST_COMMUNITY_PLAN` as the canonical CultureSherpa community plan — or pick a different one.
4. Confirm who owns the Pinterest + TikTok dev-app registration step (you, or me with your sign-in via screen share).

Once you green-light, I'll start with HeavyMoose (lowest-risk paste of the footer + JSON-LD) so we have a verified template before touching the other repos.
