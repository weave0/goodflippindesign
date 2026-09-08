# Gold-layer consumer contract — schema assumptions

This UI does **not** own the analytics pipeline. It consumes a Gold JSON
document whose field names, definitions and values are treated as canonical.

Until the pipeline referee publishes a frozen production contract, this
milestone implements a **consumer-side fixture contract**
(`gfd-traffic-intelligence-gold` v1.0.0, pipelineVersion `gold-fixture-0.1.0`).

## Kind

`contract.kind` is `"fixture"` for the bundled document. Production documents
must set `"production"` and a real `pipelineVersion`.

## Non-negotiable display rules encoded in the contract

- Every `Metric` has `source`, `status`, `grain`, `timeWindow`, `definitionId`,
  `pipelineVersion`.
- `source` is one of: `cloudflare_edge`, `cloudflare_rum`, `ga4`, `vercel`,
  `first_party`, `modeled`. Combined/blended sources are forbidden.
- `status` is one of: `EXACT`, `SAMPLED`, `ESTIMATED`, `INCOMPLETE`, `UNAVAILABLE`.
- `value` is `null` if and only if `status` is `UNAVAILABLE`.
- Definitions for visitor, user, session, pageview, human, bot, AI crawler,
  AI agent, threat, and confidence are opaque pipeline text. The UI copies
  them into the evidence drawer and never redefines them.
- Ratios (AI-to-human, cache hit, threat rate, sample factor) arrive
  precomputed. The UI formats; it does not calculate.
- Site rows are not a substitute for ecosystem overview metrics. Overview
  totals are pipeline-provided window rollups of a **single source**.

## Windows

The fixture ships two pipeline windows: `7d` and `28d`. Changing the date
control selects a precomputed window. The UI does not sum daily points to
rebuild a window total.

## Filtering

Filters select already-shaped slices (site record, actor record, ranked
list). If a slice is absent, the UI renders `UNAVAILABLE` / empty — it does
not interpolate.

## Geography

Edge, browser-confirmed, AI, and threat geographies are four separate lists
with captions. Edge country is request origin, not humans.

## What this fixture is not

- Not live Cloudflare / GA4 / Vercel data.
- Not a license to mix sources.
- Not a claim that modeled human-share is ground truth (it is `ESTIMATED`
  with limitations).
