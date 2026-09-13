import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertTrafficInsights } from "./assert";
import { insightTrendSeries, partitionFindings, prioritizedActions } from "./select";
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
  it("accepts the fixture sidecar contract", () => {
    assertTrafficInsights(fixture);
    expect(fixture.fixture).toBe(true);
    expect(fixture.contract_name).toBe("gfd-traffic-insights");
  });

  it("rejects the wrong contract instead of inventing findings", () => {
    expect(() => assertTrafficInsights({ ...fixture, contract_name: "not-insights" })).toThrow(/contract_name/);
  });

  it("partitions producer findings into mission-control queues", () => {
    const queues = partitionFindings(fixture, null);
    expect(queues.needsAttention.map((f) => f.kind).sort()).toEqual(["issue"]);
    expect(queues.momentum.map((f) => f.kind).sort()).toEqual(["success"]);
    expect(queues.gaps.map((f) => f.kind)).toEqual(["data_gap"]);
  });

  it("sorts actions by producer priority without browser invention", () => {
    const actions = prioritizedActions(fixture, null);
    expect(actions.map((a) => a.priority)).toEqual([1, 2]);
  });

  it("slices daily series to the active reporting window and never plots uniques", () => {
    const requests = insightTrendSeries(fixture, window28, null, "requests");
    expect(requests.length).toBe(1);
    expect(requests[0]?.points.length).toBe(28);
    expect(insightTrendSeries(fixture, window28, null, "uniques")).toEqual([]);
  });
});
