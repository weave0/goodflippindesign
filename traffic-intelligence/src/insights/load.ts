import { getAdminToken } from "../auth";
import { assertTrafficInsights } from "./assert";
import type { TrafficInsightDocument } from "./types";

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
  return data;
}
