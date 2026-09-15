import { PRIORITY_RANK } from "../insights/select";
import type {
  InsightAction,
  InsightFinding,
  InsightPriority,
  OperationalBrief,
  TrafficInsightDocument,
} from "../insights/types";
import { eligibilityFor } from "./eligibility";
import {
  composeIssue,
  extractSnoozeFromLabelsOrBody,
  lifecycleFromLabels,
  parseMachineBlock,
  upsertMachineBlock,
  type ComposedIssue,
} from "./issue-body";
import {
  AUTO_CREATE_CAP_PER_RUN,
  DEFAULT_TARGET_REPO,
  type WorkEligibility,
  type WorkLifecycle,
  type WorkMachineBlock,
  type WorkQueueDocument,
  type WorkQueueItem,
  WORK_QUEUE_CONTRACT,
  WORK_QUEUE_SCHEMA_VERSION,
} from "./types";

export interface ExistingIssue {
  number: number;
  html_url: string;
  title: string;
  body: string;
  state: "open" | "closed";
  labels: string[];
  updated_at: string;
}

export type SyncActionKind =
  | "create"
  | "update_body"
  | "comment_severity"
  | "comment_cleared"
  | "comment_still_failing"
  | "set_lifecycle"
  | "skip_dismissed"
  | "skip_snoozed"
  | "skip_cap"
  | "skip_recommend"
  | "noop";

export interface SyncPlanItem {
  kind: SyncActionKind;
  action_id: string;
  eligibility: WorkEligibility;
  issue_number?: number;
  composed?: ComposedIssue;
  comment?: string;
  next_lifecycle?: WorkLifecycle;
  reason?: string;
}

export interface SyncPlan {
  plans: SyncPlanItem[];
  queueItems: Record<string, WorkQueueItem>;
  createsSelected: number;
  createsSkippedByCap: number;
}

const OPERATOR_OWNED: ReadonlySet<WorkLifecycle> = new Set([
  "triaged",
  "accepted",
  "in_progress",
]);

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function indexIssuesByActionId(issues: ExistingIssue[]): Map<string, ExistingIssue> {
  const map = new Map<string, ExistingIssue>();
  for (const issue of issues) {
    const machine = parseMachineBlock(issue.body ?? "");
    if (!machine?.action_id) continue;
    const prev = map.get(machine.action_id);
    if (!prev || Date.parse(issue.updated_at) > Date.parse(prev.updated_at)) {
      map.set(machine.action_id, issue);
    }
  }
  return map;
}

export function buildLookup(insights: TrafficInsightDocument): {
  briefById: Map<string, OperationalBrief>;
  findingById: Map<string, InsightFinding>;
  briefByAction: Map<string, OperationalBrief | null>;
} {
  const briefById = new Map((insights.briefs ?? []).map((b) => [b.brief_id, b]));
  const findingById = new Map(insights.findings.map((f) => [f.finding_id, f]));
  const briefByAction = new Map<string, OperationalBrief | null>();
  for (const action of insights.actions) {
    const brief =
      (action.brief_id ? briefById.get(action.brief_id) : undefined) ??
      (insights.briefs ?? []).find((b) => b.finding_ids.some((id) => action.finding_ids.includes(id) || id === action.finding_id)) ??
      null;
    briefByAction.set(action.action_id, brief);
  }
  return { briefById, findingById, briefByAction };
}

export function rankActionsForCreate(actions: InsightAction[]): InsightAction[] {
  return [...actions].sort(
    (a, b) =>
      (PRIORITY_RANK[a.priority_class as InsightPriority] ?? 99) -
        (PRIORITY_RANK[b.priority_class as InsightPriority] ?? 99) ||
      (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99) ||
      a.action_id.localeCompare(b.action_id),
  );
}

function isSnoozed(snoozeUntil: string | null, now: Date): boolean {
  if (!snoozeUntil) return false;
  // Skip while today <= snooze_until (UTC date compare).
  const today = now.toISOString().slice(0, 10);
  return today <= snoozeUntil;
}

function materialFieldsChanged(prev: WorkMachineBlock, next: WorkMachineBlock): boolean {
  return (
    prev.verification_condition !== next.verification_condition ||
    prev.priority_class !== next.priority_class ||
    prev.confidence !== next.confidence ||
    prev.insights_generated_at !== next.insights_generated_at ||
    prev.eligibility !== next.eligibility
  );
}

function severityWorsened(prev: string | null, next: string): boolean {
  if (!prev) return false;
  return (SEVERITY_RANK[next] ?? 99) < (SEVERITY_RANK[prev] ?? 99);
}

function severityImproved(prev: string | null, next: string): boolean {
  if (!prev) return false;
  return (SEVERITY_RANK[next] ?? 99) > (SEVERITY_RANK[prev] ?? 99);
}

/**
 * Pure planner: given insights + existing issues, produce sync actions and the work-queue document items.
 * Does not call GitHub.
 */
export function planWorkSync(options: {
  insights: TrafficInsightDocument;
  issues: ExistingIssue[];
  now?: Date;
  createCap?: number;
  targetRepo?: string;
}): SyncPlan {
  const now = options.now ?? new Date();
  const createCap = options.createCap ?? AUTO_CREATE_CAP_PER_RUN;
  const targetRepo = options.targetRepo ?? DEFAULT_TARGET_REPO;
  const { findingById, briefByAction } = buildLookup(options.insights);
  const byAction = indexIssuesByActionId(options.issues);
  const plans: SyncPlanItem[] = [];
  const queueItems: Record<string, WorkQueueItem> = {};

  const autoCandidates: InsightAction[] = [];
  const actionIdsPresent = new Set(options.insights.actions.map((a) => a.action_id));

  for (const action of options.insights.actions) {
    const brief = briefByAction.get(action.action_id) ?? null;
    const findings = (action.finding_ids?.length ? action.finding_ids : [action.finding_id])
      .map((id) => findingById.get(id))
      .filter((f): f is InsightFinding => Boolean(f));
    const eligibility = eligibilityFor({
      action,
      brief,
      finding: findings[0] ?? null,
      findings,
    });

    const existing = byAction.get(action.action_id);
    if (!existing) {
      if (eligibility === "auto") {
        autoCandidates.push(action);
      } else {
        plans.push({
          kind: "skip_recommend",
          action_id: action.action_id,
          eligibility,
          reason: "recommend — awaiting promote",
        });
        queueItems[action.action_id] = queueItemFromAction({
          action,
          brief,
          eligibility,
          lifecycle: "detected",
          issue: null,
          targetRepo,
        });
      }
      continue;
    }

    const labels = existing.labels;
    const machine = parseMachineBlock(existing.body) ?? {
      action_id: action.action_id,
      lifecycle: "detected" as WorkLifecycle,
      property_id: action.property_id,
      target_repo: targetRepo,
      insights_generated_at: null,
      verification_condition: action.verification_condition,
      snooze_until: null,
      eligibility,
      brief_id: action.brief_id,
      finding_ids: action.finding_ids,
      priority_class: action.priority_class,
      confidence: brief?.confidence ?? null,
    };

    const labelLifecycle = lifecycleFromLabels(labels, machine.lifecycle);
    if (labelLifecycle === "dismissed" || machine.lifecycle === "dismissed") {
      plans.push({
        kind: "skip_dismissed",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        reason: "operator dismissed",
      });
      queueItems[action.action_id] = queueItemFromAction({
        action,
        brief,
        eligibility,
        lifecycle: "dismissed",
        issue: existing,
        targetRepo,
        snooze_until: machine.snooze_until,
      });
      continue;
    }

    const snooze = extractSnoozeFromLabelsOrBody(labels, existing.body);
    if (isSnoozed(snooze, now)) {
      plans.push({
        kind: "skip_snoozed",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        reason: `snoozed until ${snooze}`,
      });
      queueItems[action.action_id] = queueItemFromAction({
        action,
        brief,
        eligibility,
        lifecycle: labelLifecycle,
        issue: existing,
        targetRepo,
        snooze_until: snooze,
      });
      continue;
    }

    // Preserve operator lifecycle; don't reset to detected.
    let lifecycle = labelLifecycle;
    if (OPERATOR_OWNED.has(lifecycle) || lifecycle === "verify" || lifecycle === "resolved") {
      // keep
    } else {
      lifecycle = "detected";
    }

    // Verification loop: still present after verify requested → comment.
    if (lifecycle === "verify" && existing.state === "open") {
      plans.push({
        kind: "comment_still_failing",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        comment:
          "TI sync: underlying action/finding is **still present** in the latest insights — verification has not cleared yet.",
        next_lifecycle: "verify",
      });
    }

    const composed = composeIssue({
      action,
      brief,
      findings,
      insights: options.insights,
      lifecycle,
      eligibility,
      target_repo: targetRepo,
      snooze_until: snooze,
    });

    if (materialFieldsChanged(machine, composed.machine)) {
      // Keep operator lifecycle in machine block.
      composed.machine.lifecycle = lifecycle;
      const nextBody = upsertMachineBlock(
        refreshEvidenceSections(existing.body, composed.body),
        composed.machine,
      );
      composed.body = nextBody;
      plans.push({
        kind: "update_body",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        composed,
        reason: "material fields changed",
      });
    } else {
      plans.push({
        kind: "noop",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
      });
    }

    const prevSeverity = machine.priority_class; // approximate; prefer severity from title/body if needed
    void prevSeverity;
    const priorSeverityFromBody = /\| Severity \| ([^|]+) \|/.exec(existing.body)?.[1]?.trim() ?? null;
    if (severityWorsened(priorSeverityFromBody, action.severity)) {
      plans.push({
        kind: "comment_severity",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        comment: `TI sync: severity **worsened** to \`${action.severity}\` (was \`${priorSeverityFromBody}\`). Priority class: \`${action.priority_class}\`.`,
      });
    } else if (severityImproved(priorSeverityFromBody, action.severity)) {
      plans.push({
        kind: "comment_severity",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        comment: `TI sync: severity **improved** to \`${action.severity}\` (was \`${priorSeverityFromBody}\`). Priority class: \`${action.priority_class}\`.`,
      });
    }

    queueItems[action.action_id] = queueItemFromAction({
      action,
      brief,
      eligibility,
      lifecycle,
      issue: existing,
      targetRepo,
      snooze_until: snooze,
    });
  }

  // Absent actions with open issues → clearance path.
  for (const [actionId, issue] of byAction) {
    if (actionIdsPresent.has(actionId)) continue;
    if (issue.state !== "open") continue;
    const labels = issue.labels;
    const machine = parseMachineBlock(issue.body);
    const lifecycle = lifecycleFromLabels(labels, machine?.lifecycle ?? "detected");
    if (lifecycle === "dismissed") continue;
    const snooze = extractSnoozeFromLabelsOrBody(labels, issue.body);
    if (isSnoozed(snooze, now)) continue;

    if (lifecycle === "verify") {
      plans.push({
        kind: "set_lifecycle",
        action_id: actionId,
        eligibility: machine?.eligibility ?? "auto",
        issue_number: issue.number,
        next_lifecycle: "resolved",
        comment:
          "TI sync: condition still cleared on a subsequent run after verify — marking **resolved**.",
      });
      queueItems[actionId] = {
        action_id: actionId,
        issue_number: issue.number,
        html_url: issue.html_url,
        lifecycle: "resolved",
        eligibility: machine?.eligibility ?? "auto",
        property_id: machine?.property_id ?? null,
        target_repo: machine?.target_repo ?? targetRepo,
        title: issue.title,
        priority_class: machine?.priority_class ?? "watch",
        confidence: machine?.confidence ?? null,
        severity: null,
        recommended_action: "",
        verification_condition: machine?.verification_condition ?? "",
        brief_id: machine?.brief_id ?? null,
        finding_ids: machine?.finding_ids ?? [],
        snooze_until: snooze,
        updated_at: issue.updated_at,
      };
    } else {
      plans.push({
        kind: "comment_cleared",
        action_id: actionId,
        eligibility: machine?.eligibility ?? "auto",
        issue_number: issue.number,
        next_lifecycle: "verify",
        comment:
          "TI sync: **condition cleared** — underlying action/finding absent from latest insights. Lifecycle → `verify`. Resolve on the next clear run, or reopen work if it returns.",
      });
      queueItems[actionId] = {
        action_id: actionId,
        issue_number: issue.number,
        html_url: issue.html_url,
        lifecycle: "verify",
        eligibility: machine?.eligibility ?? "auto",
        property_id: machine?.property_id ?? null,
        target_repo: machine?.target_repo ?? targetRepo,
        title: issue.title,
        priority_class: machine?.priority_class ?? "watch",
        confidence: machine?.confidence ?? null,
        severity: null,
        recommended_action: "",
        verification_condition: machine?.verification_condition ?? "",
        brief_id: machine?.brief_id ?? null,
        finding_ids: machine?.finding_ids ?? [],
        snooze_until: snooze,
        updated_at: issue.updated_at,
      };
    }
  }

  const ranked = rankActionsForCreate(autoCandidates);
  let createsSelected = 0;
  let createsSkippedByCap = 0;
  for (const action of ranked) {
    const brief = briefByAction.get(action.action_id) ?? null;
    const findings = (action.finding_ids?.length ? action.finding_ids : [action.finding_id])
      .map((id) => findingById.get(id))
      .filter((f): f is InsightFinding => Boolean(f));
    const eligibility: WorkEligibility = "auto";
    if (createsSelected >= createCap) {
      createsSkippedByCap += 1;
      plans.push({
        kind: "skip_cap",
        action_id: action.action_id,
        eligibility,
        reason: `auto-create cap ${createCap}`,
      });
      queueItems[action.action_id] = queueItemFromAction({
        action,
        brief,
        eligibility,
        lifecycle: "detected",
        issue: null,
        targetRepo,
      });
      continue;
    }
    const composed = composeIssue({
      action,
      brief,
      findings,
      insights: options.insights,
      lifecycle: "detected",
      eligibility,
      target_repo: targetRepo,
    });
    plans.push({
      kind: "create",
      action_id: action.action_id,
      eligibility,
      composed,
    });
    createsSelected += 1;
    queueItems[action.action_id] = queueItemFromAction({
      action,
      brief,
      eligibility,
      lifecycle: "detected",
      issue: null,
      targetRepo,
    });
  }

  return { plans, queueItems, createsSelected, createsSkippedByCap };
}

export function buildWorkQueueDocument(options: {
  insights: TrafficInsightDocument;
  items: Record<string, WorkQueueItem>;
  fixture?: boolean;
  generatedAt?: string;
  limitations?: string[];
  targetRepo?: string;
}): WorkQueueDocument {
  return {
    contract_name: WORK_QUEUE_CONTRACT,
    schema_version: WORK_QUEUE_SCHEMA_VERSION,
    fixture: options.fixture ?? false,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    source_insights_generated_at: options.insights.generated_at ?? null,
    target_repo: options.targetRepo ?? DEFAULT_TARGET_REPO,
    items: options.items,
    limitations: options.limitations ?? [],
  };
}

function queueItemFromAction(opts: {
  action: InsightAction;
  brief: OperationalBrief | null;
  eligibility: WorkEligibility;
  lifecycle: WorkLifecycle;
  issue: ExistingIssue | null;
  targetRepo: string;
  snooze_until?: string | null;
}): WorkQueueItem {
  const { action, brief, eligibility, lifecycle, issue, targetRepo } = opts;
  return {
    action_id: action.action_id,
    issue_number: issue?.number ?? null,
    html_url: issue?.html_url ?? null,
    lifecycle,
    eligibility,
    property_id: action.property_id,
    target_repo: targetRepo,
    title: issue?.title ?? action.recommended_action,
    priority_class: action.priority_class,
    confidence: brief?.confidence ?? null,
    severity: action.severity,
    recommended_action: action.recommended_action,
    verification_condition: action.verification_condition,
    brief_id: action.brief_id ?? brief?.brief_id ?? null,
    finding_ids: action.finding_ids?.length ? action.finding_ids : [action.finding_id],
    snooze_until: opts.snooze_until ?? null,
    updated_at: issue?.updated_at ?? null,
  };
}

/**
 * Prefer replacing the composed body wholesale when sync updates evidence —
 * keeps operator comments in GitHub timeline, not in the sticky body.
 */
function refreshEvidenceSections(_existingBody: string, composedBody: string): string {
  return composedBody;
}

export function emptyWorkQueueFixture(generatedAt = "2026-01-01T00:00:00.000Z"): WorkQueueDocument {
  return {
    contract_name: WORK_QUEUE_CONTRACT,
    schema_version: WORK_QUEUE_SCHEMA_VERSION,
    fixture: true,
    generated_at: generatedAt,
    source_insights_generated_at: null,
    target_repo: DEFAULT_TARGET_REPO,
    items: {},
    limitations: ["Fixture work queue — no live GitHub issues linked."],
  };
}
