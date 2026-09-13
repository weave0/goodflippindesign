import type { NamedSeries, WindowPayload } from "../gold/types";
import type {
  InsightAction,
  InsightDailySeries,
  InsightFinding,
  InsightFindingKind,
  TrafficInsightDocument,
} from "./types";

const TREND_METRICS = new Set(["requests", "pageViews", "cachedRequests", "threats"]);

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function severityRank(value: string): number {
  return SEVERITY_RANK[value] ?? 99;
}

function matchesProperty(propertyId: string | null | undefined, siteDomain: string | null): boolean {
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
    .sort((a, b) => a.priority - b.priority || severityRank(a.severity) - severityRank(b.severity));
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
    .map((series) => ({
      id: series.series_id,
      label: `${series.label} · ${series.property_id}`,
      source: "cloudflare" as const,
      grain: "day" as const,
      evidence_state: "measured" as const,
      evidenceState: "measured" as const,
      exactness: series.exactness as NamedSeries["exactness"],
      coverage: series.coverage.state as NamedSeries["coverage"],
      definitionId: series.source_metric_id,
      points: series.points.map((point) => ({ date: point.date, value: point.value })),
    }));
}

export function findingCountsByProperty(insights: TrafficInsightDocument | null): Map<string, Record<InsightFindingKind | "total", number>> {
  const map = new Map<string, Record<string, number>>();
  if (!insights) return map as Map<string, Record<InsightFindingKind | "total", number>>;
  for (const finding of insights.findings) {
    const key = finding.property_id ?? finding.source_id;
    const row = map.get(key) ?? { total: 0, issue: 0, opportunity: 0, success: 0, data_gap: 0, change: 0 };
    row.total += 1;
    row[finding.kind] = (row[finding.kind] ?? 0) + 1;
    map.set(key, row);
  }
  return map as Map<string, Record<InsightFindingKind | "total", number>>;
}

export const TREND_METRIC_OPTIONS = [
  { id: "requests", label: "Requests" },
  { id: "pageViews", label: "Page Views" },
  { id: "cachedRequests", label: "Cache" },
  { id: "threats", label: "Threats" },
] as const;
