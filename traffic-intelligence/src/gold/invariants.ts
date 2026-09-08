import { formatMetric } from "./format";
import type { Metric } from "./types";
import { sumOrNull } from "./null-arith";

export function absentDoesNotRenderZero(metric: Metric): boolean {
  const state = metric.evidence_state ?? metric.evidenceState;
  if (state !== "unavailable" && state !== "unknowable") return true;
  if (metric.value !== null) return false;
  const rendered = formatMetric(metric);
  return rendered !== "0" && rendered !== "0.0";
}

export function neverDeriveEcosystemFromSources(metrics: Metric[]): boolean {
  const forbidden = new Set(["total", "all_sources", "blended"]);
  return metrics.every((m) => !forbidden.has(m.source));
}

export { sumOrNull };
