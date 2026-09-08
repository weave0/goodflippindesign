import {
  FORBIDDEN_COMBINED_SOURCES,
  GRAINS,
  MEASUREMENT_STATUSES,
  SOURCES,
  type GoldContract,
  type Metric,
} from "./types";

const REQUIRED_TERMS = [
  "visitor",
  "user",
  "session",
  "pageview",
  "human",
  "bot",
  "AI crawler",
  "AI agent",
  "threat",
  "confidence",
];

function fail(message: string): never {
  throw new Error(`Gold contract invalid: ${message}`);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertMetric(metric: unknown, path: string): asserts metric is Metric {
  if (!isObject(metric)) fail(`${path} is not an object`);
  for (const key of ["id", "label", "source", "grain", "status", "definitionId", "pipelineVersion"]) {
    if (typeof metric[key] !== "string" || !metric[key]) fail(`${path}.${key} missing`);
  }
  if (!isObject(metric.timeWindow)) fail(`${path}.timeWindow missing`);
  if (!(SOURCES as readonly string[]).includes(metric.source as string)) {
    fail(`${path}.source is not a canonical source (${metric.source})`);
  }
  if ((FORBIDDEN_COMBINED_SOURCES as readonly string[]).includes(metric.source as string)) {
    fail(`${path}.source is a forbidden combined source`);
  }
  if (!(MEASUREMENT_STATUSES as readonly string[]).includes(metric.status as string)) {
    fail(`${path}.status invalid`);
  }
  if (!(GRAINS as readonly string[]).includes(metric.grain as string)) {
    fail(`${path}.grain invalid`);
  }
  if (metric.status === "UNAVAILABLE") {
    if (metric.value !== null) fail(`${path}.value must be null when UNAVAILABLE`);
  } else if (typeof metric.value !== "number" && metric.value !== null) {
    fail(`${path}.value must be number or null`);
  }
  const label = String(metric.label).toLowerCase();
  if (label === "visitors" || label === "total visitors") {
    fail(`${path}.label forbids an un-sourced visitors vanity number`);
  }
}

function walkMetrics(value: unknown, path: string, visit: (metric: Metric, path: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkMetrics(item, `${path}[${index}]`, visit));
    return;
  }
  if (!isObject(value)) return;
  if (typeof value.id === "string" && typeof value.source === "string" && typeof value.status === "string" && "grain" in value && "timeWindow" in value) {
    assertMetric(value, path);
    visit(value, path);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "definitions" || key === "contract") continue;
    walkMetrics(child, `${path}.${key}`, visit);
  }
}

export function assertGoldContract(data: unknown): asserts data is GoldContract {
  if (!isObject(data)) fail("root is not an object");
  if (!isObject(data.contract)) fail("contract missing");
  if (data.contract.name !== "gfd-traffic-intelligence-gold") fail("contract.name mismatch");
  if (!Array.isArray(data.definitions)) fail("definitions missing");
  const terms = new Set(data.definitions.map((d) => (isObject(d) ? String(d.term) : "")));
  for (const term of REQUIRED_TERMS) {
    if (!terms.has(term)) fail(`definition for "${term}" missing`);
  }
  if (!Array.isArray(data.sources) || data.sources.length < 6) fail("sources must list all six channels");
  const sourceIds = data.sources.map((s) => (isObject(s) ? s.id : ""));
  for (const id of SOURCES) {
    if (!sourceIds.includes(id)) fail(`source ${id} missing`);
  }
  if (!isObject(data.windows) || Object.keys(data.windows).length === 0) fail("windows missing");
  if (typeof data.defaultWindowId !== "string" || !(data.defaultWindowId in data.windows)) {
    fail("defaultWindowId missing from windows");
  }

  const seen = new Set<string>();
  walkMetrics(data, "$", (metric, path) => {
    seen.add(metric.id);
    if (metric.source === "modeled" && metric.status === "EXACT") {
      fail(`${path} modeled metrics cannot be EXACT`);
    }
  });
  if (seen.size === 0) fail("no metrics found");
}

export function collectMetrics(data: GoldContract): Metric[] {
  const metrics: Metric[] = [];
  walkMetrics(data, "$", (metric) => {
    metrics.push(metric);
  });
  return metrics;
}
