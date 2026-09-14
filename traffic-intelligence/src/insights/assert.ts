import type { TrafficInsightDocument } from "./types";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
  if (version === "1.1.0") {
    if (!Array.isArray(raw.briefs)) {
      throw new Error("Insights schema 1.1.0 requires briefs array");
    }
    if (!isObject(raw.estate_brief)) {
      throw new Error("Insights schema 1.1.0 requires estate_brief object");
    }
    if (!Array.isArray(raw.property_health)) {
      throw new Error("Insights schema 1.1.0 requires property_health array");
    }
  }
}
