# GFD Traffic Intelligence

Human-first, administrator-only Traffic Intelligence for the GFD ecosystem. The application is a **Gold-layer consumer**: it renders certified producer output and does not query Cloudflare, GA4, or Vercel from browser code.

It does not invent visitor, user, session, pageview, human, bot, AI crawler, AI agent, threat, or confidence values. It does not sum overlapping sources into a synthetic “visitors” number.

## Production surface

Production is `https://traffic.goodflippindesign.com`, deployed as the isolated Cloudflare Pages project `gfd-traffic-intelligence`.

The deployment workflow:

1. checks out the private `weave0/gfd-traffic-intelligence` producer with the read-only `GFD_TI_READ_TOKEN`;
2. runs the producer's read-only Cloudflare acquisition using the existing Cloudflare Actions credential;
3. validates Canonical Gold 1.2, `fixture: false`, non-empty metrics, and freshness;
4. injects the validated document only into the ephemeral runner workspace;
5. builds and deploys the authenticated Pages application; and
6. verifies the deployed shell and admin wall.

The live Gold document is never committed to this public repository. The deployment refreshes daily at 02:17 UTC, on relevant pushes to `main`, and by manual dispatch.

Current source coverage is Cloudflare. GA4 and Vercel remain unavailable until governed producer adapters and credentials are added. Canonical Gold 1.2 currently supplies metrics, topology, and source-support evidence; governed anomaly, opportunity, and time-series findings are a separate producer-contract tranche and must not be improvised in the consumer.

## Commands

```bash
cd traffic-intelligence
npm install
npm run emit-fixture
npm run lint
npm test
npm run build
npm run dev
```

Local development and consumer tests use the explicit fixture. Production deployment replaces it only after producer validation passes.

## Contract

- Schema: `schema/gold-contract.schema.json`
- Assumptions: `schema/SCHEMA_ASSUMPTIONS.md`
- Local fixture: `public/gold/fixture.v1.json`
- Production input: private producer output `reports/cloudflare/canonical-gold-1.2.production.json`

The UI reads a view model after `adaptGold()`. Evidence state and coverage are separate axes. Field-name drift from Canonical Gold 1.2 is mapped at the consumer boundary and fails closed when the contract is invalid.
