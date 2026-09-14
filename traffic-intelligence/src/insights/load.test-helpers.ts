import type { TrafficInsightDocument } from "./types";

/**
 * Test-only mirror of load.ts normalizeInsights so fixture JSON (with string legacy
 * priorities already upgraded in-repo) is shaped like production load output.
 */
export function normalizeInsightsForTest(doc: TrafficInsightDocument): TrafficInsightDocument {
  const CLASS_TO_INT: Record<string, number> = {
    act_now: 1,
    investigate: 2,
    measurement_blocked: 2,
    watch: 3,
    healthy: 4,
  };
  return {
    ...doc,
    briefs: (doc.briefs ?? []).map((brief) => ({ ...brief, direction: brief.direction ?? "unknown" })),
    estate_brief: doc.estate_brief ?? null,
    property_health: doc.property_health ?? [],
    trend_comparisons: doc.trend_comparisons ?? [],
    actions: (doc.actions ?? []).map((action) => {
      const priority_class = action.priority_class;
      const priority =
        typeof action.priority === "number" ? action.priority : CLASS_TO_INT[priority_class] ?? 3;
      return {
        ...action,
        finding_ids: action.finding_ids?.length ? action.finding_ids : [action.finding_id],
        brief_id: action.brief_id ?? null,
        priority,
        priority_class,
      };
    }),
  };
}
