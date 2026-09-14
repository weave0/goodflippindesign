import { getAdminToken } from "../auth";
import { assertTrafficInsights } from "./assert";
import type { TrafficInsightDocument } from "./types";

/** Stable public path (admin-walled). Contents are schema 1.1 when producer TI-007 ships. */
export const INSIGHTS_URL = `${import.meta.env.BASE_URL}gold/traffic-insights-1.0.json`;

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
    briefs: Array.isArray(doc.briefs) ? doc.briefs : [],
    estate_brief: doc.estate_brief ?? null,
    property_health: Array.isArray(doc.property_health) ? doc.property_health : [],
    actions: (doc.actions ?? []).map((action) => normalizeAction(action)),
  };
}

function normalizeAction(action: TrafficInsightDocument["actions"][number]): TrafficInsightDocument["actions"][number] {
  const raw = action as TrafficInsightDocument["actions"][number] & {
    finding_ids?: string[];
    brief_id?: string | null;
    priority?: unknown;
  };
  const priority = coercePriority(raw.priority);
  return {
    ...raw,
    finding_ids: Array.isArray(raw.finding_ids) && raw.finding_ids.length ? raw.finding_ids : [raw.finding_id],
    brief_id: raw.brief_id ?? null,
    priority,
  };
}

function coercePriority(value: unknown): TrafficInsightDocument["actions"][number]["priority"] {
  const allowed = new Set(["act_now", "investigate", "watch", "healthy", "measurement_blocked"]);
  if (typeof value === "string" && allowed.has(value)) {
    return value as TrafficInsightDocument["actions"][number]["priority"];
  }
  // Legacy 1.0 numeric priorities: lower number = higher urgency.
  if (typeof value === "number") {
    if (value <= 1) return "act_now";
    if (value === 2) return "investigate";
    if (value === 3) return "watch";
    return "healthy";
  }
  return "watch";
}
