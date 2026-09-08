import type { CoverageState, EvidenceState, Metric, SourceId } from "./types";
import { ABSENT_EVIDENCE, SOURCES } from "./types";

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

export function isAbsentMetric(metric: Pick<Metric, "evidenceState" | "value">): boolean {
  return (ABSENT_EVIDENCE as readonly string[]).includes(metric.evidenceState);
}

/** Display formatting only. Never renders 0 for UNAVAILABLE/UNKNOWABLE. */
export function formatMetric(metric: Metric): string {
  if (isAbsentMetric(metric)) {
    if (metric.display && metric.display !== "0" && metric.display !== "0.0") return metric.display;
    return metric.evidenceState === "UNKNOWABLE" ? "unknowable" : "—";
  }
  if (metric.display) return metric.display;
  if (metric.ratio?.display) return metric.ratio.display;
  if (metric.value === null) return "—";
  const formatted = formatNumber(metric.value);
  if (metric.evidenceState === "ESTIMATED" || metric.evidenceState === "INFERRED") return `≈ ${formatted}`;
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
  if (typeof c.lower === "number" && typeof c.upper === "number") {
    const span = `CI ${formatNumber(c.lower)}–${formatNumber(c.upper)}`;
    parts.push(c.intervalValid === false ? `${span} (invalid)` : span);
  }
  if (typeof c.level === "number") {
    parts.push(`${Math.round(c.level * 100)}% level`);
  }
  if (c.intervalValid === false) parts.push("interval not valid");
  if (c.note) parts.push(c.note);
  return parts.length ? parts.join(" · ") : null;
}

export function evidenceHint(state: EvidenceState): string {
  switch (state) {
    case "MEASURED":
      return "Measured within the source product definition";
    case "SAMPLED":
      return "Sampled collection — not a census";
    case "INFERRED":
      return "Inferred from other measured signals by a declared rule — not a statistical estimate";
    case "ESTIMATED":
      return "Modeled estimate with uncertainty — not a measurement";
    case "UNAVAILABLE":
      return "Source did not emit this metric";
    case "UNKNOWABLE":
      return "Cannot be known from available evidence";
    default:
      return state;
  }
}

export function coverageHint(state: CoverageState): string {
  switch (state) {
    case "COMPLETE":
      return "Declared coverage is complete for this slice";
    case "INCOMPLETE":
      return "Partial coverage — missing properties, days, or fields";
    case "MISSING":
      return "This source is missing for the slice";
    case "NOT_APPLICABLE":
      return "Coverage is not applicable to this metric";
    default:
      return state;
  }
}

/** @deprecated Use evidenceHint. Kept so older call sites compile during the pass. */
export function statusHint(state: EvidenceState | string): string {
  return evidenceHint(state as EvidenceState);
}
