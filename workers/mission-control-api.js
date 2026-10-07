/**
 * Mission Control operator API.
 *
 * GlobalDeets evidence is accepted only when each plane matches its governed
 * contract. Health work items are a separate durable record and are not
 * labelled as that evidence.
 */

import { projectMissionControlOperations } from './lib/mission-control-operations.js';
import { abandonEffect, claimDispatch, ensureOutboxSchema, planEffect } from './lib/mission-control-outbox.js';
import { resolveLeaseAuthority } from './lib/mission-control-lease-authority.js';
import {
  LEASE_PURPOSE,
  buildSignedInvestigationContract,
  buildSignedLeaseGrant,
  keyBytesFromEnv,
  readInvestigationResult,
  resolveResultKey,
  verifySignedEnvelope,
} from './fwomps-investigation-adapter.js';
import { resolveEstateBinding } from './estate-bindings.js';
import {
  PrepareIssuerError,
  buildSignedPrepareContract,
  importPrepareSigningKey,
  prepareApprover,
  recordPrepareGrant,
} from './fwomps-prepare-issuer.js';
import { buildProvenanceReport } from './lib/worker-provenance.js';
import {
  CANARY_PRODUCER,
  CANARY_PROPERTY_ID,
  CANARY_FINDING_KEY,
  recordCanaryObservation,
  WorkItemError,
  abandonExpiredInvestigation,
  acceptInvestigationResult,
  associateLease,
  createD1WorkItemStore,
  ensureWorkItemSchema,
  issueInvestigation,
  recoverStaleDispatch,
  mapWorkItemError,
  operatorTransition,
  qualifyFromRegistry,
} from './mission-control-work-items.js';

const DEFAULT_REPO = 'weave0/globaldeets';
const DEFAULT_REF = 'mission-control-evidence';

export const EVIDENCE_FILES = Object.freeze({
  estateHealth: 'latest/estate-health.json',
  diagnostics: 'latest/diagnostics.json',
  executive: 'latest/executive.json',
  history: 'latest/history.json',
  audience: 'latest/audience.json',
  businessEvents: 'latest/business-events.json',
  probes: 'latest/probes.json',
});

export const EVIDENCE_CONTRACTS = Object.freeze({
  estateHealth: { contractName: 'globaldeets-estate-health', schemaVersion: '2.0.0' },
  diagnostics: { contractName: 'globaldeets-diagnostics-queue', schemaVersion: '2.0.0' },
  executive: { contractName: 'globaldeets-executive', schemaVersion: '1.0.0' },
  history: { contractName: 'globaldeets-mission-control-history', schemaVersion: '1.2.0' },
  audience: { contractName: 'globaldeets-audience', schemaVersion: '1.1.0' },
  businessEvents: { contractName: 'globaldeets-business-events', schemaVersion: '1.0.0' },
  probes: { contractName: 'globaldeets-probes', schemaVersion: '1.1.0' },
});

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, warning: 2, low: 3, info: 4 };

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extraHeaders,
    },
  });
}

export class EvidenceContractError extends Error {
  constructor(plane, message) {
    super(message);
    this.name = 'EvidenceContractError';
    this.plane = plane;
    this.code = 'EVIDENCE_CONTRACT_REJECTED';
  }
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateEvidencePlane(plane, value) {
  const contract = EVIDENCE_CONTRACTS[plane];
  if (!contract) throw new EvidenceContractError(plane, `Unknown evidence plane ${plane}`);
  if (!isObject(value)) {
    throw new EvidenceContractError(plane, `${plane} must be a governed evidence object`);
  }
  if (value.contractName !== contract.contractName || value.schemaVersion !== contract.schemaVersion) {
    throw new EvidenceContractError(
      plane,
      `${plane} contract ${value.contractName || 'missing'} ${value.schemaVersion || 'missing'} is not ${contract.contractName} ${contract.schemaVersion}`,
    );
  }
  if (typeof value.generatedAt !== 'string' || !value.generatedAt) {
    throw new EvidenceContractError(plane, `${plane} is missing generatedAt`);
  }
  if (plane === 'diagnostics' && !Array.isArray(value.items)) {
    throw new EvidenceContractError(plane, 'diagnostics.items must be an array');
  }
  if (plane === 'diagnostics' && value.findings !== undefined && !isObject(value.findings)) {
    throw new EvidenceContractError(plane, 'diagnostics.findings must be an object when present');
  }
  if (plane === 'executive' && !isObject(value.headline)) {
    throw new EvidenceContractError(plane, 'executive.headline must be an object');
  }
  if (plane === 'executive' && !Array.isArray(value.headline.statements)) {
    throw new EvidenceContractError(plane, 'executive.headline.statements must be an array');
  }
  if (plane === 'estateHealth' && !Array.isArray(value.properties)) {
    throw new EvidenceContractError(plane, 'estate health properties must be an array');
  }
  return value;
}

export function validateEvidenceBundle(evidence) {
  if (!isObject(evidence)) throw new EvidenceContractError('bundle', 'evidence bundle must be an object');
  for (const plane of Object.keys(EVIDENCE_CONTRACTS)) {
    validateEvidencePlane(plane, evidence[plane]);
  }
  return evidence;
}

function findingFrom(item) {
  if (!isObject(item)) return null;
  return {
    id: item.id || null,
    title: item.title || item.message || item.id || 'Diagnostic finding',
    severity: item.severity || 'unknown',
    priority: Number.isFinite(item.priority) ? item.priority : null,
    priorityScore: Number.isFinite(item.priorityScore) ? item.priorityScore : null,
    ownerLane: item.ownerLane || item.owner || item.escalation?.targetLane || 'Unassigned',
    nextAction: item.nextAction || item.action || null,
    impact: item.businessReason || item.why || item.impact || item.observed || '',
    status: item.status || (item.polarity === 'risk' ? 'open' : 'open'),
    confidence: item.confidence || null,
  };
}

function findingRows(diagnostics, executive) {
  const rows = [];
  if (isObject(diagnostics?.findings) && Array.isArray(diagnostics.findings.risks)) {
    rows.push(...diagnostics.findings.risks);
  }
  if (Array.isArray(diagnostics?.items)) rows.push(...diagnostics.items);
  if (Array.isArray(diagnostics?.findings)) rows.push(...diagnostics.findings);
  if (isObject(executive?.findings) && Array.isArray(executive.findings.risks)) {
    rows.push(...executive.findings.risks);
  }
  const byId = new Map();
  for (const row of rows.map(findingFrom).filter(Boolean)) {
    if (row.status === 'closed') continue;
    const key = row.id || row.title;
    const previous = byId.get(key);
    if (!previous || (previous.priority == null && row.priority != null)) byId.set(key, row);
  }
  return [...byId.values()].sort((a, b) => {
    if (a.priority != null || b.priority != null) return (a.priority ?? 999) - (b.priority ?? 999);
    if (a.priorityScore != null || b.priorityScore != null) return (b.priorityScore ?? -1) - (a.priorityScore ?? -1);
    return (SEVERITY_RANK[String(a.severity).toLowerCase()] ?? 5) - (SEVERITY_RANK[String(b.severity).toLowerCase()] ?? 5);
  });
}

function statementText(executive) {
  const rows = executive?.headline?.statements;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((item) => (typeof item === 'string' ? item : item?.text))
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => item.trim());
}

function measurementState(plane, canonical) {
  return plane?.evidenceState
    || canonical
    || plane?.source?.evidenceState
    || plane?.measurementState
    || plane?.source?.status
    || plane?.state
    || plane?.status
    || 'unknown';
}

function planeFreshness(policy, generatedAt, now) {
  if (!generatedAt || !policy) return null;
  const hours = (now - Date.parse(generatedAt)) / 3600000;
  if (!Number.isFinite(hours)) return null;
  if (hours <= policy.freshWithinHours) return 'fresh';
  if (hours <= policy.expiredAfterHours) return 'stale';
  return 'expired';
}

function collectionState(evidence, now) {
  const policy = evidence.estateHealth?.freshnessPolicy || {};
  const states = [];
  const probeAt = evidence.probes?.latestAttempt?.at || evidence.estateHealth?.generatedAt;
  const probeState = planeFreshness(policy.probe, probeAt, now);
  if (probeState) states.push(['Estate probes', probeState]);
  const audienceState = evidence.audience?.source?.freshness?.state
    || planeFreshness(policy.audience, evidence.audience?.generatedAt, now);
  if (audienceState) states.push(['Audience', audienceState]);
  const eventsState = evidence.businessEvents?.source?.freshness?.state
    || planeFreshness(policy.businessEvents, evidence.businessEvents?.generatedAt, now);
  if (eventsState) states.push(['Business events', eventsState]);
  if (!states.length) return { label: 'Unknown', tone: 'unknown', planes: [] };
  const rank = { expired: 2, stale: 1, fresh: 0 };
  const worst = states.reduce((left, right) => (rank[right[1]] > rank[left[1]] ? right : left));
  const label = worst[1][0].toUpperCase() + worst[1].slice(1);
  return {
    label: states.length > 1 && worst[1] !== 'fresh' ? `${label} · ${worst[0]}` : label,
    tone: { fresh: 'ok', stale: 'warn', expired: 'bad' }[worst[1]] || 'unknown',
    planes: states.map(([name, state]) => ({ name, state })),
  };
}

export function normalizeOperatorView(evidence, now = Date.now()) {
  validateEvidenceBundle(evidence);
  const diagnostics = findingRows(evidence.diagnostics, evidence.executive);
  const properties = evidence.estateHealth.properties.map((property) => ({
    id: property.propertyId || property.id || property.domain || 'unknown',
    name: property.displayName || property.propertyId || 'Unknown property',
    availability: property?.availability?.blocked ? 'blocked' : (property?.availability?.state || 'unknown'),
    availabilityEvidence: property?.availability?.evidenceState || null,
    criticalPath: property?.criticalPath?.state || 'unknown',
    observedAt: property?.availability?.observedAt || property?.evidenceAsOf || evidence.estateHealth.generatedAt,
  }));
  const summary = evidence.estateHealth.summary || {};
  return {
    statements: statementText(evidence.executive),
    diagnostics,
    properties,
    audienceState: measurementState(
      evidence.audience,
      evidence.audience?.estate?.requests?.['28']?.evidenceState,
    ),
    businessEventState: measurementState(
      evidence.businessEvents,
      evidence.businessEvents?.estate?.totals?.lead?.['28']?.evidenceState,
    ),
    freshness: collectionState(evidence, now),
    counts: {
      properties: evidence.estateHealth.propertyCount ?? properties.length,
      available: summary.availableZones ?? properties.filter((item) => item.availability === 'available').length,
      attention: evidence.diagnostics?.summary?.open ?? diagnostics.length,
      unknown: Math.max(0, (evidence.estateHealth.propertyCount ?? properties.length) - (summary.availabilityKnownZones ?? 0)),
    },
  };
}

async function fetchEvidenceFile({ fetchImpl, token, repo, ref, key, path }) {
  const response = await fetchImpl(
    `https://api.github.com/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        Accept: 'application/vnd.github.raw+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'gfd-mission-control',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) {
    const error = new Error(`Evidence fetch failed for ${key}`);
    error.status = response.status;
    throw error;
  }
  let value;
  try {
    value = await response.json();
  } catch {
    throw new EvidenceContractError(key, `${key} was not valid JSON`);
  }
  return validateEvidencePlane(key, value);
}

export async function loadMissionControlEvidence(env, fetchImpl = fetch) {
  const token = env.MISSION_CONTROL_GITHUB_TOKEN;
  if (!token) {
    const error = new Error('Mission Control upstream credential is not configured');
    error.code = 'UPSTREAM_NOT_CONFIGURED';
    throw error;
  }
  const repo = env.MISSION_CONTROL_GITHUB_REPO || DEFAULT_REPO;
  const ref = env.MISSION_CONTROL_GITHUB_REF || DEFAULT_REF;
  const entries = await Promise.all(Object.entries(EVIDENCE_FILES).map(async ([key, path]) => [
    key,
    await fetchEvidenceFile({ fetchImpl, token, repo, ref, key, path }),
  ]));
  const evidence = validateEvidenceBundle(Object.fromEntries(entries));
  return {
    schemaVersion: 'gfd-mission-control-1',
    source: {
      producer: 'GlobalDeets',
      repository: repo,
      ref,
      generatedAt: evidence.estateHealth.generatedAt,
    },
    evidence,
    operator: normalizeOperatorView(evidence),
    servedAt: new Date().toISOString(),
  };
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > 32768) {
    throw new WorkItemError('payload_too_large', 'Request body is too large', 413);
  }
  try {
    const value = JSON.parse(text || '{}');
    if (!isObject(value)) throw new Error('object required');
    return value;
  } catch {
    throw new WorkItemError('malformed_json', 'Request body must be a JSON object', 400);
  }
}

function routeOf(request) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/').filter(Boolean);
  return { url, parts };
}

async function workItemStore(env) {
  if (!env.DB) throw new WorkItemError('store_unavailable', 'Work item store is not configured', 503);
  await ensureWorkItemSchema(env.DB);
  return createD1WorkItemStore(env.DB);
}

/**
 * The canary kill switch, shared by BOTH canary surfaces (canary-observations and dispatch). Absent or any other
 * value => 404, so nothing here is a general admin dispatcher. The value names the one eligible property.
 */
function requireCanary(env) {
  if (env.MISSION_CONTROL_CANARY !== CANARY_PROPERTY_ID) {
    throw new WorkItemError('canary_disabled', 'The Mission Control canary is not enabled', 404);
  }
}

const CANARY_RUNNER_ROLE = 'mission-control-canary-runner';
const CANARY_RUNNER_WORK_ITEM_ID = /^gfdwi_v1_[0-9a-f]{64}$/;
const CANARY_RUNNER_TOP_ROUTES = new Set(['provenance', 'operations', 'work-items', 'canary-observations']);
const CANARY_RUNNER_ACTIONS = new Set(['transition', 'investigate', 'dispatch']);
const CANARY_RUNNER_METHODS = new Set(['GET', 'POST']);
const SHA40 = /^[0-9a-f]{40}$/;

function canaryEligible(item, env) {
  return item?.producer === CANARY_PRODUCER
    && item?.propertyId === CANARY_PROPERTY_ID
    && item?.findingKey === CANARY_FINDING_KEY
    && env.MISSION_CONTROL_CANARY === CANARY_PROPERTY_ID;
}

function decodePathPart(part) {
  try { return decodeURIComponent(part); } catch { return null; }
}

function runnerAuditRoute(parts) {
  const top = parts[2];
  if (!CANARY_RUNNER_TOP_ROUTES.has(top)) return ':route';
  if (top !== 'work-items') return parts.length === 3 ? top : `${top}/:extra`;
  if (parts.length === 3) return 'work-items';
  if (parts.length === 4) return 'work-items/:id';
  if (parts.length === 5) return `work-items/:id/${CANARY_RUNNER_ACTIONS.has(parts[4]) ? parts[4] : ':action'}`;
  return 'work-items/:id/:extra';
}

/** Structured, secret-free access diagnostic. Untrusted path values are never reflected into logs. */
function auditRunner(env, user, request, parts, result) {
  // The gate runs before item resolution, so a syntactically valid path ID is still attacker-controlled.
  // Never persist it in access logs; canonical item identity is available from durable event records instead.
  console.log(JSON.stringify({
    at: nowIso(), kind: 'mc-canary-runner-access', actor: user.id, role: CANARY_RUNNER_ROLE,
    method: CANARY_RUNNER_METHODS.has(request.method) ? request.method : ':method',
    route: runnerAuditRoute(parts),
    workItemId: null, release: env.CF_PAGES_COMMIT_SHA ? String(env.CF_PAGES_COMMIT_SHA).slice(0, 12) : null, result,
  }));
}

/**
 * The canary runner's entire reachable surface (exact method + route). Anything else, including lease/result,
 * expire, recover, the evidence root and every unlisted action, is refused. Active only while the kill switch
 * names exactly the canary property; with it off this is the canary's own 404.
 */
function canaryRunnerGate(request, env, user, parts) {
  if (env.MISSION_CONTROL_CANARY !== CANARY_PROPERTY_ID) {
    auditRunner(env, user, request, parts, 'refused:canary_disabled');
    return jsonResponse({ error: 'The Mission Control canary is not enabled', code: 'canary_disabled' }, 404);
  }
  const m = request.method;
  const allowed = (m === 'GET' && parts.length === 3 && ['provenance', 'operations', 'work-items'].includes(parts[2]))
    || (m === 'GET' && parts.length === 4 && parts[2] === 'work-items')
    || (m === 'POST' && parts.length === 3 && parts[2] === 'canary-observations')
    || (m === 'POST' && parts.length === 5 && parts[2] === 'work-items' && ['transition', 'investigate', 'dispatch'].includes(parts[4]));
  if (!allowed) {
    auditRunner(env, user, request, parts, 'refused:out_of_surface');
    return jsonResponse({ error: 'Forbidden: canary runner credential is limited to the canary surface' }, 403);
  }
  auditRunner(env, user, request, parts, 'allowed');
  return null;
}

/** Canary routes accept only the exact keys they document; anything else (property, command, worker, authority) is refused. */
function requireOnlyKeys(body, allowed) {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length) {
    throw new WorkItemError('unexpected_fields', 'Unexpected request fields are not allowed', 400);
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function mutate(store, id, producer, { onVersionConflict = null, actor = 'operator' } = {}) {
  const current = await store.get(id);
  if (!current) throw new WorkItemError('not_found', 'Work item was not found', 404);
  const at = nowIso();
  const next = await producer(current, at);
  if (next.skipEvent) return current;
  const event = next.pendingEvent || {
    at,
    from: current.state,
    to: next.state,
    reason: null,
    actor,
    detail: {},
  };
  delete next.pendingEvent;
  const leaseAuthority = next.leaseAuthority || null;
  delete next.leaseAuthority;
  // Durable compare-and-swap: a stale or reordered request changes nothing. A save that issues a
  // lease also carries the dispatch-intent guard, re-asserted atomically inside that swap.
  try {
    return await store.save(next, event, { expectedVersion: current.lifecycleVersion, leaseAuthority });
  } catch (error) {
    // Only a caller that can prove idempotence may reconcile a lost swap. Lease creation and every
    // other state-changing action never retry (a retry could mint a second lease token).
    if (error?.code === 'version_conflict' && onVersionConflict) {
      const fresh = await store.get(id);
      const resolved = await onVersionConflict(fresh, error);
      if (resolved) return resolved;
    }
    throw error;
  }
}

export async function handleMissionControlRequest(request, env, user, fetchImpl = fetch) {
  const role = user?.publicMetadata?.role;
  const isAdmin = role === 'admin';
  const isWorker = role === 'mission-control-worker';
  const isRunner = role === CANARY_RUNNER_ROLE;
  if (!isAdmin && !isWorker && !isRunner) {
    return jsonResponse({ error: 'Forbidden: Mission Control access required' }, 403);
  }
  const { parts } = routeOf(request);
  if (parts[0] !== 'api' || parts[1] !== 'mission-control') {
    return jsonResponse({ error: 'Not found' }, 404);
  }
  const workerAction = request.method === 'POST'
    && parts[2] === 'work-items'
    && parts.length === 5
    && (parts[4] === 'lease' || parts[4] === 'result');
  if (isWorker && !workerAction) {
    return jsonResponse({ error: 'Forbidden: worker credential is limited to lease/result intake' }, 403);
  }
  if (isAdmin && workerAction) {
    return jsonResponse({ error: 'Forbidden: lease/result intake requires worker authentication' }, 403);
  }
  if (isRunner) {
    const refusal = canaryRunnerGate(request, env, user, parts);
    if (refusal) return refusal;
  }

  try {
    if (parts.length === 2 && request.method === 'GET') {
      const payload = await loadMissionControlEvidence(env, fetchImpl);
      return jsonResponse(payload);
    }

    // Operator-only (the worker credential is refused above): which release is running and whether its
    // Mission Control bindings are usable. Reports presence/fingerprints, never values.
    if (parts[2] === 'provenance' && parts.length === 3 && request.method === 'GET') {
      return jsonResponse(await buildProvenanceReport(env, { requestUrl: request.url }));
    }

    if (parts[2] === 'operations' && parts.length === 3 && request.method === 'GET') {
      // Read-only projection of the durable records. It grants no authority and writes nothing.
      await workItemStore(env);
      await ensureOutboxSchema(env.DB);
      const rows = async (sql) => (await env.DB.prepare(sql).all()).results || [];
      let workItems = await rows('SELECT * FROM mc_work_items');
      let events = await rows('SELECT event_id, work_item_id, event_type, from_state, to_state, occurred_at, evidence_digest, detail_json FROM mc_work_item_events');
      let effects = await rows('SELECT * FROM mc_effects');
      let leases = await rows('SELECT * FROM mc_work_item_leases');
      if (isRunner) {
        // The runner sees only the enabled canary's own material, never unrelated operator visibility.
        workItems = workItems.filter((row) => row.producer === CANARY_PRODUCER
          && row.property_id === CANARY_PROPERTY_ID
          && row.finding_key === CANARY_FINDING_KEY);
        const ids = new Set(workItems.map((row) => row.work_item_id));
        events = events.filter((row) => ids.has(row.work_item_id));
        effects = effects.filter((row) => ids.has(row.work_item_id));
        leases = leases.filter((row) => ids.has(row.work_item_id));
      }
      const operations = projectMissionControlOperations({ now: nowIso(), workItems, events, effects, leases });
      return jsonResponse({ operations });
    }

    if (parts[2] === 'canary-observations' && parts.length === 3 && request.method === 'POST') {
      requireCanary(env);
      const store = await workItemStore(env);
      const body = await readJson(request);
      requireOnlyKeys(body, ['status']);
      const saved = await recordCanaryObservation(store, { status: body.status, checkedAt: nowIso(), ...(isRunner ? { actor: user.id } : {}) });
      return jsonResponse({ workItem: saved });
    }

    if (parts[2] === 'work-items' && parts.length === 5 && parts[4] === 'dispatch' && request.method === 'POST') {
      // Durable intent, then one claim. This authorizes nothing by itself: the lease route still demands this exact
      // intent, the current claim and the signed contract digest, and the dispatch grants no repair or deploy authority.
      // It is part of the canary, not a general dispatcher: same kill switch, canary-produced items only, no caller input.
      requireCanary(env);
      requireOnlyKeys(await readJson(request), []);
      const store = await workItemStore(env);
      const item = await store.get(decodeURIComponent(parts[3]));
      if (!item) throw new WorkItemError('not_found', 'Work item was not found', 404);
      if (!canaryEligible(item, env)) {
        if (isRunner) throw new WorkItemError('not_found', 'Work item was not found', 404);
        throw new WorkItemError('canary_ineligible', 'Only the canonical enabled canary work item can be dispatched here', 403);
      }
      if (item.state !== 'INVESTIGATION_READY' || !item.investigation?.digest) {
        throw new WorkItemError('illegal_transition', 'Only an investigation-ready item with a signed contract can be dispatched', 409);
      }
      await ensureOutboxSchema(env.DB);
      let planned;
      try {
        planned = await planEffect(env.DB, {
          workItemId: item.workItemId,
          requestedLifecycleVersion: item.lifecycleVersion,
          effectType: 'investigation_dispatch',
          target: `fwomps:${item.propertyId}`,
          candidateDigest: item.investigation.digest,
          payload: {
            summary: 'dispatch one bounded read-only investigation',
            propertyId: item.propertyId,
            findingKey: item.findingKey,
            profileId: item.investigationProfile,
          },
        });
      } catch (error) {
        if (error?.code === 'stale_version') {
          throw new WorkItemError(
            'stale_dispatch',
            'A newer observation invalidated this dispatch intent; recover it, then issue a fresh signed investigation',
            409,
          );
        }
        throw error;
      }
      const claim = await claimDispatch(env.DB, planned.effect.effectId);
      if (!claim.permit) {
        if (claim.reason === 'stale_lifecycle') {
          throw new WorkItemError(
            'stale_dispatch',
            'A newer observation invalidated this dispatch intent; recover it, then issue a fresh signed investigation',
            409,
          );
        }
        throw new WorkItemError('dispatch_not_claimable', `dispatch intent cannot be claimed now (${claim.reason || 'unavailable'})`, 409);
      }
      return jsonResponse({
        effectId: planned.effect.effectId,
        attempt: claim.permit.attempt,
        created: planned.created,
        contractDigest: item.investigation.digest,
        requestId: item.investigation.requestId,
      });
    }

    if (parts[2] === 'work-items' && parts.length === 5 && parts[4] === 'recover-dispatch' && request.method === 'POST') {
      // A newer observation may advance the lifecycle after a dispatch claim but before /lease. Never
      // weaken that fence. Once the abandoned claim is outside its visibility window, kill the stale
      // intent and return to QUALIFIED so a fresh signed contract/new effect must be issued.
      requireCanary(env);
      requireOnlyKeys(await readJson(request), []);
      const store = await workItemStore(env);
      const id = decodeURIComponent(parts[3]);
      const item = await store.get(id);
      if (!item) throw new WorkItemError('not_found', 'Work item was not found', 404);
      if (!canaryEligible(item, env)) {
        throw new WorkItemError('canary_ineligible', 'Only the canonical enabled canary work item can be recovered here', 403);
      }
      if (item.state !== 'INVESTIGATION_READY' || item.activeLease || !item.investigation?.digest) {
        throw new WorkItemError('illegal_transition', 'Only a stale investigation-ready canary dispatch can be recovered', 409);
      }
      await ensureOutboxSchema(env.DB);
      const effect = await env.DB.prepare(`
        SELECT effect_id, status, requested_lifecycle_version, attempt_count, last_attempt_at, candidate_digest
        FROM mc_effects
        WHERE work_item_id = ? AND effect_type = 'investigation_dispatch' AND candidate_digest = ?
        ORDER BY created_at DESC LIMIT 1
      `).bind(item.workItemId, item.investigation.digest).first();
      if (!effect || Number(effect.requested_lifecycle_version) === Number(item.lifecycleVersion)) {
        throw new WorkItemError('dispatch_recovery_unavailable', 'No stale dispatch intent is recorded for this investigation', 409);
      }
      if (effect.status === 'COMMITTED' || effect.status === 'VERIFIED') {
        throw new WorkItemError('dispatch_recovery_unavailable', 'A consumed dispatch intent cannot be recovered', 409);
      }
      const reason = 'stale dispatch invalidated by a newer observation';
      if (effect.status === 'PLANNED') {
        try {
          await abandonEffect(env.DB, effect.effect_id, reason);
        } catch (error) {
          if (error?.code === 'in_flight') {
            throw new WorkItemError(
              'dispatch_recovery_wait',
              'The stale dispatch claim may still be running; retry recovery after its visibility window',
              409,
            );
          }
          throw error;
        }
      }
      const recovered = await mutate(store, id, async (current, at) => {
        if (current.state !== 'INVESTIGATION_READY' || current.activeLease || current.investigation?.digest !== item.investigation.digest) {
          throw new WorkItemError('version_conflict', 'The work item changed while stale dispatch recovery was running', 409);
        }
        const next = recoverStaleDispatch(current, at);
        next.pendingEvent = {
          at,
          from: current.state,
          to: next.state,
          reason: 'stale dispatch abandoned; a fresh signed investigation is required',
          actor: user.id,
          detail: {
            abandonment: {
              reason: 'stale_dispatch',
              effectId: effect.effect_id,
              attempt: Number(effect.attempt_count || 0),
            },
          },
        };
        return next;
      });
      return jsonResponse({
        workItem: recovered,
        abandonedEffectId: effect.effect_id,
        reissueRequired: true,
      });
    }

    if (parts[2] === 'work-items' && parts.length === 3 && request.method === 'GET') {
      const store = await workItemStore(env);
      const all = await store.list();
      const workItems = isRunner ? all.filter((entry) => canaryEligible(entry, env)) : all;
      return jsonResponse({ workItems });
    }

    if (parts[2] === 'work-items' && parts.length === 4 && request.method === 'GET') {
      const store = await workItemStore(env);
      const id = decodePathPart(parts[3]);
      if (!id) return jsonResponse({ error: 'Work item was not found' }, 404);
      const item = await store.get(id);
      if (!item || (isRunner && !canaryEligible(item, env))) return jsonResponse({ error: 'Work item was not found' }, 404);
      return jsonResponse({ workItem: item });
    }

    // MC-FW-002 PREPARE adjudication. Separate key, permission and ledger from OBSERVE; the signed grant
    // lets FWOMPS prepare an unpromoted candidate and nothing more. Disabled unless explicitly enabled.
    if (parts[2] === 'work-items' && parts.length === 5 && parts[4] === 'prepare' && request.method === 'POST') {
      if (isRunner || isWorker) {
        return jsonResponse({ error: 'Forbidden: PREPARE requires an adjudicating admin' }, 403);
      }
      if (env.MISSION_CONTROL_PREPARE_ENABLED !== 'true') {
        return jsonResponse({ error: 'PREPARE issuance is disabled', code: 'prepare_disabled' }, 404);
      }
      const approverId = prepareApprover(user);
      const id = decodePathPart(parts[3]);
      if (!id) return jsonResponse({ error: 'Work item was not found' }, 404);
      const body = await readJson(request);
      requireOnlyKeys(body, ['requestedPaths', 'baseSha', 'requestedAt']);
      const store = await workItemStore(env);
      const item = await store.get(id);
      if (!item) return jsonResponse({ error: 'Work item was not found' }, 404);
      const signingKey = await importPrepareSigningKey(env.MISSION_CONTROL_PREPARE_SIGNING_KEY);
      const grant = await buildSignedPrepareContract(item, resolveEstateBinding(item.propertyId), {
        requestedPaths: body.requestedPaths,
        baseSha: body.baseSha,
        requestedAt: body.requestedAt,
        // The authenticated adjudicator is the requester of record; a body cannot name another subject.
        requesterId: approverId,
        approverId,
        signingKey,
        keyId: env.MISSION_CONTROL_PREPARE_KEY_ID || '',
        now: new Date(),
      });
      await recordPrepareGrant(env.DB, grant, { workItemId: id, approverId, issuedAt: grant.payload.lifetime.issued_at });
      return jsonResponse({
        grant: {
          contractId: grant.contractId,
          contractDigest: grant.contractDigest,
          expiresAt: grant.expiresAt,
          promotionAuthority: false,
          fact: 'repair contract (PREPARE grant) — not a candidate, not verification, not promotion or resolution',
        },
        contract: grant.payload,
      }, 201);
    }

    if (parts[2] === 'work-items' && parts.length === 5 && request.method === 'POST') {
      const id = decodePathPart(parts[3]);
      if (!id) return jsonResponse({ error: 'Work item was not found' }, 404);
      const action = parts[4];
      const store = await workItemStore(env);
      const body = await readJson(request);
      if (isRunner) {
        // The generic transition/investigate actions are NOT arbitrary machine operations: exactly the canary item,
        // exactly the specimen's QUALIFIED transition / read-only investigation, and no caller-chosen extras.
        const target = await store.get(id);
        if (!target || !canaryEligible(target, env)) throw new WorkItemError('not_found', 'Work item was not found', 404);
        if (action === 'transition') {
          requireOnlyKeys(body, ['to']);
          if (body.to !== 'QUALIFIED') throw new WorkItemError('canary_forbidden_transition', 'The canary runner may only qualify the canary item', 403);
        } else if (action === 'investigate') {
          requireOnlyKeys(body, ['evidenceRevision']);
          if (!SHA40.test(body.evidenceRevision || '')) {
            throw new WorkItemError('malformed_evidence_revision', 'The canary runner requires a full lowercase commit SHA evidence revision', 400);
          }
        }
      }
      const dispatch = {};
      const conflictHooks = { actor: isRunner ? user.id : 'operator' };
      if (action === 'result') {
        // A concurrent identical delivery loses the swap to its twin. Reload: if the item is now
        // DIAGNOSED with exactly this authenticated result digest, it is the same delivery.
        conflictHooks.onVersionConflict = async (fresh) => {
          if (fresh?.state === 'DIAGNOSED' && dispatch.resultDigest
            && fresh.diagnosis?.resultDigest === dispatch.resultDigest) {
            return fresh;
          }
          if (fresh?.state === 'DIAGNOSED') {
            throw new WorkItemError('result_conflict', 'A different result is already recorded for this investigation', 409);
          }
          return null;
        };
      }
      const saved = await mutate(store, id, async (current, at) => {
        if (action === 'transition') {
          if (body.to === 'QUALIFIED') {
            return qualifyFromRegistry(current, resolveEstateBinding(current.propertyId));
          }
          return operatorTransition(current, body.to, { reason: body.reason || null });
        }
        if (action === 'investigate') {
          const key = keyBytesFromEnv(env.MISSION_CONTROL_CONTRACT_KEY);
          const contract = await buildSignedInvestigationContract(current, {
            evidenceRevision: body.evidenceRevision,
            subjectId: user.id,
            key,
            keyId: env.MISSION_CONTROL_CONTRACT_KEY_ID || '',
            now: new Date(at),
          });
          if (isRunner && (contract.repairAuthority !== false || contract.payload?.contract?.requested_mode !== 'read_only')) {
            throw new WorkItemError('repair_authority_denied', 'The canary runner can only issue read-only investigations', 403);
          }
          const next = issueInvestigation(current, contract);
          next.pendingEvent = {
            at,
            from: current.state,
            to: next.state,
            reason: `signed investigation ${contract.requestId}`,
            actor: user.id,
            detail: {
              investigation: {
                requestId: contract.requestId,
                digest: contract.digest,
                repairAuthority: false,
                schemaVersion: contract.schemaVersion,
                expiresAt: contract.payload.contract.expires_at,
                diagnosticDigest: contract.payload.diagnostic.digest,
                snapshotDigest: contract.payload.evidence.snapshot_digest,
                signedContract: contract.payload,
              },
            },
          };
          dispatch.contract = contract.payload;
          return next;
        }
        if (action === 'lease') {
          const investigation = current.investigation;
          if (!investigation?.signedContract || !investigation.expiresAt || !investigation.digest || !investigation.requestId) {
            throw new WorkItemError('unsigned_contract', 'Investigation contract is not available to lease', 409);
          }
          // No lease without durable prior intent authority: a committed, eligible investigation_dispatch
          // intent for this work item, this attempt and this exact signed contract digest.
          const authority = await resolveLeaseAuthority(env.DB, current, body, at);
          const key = keyBytesFromEnv(env.MISSION_CONTROL_CONTRACT_KEY);
          const workerId = env.MISSION_CONTROL_RESULT_WORKER_ID;
          const grant = await buildSignedLeaseGrant({
            requestId: investigation.requestId,
            contractDigest: investigation.digest,
            workerId,
            attempt: 1,
            maxAttempts: 1,
            expiresAt: investigation.expiresAt,
            key,
            keyId: env.MISSION_CONTROL_CONTRACT_KEY_ID || '',
            now: new Date(at),
          });
          const verified = await verifySignedEnvelope(grant.payload, key, LEASE_PURPOSE, ['mac']);
          if (!verified) {
            throw new WorkItemError('unsigned_contract', 'Lease grant did not verify', 409);
          }
          const next = associateLease(current, {
            workerId: grant.workerId,
            attempt: grant.attempt,
            leaseTokenDigest: grant.leaseTokenDigest,
            expiresAt: grant.expiresAt,
            requestId: investigation.requestId,
          }, at);
          next.pendingEvent = {
            at,
            from: current.state,
            to: next.state,
            reason: `leased to ${grant.workerId}`,
            actor: grant.workerId,
            detail: {
              requestId: investigation.requestId,
              lease: { attempt: grant.attempt, leaseTokenDigest: grant.leaseTokenDigest },
              dispatchIntent: { effectId: authority.effectId, attempt: authority.attempt, candidateDigest: authority.contractDigest },
            },
          };
          next.leaseAuthority = { effectId: authority.effectId, attempt: authority.attempt, contractDigest: authority.contractDigest };
          dispatch.contract = investigation.signedContract;
          dispatch.leaseGrant = grant.payload;
          dispatch.leaseTokenHex = grant.leaseTokenHex;
          return next;
        }
        if (action === 'result') {
          const result = await readInvestigationResult(body, resolveResultKey(env, body?.authentication?.key_id));
          dispatch.resultDigest = result.resultDigest;
          const next = acceptInvestigationResult(current, result, at);
          if (next.skipEvent) return next;
          next.pendingEvent = {
            at,
            from: current.state,
            to: next.state,
            reason: result.summary,
            actor: result.workerId,
            detail: {
              summary: result.summary,
              outcome: result.outcome,
              stopReason: result.stopReason,
              attempt: result.attempt,
              leaseTokenDigest: result.leaseTokenDigest,
            },
          };
          return next;
        }
        if (action === 'expire') {
          const investigation = current.investigation;
          const lease = current.activeLease;
          const next = abandonExpiredInvestigation(current, at);
          next.pendingEvent = {
            at,
            from: current.state,
            to: next.state,
            reason: 'lease expired; the single attempt is abandoned and a fresh signed contract is required',
            actor: user.id,
            detail: {
              abandonment: {
                reason: 'lease_expired',
                requestId: investigation?.requestId ?? null,
                leaseTokenDigest: lease.leaseId,
                workerId: lease.workerId,
                attempt: lease.attempt ?? null,
                leaseExpiredAt: lease.expiresAt,
                abandonedAt: at,
              },
            },
          };
          return next;
        }
        throw new WorkItemError('not_found', 'Unknown work-item action', 404);
      }, { ...conflictHooks });
      return jsonResponse({
        workItem: saved,
        ...(dispatch.contract ? { contract: dispatch.contract } : {}),
        ...(dispatch.leaseGrant ? {
          leaseGrant: dispatch.leaseGrant,
          leaseTokenHex: dispatch.leaseTokenHex,
        } : {}),
      });
    }

    if (request.method !== 'GET' && request.method !== 'POST') {
      return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET, POST' });
    }
    return jsonResponse({ error: 'Not found' }, 404);
  } catch (error) {
    if (error instanceof EvidenceContractError) {
      console.error('[mission-control] evidence contract rejected:', error.plane);
      return jsonResponse({
        error: 'Mission Control evidence contract was rejected',
        plane: error.plane,
      }, 502);
    }
    if (error?.code === 'UPSTREAM_NOT_CONFIGURED') {
      return jsonResponse({ error: 'Mission Control evidence source is not configured' }, 503);
    }
    if (error instanceof PrepareIssuerError) {
      return jsonResponse({ error: error.message, code: error.code }, error.status || 409);
    }
    const workItemError = mapWorkItemError(error);
    if (workItemError) {
      return jsonResponse({ error: workItemError.message, code: workItemError.code }, workItemError.status || 409);
    }
    console.error('[mission-control] request failed');
    return jsonResponse({ error: 'Mission Control evidence is temporarily unavailable' }, 502);
  }
}
