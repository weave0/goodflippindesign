import { getAdminToken } from "../auth";
import { assertTrafficInsights } from "./assert";
import type { InsightPriority, TrafficInsightDocument } from "./types";

/** Stable public path (admin-walled). Contents are schema 1.1 when producer TI-007 ships. */
export const INSIGHTS_URL = `${import.meta.env.BASE_URL}gold/traffic-insights-1.0.json`;

const PRIORITY_CLASSES = new Set<InsightPriority>([
  "act_now",
  "investigate",
  "watch",
  "healthy",
  "measurement_blocked",
]);

/** Producer PRIORITY_CLASS_TO_INT (measurement_blocked shares 2 with investigate). */
const CLASS_TO_INT: Record<InsightPriority, number> = {
  act_now: 1,
  investigate: 2,
  measurement_blocked: 2,
  watch: 3,
  healthy: 4,
};

export async function loadInsights(url: string = INSIGHTS_URL): Promise<TrafficInsightDocument> {
  const token = getAdminToken();
  const response = await fetch(url, {
    cache: "no-store",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!response.ok) {
    throw new Error(`Traffic insights HTTP ${response.status} from ${url}`);
  }
  const data: unknown = await response.json();
  assertTrafficInsights(data);
  return normalizeInsights(data);
}

/** Fill 1.1 defaults when reading a legacy 1.0 sidecar so the cockpit can fail closed gracefully. */
function normalizeInsights(doc: TrafficInsightDocument): TrafficInsightDocument {
  return {
    ...doc,
    briefs: Array.isArray(doc.briefs)
      ? doc.briefs.map((brief) => ({
          ...brief,
          direction: brief.direction ?? "unknown",
        }))
      : [],
    estate_brief: doc.estate_brief ?? null,
    estate_config: doc.estate_config ?? null,
    property_health: Array.isArray(doc.property_health) ? doc.property_health : [],
    trend_comparisons: Array.isArray(doc.trend_comparisons) ? doc.trend_comparisons : [],
    actions: (doc.actions ?? []).map((action) => normalizeAction(action)),
  };
}

function normalizeAction(
  action: TrafficInsightDocument["actions"][number] | Record<string, unknown>,
): TrafficInsightDocument["actions"][number] {
  const raw = action as TrafficInsightDocument["actions"][number] & {
    finding_ids?: string[];
    brief_id?: string | null;
    priority?: unknown;
    priority_class?: unknown;
  };
  const priority_class = resolvePriorityClass(raw.priority_class, raw.priority);
  const priority =
    typeof raw.priority === "number" && Number.isInteger(raw.priority) && raw.priority >= 1 && raw.priority <= 5
      ? raw.priority
      : CLASS_TO_INT[priority_class];
  return {
    ...(raw as TrafficInsightDocument["actions"][number]),
    finding_ids: Array.isArray(raw.finding_ids) && raw.finding_ids.length ? raw.finding_ids : [raw.finding_id],
    brief_id: raw.brief_id ?? null,
    priority,
    priority_class,
  };
}

/**
 * Prefer priority_class. Only coerce documented legacy numeric priorities (1–5).
 * Reject unknown categorical values — never silently downgrade act_now to watch.
 */
function resolvePriorityClass(priorityClass: unknown, legacyPriority: unknown): InsightPriority {
  if (typeof priorityClass === "string") {
    if (!PRIORITY_CLASSES.has(priorityClass as InsightPriority)) {
      throw new Error(`Unknown action priority_class: ${priorityClass}`);
    }
    return priorityClass as InsightPriority;
  }
  if (typeof legacyPriority === "string") {
    if (!PRIORITY_CLASSES.has(legacyPriority as InsightPriority)) {
      throw new Error(`Unknown action priority: ${legacyPriority}`);
    }
    return legacyPriority as InsightPriority;
  }
  if (typeof legacyPriority === "number") {
    return coerceLegacyNumericPriority(legacyPriority);
  }
  throw new Error("Action requires priority_class or a documented legacy priority");
}

function coerceLegacyNumericPriority(value: number): InsightPriority {
  // Documented 1.0 numeric map only — unknown integers fail closed.
  if (value === 1) return "act_now";
  if (value === 2) return "investigate";
  if (value === 3) return "watch";
  if (value === 4 || value === 5) return "healthy";
  throw new Error(`Unknown legacy numeric priority: ${value}`);
}
