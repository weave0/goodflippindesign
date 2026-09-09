/**
 * Strict Canonical Gold 1.2 parser.
 * Reads producer spellings only. No compatibility aliases.
 */
import {
  ABSENT_EVIDENCE,
  COVERAGE_STATES,
  EVIDENCE_STATES,
  EXACTNESS_STATES,
  GOLD12_CONTRACT_NAME,
  GOLD12_SCHEMA_VERSION,
  REFERENCE_TYPES,
  SAMPLING_STATUSES,
  SOURCES,
  SUPPORT_STATES,
  TOPOLOGY_NODE_TYPES,
  TOPOLOGY_RELATIONS,
  UNIQUE_COUNT_SEMANTICS,
  VISIBILITY_STATES,
  type CanonicalGold12,
  type CoverageMetadata,
  type CoverageState,
  type EvidenceState,
  type Exactness,
  type Gold12Classification,
  type Gold12ConfidenceInterval,
  type Gold12Metric,
  type Gold12MetricReference,
  type Gold12MetricSemantics,
  type Gold12Observation,
  type Gold12Provenance,
  type Gold12RatioSemantics,
  type Gold12Sampling,
  type Gold12SourceSupport,
  type Gold12Topology,
  type Gold12TopologyNode,
  type Gold12TopologyRelationship,
  type SamplingStatus,
  type SourceId,
  type SupportState,
  type UniqueCountSemantics,
} from "./canonical";

export class CanonicalParseError extends Error {
  constructor(message: string) {
    super(`Canonical Gold 1.2: ${message}`);
    this.name = "CanonicalParseError";
  }
}

function fail(path: string, message: string): never {
  throw new CanonicalParseError(`${path}: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, path: string, required = true): string | undefined {
  if (typeof value === "string" && value.length > 0) return value;
  if (value === undefined || value === null) {
    if (required) fail(path, "missing string");
    return undefined;
  }
  fail(path, "expected string");
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value === "boolean") return value;
  fail(path, "expected boolean");
}

function asNumberOrNull(value: unknown, path: string): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  fail(path, "expected number or null");
}

function inEnum<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
  fail(path, `expected one of ${allowed.join("|")}, got ${String(value)}`);
}

function parseCoverage(raw: unknown, path: string): CoverageMetadata {
  if (!isObject(raw)) fail(path, "coverage object required");
  const coverage: CoverageMetadata = {
    state: inEnum(raw.state, COVERAGE_STATES, `${path}.state`),
  };
  if (raw.observed_fraction !== undefined) coverage.observed_fraction = asNumberOrNull(raw.observed_fraction, `${path}.observed_fraction`);
  if (raw.missingness_reason !== undefined && raw.missingness_reason !== null) {
    coverage.missingness_reason = asString(raw.missingness_reason, `${path}.missingness_reason`, false);
  }
  if (raw.affected_scope !== undefined && raw.affected_scope !== null) {
    coverage.affected_scope = asString(raw.affected_scope, `${path}.affected_scope`, false);
  }
  return coverage;
}

function parseSemantics(raw: unknown, path: string): Gold12MetricSemantics {
  if (!isObject(raw)) fail(path, "semantics object required");
  const semantic_type = inEnum(raw.semantic_type, ["count", "ratio", "duration", "other"] as const, `${path}.semantic_type`);
  const unique_count_semantics = inEnum(raw.unique_count_semantics, UNIQUE_COUNT_SEMANTICS, `${path}.unique_count_semantics`);
  return {
    semantic_type,
    population_scope: asString(raw.population_scope, `${path}.population_scope`)!,
    aggregation_semantics: asString(raw.aggregation_semantics, `${path}.aggregation_semantics`)!,
    unique_count_semantics,
    source_boundary: asString(raw.source_boundary, `${path}.source_boundary`)!,
    identity_transformation:
      raw.identity_transformation === undefined || raw.identity_transformation === null
        ? null
        : asString(raw.identity_transformation, `${path}.identity_transformation`),
  };
}

function parseObservation(raw: unknown, path: string): Gold12Observation {
  if (!isObject(raw)) fail(path, "observation object required");
  return {
    start: asString(raw.start, `${path}.start`)!,
    end: asString(raw.end, `${path}.end`)!,
    timezone: asString(raw.timezone, `${path}.timezone`)!,
    boundary: inEnum(raw.boundary, ["inclusive", "half_open", "closed", "open"] as const, `${path}.boundary`),
    partial_current_period: asBoolean(raw.partial_current_period, `${path}.partial_current_period`),
    extracted_at: asString(raw.extracted_at, `${path}.extracted_at`)!,
    source_observation_id: asString(raw.source_observation_id, `${path}.source_observation_id`)!,
  };
}

function parseSampling(raw: unknown, path: string): Gold12Sampling {
  if (!isObject(raw)) fail(path, "sampling object required");
  return {
    interval: raw.interval === undefined || raw.interval === null ? null : asString(raw.interval, `${path}.interval`),
    factor: raw.factor === undefined ? null : asNumberOrNull(raw.factor, `${path}.factor`),
    meaning: asString(raw.meaning, `${path}.meaning`)!,
  };
}

function parseConfidence(raw: unknown, path: string): Gold12ConfidenceInterval {
  if (!isObject(raw)) fail(path, "confidence_interval object required");
  return {
    level: raw.level === undefined ? null : asNumberOrNull(raw.level, `${path}.level`),
    valid: asBoolean(raw.valid, `${path}.valid`),
    lower_bound: raw.lower_bound === undefined ? null : asNumberOrNull(raw.lower_bound, `${path}.lower_bound`),
    upper_bound: raw.upper_bound === undefined ? null : asNumberOrNull(raw.upper_bound, `${path}.upper_bound`),
    invalid_reason:
      raw.invalid_reason === undefined || raw.invalid_reason === null
        ? null
        : asString(raw.invalid_reason, `${path}.invalid_reason`, false),
  };
}

function parseReference(raw: unknown, path: string): Gold12MetricReference {
  if (!isObject(raw)) fail(path, "typed ratio reference object required");
  return {
    reference_type: inEnum(raw.reference_type, REFERENCE_TYPES, `${path}.reference_type`),
    reference_id: asString(raw.reference_id, `${path}.reference_id`)!,
  };
}

function parseRatio(raw: unknown, path: string): Gold12RatioSemantics {
  if (!isObject(raw)) fail(path, "ratio object required");
  return {
    ratio_value: raw.ratio_value === undefined ? null : asNumberOrNull(raw.ratio_value, `${path}.ratio_value`),
    ratio_unit: asString(raw.ratio_unit, `${path}.ratio_unit`)!,
    numerator: parseReference(raw.numerator, `${path}.numerator`),
    denominator: parseReference(raw.denominator, `${path}.denominator`),
    numerator_value: raw.numerator_value === undefined ? null : asNumberOrNull(raw.numerator_value, `${path}.numerator_value`),
    denominator_value: raw.denominator_value === undefined ? null : asNumberOrNull(raw.denominator_value, `${path}.denominator_value`),
    supplied_display:
      raw.supplied_display === undefined || raw.supplied_display === null
        ? null
        : asString(raw.supplied_display, `${path}.supplied_display`, false),
  };
}

function parseClassification(raw: unknown, path: string): Gold12Classification {
  if (!isObject(raw)) fail(path, "classification object required");
  return {
    source_native_class:
      raw.source_native_class === undefined || raw.source_native_class === null
        ? null
        : asString(raw.source_native_class, `${path}.source_native_class`, false),
    normalized_class: asString(raw.normalized_class, `${path}.normalized_class`)!,
    source_id: asString(raw.source_id, `${path}.source_id`)!,
    dataset_id: asString(raw.dataset_id, `${path}.dataset_id`)!,
    evidence: isObject(raw.evidence) ? raw.evidence : {},
    confidence: raw.confidence
      ? inEnum(raw.confidence, ["high", "medium", "low", "unknown"] as const, `${path}.confidence`)
      : "unknown",
    reason: raw.reason === undefined || raw.reason === null ? null : asString(raw.reason, `${path}.reason`, false),
  };
}

function parseProvenance(raw: unknown, path: string): Gold12Provenance {
  if (!isObject(raw)) fail(path, "provenance object required");
  return {
    source_metrics: Array.isArray(raw.source_metrics) ? raw.source_metrics.map(String) : [],
    source_snapshots: Array.isArray(raw.source_snapshots) ? raw.source_snapshots.map(String) : [],
    method_id: raw.method_id === undefined || raw.method_id === null ? null : asString(raw.method_id, `${path}.method_id`, false),
    method_version:
      raw.method_version === undefined || raw.method_version === null
        ? null
        : asString(raw.method_version, `${path}.method_version`, false),
    limitations: Array.isArray(raw.limitations) ? raw.limitations.map(String) : [],
  };
}

function parseMetric(raw: unknown, path: string): Gold12Metric {
  if (!isObject(raw)) fail(path, "metric object required");
  const evidence_state = inEnum(raw.evidence_state, EVIDENCE_STATES, `${path}.evidence_state`);
  const exactness = inEnum(raw.exactness, EXACTNESS_STATES, `${path}.exactness`);
  const semantics = parseSemantics(raw.semantics, `${path}.semantics`);
  const provenance = parseProvenance(raw.provenance, `${path}.provenance`);
  const value = asNumberOrNull(raw.value, `${path}.value`);

  if ((ABSENT_EVIDENCE as readonly string[]).includes(evidence_state) && value !== null) {
    fail(path, "unavailable/unknowable metrics must have null value");
  }
  if (evidence_state === "sampled" && raw.sampling == null) {
    fail(path, "sampled metrics require sampling");
  }
  if ((evidence_state === "inferred" || evidence_state === "estimated") && (!provenance.method_id || !provenance.method_version)) {
    fail(path, "inferred/estimated metrics require method_id and method_version");
  }
  if (semantics.semantic_type === "ratio" && raw.ratio == null) {
    fail(path, "ratio metrics require ratio semantics");
  }
  if (
    semantics.source_boundary === "request" &&
    (semantics.unique_count_semantics === "ecosystem_unique_deduplicated" ||
      semantics.unique_count_semantics === "ecosystem_human_unique_deduplicated") &&
    !semantics.identity_transformation
  ) {
    fail(path, "request observations cannot acquire unique-person semantics without identity_transformation");
  }

  const metric: Gold12Metric = {
    metric_id: asString(raw.metric_id, `${path}.metric_id`)!,
    label: asString(raw.label, `${path}.label`)!,
    metric_definition: asString(raw.metric_definition, `${path}.metric_definition`)!,
    source: inEnum(raw.source, SOURCES, `${path}.source`),
    semantics,
    evidence_state,
    exactness,
    value,
    unit: raw.unit === undefined || raw.unit === null ? null : asString(raw.unit, `${path}.unit`, false),
    coverage: parseCoverage(raw.coverage, `${path}.coverage`),
    observation: parseObservation(raw.observation, `${path}.observation`),
    provenance,
  };
  if (raw.sampling != null) metric.sampling = parseSampling(raw.sampling, `${path}.sampling`);
  if (raw.confidence_interval != null) metric.confidence_interval = parseConfidence(raw.confidence_interval, `${path}.confidence_interval`);
  if (raw.ratio != null) metric.ratio = parseRatio(raw.ratio, `${path}.ratio`);
  if (raw.classification != null) metric.classification = parseClassification(raw.classification, `${path}.classification`);
  if (raw.supplied_display !== undefined && raw.supplied_display !== null) {
    metric.supplied_display = asString(raw.supplied_display, `${path}.supplied_display`, false);
  }
  return metric;
}

function parseTopology(raw: unknown, path: string): Gold12Topology {
  if (!isObject(raw)) fail(path, "topology object required");
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.relationships)) fail(path, "nodes and relationships arrays required");
  const nodes: Gold12TopologyNode[] = raw.nodes.map((node, i) => {
    if (!isObject(node)) fail(`${path}.nodes[${i}]`, "object required");
    return {
      node_id: asString(node.node_id, `${path}.nodes[${i}].node_id`)!,
      node_type: inEnum(node.node_type, TOPOLOGY_NODE_TYPES, `${path}.nodes[${i}].node_type`),
      label: asString(node.label, `${path}.nodes[${i}].label`)!,
      visibility: node.visibility
        ? inEnum(node.visibility, VISIBILITY_STATES, `${path}.nodes[${i}].visibility`)
        : "unknown",
      active: typeof node.active === "boolean" ? node.active : null,
      metadata: isObject(node.metadata) ? node.metadata : {},
    };
  });
  const nodeIds = new Set(nodes.map((n) => n.node_id));
  const relationships: Gold12TopologyRelationship[] = raw.relationships.map((rel, i) => {
    if (!isObject(rel)) fail(`${path}.relationships[${i}]`, "object required");
    const from_node_id = asString(rel.from_node_id, `${path}.relationships[${i}].from_node_id`)!;
    const to_node_id = asString(rel.to_node_id, `${path}.relationships[${i}].to_node_id`)!;
    if (!nodeIds.has(from_node_id) || !nodeIds.has(to_node_id)) {
      fail(`${path}.relationships[${i}]`, "relationship endpoints must be declared nodes");
    }
    return {
      relationship_id: asString(rel.relationship_id, `${path}.relationships[${i}].relationship_id`)!,
      from_node_id,
      to_node_id,
      relation: inEnum(rel.relation, TOPOLOGY_RELATIONS, `${path}.relationships[${i}].relation`),
      metadata: isObject(rel.metadata) ? rel.metadata : {},
    };
  });
  return { nodes, relationships };
}

function parseSourceSupport(raw: unknown, path: string): Gold12SourceSupport {
  if (!isObject(raw)) fail(path, "source_support object required");
  return {
    source_id: asString(raw.source_id, `${path}.source_id`)!,
    dataset_id: asString(raw.dataset_id, `${path}.dataset_id`)!,
    dataset_in_schema: asBoolean(raw.dataset_in_schema, `${path}.dataset_in_schema`),
    query_permitted: inEnum(raw.query_permitted, SUPPORT_STATES, `${path}.query_permitted`),
    requested_window_supported: inEnum(raw.requested_window_supported, SUPPORT_STATES, `${path}.requested_window_supported`),
    historical_retention_supported: inEnum(
      raw.historical_retention_supported,
      SUPPORT_STATES,
      `${path}.historical_retention_supported`,
    ),
    data_returned: inEnum(raw.data_returned, SUPPORT_STATES, `${path}.data_returned`),
    sampling_status: inEnum(raw.sampling_status, SAMPLING_STATUSES, `${path}.sampling_status`),
    observation_window: raw.observation_window ?? null,
    notes: Array.isArray(raw.notes) ? raw.notes.map(String) : [],
  };
}

export function isCanonicalGold12(raw: unknown): raw is Record<string, unknown> {
  return isObject(raw) && raw.schema_version === GOLD12_SCHEMA_VERSION && raw.contract_name === GOLD12_CONTRACT_NAME;
}

/** Parse Canonical Gold 1.2 using producer field names only. Extra keys are ignored. */
export function parseCanonicalGold12(raw: unknown): CanonicalGold12 {
  if (!isObject(raw)) fail("$", "root object required");
  if (raw.schema_version !== GOLD12_SCHEMA_VERSION) fail("$.schema_version", `must be ${GOLD12_SCHEMA_VERSION}`);
  if (raw.contract_name !== GOLD12_CONTRACT_NAME) fail("$.contract_name", `must be ${GOLD12_CONTRACT_NAME}`);
  if (typeof raw.fixture !== "boolean") fail("$.fixture", "boolean required");
  if (!Array.isArray(raw.metrics) || raw.metrics.length < 1) fail("$.metrics", "non-empty array required");

  const metrics = raw.metrics.map((metric, i) => parseMetric(metric, `$.metrics[${i}]`));
  const metricIds = new Set(metrics.map((m) => m.metric_id));
  if (metricIds.size !== metrics.length) fail("$.metrics", "metric_id values must be unique");
  for (const metric of metrics) {
    if (!metric.ratio) continue;
    for (const ref of [metric.ratio.numerator, metric.ratio.denominator]) {
      if (ref.reference_type === "metric_id" && !metricIds.has(ref.reference_id)) {
        fail(`$.metrics.${metric.metric_id}.ratio`, `metric_id reference does not resolve: ${ref.reference_id}`);
      }
    }
  }

  return {
    schema_version: GOLD12_SCHEMA_VERSION,
    contract_name: GOLD12_CONTRACT_NAME,
    fixture: raw.fixture,
    generated_at: asString(raw.generated_at, "$.generated_at")!,
    pipeline_version: asString(raw.pipeline_version, "$.pipeline_version")!,
    metrics,
    topology: parseTopology(raw.topology, "$.topology"),
    source_support: Array.isArray(raw.source_support)
      ? raw.source_support.map((row, i) => parseSourceSupport(row, `$.source_support[${i}]`))
      : fail("$.source_support", "array required"),
  };
}

export function usedCanonicalField(obj: Record<string, unknown>, canonical: string, aliases: string[]): "canonical" | "alias" | "missing" {
  if (canonical in obj) return "canonical";
  if (aliases.some((alias) => alias in obj)) return "alias";
  return "missing";
}

export type { CoverageState, EvidenceState, Exactness, SamplingStatus, SourceId, SupportState, UniqueCountSemantics };
