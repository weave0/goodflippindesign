/**
 * Pure complete-snapshot reconciliation for Mission Control findings.
 *
 * This module plans projection changes and candidate resolution events. It has
 * no D1, GitHub, deployment, FWOMPS, or execution authority.
 */

import {
  WORK_ITEM_SCHEMA_VERSION,
  WORK_ITEM_STATES,
  applyObservation,
  createObservedWorkItem,
  deriveWorkItemId,
  validateObservation,
  validateWorkItemProjection as validateCanonicalWorkItemProjection,
} from './mission-control-work-items.js';

export const FINDING_FEED_CONTRACT = 'gfd-mission-control-finding-feed';
export const FINDING_FEED_SCHEMA_VERSION = '1.0.0';
export const RECONCILIATION_PLAN_CONTRACT = 'gfd-mission-control-reconciliation-plan';
export const RECONCILIATION_PLAN_SCHEMA_VERSION = '1.0.0';

const ABSENCE_TERMINAL_STATES = new Set(['RESOLVED', 'DISMISSED', 'SUPERSEDED']);
const textEncoder = new TextEncoder();

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${name} must be a non-empty string no longer than ${max} characters`);
  }
  return value;
}

function instantMillis(value, name) {
  requireString(value, name, 64);
  if (!value.endsWith('Z')) throw new Error(`${name} must be an explicit UTC timestamp ending in Z`);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error(`${name} must be a valid timestamp`);
  return millis;
}

function requireDigest(value, name) {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be sha256:<64 lowercase hex>`);
  }
  return value;
}

function identityKey(value) {
  return [value.producer, value.propertyId, value.findingKey].join('\0');
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

async function sha256Hex(value) {
  const bytes = await crypto.subtle.digest('SHA-256', textEncoder.encode(value));
  return [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function digestDocument(value) {
  return `sha256:${await sha256Hex(JSON.stringify(canonicalize(value)))}`;
}

async function deriveEventId(event) {
  return `gfdwievent_v1_${await sha256Hex(JSON.stringify(canonicalize(event)))}`;
}

function sameObservation(existing, observation) {
  return existing.evidenceDigest === observation.evidenceDigest &&
    (existing.evidenceRevision ?? null) === (observation.evidenceRevision ?? null) &&
    (existing.severity ?? null) === (observation.severity ?? null) &&
    (existing.confidence ?? null) === (observation.confidence ?? null);
}

function inSnapshotScope(item, snapshot, propertyIds) {
  return item.producer === snapshot.producer &&
    propertyIds.has(item.propertyId) &&
    item.findingKey.startsWith(snapshot.scope.findingKeyPrefix);
}

function eventBase({ eventType, item, fromState, occurredAt, evidenceDigest }) {
  return {
    eventType,
    workItemId: item.workItemId,
    producer: item.producer,
    propertyId: item.propertyId,
    findingKey: item.findingKey,
    fromState,
    toState: item.state,
    occurredAt,
    evidenceDigest,
  };
}

async function observationEvent({ eventType, item, fromState, observation }) {
  const event = eventBase({
    eventType,
    item,
    fromState,
    occurredAt: observation.observedAt,
    evidenceDigest: observation.evidenceDigest,
  });
  return {
    eventId: await deriveEventId(event),
    ...event,
    detail: {
      evidenceRevision: observation.evidenceRevision ?? null,
      occurrenceCount: item.occurrenceCount,
      recurrenceCount: item.recurrenceCount,
    },
  };
}

async function resolutionCandidateEvent({ item, snapshot, snapshotDigest }) {
  const event = eventBase({
    eventType: 'RESOLUTION_CANDIDATE',
    item,
    fromState: item.state,
    occurredAt: snapshot.generatedAt,
    evidenceDigest: snapshotDigest,
  });
  return {
    eventId: await deriveEventId(event),
    ...event,
    toState: null,
    detail: {
      reason: 'finding_absent_from_complete_snapshot',
      snapshotContract: snapshot.contractName,
      snapshotSchemaVersion: snapshot.schemaVersion,
      snapshotComplete: true,
    },
  };
}

export function validateCompleteFindingSnapshot(snapshot) {
  requireObject(snapshot, 'snapshot');
  if (snapshot.contractName !== FINDING_FEED_CONTRACT) {
    throw new Error(`snapshot must use ${FINDING_FEED_CONTRACT}`);
  }
  if (snapshot.schemaVersion !== FINDING_FEED_SCHEMA_VERSION) {
    throw new Error(`unsupported finding-feed schemaVersion: ${snapshot.schemaVersion}`);
  }
  requireString(snapshot.producer, 'snapshot.producer', 128);
  const generatedAt = instantMillis(snapshot.generatedAt, 'snapshot.generatedAt');
  if (snapshot.snapshotComplete !== true) {
    throw new Error('snapshotComplete must be true before absence can be reconciled');
  }
  requireObject(snapshot.scope, 'snapshot.scope');
  if (!Array.isArray(snapshot.scope.propertyIds)) {
    throw new Error('snapshot.scope.propertyIds must be an array');
  }
  requireString(snapshot.scope.findingKeyPrefix, 'snapshot.scope.findingKeyPrefix', 256);
  if (!Array.isArray(snapshot.findings)) throw new Error('snapshot.findings must be an array');

  const propertyIds = new Set();
  for (const [index, propertyId] of snapshot.scope.propertyIds.entries()) {
    requireString(propertyId, `snapshot.scope.propertyIds[${index}]`, 253);
    if (propertyIds.has(propertyId)) throw new Error(`duplicate propertyId in snapshot scope: ${propertyId}`);
    propertyIds.add(propertyId);
  }

  const identities = new Set();
  for (const [index, finding] of snapshot.findings.entries()) {
    validateObservation(finding);
    if (finding.producer !== snapshot.producer) {
      throw new Error(`snapshot.findings[${index}] producer is outside snapshot scope`);
    }
    if (!propertyIds.has(finding.propertyId)) {
      throw new Error(`snapshot.findings[${index}] propertyId is outside snapshot scope`);
    }
    if (!finding.findingKey.startsWith(snapshot.scope.findingKeyPrefix)) {
      throw new Error(`snapshot.findings[${index}] findingKey is outside snapshot scope`);
    }
    if (instantMillis(finding.observedAt, `snapshot.findings[${index}].observedAt`) > generatedAt) {
      throw new Error(`snapshot.findings[${index}] cannot be observed after snapshot.generatedAt`);
    }
    const identity = identityKey(finding);
    if (identities.has(identity)) throw new Error(`duplicate finding identity in snapshot: ${identity}`);
    identities.add(identity);
  }

  return snapshot;
}

async function validateWorkItemProjection(workItems) {
  if (!Array.isArray(workItems)) throw new Error('workItems must be an array');
  const ids = new Set();
  const identities = new Set();

  for (const [index, item] of workItems.entries()) {
    requireObject(item, `workItems[${index}]`);
    if (item.schemaVersion !== WORK_ITEM_SCHEMA_VERSION) {
      throw new Error(`workItems[${index}] has unsupported schemaVersion: ${item.schemaVersion}`);
    }
    requireString(item.workItemId, `workItems[${index}].workItemId`, 96);
    requireString(item.producer, `workItems[${index}].producer`, 128);
    requireString(item.propertyId, `workItems[${index}].propertyId`, 253);
    requireString(item.findingKey, `workItems[${index}].findingKey`, 512);
    if (!WORK_ITEM_STATES.includes(item.state)) {
      throw new Error(`workItems[${index}] has unsupported state: ${item.state}`);
    }
    validateCanonicalWorkItemProjection(item);
    instantMillis(item.firstSeen, `workItems[${index}].firstSeen`);
    const lastSeen = instantMillis(item.lastSeen, `workItems[${index}].lastSeen`);
    if (lastSeen < instantMillis(item.firstSeen, `workItems[${index}].firstSeen`)) {
      throw new Error(`workItems[${index}] lastSeen cannot precede firstSeen`);
    }
    requireDigest(item.evidenceDigest, `workItems[${index}].evidenceDigest`);
    if (!Number.isInteger(item.occurrenceCount) || item.occurrenceCount < 1) {
      throw new Error(`workItems[${index}].occurrenceCount must be a positive integer`);
    }
    if (!Number.isInteger(item.recurrenceCount) || item.recurrenceCount < 0) {
      throw new Error(`workItems[${index}].recurrenceCount must be a non-negative integer`);
    }
    if (!Number.isInteger(item.lifecycleVersion) || item.lifecycleVersion < 1) {
      throw new Error(`workItems[${index}].lifecycleVersion must be a positive integer`);
    }

    const identity = identityKey(item);
    if (item.stableKey !== identity) {
      throw new Error(`workItems[${index}] stableKey does not match its identity fields`);
    }
    if (item.workItemId !== await deriveWorkItemId(item)) {
      throw new Error(`workItems[${index}] workItemId does not match its identity fields`);
    }
    if (ids.has(item.workItemId) || identities.has(identity)) {
      throw new Error(`duplicate work-item identity in projection: ${identity}`);
    }
    ids.add(item.workItemId);
    identities.add(identity);

    if (item.state === 'RESOLVED') {
      const resolvedAt = instantMillis(item.resolvedAt, `workItems[${index}].resolvedAt`);
      if (resolvedAt < lastSeen) {
        throw new Error(`workItems[${index}] resolvedAt cannot precede lastSeen`);
      }
      requireDigest(item.resolutionEvidenceDigest, `workItems[${index}].resolutionEvidenceDigest`);
    } else if (item.resolvedAt != null || item.resolutionEvidenceDigest != null) {
      throw new Error(`workItems[${index}] non-resolved state cannot retain resolution fields`);
    }
  }
}

function normalizedSnapshotMaterial(snapshot, findings) {
  return {
    contractName: snapshot.contractName,
    schemaVersion: snapshot.schemaVersion,
    producer: snapshot.producer,
    generatedAt: snapshot.generatedAt,
    snapshotComplete: true,
    scope: {
      propertyIds: [...snapshot.scope.propertyIds].sort(),
      findingKeyPrefix: snapshot.scope.findingKeyPrefix,
    },
    findings,
  };
}

export async function reconcileCompleteFindingSnapshot({ workItems, snapshot }) {
  validateCompleteFindingSnapshot(snapshot);
  await validateWorkItemProjection(workItems);

  const findings = [...snapshot.findings].sort((left, right) =>
    compareText(identityKey(left), identityKey(right))
  );
  const snapshotDigest = await digestDocument(normalizedSnapshotMaterial(snapshot, findings));
  const propertyIds = new Set(snapshot.scope.propertyIds);
  const nextByIdentity = new Map(workItems.map(item => [identityKey(item), item]));
  const seen = new Set();
  const events = [];
  const stats = {
    inputWorkItems: workItems.length,
    snapshotFindings: findings.length,
    created: 0,
    updated: 0,
    recurrent: 0,
    replayed: 0,
    resolutionCandidates: 0,
  };

  for (const finding of findings) {
    const identity = identityKey(finding);
    seen.add(identity);
    const existing = nextByIdentity.get(identity);

    if (!existing) {
      const created = await createObservedWorkItem(finding);
      nextByIdentity.set(identity, created);
      events.push(await observationEvent({
        eventType: 'WORK_ITEM_CREATED',
        item: created,
        fromState: null,
        observation: finding,
      }));
      stats.created += 1;
      continue;
    }

    const observedAt = instantMillis(finding.observedAt, 'finding.observedAt');
    const lastSeen = instantMillis(existing.lastSeen, 'existing.lastSeen');
    if (observedAt < lastSeen) {
      throw new Error(`stale finding snapshot for ${existing.workItemId}`);
    }
    if (observedAt === lastSeen) {
      if (!sameObservation(existing, finding)) {
        throw new Error(`conflicting observation at existing lastSeen for ${existing.workItemId}`);
      }
      stats.replayed += 1;
      continue;
    }

    const updated = applyObservation(existing, finding);
    nextByIdentity.set(identity, updated);
    const recurrent = existing.state === 'RESOLVED' && updated.state === 'RECURRENT';
    events.push(await observationEvent({
      eventType: recurrent ? 'WORK_ITEM_RECURRENT' : 'WORK_ITEM_OBSERVED',
      item: updated,
      fromState: existing.state,
      observation: finding,
    }));
    stats.updated += 1;
    if (recurrent) stats.recurrent += 1;
  }

  const generatedAt = instantMillis(snapshot.generatedAt, 'snapshot.generatedAt');
  for (const item of [...workItems].sort((left, right) => compareText(left.workItemId, right.workItemId))) {
    const identity = identityKey(item);
    if (!inSnapshotScope(item, snapshot, propertyIds) || seen.has(identity)) continue;

    const lastSeen = instantMillis(item.lastSeen, 'workItem.lastSeen');
    if (generatedAt < lastSeen) {
      throw new Error(`stale complete snapshot cannot reconcile ${item.workItemId}`);
    }
    if (ABSENCE_TERMINAL_STATES.has(item.state)) continue;
    if (generatedAt === lastSeen) {
      throw new Error(`complete snapshot conflicts with same-time active finding ${item.workItemId}`);
    }

    events.push(await resolutionCandidateEvent({ item, snapshot, snapshotDigest }));
    stats.resolutionCandidates += 1;
  }

  const nextWorkItems = [...nextByIdentity.values()]
    .sort((left, right) => compareText(left.workItemId, right.workItemId));
  events.sort((left, right) =>
    compareText(left.workItemId, right.workItemId) || compareText(left.eventType, right.eventType)
  );

  return {
    contractName: RECONCILIATION_PLAN_CONTRACT,
    schemaVersion: RECONCILIATION_PLAN_SCHEMA_VERSION,
    producer: snapshot.producer,
    snapshotGeneratedAt: snapshot.generatedAt,
    snapshotDigest,
    workItems: nextWorkItems,
    events,
    resolutionCandidates: events.filter(event => event.eventType === 'RESOLUTION_CANDIDATE'),
    stats: {
      ...stats,
      outputWorkItems: nextWorkItems.length,
    },
  };
}
