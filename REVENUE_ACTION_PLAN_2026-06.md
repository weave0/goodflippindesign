# Ecosystem Revenue Action Plan - June 2026

> Named execution roadmap: [SKY_MONEY_ROADMAP_2026-06.md](SKY_MONEY_ROADMAP_2026-06.md)

## Strategic Position

The primary opportunity is not becoming another web design shop. The stronger opportunity is to tie together AIAIMate, CitizenApproved, GlobalDeets, Good Flippin Vibes, CultureSherpa, Good Flippin Design, and related projects into a high-traffic public-interest technology ecosystem.

The business should be built around adoption, trust, useful public tools, community participation, and sponsor-safe media value. Client services can remain a bridge or selective funding mechanism, but they should not become the center of the company if they pull energy away from the ecosystem itself.

## Core Thesis

Build a portfolio of useful, mission-aligned web properties that reinforce each other:

- **AIAIMate.com**: AI education, AI literacy, tutorials, tools, learning paths, and practical guidance.
- **CitizenApproved.org**: civic participation, accountability, voter/civic education, democracy-tech tooling.
- **GlobalDeets.com**: public data storytelling, dashboards, research briefs, visual intelligence, project discovery.
- **GoodFlippinVibes.com**: community, creative/wellness culture, supporter identity, broader public voice.
- **CultureSherpa.org**: cultural atlas, preservation, geography, learning, global heritage storytelling.
- **GoodFlippinDesign.com**: studio/infrastructure hub, credibility layer, investor/supporter entry point, technical proof.

Revenue should come from the value of the network, not from competing in a crowded commodity design market.

## Existing Assets Already in Place

- [donate.html](donate.html) has Stripe checkout, PayPal.me, GoFundMe, one-time support, monthly patron mode, and analytics events.
- [ads.txt](ads.txt) verifies Google AdSense publisher `pub-6209726914457253`.
- [\_worker.js](_worker.js) already injects `ADSENSE_CLIENT` and `ADSENSE_SLOT_INDEX` when configured in Cloudflare.
- [publisher-policy.html](publisher-policy.html) establishes monetization and editorial standards.
- [investor-briefing-private.html](investor-briefing-private.html) already frames sponsorship, ads, owned media, commissioned intelligence, and premium products.
- [ecosystem-strategy.json](ecosystem-strategy.json) maps the cross-site linking opportunity.
- [community-portal.html](community-portal.html), Clerk, D1, and Workers create a base for shared identity/community features.
- `CASHMONEY/` service materials exist and can fund the ecosystem selectively, but should be treated as secondary.

## Revenue Architecture

### 1. Supporter Revenue

Supporter revenue is the clearest near-term fit because the ecosystem has an explicit public-good and creator-led mission.

Use cases:

- monthly patrons,
- direct donations,
- GoFundMe campaign,
- project-specific funding goals,
- transparent infrastructure/support targets.

Immediate positioning:

- `100 patrons at $5/mo keeps core hosting and tooling alive.`
- `250 patrons at $5/mo funds weekly content/tool releases.`
- `1,000 patrons at $5/mo turns this into a durable public technology lab.`

Important fix:

- Verify whether `Tax Deductible` and `Tax-deductible receipt provided` language in [donate.html](donate.html) is legally accurate. If not, replace it before aggressive fundraising.

### 2. Sponsorships and Ethical Advertising

Sponsorships are a better strategic fit than generic display ads because they can fund specific public resources while preserving trust.

Sponsor inventory to create:

| Inventory                 | Example Sponsor                              |      Price Range |
| ------------------------- | -------------------------------------------- | ---------------: |
| AI literacy guide sponsor | AI tool, school, workforce org               |    `$500-$2,500` |
| Civic explainer sponsor   | civic nonprofit, local org, foundation       |    `$500-$3,000` |
| Cultural atlas sponsor    | museum, education org, travel/culture brand  |    `$500-$3,000` |
| Data brief sponsor        | research firm, public-interest org, B2B SaaS |  `$1,500-$5,000` |
| Ecosystem-wide supporter  | aligned brand or donor                       | `$250-$1,500/mo` |

Rules:

- Sponsors cannot control editorial conclusions.
- Sensitive civic and cultural content needs clear boundaries.
- Sponsorship should be labeled and consistent with [publisher-policy.html](publisher-policy.html).
- Ads should appear on content/resource pages before core trust or donation pages.

### 3. Premium Knowledge Products

The ecosystem can produce digital products without abandoning the public mission.

Candidate products:

- AIAIMate AI literacy starter kit: `$19-$49`.
- CitizenApproved civic action toolkit: `$9-$29`.
- GlobalDeets data storytelling templates: `$49-$149`.
- CultureSherpa learning packs or cultural geography guides: `$9-$39`.
- Good Flippin Vibes creative/wellness supporter packs: `$9-$49`.
- Ecosystem supporter bundle: `$49-$199`.

Principle:

- Keep core public resources free.
- Charge for convenience, depth, templates, downloads, live sessions, premium collections, and professional use.

### 4. Membership and Community

Membership should be framed as supporting and participating in the ecosystem, not simply paying for gated content.

| Tier           |      Price | Value                                                                  |
| -------------- | ---------: | ---------------------------------------------------------------------- |
| Supporter      |    `$5/mo` | project updates, supporter identity, voting on roadmap themes          |
| Builder        |   `$15/mo` | templates, prompt packs, early demos, community sessions               |
| Pro / Research |   `$49/mo` | premium briefs, office hours, early dashboard access, deeper archives  |
| Institutional  | `$250+/mo` | sponsorship-style recognition, briefings, educational/community access |

The existing Clerk/community portal work can become the identity layer across sites once there is enough cadence to justify sign-in.

### 5. Commissioned Intelligence, Not Commodity Web Design

If selling services, sell what the ecosystem proves: research, dashboards, education, civic technology, data storytelling, and AI literacy.

Better offers than generic web design:

- Custom data brief: `$500-$5,000`.
- Interactive public dashboard: `$5,000-$25,000`.
- AI literacy workshop/resource pack: `$1,500-$10,000`.
- Civic engagement microsite/tool: `$5,000-$30,000`.
- Cultural/education visualization package: `$2,500-$15,000`.

This keeps paid work aligned with the ecosystem instead of dragging the company into commodity brochure-site competition.

### 6. Grants, Philanthropy, and Institutional Support

Several properties are naturally grant-aligned:

- AI education access,
- civic participation,
- cultural preservation,
- open data and public-interest dashboards,
- digital inclusion,
- accessibility and public knowledge infrastructure.

Research targets:

- Knight Foundation,
- Mozilla Foundation,
- Ford Foundation,
- local Minnesota arts/culture/civic funds,
- humanities and cultural preservation grants,
- AI literacy/workforce development programs,
- democracy and civic technology funders,
- education innovation grants.

Needed assets:

- one-page ecosystem overview,
- project-specific impact pages,
- traffic/community metrics,
- budget and use-of-funds document,
- fiscal sponsorship or legal structure clarity if needed.

### 7. Affiliate and Referral Revenue

Affiliates can fit on tutorials/resource pages, especially AIAIMate and GlobalDeets, but should not define the brand.

Potential categories:

- AI tools,
- learning platforms,
- books/courses,
- data visualization tools,
- civic/community tech tools,
- creator/music/art tools,
- hosting and infrastructure tools.

Rules:

- Use disclosures.
- Recommend only tools that fit the mission.
- Avoid affiliate clutter on high-trust civic pages.

### 8. Bridge Revenue Guardrails

Generic web design can bring in cash, but it should not become the identity of the business. Only accept service work that meets at least one of these conditions:

- It funds ecosystem runway without consuming all attention.
- It becomes a case study, dashboard, civic tool, data product, or reusable asset.
- It aligns with AI education, civic trust, culture, public data, wellness, or creative infrastructure.
- It produces a relationship with a sponsor, partner, institution, or funder.

Bridge offers should be renamed and sold as strategy, intelligence, education, or platform work whenever possible.

## Traffic and Adoption Flywheel

The ecosystem needs a repeatable loop:

1. Publish high-value public resources on each site.
2. Cross-link related resources across the ecosystem.
3. Capture supporters through newsletter/community/donation CTAs.
4. Turn the best resources into sponsor inventory, premium downloads, or membership value.
5. Use analytics to identify which topics drive adoption.
6. Reinforce winners with better UX, search structure, social clips, and follow-up content.

Cross-linking examples:

- AIAIMate AI literacy lessons link to GlobalDeets AI impact dashboards.
- CitizenApproved civic guides link to GlobalDeets public data explainers.
- CultureSherpa cultural pages link to Good Flippin Vibes community/supporter identity.
- GoodFlippinDesign.com explains the studio and funding model behind the whole network.
- Every site has a consistent ecosystem footer and `Support this ecosystem` CTA.

## UX Priorities for Global Adoption

The ecosystem wins if it feels coherent, fast, useful, and trustworthy.

Priority improvements:

- shared ecosystem navigation/footer,
- consistent support CTA across all properties,
- unified newsletter/supporter capture,
- clear "what this site is for" first-screen positioning,
- mobile performance and accessibility passes,
- structured data on every major property,
- content hubs by theme: AI, civic, culture, data, community,
- reusable article/resource templates,
- analytics events for support clicks, signup intent, outbound ecosystem clicks, and content depth.

## 30-Day Execution Plan

### Week 1: Cohesion and Funding Clarity

- Replace the current service-first revenue posture with an ecosystem-first public narrative.
- Add or verify ecosystem footers across GFD, AIAIMate, CitizenApproved, GlobalDeets, GFV, and CultureSherpa.
- Add a consistent `Support the ecosystem` CTA.
- Fix donation trust language if tax-deductible status is not confirmed.
- Create one shared one-page ecosystem overview for supporters, sponsors, and funders.

### Week 2: Traffic Loops and Measurement

- Add GA4 or equivalent events for cross-site clicks, donation starts, patron starts, newsletter signups, and sponsor inquiry clicks.
- Identify top 10 pages across the ecosystem by likely search/social value.
- Improve internal linking among those pages.
- Add structured data where missing.
- Confirm AdSense approval and place ads only on appropriate content pages.

### Week 3: Sponsor and Supporter Packaging

- Create a sponsor one-sheet.
- Create three sponsor-safe inventory examples: AI literacy, civic explainers, cultural atlas/data story.
- Add monthly patron goal copy to donation/support pages.
- Publish one transparent use-of-funds update.

### Week 4: Premium and Institutional Products

- Package one premium download or toolkit from existing material.
- Draft one grant/foundation-ready project page.
- Draft one commissioned-intelligence offer that is not generic web design.
- Prepare a lightweight monthly supporter update template.

## Outreach Script

Subject: aligned support for a public-interest tech ecosystem

Hi [Name],

I am building a connected public-interest technology ecosystem across AI education, civic transparency, cultural discovery, data storytelling, and community tools: AIAIMate, CitizenApproved, GlobalDeets, CultureSherpa, Good Flippin Vibes, and Good Flippin Design.

I am looking for aligned sponsors, supporters, and partners who want to help keep the work open, useful, and improving. Current funding goes directly into hosting, UX polish, accessibility, content, research, and product development.

Would it make sense to send you the short partner/sponsor brief?

- Brett

## What To Measure

- Cross-site referral clicks.
- Returning visitors.
- Email/community signups.
- Support CTA clicks.
- Donation conversion rate.
- Monthly patrons.
- Sponsor/partner brief requests.
- Sponsor conversations opened.
- Premium product purchases.
- Grant/partner applications submitted.
- AdSense approval/RPM if enabled.

## Revenue Targets

Conservative early target:

- 50 patrons at `$5/mo` = `$250/mo`.
- 1 small sponsor at `$250/mo` = `$250/mo`.
- 2 premium product sales per week at `$29` = about `$250/mo`.
- Light ads/affiliate floor = variable.

Stronger 90-day target:

- 250 patrons at `$5/mo` = `$1,250/mo`.
- 2 sponsors at `$500/mo` = `$1,000/mo`.
- 1 commissioned data/education/civic brief at `$2,500-$5,000`.
- Premium products and ads begin creating a small floor.

Strategic 12-month target:

- recurring supporter/sponsor base,
- sponsor-safe traffic across multiple properties,
- premium knowledge product catalog,
- grant/foundation conversations,
- selective commissioned intelligence,
- ecosystem brand recognized as a useful public technology network.

## Current Best Bet

Burn resources improving the ecosystem UX, cross-site adoption, public usefulness, and supporter/sponsor pathways. Keep web design services available only as selective, aligned funding work. The main product is the network.
