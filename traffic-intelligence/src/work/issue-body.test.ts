import { describe, expect, it } from "vitest";
import type { InsightAction } from "../insights/types";
import { composeIssue, parseMachineBlock, upsertMachineBlock } from "./issue-body";

const sampleAction: InsightAction = {
  action_id: "action.cloudflare.example.com.7d.cache-rate.issue",
  finding_id: "cloudflare.example.com.7d.cache-rate.issue",
  finding_ids: ["cloudflare.example.com.7d.cache-rate.issue"],
  brief_id: "brief.example.com.delivery.cache",
  priority: 2,
  priority_class: "investigate",
  severity: "medium",
  scope: "property",
  property_id: "example.com",
  action_class: "config",
  recommended_action: "Inspect cache rules and bypass conditions.",
  verification_condition: "Confirm cache rate recovers after config change.",
  evidence_refs: ["snapshot-fixture"],
  status: "new",
};

describe("issue body machine block", () => {
  it("roundtrips action_id and stable keys", () => {
    const composed = composeIssue({
      action: sampleAction,
      insights: { generated_at: "2026-09-15T12:00:00.000Z" },
      eligibility: "recommend",
      lifecycle: "detected",
    });
    const parsed = parseMachineBlock(composed.body);
    expect(parsed).not.toBeNull();
    expect(parsed!.action_id).toBe(sampleAction.action_id);
    expect(parsed!.property_id).toBe("example.com");
    expect(parsed!.target_repo).toBe("weave0/goodflippindesign");
    expect(parsed!.lifecycle).toBe("detected");
    expect(parsed!.verification_condition).toContain("cache rate");
    expect(parsed!.insights_generated_at).toBe("2026-09-15T12:00:00.000Z");
    expect(composed.body).toContain("## Traffic Intelligence work item");
    expect(composed.labels).toContain("ti-work");
  });

  it("upserts machine block without losing action_id parse", () => {
    const composed = composeIssue({ action: sampleAction, eligibility: "auto" });
    const next = upsertMachineBlock(composed.body, {
      ...parseMachineBlock(composed.body)!,
      lifecycle: "in_progress",
      snooze_until: "2026-09-20",
    });
    const parsed = parseMachineBlock(next);
    expect(parsed!.lifecycle).toBe("in_progress");
    expect(parsed!.snooze_until).toBe("2026-09-20");
    expect(parsed!.action_id).toBe(sampleAction.action_id);
  });
});
