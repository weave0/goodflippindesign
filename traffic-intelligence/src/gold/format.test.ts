import { formatMetric, formatNumber, isAbsentMetric } from "./format";
import type { Metric } from "./types";

const base: Metric = {
  metric_id: "t",
  id: "t",
  label: "Edge requests",
  metric_definition: "requests",
  value: 92401,
  source: "cloudflare",
  grain: "request",
  evidence_state: "measured",
  evidenceState: "measured",
  exactness: "exact",
  coverage: { state: "full_coverage" },
  coverageState: "full_coverage",
  timeWindow: { id: "28d", start: "2026-08-12", end: "2026-09-08" },
  definitionId: "def.edge_request",
  pipelineVersion: "m1.2-contract-fixture",
};

describe("display formatting", () => {
  it("uses an em dash for unavailable metrics and never zero", () => {
    const metric = { ...base, value: null, evidence_state: "unavailable" as const, evidenceState: "unavailable" as const, coverage: { state: "source_unavailable" as const }, coverageState: "source_unavailable" as const };
    expect(formatMetric(metric)).toBe("—");
    expect(formatMetric({ ...metric, display: "0" })).toBe("—");
    expect(isAbsentMetric(metric)).toBe(true);
  });

  it("renders unknowable as unknowable, not zero", () => {
    const metric = { ...base, value: null, evidence_state: "unknowable" as const, evidenceState: "unknowable" as const, coverage: { state: "structurally_unknowable" as const }, coverageState: "structurally_unknowable" as const };
    expect(formatMetric(metric)).toBe("unknowable");
    expect(formatMetric({ ...metric, display: "0" })).toBe("unknowable");
  });

  it("renders a measured zero", () => {
    expect(formatMetric({ ...base, value: 0 })).toBe("0");
  });

  it("prefers pipeline display strings", () => {
    expect(formatMetric({ ...base, display: "≈ 11%", evidence_state: "estimated", evidenceState: "estimated", value: 0.11 })).toBe("≈ 11%");
    expect(formatMetric({ ...base, display: "18.2 GB", value: null, evidence_state: "measured", evidenceState: "measured" })).toBe("18.2 GB");
  });

  it("formats integers with grouping separators", () => {
    expect(formatNumber(92401)).toBe("92,401");
  });
});
