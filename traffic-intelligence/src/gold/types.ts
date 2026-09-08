/**
 * GFD Traffic Intelligence — Gold-layer consumer contract.
 *
 * The UI is a display surface. It does not redefine visitor, user, session,
 * pageview, human, bot, AI crawler, AI agent, threat, or confidence.
 * Those strings are opaque labels owned by the pipeline and copied from
 * `definitions` for evidence display only.
 *
 * The UI must not sum overlapping sources into a single "visitors" figure.
 */

export const MEASUREMENT_STATUSES = [
  "EXACT",
  "SAMPLED",
  "ESTIMATED",
  "INCOMPLETE",
  "UNAVAILABLE",
] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

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
  "unclassified",
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
  "byte",
  "event",
  "ratio",
  "milliseconds",
  "score",
  "count",
] as const;
export type Grain = (typeof GRAINS)[number];

export interface Confidence {
  /** Inclusive interval around `value`, in the same unit. Pipeline-provided. */
  interval?: [number, number];
  /** e.g. 0.95. Pipeline-provided. */
  level?: number;
  note?: string;
}

export interface TimeWindow {
  id: string;
  label: string;
  start: string;
  end: string;
  grain: "day" | "hour" | "week";
}

export interface Metric {
  id: string;
  label: string;
  /** Null iff status is UNAVAILABLE. */
  value: number | null;
  /**
   * Optional preformatted display string from the pipeline.
   * When present the UI must use it instead of local rounding policy.
   */
  display?: string;
  unit?: string;
  source: SourceId;
  grain: Grain;
  status: MeasurementStatus;
  timeWindow: Pick<TimeWindow, "id" | "start" | "end">;
  definitionId: string;
  sampleInterval?: string;
  sampleFactor?: number;
  confidence?: Confidence;
  limitations?: string[];
  pipelineVersion: string;
  sparkline?: number[];
  /** Display-only hint. Not a calculated score. */
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
  coverage: MeasurementStatus;
  coverageNote: string;
  sampleInterval?: string;
  sampleFactor?: number;
}

export interface RankedItem {
  id: string;
  label: string;
  value: number | null;
  display?: string;
  shareDisplay?: string;
  source: SourceId;
  status: MeasurementStatus;
  grain: Grain;
  definitionId: string;
  extra?: string;
  href?: string;
}

export interface SeriesPoint {
  date: string;
  value: number | null;
  status: MeasurementStatus;
}

export interface NamedSeries {
  id: string;
  label: string;
  source: SourceId;
  grain: Grain;
  status: MeasurementStatus;
  definitionId: string;
  points: SeriesPoint[];
}

export interface HeatCell {
  x: string;
  y: string;
  value: number | null;
  status: MeasurementStatus;
}

export interface Heatmap {
  id: string;
  label: string;
  source: SourceId;
  grain: Grain;
  status: MeasurementStatus;
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
  measurementHealth: MeasurementStatus;
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
  /** Pipeline-provided ratio display. UI must not compute this. */
  aiToHumanDisplay?: string;
  humanToMachineDisplay?: string;
}

export interface ActorRecord {
  id: string;
  name: string;
  class: AiClass | TrafficClass;
  source: SourceId;
  status: MeasurementStatus;
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
  status: MeasurementStatus;
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
