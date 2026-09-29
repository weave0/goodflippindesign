/**
 * Persistence and health-observation bridge for the canonical work-item core.
 *
 * Lifecycle rules live in workers/lib/mission-control-work-items.js.
 * This module stores that projection, journals events, and turns a health
 * sweep into one stable work item. It does not invent repository authority.
 */

import { digestOf } from './fwomps-investigation-adapter.js';
import {
  healthTargetById,
  propertyIdForHealthTarget,
  qualificationGaps,
  resolveEstateBinding,
} from './estate-bindings.js';
import {
  applyObservation,
  claimLease,
  createObservedWorkItem,
  deriveWorkItemId,
  releaseLease,
  transitionWorkItem,
} from './lib/mission-control-work-items.js';

const REPAIR_STATES = new Set([
  'REPAIR_READY',
  'REPAIRING',
  'CANDIDATE_READY',
  'VERIFIED',
  'CHANGE_PUBLISHED',
  'DEPLOYED',
]);

const DISMISSABLE_ON_CLEAR = new Set([
  'OBSERVED',
  'QUALIFIED',
  'INVESTIGATION_READY',
  'RECURRENT',
]);

export class WorkItemError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'WorkItemError';
    this.code = code;
    this.status = status;
  }
}

export function mapWorkItemError(error) {
  if (error instanceof WorkItemError) return error;
  if (error?.name === 'InvestigationAdapterError') {
    return new WorkItemError(error.code || 'investigation_rejected', error.message, 409);
  }
  const message = String(error?.message || '');
  if (/repairAuthorityRef/.test(message)) {
    return new WorkItemError(
      'repair_authority_denied',
      'Repair authority is not granted by investigation or diagnosis',
      403,
    );
  }
  if (/invalid lifecycle|unsupported |must be|required|cannot |does not match|already has|observation identity/.test(message)) {
    return new WorkItemError('illegal_transition', message, 409);
  }
  return null;
}

function resolutionVerification(item, observation) {
  return {
    result: 'pass',
    scope: item.verificationScope,
    profile: item.verificationProfile,
    predicate: item.verificationPredicate,
    evidenceDigest: observation.evidenceDigest,
    observedAt: observation.observedAt,
  };
}

function canResolve(item) {
  return Boolean(item.verificationProfile && item.verificationScope && item.verificationPredicate);
}

export function clearHealthFinding(existing, observation) {
  if (existing.state === 'REVERIFYING' && canResolve(existing)) {
    return transitionWorkItem(existing, 'RESOLVED', {
      resolutionVerification: resolutionVerification(existing, observation),
    });
  }
  if (existing.state === 'DIAGNOSED' && canResolve(existing)) {
    const reverifying = transitionWorkItem(existing, 'REVERIFYING');
    return transitionWorkItem(reverifying, 'RESOLVED', {
      resolutionVerification: resolutionVerification(reverifying, observation),
    });
  }
  if (DISMISSABLE_ON_CLEAR.has(existing.state)) {
    return transitionWorkItem(existing, 'DISMISSED');
  }
  return existing;
}

export async function healthIdentity(marker) {
  const target = healthTargetById(marker.targetId);
  const propertyId = propertyIdForHealthTarget(target);
  if (!marker?.findingKey || !propertyId) {
    throw new WorkItemError('malformed_health_observation', 'health observation is missing its stable finding key', 400);
  }
  const binding = resolveEstateBinding(propertyId);
  return {
    producer: 'health-sweep',
    propertyId: binding?.propertyId || propertyId,
    findingKey: marker.findingKey,
  };
}

export async function recordHealthObservation(store, marker, {
  issueNumber = null,
  status = 'degraded',
  checkedAt,
} = {}) {
  const identity = await healthIdentity(marker);
  const observation = {
    ...identity,
    observedAt: checkedAt,
    evidenceDigest: await digestOf({
      finding_key: identity.findingKey,
      observed_at: checkedAt,
      status,
    }),
    severity: marker.findingKind === 'latency_warning' ? 'medium' : 'high',
  };
  const existing = await store.getByIdentity(identity);
  let next;
  let reason;
  if (status === 'pass') {
    if (!existing) return null;
    next = clearHealthFinding(existing, observation);
    reason = next.state === 'RESOLVED'
      ? 'fresh production verification no longer reports this finding'
      : 'fresh health probe no longer reports this finding';
  } else if (!existing) {
    next = await createObservedWorkItem(observation);
    reason = 'health observation';
  } else {
    next = applyObservation(existing, observation);
    reason = next.state === 'RECURRENT'
      ? 'the same finding key returned after resolution'
      : 'health observation';
  }
  return store.save(next, {
    at: checkedAt,
    from: existing?.state || null,
    to: next.state,
    reason,
    actor: 'health-sweep',
    detail: {
      githubIssue: issueNumber,
      status,
      findingKind: marker.findingKind || null,
    },
  });
}

export function qualifyFromRegistry(item, binding) {
  const gaps = qualificationGaps(binding);
  if (item.state !== 'OBSERVED' && item.state !== 'RECURRENT') {
    throw new WorkItemError('illegal_transition', `${item.state} cannot move to QUALIFIED`, 409);
  }
  if (gaps.length) {
    throw new WorkItemError(
      'qualification_unavailable',
      `Cannot qualify until the governed registry records ${gaps.join(', ')}`,
      409,
    );
  }
  return transitionWorkItem(item, 'QUALIFIED', {
    repository: binding.repository,
    investigationProfile: binding.investigationProfile,
    verificationProfile: binding.verificationProfile,
    verificationScope: binding.verificationScope,
    verificationPredicate: binding.verificationPredicate,
  });
}

export function operatorTransition(item, to, { reason = null } = {}) {
  if (to === 'RESOLVED' || to === 'REVERIFYING' || to === 'RECURRENT') {
    throw new WorkItemError(
      'resolution_requires_fresh_evidence',
      'A work item resolves only from a fresh verification of its registered predicate',
      409,
    );
  }
  if (REPAIR_STATES.has(to)) {
    throw new WorkItemError(
      'repair_authority_denied',
      'Repair authority is not granted by investigation or diagnosis',
      403,
    );
  }
  if (to === 'INVESTIGATION_READY' || to === 'INVESTIGATING' || to === 'DIAGNOSED') {
    throw new WorkItemError(
      'use_specific_transition',
      'That state changes only through the investigation, lease, or result seam',
      409,
    );
  }
  try {
    return transitionWorkItem(item, to, { reason });
  } catch (error) {
    throw mapWorkItemError(error) || error;
  }
}

export function issueInvestigation(item, contract) {
  if (item.state !== 'QUALIFIED') {
    throw new WorkItemError('illegal_transition', 'Only a qualified work item can become investigation-ready', 409);
  }
  if (!contract?.payload || contract.repairAuthority !== false || contract.wireStatus !== 'signed') {
    throw new WorkItemError('unsigned_contract', 'Investigation contract was not signed', 409);
  }
  const next = transitionWorkItem(item, 'INVESTIGATION_READY');
  next.evidenceRevision = contract.payload.evidence.revision;
  return next;
}

export function associateLease(item, lease, at) {
  if (item.state !== 'INVESTIGATION_READY' && item.state !== 'INVESTIGATING') {
    throw new WorkItemError('illegal_transition', 'A lease can attach only after an investigation contract is issued', 409);
  }
  if (!lease?.workerId || !Number.isInteger(lease.attempt) || lease.attempt < 1) {
    throw new WorkItemError('malformed_lease', 'Lease worker and attempt are required', 400);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(lease.leaseTokenDigest || '')) {
    throw new WorkItemError('malformed_lease', 'Lease token digest must be a canonical sha256 digest', 400);
  }
  const requestId = item.investigation?.requestId;
  if (!requestId || lease.requestId !== requestId) {
    throw new WorkItemError('request_mismatch', 'Lease request does not match the signed investigation contract', 409);
  }
  let leased;
  try {
    leased = claimLease(item, {
      leaseId: lease.leaseTokenDigest,
      workerId: lease.workerId,
      expiresAt: lease.expiresAt,
    }, at);
  } catch (error) {
    throw mapWorkItemError(error) || error;
  }
  if (leased.state === 'INVESTIGATING') return leased;
  return transitionWorkItem(leased, 'INVESTIGATING', { now: at });
}

export function acceptInvestigationResult(item, result) {
  if (item.state !== 'INVESTIGATING') {
    throw new WorkItemError('illegal_transition', 'A diagnosis can be accepted only while the work item is under investigation', 409);
  }
  if (result.workItemId !== item.workItemId) {
    throw new WorkItemError('identity_mismatch', 'Result work item does not match the investigation', 409);
  }
  if (result.requestId !== item.investigation?.requestId) {
    throw new WorkItemError('request_mismatch', 'Result request does not match the signed investigation contract', 409);
  }
  if (result.contractDigest !== item.investigation?.digest) {
    throw new WorkItemError('digest_mismatch', 'Result digest does not match the signed investigation contract', 409);
  }
  if (item.activeLease?.workerId && result.workerId !== item.activeLease.workerId) {
    throw new WorkItemError('worker_mismatch', 'Result worker does not own the active lease', 409);
  }
  const released = item.activeLease
    ? releaseLease(item, item.activeLease.leaseId)
    : item;
  return transitionWorkItem(released, 'DIAGNOSED', {
    diagnosis: {
      resultDigest: result.resultDigest,
      signatureRef: `${result.schemaVersion}:${result.workerId}`,
    },
  });
}

function rowToItem(row, events = []) {
  if (!row) return null;
  const related = events.filter((event) => event.work_item_id === row.work_item_id);
  const detailOf = (event) => {
    if (!event?.detail_json) return {};
    try {
      return JSON.parse(event.detail_json);
    } catch {
      return {};
    }
  };
  const latest = [...related].reverse();
  const investigationEvent = latest.find((event) => detailOf(event).investigation);
  const diagnosisEvent = latest.find((event) => detailOf(event).summary);
  const reasonEvent = latest.find((event) => event.to_state === row.lifecycle_state && detailOf(event).reason);
  const githubEvent = latest.find((event) => detailOf(event).githubIssue);
  const investigation = investigationEvent ? detailOf(investigationEvent).investigation : null;
  const binding = resolveEstateBinding(row.property_id);
  const item = {
    schemaVersion: row.schema_version,
    workItemId: row.work_item_id,
    stableKey: row.stable_key,
    producer: row.producer,
    propertyId: row.property_id,
    findingKey: row.finding_key,
    repository: row.repository,
    investigationProfile: row.investigation_profile,
    verificationProfile: row.verification_profile,
    verificationScope: row.verification_scope,
    verificationPredicate: row.verification_predicate,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    occurrenceCount: row.occurrence_count,
    recurrenceCount: row.recurrence_count,
    severity: row.severity,
    confidence: row.confidence,
    evidenceRevision: row.evidence_revision,
    evidenceDigest: row.evidence_digest,
    state: row.lifecycle_state,
    resumeState: row.resume_state,
    activeLease: row.active_lease_id ? {
      leaseId: row.active_lease_id,
      workerId: row.active_worker_id,
      expiresAt: row.lease_expires_at,
    } : null,
    diagnosis: row.diagnosis_result_digest ? {
      resultDigest: row.diagnosis_result_digest,
      signatureRef: row.diagnosis_signature_ref,
      summary: diagnosisEvent ? detailOf(diagnosisEvent).summary : null,
    } : null,
    repairAuthorityRef: row.repair_authority_ref,
    candidateDigest: row.candidate_digest,
    verificationEvidenceDigest: row.verification_evidence_digest,
    publishedEffectRef: row.published_effect_ref,
    deployedEffectRef: row.deployed_effect_ref,
    resolutionEvidenceDigest: row.resolution_evidence_digest,
    resolvedAt: row.resolved_at,
    lifecycleVersion: row.lifecycle_version,
    createdAt: row.created_at,
    investigation,
    blockerReason: ['BLOCKED', 'NEEDS_HUMAN', 'DISMISSED'].includes(row.lifecycle_state)
      ? (reasonEvent ? detailOf(reasonEvent).reason || null : null)
      : null,
    githubIssue: githubEvent ? detailOf(githubEvent).githubIssue : null,
    availableBinding: binding,
    qualificationGaps: qualificationGaps(binding),
  };
  return item;
}

function itemToColumns(item, updatedAt) {
  return {
    work_item_id: item.workItemId,
    schema_version: item.schemaVersion,
    stable_key: item.stableKey,
    producer: item.producer,
    property_id: item.propertyId,
    finding_key: item.findingKey,
    repository: item.repository,
    investigation_profile: item.investigationProfile,
    verification_profile: item.verificationProfile,
    verification_scope: item.verificationScope,
    verification_predicate: item.verificationPredicate,
    first_seen: item.firstSeen,
    last_seen: item.lastSeen,
    occurrence_count: item.occurrenceCount,
    recurrence_count: item.recurrenceCount || 0,
    severity: item.severity,
    confidence: item.confidence,
    evidence_revision: item.evidenceRevision,
    evidence_digest: item.evidenceDigest,
    lifecycle_state: item.state,
    resume_state: item.resumeState,
    active_lease_id: item.activeLease?.leaseId || null,
    active_worker_id: item.activeLease?.workerId || null,
    lease_expires_at: item.activeLease?.expiresAt || null,
    diagnosis_result_digest: item.diagnosis?.resultDigest || null,
    diagnosis_signature_ref: item.diagnosis?.signatureRef || null,
    repair_authority_ref: item.repairAuthorityRef,
    candidate_digest: item.candidateDigest,
    verification_evidence_digest: item.verificationEvidenceDigest,
    published_effect_ref: item.publishedEffectRef,
    deployed_effect_ref: item.deployedEffectRef,
    resolution_evidence_digest: item.resolutionEvidenceDigest,
    resolved_at: item.resolvedAt,
    lifecycle_version: item.lifecycleVersion,
    created_at: item.createdAt || item.firstSeen,
    updated_at: updatedAt,
  };
}

const UPSERT = `
  INSERT INTO mc_work_items (
    work_item_id, schema_version, stable_key, producer, property_id, finding_key,
    repository, investigation_profile, verification_profile, verification_scope, verification_predicate,
    first_seen, last_seen, occurrence_count, recurrence_count,
    severity, confidence, evidence_revision, evidence_digest,
    lifecycle_state, resume_state,
    active_lease_id, active_worker_id, lease_expires_at,
    diagnosis_result_digest, diagnosis_signature_ref,
    repair_authority_ref, candidate_digest, verification_evidence_digest,
    published_effect_ref, deployed_effect_ref,
    resolution_evidence_digest, resolved_at,
    lifecycle_version, created_at, updated_at
  ) VALUES (${Array.from({ length: 36 }, () => '?').join(', ')})
  ON CONFLICT(work_item_id) DO UPDATE SET
    schema_version = excluded.schema_version,
    stable_key = excluded.stable_key,
    producer = excluded.producer,
    property_id = excluded.property_id,
    finding_key = excluded.finding_key,
    repository = excluded.repository,
    investigation_profile = excluded.investigation_profile,
    verification_profile = excluded.verification_profile,
    verification_scope = excluded.verification_scope,
    verification_predicate = excluded.verification_predicate,
    first_seen = excluded.first_seen,
    last_seen = excluded.last_seen,
    occurrence_count = excluded.occurrence_count,
    recurrence_count = excluded.recurrence_count,
    severity = excluded.severity,
    confidence = excluded.confidence,
    evidence_revision = excluded.evidence_revision,
    evidence_digest = excluded.evidence_digest,
    lifecycle_state = excluded.lifecycle_state,
    resume_state = excluded.resume_state,
    active_lease_id = excluded.active_lease_id,
    active_worker_id = excluded.active_worker_id,
    lease_expires_at = excluded.lease_expires_at,
    diagnosis_result_digest = excluded.diagnosis_result_digest,
    diagnosis_signature_ref = excluded.diagnosis_signature_ref,
    repair_authority_ref = excluded.repair_authority_ref,
    candidate_digest = excluded.candidate_digest,
    verification_evidence_digest = excluded.verification_evidence_digest,
    published_effect_ref = excluded.published_effect_ref,
    deployed_effect_ref = excluded.deployed_effect_ref,
    resolution_evidence_digest = excluded.resolution_evidence_digest,
    resolved_at = excluded.resolved_at,
    lifecycle_version = excluded.lifecycle_version,
    updated_at = excluded.updated_at
`;

function columnValues(columns) {
  return [
    columns.work_item_id, columns.schema_version, columns.stable_key, columns.producer, columns.property_id, columns.finding_key,
    columns.repository, columns.investigation_profile, columns.verification_profile, columns.verification_scope, columns.verification_predicate,
    columns.first_seen, columns.last_seen, columns.occurrence_count, columns.recurrence_count,
    columns.severity, columns.confidence, columns.evidence_revision, columns.evidence_digest,
    columns.lifecycle_state, columns.resume_state,
    columns.active_lease_id, columns.active_worker_id, columns.lease_expires_at,
    columns.diagnosis_result_digest, columns.diagnosis_signature_ref,
    columns.repair_authority_ref, columns.candidate_digest, columns.verification_evidence_digest,
    columns.published_effect_ref, columns.deployed_effect_ref,
    columns.resolution_evidence_digest, columns.resolved_at,
    columns.lifecycle_version, columns.created_at, columns.updated_at,
  ];
}

async function loadEvents(db, workItemId = null) {
  const query = workItemId
    ? await db.prepare('SELECT * FROM mc_work_item_events WHERE work_item_id = ? ORDER BY occurred_at, event_id').bind(workItemId).all()
    : await db.prepare('SELECT * FROM mc_work_item_events ORDER BY occurred_at, event_id').all();
  return query.results || [];
}

export function createD1WorkItemStore(db) {
  return {
    async get(id) {
      const row = await db.prepare('SELECT * FROM mc_work_items WHERE work_item_id = ?').bind(id).first();
      if (!row) return null;
      return rowToItem(row, await loadEvents(db, id));
    },
    async getByIdentity(identity) {
      const row = await db.prepare(
        'SELECT * FROM mc_work_items WHERE producer = ? AND property_id = ? AND finding_key = ?',
      ).bind(identity.producer, identity.propertyId, identity.findingKey).first();
      if (!row) return null;
      return rowToItem(row, await loadEvents(db, row.work_item_id));
    },
    async list() {
      const { results } = await db.prepare('SELECT * FROM mc_work_items ORDER BY updated_at DESC').all();
      const events = await loadEvents(db);
      return (results || []).map((row) => rowToItem(row, events));
    },
    async save(item, event = null) {
      const at = event?.at || item.lastSeen;
      const columns = itemToColumns(item, at);
      const statements = [
        db.prepare(UPSERT).bind(...columnValues(columns)),
      ];
      if (event) {
        const eventId = `evt_${item.workItemId}_${item.lifecycleVersion}_${event.to || 'note'}_${at}`;
        const detail = { ...(event.detail || {}), reason: event.reason || null };
        statements.push(db.prepare(`
          INSERT INTO mc_work_item_events (
            event_id, work_item_id, event_type, from_state, to_state, occurred_at,
            actor_type, actor_id, evidence_digest, detail_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(event_id) DO NOTHING
        `).bind(
          eventId,
          item.workItemId,
          event.to && event.to !== event.from ? 'transition' : 'observation',
          event.from,
          event.to || item.state,
          at,
          'runtime',
          event.actor || 'mission-control',
          item.evidenceDigest,
          JSON.stringify(detail),
        ));
      }
      if (item.activeLease) {
        statements.push(db.prepare(`
          INSERT INTO mc_work_item_leases (
            lease_id, work_item_id, worker_id, issued_at, expires_at, released_at, release_reason
          ) VALUES (?, ?, ?, ?, ?, NULL, NULL)
          ON CONFLICT(lease_id) DO UPDATE SET
            expires_at = excluded.expires_at,
            released_at = NULL,
            release_reason = NULL
        `).bind(
          item.activeLease.leaseId,
          item.workItemId,
          item.activeLease.workerId,
          at,
          item.activeLease.expiresAt,
        ));
      }
      await db.batch(statements);
      return this.get(item.workItemId);
    },
  };
}

export async function ensureWorkItemSchema(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS mc_work_items (
      work_item_id TEXT PRIMARY KEY,
      schema_version TEXT NOT NULL,
      stable_key TEXT NOT NULL UNIQUE,
      producer TEXT NOT NULL,
      property_id TEXT NOT NULL,
      finding_key TEXT NOT NULL,
      repository TEXT,
      investigation_profile TEXT,
      verification_profile TEXT,
      verification_scope TEXT,
      verification_predicate TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      recurrence_count INTEGER NOT NULL DEFAULT 0,
      severity TEXT,
      confidence REAL,
      evidence_revision TEXT,
      evidence_digest TEXT NOT NULL,
      lifecycle_state TEXT NOT NULL,
      resume_state TEXT,
      active_lease_id TEXT,
      active_worker_id TEXT,
      lease_expires_at TEXT,
      diagnosis_result_digest TEXT,
      diagnosis_signature_ref TEXT,
      repair_authority_ref TEXT,
      candidate_digest TEXT,
      verification_evidence_digest TEXT,
      published_effect_ref TEXT,
      deployed_effect_ref TEXT,
      resolution_evidence_digest TEXT,
      resolved_at TEXT,
      lifecycle_version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mc_work_item_events (
      event_id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      from_state TEXT,
      to_state TEXT,
      occurred_at TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      actor_id TEXT,
      evidence_digest TEXT,
      detail_json TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mc_effects (
      effect_id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL,
      effect_type TEXT NOT NULL,
      target TEXT NOT NULL,
      candidate_digest TEXT,
      status TEXT NOT NULL,
      provider_ref TEXT,
      created_at TEXT NOT NULL,
      committed_at TEXT,
      verified_at TEXT,
      last_error TEXT
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS mc_work_item_leases (
      lease_id TEXT PRIMARY KEY,
      work_item_id TEXT NOT NULL,
      worker_id TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      released_at TEXT,
      release_reason TEXT
    )`),
  ]);
}

export { deriveWorkItemId };
