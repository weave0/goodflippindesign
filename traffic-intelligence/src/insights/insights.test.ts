import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertTrafficInsights } from "./assert";
import {
  estateBriefOf,
  insightTrendSeries,
  partitionFindings,
  prioritizedActions,
  propertyHealthRows,
  rankedBriefs,
} from "./select";
import type { TrafficInsightDocument } from "./types";
import type { WindowPayload } from "../gold/types";

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/traffic-insights-1.0.json"), "utf8"),
) as TrafficInsightDocument;

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

describe("governed traffic insights", () => {
  it("accepts the 1.1 fixture sidecar contract with briefs and estate_brief", () => {
    assertTrafficInsights(fixture);
    expect(fixture.fixture).toBe(true);
    expect(fixture.contract_name).toBe("gfd-traffic-insights");
    expect(fixture.schema_version).toBe("1.1.0");
    expect(fixture.briefs.length).toBeGreaterThan(0);
    expect(fixture.estate_brief?.status).toBe("attention_required");
    expect(fixture.property_health.length).toBeGreaterThan(0);
  });

  it("accepts legacy schema 1.0.0 without requiring briefs", () => {
    const legacy = {
      ...fixture,
      schema_version: "1.0.0",
      briefs: undefined,
      estate_brief: undefined,
      property_health: undefined,
    };
    assertTrafficInsights(legacy);
  });

  it("rejects the wrong contract instead of inventing findings", () => {
    expect(() => assertTrafficInsights({ ...fixture, contract_name: "not-insights" })).toThrow(/contract_name/);
  });

  it("rejects schema 1.1.0 when estate_brief is missing (fail closed)", () => {
    expect(() =>
      assertTrafficInsights({
        ...fixture,
        schema_version: "1.1.0",
        estate_brief: null,
      }),
    ).toThrow(/estate_brief/);
  });

  it("partitions producer findings into mission-control queues", () => {
    const queues = partitionFindings(fixture, null);
    expect(queues.needsAttention.map((f) => f.kind).sort()).toEqual(["issue"]);
    expect(queues.momentum.map((f) => f.kind).sort()).toEqual(["success"]);
    expect(queues.gaps.map((f) => f.kind)).toEqual(["data_gap"]);
  });

  it("sorts actions by categorical priority without browser invention", () => {
    const actions = prioritizedActions(fixture, null);
    expect(actions.map((a) => a.priority)).toEqual(["act_now", "act_now", "investigate"]);
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
});
