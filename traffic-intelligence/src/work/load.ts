import { getAdminToken } from "../auth";
import { assertWorkQueue } from "./assert";
import type { WorkQueueDocument } from "./types";

export const WORK_QUEUE_URL = `${import.meta.env.BASE_URL}gold/ti-work-queue-1.0.json`;

/**
 * Load work-queue sidecar. Fail soft: returns null on missing/invalid so the cockpit
 * can still show recommendations without issue links.
 */
export async function loadWorkQueue(url: string = WORK_QUEUE_URL): Promise<WorkQueueDocument | null> {
  try {
    const token = getAdminToken();
    const response = await fetch(url, {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!response.ok) {
      console.warn(`Work queue HTTP ${response.status} from ${url} — continuing without issue links`);
      return null;
    }
    const data: unknown = await response.json();
    assertWorkQueue(data);
    return data;
  } catch (err) {
    console.warn("Work queue unavailable — continuing without issue links", err);
    return null;
  }
}
