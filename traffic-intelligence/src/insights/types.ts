export type InsightFindingKind = "issue" | "opportunity" | "success" | "data_gap" | "change";
export type InsightSeverity = "low" | "medium" | "high" | "critical" | "info";
export type InsightActionClass =
  | "observe"
  | "code"
  | "config"
  | "research"
  | "credential/instrumentation";
export type InsightPriority =
  | "act_now"
  | "investigate"
  | "watch"
  | "healthy"
  | "measurement_blocked";
export type InsightBriefCategory = "traffic" | "delivery" | "security" | "measurement" | "mixed";
export type InsightConfidence = "high" | "medium" | "low";
export type InsightEstateStatus = "stable" | "attention_required" | "degraded" | "insufficient_evidence";
export type InsightPersistenceWindow = "7d" | "28d";

export interface InsightCoverage {
  state: string;
  observed_fraction: number | null;
  missing_dates?: string[];
}

export interface InsightDailyPoint {
  date: string;
  value: number;
}

export interface InsightDailySeries {
  series_id: string;
  source: "cloudflare";
  property_id: string;
  metric_name: string;
  label: string;
  unit: string;
  source_metric_id: string;
  source_snapshot: string;
  evidence_state: "measured";
  exactness: string;
  coverage: InsightCoverage;
  observation_start: string;
  observation_end: string;
  points: InsightDailyPoint[];
  missing_dates: string[];
  limitations: string[];
}

export interface InsightComparison {
  metric_name: string;
  unit: string;
  current_start: string;
  current_end: string;
  baseline_start: string;
  baseline_end: string;
  current_value: number;
  baseline_value: number;
  absolute_delta: number;
  percent_delta: number | null;
  percentage_point_delta: number | null;
}

export interface InsightFinding {
  finding_id: string;
  kind: InsightFindingKind;
  severity: InsightSeverity;
  scope: "property" | "source";
  property_id: string | null;
  source_id: string;
  title: string;
  explanation: string;
  why_it_matters: string;
  recommended_action: string;
  verification_condition: string;
  action_class: InsightActionClass;
  source_metric_ids: string[];
  source_snapshots: string[];
  evidence_state: "measured" | "unavailable";
  exactness: string;
  coverage_state: string;
  comparison: InsightComparison | null;
  limitations: string[];
  created_at: string;
}

/** Schema 1.1 action: numeric priority 1–5 + categorical priority_class for ranking. */
export interface InsightAction {
  action_id: string;
  finding_id: string;
  finding_ids: string[];
  brief_id: string | null;
  /** Additive 1.0 numeric urgency (1–5). Prefer priority_class for ranking/UI. */
  priority: number;
  priority_class: InsightPriority;
  severity: InsightSeverity;
  scope: "property" | "source";
  property_id: string | null;
  action_class: InsightActionClass;
  recommended_action: string;
  verification_condition: string;
  evidence_refs: string[];
  status: "new";
}

export interface InsightMateriality {
  absolute_delta_requests: number | null;
  absolute_delta_pageviews: number | null;
  percent_delta: number | null;
}

export interface OperationalBrief {
  brief_id: string;
  property_id: string;
  category: InsightBriefCategory;
  headline: string;
  summary: string;
  severity: InsightSeverity;
  priority: InsightPriority;
  direction: "up" | "down" | "flat" | "unknown";
  materiality: InsightMateriality;
  persistence: InsightPersistenceWindow[];
  finding_ids: string[];
  corroborating_signals: string[];
  contradictory_signals: string[];
  confidence: InsightConfidence;
  recommended_action: string;
  verification_condition: string;
  action_class: InsightActionClass;
  limitations: string[];
}

export interface EstateBrief {
  status: InsightEstateStatus;
  top_changes: string[];
  top_wins: string[];
  measurement_limitations: string[];
  top_actions: string[];
  properties_to_inspect: string[];
}

export interface PropertyHealth {
  property_id: string;
  traffic: "declining" | "rising" | "stable" | "unknown";
  delivery: "healthy" | "degraded" | "unknown";
  threats: "elevated" | "normal" | "unknown";
  measurement: "complete" | "partial" | "blocked" | "unknown";
  overall: InsightPriority;
  notes: string;
}

export interface TrendComparison {
  property_id: string;
  metric_name: string;
  period_days: 7 | 28 | 90;
  current_start: string | null;
  current_end: string | null;
  baseline_start: string | null;
  baseline_end: string | null;
  current_value: number | null;
  baseline_value: number | null;
  absolute_delta: number | null;
  percent_delta: number | null;
  available: boolean;
  unavailable_reason: string | null;
  source: "cloudflare";
  exactness: string;
  coverage_state: string;
  expected_date_count: number | null;
  missing_dates: string[];
  source_metric_ids: string[];
  source_snapshots: string[];
}

export type EstateConfigState = "healthy" | "governance_gap" | "config_drift" | "unobserved";
export type EstateEvidenceClass = "zone" | "dns" | "pages";
export type EstateEvidenceStatus = "observed" | "no_project" | "unavailable";

export interface EstateConfigPropertyAccounting {
  property_id: string;
  state: EstateConfigState;
  reason: string;
  /** Which credential/authority proved (or failed to prove) each evidence class. */
  authorities: Record<string, string>;
  evidence_status: Record<string, string>;
  /** Safe reasons for any evidence class that is not `observed` (unavailable, or a positive no_project). */
  evidence_reasons: Record<string, string>;
}

export interface EstateConfigInventory {
  authority: string;
  complete: boolean;
  count: number;
}

/** Producer-governed reconciliation of the deployment/config estate (TI-012). */
export interface EstateConfigAccounting {
  schema_version: "1.1.0";
  governed_zone_count: number;
  accounted_zone_count: number;
  state_counts: Record<string, number>;
  zone_inventory: EstateConfigInventory;
  pages_inventory: EstateConfigInventory;
  credential_boundaries: string[];
  properties: EstateConfigPropertyAccounting[];
}

export interface TrafficInsightDocument {
  schema_version: "1.0.0" | "1.1.0";
  contract_name: "gfd-traffic-insights";
  fixture: boolean;
  generated_at: string;
  source_gold_schema_version: "1.2.0";
  source_gold_generated_at: string;
  series: InsightDailySeries[];
  findings: InsightFinding[];
  actions: InsightAction[];
  briefs: OperationalBrief[];
  estate_brief: EstateBrief | null;
  property_health: PropertyHealth[];
  /** Producer-governed equal-window comparative rows — sole source of numeric deltas. */
  trend_comparisons: TrendComparison[];
  limitations: string[];
  /** null when no estate deployment/config evidence was supplied: unobserved, never healthy. */
  estate_config?: EstateConfigAccounting | null;
}
