import { describe, expect, it } from "vitest";
import { rankNextWork } from "./ranking";
import type { WorkQueueItem } from "./types";

function item(partial: Partial<WorkQueueItem> & Pick<WorkQueueItem, "action_id" | "impact_score">): WorkQueueItem {
  return {
    issue_number: 1,
    html_url: "https://example/1",
    lifecycle: "detected",
    eligibility: "auto",
    property_id: "a.com",
    target_repo: "weave0/goodflippindesign",
    title: "t",
    priority_class: "act_now",
    confidence: "high",
    severity: "high",
    recommended_action: "do",
    verification_condition: "v",
    brief_id: null,
    finding_ids: [],
    snooze_until: null,
    updated_at: null,
    impact_class: "high",
    impact_rationale: "r",
    root_cause_key: null,
    group_role: "standalone",
    group_member_action_ids: [],
    ...partial,
  };
}

describe("rankNextWork", () => {
  it("orders by impact_score and skips resolved/dismissed", () => {
    const rows = rankNextWork({
      a: item({ action_id: "a", impact_score: 40, issue_number: 1 }),
      b: item({ action_id: "b", impact_score: 90, issue_number: 2 }),
      c: item({ action_id: "c", impact_score: 99, lifecycle: "resolved", issue_number: 3 }),
      d: item({ action_id: "d", impact_score: 80, lifecycle: "dismissed", issue_number: 4 }),
    });
    expect(rows.map((r) => r.item.action_id)).toEqual(["b", "a"]);
  });

  it("collapses members under primary", () => {
    const rows = rankNextWork({
      p: item({
        action_id: "p",
        impact_score: 50,
        issue_number: 10,
        group_role: "primary",
        root_cause_key: "cloudflare.daily-coverage-gap",
      }),
      m: item({
        action_id: "m",
        impact_score: 20,
        issue_number: 10,
        group_role: "member",
        root_cause_key: "cloudflare.daily-coverage-gap",
      }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.item.action_id).toBe("p");
    expect(rows[0]?.members.map((m) => m.action_id)).toEqual(["m"]);
  });

  it("attaches members to an unpromoted primary from its roster", () => {
    const shared = { issue_number: null, html_url: null, root_cause_key: "cloudflare.daily-coverage-gap" };
    const rows = rankNextWork({
      p: item({
        ...shared,
        action_id: "p",
        impact_score: 50,
        property_id: "a.com",
        group_role: "primary",
        group_member_action_ids: ["p", "m1", "m2"],
      }),
      m1: item({ ...shared, action_id: "m1", impact_score: 20, property_id: "b.com", group_role: "member" }),
      m2: item({ ...shared, action_id: "m2", impact_score: 30, property_id: "c.com", group_role: "member" }),
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.members.map((m) => m.property_id)).toEqual(["c.com", "b.com"]);
  });
});
