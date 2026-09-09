/**
 * Canonical Gold 1.2 types.
 * Spellings and tokens match src/gfdti/contracts.py Gold12* at
 * 2a3bce3a7e5761a25a6412e6f7aab4fb781d7c40.
 *
 * These are producer fields. Compatibility aliases live only in adaptLegacy().
 */

export const GOLD12_SCHEMA_VERSION = "1.2.0" as const;
export const GOLD12_CONTRACT_NAME = "gfd-canonical-gold" as const;

export const EVIDENCE_STATES = [
  "measured",
  "sampled",
  "inferred",
  "estimated",
  "unavailable",
  "unknowable",
] as const;
export type EvidenceState = (typeof EVIDENCE_STATES)[number];

export const ABSENT_EVIDENCE: readonly EvidenceState[] = ["unavailable", "unknowable"];

export const EXACTNESS_STATES = ["exact", "inexact", "not_applicable", "unknown"] as const;
export type Exactness = (typeof EXACTNESS_STATES)[number];

export const COVERAGE_STATES = [
  "full_coverage",
  "partial_coverage",
  "unknown_coverage",
  "source_unavailable",
  "historical_data_unavailable",
  "retention_exceeded",
  "instrumentation_absent",
  "measurement_bypass",
  "scope_blocked",
  "structurally_unknowable",
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export const UNIQUE_COUNT_SEMANTICS = [
  "not_unique_count",
  "zone_native_unique",
  "sum_of_zone_native_uniques_non_deduplicated",
  "ecosystem_unique_deduplicated",
  "ecosystem_human_unique_deduplicated",
] as const;
export type UniqueCountSemantics = (typeof UNIQUE_COUNT_SEMANTICS)[number];

export const SOURCES = ["cloudflare", "ga4", "vercel", "first_party", "combined"] as const;
export type SourceId = (typeof SOURCES)[number];

export const SUPPORT_STATES = ["true", "false", "unknown"] as const;
export type SupportState = (typeof SUPPORT_STATES)[number];

export const SAMPLING_STATUSES = ["unsampled", "sampled", "unknown", "not_applicable"] as const;
export type SamplingStatus = (typeof SAMPLING_STATUSES)[number];

export const TOPOLOGY_NODE_TYPES = [
  "logical_property",
  "hostname",
  "zone",
  "pages_project",
  "pages_custom_domain",
  "worker",
  "worker_custom_domain",
  "worker_route",
  "rum_site_tag",
] as const;
export type TopologyNodeType = (typeof TOPOLOGY_NODE_TYPES)[number];

export const TOPOLOGY_RELATIONS = [
  "has_hostname",
  "alias_of",
  "serves_hostname",
  "custom_domain_for",
  "route_for",
  "tag_for",
  "associated_zone",
  "shared_serving_infrastructure",
] as const;
export type TopologyRelation = (typeof TOPOLOGY_RELATIONS)[number];

export const VISIBILITY_STATES = ["proxied", "dns_only", "not_applicable", "unknown"] as const;
export type VisibilityState = (typeof VISIBILITY_STATES)[number];

export const REFERENCE_TYPES = ["metric_id", "source_observation_id"] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export interface CoverageMetadata {
  state: CoverageState;
  observed_fraction?: number | null;
  missingness_reason?: string | null;
  affected_scope?: string | null;
}

export interface Gold12MetricSemantics {
  semantic_type: "count" | "ratio" | "duration" | "other";
  population_scope: string;
  aggregation_semantics: string;
  unique_count_semantics: UniqueCountSemantics;
  source_boundary: string;
  identity_transformation?: string | null;
}

export interface Gold12Observation {
  start: string;
  end: string;
  timezone: string;
  boundary: "inclusive" | "half_open" | "closed" | "open";
  partial_current_period: boolean;
  extracted_at: string;
  source_observation_id: string;
}

export interface Gold12Sampling {
  interval?: string | null;
  factor?: number | null;
  meaning: string;
}

export interface Gold12ConfidenceInterval {
  level?: number | null;
  valid: boolean;
  lower_bound?: number | null;
  upper_bound?: number | null;
  invalid_reason?: string | null;
}

export interface Gold12MetricReference {
  reference_type: ReferenceType;
  reference_id: string;
}

export interface Gold12RatioSemantics {
  ratio_value?: number | null;
  ratio_unit: string;
  numerator: Gold12MetricReference;
  denominator: Gold12MetricReference;
  numerator_value?: number | null;
  denominator_value?: number | null;
  supplied_display?: string | null;
}

export interface Gold12Classification {
  source_native_class?: string | null;
  normalized_class: string;
  source_id: string;
  dataset_id: string;
  evidence?: Record<string, unknown>;
  confidence?: "high" | "medium" | "low" | "unknown";
  reason?: string | null;
}

export interface Gold12Provenance {
  source_metrics?: string[];
  source_snapshots?: string[];
  method_id?: string | null;
  method_version?: string | null;
  limitations?: string[];
}

export interface Gold12Metric {
  metric_id: string;
  label: string;
  metric_definition: string;
  source: SourceId;
  semantics: Gold12MetricSemantics;
  evidence_state: EvidenceState;
  exactness: Exactness;
  value: number | null;
  unit?: string | null;
  coverage: CoverageMetadata;
  observation: Gold12Observation;
  sampling?: Gold12Sampling | null;
  confidence_interval?: Gold12ConfidenceInterval | null;
  ratio?: Gold12RatioSemantics | null;
  classification?: Gold12Classification | null;
  provenance: Gold12Provenance;
  supplied_display?: string | null;
}

export interface Gold12TopologyNode {
  node_id: string;
  node_type: TopologyNodeType;
  label: string;
  visibility?: VisibilityState;
  active?: boolean | null;
  metadata?: Record<string, unknown>;
}

export interface Gold12TopologyRelationship {
  relationship_id: string;
  from_node_id: string;
  to_node_id: string;
  relation: TopologyRelation;
  metadata?: Record<string, unknown>;
}

export interface Gold12Topology {
  nodes: Gold12TopologyNode[];
  relationships: Gold12TopologyRelationship[];
}

export interface Gold12SourceSupport {
  source_id: string;
  dataset_id: string;
  dataset_in_schema: boolean;
  query_permitted: SupportState;
  requested_window_supported: SupportState;
  historical_retention_supported: SupportState;
  data_returned: SupportState;
  sampling_status: SamplingStatus;
  observation_window?: unknown;
  notes?: string[];
}

export interface CanonicalGold12 {
  schema_version: "1.2.0";
  contract_name: "gfd-canonical-gold";
  fixture: boolean;
  generated_at: string;
  pipeline_version: string;
  metrics: Gold12Metric[];
  topology: Gold12Topology;
  source_support: Gold12SourceSupport[];
}
