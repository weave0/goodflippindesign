# Ecosystem Project Inventory

**Status:** Discovered from live site highlights, Cloudflare Pages inventory, repo metadata, directory scans, and local machine sweep
**Updated:** 2026-05-15
**Purpose:** Exhaustive working inventory of projects connected to the Good Flippin Design ecosystem so the master artwork can distinguish core canon from supporting, paused, and unresolved items.

---

## Discovery Sources

- [goodflippindesign.com](https://goodflippindesign.com/)
- Cloudflare Pages project listing via `wrangler pages project list`
- [brands.json](../brands.json)
- [local-sweep.json](../local-sweep.json)
- [admin-panels.js](../admin-panels.js)
- [START_HERE.md](../START_HERE.md)
- [STATUS.md](../STATUS.md)
- [assets/data/gfv-music-catalog.json](../assets/data/gfv-music-catalog.json)
- Directory scan of [GFD Dev Projects](../GFD%20Dev%20Projects)

### History note

The local session database was queryable, but it returned no usable project-summary rows for this workspace. Directory and repo metadata were therefore the reliable sources.

### Priority note

For externally visible canon, the strongest sources are:

1. The live highlights and ecosystem links on [goodflippindesign.com](https://goodflippindesign.com/)
2. The authenticated Cloudflare Pages inventory from `wrangler pages project list`
3. Cross-links on the live public sites themselves

Local directories are useful, but they should not outrank the public production surfaces when deciding what belongs in the top-level ecosystem story.

---

## 1. Externally Verified Public Properties

These are publicly surfaced either by [goodflippindesign.com](https://goodflippindesign.com/), by live ecosystem cross-links, or by Cloudflare Pages.

| Property                | Verification source                      | Notes                                                            |
| ----------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Good Flippin Design     | Site + Cloudflare Pages                  | Primary studio surface                                           |
| Good Flippin Vibes      | Site + Cloudflare Pages                  | Origin brand and community/wellness platform                     |
| AI Aimate               | Site highlight + live crawl              | Highlighted on GFD; appears to be deployed outside CF Pages      |
| CultureSherpa           | Site + Cloudflare Pages + live crawl     | Public cultural atlas; GFD highlight                             |
| CitizenApproved         | Site + Cloudflare Pages + live crawl     | Public civic/legal platform; GFD highlight                       |
| GlobalDeets             | Site + Cloudflare Pages + live crawl     | Public portfolio/data showcase; GFD highlight                    |
| Minnesota Peace         | Cloudflare Pages + live crawl            | Canonical mediation property                                     |
| Brett Lee Weaver        | Cloudflare Pages + repo/admin references | Public founder/personal hub                                      |
| Heavy Moose             | GFD live cross-link + Cloudflare Pages   | Explicitly linked from GFD and deployed on CF Pages              |
| Lowertown St Paul       | GFD live cross-link + Cloudflare Pages   | Explicitly linked from GFD and deployed on CF Pages              |
| Foxyana                 | Cloudflare Pages                         | Public Pages project exists in the account                       |
| Red Leopard of St. Paul | Cloudflare Pages                         | Public Pages property tied to the creative/music universe        |
| Good Flippin Yikes      | Cloudflare Pages                         | Public Pages property, not yet clearly linked from the main site |

---

## 2. Public / Live Ecosystem Projects

These are the strongest candidates for inclusion in the master artwork.

| Project             | Status         | Domain / URL          | Role in ecosystem                                      | Evidence                                                                                                                            |
| ------------------- | -------------- | --------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Good Flippin Design | Live           | goodflippindesign.com | Studio, parent surface, production hub                 | [brands.json](../brands.json), [admin-panels.js](../admin-panels.js), [local-sweep.json](../local-sweep.json)                       |
| Good Flippin Vibes  | Live           | goodflippinvibes.com  | Origin brand, wellness/art/community layer             | [brands.json](../brands.json), [admin-panels.js](../admin-panels.js)                                                                |
| AI Aimate           | Live           | aiaimate.com          | AI learning and education product                      | [brands.json](../brands.json), [admin-panels.js](../admin-panels.js), [local-sweep.json](../local-sweep.json)                       |
| CultureSherpa       | Live           | culturesherpa.org     | Cultural atlas, anthropology, travel, global education | [brands.json](../brands.json), [admin-panels.js](../admin-panels.js), [local-sweep.json](../local-sweep.json)                       |
| CitizenApproved     | Live           | citizenapproved.org   | Civic tech, accountability, public systems             | [brands.json](../brands.json), [admin-panels.js](../admin-panels.js), [local-sweep.json](../local-sweep.json)                       |
| GlobalDeets         | Live           | globaldeets.com       | Portfolio hub, client ecosystem, analytics showcase    | [brands.json](../brands.json), [admin-panels.js](../admin-panels.js), [local-sweep.json](../local-sweep.json)                       |
| Brett Lee Weaver    | Live / managed | brettleeweaver.com    | Personal brand hub, founder-facing surface             | [admin-panels.js](../admin-panels.js), [config/health-targets.json](../config/health-targets.json), [DASHBOARD.md](../DASHBOARD.md) |
| Minnesota Peace     | Live / managed | minnesotapeace.com    | Mediation and restorative-trust client project         | [admin-panels.js](../admin-panels.js), [START_HERE.md](../START_HERE.md), [local-sweep.json](../local-sweep.json)                   |

Additional externally verified public properties that appear to belong to the broader universe, but are not yet first-tier in the current artwork framing:

- Heavy Moose
- Lowertown St Paul
- Foxyana
- Red Leopard of St. Paul
- Good Flippin Yikes

---

## 3. Internal / Local Active Projects

These are clearly active in the working environment even if not public-facing.

| Project     | Status       | Directory                    | Role                                                                    | Evidence                                                                                                      |
| ----------- | ------------ | ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| SummitView  | Active local | GFD Dev Projects/SummitView  | Analytics and prompt/asset pipeline; music and image workflow backbone  | [brands.json](../brands.json), [admin-panels.js](../admin-panels.js), [local-sweep.json](../local-sweep.json) |
| ThyOwn      | Active local | GFD Dev Projects/ThyOwn      | AI/ML research, agents, training pipelines, generative experimentation  | [brands.json](../brands.json), [local-sweep.json](../local-sweep.json)                                        |
| Weave       | Active local | GFD Dev Projects/Weave       | Shared dev infrastructure and tooling fabric                            | [brands.json](../brands.json), [local-sweep.json](../local-sweep.json)                                        |
| CASHMONEY   | Active local | CASHMONEY                    | Finance, compliance, operational rigor                                  | [brands.json](../brands.json)                                                                                 |
| mediation   | Local folder | GFD Dev Projects/mediation   | Likely legacy or transitional mediation workspace                       | [local-sweep.json](../local-sweep.json)                                                                       |
| GFY         | Active local | GFD Dev Projects/GFY         | Separate local project tracked by sweep, purpose not yet canonicalized  | [local-sweep.json](../local-sweep.json)                                                                       |
| Applio      | Active local | GFD Dev Projects/Applio      | Separate cloned/local repo; likely tooling dependency rather than brand | [local-sweep.json](../local-sweep.json)                                                                       |
| so-vits-svc | Active local | GFD Dev Projects/so-vits-svc | Voice/audio model repo; likely supporting tooling                       | [local-sweep.json](../local-sweep.json)                                                                       |

---

## 4. Paused Projects

These should be treated as optional or archival unless you explicitly want the artwork to include dormant futures.

| Project        | Status        | Directory                                       | Notes                                                | Evidence                                                                                                     |
| -------------- | ------------- | ----------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Fantasy Penpal | Paused        | GFD Dev Projects/Paused Projects/fantasy-penpal | Already canonicalized in brands.json as paused       | [brands.json](../brands.json), [GFD Dev Projects/Paused Projects](../GFD%20Dev%20Projects/Paused%20Projects) |
| ToneDef        | Paused        | GFD Dev Projects/Paused Projects/ToneDef        | Music/audio-related product, paused                  | [brands.json](../brands.json), [GFD Dev Projects/Paused Projects](../GFD%20Dev%20Projects/Paused%20Projects) |
| elliasssan     | Paused folder | GFD Dev Projects/Paused Projects/elliasssan     | Exists on disk, not canonicalized in brands.json yet | [GFD Dev Projects/Paused Projects](../GFD%20Dev%20Projects/Paused%20Projects)                                |
| steveb         | Paused folder | GFD Dev Projects/Paused Projects/steveb         | Exists on disk, not canonicalized in brands.json yet | [GFD Dev Projects/Paused Projects](../GFD%20Dev%20Projects/Paused%20Projects)                                |

---

## 5. Creative Canon / Music-World Projects

These sit under the GFV and SummitView pipeline layer and matter for the artwork because they expand the ecosystem beyond software.

### Confirmed artists from the exported catalog

- DJ Foxyana
- DJ Shariff
- DJ Z
- Heavy Moose
- Red Leopard

The catalog metadata reports **6 total artists**, **11 albums**, and **101 tracks**, so there is at least one additional artist entry beyond the names surfaced in the quick grep pass.

### Confirmed significance

- Foxyana is core to the current ecosystem-art direction.
- Heavy Moose is externally verified as a live Cloudflare Pages property.
- Red Leopard of St. Paul is externally verified as a live Cloudflare Pages property.
- SummitView is the production pipeline feeding this music/art layer.
- Good Flippin Vibes is the brand umbrella tying the music canon to the broader ecosystem.

**Evidence:** [assets/data/gfv-music-catalog.json](../assets/data/gfv-music-catalog.json), [admin-panels.js](../admin-panels.js)

---

## 6. Cloudflare-Managed Pages Properties

These were verified directly through `wrangler pages project list` in the authenticated Weave0 account.

| Pages project                 | Domains                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| goodflippindesign             | goodflippindesign main domains                                           |
| good-flippin-vibes            | goodflippinvibes main domains plus gfv.globaldeets.com and gflippinv.com |
| globaldeets                   | globaldeets main domains                                                 |
| culturesherpa                 | culturesherpa.pages.dev                                                  |
| citizenapproved               | citizenapproved primary domains                                          |
| minnesotapeace                | minnesotapeace primary domains plus mediation.globaldeets.com            |
| brettleeweaver                | brettleeweaver.pages.dev                                                 |
| heavymoose                    | heavymoose primary domains                                               |
| lowertownstpaul               | lowertownstpaul primary domains                                          |
| redleopardofstpaul            | redleopardofstpaul primary domains                                       |
| foxyana                       | foxyana.pages.dev                                                        |
| goodflippinyikes              | goodflippinyikes primary domains                                         |
| culturesherpa-maps            | culturesherpa.globaldeets.com                                            |
| saintpaul                     | saintpaul.globaldeets.com                                                |
| communityhealth               | communityhealth.pages.dev                                                |
| community-health-intelligence | community-health-intelligence.pages.dev                                  |

Notable non-CF exception:

- AI Aimate is prominently linked by GFD and live on the public web, but it did not appear in Cloudflare Pages because it is hosted elsewhere.

---

## 7. Supporting Infrastructure / Service Projects

These are not standalone brands, but they are real parts of the operating ecosystem.

| Project / Service    | Role                                    | Evidence                                                                        |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------------------- |
| gfd-stripe           | Stripe payment intents worker           | [admin-panels.js](../admin-panels.js), [\_worker.js](../_worker.js)             |
| gfd-health-sweep     | Nightly ecosystem health worker         | [admin-panels.js](../admin-panels.js), [STATUS.md](../STATUS.md)                |
| gfv-social-publisher | Social scheduling and publishing worker | [admin-panels.js](../admin-panels.js), [STATUS.md](../STATUS.md)                |
| GFD auth worker      | Clerk/D1 auth and signed-in API layer   | [\_worker.js](../_worker.js), [community-portal.html](../community-portal.html) |

These probably belong in the master artwork as hidden infrastructure, not as primary visible entities.

---

## 8. Unresolved / Needs Confirmation

These were requested or implied, but I could not independently confirm them as distinct canonical projects from repo history or current directory evidence.

- **AETC:** No evidence found on the live sites, in Cloudflare Pages, or in canonical repo metadata. Keep as an extension slot until you define what it should represent visually.
- **mediation:** Folder exists, but Minnesota Peace already appears to be the canonical deployed mediation property. Treat as legacy or transitional unless you want both represented.
- **GFY:** Tracked by the local sweep, but no canonical description was found in `brands.json`. Decide whether it is a real ecosystem project, a dev experiment, or a helper repo.
- **Applio:** Local repo exists, but there is no evidence it belongs in the public-facing GFD canon. Exclude unless tooling ancestry matters to the story.
- **so-vits-svc:** Local repo exists, but appears to be supporting voice tooling. Exclude unless voice-synthesis infrastructure matters to the story.

---

## 9. Recommended Artwork Inclusion Tiers

### Tier A: Definitely include

- Good Flippin Design
- Good Flippin Vibes
- AI Aimate
- CultureSherpa
- CitizenApproved
- GlobalDeets
- Foxyana

### Tier B: Include as supporting but clearly secondary

- Brett Lee Weaver
- Minnesota Peace
- Heavy Moose
- Red Leopard of St. Paul
- Lowertown St Paul
- SummitView
- ThyOwn
- Weave
- CASHMONEY

### Tier C: Optional / reserve as future or edge references

- Fantasy Penpal
- ToneDef
- GFY
- AETC
- Applio
- so-vits-svc
- mediation
- elliasssan
- steveb
- Good Flippin Yikes
- culturesherpa-maps
- saintpaul
- communityhealth
- community-health-intelligence

---

## 10. Practical Takeaway

If the goal is **one image that represents the entirety of the work**, the cleanest interpretation is:

- **Primary visible canon:** the 7 Tier A projects
- **Secondary embedded layer:** Brett Lee Weaver, Minnesota Peace, Heavy Moose, Red Leopard of St. Paul, Lowertown St Paul, SummitView, ThyOwn, Weave, CASHMONEY
- **Peripheral dormant/future layer:** paused and unresolved projects as unopened districts, dormant gates, or faint edge-signals

That structure keeps the artwork comprehensive without turning it into a census chart.
