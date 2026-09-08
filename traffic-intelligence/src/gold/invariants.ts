/**
 * Scientific invariants the UI must not violate.
 * Tests assert these against the adapted Gold document. Views do not calculate.
 */
import { formatMetric } from "./format";
import { collectMetrics } from "./assert";
import { selectWindow } from "./select";
import type { GoldContract, Metric } from "./types";
import { NATIVE_AI_CLASSES } from "./types";

export function absentDoesNotRenderZero(metric: Metric): boolean {
  if (metric.evidenceState !== "UNAVAILABLE" && metric.evidenceState !== "UNKNOWABLE") return true;
  if (metric.value !== null) return false;
  const rendered = formatMetric(metric);
  return rendered !== "0" && rendered !== "0.0";
}

export function inferredDistinctFromEstimated(metrics: Metric[]): boolean {
  const inferred = metrics.filter((m) => m.evidenceState === "INFERRED");
  const estimated = metrics.filter((m) => m.evidenceState === "ESTIMATED");
  if (!inferred.length || !estimated.length) return false;
  return inferred.every((m) => m.evidenceState !== "ESTIMATED") && estimated.every((m) => m.evidenceState !== "INFERRED");
}

export function coverageIndependentOfEvidence(metrics: Metric[]): boolean {
  return metrics.some((m) => m.coverage === "INCOMPLETE" && m.evidenceState !== undefined);
}

export function unknownClassVisible(gold: GoldContract): boolean {
  const payload = selectWindow(gold, gold.defaultWindowId);
  return payload.taxonomy.some(
    (row) => row.normalizedClass === "unknown" || row.label === "UNKNOWN" || row.id === "tax.unknown",
  );
}

export function nativeAiClassesSurvive(gold: GoldContract): boolean {
  const payload = selectWindow(gold, gold.defaultWindowId);
  const native = new Set(
    [...payload.ai.classTotals, ...payload.taxonomy]
      .map((row) => row.sourceNativeClass ?? row.label)
      .filter(Boolean),
  );
  return NATIVE_AI_CLASSES.every((name) => native.has(name));
}

export function invalidCiPreserved(metric: Metric | undefined): boolean {
  if (!metric?.confidence) return false;
  const c = metric.confidence;
  return c.intervalValid === false && c.lower === 453.21 && c.upper === 1746.79 && metric.value === 1100;
}

export function zoneUniquesAreNotEcosystemHumans(gold: GoldContract): boolean {
  const metrics = collectMetrics(gold);
  for (const metric of metrics) {
    if (metric.uniqueSemantics === "sum_of_zone_uniques" || metric.uniqueSemantics === "source_native_zone_unique") {
      if (/ecosystem unique humans/i.test(metric.label)) return false;
    }
  }
  const claimed = metrics.filter((m) => m.uniqueSemantics === "deduplicated_ecosystem_unique");
  return claimed.every((m) => m.evidenceState === "UNKNOWABLE" || m.evidenceState === "UNAVAILABLE" || m.source !== "cloudflare_edge" || Boolean(m.definitionId));
}

export function overviewNotSumOfSitesOrCrossSource(gold: GoldContract): boolean {
  const payload = selectWindow(gold, "28d");
  const overview = payload.overview.metrics.find((m) => m.id === "edge.requests");
  const siteSum = payload.sites.reduce((acc, site) => {
    const requests = site.metrics.find((m) => m.id.endsWith(".requests") && m.source === "cloudflare_edge");
    return acc + (requests?.value ?? 0);
  }, 0);
  const rum = payload.overview.metrics.find((m) => m.id === "rum.pageviews")?.value ?? 0;
  const ga4 = payload.overview.metrics.find((m) => m.id === "ga4.sessions")?.value ?? 0;
  const vercel = payload.overview.metrics.find((m) => m.id === "vercel.requests")?.value ?? 0;
  if (overview?.value == null) return false;
  if (overview.value === siteSum) return false;
  if (overview.value === rum + ga4 + vercel) return false;
  return overview.source === "cloudflare_edge";
}

export function ratioSemanticsSurvive(metric: Metric | undefined): boolean {
  if (!metric?.ratio) return false;
  return (
    typeof metric.ratio.value === "number" &&
    Boolean(metric.ratio.unit) &&
    metric.ratio.authoritative === true &&
    typeof metric.ratio.numeratorRef === "string" &&
    typeof metric.ratio.denominatorRef === "string"
  );
}

export function fixtureModeIdentifiable(gold: GoldContract): boolean {
  return gold.contract.kind === "fixture";
}

export function neverDeriveEcosystemFromSources(metrics: Metric[]): boolean {
  const forbidden = new Set(["combined", "total", "all_sources", "blended"]);
  return metrics.every((m) => !forbidden.has(m.source));
}
