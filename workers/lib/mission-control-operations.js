/**
 * Read-only Mission Control operational projection.
 *
 * Same records and the same `now` always produce the same document. Nothing
 * here writes, dispatches, or grants repair, deployment, or execution authority.
 *
 * Attention order is severity, then explicit human need, then failure or
 * blocker, then age, then recurrence and attempt count, then work-item id.
 * Evidence and unchanged windows are 24h, the estate probe expiredAfterHours
 * already used by Mission Control. Effect visibility is 60s, the gfd-effect-1
 * claim window: a planned effect is past visibility when its last attempt is
 * at least that old. Recently resolved means a terminal timestamp inside 7 days.
 */

import {
  EFFECT_STATUSES,
  WORK_ITEM_SCHEMA_VERSION,
  WORK_ITEM_STATES,
} from './mission-control-work-items.js';

export const OPERATIONS_SCHEMA_VERSION = 'gfd-mission-control-operations-1';
export const EFFECT_SCHEMA_VERSION = 'gfd-effect-1';
export const READINESS_CONTRACT = 'gfd-estate-operating-readiness';
export const READINESS_SCHEMA_VERSION = '1.0.0';

export const ATTENTION_ORDER = Object.freeze([
  'severity',
  'explicit_human',
  'failure_or_blocker',
  'age',
  'recurrence_then_attempts',
  'work_item_id',
]);

export const EVIDENCE_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const UNCHANGED_AFTER_MS = 24 * 60 * 60 * 1000;
export const EFFECT_VISIBILITY_MS = 60 * 1000;
export const EFFECT_PLANNED_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const RECENTLY_RESOLVED_WITHIN_MS = 7 * 24 * 60 * 60 * 1000;

const SEVERITY_RANK = new Map([
  ['critical', 0],
  ['high', 1],
  ['warning', 2],
  ['medium', 2],
  ['low', 3],
  ['info', 4],
]);

const TERMINAL = new Set(['RESOLVED', 'DISMISSED', 'SUPERSEDED']);
const REVERIFICATION_WAIT = new Set(['DIAGNOSED', 'DEPLOYED']);
const REVERIFICATION_STATES = new Set(['DIAGNOSED', 'DEPLOYED', 'REVERIFYING']);
const BINDING_FIELDS = [
  'repository',
  'investigationProfile',
  'verificationProfile',
  'verificationScope',
  'verificationPredicate',
];
const REFUSAL_EVENT_TYPES = new Set([
  'result_refused',
  'result_rejected',
  'investigation_result_refused',
]);
const HUMAN_REASONS = new Set([
  'needs_human',
  'blocked_needs_human',
  'failed_effect',
  'qualification_gap',
  'awaiting_qualification',
  'awaiting_investigation',
  'awaiting_dispatch',
  'lifecycle_waiting',
]);
const STALE_REASONS = new Set([
  'expired_lease',
  'stale_evidence',
  'effect_beyond_visibility',
  'effect_planned_too_long',
  'unchanged',
]);
const NEXT_ACTION = [
  ['needs_human', 'Operator decision required before this lifecycle can resume.'],
  ['failed_effect', 'A durable effect failed. Inspect the receipt. This projection cannot retry it.'],
  ['qualification_gap', 'Governed bindings are missing on the work item. The item cannot invent them.'],
  ['blocked_needs_human', 'Blocked, with no live lease or in-flight effect. A person has to clear it.'],
  ['awaiting_qualification', 'Observed work is waiting for an operator to qualify it.'],
  ['awaiting_investigation', 'Qualified work has no durable investigation effect yet.'],
  ['awaiting_dispatch', 'Investigation is ready and no durable dispatch effect is recorded.'],
  ['expired_lease', 'The lease expired. A later attempt needs a new lease.'],
  ['effect_beyond_visibility', 'A planned effect is past the visibility window and still uncommitted.'],
  ['effect_planned_too_long', 'A planned effect has had no attempt inside the planning window.'],
  ['stale_evidence', 'The last observation is older than the evidence window.'],
  ['unchanged', 'No lifecycle write has been recorded inside the unchanged window.'],
  ['awaiting_reverification', 'Diagnosed. It resolves only when a production observation strictly newer than the diagnosis passes its predicate.'],
  ['lifecycle_waiting', 'No durable automation is recorded for this state. Nothing here will execute it.'],
];

export class OperationsContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OperationsContractError';
    this.code = 'unsupported_contract';
  }
}

export function assertOperationsContract(document) {
  if (!document || document.schemaVersion !== OPERATIONS_SCHEMA_VERSION) {
    throw new OperationsContractError(
      `unsupported operations schema: ${document?.schemaVersion ?? 'missing'}`,
    );
  }
  return document;
}

function unavailable(reason, extra = {}) {
  return { available: false, reason, ...extra };
}

function requireInstant(value, name) {
  if (typeof value !== 'string' || !value.endsWith('Z')) {
    throw new OperationsContractError(`${name} must be an explicit UTC timestamp ending in Z`);
  }
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new OperationsContractError(`${name} must be a valid timestamp`);
  }
  return { text: new Date(millis).toISOString(), millis };
}

function optionalInstant(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !value.endsWith('Z')) return undefined;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return undefined;
  return { text: new Date(millis).toISOString(), millis };
}

function sourceArray(input, key) {
  if (input[key] == null) return { supplied: false, rows: [] };
  if (!Array.isArray(input[key])) {
    throw new OperationsContractError(`${key} must be an array when supplied`);
  }
  return { supplied: true, rows: input[key] };
}

function text(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function pick(row, camel, snake) {
  if (row[camel] !== undefined) return row[camel];
  return row[snake];
}

function blankBindings(item) {
  return BINDING_FIELDS.filter((field) => !text(item[field]));
}

function signature(value) {
  return JSON.stringify(value);
}

function dedupe(rows, idOf, signatureOf, label, limitations) {
  const groups = new Map();
  for (const row of rows) {
    const id = idOf(row);
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(row);
  }
  const kept = [];
  const excluded = [];
  for (const [id, group] of groups) {
    const signatures = new Set(group.map(signatureOf));
    if (signatures.size === 1) {
      kept.push(group[0]);
    } else {
      excluded.push({ id, reason: 'conflicting_duplicate' });
      limitations.push(`${label} ${id} had conflicting duplicates and was excluded`);
    }
  }
  kept.sort((left, right) => idOf(left).localeCompare(idOf(right)));
  excluded.sort((left, right) => String(left.id).localeCompare(String(right.id)));
  return { kept, excluded };
}

function normalizeWorkItem(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: 'malformed' };
  const schemaVersion = pick(row, 'schemaVersion', 'schema_version');
  if (schemaVersion !== WORK_ITEM_SCHEMA_VERSION) return { error: 'unsupported_schema', schemaVersion: schemaVersion ?? null };
  const workItemId = text(pick(row, 'workItemId', 'work_item_id'));
  const state = pick(row, 'state', 'lifecycle_state');
  if (!workItemId || !WORK_ITEM_STATES.includes(state)) return { error: 'malformed' };
  const recurrenceCount = pick(row, 'recurrenceCount', 'recurrence_count');
  if (recurrenceCount != null && (!Number.isInteger(recurrenceCount) || recurrenceCount < 0)) {
    return { error: 'malformed' };
  }
  const active = pick(row, 'activeLease', 'active_lease');
  let activeLease = null;
  if (active && typeof active === 'object' && !Array.isArray(active)) {
    activeLease = {
      leaseId: text(pick(active, 'leaseId', 'lease_id') ?? pick(row, 'activeLeaseId', 'active_lease_id')),
      workerId: text(pick(active, 'workerId', 'worker_id') ?? pick(row, 'activeWorkerId', 'active_worker_id')),
      expiresAt: optionalInstant(pick(active, 'expiresAt', 'expires_at') ?? pick(row, 'leaseExpiresAt', 'lease_expires_at')),
    };
  } else if (text(pick(row, 'activeLeaseId', 'active_lease_id'))) {
    activeLease = {
      leaseId: text(pick(row, 'activeLeaseId', 'active_lease_id')),
      workerId: text(pick(row, 'activeWorkerId', 'active_worker_id')),
      expiresAt: optionalInstant(pick(row, 'leaseExpiresAt', 'lease_expires_at')),
    };
  }
  if (activeLease && activeLease.expiresAt === undefined) return { error: 'malformed' };
  const updatedAt = optionalInstant(pick(row, 'updatedAt', 'updated_at'));
  const lastSeen = optionalInstant(pick(row, 'lastSeen', 'last_seen'));
  const firstSeen = optionalInstant(pick(row, 'firstSeen', 'first_seen'));
  const resolvedAt = optionalInstant(pick(row, 'resolvedAt', 'resolved_at'));
  if ([updatedAt, lastSeen, firstSeen, resolvedAt].includes(undefined)) return { error: 'malformed' };
  return {
    item: {
      schemaVersion,
      workItemId,
      propertyId: text(pick(row, 'propertyId', 'property_id')),
      findingKey: text(pick(row, 'findingKey', 'finding_key')),
      producer: text(pick(row, 'producer', 'producer')),
      state,
      resumeState: text(pick(row, 'resumeState', 'resume_state')),
      severity: text(pick(row, 'severity', 'severity')),
      recurrenceCount: recurrenceCount == null ? null : recurrenceCount,
      occurrenceCount: Number.isInteger(pick(row, 'occurrenceCount', 'occurrence_count')) ? pick(row, 'occurrenceCount', 'occurrence_count') : null,
      diagnosisResultDigest: text(row.diagnosis?.resultDigest ?? row.diagnosis_result_digest),
      repository: text(pick(row, 'repository', 'repository')),
      investigationProfile: text(pick(row, 'investigationProfile', 'investigation_profile')),
      verificationProfile: text(pick(row, 'verificationProfile', 'verification_profile')),
      verificationScope: text(pick(row, 'verificationScope', 'verification_scope')),
      verificationPredicate: text(pick(row, 'verificationPredicate', 'verification_predicate')),
      evidenceDigest: text(pick(row, 'evidenceDigest', 'evidence_digest')),
      evidenceRevision: text(pick(row, 'evidenceRevision', 'evidence_revision')),
      resolutionEvidenceDigest: text(pick(row, 'resolutionEvidenceDigest', 'resolution_evidence_digest')),
      firstSeen,
      lastSeen,
      updatedAt,
      resolvedAt,
      activeLease,
    },
  };
}

function normalizeEffect(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: 'malformed' };
  const schemaVersion = row.schemaVersion !== undefined ? row.schemaVersion : row.schema_version;
  const legacy = schemaVersion == null;
  if (!legacy && schemaVersion !== EFFECT_SCHEMA_VERSION) {
    return { error: 'unsupported_schema', schemaVersion };
  }
  const effectId = text(pick(row, 'effectId', 'effect_id'));
  const workItemId = text(pick(row, 'workItemId', 'work_item_id'));
  const status = pick(row, 'status', 'status');
  if (!effectId || !workItemId || !EFFECT_STATUSES.includes(status)) return { error: 'malformed' };
  const attemptValue = pick(row, 'attemptCount', 'attempt_count');
  if (attemptValue != null && (!Number.isInteger(attemptValue) || attemptValue < 0)) return { error: 'malformed' };
  const createdAt = optionalInstant(pick(row, 'createdAt', 'created_at'));
  const lastAttemptAt = optionalInstant(pick(row, 'lastAttemptAt', 'last_attempt_at'));
  const committedAt = optionalInstant(pick(row, 'committedAt', 'committed_at'));
  if ([createdAt, lastAttemptAt, committedAt].includes(undefined)) return { error: 'malformed' };
  return {
    effect: {
      effectId,
      workItemId,
      effectType: text(pick(row, 'effectType', 'effect_type')),
      status,
      schemaVersion: legacy ? null : schemaVersion,
      legacy,
      attemptCount: attemptValue == null ? null : attemptValue,
      createdAt,
      lastAttemptAt,
      committedAt,
      terminalReason: text(pick(row, 'terminalReason', 'terminal_reason') ?? pick(row, 'lastError', 'last_error')),
    },
  };
}

function eventVerdict(row) {
  const raw = row.detail ?? row.detail_json;
  let detail = raw;
  if (typeof raw === 'string') {
    try {
      detail = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const verdict = detail && typeof detail === 'object' ? detail.reverification : null;
  if (!verdict || typeof verdict !== 'object' || !text(verdict.result)) return null;
  return {
    result: text(verdict.result),
    reason: text(verdict.reason),
    observedAt: text(verdict.observedAt),
    evidenceDigest: text(verdict.evidenceDigest),
  };
}

function normalizeEvent(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: 'malformed' };
  const eventId = text(pick(row, 'eventId', 'event_id'));
  const workItemId = text(pick(row, 'workItemId', 'work_item_id'));
  if (!eventId || !workItemId) return { error: 'malformed' };
  const occurredAt = optionalInstant(pick(row, 'occurredAt', 'occurred_at'));
  if (occurredAt === undefined) return { error: 'malformed' };
  return {
    event: {
      eventId,
      workItemId,
      eventType: text(pick(row, 'eventType', 'event_type')),
      fromState: text(pick(row, 'fromState', 'from_state')),
      toState: text(pick(row, 'toState', 'to_state')),
      occurredAt,
      evidenceDigest: text(pick(row, 'evidenceDigest', 'evidence_digest')),
      verdict: eventVerdict(row),
    },
  };
}

function normalizeLease(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return { error: 'malformed' };
  const leaseId = text(pick(row, 'leaseId', 'lease_id'));
  const workItemId = text(pick(row, 'workItemId', 'work_item_id'));
  if (!leaseId || !workItemId) return { error: 'malformed' };
  const expiresAt = optionalInstant(pick(row, 'expiresAt', 'expires_at'));
  const issuedAt = optionalInstant(pick(row, 'issuedAt', 'issued_at'));
  const releasedAt = optionalInstant(pick(row, 'releasedAt', 'released_at'));
  if ([expiresAt, issuedAt, releasedAt].includes(undefined) || !expiresAt) return { error: 'malformed' };
  return {
    lease: {
      leaseId,
      workItemId,
      workerId: text(pick(row, 'workerId', 'worker_id')),
      issuedAt,
      expiresAt,
      releasedAt,
    },
  };
}

function semanticEvents(events, limitations) {
  const byId = dedupe(
    events,
    (event) => event.eventId,
    (event) => signature(event),
    'event',
    limitations,
  );
  const groups = new Map();
  for (const event of byId.kept) {
    const key = [event.workItemId, event.eventType, event.fromState, event.toState, event.occurredAt?.text ?? ''].join('\0');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const kept = [];
  for (const group of groups.values()) {
    group.sort((left, right) => left.eventId.localeCompare(right.eventId));
    kept.push(group[0]);
  }
  kept.sort((left, right) => left.eventId.localeCompare(right.eventId));
  return { kept, excluded: byId.excluded };
}

function coverageRatio(covered, governed) {
  if (governed === 0) return null;
  return Math.round((covered * 1_000_000) / governed) / 1_000_000;
}

function readinessMetrics(readiness, limitations) {
  const empty = (reason) => ({
    repositoryAuthority: unavailable(reason, { covered: null, governed: null, ratio: null }),
    investigationProfile: unavailable(reason, { covered: null, governed: null, ratio: null }),
    verificationProfile: unavailable(reason, { covered: null, governed: null, ratio: null }),
    dispatchReadiness: unavailable(reason, { covered: null, governed: null, ratio: null }),
    governedProperties: null,
  });
  if (readiness == null) return empty('readiness snapshot was not supplied');
  if (readiness.contractName !== READINESS_CONTRACT || readiness.schemaVersion !== READINESS_SCHEMA_VERSION) {
    limitations.push('readiness schema was rejected');
    return empty(`readiness schema is not ${READINESS_CONTRACT} ${READINESS_SCHEMA_VERSION}`);
  }
  if (!Array.isArray(readiness.properties)) {
    limitations.push('readiness properties were rejected');
    return empty('readiness properties are not an array');
  }
  const governed = readiness.properties.filter((row) => row && row.governed === true);
  const ids = governed.map((row) => row.propertyId);
  if (ids.some((id) => typeof id !== 'string' || !id) || new Set(ids).size !== ids.length) {
    limitations.push('readiness governed property identities were rejected');
    return empty('readiness governed propertyId values are missing or duplicated');
  }
  const summary = readiness.summary;
  if (summary != null) {
    if (!summary || typeof summary !== 'object' || Array.isArray(summary)) {
      return empty('readiness summary is not an object');
    }
    if (summary.governedProperties !== governed.length) {
      limitations.push('readiness summary did not match the governed rows');
      return empty('readiness summary governedProperties does not match the governed rows');
    }
  }
  const fieldCovered = (field) => {
    if (governed.some((row) => row[field] === undefined)) return null;
    return governed.filter((row) => typeof row[field] === 'string' && row[field].trim()).length;
  };
  const repository = fieldCovered('repository');
  const investigation = fieldCovered('investigationProfile');
  const verification = fieldCovered('verificationProfile');
  let dispatch = null;
  if (governed.every((row) => typeof row.dispatchReady === 'boolean')) {
    dispatch = governed.filter((row) => row.dispatchReady).length;
  }
  if (summary) {
    const checks = [
      ['repositoryAuthorityKnown', repository],
      ['dispatchReady', dispatch],
    ];
    for (const [key, value] of checks) {
      if (summary[key] != null && value != null && summary[key] !== value) {
        limitations.push('readiness summary counts did not match the governed rows');
        return empty('readiness summary counts do not match the governed rows');
      }
    }
  }
  const band = (covered) => {
    if (covered == null) {
      return unavailable('one or more governed rows omit the field', { covered: null, governed: governed.length, ratio: null });
    }
    return {
      available: true,
      covered,
      governed: governed.length,
      ratio: coverageRatio(covered, governed.length),
      reason: governed.length === 0 ? 'no governed properties' : null,
    };
  };
  return {
    repositoryAuthority: band(repository),
    investigationProfile: band(investigation),
    verificationProfile: band(verification),
    dispatchReadiness: dispatch == null
      ? unavailable('dispatchReady is not a boolean on every governed row', { covered: null, governed: governed.length, ratio: null })
      : band(dispatch),
    governedProperties: governed.length,
  };
}

function leaseState(lease, nowMs) {
  if (!lease?.expiresAt) return 'unknown';
  if (lease.releasedAt) return 'released';
  return lease.expiresAt.millis > nowMs ? 'active' : 'expired';
}

function itemLeases(item, leases) {
  const rows = leases.filter((lease) => lease.workItemId === item.workItemId);
  if (item.activeLease?.leaseId && !rows.some((lease) => lease.leaseId === item.activeLease.leaseId)) {
    rows.push({
      leaseId: item.activeLease.leaseId,
      workItemId: item.workItemId,
      workerId: item.activeLease.workerId,
      issuedAt: null,
      expiresAt: item.activeLease.expiresAt,
      releasedAt: null,
    });
  }
  return rows;
}

function liveClaim(effect, nowMs) {
  return effect.status === 'PLANNED'
    && effect.lastAttemptAt
    && (nowMs - effect.lastAttemptAt.millis) < EFFECT_VISIBILITY_MS;
}

// Same visibility and planning-window rules as an effect attached to an accepted item.
function orphanReasons(effect, nowMs) {
  if (effect.status === 'FAILED') return ['failed_effect'];
  const reasons = [];
  if (effect.lastAttemptAt && (nowMs - effect.lastAttemptAt.millis) >= EFFECT_VISIBILITY_MS) {
    reasons.push('effect_beyond_visibility');
  }
  if (!effect.lastAttemptAt && effect.createdAt && (nowMs - effect.createdAt.millis) >= EFFECT_PLANNED_STALE_AFTER_MS) {
    reasons.push('effect_planned_too_long');
  }
  return reasons;
}

function classifyItem(item, effects, leases, nowMs) {
  const reasons = [];
  const own = effects.filter((effect) => effect.workItemId === item.workItemId);
  const planned = own.filter((effect) => effect.status === 'PLANNED');
  const failed = own.filter((effect) => effect.status === 'FAILED');
  const rows = itemLeases(item, leases);
  const active = rows.filter((lease) => leaseState(lease, nowMs) === 'active');
  const expiredActive = item.activeLease && leaseState({
    expiresAt: item.activeLease.expiresAt,
    releasedAt: null,
  }, nowMs) === 'expired';
  const gaps = !TERMINAL.has(item.state) && (item.state === 'OBSERVED' || item.state === 'RECURRENT' || item.state === 'BLOCKED' || item.state === 'NEEDS_HUMAN')
    ? blankBindings(item)
    : [];
  if (item.state === 'NEEDS_HUMAN') reasons.push('needs_human');
  if (gaps.length) reasons.push('qualification_gap');
  if (failed.length) reasons.push('failed_effect');
  if (item.state === 'BLOCKED' && active.length === 0 && !planned.some((effect) => liveClaim(effect, nowMs))) {
    reasons.push('blocked_needs_human');
  }
  if ((item.state === 'OBSERVED' || item.state === 'RECURRENT') && gaps.length === 0) reasons.push('awaiting_qualification');
  if (item.state === 'QUALIFIED' && planned.length === 0) reasons.push('awaiting_investigation');
  if (item.state === 'INVESTIGATION_READY' && planned.length === 0) reasons.push('awaiting_dispatch');
  if (expiredActive || (item.activeLease == null && rows.some((lease) => leaseState(lease, nowMs) === 'expired') && active.length === 0)) {
    reasons.push('expired_lease');
  }
  const evidenceAge = item.lastSeen ? nowMs - item.lastSeen.millis : null;
  if (!TERMINAL.has(item.state) && evidenceAge != null && evidenceAge >= EVIDENCE_STALE_AFTER_MS) reasons.push('stale_evidence');
  if (planned.some((effect) => effect.lastAttemptAt && (nowMs - effect.lastAttemptAt.millis) >= EFFECT_VISIBILITY_MS)) {
    reasons.push('effect_beyond_visibility');
  }
  if (planned.some((effect) => !effect.lastAttemptAt && effect.createdAt && (nowMs - effect.createdAt.millis) >= EFFECT_PLANNED_STALE_AFTER_MS)) {
    reasons.push('effect_planned_too_long');
  }
  const unchangedAge = item.updatedAt ? nowMs - item.updatedAt.millis : null;
  if (!TERMINAL.has(item.state) && unchangedAge != null && unchangedAge >= UNCHANGED_AFTER_MS) reasons.push('unchanged');
  // A diagnosed or deployed item waits for the governed sweep to bring strictly newer production evidence.
  const awaitingReverification = REVERIFICATION_WAIT.has(item.state);
  if (awaitingReverification) reasons.push('awaiting_reverification');
  const automation = active.length > 0 || planned.length > 0 || item.state === 'REVERIFYING' || awaitingReverification;
  if (!TERMINAL.has(item.state) && !automation && !reasons.some((reason) => HUMAN_REASONS.has(reason) || STALE_REASONS.has(reason))) {
    reasons.push('lifecycle_waiting');
  }
  return { reasons, automation, planned, failed, active, gaps };
}

function nextAction(reasons) {
  for (const [reason, textValue] of NEXT_ACTION) {
    if (reasons.includes(reason)) return textValue;
  }
  return 'No operator action is indicated by the recorded state.';
}

function ageOf(item, nowMs) {
  const stamp = item.updatedAt || item.lastSeen || item.firstSeen;
  return stamp ? nowMs - stamp.millis : null;
}

function maxAttempt(effects) {
  const known = effects.map((effect) => effect.attemptCount).filter((value) => value != null);
  return known.length ? Math.max(...known) : null;
}

/** The operator-facing lifecycle facts of one item, derived only from the item and its journaled verdicts. */
function lifecycleFor(item, view, events, nowMs) {
  const own = events
    .filter((event) => event.workItemId === item.workItemId)
    .sort((left, right) => (left.occurredAt?.millis ?? 0) - (right.occurredAt?.millis ?? 0) || left.eventId.localeCompare(right.eventId));
  const cycleStart = own.map((event) => event.toState).lastIndexOf('RECURRENT');
  const verdicts = (cycleStart >= 0 ? own.slice(cycleStart) : own).map((event) => event.verdict).filter(Boolean);
  const accepted = verdicts.filter((verdict) => verdict.result === 'resolved' || verdict.result === 'still_failing');
  const reverification = accepted.length ? accepted[accepted.length - 1] : null;
  const lastVerdict = verdicts.length ? verdicts[verdicts.length - 1] : null;
  const required = REVERIFICATION_STATES.has(item.state);
  let blocker = null;
  if (item.state === 'INVESTIGATING') {
    blocker = view.active.length ? 'An investigation holds a live lease; reverification waits for its diagnosis.' : 'The investigation lease is not live.';
  } else if (required) {
    blocker = lastVerdict && !['resolved', 'still_failing'].includes(lastVerdict.result)
      ? `Last healthy observation was not accepted: ${lastVerdict.result}${lastVerdict.reason ? ` (${lastVerdict.reason})` : ''}.`
      : (reverification?.result === 'still_failing'
        ? 'The finding is still observed after diagnosis.'
        : 'Waiting for a healthy production observation newer than the diagnosis.');
  } else if (!TERMINAL.has(item.state) && view.reasons.length) {
    blocker = nextAction(view.reasons);
  }
  return {
    occurrenceCount: item.occurrenceCount,
    observationAgeMs: item.lastSeen ? nowMs - item.lastSeen.millis : null,
    investigationReady: item.state === 'INVESTIGATION_READY' || item.state === 'INVESTIGATING',
    diagnosisAvailable: Boolean(item.diagnosisResultDigest),
    reverificationRequired: required,
    reverification: reverification
      ? { result: reverification.result, observedAt: reverification.observedAt, evidenceDigest: reverification.evidenceDigest }
      : null,
    lastVerdict: lastVerdict ? { result: lastVerdict.result, reason: lastVerdict.reason } : null,
    recurrenceCount: item.recurrenceCount,
    blocker,
  };
}

function cardFor(item, view, nowMs, events = []) {
  const attempts = maxAttempt([...view.planned, ...view.failed, ...view.otherEffects]);
  const lease = view.active[0] || (view.reasons.includes('expired_lease') ? item.activeLease : null);
  return {
    workItemId: item.workItemId,
    propertyId: item.propertyId,
    findingKey: item.findingKey,
    state: item.state,
    severity: item.severity,
    reasons: [...view.reasons].sort(),
    ageMs: ageOf(item, nowMs),
    recurrenceCount: item.recurrenceCount,
    maxAttemptCount: attempts,
    workerId: lease?.workerId ?? null,
    leaseState: lease ? (view.active.length ? 'active' : 'expired') : null,
    effectIds: [...view.planned, ...view.failed].map((effect) => effect.effectId).sort(),
    effects: [...view.planned, ...view.failed]
      .map((effect) => ({
        effectId: effect.effectId,
        effectType: effect.effectType,
        status: effect.status,
        attemptCount: effect.attemptCount,
      }))
      .sort((left, right) => left.effectId.localeCompare(right.effectId)),
    evidence: {
      digest: item.evidenceDigest,
      revision: item.evidenceRevision,
      observedAt: item.lastSeen?.text ?? null,
    },
    nextAction: nextAction(view.reasons),
    lifecycle: lifecycleFor(item, view, events, nowMs),
  };
}

export function compareAttention(left, right) {
  const severity = (SEVERITY_RANK.get(left.severity) ?? 5) - (SEVERITY_RANK.get(right.severity) ?? 5);
  if (severity) return severity;
  const human = (left.state === 'NEEDS_HUMAN' || left.reasons.includes('needs_human') ? 0 : left.reasons.some((reason) => HUMAN_REASONS.has(reason)) ? 1 : 2)
    - (right.state === 'NEEDS_HUMAN' || right.reasons.includes('needs_human') ? 0 : right.reasons.some((reason) => HUMAN_REASONS.has(reason)) ? 1 : 2);
  if (human) return human;
  const failure = (left.reasons.includes('failed_effect') || left.state === 'BLOCKED' ? 0 : 1)
    - (right.reasons.includes('failed_effect') || right.state === 'BLOCKED' ? 0 : 1);
  if (failure) return failure;
  const leftAge = left.ageMs == null ? Number.NEGATIVE_INFINITY : left.ageMs;
  const rightAge = right.ageMs == null ? Number.NEGATIVE_INFINITY : right.ageMs;
  if (leftAge !== rightAge) return rightAge - leftAge;
  const leftRecurrence = left.recurrenceCount == null ? Number.NEGATIVE_INFINITY : left.recurrenceCount;
  const rightRecurrence = right.recurrenceCount == null ? Number.NEGATIVE_INFINITY : right.recurrenceCount;
  if (leftRecurrence !== rightRecurrence) return rightRecurrence - leftRecurrence;
  const leftAttempt = left.maxAttemptCount == null ? Number.NEGATIVE_INFINITY : left.maxAttemptCount;
  const rightAttempt = right.maxAttemptCount == null ? Number.NEGATIVE_INFINITY : right.maxAttemptCount;
  if (leftAttempt !== rightAttempt) return rightAttempt - leftAttempt;
  return left.workItemId.localeCompare(right.workItemId);
}

function mean(values) {
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

function latency(events, startState, endState, eventsSupplied) {
  if (!eventsSupplied) {
    return unavailable('events were not supplied', { samples: null, averageMs: null });
  }
  const byItem = new Map();
  for (const event of events) {
    if (!event.occurredAt || !event.toState) continue;
    if (!byItem.has(event.workItemId)) byItem.set(event.workItemId, []);
    byItem.get(event.workItemId).push(event);
  }
  const samples = [];
  for (const group of byItem.values()) {
    const starts = group.filter((event) => event.toState === startState).map((event) => event.occurredAt.millis);
    const ends = group.filter((event) => event.toState === endState).map((event) => event.occurredAt.millis);
    if (!starts.length || !ends.length) continue;
    const start = Math.min(...starts);
    const later = ends.filter((value) => value >= start);
    if (!later.length) continue;
    samples.push(Math.min(...later) - start);
  }
  if (!samples.length) {
    return unavailable('no work item has both endpoint timestamps', { samples: 0, averageMs: null });
  }
  return { available: true, samples: samples.length, averageMs: mean(samples), reason: null };
}

function effectMetrics(effects, supplied) {
  if (!supplied) {
    return {
      effectsByStatus: unavailable('effects were not supplied', { PLANNED: null, COMMITTED: null, VERIFIED: null, FAILED: null }),
      effectsWithRetries: unavailable('effects were not supplied', { count: null, unknown: null }),
      attemptCount: unavailable('effects were not supplied', { max: null, average: null, known: null, unknown: null }),
      outboxDispatchLag: unavailable('effects were not supplied', { samples: null, maxMs: null, averageMs: null }),
    };
  }
  const byStatus = { PLANNED: 0, COMMITTED: 0, VERIFIED: 0, FAILED: 0 };
  for (const effect of effects) byStatus[effect.status] += 1;
  const knownAttempts = effects.filter((effect) => effect.attemptCount != null);
  const unknownAttempts = effects.length - knownAttempts.length;
  const retries = knownAttempts.filter((effect) => effect.attemptCount >= 2).length;
  const lags = [];
  for (const effect of effects) {
    if (!effect.createdAt) continue;
    const marks = [effect.lastAttemptAt, effect.committedAt]
      .filter(Boolean)
      .map((stamp) => stamp.millis)
      .filter((millis) => millis >= effect.createdAt.millis);
    if (marks.length) lags.push(Math.min(...marks) - effect.createdAt.millis);
  }
  return {
    effectsByStatus: { available: true, ...byStatus, reason: null },
    effectsWithRetries: knownAttempts.length
      ? { available: true, count: retries, unknown: unknownAttempts, reason: null }
      : unavailable('effect records do not include attempt counts', { count: null, unknown: unknownAttempts }),
    attemptCount: knownAttempts.length
      ? {
        available: true,
        max: Math.max(...knownAttempts.map((effect) => effect.attemptCount)),
        average: mean(knownAttempts.map((effect) => effect.attemptCount)),
        known: knownAttempts.length,
        unknown: unknownAttempts,
        reason: null,
      }
      : unavailable('effect records do not include attempt counts', { max: null, average: null, known: 0, unknown: unknownAttempts }),
    outboxDispatchLag: lags.length
      ? { available: true, samples: lags.length, maxMs: Math.max(...lags), averageMs: mean(lags), reason: null }
      : unavailable('effect records do not include both a create time and a claim or commit time', { samples: 0, maxMs: null, averageMs: null }),
  };
}

function resultMetrics(events, supplied) {
  if (!supplied) {
    return {
      resultAcceptance: unavailable('events were not supplied', { count: null }),
      resultRefusal: unavailable('events were not supplied', { count: null }),
    };
  }
  const acceptance = events.filter((event) => event.eventType === 'result_accepted'
    || (event.fromState === 'INVESTIGATING' && event.toState === 'DIAGNOSED')).length;
  const refusals = events.filter((event) => REFUSAL_EVENT_TYPES.has(event.eventType));
  return {
    resultAcceptance: { available: true, count: acceptance, reason: null },
    resultRefusal: refusals.length
      ? { available: true, count: refusals.length, reason: null }
      : unavailable('the event journal has no result-refusal records; a zero would claim that no result was refused', { count: null }),
  };
}

function terminalStamp(item, events) {
  if (item.resolvedAt) return item.resolvedAt;
  const terminalEvents = events
    .filter((event) => event.workItemId === item.workItemId && TERMINAL.has(event.toState) && event.occurredAt)
    .sort((left, right) => left.occurredAt.millis - right.occurredAt.millis);
  return terminalEvents.length ? terminalEvents[terminalEvents.length - 1].occurredAt : null;
}

function terminalEvidence(item, events) {
  if (item.resolutionEvidenceDigest) return item.resolutionEvidenceDigest;
  const terminalEvents = events
    .filter((event) => event.workItemId === item.workItemId && TERMINAL.has(event.toState) && event.evidenceDigest)
    .sort((left, right) => (left.occurredAt?.millis ?? 0) - (right.occurredAt?.millis ?? 0));
  return terminalEvents.length ? terminalEvents[terminalEvents.length - 1].evidenceDigest : null;
}

function highWater(stamps) {
  const finite = stamps.filter(Boolean).map((stamp) => stamp.text).sort();
  return finite.length ? finite[finite.length - 1] : null;
}

function emptyQueues() {
  return {
    needsHuman: null,
    activeAutomation: null,
    stale: null,
    recentlyResolved: null,
    attention: null,
  };
}

export function projectMissionControlOperations(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new OperationsContractError('operations input must be an object');
  }
  const now = requireInstant(input.now, 'now');
  const limitations = [];
  const workSource = sourceArray(input, 'workItems');
  const eventSource = sourceArray(input, 'events');
  const effectSource = sourceArray(input, 'effects');
  const leaseSource = sourceArray(input, 'leases');

  const workNormalized = workSource.rows.map(normalizeWorkItem);
  const workAccepted = [];
  const excludedWorkItems = [];
  for (const result of workNormalized) {
    if (result.item) workAccepted.push(result.item);
    else excludedWorkItems.push({ schemaVersion: result.schemaVersion ?? null, reason: result.error });
  }
  const workDeduped = dedupe(
    workAccepted,
    (item) => item.workItemId,
    (item) => signature(item),
    'work item',
    limitations,
  );
  excludedWorkItems.push(...workDeduped.excluded);

  const effectNormalized = effectSource.rows.map(normalizeEffect);
  const effectAccepted = [];
  const excludedEffects = [];
  for (const result of effectNormalized) {
    if (result.effect) effectAccepted.push(result.effect);
    else excludedEffects.push({ schemaVersion: result.schemaVersion ?? null, reason: result.error });
  }
  const effectDeduped = dedupe(effectAccepted, (effect) => effect.effectId, (effect) => signature(effect), 'effect', limitations);
  excludedEffects.push(...effectDeduped.excluded);

  const eventNormalized = eventSource.rows.map(normalizeEvent).filter((result) => result.event).map((result) => result.event);
  const malformedEvents = eventSource.rows.length - eventNormalized.length;
  if (malformedEvents) limitations.push(`${malformedEvents} malformed events were excluded`);
  const eventDeduped = semanticEvents(eventNormalized, limitations);

  const leaseNormalized = leaseSource.rows.map(normalizeLease).filter((result) => result.lease).map((result) => result.lease);
  const malformedLeases = leaseSource.rows.length - leaseNormalized.length;
  if (malformedLeases) limitations.push(`${malformedLeases} malformed leases were excluded`);
  const leaseDeduped = dedupe(leaseNormalized, (lease) => lease.leaseId, (lease) => signature(lease), 'lease', limitations);

  if (!effectSource.supplied) limitations.push('effects were not supplied; failed and in-flight effects cannot be classified');
  if (!eventSource.supplied) limitations.push('events were not supplied; latencies and result counts are unavailable');
  if (!leaseSource.supplied) limitations.push('lease history was not supplied; lease metrics use the active lease stored on each work item');
  if (!workSource.supplied) limitations.push('work items were not supplied; queues are not an all-clear');

  const readiness = readinessMetrics(input.readiness === undefined ? null : input.readiness, limitations);
  const items = workDeduped.kept;
  const effects = effectDeduped.kept;
  const events = eventDeduped.kept;
  const leases = leaseDeduped.kept;

  const cards = items.map((item) => {
    const view = classifyItem(item, effects, leases, now.millis);
    view.otherEffects = effects.filter((effect) => effect.workItemId === item.workItemId && effect.status !== 'PLANNED' && effect.status !== 'FAILED');
    return { item, view, card: cardFor(item, view, now.millis, events) };
  });

  let queues = emptyQueues();
  let resolvedCounts = { resolvedOutsideWindow: null, resolvedWithoutTimestamp: null };
  if (workSource.supplied) {
    const needsHuman = [];
    const activeAutomation = [];
    const stale = [];
    const recentlyResolved = [];
    const attention = [];
    let resolvedOutsideWindow = 0;
    let resolvedWithoutTimestamp = 0;
    for (const entry of cards) {
      const { item, view, card } = entry;
      if (view.reasons.some((reason) => HUMAN_REASONS.has(reason))) needsHuman.push(card);
      if (view.automation) activeAutomation.push(card);
      if (view.reasons.some((reason) => STALE_REASONS.has(reason))) stale.push(card);
      if (TERMINAL.has(item.state)) {
        const stamp = terminalStamp(item, events);
        if (!stamp) {
          resolvedWithoutTimestamp += 1;
          limitations.push(`work item ${item.workItemId} is ${item.state} without a terminal timestamp`);
        } else if ((now.millis - stamp.millis) <= RECENTLY_RESOLVED_WITHIN_MS) {
          recentlyResolved.push({
            ...card,
            terminalState: item.state,
            terminalAt: stamp.text,
            causalEvidence: terminalEvidence(item, events),
            ageMs: now.millis - stamp.millis,
          });
        } else {
          resolvedOutsideWindow += 1;
        }
      }
      const humanOrStale = view.reasons.some((reason) => HUMAN_REASONS.has(reason) || STALE_REASONS.has(reason) || reason === 'lifecycle_waiting');
      if (humanOrStale) attention.push(card);
    }
    const includedIds = new Set(items.map((item) => item.workItemId));
    for (const effect of effects) {
      if (includedIds.has(effect.workItemId)) continue;
      if (effect.status !== 'FAILED' && effect.status !== 'PLANNED') continue;
      const orphan = {
        workItemId: effect.workItemId,
        propertyId: null,
        findingKey: null,
        state: null,
        severity: null,
        reasons: orphanReasons(effect, now.millis),
        ageMs: effect.createdAt ? now.millis - effect.createdAt.millis : null,
        recurrenceCount: null,
        maxAttemptCount: effect.attemptCount,
        workerId: null,
        leaseState: null,
        effectIds: [effect.effectId],
        effects: [{
          effectId: effect.effectId,
          effectType: effect.effectType,
          status: effect.status,
          attemptCount: effect.attemptCount,
        }],
        evidence: { digest: null, revision: null, observedAt: null },
        nextAction: effect.status === 'FAILED'
          ? 'A durable effect failed and its work item is not in the accepted set.'
          : 'A planned effect has no accepted work item.',
      };
      if (effect.status === 'FAILED') {
        if (!orphan.reasons.includes('failed_effect')) orphan.reasons.push('failed_effect');
        needsHuman.push(orphan);
        attention.push(orphan);
      } else {
        activeAutomation.push(orphan);
        if (orphan.reasons.length) {
          stale.push(orphan);
          attention.push(orphan);
        }
      }
    }
    needsHuman.sort(compareAttention);
    activeAutomation.sort(compareAttention);
    stale.sort(compareAttention);
    attention.sort(compareAttention);
    recentlyResolved.sort((left, right) => left.ageMs - right.ageMs || left.workItemId.localeCompare(right.workItemId));
    queues = { needsHuman, activeAutomation, stale, recentlyResolved, attention };
    resolvedCounts = { resolvedOutsideWindow, resolvedWithoutTimestamp };
  }

  const lifecycle = Object.fromEntries(WORK_ITEM_STATES.map((state) => [state, 0]));
  for (const item of items) lifecycle[item.state] += 1;
  const unresolvedAges = items
    .filter((item) => !TERMINAL.has(item.state) && item.firstSeen)
    .map((item) => now.millis - item.firstSeen.millis);
  const recurrenceKnown = items.filter((item) => item.recurrenceCount != null);
  const recurrenceItems = recurrenceKnown.filter((item) => item.recurrenceCount > 0).length;
  const activeLeaseCount = new Set();
  const expiredLeaseCount = new Set();
  const seenLeaseIds = new Set(leases.map((lease) => lease.leaseId));
  for (const lease of leases) {
    const state = leaseState(lease, now.millis);
    if (state === 'active') activeLeaseCount.add(lease.leaseId);
    if (state === 'expired') expiredLeaseCount.add(lease.leaseId);
  }
  for (const item of items) {
    if (!item.activeLease?.leaseId || seenLeaseIds.has(item.activeLease.leaseId)) continue;
    const state = leaseState({ expiresAt: item.activeLease.expiresAt, releasedAt: null }, now.millis);
    if (state === 'active') activeLeaseCount.add(item.activeLease.leaseId);
    if (state === 'expired') expiredLeaseCount.add(item.activeLease.leaseId);
  }
  let fresh = 0;
  let staleEvidence = 0;
  let unknownEvidence = 0;
  for (const item of items) {
    if (TERMINAL.has(item.state)) continue;
    if (!item.lastSeen) {
      unknownEvidence += 1;
    } else if ((now.millis - item.lastSeen.millis) >= EVIDENCE_STALE_AFTER_MS) {
      staleEvidence += 1;
    } else {
      fresh += 1;
    }
  }

  const effectView = effectMetrics(effects, effectSource.supplied);
  const results = resultMetrics(events, eventSource.supplied);
  const leaseMetricsAvailable = workSource.supplied || leaseSource.supplied;

  const document = {
    schemaVersion: OPERATIONS_SCHEMA_VERSION,
    generatedAt: now.text,
    authority: {
      repair: false,
      deployment: false,
      execution: false,
    },
    rules: {
      attentionOrder: [...ATTENTION_ORDER],
      evidenceStaleAfterMs: EVIDENCE_STALE_AFTER_MS,
      unchangedAfterMs: UNCHANGED_AFTER_MS,
      effectVisibilityMs: EFFECT_VISIBILITY_MS,
      effectPlannedStaleAfterMs: EFFECT_PLANNED_STALE_AFTER_MS,
      recentlyResolvedWithinMs: RECENTLY_RESOLVED_WITHIN_MS,
    },
    source: {
      workItems: { supplied: workSource.supplied, included: items.length, excluded: excludedWorkItems.length },
      events: { supplied: eventSource.supplied, included: events.length, excluded: eventDeduped.excluded.length + malformedEvents },
      effects: { supplied: effectSource.supplied, included: effects.length, excluded: excludedEffects.length },
      leases: { supplied: leaseSource.supplied, included: leases.length, excluded: leaseDeduped.excluded.length + malformedLeases },
      readiness: input.readiness == null ? null : {
        contractName: input.readiness.contractName ?? null,
        schemaVersion: input.readiness.schemaVersion ?? null,
        governedProperties: readiness.governedProperties,
      },
      highWater: {
        workItemAt: highWater(items.flatMap((item) => [item.updatedAt, item.lastSeen, item.firstSeen])),
        eventAt: highWater(events.map((event) => event.occurredAt)),
        effectAt: highWater(effects.flatMap((effect) => [effect.createdAt, effect.lastAttemptAt, effect.committedAt])),
      },
    },
    queues,
    // Every accepted item's lifecycle facts, including terminal ones that sit in no queue.
    items: workSource.supplied
      ? cards.map(({ item, card }) => ({
        workItemId: item.workItemId,
        propertyId: item.propertyId,
        state: item.state,
        lifecycle: card.lifecycle,
      })).sort((left, right) => left.workItemId.localeCompare(right.workItemId))
      : null,
    metrics: {
      workItemsByLifecycle: workSource.supplied
        ? { available: true, counts: lifecycle, reason: null }
        : unavailable('work items were not supplied', { counts: null }),
      oldestUnresolvedAgeMs: !workSource.supplied
        ? unavailable('work items were not supplied', { milliseconds: null })
        : unresolvedAges.length
          ? { available: true, milliseconds: Math.max(...unresolvedAges), reason: null }
          : unavailable('no unresolved work item has a first-seen timestamp', { milliseconds: null }),
      humanAttentionQueueDepth: workSource.supplied
        ? { available: true, count: queues.needsHuman.length, reason: null }
        : unavailable('work items were not supplied', { count: null }),
      activeLeaseCount: leaseMetricsAvailable
        ? { available: true, count: activeLeaseCount.size, reason: null }
        : unavailable('leases were not supplied', { count: null }),
      expiredLeaseCount: leaseMetricsAvailable
        ? { available: true, count: expiredLeaseCount.size, reason: null }
        : unavailable('leases were not supplied', { count: null }),
      ...effectView,
      ...results,
      recurrence: !workSource.supplied
        ? unavailable('work items were not supplied', { items: null, total: null, sum: null, rate: null })
        : recurrenceKnown.length !== items.length
          ? unavailable('one or more work items omit recurrenceCount', { items: null, total: items.length, sum: null, rate: null })
          : {
            available: true,
            items: recurrenceItems,
            total: items.length,
            sum: recurrenceKnown.reduce((sum, item) => sum + item.recurrenceCount, 0),
            rate: items.length ? coverageRatio(recurrenceItems, items.length) : null,
            reason: items.length ? null : 'no work items',
          },
      evidenceFreshness: workSource.supplied
        ? { available: true, fresh, stale: staleEvidence, unknown: unknownEvidence, thresholdMs: EVIDENCE_STALE_AFTER_MS, reason: null }
        : unavailable('work items were not supplied', { fresh: null, stale: null, unknown: null, thresholdMs: EVIDENCE_STALE_AFTER_MS }),
      repositoryAuthority: readiness.repositoryAuthority,
      investigationProfile: readiness.investigationProfile,
      verificationProfile: readiness.verificationProfile,
      dispatchReadiness: readiness.dispatchReadiness,
      observedToQualified: latency(events, 'OBSERVED', 'QUALIFIED', eventSource.supplied),
      qualifiedToDiagnosed: latency(events, 'QUALIFIED', 'DIAGNOSED', eventSource.supplied),
      diagnosedToResolved: latency(events, 'DIAGNOSED', 'RESOLVED', eventSource.supplied),
      resolvedOutsideWindow: workSource.supplied
        ? { available: true, count: resolvedCounts.resolvedOutsideWindow, reason: null }
        : unavailable('work items were not supplied', { count: null }),
      resolvedWithoutTimestamp: workSource.supplied
        ? { available: true, count: resolvedCounts.resolvedWithoutTimestamp, reason: null }
        : unavailable('work items were not supplied', { count: null }),
    },
    completeness: {
      excludedWorkItems,
      excludedEffects,
      limitations: [...new Set(limitations)].sort(),
    },
  };
  return document;
}
