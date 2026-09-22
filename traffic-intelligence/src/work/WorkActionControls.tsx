import type { InsightAction, InsightFinding, OperationalBrief, TrafficInsightDocument } from "../insights/types";
import type { WorkQueueDocument, WorkQueueItem } from "./types";
import { eligibilityFor } from "./eligibility";
import { issueCommentIntentUrl, issueUrl, newIssueUrl, snoozeUntilDate } from "./urls";

export function lifecycleChipClass(lifecycle: string): string {
  if (lifecycle === "resolved") return "ok";
  if (lifecycle === "dismissed") return "blocked";
  if (lifecycle === "verify" || lifecycle === "in_progress") return "action";
  return "watch";
}

export function WorkLifecycleChip({ item }: { item: WorkQueueItem | null | undefined }) {
  if (!item) {
    return <span className="meta-chip">no issue yet</span>;
  }
  return (
    <span className={`health-chip health-chip--${lifecycleChipClass(item.lifecycle)}`} title="TI lifecycle">
      <em>#{item.issue_number ?? "—"}</em> {item.lifecycle}
    </span>
  );
}

export function WorkActionControls({
  action,
  brief,
  findings,
  insights,
  workItem,
  onViewEvidence,
  compact = false,
}: {
  action: InsightAction;
  brief?: OperationalBrief | null;
  findings?: InsightFinding[];
  insights: TrafficInsightDocument | null;
  workItem: WorkQueueItem | null | undefined;
  onViewEvidence: (propertyId: string | null) => void;
  compact?: boolean;
}) {
  const eligibility =
    workItem?.eligibility ??
    eligibilityFor({
      action,
      brief: brief ?? null,
      finding: findings?.[0] ?? null,
      findings: findings ?? [],
    });
  const existingUrl = issueUrl(workItem);
  const promoteUrl = newIssueUrl({
    action,
    brief,
    findings,
    insights,
    eligibility: "recommend",
    lifecycle: "detected",
  });
  const openUrl = existingUrl ?? (eligibility === "recommend" ? promoteUrl : promoteUrl);

  const dismissUrl = existingUrl
    ? issueCommentIntentUrl(existingUrl, "dismiss")
    : newIssueUrl({
        action,
        brief,
        findings,
        insights,
        eligibility,
        lifecycle: "dismissed",
      });

  const snoozeUrl = existingUrl
    ? issueCommentIntentUrl(existingUrl, "snooze")
    : newIssueUrl({
        action,
        brief,
        findings,
        insights,
        eligibility,
        lifecycle: "detected",
      });

  const verifyUrl = existingUrl
    ? issueCommentIntentUrl(existingUrl, "verify")
    : null;

  const assignUrl = existingUrl ? issueCommentIntentUrl(existingUrl, "assign") : null;
  const primaryLabel = existingUrl
    ? workItem?.issue_number != null
      ? `Open #${workItem.issue_number}`
      : "Open work item"
    : eligibility === "recommend"
      ? "Promote to work"
      : "Create work item";

  if (compact) {
    return (
      <div
        className="work-action-controls work-action-controls--compact"
        role="group"
        aria-label={`Work controls for ${action.action_id}`}
      >
        <a className="range-button work-link work-link--primary" href={openUrl} target="_blank" rel="noreferrer">
          {primaryLabel}
        </a>
        {action.property_id ? (
          <button type="button" className="range-button" onClick={() => onViewEvidence(action.property_id)}>
            Evidence
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="work-action-controls" role="group" aria-label={`Work controls for ${action.action_id}`}>
      <WorkLifecycleChip item={workItem ?? null} />
      <span className="meta-chip">eligibility {eligibility}</span>
      <div className="work-action-controls__buttons">
        <a className="range-button work-link" href={openUrl} target="_blank" rel="noreferrer">
          {existingUrl ? "Open work item" : eligibility === "recommend" ? "Promote to work" : "Open work item"}
        </a>
        {assignUrl ? (
          <a className="range-button work-link" href={assignUrl} target="_blank" rel="noreferrer" title="Assign the issue owner in GitHub">
            Assign
          </a>
        ) : (
          <span className="section-note" title="Create or open a work item first">
            Assign (needs issue)
          </span>
        )}
        <a
          className="range-button work-link"
          href={dismissUrl}
          target="_blank"
          rel="noreferrer"
          title="Add label ti-lifecycle:dismissed on the issue"
        >
          Dismiss
        </a>
        <a
          className="range-button work-link"
          href={snoozeUrl}
          target="_blank"
          rel="noreferrer"
          title={`Set ti-snooze-until:${snoozeUntilDate(7)} on the issue machine block or label`}
        >
          Snooze
        </a>
        {verifyUrl ? (
          <a
            className="range-button work-link"
            href={verifyUrl}
            target="_blank"
            rel="noreferrer"
            title="Set ti-lifecycle:verify — sync measures clearance"
          >
            Verify fix
          </a>
        ) : (
          <span className="section-note">Verify (needs issue)</span>
        )}
        {action.property_id ? (
          <button type="button" className="range-button" onClick={() => onViewEvidence(action.property_id)}>
            View evidence
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function workItemFor(
  queue: WorkQueueDocument | null | undefined,
  actionId: string,
): WorkQueueItem | null {
  if (!queue?.items) return null;
  return queue.items[actionId] ?? null;
}
