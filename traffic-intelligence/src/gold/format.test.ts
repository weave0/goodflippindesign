import { formatMetric, formatNumber } from "./format";
import type { Metric } from "./types";

const base: Metric = {
  id: "t",
  label: "Edge requests",
  value: 92401,
  source: "cloudflare_edge",
  grain: "request",
  status: "EXACT",
  timeWindow: { id: "28d", start: "2026-08-12", end: "2026-09-08" },
  definitionId: "def.edge_request",
  pipelineVersion: "gold-fixture-0.1.0",
};

describe("display formatting", () => {
  it("uses an em dash for unavailable metrics", () => {
    expect(formatMetric({ ...base, value: null, status: "UNAVAILABLE" })).toBe("—");
  });

  it("prefers pipeline display strings", () => {
    expect(formatMetric({ ...base, display: "≈ 11%", status: "ESTIMATED", value: 0.11 })).toBe("≈ 11%");
    expect(formatMetric({ ...base, display: "18.2 GB", value: null })).toBe("18.2 GB");
  });

  it("marks estimated values without a display string", () => {
    expect(formatMetric({ ...base, status: "ESTIMATED", value: 12 })).toBe("≈ 12");
  });

  it("formats integers with grouping separators", () => {
    expect(formatNumber(92401)).toBe("92,401");
  });
});
