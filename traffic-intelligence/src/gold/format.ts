import type { Metric, SourceId } from "./types";
import { SOURCES } from "./types";

const SOURCE_LABEL: Record<SourceId, string> = {
  cloudflare_edge: "Cloudflare edge",
  cloudflare_rum: "Cloudflare RUM",
  ga4: "GA4",
  vercel: "Vercel",
  first_party: "First-party",
  modeled: "Modeled",
};

export function sourceLabel(id: SourceId): string {
  return SOURCE_LABEL[id] ?? id;
}

export function isSourceId(value: string): value is SourceId {
  return (SOURCES as readonly string[]).includes(value);
}

/** Display formatting only. Does not round estimated values when `display` is set. */
export function formatMetric(metric: Metric): string {
  if (metric.status === "UNAVAILABLE") return metric.display ?? "—";
  if (metric.display) return metric.display;
  if (metric.value === null) return "—";
  const formatted = formatNumber(metric.value);
  if (metric.status === "ESTIMATED") return `≈ ${formatted}`;
  return formatted;
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (Number.isInteger(value) || abs >= 100) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  if (abs >= 1) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
  }
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(value);
}

export function formatConfidence(metric: Metric): string | null {
  const c = metric.confidence;
  if (!c) return null;
  const parts: string[] = [];
  if (c.interval) {
    parts.push(`CI ${formatNumber(c.interval[0])}–${formatNumber(c.interval[1])}`);
  }
  if (typeof c.level === "number") {
    parts.push(`${Math.round(c.level * 100)}% level`);
  }
  if (c.note) parts.push(c.note);
  return parts.length ? parts.join(" · ") : null;
}

export function statusHint(status: Metric["status"]): string {
  switch (status) {
    case "EXACT":
      return "Exact within the source product definition";
    case "SAMPLED":
      return "Sampled collection — not a census";
    case "ESTIMATED":
      return "Modeled estimate — not a measurement";
    case "INCOMPLETE":
      return "Partial coverage — missing properties or days";
    case "UNAVAILABLE":
      return "Source did not emit this metric";
    default:
      return status;
  }
}
