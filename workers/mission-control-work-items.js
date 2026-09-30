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
  validateWorkItemProjection,
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

// A health observation is idempotent evidence, so on a version conflict it is deliberately
// re-applied onto the freshly loaded item (never onto the stale copy, never last-write-wins).
export const HEALTH_CONFLICT_RETRIES = 3;

export async function recordHealthObservation(store, marker, options = {}) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await recordHealthObservationOnce(store, marker, options);
    } catch (error) {
      if (error?.code !== 'version_conflict' || attempt >= HEALTH_CONFLICT_RETRIES) throw error;
    }
  }
}

async function recordHealthObservationOnce(store, marker, {
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

/**
 * Explicit, proof-gated recovery for the single-attempt bridge. Only an INVESTIGATING item whose
 * active lease has provably expired (expiresAt <= at) may be abandoned. It releases exactly that
 * lease and returns the item to QUALIFIED -- the state from which a *fresh* signed contract can
 * be issued. It never reuses the old contract/request and never creates a second attempt.
 */
export function abandonExpiredInvestigation(item, at = new Date().toISOString()) {
  if (item.state !== 'INVESTIGATING' || !item.activeLease) {
    throw new WorkItemError('illegal_transition', 'Only an item under investigation with an active lease can be abandoned', 409);
  }
  const expiry = Date.parse(item.activeLease.expiresAt);
  if (!Number.isFinite(expiry) || expiry > Date.parse(at)) {
    throw new WorkItemError('lease_not_expired', 'The active lease has not expired; it cannot be abandoned yet', 409);
  }
  const released = releaseLease(item, item.activeLease.leaseId);
  const next = {
    ...released,
    state: 'QUALIFIED',
    resumeState: null,
    lifecycleVersion: Number(released.lifecycleVersion || 0) + 1,
  };
  try {
    validateWorkItemProjection(next, { now: at });
  } catch (error) {
    throw new WorkItemError('illegal_transition', error.message, 409);
  }
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
  if (lease.attempt > BRIDGE_MAX_ATTEMPTS || (item.attemptsIssued ?? 0) >= BRIDGE_MAX_ATTEMPTS) {
    throw new WorkItemError(
      'attempt_exhausted',
      'This signed contract has already been leased; a retry needs a fresh signed contract',
      409,
    );
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

/**
 * The first GFD -> FWOMPS bridge is deliberately bounded to ONE attempt per signed
 * contract. GFD cannot yet distinguish an admitted-attempt resume from an
 * expired/abandoned attempt, a greater attempt after durable abandonment, or a
 * stale prior-attempt result, so it does not pretend to: once a lease has been
 * issued for a request, no second lease is ever issued for it, even after the
 * first expires. A retry requires a fresh signed contract (new request id).
 */
export const BRIDGE_MAX_ATTEMPTS = 1;

/**
 * Every item read from the store carries the lifecycle version it was loaded at, under this
 * (enumerable, symbol-keyed) marker. Object spread copies it, so any item derived from a loaded
 * one -- however many lifecycle functions it passes through -- is saved only against that version.
 * An item that was never loaded can only INSERT. There is no unguarded update path.
 */
export const LOADED_VERSION = Symbol.for('gfd.mc.workItem.loadedVersion');

export function acceptInvestigationResult(item, result, at = new Date().toISOString()) {
  if (result?.repairAuthority !== false) {
    throw new WorkItemError('repair_authority_denied', 'An investigation result grants no repair authority', 403);
  }
  if (result.workItemId !== item.workItemId || result.propertyId !== item.propertyId
    || result.repository !== item.repository) {
    throw new WorkItemError('identity_mismatch', 'Result identity does not match the investigation', 409);
  }
  const investigation = item.investigation;
  if (result.requestId !== investigation?.requestId) {
    throw new WorkItemError('request_mismatch', 'Result request does not match the signed investigation contract', 409);
  }
  if (result.contractDigest !== investigation?.digest
    || result.diagnosticDigest !== investigation?.diagnosticDigest
    || result.snapshotDigest !== investigation?.snapshotDigest
    || result.evidenceRevision !== item.evidenceRevision) {
    throw new WorkItemError('digest_mismatch', 'Result does not match the signed investigation contract', 409);
  }
  if (item.state === 'DIAGNOSED') {
    if (result.resultDigest === item.diagnosis?.resultDigest) {
      return { ...item, skipEvent: true };
    }
    throw new WorkItemError('result_conflict', 'A different result is already recorded for this investigation', 409);
  }
  if (item.state !== 'INVESTIGATING') {
    throw new WorkItemError('illegal_transition', 'A diagnosis can be accepted only while the work item is under investigation', 409);
  }
  if (!item.activeLease || result.workerId !== item.activeLease.workerId) {
    throw new WorkItemError('worker_mismatch', 'Result worker does not own the active lease', 409);
  }
  const leaseExpiry = Date.parse(item.activeLease.expiresAt);
  if (!Number.isFinite(leaseExpiry) || leaseExpiry <= Date.parse(at)) {
    // FWOMPS never uploads a result past its lease (abandoned_result_expired); neither does GFD accept one.
    throw new WorkItemError('lease_expired', 'The lease expired before the result arrived', 409);
  }
  if (result.leaseTokenDigest !== item.activeLease.leaseId) {
    throw new WorkItemError('lease_mismatch', 'Result lease does not match the active lease', 409);
  }
  if (!Number.isInteger(item.activeLease.attempt) || result.attempt !== item.activeLease.attempt) {
    throw new WorkItemError('attempt_mismatch', 'Result attempt does not match the active lease', 409);
  }
  const released = releaseLease(item, item.activeLease.leaseId);
  return transitionWorkItem(released, 'DIAGNOSED', {
    diagnosis: {
      resultDigest: result.resultDigest,
      signatureRef: `${result.schemaVersion}:${result.keyId}`,
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
  const diagnosisEvent = latest.find((event) => detailOf(event).summary && detailOf(event).outcome);
  const leaseDetail = latest.map(detailOf).find((detail) => detail.lease)?.lease;
  const abandonmentEvent = latest.find((event) => detailOf(event).abandonment);
  const reasonEvent = latest.find((event) => event.to_state === row.lifecycle_state && detailOf(event).reason);
  const githubEvent = latest.find((event) => detailOf(event).githubIssue);
  const abandonedAfterIssue = Boolean(
    abandonmentEvent && investigationEvent
    && related.indexOf(abandonmentEvent) > related.indexOf(investigationEvent),
  );
  // After an abandonment the issued contract is dead history, not a live investigation.
  const investigation = investigationEvent && !abandonedAfterIssue
    ? detailOf(investigationEvent).investigation
    : null;
  // Attempts are counted per signed contract (request id), never across contracts.
  const attemptsIssued = investigation
    ? related.filter((event) => detailOf(event).lease && detailOf(event).requestId === investigation.requestId).length
    : 0;
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
      attempt: leaseDetail?.leaseTokenDigest === row.active_lease_id ? leaseDetail.attempt : null,
    } : null,
    diagnosis: row.diagnosis_result_digest ? {
      resultDigest: row.diagnosis_result_digest,
      signatureRef: row.diagnosis_signature_ref,
      summary: diagnosisEvent ? detailOf(diagnosisEvent).summary : null,
      outcome: diagnosisEvent ? detailOf(diagnosisEvent).outcome : null,
      stopReason: diagnosisEvent ? detailOf(diagnosisEvent).stopReason ?? null : null,
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
    attemptsIssued,
    abandonment: abandonmentEvent ? detailOf(abandonmentEvent).abandonment : null,
    investigation,
    blockerReason: ['BLOCKED', 'NEEDS_HUMAN', 'DISMISSED'].includes(row.lifecycle_state)
      ? (reasonEvent ? detailOf(reasonEvent).reason || null : null)
      : null,
    githubIssue: githubEvent ? detailOf(githubEvent).githubIssue : null,
    availableBinding: binding,
    qualificationGaps: qualificationGaps(binding),
  };
  item[LOADED_VERSION] = Number(row.lifecycle_version);
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

// Compare-and-swap variant: the update applies only if the stored version is the one the
// caller loaded. Stale or reordered writers change zero rows and write nothing else.
const UPSERT_CAS = `${UPSERT} WHERE mc_work_items.lifecycle_version = ?`;
// An item that was never loaded may only create the row; it can never update an existing one.
const UPSERT_INSERT_ONLY = `${UPSERT} WHERE 0`;

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
    async save(item, event = null, options = {}) {
      const at = event?.at || item.lastSeen;
      const columns = itemToColumns(item, at);
      const expected = Number.isInteger(options?.expectedVersion)
        ? options.expectedVersion
        : (Number.isInteger(item[LOADED_VERSION]) ? item[LOADED_VERSION] : null);
      const statements = [
        expected === null
          ? db.prepare(UPSERT_INSERT_ONLY).bind(...columnValues(columns))
          : db.prepare(UPSERT_CAS).bind(...columnValues(columns), expected),
      ];
      if (event) {
        const eventId = `evt_${item.workItemId}_${item.lifecycleVersion}_${event.to || 'note'}_${at}`;
        const detail = { ...(event.detail || {}), reason: event.reason || null };
        // The event is written only if the compare-and-swap above changed a row.
        statements.push(db.prepare(`
          INSERT INTO mc_work_item_events (
            event_id, work_item_id, event_type, from_state, to_state, occurred_at,
            actor_type, actor_id, evidence_digest, detail_json
          ) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
          WHERE changes() = 1
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
        // The lease row is written only if the stored item really holds this lease now.
        statements.push(db.prepare(`
          INSERT INTO mc_work_item_leases (
            lease_id, work_item_id, worker_id, issued_at, expires_at, released_at, release_reason
          ) SELECT ?, ?, ?, ?, ?, NULL, NULL
          WHERE EXISTS (
            SELECT 1 FROM mc_work_items WHERE work_item_id = ? AND active_lease_id = ?
          )
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
          item.workItemId,
          item.activeLease.leaseId,
        ));
      }
      // Durably release any lease of this item that is no longer its active one (only if the swap applied).
      statements.push(db.prepare(`
        UPDATE mc_work_item_leases
        SET released_at = ?, release_reason = ?
        WHERE work_item_id = ? AND released_at IS NULL
          AND lease_id IS NOT (SELECT active_lease_id FROM mc_work_items WHERE work_item_id = ?)
          AND EXISTS (SELECT 1 FROM mc_work_items WHERE work_item_id = ? AND lifecycle_version = ?)
      `).bind(
        at,
        event?.detail?.abandonment?.reason || (event?.to === 'DIAGNOSED' ? 'result_accepted' : 'released'),
        item.workItemId,
        item.workItemId,
        item.workItemId,
        item.lifecycleVersion,
      ));
      const results = await db.batch(statements);
      if (Number(results?.[0]?.meta?.changes ?? 0) !== 1) {
        throw new WorkItemError(
          'version_conflict',
          'The work item changed concurrently; reload and retry',
          409,
        );
      }
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
