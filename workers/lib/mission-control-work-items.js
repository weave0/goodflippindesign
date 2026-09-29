/**
 * Canonical GFD Mission Control work-item semantics.
 *
 * This module is intentionally pure: no GitHub, D1, Cloudflare, FWOMPS,
 * deployment, or mutation authority lives here. Producers supply observations;
 * Mission Control owns lifecycle state; FWOMPS may later consume bounded
 * investigation/repair contracts derived from these records.
 */

export const WORK_ITEM_SCHEMA_VERSION = 'gfd-work-item-1';

export const WORK_ITEM_STATES = Object.freeze([
  'OBSERVED',
  'QUALIFIED',
  'INVESTIGATION_READY',
  'INVESTIGATING',
  'DIAGNOSED',
  'REPAIR_READY',
  'REPAIRING',
  'CANDIDATE_READY',
  'VERIFIED',
  'CHANGE_PUBLISHED',
  'DEPLOYED',
  'REVERIFYING',
  'RESOLVED',
  'BLOCKED',
  'NEEDS_HUMAN',
  'DISMISSED',
  'SUPERSEDED',
  'RECURRENT',
]);

export const EFFECT_STATUSES = Object.freeze([
  'PLANNED',
  'COMMITTED',
  'VERIFIED',
  'FAILED',
]);

const ACTIVE_PRIMARY = new Set([
  'OBSERVED',
  'QUALIFIED',
  'INVESTIGATION_READY',
  'INVESTIGATING',
  'DIAGNOSED',
  'REPAIR_READY',
  'REPAIRING',
  'CANDIDATE_READY',
  'VERIFIED',
  'CHANGE_PUBLISHED',
  'DEPLOYED',
  'REVERIFYING',
]);

const TERMINAL = new Set(['RESOLVED', 'DISMISSED', 'SUPERSEDED']);

const PRIMARY_TRANSITIONS = Object.freeze({
  OBSERVED: new Set(['QUALIFIED', 'DISMISSED', 'SUPERSEDED']),
  QUALIFIED: new Set(['INVESTIGATION_READY', 'DISMISSED', 'SUPERSEDED']),
  INVESTIGATION_READY: new Set(['INVESTIGATING', 'DISMISSED', 'SUPERSEDED']),
  INVESTIGATING: new Set(['DIAGNOSED']),
  DIAGNOSED: new Set(['REPAIR_READY', 'REVERIFYING']),
  REPAIR_READY: new Set(['REPAIRING']),
  REPAIRING: new Set(['CANDIDATE_READY']),
  CANDIDATE_READY: new Set(['VERIFIED', 'REPAIRING']),
  VERIFIED: new Set(['CHANGE_PUBLISHED', 'REVERIFYING']),
  CHANGE_PUBLISHED: new Set(['DEPLOYED']),
  DEPLOYED: new Set(['REVERIFYING']),
  REVERIFYING: new Set(['RESOLVED', 'REPAIR_READY']),
  RECURRENT: new Set(['QUALIFIED', 'DISMISSED', 'SUPERSEDED']),
});

const textEncoder = new TextEncoder();

function requireString(value, name, max = 512) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new Error(`${name} must be a non-empty string no longer than ${max} characters`);
  }
  return value;
}

function requireState(value, name = 'state') {
  if (!WORK_ITEM_STATES.includes(value)) throw new Error(`unsupported ${name}: ${value}`);
  return value;
}

function parseInstant(value, name) {
  requireString(value, name, 64);
  if (!/Z$/.test(value)) throw new Error(`${name} must be an explicit UTC timestamp ending in Z`);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error(`${name} must be a valid timestamp`);
  return millis;
}

function canonicalDigest(value, name) {
  requireString(value, name, 128);
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${name} must be sha256:<64 lowercase hex>`);
  }
  return value;
}

function optionalCanonicalDigest(value, name) {
  if (value == null) return null;
  return canonicalDigest(value, name);
}

function stableIdentity({ producer, propertyId, findingKey }) {
  return [
    requireString(producer, 'producer', 128),
    requireString(propertyId, 'propertyId', 253),
    requireString(findingKey, 'findingKey', 512),
  ].join('\0');
}

async function sha256Hex(text) {
  const bytes = await crypto.subtle.digest('SHA-256', textEncoder.encode(text));
  return [...new Uint8Array(bytes)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

export async function deriveWorkItemId(identity) {
  return `gfdwi_v1_${await sha256Hex(stableIdentity(identity))}`;
}

export async function deriveEffectId({ workItemId, effectType, target, candidateDigest = null }) {
  requireString(workItemId, 'workItemId', 96);
  requireString(effectType, 'effectType', 64);
  requireString(target, 'target', 512);
  if (candidateDigest != null) canonicalDigest(candidateDigest, 'candidateDigest');
  const material = [workItemId, effectType, target, candidateDigest || ''].join('\0');
  return `gfdeffect_v1_${await sha256Hex(material)}`;
}

export function validateObservation(observation) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    throw new Error('observation must be an object');
  }
  stableIdentity(observation);
  parseInstant(observation.observedAt, 'observedAt');
  canonicalDigest(observation.evidenceDigest, 'evidenceDigest');

  if (observation.evidenceRevision != null) {
    requireString(observation.evidenceRevision, 'evidenceRevision', 256);
  }
  if (observation.severity != null) {
    requireString(observation.severity, 'severity', 32);
  }
  if (observation.confidence != null) {
    if (typeof observation.confidence !== 'number' || !Number.isFinite(observation.confidence) || observation.confidence < 0 || observation.confidence > 1) {
      throw new Error('confidence must be a finite number in [0, 1]');
    }
  }
  return observation;
}

export async function createObservedWorkItem(observation) {
  validateObservation(observation);
  const workItemId = await deriveWorkItemId(observation);
  return {
    schemaVersion: WORK_ITEM_SCHEMA_VERSION,
    workItemId,
    stableKey: stableIdentity(observation),
    producer: observation.producer,
    propertyId: observation.propertyId,
    findingKey: observation.findingKey,
    repository: null,
    investigationProfile: null,
    verificationPredicate: null,
    firstSeen: observation.observedAt,
    lastSeen: observation.observedAt,
    occurrenceCount: 1,
    recurrenceCount: 0,
    severity: observation.severity ?? null,
    confidence: observation.confidence ?? null,
    evidenceRevision: observation.evidenceRevision ?? null,
    evidenceDigest: observation.evidenceDigest,
    state: 'OBSERVED',
    resumeState: null,
    activeLease: null,
    diagnosis: null,
    repairAuthorityRef: null,
    candidateDigest: null,
    verificationEvidenceDigest: null,
    publishedEffectRef: null,
    deployedEffectRef: null,
    resolutionEvidenceDigest: null,
    resolvedAt: null,
    lifecycleVersion: 1,
  };
}

export function applyObservation(existing, observation) {
  validateObservation(observation);
  if (!existing) throw new Error('existing work item is required; use createObservedWorkItem for first observation');
  requireState(existing.state);

  const identity = stableIdentity(observation);
  if (identity !== existing.stableKey) {
    throw new Error('observation identity does not match the durable work item');
  }

  const observedAt = parseInstant(observation.observedAt, 'observedAt');
  const currentLastSeen = parseInstant(existing.lastSeen, 'lastSeen');
  const next = {
    ...existing,
    lastSeen: observedAt > currentLastSeen ? observation.observedAt : existing.lastSeen,
    occurrenceCount: Number(existing.occurrenceCount || 0) + 1,
    severity: observation.severity ?? existing.severity ?? null,
    confidence: observation.confidence ?? existing.confidence ?? null,
    evidenceRevision: observation.evidenceRevision ?? existing.evidenceRevision ?? null,
    evidenceDigest: observation.evidenceDigest,
    lifecycleVersion: Number(existing.lifecycleVersion || 0) + 1,
  };

  if (existing.state === 'RESOLVED') {
    const resolvedAt = parseInstant(existing.resolvedAt, 'resolvedAt');
    if (observedAt > resolvedAt) {
      next.state = 'RECURRENT';
      next.recurrenceCount = Number(existing.recurrenceCount || 0) + 1;
      next.resolvedAt = null;
      next.resolutionEvidenceDigest = null;
      next.activeLease = null;
      next.resumeState = null;
    }
  }

  return next;
}

function requireQualifiedBindings(item, context) {
  const repository = context.repository ?? item.repository;
  const investigationProfile = context.investigationProfile ?? item.investigationProfile;
  const verificationPredicate = context.verificationPredicate ?? item.verificationPredicate;

  requireString(repository, 'repository', 256);
  requireString(investigationProfile, 'investigationProfile', 128);
  requireString(verificationPredicate, 'verificationPredicate', 1024);

  return { repository, investigationProfile, verificationPredicate };
}

function validateLease(lease, now) {
  if (!lease || typeof lease !== 'object' || Array.isArray(lease)) {
    throw new Error('lease is required');
  }
  requireString(lease.leaseId, 'lease.leaseId', 128);
  requireString(lease.workerId, 'lease.workerId', 128);
  parseInstant(lease.expiresAt, 'lease.expiresAt');
  const nowMs = parseInstant(now, 'now');
  if (parseInstant(lease.expiresAt, 'lease.expiresAt') <= nowMs) {
    throw new Error('lease must be unexpired');
  }
  return lease;
}

export function claimLease(item, lease, now) {
  validateLease(lease, now);
  const current = item.activeLease;
  if (current) {
    const currentExpiry = parseInstant(current.expiresAt, 'activeLease.expiresAt');
    const nowMs = parseInstant(now, 'now');
    if (currentExpiry > nowMs) {
      if (current.leaseId === lease.leaseId && current.workerId === lease.workerId) return item;
      throw new Error('work item already has an unexpired active lease');
    }
  }
  return {
    ...item,
    activeLease: { leaseId: lease.leaseId, workerId: lease.workerId, expiresAt: lease.expiresAt },
    lifecycleVersion: Number(item.lifecycleVersion || 0) + 1,
  };
}

export function releaseLease(item, leaseId) {
  requireString(leaseId, 'leaseId', 128);
  if (!item.activeLease) return item;
  if (item.activeLease.leaseId !== leaseId) throw new Error('cannot release a different active lease');
  return {
    ...item,
    activeLease: null,
    lifecycleVersion: Number(item.lifecycleVersion || 0) + 1,
  };
}

function requireProductionVerification(item, verification) {
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    throw new Error('fresh production verification is required for resolution');
  }
  if (verification.environment !== 'production') throw new Error('resolution verification must be production evidence');
  if (verification.result !== 'pass') throw new Error('resolution verification must pass');
  requireString(verification.predicate, 'productionVerification.predicate', 1024);
  canonicalDigest(verification.evidenceDigest, 'productionVerification.evidenceDigest');
  const observedAt = parseInstant(verification.observedAt, 'productionVerification.observedAt');
  if (observedAt < parseInstant(item.lastSeen, 'lastSeen')) {
    throw new Error('resolution verification must be at least as fresh as the last failing observation');
  }
  if (item.verificationPredicate && verification.predicate !== item.verificationPredicate) {
    throw new Error('resolution verification predicate does not match the work item');
  }
  return verification;
}

export function transitionWorkItem(item, toState, context = {}) {
  requireState(item.state);
  requireState(toState, 'target state');
  if (item.state === toState) throw new Error('lifecycle transition must change state');

  if (toState === 'RECURRENT') {
    throw new Error('RECURRENT is observation-driven; use applyObservation after RESOLVED');
  }

  if (toState === 'BLOCKED' || toState === 'NEEDS_HUMAN') {
    if (!ACTIVE_PRIMARY.has(item.state) && item.state !== 'RECURRENT') {
      throw new Error(`${toState} may only interrupt active lifecycle states`);
    }
    requireString(context.reason, 'reason', 2048);
    return {
      ...item,
      state: toState,
      resumeState: item.state,
      lifecycleVersion: Number(item.lifecycleVersion || 0) + 1,
    };
  }

  if (item.state === 'BLOCKED' || item.state === 'NEEDS_HUMAN') {
    if (!item.resumeState || toState !== item.resumeState) {
      throw new Error('blocked/human work may only resume the exact interrupted state');
    }
    return {
      ...item,
      state: toState,
      resumeState: null,
      lifecycleVersion: Number(item.lifecycleVersion || 0) + 1,
    };
  }

  if (TERMINAL.has(item.state)) {
    throw new Error(`terminal state ${item.state} cannot transition directly`);
  }

  const allowed = PRIMARY_TRANSITIONS[item.state];
  if (!allowed || !allowed.has(toState)) {
    throw new Error(`invalid lifecycle transition: ${item.state} -> ${toState}`);
  }

  let next = { ...item, state: toState, resumeState: null };

  if (toState === 'QUALIFIED') {
    const bindings = requireQualifiedBindings(item, context);
    next = { ...next, ...bindings };
  }

  if (toState === 'INVESTIGATION_READY') {
    requireQualifiedBindings(item, context);
  }

  if (toState === 'INVESTIGATING') {
    if (!item.activeLease) throw new Error('INVESTIGATING requires an active lease');
    const now = requireString(context.now, 'now', 64);
    if (parseInstant(item.activeLease.expiresAt, 'activeLease.expiresAt') <= parseInstant(now, 'now')) {
      throw new Error('INVESTIGATING requires an unexpired active lease');
    }
  }

  if (toState === 'DIAGNOSED') {
    const diagnosis = context.diagnosis;
    if (!diagnosis || typeof diagnosis !== 'object' || Array.isArray(diagnosis)) {
      throw new Error('DIAGNOSED requires an authenticated diagnosis');
    }
    canonicalDigest(diagnosis.resultDigest, 'diagnosis.resultDigest');
    requireString(diagnosis.signatureRef, 'diagnosis.signatureRef', 512);
    next.diagnosis = { resultDigest: diagnosis.resultDigest, signatureRef: diagnosis.signatureRef };
  }

  if (toState === 'REPAIR_READY' || toState === 'REPAIRING') {
    const repairAuthorityRef = context.repairAuthorityRef ?? item.repairAuthorityRef;
    requireString(repairAuthorityRef, 'repairAuthorityRef', 512);
    next.repairAuthorityRef = repairAuthorityRef;
  }

  if (toState === 'CANDIDATE_READY') {
    next.candidateDigest = canonicalDigest(context.candidateDigest, 'candidateDigest');
  }

  if (toState === 'VERIFIED') {
    const candidateDigest = context.candidateDigest ?? item.candidateDigest;
    next.candidateDigest = canonicalDigest(candidateDigest, 'candidateDigest');
    next.verificationEvidenceDigest = canonicalDigest(
      context.verificationEvidenceDigest,
      'verificationEvidenceDigest',
    );
  }

  if (toState === 'CHANGE_PUBLISHED') {
    next.publishedEffectRef = requireString(context.effectRef, 'effectRef', 256);
  }

  if (toState === 'DEPLOYED') {
    next.deployedEffectRef = requireString(context.effectRef, 'effectRef', 256);
  }

  if (toState === 'REVERIFYING') {
    if (item.state === 'DEPLOYED' || item.state === 'CHANGE_PUBLISHED') {
      requireString(item.deployedEffectRef ?? item.publishedEffectRef, 'published/deployed effect reference', 256);
    }
  }

  if (toState === 'RESOLVED') {
    const verification = requireProductionVerification(item, context.productionVerification);
    next.resolutionEvidenceDigest = verification.evidenceDigest;
    next.resolvedAt = verification.observedAt;
    next.activeLease = null;
  }

  next.lifecycleVersion = Number(item.lifecycleVersion || 0) + 1;
  return next;
}

export function validateEffectRecord(effect) {
  if (!effect || typeof effect !== 'object' || Array.isArray(effect)) throw new Error('effect must be an object');
  requireString(effect.effectId, 'effectId', 96);
  requireString(effect.workItemId, 'workItemId', 96);
  requireString(effect.effectType, 'effectType', 64);
  requireString(effect.target, 'target', 512);
  optionalCanonicalDigest(effect.candidateDigest, 'candidateDigest');
  if (!EFFECT_STATUSES.includes(effect.status)) throw new Error(`unsupported effect status: ${effect.status}`);
  return effect;
}

export function registerEffect(existing, proposed) {
  validateEffectRecord(proposed);
  if (!existing) return proposed;
  validateEffectRecord(existing);
  if (existing.effectId !== proposed.effectId) throw new Error('effect identity mismatch');
  const immutable = ['workItemId', 'effectType', 'target', 'candidateDigest'];
  for (const field of immutable) {
    if ((existing[field] ?? null) !== (proposed[field] ?? null)) {
      throw new Error(`effect ${effect.effectId} immutable field changed: ${field}`);
    }
  }
  return existing;
}
