/**
 * Presentation view model built FROM Canonical Gold 1.2.
 *
 * Canonical producer fields are snake_case on Metric (evidence_state, exactness,
 * coverage object, confidence_interval, …). CamelCase copies are reader-only
 * aliases filled by the adapter — never producer fields.
 */
export {
  ABSENT_EVIDENCE,
  COVERAGE_STATES,
  EVIDENCE_STATES,
  EXACTNESS_STATES,
  SOURCES,
  UNIQUE_COUNT_SEMANTICS,
  type CanonicalGold12,
  type CoverageMetadata,
  type CoverageState,
  type EvidenceState,
  type Exactness,
  type Gold12Classification,
  type Gold12ConfidenceInterval,
  type Gold12Metric,
  type Gold12Provenance,
  type Gold12RatioSemantics,
  type Gold12SourceSupport,
  type Gold12Topology,
  type SourceId,
  type UniqueCountSemantics,
} from "./canonical";

import type {
  CanonicalGold12,
  CoverageMetadata,
  CoverageState,
  EvidenceState,
  Exactness,
  Gold12Classification,
  Gold12ConfidenceInterval,
  Gold12Metric,
  Gold12Provenance,
  Gold12RatioSemantics,
  Gold12SourceSupport,
  Gold12Topology,
  SourceId,
  UniqueCountSemantics,
} from "./canonical";

/** @deprecated Gold 1.2 uses unique_count_semantics. Kept as a reader alias type. */
export type UniqueSemantics = UniqueCountSemantics;

export const HUMAN_MACHINE_CLASSES = [
  "human_evidence",
  "ai_crawler",
  "ai_search",
  "ai_assistant",
  "user_triggered_ai_agent",
  "search_crawler",
  "seo_crawler",
  "monitoring",
  "health_check",
  "curl",
  "powershell",
  "headless_browser",
  "programmatic_client",
  "scanner",
  "hostile",
  "internal_platform",
  "unknown",
] as const;
export type TrafficClass = (typeof HUMAN_MACHINE_CLASSES)[number];

export const AI_CLASSES = [
  "ai_crawler",
  "ai_search",
  "ai_assistant",
  "user_triggered_ai_agent",
] as const;
export type AiClass = (typeof AI_CLASSES)[number];

export const GRAINS = [
  "request",
  "edge_pageview",
  "rum_pageview",
  "session",
  "engaged_session",
  "user",
  "visitor",
  "unique",
  "byte",
  "event",
  "ratio",
  "milliseconds",
  "score",
  "count",
] as const;
export type Grain = (typeof GRAINS)[number];

export interface Sampling {
  interval?: number | string | null;
  intervalMeaning?: string;
  factor?: number | null;
  factorMeaning?: string;
  meaning?: string;
}

/** Reader-shaped confidence. Canonical producer field is confidence_interval. */
export interface Confidence {
  level?: number | null;
  valid?: boolean;
  intervalValid?: boolean;
  lower?: number | null;
  upper?: number | null;
  lower_bound?: number | null;
  upper_bound?: number | null;
  invalid_reason?: string | null;
  note?: string;
}

export interface RatioSemantics {
  ratio_value?: number | null;
  ratio_unit?: string;
  value?: number | null;
  unit?: string;
  numerator?: { reference_type: "metric_id" | "source_observation_id"; reference_id: string };
  denominator?: { reference_type: "metric_id" | "source_observation_id"; reference_id: string };
  numeratorRef?: string;
  denominatorRef?: string;
  numeratorValue?: number | null;
  denominatorValue?: number | null;
  display?: string;
  supplied_display?: string | null;
  authoritative?: boolean;
}

export interface Provenance {
  method_id?: string | null;
  method_version?: string | null;
  modelId?: string;
  modelVersion?: string;
  method?: string;
  contributingSources?: SourceId[];
  contributingMetricIds?: string[];
  source_metrics?: string[];
  source_snapshots?: string[];
  limitations?: string[];
}

export interface TimeWindow {
  id: string;
  label: string;
  start: string;
  end: string;
  grain: "day" | "hour" | "week";
  timezone?: string;
  boundary?: string;
  extractedAt?: string;
  generatedAt?: string;
  partialCurrentPeriod?: boolean;
}

export interface Metric {
  metric_id: string;
  id: string;
  label: string;
  metric_definition: string;
  /** Null when evidence is unavailable/unknowable. Zero is only a measured zero. */
  value: number | null;
  display?: string;
  supplied_display?: string | null;
  unit?: string | null;
  source: SourceId;
  grain: Grain;
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
  exactness: Exactness;
  coverage: CoverageMetadata;
  coverageState: CoverageState;
  timeWindow: Pick<TimeWindow, "id" | "start" | "end"> & Partial<TimeWindow>;
  observation?: Gold12Metric["observation"];
  semantics?: Gold12Metric["semantics"];
  definitionId: string;
  sampling?: Sampling | Gold12Metric["sampling"];
  confidence?: Confidence;
  confidence_interval?: Gold12ConfidenceInterval | null;
  ratio?: RatioSemantics | Gold12RatioSemantics | null;
  classification?: Gold12Classification | null;
  provenance?: Provenance | Gold12Provenance;
  uniqueSemantics?: UniqueCountSemantics;
  sourceNativeClass?: string;
  normalizedClass?: string;
  limitations?: string[];
  pipelineVersion: string;
  sparkline?: number[];
  direction?: "up" | "down" | "flat" | "n/a";
  deltaDisplay?: string;
}

export interface Definition {
  id: string;
  term: string;
  text: string;
  source: SourceId | "pipeline";
  grain?: Grain;
  knownLimitations: string[];
}

export interface SourceDescriptor {
  id: SourceId;
  label: string;
  shortLabel: string;
  typicalEvidence: EvidenceState;
  coverage: CoverageState;
  coverageNote: string;
  sampling?: Sampling;
}

export interface RankedItem {
  id: string;
  label: string;
  value: number | null;
  display?: string;
  shareDisplay?: string;
  source: SourceId;
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
  exactness?: Exactness;
  coverage: CoverageState;
  grain: Grain;
  definitionId: string;
  extra?: string;
  href?: string;
  sourceNativeClass?: string;
  normalizedClass?: string;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
  coverage?: CoverageState;
}

export interface NamedSeries {
  id: string;
  label: string;
  source: SourceId;
  grain: Grain;
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
  exactness?: Exactness;
  coverage: CoverageState;
  definitionId: string;
  points: SeriesPoint[];
}

export interface HeatCell {
  x: string;
  y: string;
  value: number | null;
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
}

export interface Heatmap {
  id: string;
  label: string;
  source: SourceId;
  grain: Grain;
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
  coverage: CoverageState;
  definitionId: string;
  xLabel: string;
  yLabel: string;
  cells: HeatCell[];
}

export interface SiteRecord {
  id: string;
  domain: string;
  name: string;
  tier?: string;
  metrics: Metric[];
  sourceCoverage: SourceDescriptor[];
  measurementHealth: CoverageState;
  measurementHealthNote: string;
  aiActors?: RankedItem[];
  errors?: RankedItem[];
  cwv?: Metric[];
}

export interface ContentRow {
  path: string;
  siteId: string;
  human?: RankedItem;
  ai?: RankedItem;
  searchCrawler?: RankedItem;
  errors?: RankedItem;
  notFound?: RankedItem;
  bandwidth?: RankedItem;
  engagement?: RankedItem;
  aiToHuman?: RatioSemantics;
  humanToMachine?: RatioSemantics;
  aiToHumanDisplay?: string;
  humanToMachineDisplay?: string;
}

export interface ActorRecord {
  id: string;
  name: string;
  class: AiClass | TrafficClass;
  sourceNativeClass: string;
  normalizedClass: string;
  source: SourceId;
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
  exactness?: Exactness;
  coverage: CoverageState;
  definitionId: string;
  metrics: Metric[];
  targetSites: RankedItem[];
  targetPages: RankedItem[];
  robotsActivity?: Metric[];
  crawlDepth?: RankedItem[];
  temporal?: NamedSeries;
  responseMix?: RankedItem[];
}

export interface Anomaly {
  id: string;
  ts: string;
  kind:
    | "volume_spike"
    | "threat_spike"
    | "error_spike"
    | "source_divergence"
    | "bot_spike"
    | "ai_spike"
    | "deployment_correlated"
    | "geo_concentration";
  title: string;
  detail: string;
  siteId?: string;
  sources: SourceId[];
  evidence_state: EvidenceState;
  evidenceState: EvidenceState;
  action?: string;
  severity: "info" | "watch" | "action";
}

export interface Opportunity {
  id: string;
  title: string;
  detail: string;
  siteId?: string;
  action?: string;
}

export interface DisagreementRow {
  id: string;
  label: string;
  grainNote: string;
  values: Partial<Record<SourceId, Metric>>;
  note: string;
}

export interface Laboratory {
  coverage: SourceDescriptor[];
  sampleFactors: Metric[];
  disagreement: DisagreementRow[];
  missingness: RankedItem[];
  definitionNotes: string[];
}

export interface WindowPayload {
  window: TimeWindow;
  overview: {
    metrics: Metric[];
    anomalies: Anomaly[];
    opportunities: Opportunity[];
    health: Metric[];
  };
  series: NamedSeries[];
  taxonomy: RankedItem[];
  humans: {
    metrics: Metric[];
    sessions: Metric[];
    acquisition: RankedItem[];
    search: RankedItem[];
    social: RankedItem[];
    referrers: RankedItem[];
    devices: RankedItem[];
    browsers: RankedItem[];
    geography: RankedItem[];
    landingPages: RankedItem[];
    content: RankedItem[];
    cwv: Metric[];
  };
  ai: {
    classTotals: RankedItem[];
    actors: ActorRecord[];
    targetSites: RankedItem[];
    targetPages: RankedItem[];
    robots: Metric[];
    temporal: NamedSeries[];
    heatmap?: Heatmap;
    responseMix: RankedItem[];
  };
  automation: RankedItem[];
  sites: SiteRecord[];
  content: {
    humanPopular: ContentRow[];
    aiPopular: ContentRow[];
    searchCrawlerPopular: ContentRow[];
    highError: ContentRow[];
    notFound: ContentRow[];
    highBandwidth: ContentRow[];
    highEngagement: ContentRow[];
    aiToHuman: ContentRow[];
    humanToMachine: ContentRow[];
  };
  technology: {
    status: RankedItem[];
    method: RankedItem[];
    protocol: RankedItem[];
    tls: RankedItem[];
    cache: RankedItem[];
    contentType: RankedItem[];
    colo: RankedItem[];
    origin: Metric[];
    deployments: RankedItem[];
  };
  geography: {
    edge: RankedItem[];
    browser: RankedItem[];
    ai: RankedItem[];
    threat: RankedItem[];
    captions: Record<"edge" | "browser" | "ai" | "threat", string>;
  };
  laboratory: Laboratory;
  anomalies: Anomaly[];
  health: {
    metrics: Metric[];
    errors: RankedItem[];
    paths: RankedItem[];
    sites: RankedItem[];
  };
}

export interface GoldContract {
  contract: {
    name: string;
    version: string;
    pipelineVersion: string;
    producedAt: string;
    generatedAt: string;
    kind: "fixture" | "production";
    notes: string[];
  };
  canonical?: CanonicalGold12;
  definitions: Definition[];
  sources: SourceDescriptor[];
  defaultWindowId: string;
  windows: Record<string, WindowPayload>;
  topology?: Gold12Topology;
  sourceSupport?: Gold12SourceSupport[];
}

export const FORBIDDEN_COMBINED_SOURCES = ["total", "all_sources", "blended"] as const;

export const NATIVE_AI_CLASSES = ["AI Crawler", "AI Search", "AI Assistant"] as const;
