import { describe, expect, it } from "vitest";
import type { InsightAction, InsightFinding, OperationalBrief } from "../insights/types";
import { scoreImpact } from "./scoring";

function action(partial: Partial<InsightAction> = {}): InsightAction {
  return {
    action_id: "a1",
    finding_id: "f1",
    finding_ids: ["f1"],
    brief_id: "b1",
    priority: 1,
    priority_class: "act_now",
    severity: "high",
    scope: "property",
    property_id: "example.com",
    action_class: "research",
    recommended_action: "Fix",
    verification_condition: "Ok",
    evidence_refs: [],
    status: "new",
    ...partial,
  };
}

function brief(partial: Partial<OperationalBrief> = {}): OperationalBrief {
  return {
    brief_id: "b1",
    property_id: "example.com",
    category: "traffic",
    headline: "Drop",
    summary: "s",
    severity: "high",
    priority: "act_now",
    direction: "down",
    materiality: { absolute_delta_requests: -2000, absolute_delta_pageviews: null, percent_delta: -0.25 },
    persistence: ["7d", "28d"],
    finding_ids: ["f1"],
    corroborating_signals: [],
    contradictory_signals: [],
    confidence: "high",
    recommended_action: "Fix",
    verification_condition: "Ok",
    action_class: "research",
    limitations: [],
    ...partial,
  };
}

describe("scoreImpact", () => {
  it("scores act_now traffic higher than low-confidence measurement", () => {
    const high = scoreImpact({
      action: action(),
      brief: brief(),
      finding: {
        finding_id: "f1",
        kind: "issue",
        severity: "high",
        scope: "property",
        property_id: "example.com",
        source_id: "cloudflare",
        title: "Drop",
        explanation: "e",
        why_it_matters: "w",
        recommended_action: "Fix",
        verification_condition: "Ok",
        action_class: "research",
        source_metric_ids: [],
        source_snapshots: [],
        evidence_state: "measured",
        exactness: "exact",
        coverage_state: "complete",
        comparison: null,
        limitations: [],
        created_at: "2026-01-01T00:00:00.000Z",
      } satisfies InsightFinding,
    });
    const low = scoreImpact({
      action: action({ priority_class: "measurement_blocked", severity: "medium" }),
      brief: brief({ confidence: "low", category: "measurement", materiality: { absolute_delta_requests: null, absolute_delta_pageviews: null, percent_delta: null }, persistence: [] }),
      finding: {
        finding_id: "cloudflare.example.com.90d.daily-coverage-gap",
        kind: "data_gap",
        severity: "medium",
        scope: "property",
        property_id: "example.com",
        source_id: "cloudflare",
        title: "Cloudflare daily series has missing dates",
        explanation: "missing",
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
      },
    });
    expect(high.impact_score).toBeGreaterThan(low.impact_score);
    expect(high.impact_class === "critical" || high.impact_class === "high").toBe(true);
    expect(low.rationale).toMatch(/measurement/);
  });

  it("is deterministic", () => {
    const a = scoreImpact({ action: action(), brief: brief() });
    const b = scoreImpact({ action: action(), brief: brief() });
    expect(a).toEqual(b);
  });
});
