# GFD Traffic Intelligence

Observatory UI for the GFD ecosystem. It is a **Gold-layer consumer**.

It does not talk to Cloudflare, GA4, or Vercel. It does not invent visitor, user, session, pageview, human, bot, AI crawler, AI agent, threat, or confidence. It does not sum overlapping sources into a vanity “visitors” number.

## First milestone

Application shell, global filters, overview, sites, humans vs machines, AI actors, measurement laboratory, technical health, evidence drawer, responsive layout, fixture schema, fast tests.

## TI-002 production surface

The production target is `https://traffic.goodflippindesign.com`, deployed as the isolated Cloudflare Pages project `gfd-traffic-intelligence`.

The deployment workflow builds only `traffic-intelligence/`, deploys the exact `dist/` artifact, attaches the custom domain idempotently, and verifies both the HTML shell and Canonical Gold fixture after deployment. It does not modify the existing `goodflippindesign` Pages project.

The currently published Gold document is still an explicit Canonical Gold **fixture** (`fixture: true`), not a live analytics feed. The surface is marked `noindex`/`nofollow`; before TI-003 introduces live production Gold, access control must be reviewed and explicitly promoted alongside the live-data contract.

## Commands

```bash
cd traffic-intelligence
npm install
npm run emit-fixture   # writes public/gold/fixture.v1.json
npm run lint           # tsc --noEmit
npm test
npm run build
npm run dev            # http://localhost:4177
```

## Contract

- Schema: `schema/gold-contract.schema.json`
- Assumptions: `schema/SCHEMA_ASSUMPTIONS.md`
- Fixture: `public/gold/fixture.v1.json` (Canonical Gold fixture envelope with `fixture: true`; after `adaptGold()`, the internal UX model exposes `contract.kind = fixture`)

The UI reads a view model after `adaptGold()`. Evidence state and coverage are separate axes. This pinned producer schema validates its fixture envelope; any future production Gold contract generalization must first be versioned by the producer. Field-name drift from canonical M1.1 is mapped in `src/gold/adapter.ts`.
