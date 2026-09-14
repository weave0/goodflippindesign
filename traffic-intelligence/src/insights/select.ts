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
  watch: 2,
  healthy: 3,
  measurement_blocked: 4,
};

export const DEFAULT_BRIEF_PRIORITIES: InsightPriority[] = ["act_now", "investigate"];

function severityRank(value: string): number {
  return SEVERITY_RANK[value] ?? 99;
}

export function priorityRank(value: InsightPriority | number | string): number {
  if (typeof value === "number") return value;
  return PRIORITY_RANK[value as InsightPriority] ?? 99;
}

export function matchesProperty(propertyId: string | null | undefined, siteDomain: string | null): boolean {
  if (!siteDomain) return true;
  if (!propertyId) return false;
  const a = propertyId.toLowerCase();
  const b = siteDomain.toLowerCase();
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
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

export function prioritizedActions(
  insights: TrafficInsightDocument | null,
  siteDomain: string | null,
): InsightAction[] {
  if (!insights) return [];
  return [...insights.actions]
    .filter((action) => matchesProperty(action.property_id, siteDomain))
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
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

export function materialityScore(brief: OperationalBrief): number {
  const m = brief.materiality ?? {
    absolute_delta_requests: null,
    absolute_delta_pageviews: null,
    percent_delta: null,
  };
  const absReq = Math.abs(m.absolute_delta_requests ?? 0);
  const absPv = Math.abs(m.absolute_delta_pageviews ?? 0);
  const pct = Math.abs(m.percent_delta ?? 0) * 1000;
  return absReq + absPv + pct;
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

/** Focused single-property chart (avoids 25 independent mini-series). */
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
  label: string;
  unit: string;
  current_value: number;
  prior_value: number | null;
  absolute_delta: number | null;
  percent_delta: number | null;
  missing_dates: number;
  source: "cloudflare";
}

/** Ranked comparative change table from producer series (equal half-window vs prior half). */
export function rankedTrendChanges(
  insights: TrafficInsightDocument | null,
  payload: WindowPayload,
  metricName: string,
  siteDomain: string | null,
  limit = 8,
): TrendChangeRow[] {
  if (!insights || !TREND_METRICS.has(metricName)) return [];
  const rows: TrendChangeRow[] = [];
  for (const series of insights.series) {
    if (series.metric_name !== metricName) continue;
    if (!matchesProperty(series.property_id, siteDomain)) continue;
    const sliced = sliceSeriesToWindow(series, payload);
    if (!sliced || sliced.points.length < 4) continue;
    const mid = Math.floor(sliced.points.length / 2);
    const priorPts = sliced.points.slice(0, mid);
    const currentPts = sliced.points.slice(mid);
    const prior = priorPts.reduce((sum, p) => sum + p.value, 0);
    const current = currentPts.reduce((sum, p) => sum + p.value, 0);
    const absolute = current - prior;
    const percent = prior !== 0 ? absolute / prior : null;
    const missingInWindow = sliced.missing_dates.filter((d) => {
      const t = Date.parse(d);
      const start = Date.parse(sliced.points[0]!.date);
      const end = Date.parse(sliced.points[sliced.points.length - 1]!.date);
      return Number.isFinite(t) && t >= start && t <= end;
    }).length;
    rows.push({
      property_id: series.property_id,
      metric_name: series.metric_name,
      label: series.label,
      unit: series.unit,
      current_value: current,
      prior_value: prior,
      absolute_delta: absolute,
      percent_delta: percent,
      missing_dates: missingInWindow + (sliced.coverage.state !== "full_coverage" ? 1 : 0),
      source: "cloudflare",
    });
  }
  return rows
    .sort(
      (a, b) =>
        Math.abs(b.absolute_delta ?? 0) - Math.abs(a.absolute_delta ?? 0) ||
        a.property_id.localeCompare(b.property_id),
    )
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
