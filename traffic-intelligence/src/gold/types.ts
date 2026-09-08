/**
 * GFD Traffic Intelligence — Gold-layer *consumer view model*.
 *
 * Authoritative measurement lives in the pipeline. This file is what the UI
 * reads after `adaptGold()`. Field-name drift from canonical M1.1 is absorbed
 * in the adapter, not in views.
 *
 * The UI does not redefine visitor, user, session, pageview, human, bot,
 * AI crawler, AI agent, threat, or confidence.
 * The UI must not sum overlapping sources into a single visitors figure.
 */

export const EVIDENCE_STATES = [
  "MEASURED",
  "SAMPLED",
  "INFERRED",
  "ESTIMATED",
  "UNAVAILABLE",
  "UNKNOWABLE",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export const ABSENT_EVIDENCE: readonly EvidenceState[] = ["UNAVAILABLE", "UNKNOWABLE"];

export const COVERAGE_STATES = ["COMPLETE", "INCOMPLETE", "MISSING", "NOT_APPLICABLE"] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const UNIQUE_SEMANTICS = [
  "source_native_zone_unique",
  "sum_of_zone_uniques",
  "deduplicated_ecosystem_unique",
  "not_unique",
] as const;
export type UniqueSemantics = (typeof UNIQUE_SEMANTICS)[number];

export const SOURCES = [
  "cloudflare_edge",
  "cloudflare_rum",
  "ga4",
  "vercel",
  "first_party",
  "modeled",
] as const;
export type SourceId = (typeof SOURCES)[number];

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
  interval?: number | string;
  intervalMeaning?: string;
  factor?: number;
  factorMeaning?: string;
}

export interface Confidence {
  /** 0–1, e.g. 0.95. Pipeline-provided. */
  level?: number;
  /** False means bounds are preserved but must not be treated as a valid CI. */
  intervalValid?: boolean;
  lower?: number;
  upper?: number;
  note?: string;
}

export interface RatioSemantics {
  value: number | null;
  unit: "share" | "rate" | "ratio" | string;
  numeratorRef?: string;
  denominatorRef?: string;
  numeratorValue?: number | null;
  denominatorValue?: number | null;
  display?: string;
  /** When true the UI must not recompute from numerator/denominator. */
  authoritative: boolean;
}

export interface Provenance {
  modelId?: string;
  modelVersion?: string;
  method?: string;
  contributingSources?: SourceId[];
  contributingMetricIds?: string[];
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
  id: string;
  label: string;
  /** Null when evidence is UNAVAILABLE or UNKNOWABLE. Zero is only a measured zero. */
  value: number | null;
  display?: string;
  unit?: string;
  source: SourceId;
  grain: Grain;
  evidenceState: EvidenceState;
  coverage: CoverageState;
  timeWindow: Pick<TimeWindow, "id" | "start" | "end"> & Partial<TimeWindow>;
  definitionId: string;
  sampling?: Sampling;
  confidence?: Confidence;
  ratio?: RatioSemantics;
  provenance?: Provenance;
  uniqueSemantics?: UniqueSemantics;
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
  evidenceState: EvidenceState;
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
  evidenceState: EvidenceState;
  coverage?: CoverageState;
}

export interface NamedSeries {
  id: string;
  label: string;
  source: SourceId;
  grain: Grain;
  evidenceState: EvidenceState;
  coverage: CoverageState;
  definitionId: string;
  points: SeriesPoint[];
}

export interface HeatCell {
  x: string;
  y: string;
  value: number | null;
  evidenceState: EvidenceState;
}

export interface Heatmap {
  id: string;
  label: string;
  source: SourceId;
  grain: Grain;
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
  evidenceState: EvidenceState;
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
    name: "gfd-traffic-intelligence-gold";
    version: string;
    pipelineVersion: string;
    producedAt: string;
    kind: "fixture" | "production";
    notes: string[];
  };
  definitions: Definition[];
  sources: SourceDescriptor[];
  defaultWindowId: string;
  windows: Record<string, WindowPayload>;
}

export const FORBIDDEN_COMBINED_SOURCES = ["combined", "total", "all_sources", "blended"] as const;

export const NATIVE_AI_CLASSES = ["AI Crawler", "AI Search", "AI Assistant"] as const;
