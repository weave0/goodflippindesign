import {
  WORK_LIFECYCLES,
  WORK_QUEUE_CONTRACT,
  WORK_QUEUE_SCHEMA_VERSION,
  type WorkLifecycle,
  type WorkQueueDocument,
  type WorkQueueItem,
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
  for (const [key, item] of Object.entries(raw.items)) {
    assertItem(item, key);
  }
}

export function isWorkLifecycle(value: string): value is WorkLifecycle {
  return (WORK_LIFECYCLES as readonly string[]).includes(value);
}
