import { describe, expect, it } from "vitest";
import type { InsightAction, InsightFinding, OperationalBrief } from "../insights/types";
import { eligibilityFor, hasMeaningfulMateriality } from "./eligibility";

function action(partial: Partial<InsightAction> & Pick<InsightAction, "action_id" | "priority_class">): InsightAction {
  return {
    finding_id: "f1",
    finding_ids: ["f1"],
    brief_id: "b1",
    priority: 2,
    severity: "medium",
    scope: "property",
    property_id: "example.com",
    action_class: "config",
    recommended_action: "Do the thing",
    verification_condition: "Metric recovers",
    evidence_refs: ["snap"],
    status: "new",
    ...partial,
  };
}

function brief(partial: Partial<OperationalBrief> = {}): OperationalBrief {
  return {
    brief_id: "b1",
    property_id: "example.com",
    category: "traffic",
    headline: "Headline",
    summary: "Summary",
    severity: "medium",
    priority: "investigate",
    direction: "down",
    materiality: {
      absolute_delta_requests: null,
      absolute_delta_pageviews: null,
      percent_delta: null,
    },
    persistence: ["7d"],
    finding_ids: ["f1"],
    corroborating_signals: [],
    contradictory_signals: [],
    confidence: "medium",
    recommended_action: "Do",
    verification_condition: "Verify",
    action_class: "config",
    limitations: [],
    ...partial,
  };
}

function finding(partial: Partial<InsightFinding> & Pick<InsightFinding, "kind">): InsightFinding {
  return {
    finding_id: "f1",
    severity: "medium",
    scope: "property",
    property_id: "example.com",
    source_id: "cloudflare",
    title: "Cloudflare daily series has missing dates",
    explanation: "Expl",
    why_it_matters: "Why",
    recommended_action: "Do",
    verification_condition: "Verify",
    action_class: "config",
    source_metric_ids: [],
    source_snapshots: [],
    evidence_state: "measured",
    exactness: "exact",
    coverage_state: "complete",
    comparison: null,
    limitations: [],
    created_at: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("eligibilityFor (TI-010)", () => {
  it("auto for act_now regardless of confidence", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a1", priority_class: "act_now" }),
        brief: brief({ confidence: "low" }),
      }),
    ).toBe("auto");
  });

  it("auto for investigate only with high confidence", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a2", priority_class: "investigate" }),
        brief: brief({ confidence: "medium" }),
      }),
    ).toBe("recommend");
    expect(
      eligibilityFor({
        action: action({ action_id: "a2", priority_class: "investigate" }),
        brief: brief({ confidence: "high" }),
      }),
    ).toBe("auto");
  });

  it("does not auto low-confidence measurement_blocked floods (per-property)", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a4", priority_class: "measurement_blocked" }),
        brief: brief({ confidence: "low", category: "measurement" }),
        finding: finding({ kind: "data_gap", finding_id: "cloudflare.example.com.90d.daily-coverage-gap" }),
      }),
    ).toBe("recommend");
  });

  it("auto low-confidence measurement_blocked only as consolidated primary", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a4", priority_class: "measurement_blocked" }),
        brief: brief({ confidence: "low", category: "measurement" }),
        finding: finding({ kind: "data_gap", finding_id: "cloudflare.example.com.90d.daily-coverage-gap" }),
        consolidatedPrimary: true,
        groupSize: 9,
      }),
    ).toBe("auto");
  });

  it("auto for high-confidence data_gap", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a3", priority_class: "watch" }),
        brief: brief({ confidence: "high" }),
        finding: finding({ kind: "data_gap" }),
      }),
    ).toBe("auto");
  });

  it("prefers recommend for material healthy opportunity (review, not repair)", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a5", priority_class: "healthy" }),
        brief: brief({
          confidence: "high",
          materiality: {
            absolute_delta_requests: 1500,
            absolute_delta_pageviews: null,
            percent_delta: 0.799,
          },
        }),
        finding: finding({ kind: "opportunity" }),
      }),
    ).toBe("recommend");
  });

  it("auto healthy opportunity only when explicitly flagged", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a5b", priority_class: "healthy" }),
        brief: brief({
          confidence: "high",
          limitations: ["ti-auto-opportunity=true"],
          materiality: {
            absolute_delta_requests: 1500,
            absolute_delta_pageviews: null,
            percent_delta: 0.799,
          },
        }),
        finding: finding({ kind: "opportunity" }),
      }),
    ).toBe("auto");
  });

  it("never auto pure healthy without opportunity signal", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a6", priority_class: "healthy" }),
        brief: brief({
          confidence: "high",
          materiality: {
            absolute_delta_requests: 5000,
            absolute_delta_pageviews: null,
            percent_delta: null,
          },
        }),
        finding: finding({ kind: "issue" }),
      }),
    ).toBe("recommend");
  });

  it("recommend by default", () => {
    expect(
      eligibilityFor({
        action: action({ action_id: "a7", priority_class: "watch" }),
        brief: brief({ confidence: "medium" }),
        finding: finding({ kind: "change" }),
      }),
    ).toBe("recommend");
  });
});

describe("hasMeaningfulMateriality", () => {
  it("uses documented thresholds", () => {
    expect(
      hasMeaningfulMateriality({
        absolute_delta_requests: null,
        absolute_delta_pageviews: null,
        percent_delta: 0.09,
      }),
    ).toBe(false);
    expect(
      hasMeaningfulMateriality({
        absolute_delta_requests: null,
        absolute_delta_pageviews: null,
        percent_delta: -0.1,
      }),
    ).toBe(true);
    expect(
      hasMeaningfulMateriality({
        absolute_delta_requests: 1000,
        absolute_delta_pageviews: null,
        percent_delta: null,
      }),
    ).toBe(true);
  });
});
