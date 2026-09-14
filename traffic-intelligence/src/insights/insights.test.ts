import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertTrafficInsights } from "./assert";
import {
  estateBriefOf,
  focusedTrendSeries,
  insightTrendSeries,
  matchesProperty,
  materialityScore,
  partitionFindings,
  prioritizedActions,
  propertyHealthRows,
  rankedBriefs,
  rankedTrendChanges,
} from "./select";
import type { OperationalBrief, TrafficInsightDocument } from "./types";
import type { WindowPayload } from "../gold/types";
import { normalizeInsightsForTest } from "./load.test-helpers";

const fixtureRaw = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/traffic-insights-1.0.json"), "utf8"),
) as TrafficInsightDocument;

assertTrafficInsights(fixtureRaw);
const fixture = normalizeInsightsForTest(fixtureRaw);

const window7 = {
  window: {
    id: "7d",
    label: "7 days",
    start: "2026-09-03T00:00:00Z",
    end: "2026-09-10T00:00:00Z",
    grain: "day",
    timezone: "UTC",
    boundary: "half_open",
    extractedAt: "2026-09-10T01:00:00Z",
    generatedAt: "2026-09-10T01:00:00Z",
    partialCurrentPeriod: false,
  },
} as WindowPayload;

const window28 = {
  window: {
    id: "28d",
    label: "28 days",
    start: "2026-08-13T00:00:00Z",
    end: "2026-09-10T00:00:00Z",
    grain: "day",
    timezone: "UTC",
    boundary: "half_open",
    extractedAt: "2026-09-10T01:00:00Z",
    generatedAt: "2026-09-10T01:00:00Z",
    partialCurrentPeriod: false,
  },
} as WindowPayload;

const window90 = {
  window: {
    id: "90d",
    label: "90 days",
    start: "2026-06-12T00:00:00Z",
    end: "2026-09-10T00:00:00Z",
    grain: "day",
    timezone: "UTC",
    boundary: "half_open",
    extractedAt: "2026-09-10T01:00:00Z",
    generatedAt: "2026-09-10T01:00:00Z",
    partialCurrentPeriod: false,
  },
} as WindowPayload;

describe("governed traffic insights", () => {
  it("accepts the 1.1 fixture sidecar contract with briefs, estate_brief, and trend_comparisons", () => {
    assertTrafficInsights(fixtureRaw);
    expect(fixture.fixture).toBe(true);
    expect(fixture.contract_name).toBe("gfd-traffic-insights");
    expect(fixture.schema_version).toBe("1.1.0");
    expect(fixture.briefs.length).toBeGreaterThan(0);
    expect(fixture.estate_brief?.status).toBe("attention_required");
    expect(fixture.property_health.length).toBeGreaterThan(0);
    expect(fixture.trend_comparisons.length).toBeGreaterThan(0);
  });

  it("accepts legacy schema 1.0.0 without requiring briefs", () => {
    const legacy = {
      ...fixtureRaw,
      schema_version: "1.0.0",
      briefs: undefined,
      estate_brief: undefined,
      property_health: undefined,
      trend_comparisons: undefined,
    };
    assertTrafficInsights(legacy);
  });

  it("rejects the wrong contract instead of inventing findings", () => {
    expect(() => assertTrafficInsights({ ...fixtureRaw, contract_name: "not-insights" })).toThrow(/contract_name/);
  });

  it("rejects schema 1.1.0 when estate_brief is missing (fail closed)", () => {
    expect(() =>
      assertTrafficInsights({
        ...fixtureRaw,
        schema_version: "1.1.0",
        estate_brief: null,
      }),
    ).toThrow(/estate_brief/);
  });

  it("rejects malformed estate_brief / briefs / trend_comparisons (fail closed)", () => {
    expect(() =>
      assertTrafficInsights({
        ...fixtureRaw,
        estate_brief: {},
      }),
    ).toThrow(/estate_brief/);
    expect(() =>
      assertTrafficInsights({
        ...fixtureRaw,
        briefs: [{ brief_id: "x" }],
      }),
    ).toThrow(/briefs\[0\]/);
    expect(() =>
      assertTrafficInsights({
        ...fixtureRaw,
        trend_comparisons: [{ property_id: "example.com", available: true }],
      }),
    ).toThrow(/trend_comparisons\[0\]/);
  });

  it("partitions producer findings into mission-control queues", () => {
    const queues = partitionFindings(fixture, null);
    expect(queues.needsAttention.map((f) => f.kind).sort()).toEqual(["issue", "issue"]);
    expect(queues.momentum.map((f) => f.kind).sort()).toEqual(["success"]);
    expect(queues.gaps.map((f) => f.kind)).toEqual(["data_gap"]);
  });

  it("sorts actions by categorical priority_class without browser invention", () => {
    const actions = prioritizedActions(fixture, null);
    expect(actions.map((a) => a.priority_class)).toEqual(["act_now", "act_now", "investigate"]);
    expect(actions.every((a) => Number.isInteger(a.priority) && a.priority >= 1 && a.priority <= 5)).toBe(true);
  });

  it("ranks briefs with Act now + Investigate by default", () => {
    const briefs = rankedBriefs(fixture, null);
    expect(briefs.every((b) => b.priority === "act_now" || b.priority === "investigate")).toBe(true);
    expect(briefs[0]?.priority).toBe("act_now");
  });

  it("exposes estate brief and property health from the producer sidecar", () => {
    expect(estateBriefOf(fixture)?.properties_to_inspect).toContain("example.com");
    expect(propertyHealthRows(fixture, null).map((r) => r.property_id).sort()).toEqual([
      "example.com",
      "shop.example.com",
    ]);
  });

  it("slices daily series to the active reporting window and never plots uniques", () => {
    const requests = insightTrendSeries(fixture, window28, null, "requests");
    expect(requests.length).toBe(2);
    expect(requests[0]?.points.length).toBe(28);
    expect(insightTrendSeries(fixture, window28, null, "uniques")).toEqual([]);
  });

  it("uses exact property match so shop.example.com does not leak example.com", () => {
    expect(matchesProperty("example.com", "shop.example.com")).toBe(false);
    expect(matchesProperty("shop.example.com", "example.com")).toBe(false);
    expect(matchesProperty("shop.example.com", "shop.example.com")).toBe(true);
    const focused = focusedTrendSeries(fixture, window28, "shop.example.com", "requests");
    expect(focused).toHaveLength(1);
    expect(focused[0]?.id).toContain("shop.example.com");
    const parentSeriesId = fixture.series.find(
      (s) => s.property_id === "example.com" && s.metric_name === "requests",
    )?.series_id;
    expect(focused[0]?.id).not.toBe(parentSeriesId);
  });

  it("does not add requests + pageviews into one materiality score", () => {
    const brief = {
      materiality: {
        absolute_delta_requests: 100,
        absolute_delta_pageviews: 9999,
        percent_delta: 0.5,
      },
    } as OperationalBrief;
    expect(materialityScore(brief)).toBe(100);
  });

  it("shop brief references a shop-scoped finding, not example.com", () => {
    const shopBrief = fixture.briefs.find((b) => b.brief_id === "brief.shop.example.com.traffic.drop");
    expect(shopBrief?.finding_ids).toEqual(["cloudflare.shop.example.com.7d.requests.movement"]);
    const finding = fixture.findings.find((f) => f.finding_id === shopBrief!.finding_ids[0]);
    expect(finding?.property_id).toBe("shop.example.com");
  });
});

describe("producer trend_comparisons authority", () => {
  it("removes browser half-split analytics (no Math.floor mid-point comparison path)", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "./select.ts"), "utf8");
    expect(source).not.toMatch(/Math\.floor\s*\(\s*.*length\s*\/\s*2/);
    expect(source).not.toMatch(/priorPts|currentPts/);
    expect(source).toMatch(/trend_comparisons/);
  });

  it("7d unequal-halves attack: seven observation points never become a 3-vs-4 browser comparison", () => {
    const sevenPointDoc: TrafficInsightDocument = {
      ...fixture,
      series: fixture.series.map((series) => ({
        ...series,
        points: series.points.slice(-7),
      })),
    };
    const rows = rankedTrendChanges(sevenPointDoc, window7, "requests", null, 8);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const producer = fixture.trend_comparisons.find(
        (tc) =>
          tc.property_id === row.property_id &&
          tc.metric_name === "requests" &&
          tc.period_days === 7,
      );
      expect(producer).toBeTruthy();
      if (row.available) {
        expect(row.absolute_delta).toBe(producer!.absolute_delta);
        expect(row.percent_delta).toBe(producer!.percent_delta);
      }
    }
    // Prove deltas are not a 3-vs-4 half-split of the seven points.
    for (const series of sevenPointDoc.series.filter((s) => s.metric_name === "requests")) {
      expect(series.points.length).toBe(7);
      const mid = Math.floor(series.points.length / 2);
      const prior = series.points.slice(0, mid).reduce((sum, p) => sum + p.value, 0);
      const current = series.points.slice(mid).reduce((sum, p) => sum + p.value, 0);
      const halfSplitDelta = current - prior;
      const row = rows.find((r) => r.property_id === series.property_id && r.available);
      if (row) expect(row.absolute_delta).not.toBe(halfSplitDelta);
    }
  });

  it("missing date → comparison unavailable in UI selector (no numeric delta)", () => {
    const rows = rankedTrendChanges(fixture, window7, "threats", "example.com", 8);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.available).toBe(false);
    expect(rows[0]?.absolute_delta).toBeNull();
    expect(rows[0]?.percent_delta).toBeNull();
    expect(rows[0]?.unavailable_reason).toMatch(/Missing date/i);
  });

  it("missing final date / insufficient coverage → unavailable, no silent window shift", () => {
    const rows = rankedTrendChanges(fixture, window90, "requests", "example.com", 8);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.available).toBe(false);
    expect(rows[0]?.absolute_delta).toBeNull();
    expect(rows[0]?.period_days).toBe(90);
  });

  it("exact 28d / 90d use producer-certified records for that period_days", () => {
    const rows28 = rankedTrendChanges(fixture, window28, "requests", null, 8);
    expect(rows28.every((r) => r.period_days === 28)).toBe(true);
    expect(rows28.some((r) => r.available)).toBe(true);
    for (const row of rows28.filter((r) => r.available)) {
      const producer = fixture.trend_comparisons.find(
        (tc) => tc.property_id === row.property_id && tc.metric_name === "requests" && tc.period_days === 28,
      )!;
      expect(row.absolute_delta).toBe(producer.absolute_delta);
      expect(row.percent_delta).toBe(producer.percent_delta);
      expect(row.current_value).toBe(producer.current_value);
    }
    const rows90 = rankedTrendChanges(fixture, window90, "requests", null, 8);
    expect(rows90.every((r) => r.period_days === 90)).toBe(true);
    expect(rows90.every((r) => r.available === false)).toBe(true);
  });

  it("producer identity: UI delta === producer absolute_delta/percent_delta", () => {
    const rows = rankedTrendChanges(fixture, window7, "requests", null, 8);
    for (const row of rows) {
      const producer = fixture.trend_comparisons.find(
        (tc) => tc.property_id === row.property_id && tc.metric_name === "requests" && tc.period_days === 7,
      )!;
      expect(row.available).toBe(producer.available);
      expect(row.absolute_delta).toBe(producer.available ? producer.absolute_delta : null);
      expect(row.percent_delta).toBe(producer.available ? producer.percent_delta : null);
    }
  });
});
