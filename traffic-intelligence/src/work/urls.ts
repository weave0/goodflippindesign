import type { InsightAction, InsightFinding, OperationalBrief, TrafficInsightDocument } from "../insights/types";
import { composeIssue } from "./issue-body";
import { DEFAULT_TARGET_REPO, type WorkQueueItem } from "./types";

export function issueUrl(item: WorkQueueItem | null | undefined, targetRepo = DEFAULT_TARGET_REPO): string | null {
  if (item?.html_url) return item.html_url;
  if (item?.issue_number != null) return `https://github.com/${targetRepo}/issues/${item.issue_number}`;
  return null;
}

/** Prefill GitHub new-issue for promote / first open of a recommend action. */
export function newIssueUrl(options: {
  action: InsightAction;
  brief?: OperationalBrief | null;
  findings?: InsightFinding[];
  insights?: Pick<TrafficInsightDocument, "generated_at"> | null;
  targetRepo?: string;
  lifecycle?: "detected" | "dismissed" | "verify";
  eligibility?: "auto" | "recommend";
}): string {
  const targetRepo = options.targetRepo ?? DEFAULT_TARGET_REPO;
  const composed = composeIssue({
    action: options.action,
    brief: options.brief,
    findings: options.findings,
    insights: options.insights,
    lifecycle: options.lifecycle ?? "detected",
    eligibility: options.eligibility ?? "recommend",
    target_repo: targetRepo,
  });
  const labels = composed.labels.join(",");
  const params = new URLSearchParams({
    title: composed.title,
    body: composed.body,
    labels,
  });
  return `https://github.com/${targetRepo}/issues/new?${params.toString()}`;
}

export function issueCommentIntentUrl(
  htmlUrl: string,
  intent: "assign" | "dismiss" | "snooze" | "verify",
): string {
  // GitHub does not support prefilled comments via query; deep-link to issue and document intent.
  const anchor = `#ti-operator-${intent}`;
  return `${htmlUrl}${anchor}`;
}

export function snoozeUntilDate(days = 7, now = new Date()): string {
  const d = new Date(now.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
