import { ABSENT_EVIDENCE, COVERAGE_STATES, EVIDENCE_STATES, EXACTNESS_STATES, SOURCES } from "./canonical";
import { FORBIDDEN_COMBINED_SOURCES, GRAINS, type GoldContract, type Metric } from "./types";

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
  const evidence = metric.evidence_state ?? metric.evidenceState;
  if (typeof metric.metric_id !== "string" && typeof metric.id !== "string") fail(`${path}.metric_id missing`);
  if (typeof metric.label !== "string") fail(`${path}.label missing`);
  if (typeof metric.source !== "string") fail(`${path}.source missing`);
  if (!(SOURCES as readonly string[]).includes(metric.source as string)) {
    fail(`${path}.source is not a canonical source (${metric.source})`);
  }
  if ((FORBIDDEN_COMBINED_SOURCES as readonly string[]).includes(metric.source as string)) {
    fail(`${path}.source is a forbidden blended source`);
  }
  if (!(EVIDENCE_STATES as readonly string[]).includes(evidence as string)) {
    fail(`${path}.evidence_state invalid (${String(evidence)})`);
  }
  const exactness = metric.exactness;
  if (exactness !== undefined && !(EXACTNESS_STATES as readonly string[]).includes(exactness as string)) {
    fail(`${path}.exactness invalid`);
  }
  const coverageState =
    isObject(metric.coverage) && typeof metric.coverage.state === "string"
      ? metric.coverage.state
      : metric.coverageState ?? metric.coverage;
  if (typeof coverageState === "string" && !(COVERAGE_STATES as readonly string[]).includes(coverageState)) {
    fail(`${path}.coverage.state invalid (${String(coverageState)})`);
  }
  if (typeof metric.grain === "string" && !(GRAINS as readonly string[]).includes(metric.grain)) {
    fail(`${path}.grain invalid`);
  }
  if ((ABSENT_EVIDENCE as readonly string[]).includes(evidence as string)) {
    if (metric.value !== null && metric.value !== undefined) fail(`${path}.value must be null when ${String(evidence)}`);
  } else if (typeof metric.value !== "number" && metric.value !== null && metric.value !== undefined) {
    fail(`${path}.value must be number or null`);
  }
  const label = String(metric.label).toLowerCase();
  if (label === "visitors" || label === "total visitors") {
    fail(`${path}.label forbids an un-sourced visitors vanity number`);
  }
  const unique =
    isObject(metric.semantics) && typeof metric.semantics.unique_count_semantics === "string"
      ? metric.semantics.unique_count_semantics
      : metric.uniqueSemantics;
  if (/ecosystem unique humans/.test(label) && unique !== "ecosystem_human_unique_deduplicated") {
    fail(`${path}.label claims ecosystem unique humans without that unique_count_semantics`);
  }
}

function walkMetrics(value: unknown, path: string, visit: (metric: Metric, path: string) => void): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkMetrics(item, `${path}[${index}]`, visit));
    return;
  }
  if (!isObject(value)) return;
  if (
    (typeof value.metric_id === "string" || typeof value.id === "string") &&
    typeof value.source === "string" &&
    (typeof value.evidence_state === "string" || typeof value.evidenceState === "string") &&
    (value.grain !== undefined || value.semantics !== undefined) &&
    (value.timeWindow !== undefined || value.observation !== undefined)
  ) {
    assertMetric(value, path);
    visit(value as Metric, path);
  }
  for (const [key, child] of Object.entries(value)) {
    if (key === "definitions" || key === "contract" || key === "canonical") continue;
    walkMetrics(child, `${path}.${key}`, visit);
  }
}

export function assertGoldContract(data: unknown): asserts data is GoldContract {
  if (!isObject(data)) fail("root is not an object");
  if (!isObject(data.contract)) fail("contract missing");
  if (!isObject(data.windows) || Object.keys(data.windows).length === 0) fail("windows missing");
  if (typeof data.defaultWindowId !== "string" || !(data.defaultWindowId in data.windows)) {
    fail("defaultWindowId missing from windows");
  }
  if (Array.isArray(data.definitions) && data.definitions.length) {
    const terms = new Set(data.definitions.map((d) => (isObject(d) ? String(d.term) : "")));
    for (const term of REQUIRED_TERMS) {
      if (!terms.has(term) && !data.canonical) fail(`definition for "${term}" missing`);
    }
  }
  const seen = new Set<string>();
  walkMetrics(data, "$", (metric) => {
    seen.add(metric.metric_id ?? metric.id);
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
