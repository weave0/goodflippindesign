import type { TrafficInsightDocument } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertTrafficInsights(raw: unknown): asserts raw is TrafficInsightDocument {
  if (!isObject(raw)) throw new Error("Traffic insights must be an object");
  if (raw.contract_name !== "gfd-traffic-insights") {
    throw new Error(`Unexpected insights contract_name: ${String(raw.contract_name)}`);
  }
  if (raw.schema_version !== "1.0.0") {
    throw new Error(`Unexpected insights schema_version: ${String(raw.schema_version)}`);
  }
  if (typeof raw.fixture !== "boolean") throw new Error("Insights fixture flag must be boolean");
  if (!Array.isArray(raw.series) || !Array.isArray(raw.findings) || !Array.isArray(raw.actions)) {
    throw new Error("Insights require series, findings, and actions arrays");
  }
}
