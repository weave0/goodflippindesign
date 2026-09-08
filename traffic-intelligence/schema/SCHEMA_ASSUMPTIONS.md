# Gold 1.2 consumer — migration map

Canonical producer: `gfd-canonical-gold` **1.2.0** at measurement-engineering commit
`2a3bce3a7e5761a25a6412e6f7aab4fb781d7c40`.

Parser: `src/gold/parse-canonical.ts` (producer spellings only).
Aliases: `adaptLegacy()` only. They are not canonical fields.

## Canonical field → internal UX field

| Canonical Gold 1.2 | Internal UX |
|---|---|
| `schema_version` | `contract.version` |
| `contract_name` | `contract.name` |
| `fixture` | `contract.kind` (`true` → fixture) |
| `generated_at` | `contract.generatedAt` (not the observation window) |
| `pipeline_version` | `contract.pipelineVersion` |
| `metrics[].metric_id` | `metric.metric_id` / `metric.id` |
| `metrics[].metric_definition` | `metric.metric_definition` |
| `metrics[].evidence_state` | `metric.evidence_state` |
| `metrics[].exactness` | `metric.exactness` |
| `metrics[].coverage` (object) | `metric.coverage` (object retained) |
| `metrics[].observation.*` | `metric.observation` + `timeWindow` |
| `metrics[].sampling` | `metric.sampling` |
| `metrics[].confidence_interval` | `metric.confidence_interval` |
| `metrics[].ratio.numerator/denominator` | typed `{ reference_type, reference_id }` |
| `metrics[].classification` | `metric.classification` |
| `metrics[].provenance.method_id/version` | `metric.provenance` |
| `metrics[].semantics.unique_count_semantics` | uniqueness vocabulary |
| `topology` | `gold.topology` (Laboratory) |
| `source_support` | `gold.sourceSupport` (Laboratory) |

## Independent exactness

`evidence_state` is not exactness. `measured` + `exact` and `measured` + `inexact` both exist.
The adapter does **not** map `EXACT → measured + full_coverage` on the canonical path.

## Reader-only aliases (legacy documents)

See `CANONICAL_ALIASES_READER_ONLY` in `src/gold/adapter.ts`.

## Fixture files

- `public/gold/canonical-gold-m1.2.json` — byte-for-byte canonical contract fixture
- `public/gold/fixture.v1.json` — canonical envelope + `presentation.windows` for milestone screens
