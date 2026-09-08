import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptGold } from "./adapter";
import { assertGoldContract, collectMetrics } from "./assert";
import { formatMetric } from "./format";
import {
  absentDoesNotRenderZero,
  coverageIndependentOfEvidence,
  fixtureModeIdentifiable,
  inferredDistinctFromEstimated,
  invalidCiPreserved,
  nativeAiClassesSurvive,
  neverDeriveEcosystemFromSources,
  overviewNotSumOfSitesOrCrossSource,
  ratioSemanticsSurvive,
  unknownClassVisible,
  zoneUniquesAreNotEcosystemHumans,
} from "./invariants";
import { selectWindow } from "./select";
import type { GoldContract, Metric } from "./types";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/fixture.v1.json");

function load(): GoldContract {
  const adapted = adaptGold(JSON.parse(readFileSync(fixturePath, "utf8")) as unknown);
  assertGoldContract(adapted);
  return adapted;
}

describe("scientific contract invariants", () => {
  const gold = load();
  const metrics = collectMetrics(gold);

  it("1. UNAVAILABLE does not become zero", () => {
    const unavailable = metrics.filter((m) => m.evidenceState === "UNAVAILABLE");
    expect(unavailable.length).toBeGreaterThan(0);
    for (const metric of unavailable) {
      expect(metric.value).toBeNull();
      expect(absentDoesNotRenderZero(metric)).toBe(true);
      expect(formatMetric(metric)).not.toBe("0");
    }
  });

  it("2. UNKNOWABLE does not become zero", () => {
    const unknowable = metrics.filter((m) => m.evidenceState === "UNKNOWABLE");
    expect(unknowable.length).toBeGreaterThan(0);
    for (const metric of unknowable) {
      expect(metric.value).toBeNull();
      expect(absentDoesNotRenderZero(metric)).toBe(true);
      expect(formatMetric(metric)).not.toBe("0");
    }
  });

  it("3. INFERRED is distinct from ESTIMATED", () => {
    expect(inferredDistinctFromEstimated(metrics)).toBe(true);
    expect(metrics.some((m) => m.evidenceState === "INFERRED")).toBe(true);
    expect(metrics.some((m) => m.evidenceState === "ESTIMATED")).toBe(true);
  });

  it("4. coverage/incomplete is separate from evidence state", () => {
    expect(coverageIndependentOfEvidence(metrics)).toBe(true);
    expect(metrics.some((m) => m.coverage === "INCOMPLETE" && m.evidenceState === "MEASURED")).toBe(true);
    expect(metrics.every((m) => m.evidenceState !== ("INCOMPLETE" as Metric["evidenceState"]))).toBe(true);
  });

  it("5. UNKNOWN machine/human classification remains visible", () => {
    expect(unknownClassVisible(gold)).toBe(true);
    const unknown = selectWindow(gold, "28d").taxonomy.find((row) => row.normalizedClass === "unknown");
    expect(unknown?.label).toBe("UNKNOWN");
    expect(unknown?.value).toBeGreaterThan(0);
  });

  it("6. source-native AI Search/AI Assistant/AI Crawler survive normalization", () => {
    expect(nativeAiClassesSurvive(gold)).toBe(true);
    const classes = selectWindow(gold, "28d").ai.classTotals;
    expect(classes.map((c) => c.sourceNativeClass)).toEqual(
      expect.arrayContaining(["AI Crawler", "AI Search", "AI Assistant"]),
    );
    expect(classes.map((c) => c.normalizedClass)).toEqual(
      expect.arrayContaining(["ai_crawler", "ai_search", "ai_assistant"]),
    );
  });

  it("7. invalid confidence interval retains bounds and validity=false", () => {
    const example = metrics.find((m) => m.id === "lab.invalid_ci_example") ?? metrics.find((m) => m.id === "lab.invalid_ci_ref");
    expect(invalidCiPreserved(example)).toBe(true);
    expect(example?.sampling?.interval).toBe(100);
    expect(example?.confidence?.level).toBe(0.95);
  });

  it("8. site unique counts cannot become ecosystem unique humans", () => {
    expect(zoneUniquesAreNotEcosystemHumans(gold)).toBe(true);
    const sum = metrics.find((m) => m.uniqueSemantics === "sum_of_zone_uniques");
    expect(sum).toBeTruthy();
    expect(/ecosystem unique humans/i.test(sum!.label)).toBe(false);
    const dedup = metrics.find((m) => m.uniqueSemantics === "deduplicated_ecosystem_unique");
    expect(dedup?.evidenceState).toBe("UNKNOWABLE");
    expect(dedup?.value).toBeNull();
  });

  it("9. cross-source values are not added into an ecosystem metric", () => {
    expect(overviewNotSumOfSitesOrCrossSource(gold)).toBe(true);
    expect(neverDeriveEcosystemFromSources(metrics)).toBe(true);
  });

  it("10. ratio numeric semantics survive the consumer mapping", () => {
    const rate = metrics.find((m) => m.id === "health.threat_rate");
    expect(ratioSemanticsSurvive(rate)).toBe(true);
    expect(rate?.ratio?.authoritative).toBe(true);
  });

  it("11. fixture mode remains identifiable", () => {
    expect(fixtureModeIdentifiable(gold)).toBe(true);
    expect(gold.contract.kind).toBe("fixture");
  });

  it("adapter maps legacy EXACT status without inventing values", () => {
    const adapted = adaptGold({
      contract: gold.contract,
      definitions: gold.definitions,
      sources: gold.sources,
      defaultWindowId: "28d",
      windows: {
        "28d": {
          window: selectWindow(gold, "28d").window,
          overview: {
            metrics: [
              {
                id: "legacy.edge",
                label: "Edge requests",
                value: 10,
                source: "cloudflare_edge",
                grain: "request",
                status: "EXACT",
                timeWindow: { id: "28d", start: "2026-08-12", end: "2026-09-08" },
                definitionId: "def.edge_request",
                pipelineVersion: "gold-fixture-0.2.0",
              },
            ],
            anomalies: [],
            opportunities: [],
            health: [],
          },
          series: [],
          taxonomy: [],
          humans: selectWindow(gold, "28d").humans,
          ai: selectWindow(gold, "28d").ai,
          automation: [],
          sites: [],
          content: selectWindow(gold, "28d").content,
          technology: selectWindow(gold, "28d").technology,
          geography: selectWindow(gold, "28d").geography,
          laboratory: selectWindow(gold, "28d").laboratory,
          anomalies: [],
          health: { metrics: [], errors: [], paths: [], sites: [] },
        },
      },
    });
    const metric = adapted.windows["28d"]?.overview.metrics[0];
    expect(metric?.evidenceState).toBe("MEASURED");
    expect(metric?.coverage).toBe("COMPLETE");
    expect(metric?.value).toBe(10);
    expect((metric as { status?: string } | undefined)?.status).toBeUndefined();
  });
});
