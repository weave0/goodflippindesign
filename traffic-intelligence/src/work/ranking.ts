import type { WorkLifecycle, WorkQueueItem } from "./types";

const NON_ACTIONABLE: ReadonlySet<WorkLifecycle> = new Set([
  "dismissed",
  "resolved",
]);

export interface RankedWorkRow {
  item: WorkQueueItem;
  /** Member items collapsed under a primary (same issue / group). */
  members: WorkQueueItem[];
}

/**
 * Ranked "What should we work on next?" — impact_score desc, actionable lifecycles only.
 * Consolidate members under the primary row (or first standalone with that issue).
 */
export function rankNextWork(items: Record<string, WorkQueueItem> | WorkQueueItem[]): RankedWorkRow[] {
  const list = Array.isArray(items) ? items : Object.values(items);
  const actionable = list.filter((item) => isActionableLifecycle(item.lifecycle, item.snooze_until));

  const byIssue = new Map<number, WorkQueueItem[]>();
  const noIssue: WorkQueueItem[] = [];
  for (const item of actionable) {
    if (item.issue_number == null) {
      noIssue.push(item);
      continue;
    }
    const bucket = byIssue.get(item.issue_number) ?? [];
    bucket.push(item);
    byIssue.set(item.issue_number, bucket);
  }

  const rows: RankedWorkRow[] = [];

  for (const group of byIssue.values()) {
    const primary =
      group.find((i) => i.group_role === "primary") ??
      group.slice().sort((a, b) => b.impact_score - a.impact_score || a.action_id.localeCompare(b.action_id))[0]!;
    const members = group
      .filter((i) => i.action_id !== primary.action_id)
      .sort((a, b) => b.impact_score - a.impact_score || a.action_id.localeCompare(b.action_id));
    rows.push({ item: primary, members });
  }

  const noIssueById = new Map(noIssue.map((item) => [item.action_id, item]));
  for (const item of noIssue) {
    if (item.group_role === "member") continue; // wait for primary create
    // Unpromoted groups have no shared issue number; members come from the primary's roster.
    const members = (item.group_member_action_ids ?? [])
      .map((id) => noIssueById.get(id))
      .filter((member): member is WorkQueueItem => member != null && member.action_id !== item.action_id)
      .sort((a, b) => b.impact_score - a.impact_score || a.action_id.localeCompare(b.action_id));
    rows.push({ item, members });
  }

  return rows.sort(
    (a, b) =>
      b.item.impact_score - a.item.impact_score ||
      a.item.action_id.localeCompare(b.item.action_id),
  );
}

export function isActionableLifecycle(
  lifecycle: WorkLifecycle,
  snoozeUntil: string | null,
  now: Date = new Date(),
): boolean {
  if (NON_ACTIONABLE.has(lifecycle)) return false;
  if (snoozeUntil) {
    const today = now.toISOString().slice(0, 10);
    if (today <= snoozeUntil) return false;
  }
  return true;
}
