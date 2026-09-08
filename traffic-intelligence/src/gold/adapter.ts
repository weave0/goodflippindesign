/**
 * Gold consumer adapter.
 *
 * First-class path: Canonical Gold 1.2 producer spellings (parseCanonicalGold12).
 * Compatibility path: legacy UX fixture / Gold 1.1 aliases (adaptLegacy).
 * Aliases are reader-only. They are not canonical producer fields.
 */
import type { CanonicalGold12, Gold12Metric, Gold12SourceSupport, SourceId } from "./canonical";
import { ABSENT_EVIDENCE, COVERAGE_STATES, EVIDENCE_STATES, EXACTNESS_STATES, SOURCES } from "./canonical";
import { isCanonicalGold12, parseCanonicalGold12 } from "./parse-canonical";
import type {
  ActorRecord,
  CoverageMetadata,
  CoverageState,
  Definition,
  EvidenceState,
  Exactness,
  GoldContract,
  Grain,
  Metric,
  RankedItem,
  SiteRecord,
  SourceDescriptor,
  WindowPayload,
} from "./types";

const LEGACY_EVIDENCE: Record<string, EvidenceState> = {
  EXACT: "measured",
  MEASURED: "measured",
  measured: "measured",
  SAMPLED: "sampled",
  sampled: "sampled",
  INFERRED: "inferred",
  inferred: "inferred",
  ESTIMATED: "estimated",
  estimated: "estimated",
  UNAVAILABLE: "unavailable",
  unavailable: "unavailable",
  UNKNOWABLE: "unknowable",
  unknowable: "unknowable",
  INCOMPLETE: "measured",
};

const LEGACY_EXACTNESS: Record<string, Exactness> = {
  EXACT: "exact",
  exact: "exact",
  inexact: "inexact",
  SAMPLED: "inexact",
  ESTIMATED: "inexact",
  INFERRED: "not_applicable",
  INCOMPLETE: "unknown",
  UNAVAILABLE: "unknown",
  UNKNOWABLE: "unknown",
  unknown: "unknown",
  not_applicable: "not_applicable",
};

const LEGACY_COVERAGE: Record<string, CoverageState> = {
  EXACT: "full_coverage",
  COMPLETE: "full_coverage",
  full_coverage: "full_coverage",
  SAMPLED: "partial_coverage",
  INCOMPLETE: "partial_coverage",
  partial_coverage: "partial_coverage",
  MISSING: "source_unavailable",
  UNAVAILABLE: "source_unavailable",
  source_unavailable: "source_unavailable",
  NOT_APPLICABLE: "structurally_unknowable",
  UNKNOWABLE: "structurally_unknowable",
  structurally_unknowable: "structurally_unknowable",
  unknown_coverage: "unknown_coverage",
};

const LEGACY_SOURCE: Record<string, SourceId> = {
  cloudflare: "cloudflare",
  cloudflare_edge: "cloudflare",
  cloudflare_rum: "cloudflare",
  ga4: "ga4",
  vercel: "vercel",
  first_party: "first_party",
  modeled: "combined",
  combined: "combined",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asEvidence(value: unknown): EvidenceState | undefined {
  if (typeof value !== "string") return undefined;
  if ((EVIDENCE_STATES as readonly string[]).includes(value)) return value as EvidenceState;
  return LEGACY_EVIDENCE[value];
}

function asExactness(value: unknown, evidence?: EvidenceState): Exactness | undefined {
  if (typeof value === "string") {
    if ((EXACTNESS_STATES as readonly string[]).includes(value)) return value as Exactness;
    if (LEGACY_EXACTNESS[value]) return LEGACY_EXACTNESS[value];
  }
  if (evidence) return LEGACY_EXACTNESS[evidence] ?? "unknown";
  return undefined;
}

function asCoverageState(value: unknown): CoverageState | undefined {
  if (typeof value !== "string") return undefined;
  if ((COVERAGE_STATES as readonly string[]).includes(value)) return value as CoverageState;
  return LEGACY_COVERAGE[value];
}

function asSource(value: unknown): SourceId {
  if (typeof value === "string" && LEGACY_SOURCE[value]) return LEGACY_SOURCE[value];
  if (typeof value === "string" && (SOURCES as readonly string[]).includes(value)) return value as SourceId;
  return "cloudflare";
}

function coverageObject(value: unknown, fallback: CoverageState): CoverageMetadata {
  if (isObject(value) && typeof value.state === "string") {
    const state = asCoverageState(value.state) ?? fallback;
    return {
      state,
      observed_fraction: typeof value.observed_fraction === "number" ? value.observed_fraction : null,
      missingness_reason: typeof value.missingness_reason === "string" ? value.missingness_reason : null,
      affected_scope: typeof value.affected_scope === "string" ? value.affected_scope : null,
    };
  }
  if (typeof value === "string") {
    return { state: asCoverageState(value) ?? fallback };
  }
  return { state: fallback };
}

export function gold12ToViewMetric(metric: Gold12Metric, pipelineVersion: string): Metric {
  const coverage = metric.coverage;
  return {
    metric_id: metric.metric_id,
    id: metric.metric_id,
    label: metric.label,
    metric_definition: metric.metric_definition,
    value: metric.value,
    display: metric.supplied_display ?? undefined,
    supplied_display: metric.supplied_display,
    unit: metric.unit,
    source: metric.source,
    grain: grainFromBoundary(metric.semantics.source_boundary, metric.semantics.semantic_type),
    evidence_state: metric.evidence_state,
    evidenceState: metric.evidence_state,
    exactness: metric.exactness,
    coverage,
    coverageState: coverage.state,
    timeWindow: {
      id: metric.observation.source_observation_id,
      start: metric.observation.start,
      end: metric.observation.end,
      timezone: metric.observation.timezone,
      boundary: metric.observation.boundary,
      extractedAt: metric.observation.extracted_at,
      partialCurrentPeriod: metric.observation.partial_current_period,
    },
    observation: metric.observation,
    semantics: metric.semantics,
    definitionId: metric.metric_id,
    sampling: metric.sampling
      ? {
          interval: metric.sampling.interval,
          factor: metric.sampling.factor,
          meaning: metric.sampling.meaning,
          intervalMeaning: metric.sampling.meaning,
          factorMeaning: metric.sampling.meaning,
        }
      : undefined,
    confidence: metric.confidence_interval
      ? {
          level: metric.confidence_interval.level,
          valid: metric.confidence_interval.valid,
          intervalValid: metric.confidence_interval.valid,
          lower: metric.confidence_interval.lower_bound,
          upper: metric.confidence_interval.upper_bound,
          lower_bound: metric.confidence_interval.lower_bound,
          upper_bound: metric.confidence_interval.upper_bound,
          invalid_reason: metric.confidence_interval.invalid_reason,
        }
      : undefined,
    confidence_interval: metric.confidence_interval,
    ratio: metric.ratio
      ? {
          ...metric.ratio,
          value: metric.ratio.ratio_value ?? null,
          unit: metric.ratio.ratio_unit,
          numeratorRef: metric.ratio.numerator.reference_id,
          denominatorRef: metric.ratio.denominator.reference_id,
          numeratorValue: metric.ratio.numerator_value,
          denominatorValue: metric.ratio.denominator_value,
          display: metric.ratio.supplied_display ?? undefined,
          supplied_display: metric.ratio.supplied_display,
          authoritative: true,
        }
      : undefined,
    classification: metric.classification,
    provenance: metric.provenance,
    uniqueSemantics: metric.semantics.unique_count_semantics,
    sourceNativeClass: metric.classification?.source_native_class ?? undefined,
    normalizedClass: metric.classification?.normalized_class,
    limitations: metric.provenance.limitations,
    pipelineVersion,
  };
}

function grainFromBoundary(boundary: string, semanticType: string): Grain {
  if (semanticType === "ratio") return "ratio";
  if (boundary === "browser_beacon") return "rum_pageview";
  if (boundary === "request") return "request";
  if (boundary === "analytics_property") return "session";
  return "count";
}

function emptyHumans(): WindowPayload["humans"] {
  return {
    metrics: [],
    sessions: [],
    acquisition: [],
    search: [],
    social: [],
    referrers: [],
    devices: [],
    browsers: [],
    geography: [],
    landingPages: [],
    content: [],
    cwv: [],
  };
}

function emptyContent(): WindowPayload["content"] {
  return {
    humanPopular: [],
    aiPopular: [],
    searchCrawlerPopular: [],
    highError: [],
    notFound: [],
    highBandwidth: [],
    highEngagement: [],
    aiToHuman: [],
    humanToMachine: [],
  };
}

function emptyTech(): WindowPayload["technology"] {
  return {
    status: [],
    method: [],
    protocol: [],
    tls: [],
    cache: [],
    contentType: [],
    colo: [],
    origin: [],
    deployments: [],
  };
}

function emptyGeo(): WindowPayload["geography"] {
  return {
    edge: [],
    browser: [],
    ai: [],
    threat: [],
    captions: {
      edge: "Cloudflare request country — connecting client country at the edge. Not a demographic dataset and not human location.",
      browser: "RUM-observed browser geography and GA4-observed user geography. Not Cloudflare request country.",
      ai: "Cloudflare request country of AI-classed requests. Actor infrastructure, not readers.",
      threat: "Cloudflare request country of threat events. Not audience demographics.",
    },
  };
}

function supportToDescriptor(row: Gold12SourceSupport): SourceDescriptor {
  const evidence: EvidenceState =
    row.sampling_status === "sampled" ? "sampled" : row.data_returned === "true" ? "measured" : "unavailable";
  const coverage: CoverageState =
    row.data_returned === "false"
      ? "source_unavailable"
      : row.requested_window_supported === "false"
        ? "historical_data_unavailable"
        : row.sampling_status === "sampled"
          ? "partial_coverage"
          : "full_coverage";
  return {
    id: asSource(row.source_id),
    label: row.source_id,
    shortLabel: row.source_id,
    typicalEvidence: evidence,
    coverage,
    coverageNote: (row.notes ?? []).join(" "),
  };
}

function sitesFromTopology(canonical: CanonicalGold12): SiteRecord[] {
  return canonical.topology.nodes
    .filter((node) => node.node_type === "logical_property" || node.node_type === "hostname")
    .map((node) => ({
      id: node.node_id,
      domain: node.label,
      name: node.label,
      metrics: [],
      sourceCoverage: canonical.source_support.map(supportToDescriptor),
      measurementHealth:
        node.visibility === "dns_only" ? "instrumentation_absent" : node.visibility === "proxied" ? "full_coverage" : "unknown_coverage",
      measurementHealthNote: `Topology ${node.node_type}${node.visibility ? ` · visibility ${node.visibility}` : ""}. Not an audience total.`,
    }));
}

function taxonomyFrom(metrics: Metric[]): RankedItem[] {
  return metrics
    .filter((metric) => metric.classification)
    .map((metric) => ({
      id: metric.metric_id,
      label: metric.classification?.source_native_class || metric.classification?.normalized_class || metric.label,
      value: metric.value,
      source: metric.source,
      evidence_state: metric.evidence_state,
      evidenceState: metric.evidence_state,
      exactness: metric.exactness,
      coverage: metric.coverageState,
      grain: metric.grain,
      definitionId: metric.metric_id,
      sourceNativeClass: metric.classification?.source_native_class ?? undefined,
      normalizedClass: metric.classification?.normalized_class,
    }));
}

function aiFrom(metrics: Metric[]): WindowPayload["ai"] {
  const classed = metrics.filter(
    (metric) =>
      metric.classification &&
      (metric.classification.source_native_class?.startsWith("AI") ||
        metric.classification.normalized_class === "UNKNOWN" ||
        metric.classification.normalized_class.startsWith("AI")),
  );
  const actors: ActorRecord[] = classed.map((metric) => ({
    id: metric.metric_id,
    name: metric.classification?.source_native_class || metric.classification?.normalized_class || metric.label,
    class: "unknown",
    sourceNativeClass: metric.classification?.source_native_class || "UNKNOWN",
    normalizedClass: metric.classification?.normalized_class || "UNKNOWN",
    source: metric.source,
    evidence_state: metric.evidence_state,
    evidenceState: metric.evidence_state,
    exactness: metric.exactness,
    coverage: metric.coverageState,
    definitionId: metric.metric_id,
    metrics: [metric],
    targetSites: [],
    targetPages: [],
  }));
  return {
    classTotals: taxonomyFrom(classed),
    actors,
    targetSites: [],
    targetPages: [],
    robots: [],
    temporal: [],
    responseMix: [],
  };
}

function projectCanonical(canonical: CanonicalGold12, presentation: unknown): GoldContract {
  const viewMetrics = canonical.metrics.map((metric) => gold12ToViewMetric(metric, canonical.pipeline_version));
  const first = canonical.metrics[0]!;
  const windowId = "canonical";
  const synthesized: WindowPayload = {
    window: {
      id: windowId,
      label: "Canonical observation",
      start: first.observation.start,
      end: first.observation.end,
      grain: "day",
      timezone: first.observation.timezone,
      boundary: first.observation.boundary,
      extractedAt: first.observation.extracted_at,
      generatedAt: canonical.generated_at,
      partialCurrentPeriod: canonical.metrics.some((metric) => metric.observation.partial_current_period),
    },
    overview: { metrics: viewMetrics, anomalies: [], opportunities: [], health: [] },
    series: [],
    taxonomy: taxonomyFrom(viewMetrics),
    humans: { ...emptyHumans(), metrics: viewMetrics.filter((m) => m.semantics?.source_boundary === "browser_beacon" || m.grain === "session") },
    ai: aiFrom(viewMetrics),
    automation: [],
    sites: sitesFromTopology(canonical),
    content: emptyContent(),
    technology: emptyTech(),
    geography: emptyGeo(),
    laboratory: {
      coverage: canonical.source_support.map(supportToDescriptor),
      sampleFactors: viewMetrics.filter((m) => m.sampling),
      disagreement: [],
      missingness: viewMetrics
        .filter((m) => m.evidence_state === "unavailable" || m.evidence_state === "unknowable")
        .map((m) => ({
          id: m.metric_id,
          label: m.label,
          value: null,
          source: m.source,
          evidence_state: m.evidence_state,
          evidenceState: m.evidence_state,
          exactness: m.exactness,
          coverage: m.coverageState,
          grain: m.grain,
          definitionId: m.metric_id,
        })),
      definitionNotes: [
        "Canonical Gold 1.2. generated_at is document generation time, not the observation window.",
        "Topology relationships are serving boundaries, not audience totals.",
        "Source-support facts are independent and are not a single availability boolean.",
      ],
    },
    anomalies: [],
    health: { metrics: [], errors: [], paths: [], sites: [] },
  };

  let windows: Record<string, WindowPayload> = { [windowId]: synthesized };
  if (isObject(presentation) && isObject(presentation.windows)) {
    windows = normalizePresentationWindows(presentation.windows, canonical.pipeline_version);
  }

  return {
    contract: {
      name: canonical.contract_name,
      version: canonical.schema_version,
      pipelineVersion: canonical.pipeline_version,
      producedAt: canonical.generated_at,
      generatedAt: canonical.generated_at,
      kind: canonical.fixture ? "fixture" : "production",
      notes: ["Canonical Gold 1.2 consumer. Fixture data is not live GFD traffic."],
    },
    canonical,
    definitions: isObject(presentation) && Array.isArray(presentation.definitions) ? (presentation.definitions as Definition[]) : [],
    sources:
      isObject(presentation) && Array.isArray(presentation.sources)
        ? (presentation.sources as SourceDescriptor[]).map((row) => ({
            ...row,
            id: asSource(row.id),
            typicalEvidence: asEvidence(row.typicalEvidence) ?? row.typicalEvidence,
            coverage: asCoverageState(row.coverage) ?? row.coverage,
          }))
        : canonical.source_support.map(supportToDescriptor),
    defaultWindowId:
      isObject(presentation) && typeof presentation.defaultWindowId === "string"
        ? presentation.defaultWindowId
        : Object.keys(windows)[0] ?? windowId,
    windows,
    topology: canonical.topology,
    sourceSupport: canonical.source_support,
  };
}

function normalizePresentationWindows(raw: Record<string, unknown>, pipelineVersion: string): Record<string, WindowPayload> {
  const out: Record<string, WindowPayload> = {};
  for (const [id, payload] of Object.entries(raw)) {
    out[id] = normalizeTree(payload, pipelineVersion) as WindowPayload;
  }
  return out;
}

function normalizeTree(value: unknown, pipelineVersion: string): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeTree(item, pipelineVersion));
  if (!isObject(value)) return value;
  if (looksLikeMetric(value)) return normalizeLegacyMetric(value, pipelineVersion);
  if (looksLikeRanked(value)) return normalizeRanked(value);
  const next: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) next[key] = normalizeTree(child, pipelineVersion);
  return next;
}

function looksLikeMetric(obj: Record<string, unknown>): boolean {
  return (
    (typeof obj.metric_id === "string" || typeof obj.id === "string") &&
    typeof obj.source === "string" &&
    ("evidence_state" in obj || "evidenceState" in obj || "status" in obj) &&
    ("timeWindow" in obj || "observation" in obj)
  );
}

function looksLikeRanked(obj: Record<string, unknown>): boolean {
  if (Array.isArray(obj.points) || Array.isArray(obj.cells) || Array.isArray(obj.metrics) || Array.isArray(obj.targetSites)) return false;
  return typeof obj.id === "string" && typeof obj.source === "string" && typeof obj.grain === "string" && ("evidenceState" in obj || "evidence_state" in obj || "status" in obj) && !("timeWindow" in obj) && !("observation" in obj);
}

function normalizeLegacyMetric(obj: Record<string, unknown>, pipelineVersion: string): Metric {
  const evidence =
    asEvidence(obj.evidence_state) ?? asEvidence(obj.evidenceState) ?? asEvidence(obj.status) ?? "measured";
  const exactness =
    asExactness(obj.exactness, evidence) ?? (evidence === "measured" ? "unknown" : asExactness(undefined, evidence) ?? "unknown");
  const coverage = coverageObject(obj.coverage, asCoverageState(obj.coverageState) ?? (evidence === "unavailable" ? "source_unavailable" : "full_coverage"));
  const value = (ABSENT_EVIDENCE as readonly string[]).includes(evidence) ? null : typeof obj.value === "number" ? obj.value : obj.value === null ? null : null;
  const source = asSource(obj.source);
  const id = String(obj.metric_id ?? obj.id);
  const definition = String(obj.metric_definition ?? obj.definitionId ?? id);
  return {
    metric_id: id,
    id,
    label: String(obj.label ?? id),
    metric_definition: definition,
    value,
    display: typeof obj.display === "string" ? obj.display : typeof obj.supplied_display === "string" ? obj.supplied_display : undefined,
    unit: typeof obj.unit === "string" ? obj.unit : null,
    source,
    grain: (typeof obj.grain === "string" ? obj.grain : "count") as Grain,
    evidence_state: evidence,
    evidenceState: evidence,
    exactness,
    coverage,
    coverageState: coverage.state,
    timeWindow: isObject(obj.timeWindow)
      ? {
          id: String(obj.timeWindow.id ?? "window"),
          start: String(obj.timeWindow.start ?? ""),
          end: String(obj.timeWindow.end ?? ""),
          timezone: typeof obj.timeWindow.timezone === "string" ? obj.timeWindow.timezone : undefined,
          extractedAt: typeof obj.timeWindow.extractedAt === "string" ? obj.timeWindow.extractedAt : undefined,
          generatedAt: typeof obj.timeWindow.generatedAt === "string" ? obj.timeWindow.generatedAt : undefined,
          partialCurrentPeriod: obj.timeWindow.partialCurrentPeriod === true,
        }
      : { id: "window", start: "", end: "" },
    definitionId: String(obj.definitionId ?? id),
    sampling: isObject(obj.sampling) ? (obj.sampling as Metric["sampling"]) : undefined,
    confidence: isObject(obj.confidence)
      ? {
          level: typeof obj.confidence.level === "number" ? obj.confidence.level : null,
          valid: typeof obj.confidence.valid === "boolean" ? obj.confidence.valid : typeof obj.confidence.intervalValid === "boolean" ? obj.confidence.intervalValid : undefined,
          intervalValid: typeof obj.confidence.intervalValid === "boolean" ? obj.confidence.intervalValid : typeof obj.confidence.valid === "boolean" ? obj.confidence.valid : undefined,
          lower: typeof obj.confidence.lower === "number" ? obj.confidence.lower : typeof obj.confidence.lower_bound === "number" ? obj.confidence.lower_bound : null,
          upper: typeof obj.confidence.upper === "number" ? obj.confidence.upper : typeof obj.confidence.upper_bound === "number" ? obj.confidence.upper_bound : null,
          lower_bound: typeof obj.confidence.lower_bound === "number" ? obj.confidence.lower_bound : typeof obj.confidence.lower === "number" ? obj.confidence.lower : null,
          upper_bound: typeof obj.confidence.upper_bound === "number" ? obj.confidence.upper_bound : typeof obj.confidence.upper === "number" ? obj.confidence.upper : null,
          invalid_reason: typeof obj.confidence.invalid_reason === "string" ? obj.confidence.invalid_reason : typeof obj.confidence.note === "string" ? obj.confidence.note : null,
        }
      : isObject(obj.confidence_interval)
        ? {
            level: typeof obj.confidence_interval.level === "number" ? obj.confidence_interval.level : null,
            valid: obj.confidence_interval.valid === true,
            intervalValid: obj.confidence_interval.valid === true,
            lower: typeof obj.confidence_interval.lower_bound === "number" ? obj.confidence_interval.lower_bound : null,
            upper: typeof obj.confidence_interval.upper_bound === "number" ? obj.confidence_interval.upper_bound : null,
            lower_bound: typeof obj.confidence_interval.lower_bound === "number" ? obj.confidence_interval.lower_bound : null,
            upper_bound: typeof obj.confidence_interval.upper_bound === "number" ? obj.confidence_interval.upper_bound : null,
            invalid_reason: typeof obj.confidence_interval.invalid_reason === "string" ? obj.confidence_interval.invalid_reason : null,
          }
        : undefined,
    ratio: isObject(obj.ratio) ? (obj.ratio as Metric["ratio"]) : undefined,
    provenance: isObject(obj.provenance) ? (obj.provenance as Metric["provenance"]) : undefined,
    uniqueSemantics:
      isObject(obj.semantics) && typeof obj.semantics.unique_count_semantics === "string"
        ? (obj.semantics.unique_count_semantics as Metric["uniqueSemantics"])
        : (obj.uniqueSemantics as Metric["uniqueSemantics"]),
    sourceNativeClass: typeof obj.sourceNativeClass === "string" ? obj.sourceNativeClass : undefined,
    normalizedClass: typeof obj.normalizedClass === "string" ? obj.normalizedClass : undefined,
    limitations: Array.isArray(obj.limitations) ? obj.limitations.map(String) : undefined,
    pipelineVersion: typeof obj.pipelineVersion === "string" ? obj.pipelineVersion : pipelineVersion,
    sparkline: Array.isArray(obj.sparkline) ? (obj.sparkline as number[]) : undefined,
    deltaDisplay: typeof obj.deltaDisplay === "string" ? obj.deltaDisplay : undefined,
  };
}

function normalizeRanked(obj: Record<string, unknown>): RankedItem {
  const evidence = asEvidence(obj.evidence_state) ?? asEvidence(obj.evidenceState) ?? asEvidence(obj.status) ?? "measured";
  const coverage = asCoverageState(obj.coverage) ?? (evidence === "unavailable" ? "source_unavailable" : "full_coverage");
  return {
    id: String(obj.id),
    label: String(obj.label ?? obj.id),
    value: (ABSENT_EVIDENCE as readonly string[]).includes(evidence) ? null : typeof obj.value === "number" ? obj.value : null,
    display: typeof obj.display === "string" ? obj.display : undefined,
    shareDisplay: typeof obj.shareDisplay === "string" ? obj.shareDisplay : undefined,
    source: asSource(obj.source),
    evidence_state: evidence,
    evidenceState: evidence,
    exactness: asExactness(obj.exactness, evidence),
    coverage,
    grain: (typeof obj.grain === "string" ? obj.grain : "count") as Grain,
    definitionId: String(obj.definitionId ?? obj.id),
    extra: typeof obj.extra === "string" ? obj.extra : undefined,
    sourceNativeClass: typeof obj.sourceNativeClass === "string" ? obj.sourceNativeClass : undefined,
    normalizedClass: typeof obj.normalizedClass === "string" ? obj.normalizedClass : undefined,
  };
}

function adaptLegacy(raw: unknown): GoldContract {
  if (!isObject(raw)) throw new Error("Gold adapter: root is not an object");
  const cloned = structuredClone(raw);
  const pipeline = isObject(cloned.contract) && typeof cloned.contract.pipelineVersion === "string" ? cloned.contract.pipelineVersion : "legacy";
  const windowsRaw = isObject(cloned.windows) ? cloned.windows : {};
  const windows = normalizePresentationWindows(windowsRaw as Record<string, unknown>, pipeline);
  const contract = isObject(cloned.contract) ? cloned.contract : {};
  return {
    contract: {
      name: typeof contract.name === "string" ? contract.name : "legacy-gold",
      version: typeof contract.version === "string" ? contract.version : "legacy",
      pipelineVersion: pipeline,
      producedAt: typeof contract.producedAt === "string" ? contract.producedAt : "",
      generatedAt: typeof contract.producedAt === "string" ? contract.producedAt : "",
      kind: contract.kind === "production" ? "production" : "fixture",
      notes: Array.isArray(contract.notes) ? contract.notes.map(String) : ["Legacy fixture adapted with reader aliases."],
    },
    definitions: Array.isArray(cloned.definitions) ? (cloned.definitions as Definition[]) : [],
    sources: Array.isArray(cloned.sources)
      ? cloned.sources.map((row) => {
          const obj = isObject(row) ? row : {};
          return {
            id: asSource(obj.id),
            label: String(obj.label ?? obj.id ?? ""),
            shortLabel: String(obj.shortLabel ?? obj.id ?? ""),
            typicalEvidence: asEvidence(obj.typicalEvidence) ?? "measured",
            coverage: asCoverageState(obj.coverage) ?? "full_coverage",
            coverageNote: String(obj.coverageNote ?? ""),
          };
        })
      : [],
    defaultWindowId: typeof cloned.defaultWindowId === "string" ? cloned.defaultWindowId : Object.keys(windows)[0] ?? "28d",
    windows,
  };
}

export const CANONICAL_ALIASES_READER_ONLY = [
  "evidenceState / measurementState / status → evidence_state",
  "confidence / ci → confidence_interval",
  "lower / lo / ci_lower → lower_bound",
  "upper / hi / ci_upper → upper_bound",
  "intervalValid / ci_valid / interval_valid → valid",
  "sampleInterval / sample_interval → sampling.interval",
  "sampleFactor / sample_factor → sampling.factor",
  "sourceNativeClass / source_native_classification → classification.source_native_class",
  "normalizedClass / class / normalized_classification → classification.normalized_class",
];

export function adaptGold(raw: unknown): GoldContract {
  if (isCanonicalGold12(raw)) {
    const canonical = parseCanonicalGold12(raw);
    const presentation = isObject(raw) ? raw.presentation ?? raw._presentation : undefined;
    return projectCanonical(canonical, presentation);
  }
  return adaptLegacy(raw);
}

export function isAbsentEvidence(state: EvidenceState | undefined): boolean {
  return state === "unavailable" || state === "unknowable";
}
