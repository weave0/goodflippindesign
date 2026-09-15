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
import { isConsolidatableRootCause, rootCauseKey } from "./grouping";

export interface EligibilityContext {
  action: InsightAction;
  brief?: OperationalBrief | null;
  finding?: InsightFinding | null;
  /** Optional extra findings linked via finding_ids. */
  findings?: InsightFinding[];
  /**
   * When true, this action is the primary of a consolidatable root-cause group.
   * Low-confidence measurement_blocked may auto as a **single** consolidated item.
   */
  consolidatedPrimary?: boolean;
  /** Member count in the root-cause group (including primary). */
  groupSize?: number;
}

/**
 * Decide whether an action should auto-create a GitHub work item or stay a recommendation.
 *
 * TI-010 rules (tightened vs TI-009):
 * 1. auto if priority_class ∈ {act_now, investigate} AND (brief.confidence === 'high' OR priority_class === 'act_now')
 * 2. measurement_blocked / data_gap:
 *    - confidence high → auto (still prefer consolidation when groupSize ≥ 2)
 *    - confidence low/medium → recommend **unless** consolidatedPrimary && groupSize ≥ 2
 *      (one consolidated auto issue for the flood, not per-property spam)
 * 3. healthy / watch opportunity|success:
 *    - prefer **recommend** as "review opportunity" (not repair), even when material
 *    - auto only when explicitly flagged via brief limitation `ti-auto-opportunity=true`
 *      AND confidence high AND meaningful materiality
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

  const hasDataGap = findings.some((f) => f.kind === "data_gap") || pc === "measurement_blocked";
  if (hasDataGap) {
    if (confidence === "high") return "auto";
    // Low/medium confidence measurement flood: only auto as consolidated primary.
    if (
      ctx.consolidatedPrimary &&
      (ctx.groupSize ?? 0) >= 2 &&
      isConsolidatableRootCause(
        rootCauseKey({
          action,
          brief,
          finding: findings[0] ?? null,
          findings,
        }),
      )
    ) {
      return "auto";
    }
    return "recommend";
  }

  const hasOpportunitySignal = findings.some(
    (f) => f.kind === "opportunity" || f.kind === "success",
  );
  if ((pc === "healthy" || pc === "watch") && hasOpportunitySignal) {
    const flagged = (brief?.limitations ?? []).some((l) => /ti-auto-opportunity\s*=\s*true/i.test(l));
    if (
      flagged &&
      confidence === "high" &&
      hasMeaningfulMateriality(brief?.materiality ?? null)
    ) {
      return "auto";
    }
    return "recommend";
  }

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
  void findings;
  return null;
}
