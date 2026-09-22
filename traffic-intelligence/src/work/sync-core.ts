import type {
  InsightAction,
  InsightFinding,
  InsightPriority,
  OperationalBrief,
  TrafficInsightDocument,
} from "../insights/types";
import { PRIORITY_RANK } from "../insights/select";
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
  groupActions,
  isConsolidatableRootCause,
  pickPrimaryMember,
  type GroupingInput,
} from "./grouping";
import { scoreImpact } from "./scoring";
import { snapshotFromInsights, upsertEvidenceSection } from "./evidence";
import {
  AUTO_CREATE_CAP_PER_RUN,
  DEFAULT_TARGET_REPO,
  LIFECYCLE_CONFLICT_RULES,
  OPERATOR_OWNED_LIFECYCLES,
  type GroupRole,
  type ImpactClass,
  type WorkEligibility,
  type WorkLifecycle,
  type WorkMachineBlock,
  type WorkQueueDocument,
  type WorkQueueItem,
  type WorkQueueMetrics,
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
  | "comment_reopened"
  | "set_lifecycle"
  | "supersede_duplicate"
  | "reopen"
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
  /** For supersede: point members at the primary issue. */
  primary_issue_number?: number;
  root_cause_key?: string;
  labels_add?: string[];
}

export interface SyncPlan {
  plans: SyncPlanItem[];
  queueItems: Record<string, WorkQueueItem>;
  createsSelected: number;
  createsSkippedByCap: number;
  metrics: WorkQueueMetrics;
}

const OPERATOR_OWNED: ReadonlySet<WorkLifecycle> = new Set(OPERATOR_OWNED_LIFECYCLES);

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export { LIFECYCLE_CONFLICT_RULES };

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

/** Index open consolidatable issues by root_cause_key (prefer primary / group label). */
export function indexPrimaryIssuesByRootCause(issues: ExistingIssue[]): Map<string, ExistingIssue> {
  const map = new Map<string, ExistingIssue>();
  for (const issue of issues) {
    if (issue.state !== "open") continue;
    if (issue.labels.includes("ti-superseded")) continue;
    const machine = parseMachineBlock(issue.body ?? "");
    const key = machine?.root_cause_key;
    if (!key || !isConsolidatableRootCause(key)) continue;
    const isPrimary =
      machine.group_role === "primary" || issue.labels.includes("ti-group:primary");
    const prev = map.get(key);
    if (!prev) {
      map.set(key, issue);
      continue;
    }
    const prevMachine = parseMachineBlock(prev.body ?? "");
    const prevPrimary =
      prevMachine?.group_role === "primary" || prev.labels.includes("ti-group:primary");
    if (isPrimary && !prevPrimary) map.set(key, issue);
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
      (insights.briefs ?? []).find((b) =>
        b.finding_ids.some((id) => action.finding_ids.includes(id) || id === action.finding_id),
      ) ??
      null;
    briefByAction.set(action.action_id, brief);
  }
  return { briefById, findingById, briefByAction };
}

export function rankActionsForCreate(
  actions: InsightAction[],
  scoreByAction?: Map<string, number>,
): InsightAction[] {
  return [...actions].sort(
    (a, b) =>
      (scoreByAction?.get(b.action_id) ?? 0) - (scoreByAction?.get(a.action_id) ?? 0) ||
      (PRIORITY_RANK[a.priority_class as InsightPriority] ?? 99) -
        (PRIORITY_RANK[b.priority_class as InsightPriority] ?? 99) ||
      (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99) ||
      a.action_id.localeCompare(b.action_id),
  );
}

function isSnoozed(snoozeUntil: string | null, now: Date): boolean {
  if (!snoozeUntil) return false;
  const today = now.toISOString().slice(0, 10);
  return today <= snoozeUntil;
}

function materialFieldsChanged(prev: WorkMachineBlock, next: WorkMachineBlock): boolean {
  return (
    prev.verification_condition !== next.verification_condition ||
    prev.priority_class !== next.priority_class ||
    prev.confidence !== next.confidence ||
    prev.insights_generated_at !== next.insights_generated_at ||
    prev.eligibility !== next.eligibility ||
    prev.impact_score !== next.impact_score ||
    prev.root_cause_key !== next.root_cause_key
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

function emptyMetrics(): WorkQueueMetrics {
  return {
    planned: 0,
    auto: 0,
    recommend: 0,
    open_issues: 0,
    by_lifecycle: {},
    by_impact_class: {},
    creates_last_sync: 0,
    updates_last_sync: 0,
    closes_last_sync: 0,
    consolidated_groups: 0,
    superseded_duplicates: 0,
  };
}

function bump(map: Record<string, number>, key: string): void {
  map[key] = (map[key] ?? 0) + 1;
}

/**
 * Pure planner: insights + existing issues → sync actions + work-queue items (TI-010).
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
  const primaryByRoot = indexPrimaryIssuesByRootCause(options.issues);
  const plans: SyncPlanItem[] = [];
  const queueItems: Record<string, WorkQueueItem> = {};
  const metrics = emptyMetrics();
  const scoreByAction = new Map<string, number>();

  const groupingInputs: GroupingInput[] = options.insights.actions.map((action) => {
    const brief = briefByAction.get(action.action_id) ?? null;
    const findings = (action.finding_ids?.length ? action.finding_ids : [action.finding_id])
      .map((id) => findingById.get(id))
      .filter((f): f is InsightFinding => Boolean(f));
    return { action, brief, finding: findings[0] ?? null, findings };
  });
  const groups = groupActions(groupingInputs);
  const groupByActionId = new Map<string, ReturnType<typeof groupActions>[number]>();
  for (const g of groups) {
    for (const m of g.members) groupByActionId.set(m.action.action_id, g);
  }
  metrics.consolidated_groups = groups.filter((g) => g.consolidatable).length;

  // Migration authority: when the computed primary already has an open legacy
  // issue, bind the normalized root cause to it before walking members. This
  // allows every duplicate to supersede in one sync regardless of action order.
  for (const g of groups) {
    if (!g.consolidatable) continue;
    const primary = pickPrimaryMember(g.members);
    const primaryIssue = byAction.get(primary.action.action_id);
    if (
      primaryIssue?.state === "open" &&
      !primaryIssue.labels.includes("ti-superseded")
    ) {
      primaryByRoot.set(g.root_cause_key, primaryIssue);
    }
  }

  const actionIdsPresent = new Set(options.insights.actions.map((a) => a.action_id));
  const createCandidates: Array<{
    action: InsightAction;
    eligibility: WorkEligibility;
    group_role: GroupRole;
    root_cause_key: string;
    group_members?: GroupingInput[];
    consolidatedPrimary?: boolean;
    groupSize?: number;
  }> = [];

  // Track which consolidatable groups already have a primary create/update planned.
  const primaryHandled = new Set<string>();

  for (const input of groupingInputs) {
    const action = input.action;
    const brief = input.brief ?? null;
    const findings = input.findings ?? [];
    const group = groupByActionId.get(action.action_id)!;
    const consolidatable = group.consolidatable;
    const primary = consolidatable ? pickPrimaryMember(group.members) : input;
    const isPrimary = !consolidatable || primary.action.action_id === action.action_id;
    const group_role: GroupRole = consolidatable ? (isPrimary ? "primary" : "member") : "standalone";
    const groupSize = group.members.length;

    const eligibility = eligibilityFor({
      action,
      brief,
      finding: findings[0] ?? null,
      findings,
      consolidatedPrimary: consolidatable && isPrimary,
      groupSize,
    });

    const scored = scoreImpact({ action, brief, finding: findings[0] ?? null, findings });
    scoreByAction.set(action.action_id, scored.impact_score);

    metrics.planned += 1;
    if (eligibility === "auto") metrics.auto += 1;
    else metrics.recommend += 1;

    const existing = byAction.get(action.action_id);
    const rootKey = group.root_cause_key;

    // --- Member of consolidatable group: point at primary issue; supersede own duplicate ---
    if (consolidatable && !isPrimary) {
      const primaryActionId = primary.action.action_id;
      const primaryIssue =
        byAction.get(primaryActionId) ??
        primaryByRoot.get(rootKey) ??
        null;

      if (existing && existing.state === "open" && primaryIssue && existing.number !== primaryIssue.number) {
        plans.push({
          kind: "supersede_duplicate",
          action_id: action.action_id,
          eligibility,
          issue_number: existing.number,
          primary_issue_number: primaryIssue.number,
          root_cause_key: rootKey,
          comment: `TI-010: superseded by consolidated root-cause issue #${primaryIssue.number} (\`${rootKey}\`). This per-property duplicate is closed to stop measurement_blocked flood noise. action_id \`${action.action_id}\` remains in the work-queue as \`group_role: member\` pointing at #${primaryIssue.number}. History preserved.`,
          labels_add: ["ti-superseded"],
          next_lifecycle: "resolved",
        });
        metrics.superseded_duplicates += 1;
      } else if (existing && existing.state === "open" && !primaryIssue) {
        // Primary not created yet — mark member for attach after primary create; keep issue for now.
        // Will supersede on a later sync once primary exists.
      }

      const issueRef = primaryIssue ?? existing ?? null;
      queueItems[action.action_id] = queueItemFromAction({
        action,
        brief,
        eligibility,
        lifecycle: issueRef
          ? lifecycleFromLabels(issueRef.labels, parseMachineBlock(issueRef.body)?.lifecycle ?? "detected")
          : "detected",
        issue: issueRef,
        targetRepo,
        scored,
        root_cause_key: rootKey,
        group_role: "member",
        group_member_action_ids: [],
        snooze_until: issueRef ? extractSnoozeFromLabelsOrBody(issueRef.labels, issueRef.body) : null,
      });
      continue;
    }

    // --- Primary / standalone ---
    // Closed (resolved) issue with returning action → reopen / regressed
    if (existing && existing.state === "closed") {
      const closed = existing;
      if (!closed.labels.includes("ti-superseded")) {
        const labelLifecycle = lifecycleFromLabels(closed.labels, "resolved");
        if (labelLifecycle !== "dismissed") {
          const composed = composeIssue({
            action,
            brief,
            findings,
            insights: options.insights,
            lifecycle: "regressed",
            eligibility,
            target_repo: targetRepo,
            root_cause_key: rootKey,
            group_role,
            group_members: consolidatable
              ? group.members.map((m) => ({
                  action_id: m.action.action_id,
                  property_id: m.action.property_id,
                  confidence: m.brief?.confidence ?? null,
                }))
              : undefined,
            impact_score: scored.impact_score,
            impact_class: scored.impact_class,
            impact_rationale: scored.rationale,
            prior_body: closed.body,
            consolidatedPrimary: consolidatable,
            groupSize,
          });
          plans.push({
            kind: "reopen",
            action_id: action.action_id,
            eligibility,
            issue_number: closed.number,
            composed,
            next_lifecycle: "regressed",
            comment: `TI sync: **regression** — action_id \`${action.action_id}\` / root cause \`${rootKey}\` returned in fresh insights. Lifecycle → \`regressed\`. Evidence refreshed from current measurements.`,
          });
          queueItems[action.action_id] = queueItemFromAction({
            action,
            brief,
            eligibility,
            lifecycle: "regressed",
            issue: { ...closed, state: "open" },
            targetRepo,
            scored,
            root_cause_key: rootKey,
            group_role,
            group_member_action_ids: consolidatable ? group.members.map((m) => m.action.action_id) : [],
          });
          if (consolidatable) primaryHandled.add(rootKey);
          continue;
        }
      }
      // Closed but dismissed / superseded — fall through to create-or-recommend without that issue.
    }

    if (!existing || existing.state === "closed") {
      if (eligibility === "auto") {
        createCandidates.push({
          action,
          eligibility,
          group_role,
          root_cause_key: rootKey,
          group_members: consolidatable ? group.members : undefined,
          consolidatedPrimary: consolidatable,
          groupSize,
        });
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
          scored,
          root_cause_key: rootKey,
          group_role,
          group_member_action_ids: consolidatable ? group.members.map((m) => m.action.action_id) : [],
        });
      }
      continue;
    }

    // Existing open issue for primary/standalone
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
      root_cause_key: rootKey,
      group_role,
      group_issue_number: null,
      impact_score: scored.impact_score,
      impact_class: scored.impact_class,
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
        scored,
        root_cause_key: rootKey,
        group_role,
        group_member_action_ids: consolidatable ? group.members.map((m) => m.action.action_id) : [],
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
        scored,
        root_cause_key: rootKey,
        group_role,
        group_member_action_ids: consolidatable ? group.members.map((m) => m.action.action_id) : [],
        snooze_until: snooze,
      });
      continue;
    }

    let lifecycle = labelLifecycle;
    if (OPERATOR_OWNED.has(lifecycle) || lifecycle === "verify" || lifecycle === "resolved" || lifecycle === "regressed") {
      // keep
    } else {
      lifecycle = "detected";
    }

    // Still present while verify → failing comment with current evidence hint
    if (lifecycle === "verify" && existing.state === "open") {
      plans.push({
        kind: "comment_still_failing",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        comment: [
          "TI sync: underlying action/finding is **still present** in the latest insights — verification has not cleared yet.",
          `insights_generated_at=${options.insights.generated_at}`,
          `impact=${scored.impact_class} (${scored.impact_score}) · ${scored.rationale}`,
        ].join("\n"),
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
      root_cause_key: rootKey,
      group_role,
      group_issue_number: existing.number,
      group_members: consolidatable
        ? group.members.map((m) => ({
            action_id: m.action.action_id,
            property_id: m.action.property_id,
            confidence: m.brief?.confidence ?? null,
          }))
        : undefined,
      impact_score: scored.impact_score,
      impact_class: scored.impact_class,
      impact_rationale: scored.rationale,
      prior_body: existing.body,
      consolidatedPrimary: consolidatable,
      groupSize,
    });

    if (materialFieldsChanged(machine, composed.machine) || consolidatable) {
      composed.machine.lifecycle = lifecycle;
      // composeIssue() already carries the preserved first-detection evidence
      // from prior_body while rebuilding all human-readable fields from the
      // latest insight. Never leave a stale headline/summary above fresh evidence.
      composed.body = upsertMachineBlock(composed.body, composed.machine);
      plans.push({
        kind: "update_body",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
        composed,
        reason: consolidatable ? "consolidated evidence refresh" : "material fields / evidence changed",
      });
      metrics.updates_last_sync += 1;
    } else {
      plans.push({
        kind: "noop",
        action_id: action.action_id,
        eligibility,
        issue_number: existing.number,
      });
    }

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
      scored,
      root_cause_key: rootKey,
      group_role,
      group_member_action_ids: consolidatable ? group.members.map((m) => m.action.action_id) : [],
      snooze_until: snooze,
    });

    if (consolidatable) {
      primaryHandled.add(rootKey);
      primaryByRoot.set(rootKey, existing);
    }
  }

  // Orphan open duplicates for consolidatable keys that weren't in member path
  // (e.g. older issues whose action_id still present as member already handled).

  // Absent actions with open issues → clearance / verify / resolved
  for (const [actionId, issue] of byAction) {
    if (actionIdsPresent.has(actionId)) continue;
    if (issue.state !== "open") continue;
    if (issue.labels.includes("ti-superseded")) continue;
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
          "TI sync: condition still cleared on a subsequent run after verify (fresh insights) — marking **resolved**.",
      });
      metrics.closes_last_sync += 1;
      queueItems[actionId] = absentQueueItem(actionId, issue, machine, targetRepo, "resolved", snooze);
    } else {
      plans.push({
        kind: "comment_cleared",
        action_id: actionId,
        eligibility: machine?.eligibility ?? "auto",
        issue_number: issue.number,
        next_lifecycle: "verify",
        comment:
          "TI sync: **condition cleared** — underlying action/finding absent from latest insights. Lifecycle → `verify`. Resolve on the next clear run, or reopen if it returns.",
      });
      queueItems[actionId] = absentQueueItem(actionId, issue, machine, targetRepo, "verify", snooze);
    }
  }

  // Creates (capped), ranked by impact score
  const ranked = rankActionsForCreate(
    createCandidates.map((c) => c.action),
    scoreByAction,
  );
  const candidateById = new Map(createCandidates.map((c) => [c.action.action_id, c]));
  let createsSelected = 0;
  let createsSkippedByCap = 0;

  for (const action of ranked) {
    const cand = candidateById.get(action.action_id)!;
    const brief = briefByAction.get(action.action_id) ?? null;
    const findings = (action.finding_ids?.length ? action.finding_ids : [action.finding_id])
      .map((id) => findingById.get(id))
      .filter((f): f is InsightFinding => Boolean(f));
    const scored = scoreImpact({ action, brief, finding: findings[0] ?? null, findings });

    // If consolidatable and a primary already exists in GH, attach instead of create
    if (cand.group_role === "primary" && isConsolidatableRootCause(cand.root_cause_key)) {
      const existingPrimary = primaryByRoot.get(cand.root_cause_key);
      if (existingPrimary && !primaryHandled.has(cand.root_cause_key)) {
        // Update existing primary rather than create
        const composed = composeIssue({
          action,
          brief,
          findings,
          insights: options.insights,
          lifecycle: lifecycleFromLabels(existingPrimary.labels, "detected"),
          eligibility: "auto",
          target_repo: targetRepo,
          root_cause_key: cand.root_cause_key,
          group_role: "primary",
          group_issue_number: existingPrimary.number,
          group_members: cand.group_members?.map((m) => ({
            action_id: m.action.action_id,
            property_id: m.action.property_id,
            confidence: m.brief?.confidence ?? null,
          })),
          impact_score: scored.impact_score,
          impact_class: scored.impact_class,
          impact_rationale: scored.rationale,
          prior_body: existingPrimary.body,
          consolidatedPrimary: true,
          groupSize: cand.groupSize,
        });
        plans.push({
          kind: "update_body",
          action_id: action.action_id,
          eligibility: "auto",
          issue_number: existingPrimary.number,
          composed,
          reason: "attach consolidated primary to existing root-cause issue",
        });
        metrics.updates_last_sync += 1;
        primaryHandled.add(cand.root_cause_key);
        queueItems[action.action_id] = queueItemFromAction({
          action,
          brief,
          eligibility: "auto",
          lifecycle: composed.machine.lifecycle,
          issue: existingPrimary,
          targetRepo,
          scored,
          root_cause_key: cand.root_cause_key,
          group_role: "primary",
          group_member_action_ids: cand.group_members?.map((m) => m.action.action_id) ?? [],
        });
        continue;
      }
    }

    if (createsSelected >= createCap) {
      createsSkippedByCap += 1;
      plans.push({
        kind: "skip_cap",
        action_id: action.action_id,
        eligibility: "auto",
        reason: `auto-create cap ${createCap}`,
      });
      queueItems[action.action_id] = queueItemFromAction({
        action,
        brief,
        eligibility: "auto",
        lifecycle: "detected",
        issue: null,
        targetRepo,
        scored,
        root_cause_key: cand.root_cause_key,
        group_role: cand.group_role,
        group_member_action_ids: cand.group_members?.map((m) => m.action.action_id) ?? [],
      });
      continue;
    }

    const composed = composeIssue({
      action,
      brief,
      findings,
      insights: options.insights,
      lifecycle: "detected",
      eligibility: "auto",
      target_repo: targetRepo,
      root_cause_key: cand.root_cause_key,
      group_role: cand.group_role,
      group_members: cand.group_members?.map((m) => ({
        action_id: m.action.action_id,
        property_id: m.action.property_id,
        confidence: m.brief?.confidence ?? null,
      })),
      impact_score: scored.impact_score,
      impact_class: scored.impact_class,
      impact_rationale: scored.rationale,
      consolidatedPrimary: cand.consolidatedPrimary,
      groupSize: cand.groupSize,
    });
    plans.push({
      kind: "create",
      action_id: action.action_id,
      eligibility: "auto",
      composed,
      root_cause_key: cand.root_cause_key,
    });
    createsSelected += 1;
    metrics.creates_last_sync += 1;
    if (cand.group_role === "primary") {
      primaryHandled.add(cand.root_cause_key);
    }
    queueItems[action.action_id] = queueItemFromAction({
      action,
      brief,
      eligibility: "auto",
      lifecycle: "detected",
      issue: null,
      targetRepo,
      scored,
      root_cause_key: cand.root_cause_key,
      group_role: cand.group_role,
      group_member_action_ids: cand.group_members?.map((m) => m.action.action_id) ?? [],
    });
  }

  // Count open issues + lifecycle/impact histograms from queue
  for (const item of Object.values(queueItems)) {
    if (item.issue_number != null && item.lifecycle !== "resolved" && item.lifecycle !== "dismissed") {
      metrics.open_issues += 1;
    }
    bump(metrics.by_lifecycle, item.lifecycle);
    bump(metrics.by_impact_class, item.impact_class);
  }
  // Deduplicate open_issues count roughly by unique issue numbers
  const openNums = new Set(
    Object.values(queueItems)
      .filter((i) => i.issue_number != null && i.lifecycle !== "resolved" && i.lifecycle !== "dismissed")
      .map((i) => i.issue_number as number),
  );
  metrics.open_issues = openNums.size;

  return { plans, queueItems, createsSelected, createsSkippedByCap, metrics };
}

export function buildWorkQueueDocument(options: {
  insights: TrafficInsightDocument;
  items: Record<string, WorkQueueItem>;
  fixture?: boolean;
  generatedAt?: string;
  limitations?: string[];
  targetRepo?: string;
  metrics?: WorkQueueMetrics;
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
    metrics: options.metrics ?? deriveMetricsFromItems(options.items),
  };
}

export function deriveMetricsFromItems(items: Record<string, WorkQueueItem>): WorkQueueMetrics {
  const metrics = emptyMetrics();
  metrics.planned = Object.keys(items).length;
  const openNums = new Set<number>();
  for (const item of Object.values(items)) {
    if (item.eligibility === "auto") metrics.auto += 1;
    else metrics.recommend += 1;
    bump(metrics.by_lifecycle, item.lifecycle);
    bump(metrics.by_impact_class, item.impact_class);
    if (item.group_role === "primary") metrics.consolidated_groups += 1;
    if (
      item.issue_number != null &&
      item.lifecycle !== "resolved" &&
      item.lifecycle !== "dismissed"
    ) {
      openNums.add(item.issue_number);
    }
  }
  metrics.open_issues = openNums.size;
  return metrics;
}

function absentQueueItem(
  actionId: string,
  issue: ExistingIssue,
  machine: WorkMachineBlock | null,
  targetRepo: string,
  lifecycle: WorkLifecycle,
  snooze: string | null,
): WorkQueueItem {
  return {
    action_id: actionId,
    issue_number: issue.number,
    html_url: issue.html_url,
    lifecycle,
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
    impact_score: machine?.impact_score ?? 0,
    impact_class: (machine?.impact_class as ImpactClass) ?? "informational",
    impact_rationale: "absent from latest insights",
    root_cause_key: machine?.root_cause_key ?? null,
    group_role: machine?.group_role ?? "standalone",
    group_member_action_ids: [],
  };
}

function queueItemFromAction(opts: {
  action: InsightAction;
  brief: OperationalBrief | null;
  eligibility: WorkEligibility;
  lifecycle: WorkLifecycle;
  issue: ExistingIssue | null;
  targetRepo: string;
  scored: { impact_score: number; impact_class: ImpactClass; rationale: string };
  root_cause_key: string | null;
  group_role: GroupRole;
  group_member_action_ids: string[];
  snooze_until?: string | null;
}): WorkQueueItem {
  const { action, brief, eligibility, lifecycle, issue, targetRepo, scored } = opts;
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
    impact_score: scored.impact_score,
    impact_class: scored.impact_class,
    impact_rationale: scored.rationale,
    root_cause_key: opts.root_cause_key,
    group_role: opts.group_role,
    group_member_action_ids: opts.group_member_action_ids,
  };
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
    metrics: emptyMetrics(),
  };
}
