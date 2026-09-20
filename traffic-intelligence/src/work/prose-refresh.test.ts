import { describe, expect, it } from "vitest";
import type { InsightAction, InsightFinding, OperationalBrief, TrafficInsightDocument } from "../insights/types";
import { composeIssue, parseMachineBlock, proseDiffers, proseSections } from "./issue-body";
import { planWorkSync, type ExistingIssue } from "./sync-core";

const FINDING: InsightFinding = {
  finding_id: "f-gap",
  kind: "data_gap",
  severity: "medium",
  scope: "source",
  property_id: null,
  source_id: "cloudflare.zone.account",
  title: "Cloudflare source evidence unavailable",
  explanation: "cloudflare.zone.account / cloudflare.pages.projects.list.v1.7d could not be queried with the current access boundary.",
  why_it_matters: "w",
  recommended_action: "Verify source availability and least-privilege access",
  verification_condition: "row reports query_permitted=true",
  action_class: "credential/instrumentation",
  source_metric_ids: [],
  source_snapshots: [],
  evidence_state: "unavailable",
  exactness: "unknown",
  coverage_state: "source_unavailable",
  comparison: null,
  limitations: [],
  created_at: "2026-09-15T12:00:00.000Z",
} as unknown as InsightFinding;

const BRIEF = (summary: string): OperationalBrief =>
  ({
    brief_id: "b-gap",
    property_id: "estate",
    category: "measurement",
    headline: "source measurement gap: Cloudflare source evidence unavailable",
    summary,
    severity: "medium",
    priority: "measurement_blocked",
    direction: "unknown",
    materiality: { absolute_delta_requests: null, absolute_delta_pageviews: null, percent_delta: null },
    persistence: [],
    finding_ids: ["f-gap"],
    corroborating_signals: [],
    contradictory_signals: [],
    confidence: "low",
    recommended_action: "Verify",
    verification_condition: "row reports query_permitted=true",
    action_class: "credential/instrumentation",
    limitations: [],
  }) as unknown as OperationalBrief;

const ACTION: InsightAction = {
  action_id: "action.brief._source.measurement",
  finding_id: "f-gap",
  finding_ids: ["f-gap"],
  brief_id: "b-gap",
  priority: 2,
  priority_class: "measurement_blocked",
  severity: "medium",
  scope: "source",
  property_id: null,
  action_class: "credential/instrumentation",
  recommended_action: "Verify source availability and least-privilege access",
  verification_condition: "row reports query_permitted=true",
  evidence_refs: [],
  status: "new",
} as unknown as InsightAction;

function insights(finding: InsightFinding, summary: string, generatedAt: string): TrafficInsightDocument {
  return {
    schema_version: "1.1.0",
    contract_name: "gfd-traffic-insights",
    fixture: true,
    generated_at: generatedAt,
    source_gold_schema_version: "1.2.0",
    source_gold_generated_at: generatedAt,
    series: [],
    findings: [finding],
    actions: [ACTION],
    briefs: [BRIEF(summary)],
    estate_brief: { status: "attention_required", top_changes: [], top_wins: [], measurement_limitations: [], top_actions: [], properties_to_inspect: [] },
    property_health: [],
    trend_comparisons: [],
    limitations: [],
  };
}

const STALE_SUMMARY = "cloudflare.zone.account / cloudflare.pages.projects.list.v1.7d could not be queried with the current access boundary.";
const CURRENT_SUMMARY = "cloudflare.zone.aiaimate.com / cloudflare.httpRequests1dGroups.v1.7d returned no usable evidence.";

const CURRENT_FINDING: InsightFinding = {
  ...FINDING,
  title: "Cloudflare source evidence unavailable",
  explanation: "cloudflare.zone.aiaimate.com / cloudflare.httpRequests1dGroups.v1.7d returned no usable evidence.",
} as InsightFinding;

function issueFrom(doc: TrafficInsightDocument): ExistingIssue {
  const composed = composeIssue({
    action: ACTION,
    brief: doc.briefs[0],
    findings: doc.findings,
    insights: { generated_at: doc.generated_at },
    lifecycle: "detected",
    eligibility: "recommend",
  });
  return {
    number: 284,
    html_url: "https://github.com/weave0/goodflippindesign/issues/284",
    title: composed.title,
    body: composed.body,
    state: "open",
    labels: ["ti-work", "ti-lifecycle:detected", "ti-eligibility:recommend"],
    updated_at: doc.generated_at,
  };
}

describe("issue prose refresh", () => {
  it("extracts the three prose sections", () => {
    const body = issueFrom(insights(FINDING, STALE_SUMMARY, "2026-09-15T12:00:00.000Z")).body;
    const sections = proseSections(body);
    expect(sections["Primary finding"]).toContain("pages.projects.list");
    expect(sections["Brief"]).toContain("source measurement gap");
    expect(sections["Expected benefit"]).toContain("pages.projects.list");
  });

  it("detects a stale headline and ignores identical prose", () => {
    const first = issueFrom(insights(FINDING, STALE_SUMMARY, "2026-09-15T12:00:00.000Z")).body;
    const same = issueFrom(insights(FINDING, STALE_SUMMARY, "2026-09-19T12:00:00.000Z")).body;
    const current = issueFrom(insights(CURRENT_FINDING, CURRENT_SUMMARY, "2026-09-20T12:00:00.000Z")).body;
    expect(proseDiffers(first, same)).toBe(false);
    expect(proseDiffers(first, current)).toBe(true);
  });

  it("re-composes an issue whose headline finding was reclassified, keeping first-detection evidence and operator state", () => {
    const old = insights(FINDING, STALE_SUMMARY, "2026-09-15T12:00:00.000Z");
    const issue = issueFrom(old);
    expect(issue.body).toContain("ti-evidence-before");
    const next = insights(CURRENT_FINDING, CURRENT_SUMMARY, "2026-09-20T12:00:00.000Z");

    const plan = planWorkSync({ insights: next, issues: [issue] });
    const update = plan.plans.find((p) => p.kind === "update_body");
    expect(update, JSON.stringify(plan.plans.map((p) => p.kind))).toBeTruthy();
    if (update?.kind !== "update_body") throw new Error("unreachable");
    expect(update.reason).toMatch(/prose/);

    const body = update.composed!.body;
    expect(body).not.toContain("pages.projects.list");
    expect(body).toContain("httpRequests1dGroups.v1.7d returned no usable evidence");
    // first-detection "before" evidence and the machine block survive the re-compose
    expect(body).toContain("```ti-evidence-before");
    expect(body).toContain('"insights_generated_at":"2026-09-15T12:00:00.000Z"');
    const machine = parseMachineBlock(body);
    expect(machine?.action_id).toBe("action.brief._source.measurement");
    expect(machine?.lifecycle).toBe("detected");
  });

  it("does not touch an issue whose headline is still accurate", () => {
    const doc = insights(FINDING, STALE_SUMMARY, "2026-09-15T12:00:00.000Z");
    const issue = issueFrom(doc);
    const plan = planWorkSync({ insights: doc, issues: [issue] });
    expect(plan.plans.some((p) => p.kind === "update_body" && /prose/.test(p.reason ?? ""))).toBe(false);
  });
});
