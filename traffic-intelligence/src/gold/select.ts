import type {
  ActorRecord,
  CoverageState,
  EvidenceState,
  GoldContract,
  Metric,
  RankedItem,
  SiteRecord,
  SourceId,
  WindowPayload,
} from "./types";
import { COVERAGE_STATES, EVIDENCE_STATES } from "./types";
import type { Filters } from "./url-state";

export function selectWindow(gold: GoldContract, windowId: string): WindowPayload {
  return gold.windows[windowId] ?? gold.windows[gold.defaultWindowId] ?? Object.values(gold.windows)[0]!;
}

export function selectSite(payload: WindowPayload, siteId: string): SiteRecord | null {
  if (!siteId || siteId === "all") return null;
  return payload.sites.find((site) => site.id === siteId) ?? null;
}

export function metricById(metrics: Metric[], id: string): Metric | undefined {
  return metrics.find((metric) => metric.id === id);
}

export function unavailable(partial: Pick<Metric, "id" | "label" | "source" | "grain" | "definitionId" | "pipelineVersion" | "timeWindow">): Metric {
  return {
    ...partial,
    metric_id: partial.id,
    metric_definition: partial.definitionId,
    value: null,
    evidence_state: "unavailable",
    evidenceState: "unavailable",
    exactness: "unknown",
    coverage: { state: "source_unavailable" },
    coverageState: "source_unavailable",
    limitations: ["No matching Gold slice for the current filters."],
  };
}

/**
 * Filter ranked rows by the current URL filters.
 * This is selection, not calculation: rows are kept or dropped as written.
 */
export function filterRanked(rows: RankedItem[], filters: Filters): RankedItem[] {
  return rows.filter((row) => {
    if (filters.source !== "all" && row.source !== filters.source) return false;
    if (filters.quality !== "all" && row.evidence_state !== filters.quality && row.evidenceState !== filters.quality) return false;
    if (filters.coverage !== "all" && row.coverage !== filters.coverage) return false;
    if (filters.path && !row.label.toLowerCase().includes(filters.path.toLowerCase()) && row.id !== filters.path) {
      return false;
    }
    if (filters.status !== "all" && row.label !== filters.status && row.id !== filters.status && !row.id.endsWith(`.${filters.status}`)) {
      return false;
    }
    if (filters.country !== "all" && row.id !== filters.country && !row.id.endsWith(`.${filters.country}`) && row.label !== filters.country) {
      return false;
    }
    if (filters.device !== "all" && row.id !== filters.device && row.label !== filters.device) return false;
    if (filters.browser !== "all" && row.id !== filters.browser && row.label !== filters.browser) return false;
    if (filters.contentType !== "all" && row.id !== filters.contentType && row.label !== filters.contentType) return false;
    if (filters.cache !== "all" && row.id !== filters.cache && row.label !== filters.cache) return false;
    if (filters.taxonomy !== "all" && row.id !== filters.taxonomy && row.id !== `tax.${filters.taxonomy}`) return false;
    return true;
  });
}

export function filterMetrics(metrics: Metric[], filters: Filters): Metric[] {
  return metrics.filter((metric) => {
    if (filters.source !== "all" && metric.source !== filters.source) return false;
    if (filters.quality !== "all" && metric.evidence_state !== filters.quality && metric.evidenceState !== filters.quality) return false;
    if (filters.coverage !== "all" && metric.coverageState !== filters.coverage && metric.coverage.state !== filters.coverage) return false;
    if (filters.confidence !== "all") {
      const ci = metric.confidence_interval ?? metric.confidence;
      const lower = ci && ("lower_bound" in ci ? ci.lower_bound : "lower" in ci ? ci.lower : undefined);
      const upper = ci && ("upper_bound" in ci ? ci.upper_bound : "upper" in ci ? ci.upper : undefined);
      const valid = ci && ("valid" in ci ? ci.valid : ci.intervalValid);
      const hasBounds = typeof lower === "number" && typeof upper === "number";
      if (filters.confidence === "has_interval" && !hasBounds) return false;
      if (filters.confidence === "invalid" && valid !== false) return false;
      if (filters.confidence === "none" && ci) return false;
    }
    return true;
  });
}

export function filterActors(actors: ActorRecord[], filters: Filters): ActorRecord[] {
  return actors.filter((actor) => {
    if (filters.actor !== "all" && actor.id !== filters.actor && actor.name !== filters.actor) return false;
    if (
      filters.class !== "all" &&
      actor.class !== filters.class &&
      actor.normalizedClass !== filters.class &&
      actor.sourceNativeClass !== filters.class
    ) {
      return false;
    }
    if (filters.source !== "all" && actor.source !== filters.source && actor.source !== "cloudflare") return false;
    if (filters.site !== "all") {
      const hitsSite = actor.targetSites.some(
        (site) => site.id.endsWith(`.${filters.site}`) || site.label.includes(filters.site),
      );
      if (!hitsSite) return false;
    }
    return true;
  });
}

export function definitionMap(gold: GoldContract): Map<string, (typeof gold.definitions)[number]> {
  return new Map(gold.definitions.map((definition) => [definition.id, definition]));
}

export function sourceNote(gold: GoldContract, id: SourceId) {
  return gold.sources.find((source) => source.id === id);
}

export function isEvidenceState(value: string): value is EvidenceState {
  return (EVIDENCE_STATES as readonly string[]).includes(value);
}

export function isCoverageState(value: string): value is CoverageState {
  return (COVERAGE_STATES as readonly string[]).includes(value);
}

/** Overview cards come from the window payload — never from summing sites. */
export function overviewMetrics(payload: WindowPayload, site: SiteRecord | null): Metric[] {
  if (site) return site.metrics;
  return payload.overview.metrics;
}
