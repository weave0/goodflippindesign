# Gold-layer consumer contract — schema assumptions

This UI does **not** own the analytics pipeline. It consumes a Gold JSON
document through a single adapter (`src/gold/adapter.ts`) into a view model
(`src/gold/types.ts`). Canonical M1.1 field names from the
measurement-engineering repository may differ; map them in the adapter.

Until that contract is frozen, this milestone implements consumer fixture
contract `gfd-traffic-intelligence-gold` **1.1.0-consumer**,
pipelineVersion `gold-fixture-0.2.0`.

## Kind / dataset mode

`contract.kind` is `"fixture"` for the bundled document. The shell shows a
fixture-dataset indicator. Production documents must set `"production"`.

## Evidence vs coverage

These are separate axes. Do not collapse them into one badge.

**Evidence state:** `MEASURED | SAMPLED | INFERRED | ESTIMATED | UNAVAILABLE | UNKNOWABLE`

**Coverage state:** `COMPLETE | INCOMPLETE | MISSING | NOT_APPLICABLE`

`INCOMPLETE` is coverage, not evidence.

The adapter maps a legacy overloaded `status` (`EXACT`, `SAMPLED`,
`ESTIMATED`, `INCOMPLETE`, `UNAVAILABLE`) if a document still uses it.

## Missing evidence

`value` is `null` when evidence is `UNAVAILABLE` or `UNKNOWABLE`.
The UI never renders `0` for those states.

## Confidence and sampling

Sampling is `{ interval, intervalMeaning, factor, factorMeaning }`.

Confidence is `{ level, intervalValid, lower, upper, note }`.
Invalid intervals retain bounds and `intervalValid: false`.

## Unique-user semantics

`uniqueSemantics` is one of:

- `source_native_zone_unique`
- `sum_of_zone_uniques`
- `deduplicated_ecosystem_unique`
- `not_unique`

A deduplicated ecosystem-human figure must be pipeline-provided with that
semantics. The UI never calculates it. Sum of zone uniques is not ecosystem
unique humans.

## Classification

Ranked/AI rows may carry both:

- `sourceNativeClass` (e.g. Cloudflare `AI Crawler`, `AI Search`, `AI Assistant`)
- `normalizedClass` (GFD taxonomy, including `unknown`)

UNKNOWN is first-class. A browser-like UA is not proof of a human.

## Ratios

Ratios preserve numeric `value`, `unit`, numerator/denominator refs, and a
pipeline `display`. `authoritative: true` means the UI must not recompute.

## Provenance

Modeled / inferred / estimated metrics may carry `modelId`, `modelVersion`,
`method`, contributing sources and metric ids, plus limitations and confidence.

## Windows

Presets `7d` and `28d`. Metadata: start, end, timezone, boundary,
extractedAt, generatedAt, `partialCurrentPeriod`. The UI does not label a
window “current” merely because it is open.

## Geography

Four lists with explicit location meaning (Cloudflare request country,
RUM/GA4-observed geography, AI request country, threat request country).
Not audience demographics.

## Non-additivity

The UI never derives an ecosystem total by arithmetic over Cloudflare, RUM,
GA4, Vercel, or first-party values. Source disagreement belongs in the
Measurement Laboratory.
