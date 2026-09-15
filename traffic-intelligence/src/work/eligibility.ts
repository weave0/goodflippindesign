import type {
  InsightAction,
  InsightFinding,
  InsightMateriality,
  OperationalBrief,
} from "../insights/types";
import {
  MATERIALITY_ABS_PAGEVIEWS_MIN,
  MATERIALITY_ABS_REQUESTS_MIN,
  MATERIALITY_PERCENT_DELTA_MIN,
  type WorkEligibility,
} from "./types";

export interface EligibilityContext {
  action: InsightAction;
  brief?: OperationalBrief | null;
  finding?: InsightFinding | null;
  /** Optional extra findings linked via finding_ids. */
  findings?: InsightFinding[];
}

/**
 * Decide whether an action should auto-create a GitHub work item or stay a recommendation.
 *
 * Rules (v1):
 * 1. auto if priority_class ∈ {act_now, investigate} AND (brief.confidence === 'high' OR priority_class === 'act_now')
 * 2. OR linked finding kind ∈ {data_gap} AND (confidence high OR priority_class === measurement_blocked)
 * 3. OR opportunity/success path: priority_class ∈ {healthy, watch} AND kind ∈ {opportunity, success}
 *    AND confidence high AND materiality present with meaningful magnitude
 *    (|percent_delta| ≥ 0.1 OR |abs requests| ≥ 1000 OR |abs pageviews| ≥ 1000)
 * 4. else recommend
 * 5. Never auto-create pure healthy with no opportunity/success signal
 */
export function eligibilityFor(ctx: EligibilityContext): WorkEligibility {
  const { action, brief } = ctx;
  const findings = collectFindings(ctx);
  const confidence = resolveConfidence(brief, findings);
  const pc = action.priority_class;

  if (pc === "act_now" || pc === "investigate") {
    if (pc === "act_now" || confidence === "high") return "auto";
  }

  const hasDataGap = findings.some((f) => f.kind === "data_gap");
  if (hasDataGap && (confidence === "high" || pc === "measurement_blocked")) {
    return "auto";
  }

  const hasOpportunitySignal = findings.some(
    (f) => f.kind === "opportunity" || f.kind === "success",
  );
  if (
    (pc === "healthy" || pc === "watch") &&
    hasOpportunitySignal &&
    confidence === "high" &&
    hasMeaningfulMateriality(brief?.materiality ?? null)
  ) {
    return "auto";
  }

  // Explicit: pure healthy without opportunity/success stays recommend (already covered).
  return "recommend";
}

export function hasMeaningfulMateriality(materiality: InsightMateriality | null | undefined): boolean {
  if (!materiality) return false;
  const { percent_delta, absolute_delta_requests, absolute_delta_pageviews } = materiality;
  if (percent_delta != null && Math.abs(percent_delta) >= MATERIALITY_PERCENT_DELTA_MIN) return true;
  if (absolute_delta_requests != null && Math.abs(absolute_delta_requests) >= MATERIALITY_ABS_REQUESTS_MIN) {
    return true;
  }
  if (
    absolute_delta_pageviews != null &&
    Math.abs(absolute_delta_pageviews) >= MATERIALITY_ABS_PAGEVIEWS_MIN
  ) {
    return true;
  }
  return false;
}

function collectFindings(ctx: EligibilityContext): InsightFinding[] {
  const out: InsightFinding[] = [];
  if (ctx.finding) out.push(ctx.finding);
  if (ctx.findings?.length) {
    for (const f of ctx.findings) {
      if (!out.some((x) => x.finding_id === f.finding_id)) out.push(f);
    }
  }
  return out;
}

function resolveConfidence(
  brief: OperationalBrief | null | undefined,
  findings: InsightFinding[],
): string | null {
  if (brief?.confidence) return brief.confidence;
  // Findings do not carry confidence in the contract; treat missing as null (not high).
  void findings;
  return null;
}
