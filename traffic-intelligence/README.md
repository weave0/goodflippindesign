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


## TI-009 work funnel

Meaningful insights become GitHub work items in `weave0/goodflippindesign` (central queue), deduped by `action_id`, with a measured verification loop.

- Docs: [`docs/ti-work-funnel.md`](docs/ti-work-funnel.md)
- Work queue sidecar: `public/gold/ti-work-queue-1.0.json` (fixture in PRs; live inject on deploy)
- Sync: `npm run sync:work -- --insights <path> --out public/gold/ti-work-queue-1.0.json`

## Gold access: administrators and the Mission Control feed

`public/_worker.js` gates `/gold/*` with two independent paths:

| Caller | Credential | Reach |
|---|---|---|
| Human administrator | Clerk session (`Authorization: Bearer <session JWT>`), verified against `/api/profile` and the admin allow-list | All of `/gold/*`, plus `/api/admin-session` |
| Mission Control collector | `MISSION_CONTROL_FEED_TOKEN` (an `mcf_…` application secret, **not** a Cloudflare token) | `GET`/`HEAD` of `canonical-gold-m1.2.json` and `traffic-insights-1.0.json` only |

The feed token is not an admin identity: it never reaches the profile lookup, never passes `/api/admin-session`, is compared by SHA-256 digest (timing-safe), and the worker fails closed when the secret is unset or weak. Responses stay `private, no-store, noindex`.

The deploy workflow owns the secret end to end: the GitHub Actions secret `MISSION_CONTROL_FEED_TOKEN` is bound to the Pages project (`wrangler pages secret put`, using the existing Pages deploy authority) before each deploy and the live deployment is then probed for least privilege. The same value is the GlobalDeets Actions secret `MISSION_CONTROL_GOLD_TOKEN`. To rotate, set both secrets to a new `mcf_` + 43 base64url characters and re-run the deploy; nothing in Cloudflare needs to be edited by hand.
