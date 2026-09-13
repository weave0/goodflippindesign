export type InsightFindingKind = "issue" | "opportunity" | "success" | "data_gap" | "change";
export type InsightSeverity = "low" | "medium" | "high" | "critical";
export type InsightActionClass =
  | "observe"
  | "code"
  | "config"
  | "research"
  | "credential/instrumentation";

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

export interface InsightAction {
  action_id: string;
  finding_id: string;
  priority: number;
  severity: InsightSeverity;
  scope: "property" | "source";
  property_id: string | null;
  action_class: InsightActionClass;
  recommended_action: string;
  verification_condition: string;
  evidence_refs: string[];
  status: "new";
}

export interface TrafficInsightDocument {
  schema_version: "1.0.0";
  contract_name: "gfd-traffic-insights";
  fixture: boolean;
  generated_at: string;
  source_gold_schema_version: "1.2.0";
  source_gold_generated_at: string;
  series: InsightDailySeries[];
  findings: InsightFinding[];
  actions: InsightAction[];
  limitations: string[];
}
