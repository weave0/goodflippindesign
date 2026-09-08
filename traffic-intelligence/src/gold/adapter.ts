/**
 * Narrow consumer adapter: raw Gold JSON → UI view model.
 *
 * Canonical M1.1 field names may differ. Map them here — not in views.
 * This is not a second pipeline and does not invent measurements.
 */
import {
  ABSENT_EVIDENCE,
  COVERAGE_STATES,
  EVIDENCE_STATES,
  type CoverageState,
  type EvidenceState,
  type GoldContract,
} from "./types";

const LEGACY_EVIDENCE: Record<string, EvidenceState> = {
  EXACT: "MEASURED",
  MEASURED: "MEASURED",
  SAMPLED: "SAMPLED",
  INFERRED: "INFERRED",
  ESTIMATED: "ESTIMATED",
  UNAVAILABLE: "UNAVAILABLE",
  UNKNOWABLE: "UNKNOWABLE",
  INCOMPLETE: "MEASURED",
};

const LEGACY_COVERAGE: Record<string, CoverageState> = {
  EXACT: "COMPLETE",
  MEASURED: "COMPLETE",
  SAMPLED: "COMPLETE",
  INFERRED: "COMPLETE",
  ESTIMATED: "COMPLETE",
  COMPLETE: "COMPLETE",
  INCOMPLETE: "INCOMPLETE",
  UNAVAILABLE: "MISSING",
  UNKNOWABLE: "NOT_APPLICABLE",
  MISSING: "MISSING",
  NOT_APPLICABLE: "NOT_APPLICABLE",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asEvidence(value: unknown): EvidenceState | undefined {
  if (typeof value !== "string") return undefined;
  if ((EVIDENCE_STATES as readonly string[]).includes(value)) return value as EvidenceState;
  return LEGACY_EVIDENCE[value];
}

function asCoverage(value: unknown): CoverageState | undefined {
  if (typeof value !== "string") return undefined;
  if ((COVERAGE_STATES as readonly string[]).includes(value)) return value as CoverageState;
  return LEGACY_COVERAGE[value];
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
}

function isEvidenceBearing(obj: Record<string, unknown>): boolean {
  return (
    typeof obj.source === "string" &&
    ("status" in obj || "evidenceState" in obj || "evidence_state" in obj || "measurementState" in obj)
  );
}

function normalizeConfidence(raw: unknown): Record<string, unknown> | undefined {
  if (!isObject(raw)) return undefined;
  const interval = Array.isArray(raw.interval) ? raw.interval : undefined;
  const lower = pickNumber(raw, ["lower", "lower_bound", "lo", "ci_lower"]) ?? (typeof interval?.[0] === "number" ? interval[0] : undefined);
  const upper = pickNumber(raw, ["upper", "upper_bound", "hi", "ci_upper"]) ?? (typeof interval?.[1] === "number" ? interval[1] : undefined);
  const level = pickNumber(raw, ["level", "confidence_level", "ci_level"]);
  let intervalValid: boolean | undefined;
  if (typeof raw.intervalValid === "boolean") intervalValid = raw.intervalValid;
  else if (typeof raw.interval_valid === "boolean") intervalValid = raw.interval_valid;
  else if (typeof raw.ci_valid === "boolean") intervalValid = raw.ci_valid;
  else if (lower !== undefined && upper !== undefined) intervalValid = true;
  const out: Record<string, unknown> = {};
  if (level !== undefined) out.level = level;
  if (intervalValid !== undefined) out.intervalValid = intervalValid;
  if (lower !== undefined) out.lower = lower;
  if (upper !== undefined) out.upper = upper;
  if (typeof raw.note === "string") out.note = raw.note;
  return Object.keys(out).length ? out : undefined;
}

function normalizeSampling(obj: Record<string, unknown>): Record<string, unknown> | undefined {
  if (isObject(obj.sampling)) {
    const s = obj.sampling;
    return {
      interval: s.interval ?? s.sample_interval,
      intervalMeaning: s.intervalMeaning ?? s.interval_meaning ?? s.meaning,
      factor: s.factor ?? s.sample_factor,
      factorMeaning: s.factorMeaning ?? s.factor_meaning,
    };
  }
  if (obj.sampleInterval !== undefined || obj.sampleFactor !== undefined || obj.sample_interval !== undefined) {
    return {
      interval: obj.sampleInterval ?? obj.sample_interval,
      factor: obj.sampleFactor ?? obj.sample_factor,
    };
  }
  return undefined;
}

function normalizeEvidenceFields(obj: Record<string, unknown>): void {
  const legacy = typeof obj.status === "string" ? obj.status : undefined;
  const evidence =
    asEvidence(obj.evidenceState) ??
    asEvidence(obj.evidence_state) ??
    asEvidence(obj.measurementState) ??
    asEvidence(legacy);
  const coverage =
    asCoverage(obj.coverage) ??
    asCoverage(obj.coverageState) ??
    asCoverage(obj.coverage_state) ??
    asCoverage(obj.missingness) ??
    (legacy === "INCOMPLETE" ? "INCOMPLETE" : asCoverage(legacy));

  if (evidence) obj.evidenceState = evidence;
  if (coverage) obj.coverage = coverage;
  delete obj.status;

  if (evidence && (ABSENT_EVIDENCE as readonly string[]).includes(evidence)) {
    obj.value = null;
  }

  const sampling = normalizeSampling(obj);
  if (sampling) obj.sampling = sampling;
  delete obj.sampleInterval;
  delete obj.sampleFactor;
  delete obj.sample_interval;
  delete obj.sample_factor;

  const confidence = normalizeConfidence(obj.confidence);
  if (confidence) obj.confidence = confidence;

  if (isObject(obj.ratio) && obj.ratio.authoritative === undefined) {
    obj.ratio = { ...obj.ratio, authoritative: true };
  }

  if (typeof obj.class === "string" && !obj.normalizedClass) {
    obj.normalizedClass = obj.class;
  }
  if (typeof obj.sourceNativeClass !== "string" && typeof obj.source_native_class === "string") {
    obj.sourceNativeClass = obj.source_native_class;
  }

  if (typeof obj.aiToHumanDisplay === "string" && !obj.aiToHuman) {
    obj.aiToHuman = { value: null, unit: "ratio", display: obj.aiToHumanDisplay, authoritative: true };
  }
  if (typeof obj.humanToMachineDisplay === "string" && !obj.humanToMachine) {
    obj.humanToMachine = { value: null, unit: "ratio", display: obj.humanToMachineDisplay, authoritative: true };
  }
}

function walk(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(walk);
  if (!isObject(value)) return value;
  if (isEvidenceBearing(value)) normalizeEvidenceFields(value);
  if (isObject(value) && typeof value.shortLabel === "string" && typeof value.coverage === "string") {
    if (typeof value.typicalEvidence !== "string") {
      value.typicalEvidence = asEvidence(value.coverage) ?? "MEASURED";
    }
    const cov = asCoverage(value.coverage);
    if (cov) value.coverage = cov;
  }
  for (const [key, child] of Object.entries(value)) {
    value[key] = walk(child);
  }
  return value;
}

export function adaptGold(raw: unknown): GoldContract {
  const cloned = structuredClone(raw);
  walk(cloned);
  if (!isObject(cloned)) {
    throw new Error("Gold adapter: root is not an object");
  }
  return cloned as unknown as GoldContract;
}

export function isAbsentEvidence(state: EvidenceState | undefined): boolean {
  return state === "UNAVAILABLE" || state === "UNKNOWABLE";
}
