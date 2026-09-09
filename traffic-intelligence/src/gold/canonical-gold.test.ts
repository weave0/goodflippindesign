import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptGold, CANONICAL_ALIASES_READER_ONLY, gold12ToViewMetric } from "./adapter";
import { formatMetric, neverRecomputeRatio } from "./format";
import { CanonicalParseError, parseCanonicalGold12, usedCanonicalField } from "./parse-canonical";
import { sumOrNull } from "./null-arith";

const CANONICAL_SHA = "2a3bce3a7e5761a25a6412e6f7aab4fb781d7c40";
const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/canonical-gold-m1.2.json");

function loadRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

describe(`Canonical Gold 1.2 consumer (${CANONICAL_SHA})`, () => {
  const raw = loadRaw();
  const canonical = parseCanonicalGold12(raw);
  const adapted = adaptGold(raw);
  const byId = Object.fromEntries(canonical.metrics.map((m) => [m.metric_id, m]));

  it("1. canonical Gold 1.2 parses directly", () => {
    expect(canonical.schema_version).toBe("1.2.0");
    expect(canonical.contract_name).toBe("gfd-canonical-gold");
    expect(canonical.metrics.length).toBeGreaterThan(0);
  });

  it("2. canonical field names require no speculative alias", () => {
    const metric = (raw.metrics as Record<string, unknown>[])[0]!;
    expect(usedCanonicalField(metric, "evidence_state", ["evidenceState", "status", "measurementState"])).toBe("canonical");
    expect(usedCanonicalField(metric, "exactness", [])).toBe("canonical");
    expect(usedCanonicalField(metric, "confidence_interval", ["confidence", "ci"])).toBe("missing");
    expect(metric.evidenceState).toBeUndefined();
    expect(metric.status).toBeUndefined();
  });

  it("3. evidence, exactness, and coverage survive independently", () => {
    expect(byId["fixture.edge.requests"]?.evidence_state).toBe("measured");
    expect(byId["fixture.edge.requests"]?.exactness).toBe("exact");
    expect(byId["fixture.edge.non_exact_requests"]?.evidence_state).toBe("measured");
    expect(byId["fixture.edge.non_exact_requests"]?.exactness).toBe("inexact");
    expect(byId["fixture.rum.sampled"]?.coverage.state).toBe("partial_coverage");
    expect(byId["fixture.rum.sampled"]?.evidence_state).toBe("sampled");
  });

  it("4. measured exact survives", () => {
    expect(byId["fixture.edge.requests"]?.evidence_state).toBe("measured");
    expect(byId["fixture.edge.requests"]?.exactness).toBe("exact");
    expect(byId["fixture.edge.requests"]?.value).toBe(10);
  });

  it("5. measured inexact survives", () => {
    expect(byId["fixture.edge.non_exact_requests"]?.evidence_state).toBe("measured");
    expect(byId["fixture.edge.non_exact_requests"]?.exactness).toBe("inexact");
    expect(byId["fixture.edge.non_exact_requests"]?.value).toBe(11);
  });

  it("6. sampled semantics survive", () => {
    const rum = byId["fixture.rum.sampled"]!;
    expect(rum.evidence_state).toBe("sampled");
    expect(rum.sampling?.factor).toBe(4);
    expect(rum.sampling?.meaning).toMatch(/sampled interval/i);
  });

  it("7. unavailable null survives", () => {
    expect(byId["fixture.unavailable"]?.evidence_state).toBe("unavailable");
    expect(byId["fixture.unavailable"]?.value).toBeNull();
    expect(formatMetric(gold12ToViewMetric(byId["fixture.unavailable"]!, canonical.pipeline_version))).not.toBe("0");
  });

  it("8. unknowable null survives", () => {
    expect(byId["fixture.unknowable_humans"]?.evidence_state).toBe("unknowable");
    expect(byId["fixture.unknowable_humans"]?.value).toBeNull();
    expect(formatMetric(gold12ToViewMetric(byId["fixture.unknowable_humans"]!, canonical.pipeline_version))).not.toBe("0");
  });

  it("9. invalid confidence bounds survive", () => {
    const ci = byId["fixture.invalid_ci"]?.confidence_interval;
    expect(ci?.valid).toBe(false);
    expect(ci?.lower_bound).toBe(30);
    expect(ci?.upper_bound).toBe(10);
    expect(ci?.level).toBe(0.95);
  });

  it("10. typed ratio references survive", () => {
    const ratio = byId["fixture.ratio"]?.ratio;
    expect(ratio?.numerator.reference_type).toBe("metric_id");
    expect(ratio?.numerator.reference_id).toBe("fixture.ratio.denominator");
    expect(ratio?.denominator.reference_type).toBe("source_observation_id");
    expect(ratio?.denominator.reference_id).toBe("obs.fixture.ratio.denominator");
  });

  it("11. ratio is not recomputed by UI", () => {
    const view = gold12ToViewMetric(byId["fixture.ratio"]!, canonical.pipeline_version);
    expect(neverRecomputeRatio(view)).toBe(0.5);
    expect(view.ratio && "authoritative" in view.ratio ? view.ratio.authoritative : true).toBe(true);
  });

  it("12. request metric cannot become ecosystem-human unique", () => {
    const request = byId["fixture.edge.requests"]!;
    expect(request.semantics.source_boundary).toBe("request");
    expect(request.semantics.unique_count_semantics).toBe("not_unique_count");
    const forged = structuredClone(raw);
    (forged.metrics as Record<string, unknown>[])[0]!.semantics = {
      ...request.semantics,
      unique_count_semantics: "ecosystem_human_unique_deduplicated",
    };
    expect(() => parseCanonicalGold12(forged)).toThrow(CanonicalParseError);
  });

  it("13. topology aliases remain relationships, not audience totals", () => {
    const alias = canonical.topology.relationships.find((r) => r.relation === "alias_of");
    expect(alias).toBeTruthy();
    expect(canonical.topology.nodes.some((n) => n.node_type === "hostname")).toBe(true);
    expect(adapted.windows[adapted.defaultWindowId]?.sites.every((s) => /not an audience/i.test(s.measurementHealthNote) || s.metrics.length === 0)).toBe(true);
  });

  it("14. DNS-only/proxied visibility survives", () => {
    const dns = canonical.topology.nodes.find((n) => n.node_id === "host.gfv.main");
    const proxied = canonical.topology.nodes.find((n) => n.node_id === "host.gfv.alias");
    expect(dns?.visibility).toBe("dns_only");
    expect(proxied?.visibility).toBe("proxied");
  });

  it("15. RUM identity remains distinct from zone identity", () => {
    expect(canonical.topology.nodes.some((n) => n.node_type === "rum_site_tag")).toBe(true);
    expect(canonical.topology.nodes.some((n) => n.node_type === "zone")).toBe(true);
    expect(canonical.topology.relationships.some((r) => r.relation === "tag_for")).toBe(true);
    expect(canonical.topology.relationships.some((r) => r.relation === "associated_zone")).toBe(true);
  });

  it("16. source-support states remain independent", () => {
    const schemaOnly = canonical.source_support.find((s) => s.dataset_id === "fixture.schema-only")!;
    expect(schemaOnly.dataset_in_schema).toBe(true);
    expect(schemaOnly.query_permitted).toBe("false");
    expect(schemaOnly.data_returned).toBe("false");
    const history = canonical.source_support.find((s) => s.dataset_id === "fixture.history-blocked")!;
    expect(history.query_permitted).toBe("true");
    expect(history.requested_window_supported).toBe("false");
    expect(history.historical_retention_supported).toBe("false");
  });

  it("17. native + normalized AI classifications survive", () => {
    const cls = byId["fixture.ai_search"]?.classification;
    expect(cls?.source_native_class).toBe("AI Search");
    expect(cls?.normalized_class).toBe("AI_SEARCH");
  });

  it("18. UNKNOWN survives", () => {
    expect(byId["fixture.request.classification"]?.classification?.normalized_class).toBe("UNKNOWN");
  });

  it("19. method lineage survives", () => {
    const est = byId["fixture.estimated"]!;
    expect(est.provenance.method_id).toBe("fixture-estimator");
    expect(est.provenance.method_version).toBe("1.0.0");
    expect(est.provenance.source_metrics).toContain("fixture.edge.requests");
  });

  it("20. generated_at differs from observation/extraction time", () => {
    expect(canonical.generated_at).toBe("2026-09-08T15:00:00Z");
    expect(canonical.metrics[0]?.observation.extracted_at).toBe("2026-09-08T12:00:00Z");
    expect(canonical.generated_at).not.toBe(canonical.metrics[0]?.observation.extracted_at);
    expect(canonical.generated_at).not.toBe(canonical.metrics[0]?.observation.start);
    expect(adapted.contract.generatedAt).toBe(canonical.generated_at);
  });

  it("21. ecosystem deduplicated unique differs from ecosystem human unique", () => {
    expect(byId["fixture.ecosystem_unique"]?.semantics.unique_count_semantics).toBe("ecosystem_unique_deduplicated");
    expect(byId["fixture.unknowable_humans"]?.semantics.unique_count_semantics).toBe("ecosystem_human_unique_deduplicated");
    expect(byId["fixture.ecosystem_unique"]?.value).toBe(4);
    expect(byId["fixture.unknowable_humans"]?.value).toBeNull();
  });

  it("22. null input cannot silently become scientific zero", () => {
    expect(sumOrNull([1, null, 2])).toBeNull();
    expect(sumOrNull([1, 2])).toBe(3);
    expect(sumOrNull([])).toBeNull();
    expect(CANONICAL_ALIASES_READER_ONLY.length).toBeGreaterThan(0);
  });
});
