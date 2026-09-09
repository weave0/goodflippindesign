import type { CoverageState, EvidenceState, Exactness, Metric, SourceId } from "./types";
import { ABSENT_EVIDENCE, SOURCES } from "./canonical";

const SOURCE_LABEL: Record<SourceId, string> = {
  cloudflare: "Cloudflare",
  ga4: "GA4",
  vercel: "Vercel",
  first_party: "First-party",
  combined: "Combined (declared)",
};

export function sourceLabel(id: SourceId): string {
  return SOURCE_LABEL[id] ?? id;
}

export function isSourceId(value: string): value is SourceId {
  return (SOURCES as readonly string[]).includes(value);
}

export function isAbsentMetric(metric: Pick<Metric, "evidence_state" | "evidenceState" | "value">): boolean {
  const state = metric.evidence_state ?? metric.evidenceState;
  return (ABSENT_EVIDENCE as readonly string[]).includes(state);
}

export function formatMetric(metric: Metric): string {
  if (isAbsentMetric(metric)) {
    const display = metric.display ?? metric.supplied_display;
    if (display && display !== "0" && display !== "0.0") return display;
    return (metric.evidence_state ?? metric.evidenceState) === "unknowable" ? "unknowable" : "—";
  }
  if (metric.display) return metric.display;
  if (metric.supplied_display) return metric.supplied_display;
  const ratioDisplay = metric.ratio && "supplied_display" in metric.ratio ? metric.ratio.supplied_display : metric.ratio && "display" in metric.ratio ? metric.ratio.display : undefined;
  if (ratioDisplay) return ratioDisplay;
  if (metric.value === null || metric.value === undefined) return "—";
  const formatted = formatNumber(metric.value);
  const state = metric.evidence_state ?? metric.evidenceState;
  if (state === "estimated" || state === "inferred") return `≈ ${formatted}`;
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
  const c = metric.confidence_interval ?? metric.confidence;
  if (!c) return null;
  const lower = "lower_bound" in c && c.lower_bound != null ? c.lower_bound : "lower" in c ? c.lower : undefined;
  const upper = "upper_bound" in c && c.upper_bound != null ? c.upper_bound : "upper" in c ? c.upper : undefined;
  const valid = "valid" in c ? c.valid : c.intervalValid;
  const parts: string[] = [];
  if (typeof lower === "number" && typeof upper === "number") {
    const span = `CI ${formatNumber(lower)}–${formatNumber(upper)}`;
    parts.push(valid === false ? `${span} (invalid)` : span);
  }
  if (typeof c.level === "number") parts.push(`${Math.round(c.level * 100)}% level`);
  if (valid === false) parts.push("interval not valid");
  if ("invalid_reason" in c && c.invalid_reason) parts.push(c.invalid_reason);
  if ("note" in c && c.note) parts.push(c.note);
  return parts.length ? parts.join(" · ") : null;
}

export function evidenceHint(state: EvidenceState): string {
  switch (state) {
    case "measured":
      return "Measured within the source product definition. Not automatically exact.";
    case "sampled":
      return "Sampled collection — not a census";
    case "inferred":
      return "Inferred from other measured signals by a declared method — not a statistical estimate";
    case "estimated":
      return "Modeled estimate with uncertainty — not a measurement";
    case "unavailable":
      return "Source did not emit this metric";
    case "unknowable":
      return "Cannot be known from available evidence";
    default:
      return state;
  }
}

export function exactnessHint(state: Exactness): string {
  switch (state) {
    case "exact":
      return "Exact within the source product definition";
    case "inexact":
      return "Inexact — measured or modeled with known imprecision";
    case "not_applicable":
      return "Exactness does not apply to this observation";
    case "unknown":
      return "Exactness was not supplied";
    default:
      return state;
  }
}

export function coverageHint(state: CoverageState): string {
  switch (state) {
    case "full_coverage":
      return "Declared coverage is complete for this slice";
    case "partial_coverage":
      return "Partial coverage";
    case "unknown_coverage":
      return "Coverage is unknown";
    case "source_unavailable":
      return "Source unavailable for this query";
    case "historical_data_unavailable":
      return "Requested history is outside retained data";
    case "retention_exceeded":
      return "Retention exceeded";
    case "instrumentation_absent":
      return "Instrumentation is absent";
    case "measurement_bypass":
      return "Measurement was bypassed";
    case "scope_blocked":
      return "Scope is blocked";
    case "structurally_unknowable":
      return "Structurally unknowable";
    default:
      return state;
  }
}

export function statusHint(state: EvidenceState | string): string {
  return evidenceHint(state as EvidenceState);
}

export function coverageStateOf(metric: Metric): CoverageState {
  if (metric.coverage && typeof metric.coverage === "object" && "state" in metric.coverage) return metric.coverage.state;
  return metric.coverageState;
}

export function neverRecomputeRatio(metric: Metric): number | null {
  if (!metric.ratio) return metric.value;
  if ("ratio_value" in metric.ratio && metric.ratio.ratio_value != null) return metric.ratio.ratio_value;
  if ("value" in metric.ratio && metric.ratio.value != null) return metric.ratio.value;
  return metric.value;
}
