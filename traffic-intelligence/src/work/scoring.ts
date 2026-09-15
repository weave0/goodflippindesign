import type {
  InsightAction,
  InsightFinding,
  InsightMateriality,
  OperationalBrief,
} from "../insights/types";
import { isOperatorProperty, type OperatorPropertyContext } from "../insights/operator-properties";
import {
  MATERIALITY_ABS_PAGEVIEWS_MIN,
  MATERIALITY_ABS_REQUESTS_MIN,
  MATERIALITY_PERCENT_DELTA_MIN,
  type ImpactClass,
} from "./types";

export interface ScoringContext {
  action: InsightAction;
  brief?: OperationalBrief | null;
  finding?: InsightFinding | null;
  findings?: InsightFinding[];
  /** When provided, boosts score for operator-visible properties. */
  operatorCtx?: OperatorPropertyContext | null;
}

export interface ImpactScoreResult {
  impact_score: number;
  impact_class: ImpactClass;
  rationale: string;
}

const PRIORITY_POINTS: Record<string, number> = {
  act_now: 40,
  investigate: 30,
  measurement_blocked: 12,
  watch: 10,
  healthy: 6,
};

const SEVERITY_POINTS: Record<string, number> = {
  critical: 25,
  high: 18,
  medium: 10,
  low: 4,
  info: 1,
};

const CONFIDENCE_POINTS: Record<string, number> = {
  high: 15,
  medium: 8,
  low: 2,
};

/**
 * Deterministic impact score for ranking + auto vs recommend governance (TI-010).
 * Higher = more operator-valuable / urgent. Fail-closed on missing signals (no invented magnitude).
 */
export function scoreImpact(ctx: ScoringContext): ImpactScoreResult {
  const findings = collectFindings(ctx);
  const brief = ctx.brief ?? null;
  const primary = ctx.finding ?? findings[0] ?? null;
  const confidence = brief?.confidence ?? null;
  const category = brief?.category ?? inferCategory(primary);
  const materiality = brief?.materiality ?? null;
  const persistence = brief?.persistence ?? [];

  const bits: string[] = [];
  let score = 0;

  const pc = ctx.action.priority_class;
  const pcPts = PRIORITY_POINTS[pc] ?? 5;
  score += pcPts;
  bits.push(`priority ${pc}(+${pcPts})`);

  const sev = ctx.action.severity;
  const sevPts = SEVERITY_POINTS[sev] ?? 0;
  score += sevPts;
  bits.push(`severity ${sev}(+${sevPts})`);

  const confPts = confidence ? (CONFIDENCE_POINTS[confidence] ?? 0) : 0;
  score += confPts;
  bits.push(confidence ? `confidence ${confidence}(+${confPts})` : "confidence unknown(+0)");

  const matPts = materialityPoints(materiality);
  score += matPts.points;
  bits.push(matPts.label);

  const persistPts = persistence.includes("28d") ? 8 : persistence.includes("7d") ? 4 : 0;
  score += persistPts;
  if (persistPts) bits.push(`persistence ${persistence.join(",")}+(${persistPts})`);

  const measurementOnly = category === "measurement" || primary?.kind === "data_gap";
  const trafficOrSecurity =
    category === "traffic" ||
    category === "security" ||
    category === "delivery" ||
    primary?.kind === "issue" ||
    primary?.kind === "change";

  if (measurementOnly && !trafficOrSecurity) {
    score -= 10;
    bits.push("measurement-only(-10)");
  } else if (trafficOrSecurity) {
    score += 12;
    bits.push("traffic/security/delivery(+12)");
  }

  const propertyId = ctx.action.property_id;
  if (propertyId && ctx.operatorCtx) {
    if (isOperatorProperty(propertyId, ctx.operatorCtx)) {
      score += 6;
      bits.push("operator-property(+6)");
    } else {
      score -= 8;
      bits.push("non-operator-property(-8)");
    }
  } else if (propertyId == null && ctx.action.scope === "source") {
    score += 4;
    bits.push("estate-source(+4)");
  }

  // Healthy opportunity rises are informational review, not repair urgency.
  if (pc === "healthy" && findings.some((f) => f.kind === "opportunity" || f.kind === "success")) {
    score = Math.min(score, 35);
    bits.push("healthy-opportunity capped");
  }

  // Low-confidence measurement floods stay low impact.
  if (pc === "measurement_blocked" && confidence === "low") {
    score = Math.min(score, 28);
    bits.push("low-confidence measurement capped");
  }

  score = Math.max(0, Math.min(100, score));
  const impact_class = classFromScore(score, pc, confidence);
  return {
    impact_score: score,
    impact_class,
    rationale: bits.join("; "),
  };
}

function classFromScore(
  score: number,
  priorityClass: string,
  confidence: string | null,
): ImpactClass {
  if (priorityClass === "act_now" && score >= 60) return "critical";
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 32) return "medium";
  if (score >= 18) return "low";
  if (priorityClass === "healthy" || confidence === "low") return "informational";
  return "informational";
}

function materialityPoints(materiality: InsightMateriality | null): { points: number; label: string } {
  if (!materiality) return { points: 0, label: "materiality absent(+0)" };
  const { percent_delta, absolute_delta_requests, absolute_delta_pageviews } = materiality;
  let points = 0;
  const parts: string[] = [];
  if (percent_delta != null && Math.abs(percent_delta) >= MATERIALITY_PERCENT_DELTA_MIN) {
    const p = Math.min(15, Math.round(Math.abs(percent_delta) * 40));
    points += p;
    parts.push(`|%Δ|=${(Math.abs(percent_delta) * 100).toFixed(1)}%(+${p})`);
  }
  if (absolute_delta_requests != null && Math.abs(absolute_delta_requests) >= MATERIALITY_ABS_REQUESTS_MIN) {
    const p = Math.min(12, Math.round(Math.abs(absolute_delta_requests) / 500));
    points += p;
    parts.push(`|Δreq|=${Math.abs(absolute_delta_requests)}(+${p})`);
  }
  if (absolute_delta_pageviews != null && Math.abs(absolute_delta_pageviews) >= MATERIALITY_ABS_PAGEVIEWS_MIN) {
    const p = Math.min(10, Math.round(Math.abs(absolute_delta_pageviews) / 500));
    points += p;
    parts.push(`|Δpv|=${Math.abs(absolute_delta_pageviews)}(+${p})`);
  }
  if (!parts.length) {
    // Materiality object present but below thresholds — no invented boost.
    return { points: 0, label: "materiality below threshold(+0)" };
  }
  return { points, label: `materiality ${parts.join(",")}` };
}

function inferCategory(finding: InsightFinding | null): string | null {
  if (!finding) return null;
  if (finding.kind === "data_gap") return "measurement";
  if (finding.kind === "issue" || finding.kind === "change") return "traffic";
  return null;
}

function collectFindings(ctx: ScoringContext): InsightFinding[] {
  const out: InsightFinding[] = [];
  if (ctx.finding) out.push(ctx.finding);
  if (ctx.findings?.length) {
    for (const f of ctx.findings) {
      if (!out.some((x) => x.finding_id === f.finding_id)) out.push(f);
    }
  }
  return out;
}
