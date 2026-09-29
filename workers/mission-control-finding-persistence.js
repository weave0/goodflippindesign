/**
 * Durable adapter for complete finding-snapshot reconciliation plans.
 *
 * The pure reducer remains authoritative for projection semantics. This layer
 * only persists its deterministic plan into the existing mc_* tables with
 * per-item compare-and-swap and idempotent event IDs. It grants no FWOMPS,
 * repair, publication, deployment, or external-effect authority.
 */

import {
  RECONCILIATION_PLAN_CONTRACT,
  RECONCILIATION_PLAN_SCHEMA_VERSION,
  reconcileCompleteFindingSnapshot,
} from './lib/mission-control-finding-reconciliation.js';
import { validateWorkItemProjection } from './lib/mission-control-work-items.js';
import { WorkItemError } from './mission-control-work-items.js';

const MUTATING_EVENT_TYPES = new Set([
  'WORK_ITEM_CREATED',
  'WORK_ITEM_OBSERVED',
  'WORK_ITEM_RECURRENT',
]);

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    throw new WorkItemError('malformed_reconciliation_plan', 'Reconciliation plan must be an object', 400);
  }
  if (plan.contractName !== RECONCILIATION_PLAN_CONTRACT) {
    throw new WorkItemError('malformed_reconciliation_plan', 'Unsupported reconciliation plan contract', 400);
  }
  if (plan.schemaVersion !== RECONCILIATION_PLAN_SCHEMA_VERSION) {
    throw new WorkItemError('malformed_reconciliation_plan', 'Unsupported reconciliation plan schemaVersion', 400);
  }
  if (!Array.isArray(plan.workItems) || !Array.isArray(plan.events)) {
    throw new WorkItemError('malformed_reconciliation_plan', 'Reconciliation plan must contain workItems and events arrays', 400);
  }

  const items = new Map();
  for (const item of plan.workItems) {
    validateWorkItemProjection(item);
    if (items.has(item.workItemId)) {
      throw new WorkItemError('malformed_reconciliation_plan', `Duplicate work item ${item.workItemId}`, 400);
    }
    items.set(item.workItemId, item);
  }

  const eventIds = new Set();
  for (const event of plan.events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new WorkItemError('malformed_reconciliation_plan', 'Reconciliation event must be an object', 400);
    }
    if (typeof event.eventId !== 'string' || !event.eventId) {
      throw new WorkItemError('malformed_reconciliation_plan', 'Reconciliation event is missing eventId', 400);
    }
    if (eventIds.has(event.eventId)) {
      throw new WorkItemError('malformed_reconciliation_plan', `Duplicate reconciliation event ${event.eventId}`, 400);
    }
    eventIds.add(event.eventId);
    if (!items.has(event.workItemId)) {
      throw new WorkItemError('malformed_reconciliation_plan', `Event ${event.eventId} has no work-item projection`, 400);
    }
    if (!MUTATING_EVENT_TYPES.has(event.eventType) && event.eventType !== 'RESOLUTION_CANDIDATE') {
      throw new WorkItemError('malformed_reconciliation_plan', `Unsupported reconciliation event type ${event.eventType}`, 400);
    }
  }

  return items;
}

export async function persistReconciliationPlan(store, plan) {
  if (!store?.persistReconciliationProjection || !store?.appendReconciliationEvent) {
    throw new WorkItemError('store_unavailable', 'Work-item store does not support reconciliation persistence', 503);
  }

  const items = validatePlan(plan);
  const stats = {
    applied: 0,
    replayed: 0,
    candidateEventsApplied: 0,
    candidateEventsReplayed: 0,
  };

  for (const event of plan.events) {
    const item = items.get(event.workItemId);
    if (event.eventType === 'RESOLUTION_CANDIDATE') {
      const result = await store.appendReconciliationEvent(item, event);
      if (result.applied) stats.candidateEventsApplied += 1;
      else stats.candidateEventsReplayed += 1;
      continue;
    }

    const expectedLifecycleVersion = event.eventType === 'WORK_ITEM_CREATED'
      ? 0
      : item.lifecycleVersion - 1;
    const result = await store.persistReconciliationProjection(item, event, {
      expectedLifecycleVersion,
    });
    if (result.applied) stats.applied += 1;
    else stats.replayed += 1;
  }

  return {
    contractName: 'gfd-mission-control-reconciliation-persistence-result',
    schemaVersion: '1.0.0',
    producer: plan.producer,
    snapshotDigest: plan.snapshotDigest,
    stats,
  };
}

export async function reconcileAndPersistCompleteFindingSnapshot(store, snapshot, options = {}) {
  if (!store?.list) {
    throw new WorkItemError('store_unavailable', 'Work-item store cannot read the current projection', 503);
  }
  const workItems = await store.list();
  const plan = await reconcileCompleteFindingSnapshot({
    workItems,
    snapshot,
    ...options,
  });
  const persistence = await persistReconciliationPlan(store, plan);
  return { plan, persistence };
}
