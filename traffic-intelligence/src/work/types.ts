/** Work-queue contract: insights → GitHub issues → verification loop (TI-009). */

export type WorkEligibility = "auto" | "recommend";

export type WorkLifecycle =
  | "detected"
  | "triaged"
  | "accepted"
  | "in_progress"
  | "verify"
  | "resolved"
  | "dismissed";

export const WORK_LIFECYCLES: readonly WorkLifecycle[] = [
  "detected",
  "triaged",
  "accepted",
  "in_progress",
  "verify",
  "resolved",
  "dismissed",
] as const;

export const DEFAULT_TARGET_REPO = "weave0/goodflippindesign";

export const WORK_QUEUE_CONTRACT = "gfd-ti-work-queue";
export const WORK_QUEUE_SCHEMA_VERSION = "1.0.0";

/** Labels owned by the sync / operator funnel. */
export const TI_WORK_LABEL = "ti-work";
export const TI_ELIGIBILITY_AUTO = "ti-eligibility:auto";
export const TI_ELIGIBILITY_RECOMMEND = "ti-eligibility:recommend";

export function lifecycleLabel(lifecycle: WorkLifecycle): string {
  return `ti-lifecycle:${lifecycle}`;
}

export function priorityLabelName(priorityClass: string): string {
  return `ti-priority:${priorityClass}`;
}

/** Stable keys parsed from the issue machine block. */
export interface WorkMachineBlock {
  action_id: string;
  lifecycle: WorkLifecycle;
  property_id: string | null;
  target_repo: string;
  insights_generated_at: string | null;
  verification_condition: string;
  /** ISO date YYYY-MM-DD when set; sync skips until this date (inclusive end). */
  snooze_until: string | null;
  eligibility: WorkEligibility;
  brief_id: string | null;
  finding_ids: string[];
  priority_class: string | null;
  confidence: string | null;
}

export interface WorkQueueItem {
  action_id: string;
  issue_number: number | null;
  html_url: string | null;
  lifecycle: WorkLifecycle;
  eligibility: WorkEligibility;
  property_id: string | null;
  target_repo: string;
  title: string;
  priority_class: string;
  confidence: string | null;
  severity: string | null;
  recommended_action: string;
  verification_condition: string;
  brief_id: string | null;
  finding_ids: string[];
  snooze_until: string | null;
  updated_at: string | null;
}

export interface WorkQueueDocument {
  contract_name: typeof WORK_QUEUE_CONTRACT;
  schema_version: typeof WORK_QUEUE_SCHEMA_VERSION;
  fixture: boolean;
  generated_at: string;
  source_insights_generated_at: string | null;
  target_repo: string;
  /** Items keyed by action_id for O(1) cockpit lookup. */
  items: Record<string, WorkQueueItem>;
  limitations: string[];
}

/** Materiality thresholds for opportunity auto-eligibility (documented). */
export const MATERIALITY_PERCENT_DELTA_MIN = 0.1;
export const MATERIALITY_ABS_REQUESTS_MIN = 1000;
export const MATERIALITY_ABS_PAGEVIEWS_MIN = 1000;

/** Cap auto-creates per sync run (prefer highest priority). */
export const AUTO_CREATE_CAP_PER_RUN = 25;
