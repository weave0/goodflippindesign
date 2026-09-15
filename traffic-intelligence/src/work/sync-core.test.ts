import { describe, expect, it } from "vitest";
import type { InsightAction, TrafficInsightDocument } from "../insights/types";
import { composeIssue } from "./issue-body";
import {
  indexIssuesByActionId,
  planWorkSync,
  rankActionsForCreate,
  type ExistingIssue,
} from "./sync-core";

function baseInsights(actions: InsightAction[]): TrafficInsightDocument {
  return {
    schema_version: "1.1.0",
    contract_name: "gfd-traffic-insights",
    fixture: true,
    generated_at: "2026-09-15T12:00:00.000Z",
    source_gold_schema_version: "1.2.0",
    source_gold_generated_at: "2026-09-15T12:00:00.000Z",
    series: [],
    findings: [
      {
        finding_id: "f-act",
        kind: "issue",
        severity: "high",
        scope: "property",
        property_id: "example.com",
        source_id: "cloudflare",
        title: "Drop",
        explanation: "e",
        why_it_matters: "w",
        recommended_action: "fix",
        verification_condition: "recovers",
        action_class: "config",
        source_metric_ids: [],
        source_snapshots: [],
        evidence_state: "measured",
        exactness: "exact",
        coverage_state: "complete",
        comparison: null,
        limitations: [],
        created_at: "2026-09-15T12:00:00.000Z",
      },
    ],
    actions,
    briefs: [
      {
        brief_id: "b-act",
        property_id: "example.com",
        category: "traffic",
        headline: "Traffic drop",
        summary: "Material drop",
        severity: "high",
        priority: "act_now",
        direction: "down",
        materiality: {
          absolute_delta_requests: -2000,
          absolute_delta_pageviews: null,
          percent_delta: -0.2,
        },
        persistence: ["7d"],
        finding_ids: ["f-act"],
        corroborating_signals: [],
        contradictory_signals: [],
        confidence: "high",
        recommended_action: "Investigate",
        verification_condition: "Requests recover",
        action_class: "research",
        limitations: [],
      },
    ],
    estate_brief: {
      status: "attention_required",
      top_changes: [],
      top_wins: [],
      measurement_limitations: [],
      top_actions: [],
      properties_to_inspect: [],
    },
    property_health: [],
    trend_comparisons: [],
    limitations: [],
  };
}

function act(id: string, priority_class: InsightAction["priority_class"] = "act_now"): InsightAction {
  return {
    action_id: id,
    finding_id: "f-act",
    finding_ids: ["f-act"],
    brief_id: "b-act",
    priority: 1,
    priority_class,
    severity: "high",
    scope: "property",
    property_id: "example.com",
    action_class: "research",
    recommended_action: "Investigate traffic drop",
    verification_condition: "Requests recover",
    evidence_refs: ["snap"],
    status: "new",
  };
}

describe("planWorkSync", () => {
  it("dedupes by action_id and plans create for auto", () => {
    const insights = baseInsights([act("a-new")]);
    const plan = planWorkSync({ insights, issues: [], createCap: 25 });
    expect(plan.plans.some((p) => p.kind === "create" && p.action_id === "a-new")).toBe(true);
    expect(plan.queueItems["a-new"]?.eligibility).toBe("auto");
  });

  it("respects dismissed and does not reopen", () => {
    const action = act("a-dismissed");
    const composed = composeIssue({ action, eligibility: "auto", lifecycle: "dismissed" });
    const issue: ExistingIssue = {
      number: 42,
      html_url: "https://github.com/weave0/goodflippindesign/issues/42",
      title: composed.title,
      body: composed.body,
      state: "open",
      labels: ["ti-work", "ti-lifecycle:dismissed"],
      updated_at: "2026-09-15T12:00:00.000Z",
    };
    const plan = planWorkSync({
      insights: baseInsights([action]),
      issues: [issue],
    });
    expect(plan.plans.some((p) => p.kind === "skip_dismissed")).toBe(true);
    expect(plan.plans.some((p) => p.kind === "create")).toBe(false);
  });

  it("keeps in_progress lifecycle and can update evidence", () => {
    const action = act("a-wip");
    const composed = composeIssue({
      action,
      eligibility: "auto",
      lifecycle: "in_progress",
      insights: { generated_at: "2026-09-01T00:00:00.000Z" },
    });
    const issue: ExistingIssue = {
      number: 7,
      html_url: "https://github.com/weave0/goodflippindesign/issues/7",
      title: composed.title,
      body: composed.body,
      state: "open",
      labels: ["ti-work", "ti-lifecycle:in_progress"],
      updated_at: "2026-09-15T12:00:00.000Z",
    };
    const newer = baseInsights([
      {
        ...action,
        verification_condition: "Requests recover above baseline",
      },
    ]);
    newer.generated_at = "2026-09-15T18:00:00.000Z";
    const plan = planWorkSync({ insights: newer, issues: [issue] });
    const update = plan.plans.find((p) => p.kind === "update_body");
    expect(update).toBeTruthy();
    expect(plan.queueItems["a-wip"]?.lifecycle).toBe("in_progress");
  });

  it("clears → verify → resolved across absent runs", () => {
    const action = act("a-clear");
    const composed = composeIssue({ action, eligibility: "auto", lifecycle: "detected" });
    const issue: ExistingIssue = {
      number: 9,
      html_url: "https://github.com/weave0/goodflippindesign/issues/9",
      title: composed.title,
      body: composed.body,
      state: "open",
      labels: ["ti-work", "ti-lifecycle:detected"],
      updated_at: "2026-09-15T12:00:00.000Z",
    };
    const empty = baseInsights([]);
    const plan1 = planWorkSync({ insights: empty, issues: [issue] });
    expect(plan1.plans.some((p) => p.kind === "comment_cleared" && p.next_lifecycle === "verify")).toBe(
      true,
    );

    const verifyIssue: ExistingIssue = {
      ...issue,
      labels: ["ti-work", "ti-lifecycle:verify"],
      body: composeIssue({ action, eligibility: "auto", lifecycle: "verify" }).body,
    };
    const plan2 = planWorkSync({ insights: empty, issues: [verifyIssue] });
    expect(plan2.plans.some((p) => p.kind === "set_lifecycle" && p.next_lifecycle === "resolved")).toBe(
      true,
    );
  });

  it("caps auto-creates preferring highest priority", () => {
    const actions = [
      act("low", "watch"),
      act("high", "act_now"),
      act("mid", "investigate"),
    ];
    // force investigate to auto via high confidence brief already in base
    const insights = baseInsights(actions);
    // watch without opportunity → recommend; only act_now + investigate auto
    const plan = planWorkSync({ insights, issues: [], createCap: 1 });
    const creates = plan.plans.filter((p) => p.kind === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0]?.action_id).toBe("high");
    expect(plan.createsSkippedByCap).toBeGreaterThanOrEqual(1);
  });
});

describe("indexIssuesByActionId", () => {
  it("indexes by machine block action_id", () => {
    const action = act("a-idx");
    const body = composeIssue({ action }).body;
    const map = indexIssuesByActionId([
      {
        number: 1,
        html_url: "https://example/1",
        title: "t",
        body,
        state: "open",
        labels: ["ti-work"],
        updated_at: "2026-09-15T12:00:00.000Z",
      },
    ]);
    expect(map.get("a-idx")?.number).toBe(1);
  });
});

describe("rankActionsForCreate", () => {
  it("orders act_now before investigate", () => {
    const ranked = rankActionsForCreate([act("b", "investigate"), act("a", "act_now")]);
    expect(ranked.map((a) => a.action_id)).toEqual(["a", "b"]);
  });
});
