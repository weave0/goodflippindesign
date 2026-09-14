import type { NamedSeries, WindowPayload } from "../gold/types";
import type {
  EstateBrief,
  InsightAction,
  InsightDailySeries,
  InsightFinding,
  InsightFindingKind,
  InsightPriority,
  OperationalBrief,
  PropertyHealth,
  TrafficInsightDocument,
  TrendComparison,
} from "./types";

const TREND_METRICS = new Set(["requests", "pageViews", "cachedRequests", "threats"]);

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export const PRIORITY_RANK: Record<InsightPriority, number> = {
  act_now: 0,
  investigate: 1,
  measurement_blocked: 2,
  watch: 3,
  healthy: 4,
};

export const DEFAULT_BRIEF_PRIORITIES: InsightPriority[] = ["act_now", "investigate"];

function severityRank(value: string): number {
  return SEVERITY_RANK[value] ?? 99;
}

export function priorityRank(value: InsightPriority | number | string): number {
  if (typeof value === "number") return value;
  return PRIORITY_RANK[value as InsightPriority] ?? 99;
}

/** Exact property match only — no suffix leak between example.com and shop.example.com. */
export function matchesProperty(propertyId: string | null | undefined, siteDomain: string | null): boolean {
  if (!siteDomain) return true;
  if (!propertyId) return false;
  return propertyId.toLowerCase() === siteDomain.toLowerCase();
}

export function partitionFindings(
  insights: TrafficInsightDocument | null,
  siteDomain: string | null,
): {
  needsAttention: InsightFinding[];
  momentum: InsightFinding[];
  gaps: InsightFinding[];
} {
  if (!insights) return { needsAttention: [], momentum: [], gaps: [] };
  const filtered = insights.findings.filter((finding) => matchesProperty(finding.property_id, siteDomain));
  const sortFindings = (rows: InsightFinding[]) =>
    [...rows].sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.title.localeCompare(b.title));

  const needsAttention = sortFindings(filtered.filter((f) => f.kind === "issue" || f.kind === "change"));
  const momentum = sortFindings(filtered.filter((f) => f.kind === "success" || f.kind === "opportunity"));
  const gaps = sortFindings(filtered.filter((f) => f.kind === "data_gap"));
  return { needsAttention, momentum, gaps };
}

function actionPriorityClass(action: InsightAction): InsightPriority {
  return action.priority_class;
}

export function prioritizedActions(
  insights: TrafficInsightDocument | null,
  siteDomain: string | null,
): InsightAction[] {
  if (!insights) return [];
  return [...insights.actions]
    .filter((action) => matchesProperty(action.property_id, siteDomain))
    .sort(
      (a, b) =>
        priorityRank(actionPriorityClass(a)) - priorityRank(actionPriorityClass(b)) ||
        severityRank(a.severity) - severityRank(b.severity) ||
        a.action_id.localeCompare(b.action_id),
    );
}

export function rankedBriefs(
  insights: TrafficInsightDocument | null,
  siteDomain: string | null,
  priorities: InsightPriority[] = DEFAULT_BRIEF_PRIORITIES,
): OperationalBrief[] {
  if (!insights?.briefs?.length) return [];
  const allow = new Set(priorities);
  return [...insights.briefs]
    .filter((brief) => matchesProperty(brief.property_id, siteDomain))
    .filter((brief) => allow.has(brief.priority))
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        severityRank(a.severity) - severityRank(b.severity) ||
        materialityScore(b) - materialityScore(a) ||
        a.headline.localeCompare(b.headline),
    );
}

/**
 * Tie-break only. Never add absolute_delta_requests + pageviews (different units).
 * Prefer requests absolute, else pageviews absolute, else percent — separate dimensions.
 */
export function materialityScore(brief: OperationalBrief): number {
  const m = brief.materiality ?? {
    absolute_delta_requests: null,
    absolute_delta_pageviews: null,
    percent_delta: null,
  };
  if (m.absolute_delta_requests != null) return Math.abs(m.absolute_delta_requests);
  if (m.absolute_delta_pageviews != null) return Math.abs(m.absolute_delta_pageviews);
  if (m.percent_delta != null) return Math.abs(m.percent_delta);
  return 0;
}

export function estateBriefOf(insights: TrafficInsightDocument | null): EstateBrief | null {
  return insights?.estate_brief ?? null;
}

export function propertyHealthRows(
  insights: TrafficInsightDocument | null,
  siteDomain: string | null,
): PropertyHealth[] {
  if (!insights?.property_health?.length) return [];
  return [...insights.property_health]
    .filter((row) => matchesProperty(row.property_id, siteDomain))
    .sort(
      (a, b) =>
        priorityRank(a.overall) - priorityRank(b.overall) || a.property_id.localeCompare(b.property_id),
    );
}

export function briefsForProperty(
  insights: TrafficInsightDocument | null,
  propertyId: string,
): OperationalBrief[] {
  if (!insights?.briefs?.length) return [];
  return rankedBriefs(insights, propertyId, ["act_now", "investigate", "watch", "healthy", "measurement_blocked"]);
}

function windowDayCount(payload: WindowPayload): number | null {
  const match = /^(\d+)d$/.exec(payload.window.id);
  if (match) return Number(match[1]);
  const start = Date.parse(payload.window.start);
  const end = Date.parse(payload.window.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return Math.round((end - start) / (24 * 60 * 60 * 1000));
}

/** Visualization-only: slice observation points for charts. Never use for analytical deltas. */
function sliceSeriesToWindow(series: InsightDailySeries, payload: WindowPayload): InsightDailySeries | null {
  const days = windowDayCount(payload);
  if (!days || !series.points.length) return null;
  const end = series.points[series.points.length - 1]!.date;
  const endMs = Date.parse(end);
  const startMs = endMs - (days - 1) * 24 * 60 * 60 * 1000;
  const points = series.points.filter((point) => {
    const t = Date.parse(point.date);
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
  if (!points.length) return null;
  return { ...series, points };
}

function toNamedSeries(series: InsightDailySeries, metricName: string, labelOverride?: string): NamedSeries {
  const coverage = series.coverage.state as NamedSeries["coverage"];
  return {
    id: series.series_id,
    label: labelOverride ?? `${series.label} · ${series.property_id}`,
    source: "cloudflare",
    grain: metricName === "pageViews" ? "edge_pageview" : "request",
    evidence_state: "measured",
    evidenceState: "measured",
    exactness:
      series.exactness === "exact" ||
      series.exactness === "inexact" ||
      series.exactness === "not_applicable" ||
      series.exactness === "unknown"
        ? series.exactness
        : "unknown",
    coverage,
    definitionId: series.source_metric_id,
    points: series.points.map((point) => ({
      date: point.date,
      value: point.value,
      evidence_state: "measured",
      evidenceState: "measured",
    })),
  };
}

export function insightTrendSeries(
  insights: TrafficInsightDocument | null,
  payload: WindowPayload,
  siteDomain: string | null,
  metricName: string,
): NamedSeries[] {
  if (!insights || !TREND_METRICS.has(metricName)) return [];
  return insights.series
    .filter((series) => series.metric_name === metricName)
    .filter((series) => matchesProperty(series.property_id, siteDomain))
    .map((series) => sliceSeriesToWindow(series, payload))
    .filter((series): series is InsightDailySeries => series !== null)
    .map((series) => toNamedSeries(series, metricName));
}

/** Focused single-property chart (avoids 25 independent mini-series). Exact property match. */
export function focusedTrendSeries(
  insights: TrafficInsightDocument | null,
  payload: WindowPayload,
  propertyId: string | null,
  metricName: string,
): NamedSeries[] {
  if (!propertyId) return [];
  return insightTrendSeries(insights, payload, propertyId, metricName).slice(0, 1);
}

export interface TrendChangeRow {
  property_id: string;
  metric_name: string;
  period_days: 7 | 28 | 90;
  label: string;
  unit: string;
  current_value: number | null;
  prior_value: number | null;
  absolute_delta: number | null;
  percent_delta: number | null;
  available: boolean;
  unavailable_reason: string | null;
  missing_dates: string[];
  coverage_state: string;
  source: "cloudflare";
  exactness: string;
}

function unitForMetric(metricName: string): string {
  switch (metricName) {
    case "pageViews":
      return "page views";
    case "cachedRequests":
      return "cached requests";
    case "threats":
      return "threats";
    default:
      return "requests";
  }
}

function toTrendChangeRow(row: TrendComparison): TrendChangeRow {
  return {
    property_id: row.property_id,
    metric_name: row.metric_name,
    period_days: row.period_days,
    label: `${row.metric_name} · ${row.period_days}d`,
    unit: unitForMetric(row.metric_name),
    current_value: row.available ? row.current_value : null,
    prior_value: row.available ? row.baseline_value : null,
    absolute_delta: row.available ? row.absolute_delta : null,
    percent_delta: row.available ? row.percent_delta : null,
    available: row.available,
    unavailable_reason: row.unavailable_reason,
    missing_dates: row.missing_dates ?? [],
    coverage_state: row.coverage_state,
    source: "cloudflare",
    exactness: row.exactness,
  };
}

/**
 * Ranked comparative change table from producer trend_comparisons only.
 * Never half-splits browser series or invents windows from last observed points.
 */
export function rankedTrendChanges(
  insights: TrafficInsightDocument | null,
  payload: WindowPayload,
  metricName: string,
  siteDomain: string | null,
  limit = 8,
): TrendChangeRow[] {
  if (!insights?.trend_comparisons?.length || !TREND_METRICS.has(metricName)) return [];
  const periodDays = windowDayCount(payload);
  if (periodDays !== 7 && periodDays !== 28 && periodDays !== 90) return [];

  const rows = insights.trend_comparisons
    .filter((row) => row.metric_name === metricName)
    .filter((row) => row.period_days === periodDays)
    .filter((row) => matchesProperty(row.property_id, siteDomain))
    .map(toTrendChangeRow);

  return rows
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return (
        Math.abs(b.absolute_delta ?? 0) - Math.abs(a.absolute_delta ?? 0) ||
        a.property_id.localeCompare(b.property_id)
      );
    })
    .slice(0, limit);
}

type FindingCountRow = Record<InsightFindingKind | "total", number>;

function emptyFindingCounts(): FindingCountRow {
  return { total: 0, issue: 0, opportunity: 0, success: 0, data_gap: 0, change: 0 };
}

export function findingCountsByProperty(insights: TrafficInsightDocument | null): Map<string, FindingCountRow> {
  const map = new Map<string, FindingCountRow>();
  if (!insights) return map;
  for (const finding of insights.findings) {
    const key = finding.property_id ?? finding.source_id;
    const row = map.get(key) ?? emptyFindingCounts();
    row.total += 1;
    row[finding.kind] += 1;
    map.set(key, row);
  }
  return map;
}

export const TREND_METRIC_OPTIONS = [
  { id: "requests", label: "Requests" },
  { id: "pageViews", label: "Page Views" },
  { id: "cachedRequests", label: "Cache" },
  { id: "threats", label: "Threats" },
] as const;

export function priorityLabel(priority: InsightPriority): string {
  switch (priority) {
    case "act_now":
      return "Act now";
    case "investigate":
      return "Investigate";
    case "watch":
      return "Watch";
    case "healthy":
      return "Healthy";
    case "measurement_blocked":
      return "Measurement blocked";
    default:
      return priority;
  }
}

export function estateStatusLabel(status: EstateBrief["status"]): string {
  switch (status) {
    case "stable":
      return "Stable";
    case "attention_required":
      return "Attention required";
    case "degraded":
      return "Degraded";
    case "insufficient_evidence":
      return "Insufficient evidence";
    default:
      return status;
  }
}
