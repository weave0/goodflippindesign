import { adaptGold } from "./adapter";
import { selectWindow, windowIsAvailable } from "./select";

function metric(days: 7 | 28 | 90, start: string, value: number) {
  return {
    metric_id: `cloudflare.example.com.${days}d.requests`,
    label: "HTTP requests",
    metric_definition: "Cloudflare requests summed from verified daily observations for one zone.",
    source: "cloudflare",
    semantics: {
      semantic_type: "count",
      population_scope: "Cloudflare zone example.com request observations",
      aggregation_semantics: "sum of source-native daily values for one zone only",
      unique_count_semantics: "not_unique_count",
      source_boundary: "cloudflare_zone",
    },
    evidence_state: "measured",
    exactness: "unknown",
    value,
    unit: "requests",
    coverage: {
      state: "full_coverage",
      observed_fraction: 1,
    },
    observation: {
      start,
      end: "2026-09-10T00:00:00Z",
      timezone: "UTC",
      boundary: "half_open",
      partial_current_period: false,
      extracted_at: "2026-09-10T01:00:00Z",
      source_observation_id: `cloudflare.example.com.${days}d`,
    },
    provenance: {
      source_metrics: ["requests"],
      source_snapshots: [`snapshot-${days}`],
      limitations: ["This is not a visitor or human count."],
    },
  };
}

function rawGold() {
  return {
    schema_version: "1.2.0",
    contract_name: "gfd-canonical-gold",
    fixture: false,
    generated_at: "2026-09-10T01:00:00Z",
    pipeline_version: "temporal-window-test",
    metrics: [
      metric(7, "2026-09-03T00:00:00Z", 70),
      metric(28, "2026-08-13T00:00:00Z", 280),
      metric(90, "2026-06-12T00:00:00Z", 900),
    ],
    topology: { nodes: [], relationships: [] },
    source_support: [],
  };
}

describe("Canonical Gold temporal selection", () => {
  it("exposes real 7d, 28d, and 90d ranges from metric observation spans", () => {
    const gold = adaptGold(rawGold());

    expect(windowIsAvailable(gold, "7d")).toBe(true);
    expect(windowIsAvailable(gold, "28d")).toBe(true);
    expect(windowIsAvailable(gold, "90d")).toBe(true);
  });

  it("changes the analytical payload instead of relabeling a mixed canonical window", () => {
    const gold = adaptGold(rawGold());
    const seven = selectWindow(gold, "7d");
    const twentyEight = selectWindow(gold, "28d");
    const ninety = selectWindow(gold, "90d");

    expect(seven.window).toMatchObject({
      id: "7d",
      start: "2026-09-03T00:00:00Z",
      end: "2026-09-10T00:00:00Z",
    });
    expect(twentyEight.window).toMatchObject({
      id: "28d",
      start: "2026-08-13T00:00:00Z",
      end: "2026-09-10T00:00:00Z",
    });
    expect(ninety.window).toMatchObject({
      id: "90d",
      start: "2026-06-12T00:00:00Z",
      end: "2026-09-10T00:00:00Z",
    });

    expect(seven.overview.metrics.map((item) => item.metric_id)).toEqual(["cloudflare.example.com.7d.requests"]);
    expect(twentyEight.overview.metrics.map((item) => item.metric_id)).toEqual(["cloudflare.example.com.28d.requests"]);
    expect(ninety.overview.metrics.map((item) => item.metric_id)).toEqual(["cloudflare.example.com.90d.requests"]);
    expect(seven.overview.metrics[0]?.value).toBe(70);
    expect(twentyEight.overview.metrics[0]?.value).toBe(280);
    expect(ninety.overview.metrics[0]?.value).toBe(900);
  });

  it("does not advertise a range that the governed metrics do not support", () => {
    const raw = rawGold();
    raw.metrics = raw.metrics.filter((item) => !item.metric_id.includes(".90d."));
    const gold = adaptGold(raw);

    expect(windowIsAvailable(gold, "90d")).toBe(false);
    expect(selectWindow(gold, "90d").window.id).toBe("canonical");
  });
});
