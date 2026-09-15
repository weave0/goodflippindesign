import { describe, expect, it } from "vitest";
import { diffEvidence, parseBeforeSnapshot, upsertEvidenceSection, type EvidenceSnapshot } from "./evidence";

const base: EvidenceSnapshot = {
  insights_generated_at: "2026-09-01T00:00:00.000Z",
  priority_class: "measurement_blocked",
  severity: "medium",
  confidence: "low",
  percent_delta: null,
  absolute_delta_requests: null,
  absolute_delta_pageviews: null,
  missing_dates_count: 60,
  finding_ids: ["f1"],
  headline: "gap",
};

describe("evidence diff", () => {
  it("marks improved when missing_dates shrinks", () => {
    const diff = diffEvidence(base, { ...base, missing_dates_count: 40, insights_generated_at: "2026-09-15T00:00:00.000Z" });
    expect(diff.delta).toBe("improved");
  });

  it("marks unknown without before (fail-closed)", () => {
    expect(diffEvidence(null, base).delta).toBe("unknown");
  });

  it("preserves before snapshot across upserts", () => {
    let body = "## Work\n\n<!-- ti-work-machine\naction_id: a1\nlifecycle: detected\nproperty_id: x.com\ntarget_repo: weave0/goodflippindesign\ninsights_generated_at: null\nverification_condition: v\nsnooze_until: null\neligibility: auto\nbrief_id: null\nfinding_ids: []\npriority_class: measurement_blocked\nconfidence: low\nroot_cause_key: null\ngroup_role: standalone\ngroup_issue_number: null\nimpact_score: 10\nimpact_class: low\n-->\n";
    body = upsertEvidenceSection(body, base);
    const before = parseBeforeSnapshot(body);
    expect(before?.missing_dates_count).toBe(60);
    body = upsertEvidenceSection(body, { ...base, missing_dates_count: 40 });
    expect(parseBeforeSnapshot(body)?.missing_dates_count).toBe(60);
    expect(body).toMatch(/Delta:\*\* `improved`/);
  });
});
