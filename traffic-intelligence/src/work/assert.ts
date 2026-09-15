import {
  IMPACT_CLASSES,
  WORK_LIFECYCLES,
  WORK_QUEUE_CONTRACT,
  WORK_QUEUE_SCHEMA_VERSION,
  type WorkLifecycle,
  type WorkQueueDocument,
  type WorkQueueItem,
  type WorkQueueMetrics,
} from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function assertMetrics(value: unknown): asserts value is WorkQueueMetrics {
  if (!isObject(value)) throw new Error("Work queue metrics must be an object");
  for (const key of [
    "planned",
    "auto",
    "recommend",
    "open_issues",
    "creates_last_sync",
    "updates_last_sync",
    "closes_last_sync",
    "consolidated_groups",
    "superseded_duplicates",
  ] as const) {
    if (!isNumber(value[key])) throw new Error(`Work queue metrics.${key} must be a number`);
  }
  if (!isObject(value.by_lifecycle)) throw new Error("Work queue metrics.by_lifecycle must be an object");
  if (!isObject(value.by_impact_class)) throw new Error("Work queue metrics.by_impact_class must be an object");
}

function assertItem(value: unknown, key: string): asserts value is WorkQueueItem {
  if (!isObject(value)) throw new Error(`Work queue items[${key}] must be an object`);
  if (!isString(value.action_id) || value.action_id !== key) {
    throw new Error(`Work queue items[${key}].action_id must equal the map key`);
  }
  if (!(WORK_LIFECYCLES as readonly string[]).includes(value.lifecycle as string)) {
    throw new Error(`Work queue items[${key}].lifecycle invalid`);
  }
  if (value.eligibility !== "auto" && value.eligibility !== "recommend") {
    throw new Error(`Work queue items[${key}].eligibility must be auto|recommend`);
  }
  if (!isString(value.target_repo)) throw new Error(`Work queue items[${key}].target_repo must be a string`);
  if (!isString(value.title)) throw new Error(`Work queue items[${key}].title must be a string`);
  if (!isString(value.priority_class)) throw new Error(`Work queue items[${key}].priority_class must be a string`);
  if (!isString(value.recommended_action)) {
    throw new Error(`Work queue items[${key}].recommended_action must be a string`);
  }
  if (!isString(value.verification_condition)) {
    throw new Error(`Work queue items[${key}].verification_condition must be a string`);
  }
  if (!isStringArray(value.finding_ids ?? [])) {
    throw new Error(`Work queue items[${key}].finding_ids must be a string array`);
  }
  if (value.issue_number != null && typeof value.issue_number !== "number") {
    throw new Error(`Work queue items[${key}].issue_number must be number|null`);
  }
  if (!isNumber(value.impact_score)) {
    throw new Error(`Work queue items[${key}].impact_score must be a number`);
  }
  if (!(IMPACT_CLASSES as readonly string[]).includes(value.impact_class as string)) {
    throw new Error(`Work queue items[${key}].impact_class invalid`);
  }
  if (!isString(value.impact_rationale)) {
    throw new Error(`Work queue items[${key}].impact_rationale must be a string`);
  }
  const role = value.group_role;
  if (role !== "primary" && role !== "member" && role !== "standalone") {
    throw new Error(`Work queue items[${key}].group_role must be primary|member|standalone`);
  }
  if (!isStringArray(value.group_member_action_ids ?? [])) {
    throw new Error(`Work queue items[${key}].group_member_action_ids must be a string array`);
  }
}

export function assertWorkQueue(raw: unknown): asserts raw is WorkQueueDocument {
  if (!isObject(raw)) throw new Error("Work queue must be an object");
  if (raw.contract_name !== WORK_QUEUE_CONTRACT) {
    throw new Error(`Unexpected work queue contract_name: ${String(raw.contract_name)}`);
  }
  if (raw.schema_version !== WORK_QUEUE_SCHEMA_VERSION) {
    throw new Error(`Unexpected work queue schema_version: ${String(raw.schema_version)}`);
  }
  if (!isBoolean(raw.fixture)) throw new Error("Work queue fixture flag must be boolean");
  if (!isString(raw.generated_at)) throw new Error("Work queue generated_at must be a string");
  if (!isString(raw.target_repo)) throw new Error("Work queue target_repo must be a string");
  if (!isObject(raw.items)) throw new Error("Work queue items must be an object map");
  if (!isStringArray(raw.limitations ?? [])) throw new Error("Work queue limitations must be a string array");
  assertMetrics(raw.metrics);
  for (const [key, item] of Object.entries(raw.items)) {
    assertItem(item, key);
  }
}

export function isWorkLifecycle(value: string): value is WorkLifecycle {
  return (WORK_LIFECYCLES as readonly string[]).includes(value);
}
