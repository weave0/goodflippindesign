import type {
  InsightAction,
  InsightFinding,
  OperationalBrief,
  TrafficInsightDocument,
} from "../insights/types";
import { eligibilityFor } from "./eligibility";
import { rootCauseKey } from "./grouping";
import { scoreImpact } from "./scoring";
import {
  snapshotFromInsights,
  upsertEvidenceSection,
  type EvidenceSnapshot,
} from "./evidence";
import {
  DEFAULT_TARGET_REPO,
  type GroupRole,
  type ImpactClass,
  type WorkEligibility,
  type WorkLifecycle,
  type WorkMachineBlock,
  WORK_LIFECYCLES,
} from "./types";

const MACHINE_START = "<!-- ti-work-machine";
const MACHINE_END = "-->";

export interface IssueComposeInput {
  action: InsightAction;
  brief?: OperationalBrief | null;
  findings?: InsightFinding[];
  insights?: Pick<TrafficInsightDocument, "generated_at"> | null;
  lifecycle?: WorkLifecycle;
  eligibility?: WorkEligibility;
  target_repo?: string;
  snooze_until?: string | null;
  root_cause_key?: string | null;
  group_role?: GroupRole;
  group_issue_number?: number | null;
  group_members?: Array<{
    action_id: string;
    property_id: string | null;
    confidence: string | null;
  }>;
  impact_score?: number | null;
  impact_class?: ImpactClass | null;
  impact_rationale?: string | null;
  /** Prior body — preserves first-detection evidence before snapshot. */
  prior_body?: string | null;
  consolidatedPrimary?: boolean;
  groupSize?: number;
}

export interface ComposedIssue {
  title: string;
  body: string;
  machine: WorkMachineBlock;
  labels: string[];
}

export function composeIssue(input: IssueComposeInput): ComposedIssue {
  const action = input.action;
  const brief = input.brief ?? null;
  const findings = input.findings ?? [];
  const primaryFinding =
    findings.find((f) => f.finding_id === action.finding_id) ?? findings[0] ?? null;
  const eligibility =
    input.eligibility ??
    eligibilityFor({
      action,
      brief,
      finding: primaryFinding,
      findings,
      consolidatedPrimary: input.consolidatedPrimary,
      groupSize: input.groupSize,
    });
  const lifecycle: WorkLifecycle = input.lifecycle ?? "detected";
  const target_repo = input.target_repo ?? DEFAULT_TARGET_REPO;
  const confidence = brief?.confidence ?? null;
  const findingIds =
    action.finding_ids?.length > 0 ? action.finding_ids : [action.finding_id];

  const scored =
    input.impact_score != null && input.impact_class
      ? {
          impact_score: input.impact_score,
          impact_class: input.impact_class,
          rationale: input.impact_rationale ?? "",
        }
      : scoreImpact({ action, brief, finding: primaryFinding, findings });

  const rcKey =
    input.root_cause_key ??
    rootCauseKey({ action, brief, finding: primaryFinding, findings });
  const group_role: GroupRole = input.group_role ?? "standalone";

  const machine: WorkMachineBlock = {
    action_id: action.action_id,
    lifecycle,
    property_id: action.property_id,
    target_repo,
    insights_generated_at: input.insights?.generated_at ?? null,
    verification_condition: action.verification_condition,
    snooze_until: input.snooze_until ?? null,
    eligibility,
    brief_id: action.brief_id ?? brief?.brief_id ?? null,
    finding_ids: findingIds,
    priority_class: action.priority_class,
    confidence,
    root_cause_key: rcKey,
    group_role,
    group_issue_number: input.group_issue_number ?? null,
    impact_score: scored.impact_score,
    impact_class: scored.impact_class,
  };

  const property = action.property_id ?? "estate";
  const titleSeed =
    group_role === "primary" && input.group_members && input.group_members.length > 1
      ? `${primaryFinding?.title ?? brief?.headline ?? action.recommended_action} (${input.group_members.length} properties)`
      : brief?.headline ?? primaryFinding?.title ?? action.recommended_action;
  const title = truncate(
    group_role === "primary"
      ? `[TI] ${priorityShort(action.priority_class)} · group:${rcKey} — ${titleSeed}`
      : `[TI] ${priorityShort(action.priority_class)} · ${property} — ${titleSeed}`,
    240,
  );

  const materiality = brief?.materiality;
  const expectedBenefit = formatExpectedBenefit(materiality, brief?.summary ?? primaryFinding?.why_it_matters);

  const memberSection =
    group_role === "primary" && input.group_members?.length
      ? [
          `### Consolidated members`,
          ``,
          `| Property | action_id | confidence |`,
          `| --- | --- | --- |`,
          ...input.group_members.map(
            (m) =>
              `| \`${m.property_id ?? "estate"}\` | \`${m.action_id}\` | ${m.confidence ?? "—"} |`,
          ),
          ``,
          `_Child action_ids retain identity in the work-queue with \`group_role: member\` pointing at this issue._`,
          ``,
        ].join("\n")
      : null;

  const bodyParts = [
    `## Traffic Intelligence work item`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Severity | ${action.severity} |`,
    `| Confidence | ${confidence ?? "—"} |`,
    `| Priority | ${action.priority_class} |`,
    `| Impact | ${scored.impact_class} (${scored.impact_score}) |`,
    `| Eligibility | ${eligibility} |`,
    `| Lifecycle | ${lifecycle} |`,
    `| Property | \`${property}\` |`,
    `| Root cause | \`${rcKey}\` |`,
    `| Group role | ${group_role} |`,
    `| Target repo | \`${target_repo}\` |`,
    `| Action ID | \`${action.action_id}\` |`,
    `| Brief ID | \`${machine.brief_id ?? "—"}\` |`,
    `| Finding IDs | ${findingIds.map((id) => `\`${id}\``).join(", ") || "—"} |`,
    `| Insights generated | ${machine.insights_generated_at ?? "—"} |`,
    ``,
    `### Impact rationale`,
    scored.rationale || "_n/a_",
    ``,
    `### Recommended action`,
    action.recommended_action,
    ``,
    `### Expected benefit`,
    expectedBenefit,
    ``,
    `### Verification condition`,
    action.verification_condition,
    ``,
    memberSection,
    brief
      ? [
          `### Brief`,
          `**${brief.headline}**`,
          ``,
          brief.summary,
          ``,
          `Category: ${brief.category} · Direction: ${brief.direction ?? "unknown"}`,
        ].join("\n")
      : null,
    primaryFinding
      ? [
          ``,
          `### Primary finding`,
          `**${primaryFinding.title}** (${primaryFinding.kind})`,
          ``,
          primaryFinding.explanation,
        ].join("\n")
      : null,
    ``,
    `### Operator controls`,
    `- Assign in GitHub to claim ownership.`,
    `- Add label \`ti-lifecycle:dismissed\` to dismiss (sync will not reopen).`,
    `- Set \`snooze_until: YYYY-MM-DD\` in the machine block (or comment \`ti-snooze-until:YYYY-MM-DD\`) to pause sync.`,
    `- Set lifecycle \`ti-lifecycle:verify\` after a fix; sync measures clearance with **fresh** insights → resolved.`,
    `- GitHub labels are source of truth for operator-set states; cockpit queue refreshes on sync.`,
    ``,
    renderMachineBlock(machine),
  ].filter((p) => p !== null && p !== undefined);

  let body = bodyParts.join("\n");

  const snap: EvidenceSnapshot = snapshotFromInsights({
    action,
    brief,
    findings,
    insightsGeneratedAt: machine.insights_generated_at,
  });
  body = upsertEvidenceSection(input.prior_body ? mergePrior(input.prior_body, body) : body, snap);

  // Re-attach machine block at end after evidence upsert may shuffle.
  body = upsertMachineBlock(stripTrailingMachine(body), machine);

  const labels = [
    "ti-work",
    `ti-lifecycle:${lifecycle}`,
    `ti-eligibility:${eligibility}`,
    `ti-priority:${action.priority_class}`,
    `ti-impact:${scored.impact_class}`,
  ];
  if (group_role === "primary") labels.push("ti-group:primary");

  return { title, body, machine, labels };
}

function mergePrior(prior: string, composed: string): string {
  // Prefer composed structure but keep prior evidence before fence via upsertEvidenceSection(prior).
  // Seed composed with prior's before-fence by injecting prior body evidence markers.
  const fence = /```ti-evidence-before\n([\s\S]*?)\n```/.exec(prior);
  if (!fence) return composed;
  if (composed.includes("```ti-evidence-before")) return composed;
  return `${composed}\n\n\`\`\`ti-evidence-before\n${fence[1]}\n\`\`\`\n`;
}

function stripTrailingMachine(body: string): string {
  const start = body.indexOf(MACHINE_START);
  if (start < 0) return body;
  return body.slice(0, start).trimEnd() + "\n\n";
}

export function renderMachineBlock(machine: WorkMachineBlock): string {
  const lines = [
    MACHINE_START,
    `action_id: ${yamlScalar(machine.action_id)}`,
    `lifecycle: ${yamlScalar(machine.lifecycle)}`,
    `property_id: ${yamlScalar(machine.property_id)}`,
    `target_repo: ${yamlScalar(machine.target_repo)}`,
    `insights_generated_at: ${yamlScalar(machine.insights_generated_at)}`,
    `verification_condition: ${yamlScalar(machine.verification_condition)}`,
    `snooze_until: ${yamlScalar(machine.snooze_until)}`,
    `eligibility: ${yamlScalar(machine.eligibility)}`,
    `brief_id: ${yamlScalar(machine.brief_id)}`,
    `finding_ids: ${JSON.stringify(machine.finding_ids)}`,
    `priority_class: ${yamlScalar(machine.priority_class)}`,
    `confidence: ${yamlScalar(machine.confidence)}`,
    `root_cause_key: ${yamlScalar(machine.root_cause_key)}`,
    `group_role: ${yamlScalar(machine.group_role)}`,
    `group_issue_number: ${machine.group_issue_number == null ? "null" : String(machine.group_issue_number)}`,
    `impact_score: ${machine.impact_score == null ? "null" : String(machine.impact_score)}`,
    `impact_class: ${yamlScalar(machine.impact_class)}`,
    MACHINE_END,
  ];
  return lines.join("\n");
}

export function parseMachineBlock(body: string): WorkMachineBlock | null {
  const start = body.indexOf(MACHINE_START);
  if (start < 0) return null;
  const end = body.indexOf(MACHINE_END, start + MACHINE_START.length);
  if (end < 0) return null;
  const raw = body.slice(start + MACHINE_START.length, end).trim();
  const map = new Map<string, string>();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = trimmed.indexOf(":");
    if (colon < 0) continue;
    const key = trimmed.slice(0, colon).trim();
    const value = trimmed.slice(colon + 1).trim();
    map.set(key, value);
  }

  const action_id = unquote(map.get("action_id") ?? "");
  if (!action_id) return null;

  const lifecycleRaw = unquote(map.get("lifecycle") ?? "detected");
  const lifecycle = (WORK_LIFECYCLES as readonly string[]).includes(lifecycleRaw)
    ? (lifecycleRaw as WorkLifecycle)
    : "detected";

  let finding_ids: string[] = [];
  const findingRaw = map.get("finding_ids") ?? "[]";
  try {
    const parsed = JSON.parse(findingRaw) as unknown;
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
      finding_ids = parsed;
    }
  } catch {
    finding_ids = [];
  }

  const eligibilityRaw = unquote(map.get("eligibility") ?? "recommend");
  const eligibility: WorkEligibility = eligibilityRaw === "auto" ? "auto" : "recommend";

  const groupRoleRaw = unquote(map.get("group_role") ?? "standalone");
  const group_role: GroupRole =
    groupRoleRaw === "primary" || groupRoleRaw === "member" ? groupRoleRaw : "standalone";

  const impactRaw = unquote(map.get("impact_class") ?? "");
  const impact_class =
    impactRaw === "critical" ||
    impactRaw === "high" ||
    impactRaw === "medium" ||
    impactRaw === "low" ||
    impactRaw === "informational"
      ? impactRaw
      : null;

  const scoreRaw = unquote(map.get("impact_score") ?? "");
  const impact_score = scoreRaw && scoreRaw !== "null" ? Number(scoreRaw) : null;

  const ginRaw = unquote(map.get("group_issue_number") ?? "");
  const group_issue_number = ginRaw && ginRaw !== "null" ? Number(ginRaw) : null;

  return {
    action_id,
    lifecycle,
    property_id: nullIfEmpty(unquote(map.get("property_id") ?? "")),
    target_repo: unquote(map.get("target_repo") ?? "") || DEFAULT_TARGET_REPO,
    insights_generated_at: nullIfEmpty(unquote(map.get("insights_generated_at") ?? "")),
    verification_condition: unquote(map.get("verification_condition") ?? ""),
    snooze_until: nullIfEmpty(unquote(map.get("snooze_until") ?? "")),
    eligibility,
    brief_id: nullIfEmpty(unquote(map.get("brief_id") ?? "")),
    finding_ids,
    priority_class: nullIfEmpty(unquote(map.get("priority_class") ?? "")),
    confidence: nullIfEmpty(unquote(map.get("confidence") ?? "")),
    root_cause_key: nullIfEmpty(unquote(map.get("root_cause_key") ?? "")),
    group_role,
    group_issue_number: Number.isFinite(group_issue_number) ? group_issue_number : null,
    impact_score: Number.isFinite(impact_score) ? impact_score : null,
    impact_class,
  };
}

/** Replace machine block in an existing body, preserving operator prose above it when possible. */
export function upsertMachineBlock(body: string, machine: WorkMachineBlock): string {
  const block = renderMachineBlock(machine);
  const start = body.indexOf(MACHINE_START);
  if (start < 0) return `${body.trimEnd()}\n\n${block}\n`;
  const end = body.indexOf(MACHINE_END, start + MACHINE_START.length);
  if (end < 0) return `${body.trimEnd()}\n\n${block}\n`;
  return body.slice(0, start) + block + body.slice(end + MACHINE_END.length);
}

export function extractSnoozeFromLabelsOrBody(labels: string[], body: string): string | null {
  for (const label of labels) {
    const m = /^ti-snooze-until:(\d{4}-\d{2}-\d{2})$/.exec(label);
    if (m?.[1]) return m[1];
  }
  const comment = /ti-snooze-until:(\d{4}-\d{2}-\d{2})/.exec(body);
  if (comment?.[1]) return comment[1];
  const machine = parseMachineBlock(body);
  return machine?.snooze_until ?? null;
}

export function lifecycleFromLabels(labels: string[], fallback: WorkLifecycle = "detected"): WorkLifecycle {
  for (const lc of WORK_LIFECYCLES) {
    if (labels.includes(`ti-lifecycle:${lc}`)) return lc;
  }
  return fallback;
}

function formatExpectedBenefit(
  materiality: OperationalBrief["materiality"] | undefined,
  fallback: string | undefined,
): string {
  if (!materiality) return fallback?.trim() || "_Not quantified in sidecar._";
  const bits: string[] = [];
  if (materiality.percent_delta != null) {
    bits.push(`percent_delta=${(materiality.percent_delta * 100).toFixed(1)}%`);
  }
  if (materiality.absolute_delta_requests != null) {
    bits.push(`Δ requests=${materiality.absolute_delta_requests}`);
  }
  if (materiality.absolute_delta_pageviews != null) {
    bits.push(`Δ pageviews=${materiality.absolute_delta_pageviews}`);
  }
  if (!bits.length) return fallback?.trim() || "_Materiality present but deltas null._";
  return `${bits.join(" · ")}${fallback ? `\n\n${fallback}` : ""}`;
}

function priorityShort(pc: string): string {
  return pc.replace(/_/g, " ");
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function yamlScalar(value: string | null | undefined): string {
  if (value == null || value === "") return "null";
  if (/[:#\n\r]/.test(value) || value.includes('"')) {
    return JSON.stringify(value);
  }
  return value;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v === "null" || v === "~") return "";
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    try {
      return JSON.parse(v.startsWith("'") ? `"${v.slice(1, -1)}"` : v) as string;
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

function nullIfEmpty(value: string): string | null {
  return value ? value : null;
}
