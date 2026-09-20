import type { TrafficInsightDocument } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

const PRIORITIES = new Set(["act_now", "investigate", "watch", "healthy", "measurement_blocked"]);
const SEVERITIES = new Set(["low", "medium", "high", "critical", "info"]);
const ESTATE_STATUSES = new Set(["stable", "attention_required", "degraded", "insufficient_evidence"]);
const DIRECTIONS = new Set(["up", "down", "flat", "unknown"]);
const PERIOD_DAYS = new Set([7, 28, 90]);

function assertPriority(value: unknown, label: string): void {
  if (!isString(value) || !PRIORITIES.has(value)) {
    throw new Error(`Insights ${label} must be a known priority_class`);
  }
}

function assertEstateBrief(value: unknown): void {
  if (!isObject(value)) throw new Error("Insights schema 1.1.0 requires estate_brief object");
  if (!isString(value.status) || !ESTATE_STATUSES.has(value.status)) {
    throw new Error("Insights estate_brief.status is invalid");
  }
  for (const key of [
    "top_changes",
    "top_wins",
    "measurement_limitations",
    "top_actions",
    "properties_to_inspect",
  ] as const) {
    if (!isStringArray(value[key])) {
      throw new Error(`Insights estate_brief.${key} must be a string array`);
    }
  }
}

const ESTATE_CONFIG_STATES = new Set(["healthy", "governance_gap", "config_drift", "unobserved"]);
const ESTATE_EVIDENCE_CLASSES = ["zone", "dns", "pages"] as const;
/** `no_project` is a Pages-only observation (a complete deploy-authority inventory holds no project). */
const ESTATE_EVIDENCE_STATUSES: Record<(typeof ESTATE_EVIDENCE_CLASSES)[number], Set<string>> = {
  zone: new Set(["observed", "unavailable"]),
  dns: new Set(["observed", "unavailable"]),
  pages: new Set(["observed", "no_project", "unavailable"]),
};
/** Only the designated credential can prove each class of fact. */
const ESTATE_EVIDENCE_AUTHORITY = {
  zone: "analytics_credential",
  dns: "analytics_credential",
  pages: "deploy_credential",
} as const;

function isStringRecord(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every(isString);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function assertEstateInventory(value: unknown, label: string): void {
  if (!isObject(value) || !isString(value.authority) || !isBoolean(value.complete) || !isCount(value.count)) {
    throw new Error(`Insights estate_config.${label} must declare authority, complete and a non-negative integer count`);
  }
  // A partially-enumerated inventory is never renderable as an accounted estate.
  if (value.complete !== true) throw new Error(`Insights estate_config.${label} is not complete`);
}

/**
 * The estate accounting must reconcile: every governed zone accounted exactly
 * once, and any non-observed evidence must carry a reason. A partially-accounted
 * estate is rejected rather than rendered as if it were complete.
 */
export function assertEstateConfig(value: unknown): void {
  if (!isObject(value)) throw new Error("Insights estate_config must be an object");
  if (value.schema_version !== "1.1.0") throw new Error("Insights estate_config.schema_version must be 1.1.0");
  if (!isCount(value.governed_zone_count) || !isCount(value.accounted_zone_count)) {
    throw new Error("Insights estate_config requires non-negative integer governed_zone_count and accounted_zone_count");
  }
  // Exactly the four known states, each a non-negative integer: an arbitrary key or a
  // fractional/negative count is a false accounting.
  const stateCounts = value.state_counts;
  if (
    !isObject(stateCounts) ||
    Object.keys(stateCounts).length !== ESTATE_CONFIG_STATES.size ||
    ![...ESTATE_CONFIG_STATES].every((state) => isCount(stateCounts[state]))
  ) {
    throw new Error("Insights estate_config.state_counts must map exactly the four known states to non-negative integers");
  }
  assertEstateInventory(value.zone_inventory, "zone_inventory");
  assertEstateInventory(value.pages_inventory, "pages_inventory");
  if (!isStringArray(value.credential_boundaries)) {
    throw new Error("Insights estate_config.credential_boundaries must be a string array");
  }
  if (!Array.isArray(value.properties)) throw new Error("Insights estate_config.properties must be an array");
  const seen = new Set<string>();
  value.properties.forEach((row: unknown, index: number) => {
    if (!isObject(row) || !isString(row.property_id) || !isString(row.reason)) {
      throw new Error(`Insights estate_config.properties[${index}] is malformed`);
    }
    if (!isString(row.state) || !ESTATE_CONFIG_STATES.has(row.state)) {
      throw new Error(`Insights estate_config.properties[${index}].state is invalid`);
    }
    if (!isStringRecord(row.authorities) || !isStringRecord(row.evidence_status) || !isStringRecord(row.evidence_reasons)) {
      throw new Error(`Insights estate_config.properties[${index}] provenance maps must be string maps`);
    }
    if (seen.has(row.property_id)) throw new Error(`Insights estate_config lists ${row.property_id} more than once`);
    seen.add(row.property_id);
    for (const evidenceClass of ESTATE_EVIDENCE_CLASSES) {
      const status = row.evidence_status[evidenceClass];
      if (!isString(status) || !ESTATE_EVIDENCE_STATUSES[evidenceClass].has(status)) {
        throw new Error(`Insights estate_config.properties[${index}] has an invalid ${evidenceClass} evidence status`);
      }
      if (status !== "observed" && !row.evidence_reasons[evidenceClass]?.trim()) {
        throw new Error(`Insights estate_config.properties[${index}] ${evidenceClass} evidence is ${status} without an explicit reason`);
      }
      if (row.authorities[evidenceClass] !== ESTATE_EVIDENCE_AUTHORITY[evidenceClass]) {
        throw new Error(
          `Insights estate_config.properties[${index}] ${evidenceClass} evidence must name authority ${ESTATE_EVIDENCE_AUTHORITY[evidenceClass]}`,
        );
      }
    }
  });
  if (value.properties.length !== value.accounted_zone_count) {
    throw new Error("Insights estate_config.accounted_zone_count does not match its properties");
  }
  if (value.accounted_zone_count !== value.governed_zone_count) {
    throw new Error(
      `Insights estate_config accounts for ${value.accounted_zone_count} of ${value.governed_zone_count} governed zones`,
    );
  }
  // Derive each state's count from the rows and compare: the summary may not disagree with the properties.
  const derived: Record<string, number> = {};
  for (const row of value.properties as Array<{ state: string }>) derived[row.state] = (derived[row.state] ?? 0) + 1;
  for (const state of ESTATE_CONFIG_STATES) {
    if ((derived[state] ?? 0) !== (stateCounts as Record<string, number>)[state]) {
      throw new Error(`Insights estate_config.state_counts.${state} does not match the per-property states`);
    }
  }
}

function assertBrief(value: unknown, index: number): void {
  if (!isObject(value)) throw new Error(`Insights briefs[${index}] must be an object`);
  for (const key of ["brief_id", "property_id", "category", "headline", "summary", "recommended_action", "verification_condition"] as const) {
    if (!isString(value[key])) throw new Error(`Insights briefs[${index}].${key} must be a string`);
  }
  if (!isString(value.severity) || !SEVERITIES.has(value.severity)) {
    throw new Error(`Insights briefs[${index}].severity is invalid`);
  }
  assertPriority(value.priority, `briefs[${index}].priority`);
  if (value.direction !== undefined && (!isString(value.direction) || !DIRECTIONS.has(value.direction))) {
    throw new Error(`Insights briefs[${index}].direction is invalid`);
  }
  if (!isObject(value.materiality)) throw new Error(`Insights briefs[${index}].materiality must be an object`);
  if (!isStringArray(value.persistence)) throw new Error(`Insights briefs[${index}].persistence must be a string array`);
  if (!isStringArray(value.finding_ids)) throw new Error(`Insights briefs[${index}].finding_ids must be a string array`);
  if (!isString(value.confidence)) throw new Error(`Insights briefs[${index}].confidence must be a string`);
  if (!isString(value.action_class)) throw new Error(`Insights briefs[${index}].action_class must be a string`);
  if (!isStringArray(value.limitations ?? [])) throw new Error(`Insights briefs[${index}].limitations must be a string array`);
  // OverviewView always .join()s these — reject wrong types fail-closed (match limitations).
  if (!isStringArray(value.corroborating_signals ?? [])) {
    throw new Error(`Insights briefs[${index}].corroborating_signals must be a string array`);
  }
  if (!isStringArray(value.contradictory_signals ?? [])) {
    throw new Error(`Insights briefs[${index}].contradictory_signals must be a string array`);
  }
}

function assertPropertyHealth(value: unknown, index: number): void {
  if (!isObject(value)) throw new Error(`Insights property_health[${index}] must be an object`);
  if (!isString(value.property_id)) throw new Error(`Insights property_health[${index}].property_id must be a string`);
  assertPriority(value.overall, `property_health[${index}].overall`);
  for (const key of ["traffic", "delivery", "threats", "measurement"] as const) {
    if (!isString(value[key])) throw new Error(`Insights property_health[${index}].${key} must be a string`);
  }
  if (value.notes !== undefined && !isString(value.notes)) {
    throw new Error(`Insights property_health[${index}].notes must be a string`);
  }
}

function assertTrendComparison(value: unknown, index: number): void {
  if (!isObject(value)) throw new Error(`Insights trend_comparisons[${index}] must be an object`);
  if (!isString(value.property_id)) throw new Error(`Insights trend_comparisons[${index}].property_id must be a string`);
  if (!isString(value.metric_name)) throw new Error(`Insights trend_comparisons[${index}].metric_name must be a string`);
  if (!isNumber(value.period_days) || !PERIOD_DAYS.has(value.period_days)) {
    throw new Error(`Insights trend_comparisons[${index}].period_days must be 7, 28, or 90`);
  }
  if (!isBoolean(value.available)) throw new Error(`Insights trend_comparisons[${index}].available must be boolean`);
  if (!isString(value.coverage_state)) throw new Error(`Insights trend_comparisons[${index}].coverage_state must be a string`);
  if (!isString(value.source)) throw new Error(`Insights trend_comparisons[${index}].source must be a string`);
  if (value.exactness !== undefined && !isString(value.exactness)) {
    throw new Error(`Insights trend_comparisons[${index}].exactness must be a string`);
  }
  if (!isStringArray(value.missing_dates ?? [])) {
    throw new Error(`Insights trend_comparisons[${index}].missing_dates must be a string array`);
  }
  if (value.available) {
    for (const key of ["current_value", "baseline_value", "absolute_delta"] as const) {
      if (!isNumber(value[key])) {
        throw new Error(`Insights trend_comparisons[${index}].${key} required when available=true`);
      }
    }
    // Overview renders (percent_delta * 100).toFixed(1) when available && !== null.
    // isNumber already rejects NaN; still require key present as null | finite number.
    if (value.percent_delta !== null && !isNumber(value.percent_delta)) {
      throw new Error(
        `Insights trend_comparisons[${index}].percent_delta must be null or a finite number when available=true`,
      );
    }
  } else if (value.absolute_delta != null || value.percent_delta != null) {
    // Allow nulls only; reject invented numerics on unavailable rows.
    if (value.absolute_delta !== null && value.absolute_delta !== undefined) {
      throw new Error(`Insights trend_comparisons[${index}] unavailable row must not expose absolute_delta`);
    }
    if (value.percent_delta !== null && value.percent_delta !== undefined) {
      throw new Error(`Insights trend_comparisons[${index}] unavailable row must not expose percent_delta`);
    }
  }
}

function assertAction(value: unknown, index: number): void {
  if (!isObject(value)) throw new Error(`Insights actions[${index}] must be an object`);
  if (!isString(value.action_id)) throw new Error(`Insights actions[${index}].action_id must be a string`);
  if (!isString(value.finding_id)) throw new Error(`Insights actions[${index}].finding_id must be a string`);
  if (!isString(value.severity) || !SEVERITIES.has(value.severity)) {
    throw new Error(`Insights actions[${index}].severity is invalid`);
  }
  if (!isString(value.recommended_action)) throw new Error(`Insights actions[${index}].recommended_action must be a string`);
  // OverviewView joins evidence_refs and finding_ids — reject wrong types fail-closed.
  if (!isStringArray(value.evidence_refs ?? [])) {
    throw new Error(`Insights actions[${index}].evidence_refs must be a string array`);
  }
  if (!isStringArray(value.finding_ids ?? [])) {
    throw new Error(`Insights actions[${index}].finding_ids must be a string array`);
  }
  // priority_class preferred; legacy categorical priority string also accepted at assert time.
  const cls = value.priority_class ?? (typeof value.priority === "string" ? value.priority : undefined);
  if (cls !== undefined) assertPriority(cls, `actions[${index}].priority_class`);
  if (typeof value.priority === "number") {
    if (!Number.isInteger(value.priority) || value.priority < 1 || value.priority > 5) {
      throw new Error(`Insights actions[${index}].priority must be int 1–5`);
    }
  } else if (typeof value.priority === "string") {
    assertPriority(value.priority, `actions[${index}].priority`);
  } else if (cls === undefined) {
    throw new Error(`Insights actions[${index}] requires priority_class or priority`);
  }
}

export function assertTrafficInsights(raw: unknown): asserts raw is TrafficInsightDocument {
  if (!isObject(raw)) throw new Error("Traffic insights must be an object");
  if (raw.contract_name !== "gfd-traffic-insights") {
    throw new Error(`Unexpected insights contract_name: ${String(raw.contract_name)}`);
  }
  const version = raw.schema_version;
  if (version !== "1.0.0" && version !== "1.1.0") {
    throw new Error(`Unexpected insights schema_version: ${String(version)}`);
  }
  if (typeof raw.fixture !== "boolean") throw new Error("Insights fixture flag must be boolean");
  if (!Array.isArray(raw.series) || !Array.isArray(raw.findings) || !Array.isArray(raw.actions)) {
    throw new Error("Insights require series, findings, and actions arrays");
  }
  raw.actions.forEach((action, index) => assertAction(action, index));
  if (version === "1.1.0") {
    if (!Array.isArray(raw.briefs)) {
      throw new Error("Insights schema 1.1.0 requires briefs array");
    }
    raw.briefs.forEach((brief, index) => assertBrief(brief, index));
    assertEstateBrief(raw.estate_brief);
    if (!Array.isArray(raw.property_health)) {
      throw new Error("Insights schema 1.1.0 requires property_health array");
    }
    raw.property_health.forEach((row, index) => assertPropertyHealth(row, index));
    if (!Array.isArray(raw.trend_comparisons)) {
      throw new Error("Insights schema 1.1.0 requires trend_comparisons array");
    }
    raw.trend_comparisons.forEach((row, index) => assertTrendComparison(row, index));
    if (raw.estate_config !== undefined && raw.estate_config !== null) assertEstateConfig(raw.estate_config);
  }
}