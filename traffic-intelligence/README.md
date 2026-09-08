# GFD Traffic Intelligence

Observatory UI for the GFD ecosystem. It is a **Gold-layer consumer**.

It does not talk to Cloudflare, GA4, or Vercel. It does not invent visitor, user, session, pageview, human, bot, AI crawler, AI agent, threat, or confidence. It does not sum overlapping sources into a vanity “visitors” number.

## First milestone

Application shell, global filters, overview, sites, humans vs machines, AI actors, measurement laboratory, technical health, evidence drawer, responsive layout, fixture schema, fast tests.

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
- Fixture: `public/gold/fixture.v1.json` (`contract.kind = fixture`)

Production Gold documents should keep the same envelope (`Metric.source`, `Metric.status`, `definitions[]`) and set `contract.kind` to `production`.
