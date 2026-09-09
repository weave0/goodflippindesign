import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseCanonicalGold12 } from "./parse-canonical";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/canonical-gold-m1.2.json");

function loadRaw(): Record<string, unknown> {
  return JSON.parse(readFileSync(fixturePath, "utf8")) as Record<string, unknown>;
}

function loadGold() {
  return parseCanonicalGold12(loadRaw());
}

describe("Canonical Gold 1.2 producer-consumer boundary", () => {
  it("consumes producer evidence, exactness, coverage, nulls, and lineage without recomputation", () => {
    const gold = loadGold();
    const metrics = new Map(gold.metrics.map((metric) => [metric.metric_id, metric]));

    expect(metrics.get("fixture.edge.requests")).toMatchObject({ evidence_state: "measured", exactness: "exact", value: 10 });
    expect(metrics.get("fixture.edge.non_exact_requests")).toMatchObject({ evidence_state: "measured", exactness: "inexact" });
    expect(metrics.get("fixture.rum.sampled")).toMatchObject({ evidence_state: "sampled", coverage: { state: "partial_coverage" } });
    expect(metrics.get("fixture.unavailable")).toMatchObject({ evidence_state: "unavailable", value: null });
    expect(metrics.get("fixture.unknowable_humans")).toMatchObject({ evidence_state: "unknowable", value: null });
    expect(metrics.get("fixture.invalid_ci")?.confidence_interval).toMatchObject({ valid: false, lower_bound: 30, upper_bound: 10 });
    expect(metrics.get("fixture.estimated")?.provenance).toMatchObject({ method_id: "fixture-estimator", method_version: "1.0.0" });

    const raw = loadRaw();
    const ratioRaw = (raw.metrics as Array<Record<string, unknown>>).find((metric) => metric.metric_id === "fixture.ratio");
    const ratio = metrics.get("fixture.ratio")?.ratio;
    expect(ratio).toEqual(ratioRaw?.ratio);
    expect(ratio?.numerator.reference_type).toBe("metric_id");
    expect(ratio?.denominator.reference_type).toBe("source_observation_id");
  });

  it("preserves request, classification, topology, source support, and generation boundaries", () => {
    const gold = loadGold();
    const metrics = new Map(gold.metrics.map((metric) => [metric.metric_id, metric]));
    const request = metrics.get("fixture.request.classification")!;
    const aiSearch = metrics.get("fixture.ai_search")!;

    expect(request.semantics.unique_count_semantics).toBe("not_unique_count");
    expect(request.classification).toMatchObject({ normalized_class: "UNKNOWN" });
    expect(aiSearch.classification).toMatchObject({ source_native_class: "AI Search", normalized_class: "AI_SEARCH" });
    expect(gold.topology.relationships.some((relation) => relation.relation === "alias_of")).toBe(true);
    expect(gold.topology.nodes.find((node) => node.node_type === "hostname" && node.label === "goodflippinvibes.com")?.visibility).toBe("dns_only");
    expect(gold.topology.nodes.find((node) => node.node_type === "hostname" && node.label === "gflippinv.com")?.visibility).toBe("proxied");
    expect(gold.topology.nodes.some((node) => node.node_type === "rum_site_tag")).toBe(true);
    expect(gold.topology.nodes.some((node) => node.node_type === "zone")).toBe(true);
    expect(gold.source_support.find((row) => row.dataset_id === "fixture.schema-only")).toMatchObject({
      dataset_in_schema: true,
      query_permitted: "false",
      data_returned: "false",
    });
    expect(gold.source_support.find((row) => row.dataset_id === "fixture.history-blocked")).toMatchObject({
      query_permitted: "true",
      requested_window_supported: "false",
      historical_retention_supported: "false",
    });
    expect(gold.generated_at).not.toBe(metrics.get("fixture.edge.requests")?.observation.extracted_at);
    expect(metrics.get("fixture.ecosystem_unique")?.semantics.unique_count_semantics).toBe("ecosystem_unique_deduplicated");
    expect(metrics.get("fixture.unknowable_humans")?.semantics.unique_count_semantics).toBe("ecosystem_human_unique_deduplicated");
  });

  it("accepts a measured zero without converting absence to zero", () => {
    const raw = loadRaw();
    const firstMetric = (raw.metrics as Array<Record<string, unknown>>)[0]!;
    firstMetric.value = 0;
    expect(parseCanonicalGold12(raw).metrics[0]).toMatchObject({ evidence_state: "measured", value: 0 });
  });

  it("rejects a request metric that claims human-unique semantics without identity lineage", () => {
    const raw = loadRaw();
    const firstMetric = (raw.metrics as Array<Record<string, unknown>>)[0]!;
    const semantics = firstMetric.semantics as Record<string, unknown>;
    semantics.unique_count_semantics = "ecosystem_human_unique_deduplicated";
    expect(() => parseCanonicalGold12(raw)).toThrow(/identity_transformation/);
  });
});
