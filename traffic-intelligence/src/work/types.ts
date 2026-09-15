/** Work-queue contract: insights → GitHub issues → verification loop (TI-009/TI-010). */

export type WorkEligibility = "auto" | "recommend";

export type WorkLifecycle =
  | "detected"
  | "triaged"
  | "accepted"
  | "in_progress"
  | "verify"
  | "resolved"
  | "dismissed"
  | "regressed";

export type ImpactClass = "critical" | "high" | "medium" | "low" | "informational";

export type GroupRole = "primary" | "member" | "standalone";

export const WORK_LIFECYCLES: readonly WorkLifecycle[] = [
  "detected",
  "triaged",
  "accepted",
  "in_progress",
  "verify",
  "resolved",
  "dismissed",
  "regressed",
] as const;

export const IMPACT_CLASSES: readonly ImpactClass[] = [
  "critical",
  "high",
  "medium",
  "low",
  "informational",
] as const;

export const DEFAULT_TARGET_REPO = "weave0/goodflippindesign";

export const WORK_QUEUE_CONTRACT = "gfd-ti-work-queue";
/** TI-010: additive metrics + impact/group fields. */
export const WORK_QUEUE_SCHEMA_VERSION = "1.1.0";

/** Labels owned by the sync / operator funnel. */
export const TI_WORK_LABEL = "ti-work";
export const TI_ELIGIBILITY_AUTO = "ti-eligibility:auto";
export const TI_ELIGIBILITY_RECOMMEND = "ti-eligibility:recommend";
export const TI_SUPERSEDED_LABEL = "ti-superseded";
export const TI_GROUP_PRIMARY_LABEL = "ti-group:primary";

export function lifecycleLabel(lifecycle: WorkLifecycle): string {
  return `ti-lifecycle:${lifecycle}`;
}

export function priorityLabelName(priorityClass: string): string {
  return `ti-priority:${priorityClass}`;
}

export function impactLabelName(impactClass: ImpactClass): string {
  return `ti-impact:${impactClass}`;
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
  /** TI-010: root-cause consolidation key (not property-scoped). */
  root_cause_key: string | null;
  group_role: GroupRole;
  /** Primary issue number when this action is a group member. */
  group_issue_number: number | null;
  impact_score: number | null;
  impact_class: ImpactClass | null;
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
  /** TI-010 additive fields */
  impact_score: number;
  impact_class: ImpactClass;
  impact_rationale: string;
  root_cause_key: string | null;
  group_role: GroupRole;
  group_member_action_ids: string[];
}

export interface WorkQueueMetrics {
  planned: number;
  auto: number;
  recommend: number;
  open_issues: number;
  by_lifecycle: Record<string, number>;
  by_impact_class: Record<string, number>;
  creates_last_sync: number;
  updates_last_sync: number;
  closes_last_sync: number;
  consolidated_groups: number;
  superseded_duplicates: number;
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
  /** TI-010 funnel metrics (additive). */
  metrics: WorkQueueMetrics;
}

/** Materiality thresholds for opportunity path (documented). */
export const MATERIALITY_PERCENT_DELTA_MIN = 0.1;
export const MATERIALITY_ABS_REQUESTS_MIN = 1000;
export const MATERIALITY_ABS_PAGEVIEWS_MIN = 1000;

/**
 * Cap auto-creates per sync run (prefer highest impact).
 * TI-010: keep tight — consolidation reduces volume further.
 */
export const AUTO_CREATE_CAP_PER_RUN = 15;

/** Operator-owned lifecycles that sync must not reset. */
export const OPERATOR_OWNED_LIFECYCLES: readonly WorkLifecycle[] = [
  "triaged",
  "accepted",
  "in_progress",
] as const;

/**
 * Conflict rules (GitHub labels are source of truth for operator-set states):
 * 1. GitHub `ti-lifecycle:*` label wins over machine-block lifecycle for operator states.
 * 2. Sync is the single writer of queue lifecycle from GH labels + measurements.
 * 3. Cockpit deep-links mutate GH via operator; next sync refreshes the queue.
 * 4. dismissed never reopened; snooze_until skips until date passes.
 * 5. verify/resolved driven by fresh insights (finding absence / materiality), not stale body alone.
 */
export const LIFECYCLE_CONFLICT_RULES = [
  "GitHub ti-lifecycle labels are authoritative for operator-set states (dismissed, snooze via label/machine, in_progress, accepted, triaged).",
  "Cockpit work-queue reflects GitHub after sync; sync is the single writer of queue lifecycle from GH + measurements.",
  "If cockpit cannot mutate GitHub directly, deep-links remain; queue lifecycle is refreshed on the next sync.",
  "Measurement-driven transitions (verify → resolved, reopen/regressed) use current insights, never fabricated clearance.",
] as const;
