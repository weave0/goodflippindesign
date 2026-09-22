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

describe("TI-010 consolidation + reopen", () => {
  it("plans a single consolidated create for daily-coverage-gap flood", () => {
    const findings = ["a.com", "b.com", "c.com"].map((property) => ({
      finding_id: `cloudflare.${property}.90d.daily-coverage-gap`,
      kind: "data_gap" as const,
      severity: "medium" as const,
      scope: "property" as const,
      property_id: property,
      source_id: "cloudflare",
      title: "Cloudflare daily series has missing dates",
      explanation: "missing 2026-06-17, 2026-06-18",
      why_it_matters: "w",
      recommended_action: "Fix",
      verification_condition: "Dates present",
      action_class: "research" as const,
      source_metric_ids: [],
      source_snapshots: [],
      evidence_state: "unavailable" as const,
      exactness: "exact",
      coverage_state: "partial",
      comparison: null,
      limitations: [],
      created_at: "2026-09-15T12:00:00.000Z",
    }));
    const actions = findings.map((f) => ({
      action_id: `action.brief.${f.property_id}.measurement`,
      finding_id: f.finding_id,
      finding_ids: [f.finding_id],
      brief_id: `brief.${f.property_id}.measurement`,
      priority: 3,
      priority_class: "measurement_blocked" as const,
      severity: "medium" as const,
      scope: "property" as const,
      property_id: f.property_id,
      action_class: "research" as const,
      recommended_action: "Determine gap cause",
      verification_condition: "Dates present",
      evidence_refs: [],
      status: "new" as const,
    }));
    const insights = baseInsights(actions);
    insights.findings = findings;
    insights.briefs = findings.map((f) => ({
      brief_id: `brief.${f.property_id}.measurement`,
      property_id: f.property_id!,
      category: "measurement" as const,
      headline: `${f.property_id} measurement gap: Cloudflare daily series has missing dates`,
      summary: "gap",
      severity: "medium" as const,
      priority: "measurement_blocked" as const,
      direction: "unknown" as const,
      materiality: { absolute_delta_requests: null, absolute_delta_pageviews: null, percent_delta: null },
      persistence: [],
      finding_ids: [f.finding_id],
      corroborating_signals: [],
      contradictory_signals: [],
      confidence: "low" as const,
      recommended_action: "Fix",
      verification_condition: "Dates present",
      action_class: "research" as const,
      limitations: [],
    }));
    const plan = planWorkSync({ insights, issues: [], createCap: 15 });
    const creates = plan.plans.filter((p) => p.kind === "create");
    expect(creates).toHaveLength(1);
    expect(creates[0]?.composed?.machine.group_role).toBe("primary");
    expect(plan.metrics.consolidated_groups).toBe(1);
    const members = Object.values(plan.queueItems).filter((i) => i.group_role === "member");
    expect(members.length).toBe(2);
  });

  it("supersedes per-property duplicates when primary exists", () => {
    const findingA = {
      finding_id: "cloudflare.a.com.90d.daily-coverage-gap",
      kind: "data_gap" as const,
      severity: "medium" as const,
      scope: "property" as const,
      property_id: "a.com",
      source_id: "cloudflare",
      title: "Cloudflare daily series has missing dates",
      explanation: "missing 2026-06-17",
      why_it_matters: "w",
      recommended_action: "Fix",
      verification_condition: "Dates present",
      action_class: "research" as const,
      source_metric_ids: [],
      source_snapshots: [],
      evidence_state: "unavailable" as const,
      exactness: "exact",
      coverage_state: "partial",
      comparison: null,
      limitations: [],
      created_at: "2026-09-15T12:00:00.000Z",
    };
    const findingB = { ...findingA, finding_id: "cloudflare.b.com.90d.daily-coverage-gap", property_id: "b.com" };
    const memberAction = {
      action_id: "action.brief.a.com.measurement",
      finding_id: findingA.finding_id,
      finding_ids: [findingA.finding_id],
      brief_id: "brief.a.com.measurement",
      priority: 3,
      priority_class: "measurement_blocked" as const,
      severity: "medium" as const,
      scope: "property" as const,
      property_id: "a.com",
      action_class: "research" as const,
      recommended_action: "Determine gap cause",
      verification_condition: "Dates present",
      evidence_refs: [],
      status: "new" as const,
    };
    const primaryAction = {
      ...memberAction,
      action_id: "action.brief.b.com.measurement",
      property_id: "b.com",
      finding_id: findingB.finding_id,
      finding_ids: [findingB.finding_id],
      brief_id: "brief.b.com.measurement",
    };
    const insights = baseInsights([memberAction, primaryAction]);
    insights.findings = [findingA, findingB];
    insights.briefs = [
      {
        brief_id: "brief.a.com.measurement",
        property_id: "a.com",
        category: "measurement",
        headline: "gap",
        summary: "s",
        severity: "medium",
        priority: "measurement_blocked",
        direction: "unknown",
        materiality: { absolute_delta_requests: null, absolute_delta_pageviews: null, percent_delta: null },
        persistence: [],
        finding_ids: [findingA.finding_id],
        corroborating_signals: [],
        contradictory_signals: [],
        confidence: "low",
        recommended_action: "Fix",
        verification_condition: "Dates present",
        action_class: "research",
        limitations: [],
      },
      {
        brief_id: "brief.b.com.measurement",
        property_id: "b.com",
        category: "measurement",
        headline: "gap",
        summary: "s",
        severity: "medium",
        priority: "measurement_blocked",
        direction: "unknown",
        materiality: { absolute_delta_requests: null, absolute_delta_pageviews: null, percent_delta: null },
        persistence: [],
        finding_ids: [findingB.finding_id],
        corroborating_signals: [],
        contradictory_signals: [],
        confidence: "low",
        recommended_action: "Fix",
        verification_condition: "Dates present",
        action_class: "research",
        limitations: [],
      },
    ];

    const primaryBody = composeIssue({
      action: primaryAction,
      brief: insights.briefs[1],
      findings: [findingB],
      eligibility: "auto",
      lifecycle: "detected",
      group_role: "primary",
      root_cause_key: "cloudflare.daily-coverage-gap",
      consolidatedPrimary: true,
      groupSize: 2,
    }).body;
    const memberBody = composeIssue({
      action: memberAction,
      brief: insights.briefs[0],
      findings: [findingA],
      eligibility: "auto",
      lifecycle: "detected",
    }).body;

    const issues: ExistingIssue[] = [
      {
        number: 100,
        html_url: "https://github.com/weave0/goodflippindesign/issues/100",
        title: "primary",
        body: primaryBody,
        state: "open",
        labels: ["ti-work", "ti-lifecycle:detected", "ti-group:primary"],
        updated_at: "2026-09-15T12:00:00.000Z",
      },
      {
        number: 101,
        html_url: "https://github.com/weave0/goodflippindesign/issues/101",
        title: "dup",
        body: memberBody,
        state: "open",
        labels: ["ti-work", "ti-lifecycle:detected"],
        updated_at: "2026-09-15T12:00:00.000Z",
      },
    ];
    const plan = planWorkSync({ insights, issues });
    // pickPrimaryMember chooses lowest action_id (a.com) as primary → supersede the other open issue (#100).
    expect(plan.plans.some((p) => p.kind === "supersede_duplicate")).toBe(true);
    const superseded = plan.plans.find((p) => p.kind === "supersede_duplicate");
    expect(superseded?.primary_issue_number).toBeTruthy();
    expect(plan.queueItems[memberAction.action_id]?.group_role === "member" || plan.queueItems[memberAction.action_id]?.group_role === "primary").toBe(true);
    expect(plan.queueItems[primaryAction.action_id]?.group_role === "member" || plan.queueItems[primaryAction.action_id]?.group_role === "primary").toBe(true);
    const roles = [plan.queueItems[memberAction.action_id]?.group_role, plan.queueItems[primaryAction.action_id]?.group_role];
    expect(roles).toContain("primary");
    expect(roles).toContain("member");
  });

  it("migrates live property-scoped Cloudflare legacy issues to one primary in a single sync", () => {
    const properties = ["agentkagent.com", "fwomp.us", "fwomps.com"];
    const findings = properties.map((property) => ({
      finding_id: `cloudflare.${property}.90d.daily-coverage-gap`,
      kind: "data_gap" as const,
      severity: "medium" as const,
      scope: "property" as const,
      property_id: property,
      source_id: `cloudflare.zone.${property}`,
      title: "Cloudflare daily series has missing dates",
      explanation: "missing dates",
      why_it_matters: "comparison incomplete",
      recommended_action: "Determine gap cause",
      verification_condition: "Dates present",
      action_class: "research" as const,
      source_metric_ids: [],
      source_snapshots: [],
      evidence_state: "unavailable" as const,
      exactness: "exact",
      coverage_state: "partial",
      comparison: null,
      limitations: [],
      created_at: "2026-09-15T12:00:00.000Z",
    }));
    const actions = findings.map((f) => ({
      action_id: `action.brief.${f.property_id}.measurement`,
      finding_id: f.finding_id,
      finding_ids: [f.finding_id],
      brief_id: `brief.${f.property_id}.measurement`,
      priority: 3,
      priority_class: "measurement_blocked" as const,
      severity: "medium" as const,
      scope: "property" as const,
      property_id: f.property_id,
      action_class: "research" as const,
      recommended_action: "Determine gap cause",
      verification_condition: "Dates present",
      evidence_refs: [],
      status: "new" as const,
    }));
    const insights = baseInsights(actions);
    insights.findings = findings;
    insights.briefs = findings.map((f) => ({
      brief_id: `brief.${f.property_id}.measurement`,
      property_id: f.property_id!,
      category: "measurement" as const,
      headline: `${f.property_id} measurement gap: Cloudflare daily series has missing dates`,
      summary: "gap",
      severity: "medium" as const,
      priority: "measurement_blocked" as const,
      direction: "unknown" as const,
      materiality: { absolute_delta_requests: null, absolute_delta_pageviews: null, percent_delta: null },
      persistence: [],
      finding_ids: [f.finding_id],
      corroborating_signals: [],
      contradictory_signals: [],
      confidence: "low" as const,
      recommended_action: "Determine gap cause",
      verification_condition: "Dates present",
      action_class: "research" as const,
      limitations: [],
    }));

    const issues: ExistingIssue[] = actions.map((action, idx) => ({
      number: 285 + idx,
      html_url: `https://github.com/weave0/goodflippindesign/issues/${285 + idx}`,
      title: `legacy ${action.property_id}`,
      body: composeIssue({
        action,
        brief: insights.briefs[idx],
        findings: [findings[idx]!],
        eligibility: "recommend",
        lifecycle: "detected",
        root_cause_key: `cloudflare.zone.${action.property_id}.daily-coverage-gap`,
      }).body,
      state: "open",
      labels: ["ti-work", "ti-lifecycle:detected", "ti-eligibility:recommend"],
      updated_at: "2026-09-15T12:00:00.000Z",
    }));

    const plan = planWorkSync({ insights, issues, createCap: 15 });
    const primary = plan.plans.find(
      (p) => p.kind === "update_body" && p.composed?.machine.group_role === "primary",
    );
    expect(primary?.issue_number).toBe(285);
    expect(primary?.composed?.machine.root_cause_key).toBe("cloudflare.daily-coverage-gap");
    expect(primary?.composed?.body).toContain("Consolidated members");
    const superseded = plan.plans.filter((p) => p.kind === "supersede_duplicate");
    expect(superseded).toHaveLength(2);
    expect(superseded.every((p) => p.primary_issue_number === 285)).toBe(true);
    expect(plan.metrics.consolidated_groups).toBe(1);
    expect(plan.metrics.superseded_duplicates).toBe(2);
    for (const action of actions) {
      expect(plan.queueItems[action.action_id]?.issue_number).toBe(285);
    }
  });

  it("refreshes the human-readable issue body when current insight text changes", () => {
    const action = act("a-refresh", "healthy");
    const oldInsights = baseInsights([action]);
    oldInsights.briefs[0] = {
      ...oldInsights.briefs[0]!,
      brief_id: "b-act",
      headline: "traffic rose 79.9% (28d)",
      summary: "old summary",
      priority: "healthy",
      confidence: "high",
    };
    const oldBody = composeIssue({
      action,
      brief: oldInsights.briefs[0],
      findings: oldInsights.findings,
      eligibility: "recommend",
      insights: oldInsights,
    }).body;
    const issue: ExistingIssue = {
      number: 294,
      html_url: "https://github.com/weave0/goodflippindesign/issues/294",
      title: "old title",
      body: oldBody,
      state: "open",
      labels: ["ti-work", "ti-lifecycle:detected", "ti-eligibility:recommend"],
      updated_at: "2026-09-15T12:00:00.000Z",
    };
    const current = baseInsights([action]);
    current.generated_at = "2026-09-22T23:25:24.000Z";
    current.briefs[0] = {
      ...current.briefs[0]!,
      brief_id: "b-act",
      headline: "traffic rose 142.0% (28d)",
      summary: "current summary",
      priority: "healthy",
      confidence: "medium",
    };
    const plan = planWorkSync({ insights: current, issues: [issue] });
    const update = plan.plans.find((p) => p.kind === "update_body");
    expect(update?.composed?.title).toContain("traffic rose 142.0% (28d)");
    expect(update?.composed?.body).toContain("traffic rose 142.0% (28d)");
    expect(update?.composed?.body).toContain("current summary");
    expect(update?.composed?.body).not.toContain("old summary");
    expect(update?.composed?.body).toContain("### Evidence (closed-loop)");
  });

  it("reopens closed issue when action_id returns (regressed)", () => {
    const action = act("a-reopen");
    const composed = composeIssue({ action, eligibility: "auto", lifecycle: "resolved" });
    const issue: ExistingIssue = {
      number: 55,
      html_url: "https://github.com/weave0/goodflippindesign/issues/55",
      title: composed.title,
      body: composed.body,
      state: "closed",
      labels: ["ti-work", "ti-lifecycle:resolved"],
      updated_at: "2026-09-10T12:00:00.000Z",
    };
    const plan = planWorkSync({ insights: baseInsights([action]), issues: [issue] });
    expect(plan.plans.some((p) => p.kind === "reopen" && p.next_lifecycle === "regressed")).toBe(true);
    expect(plan.queueItems["a-reopen"]?.lifecycle).toBe("regressed");
  });
});
