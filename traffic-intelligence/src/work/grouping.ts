import type { InsightAction, InsightFinding, OperationalBrief } from "../insights/types";

/**
 * Root-cause grouping (TI-010): related per-property findings collapse to one
 * primary work item without deleting action_id identity.
 *
 * Key = source + normalized pattern (NOT property). Example:
 *   cloudflare.daily-coverage-gap
 */

export interface GroupingInput {
  action: InsightAction;
  brief?: OperationalBrief | null;
  finding?: InsightFinding | null;
  findings?: InsightFinding[];
}

export function rootCauseKey(input: GroupingInput): string {
  const findings = collectFindings(input);
  const primary = input.finding ?? findings[0] ?? null;
  const source = (primary?.source_id ?? "unknown").toLowerCase();
  const title = (primary?.title ?? input.brief?.headline ?? input.action.recommended_action ?? "").toLowerCase();
  const findingId = (primary?.finding_id ?? input.action.finding_id ?? "").toLowerCase();
  const kind = primary?.kind ?? "unknown";

  // Cloudflare daily series missing dates — the live #285–#293 flood pattern.
  if (
    /daily[-_ ]?coverage[-_ ]?gap/.test(findingId) ||
    /daily series has missing dates/.test(title) ||
    (/missing dates/.test(title) && kind === "data_gap" && /cloudflare/.test(source))
  ) {
    return `${source || "cloudflare"}.daily-coverage-gap`;
  }

  // Estate / source measurement gap (distinct from per-property daily coverage).
  if (
    input.action.property_id == null &&
    (input.action.scope === "source" || /source measurement gap|source evidence unavailable/.test(title))
  ) {
    return `${source || "cloudflare"}.source-measurement-gap`;
  }

  // Generic data_gap by normalized title token (strip property hostname).
  if (kind === "data_gap") {
    const pattern = normalizePattern(title, input.action.property_id);
    return `${source}.${kind}.${pattern}`;
  }

  // Default: no cross-property consolidation — unique per action.
  return `action:${input.action.action_id}`;
}

/** True when this key represents a multi-property consolidatable root cause. */
export function isConsolidatableRootCause(key: string): boolean {
  if (key.startsWith("action:")) return false;
  if (key.endsWith(".daily-coverage-gap")) return true;
  if (key.includes(".data_gap.")) return true;
  return false;
}

export function normalizePattern(title: string, propertyId: string | null | undefined): string {
  let t = title.toLowerCase().trim();
  if (propertyId) {
    const escaped = propertyId.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(escaped, "g"), "");
  }
  t = t
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/g, "") // strip other hostnames
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  return t.slice(0, 80) || "untitled";
}

export interface ActionGroup {
  root_cause_key: string;
  consolidatable: boolean;
  members: GroupingInput[];
}

export function groupActions(inputs: GroupingInput[]): ActionGroup[] {
  const map = new Map<string, GroupingInput[]>();
  for (const input of inputs) {
    const key = rootCauseKey(input);
    const list = map.get(key) ?? [];
    list.push(input);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([root_cause_key, members]) => ({
      root_cause_key,
      consolidatable: isConsolidatableRootCause(root_cause_key) && members.length >= 2,
      members: members.sort((a, b) => a.action.action_id.localeCompare(b.action.action_id)),
    }))
    .sort((a, b) => a.root_cause_key.localeCompare(b.root_cause_key));
}

/** Pick primary member: highest severity then stable action_id. Prefer estate/source scope. */
export function pickPrimaryMember(members: GroupingInput[]): GroupingInput {
  const severityRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
    info: 4,
  };
  return [...members].sort((a, b) => {
    const scopeBias = (x: GroupingInput) => (x.action.property_id == null ? 0 : 1);
    return (
      scopeBias(a) - scopeBias(b) ||
      (severityRank[a.action.severity] ?? 99) - (severityRank[b.action.severity] ?? 99) ||
      a.action.action_id.localeCompare(b.action.action_id)
    );
  })[0]!;
}

function collectFindings(input: GroupingInput): InsightFinding[] {
  const out: InsightFinding[] = [];
  if (input.finding) out.push(input.finding);
  if (input.findings?.length) {
    for (const f of input.findings) {
      if (!out.some((x) => x.finding_id === f.finding_id)) out.push(f);
    }
  }
  return out;
}
