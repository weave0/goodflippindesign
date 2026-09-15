import { describe, expect, it } from "vitest";
import type { InsightAction, InsightFinding } from "../insights/types";
import { groupActions, rootCauseKey } from "./grouping";

function action(id: string, property: string): InsightAction {
  return {
    action_id: id,
    finding_id: `cloudflare.${property}.90d.daily-coverage-gap`,
    finding_ids: [`cloudflare.${property}.90d.daily-coverage-gap`],
    brief_id: `brief.${property}.measurement`,
    priority: 3,
    priority_class: "measurement_blocked",
    severity: "medium",
    scope: "property",
    property_id: property,
    action_class: "research",
    recommended_action: "Determine gap cause",
    verification_condition: "Dates present",
    evidence_refs: [],
    status: "new",
  };
}

function finding(property: string): InsightFinding {
  return {
    finding_id: `cloudflare.${property}.90d.daily-coverage-gap`,
    kind: "data_gap",
    severity: "medium",
    scope: "property",
    property_id: property,
    source_id: "cloudflare",
    title: "Cloudflare daily series has missing dates",
    explanation: "missing 2026-06-17",
    why_it_matters: "w",
    recommended_action: "Fix",
    verification_condition: "Ok",
    action_class: "research",
    source_metric_ids: [],
    source_snapshots: [],
    evidence_state: "unavailable",
    exactness: "exact",
    coverage_state: "partial",
    comparison: null,
    limitations: [],
    created_at: "2026-01-01T00:00:00.000Z",
  };
}

describe("rootCauseKey / groupActions", () => {
  it("collapses per-property daily coverage gaps to one key", () => {
    const a = action("a1", "fwomps.com");
    const b = action("a2", "agentkagent.com");
    expect(rootCauseKey({ action: a, finding: finding("fwomps.com") })).toBe("cloudflare.daily-coverage-gap");
    expect(rootCauseKey({ action: b, finding: finding("agentkagent.com") })).toBe("cloudflare.daily-coverage-gap");
    const groups = groupActions([
      { action: a, finding: finding("fwomps.com") },
      { action: b, finding: finding("agentkagent.com") },
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.consolidatable).toBe(true);
    expect(groups[0]?.members).toHaveLength(2);
  });

  it("keeps unique action keys non-consolidatable alone", () => {
    const a = action("solo", "only.com");
    // change finding to non-pattern
    const f = { ...finding("only.com"), finding_id: "x", title: "Unique thing", kind: "issue" as const };
    const groups = groupActions([{ action: { ...a, finding_id: "x", finding_ids: ["x"], priority_class: "investigate" }, finding: f }]);
    expect(groups[0]?.consolidatable).toBe(false);
  });
});
