import { formatMetric, formatNumber, isAbsentMetric } from "./format";
import type { Metric } from "./types";

const base: Metric = {
  id: "t",
  label: "Edge requests",
  value: 92401,
  source: "cloudflare_edge",
  grain: "request",
  evidenceState: "MEASURED",
  coverage: "COMPLETE",
  timeWindow: { id: "28d", start: "2026-08-12", end: "2026-09-08" },
  definitionId: "def.edge_request",
  pipelineVersion: "gold-fixture-0.2.0",
};

describe("display formatting", () => {
  it("uses an em dash for unavailable metrics and never zero", () => {
    const metric = { ...base, value: null, evidenceState: "UNAVAILABLE" as const, coverage: "MISSING" as const };
    expect(formatMetric(metric)).toBe("—");
    expect(formatMetric({ ...metric, value: 0, display: "0" })).toBe("—");
    expect(isAbsentMetric(metric)).toBe(true);
  });

  it("renders unknowable as unknowable, not zero", () => {
    const metric = { ...base, value: null, evidenceState: "UNKNOWABLE" as const, coverage: "NOT_APPLICABLE" as const };
    expect(formatMetric(metric)).toBe("unknowable");
    expect(formatMetric({ ...metric, display: "0" })).toBe("unknowable");
  });

  it("renders a measured zero", () => {
    expect(formatMetric({ ...base, value: 0 })).toBe("0");
  });

  it("prefers pipeline display strings", () => {
    expect(formatMetric({ ...base, display: "≈ 11%", evidenceState: "ESTIMATED", value: 0.11 })).toBe("≈ 11%");
    expect(formatMetric({ ...base, display: "18.2 GB", value: null })).toBe("18.2 GB");
  });

  it("marks estimated values without a display string", () => {
    expect(formatMetric({ ...base, evidenceState: "ESTIMATED", value: 12 })).toBe("≈ 12");
  });

  it("formats integers with grouping separators", () => {
    expect(formatNumber(92401)).toBe("92,401");
  });
});
