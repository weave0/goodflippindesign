# GFD Estate Registry

This directory defines the inventory boundary used by human-facing GFD operator products.

## Why this exists

GFD previously had two incompatible ideas of "the estate":

- `brands.json` described public brands and internal projects.
- Traffic Intelligence governed a separate Cloudflare zone list.

That allowed both systems to be internally correct while a human operator still saw missing sites.

`estate/registry.json` is the reconciliation layer. It is intentionally allowed to say **unclassified**. It is not allowed to silently omit a governed property.

## Rules

1. Every zone in the Traffic Intelligence governed zone set must appear exactly once.
2. Every public brand domain in `brands.json` must appear.
3. A brand mapping is only asserted when the registry can prove it from a current authority.
4. Unknown aliases, redirects, parked domains, products, and experiments stay visible as `unclassified` until classified.
5. `unclassified`, missing analytics, and unavailable evidence are not "healthy" states.
6. Admin, Traffic Intelligence, health monitoring, and future operator surfaces should converge on this registry rather than maintaining private property lists.

Run:

```bash
npm run estate:validate
```

The validator fails on inventory drift, duplicate properties, missing public-brand domains, or unsupported brand mappings.
