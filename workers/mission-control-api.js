/**
 * Mission Control operator API.
 *
 * GlobalDeets evidence is accepted only when each plane matches its governed
 * contract. Health work items are a separate durable record and are not
 * labelled as that evidence.
 */

import { projectMissionControlOperations } from './lib/mission-control-operations.js';
import { claimDispatch, ensureOutboxSchema, planEffect } from './lib/mission-control-outbox.js';
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
  CANARY_PRODUCER,
  CANARY_PROPERTY_ID,
  recordCanaryObservation,
  WorkItemError,
  abandonExpiredInvestigation,
  acceptInvestigationResult,
  associateLease,
  createD1WorkItemStore,
  ensureWorkItemSchema,
  issueInvestigation,
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

/** Canary routes accept only the exact keys they document; anything else (property, command, worker, authority) is refused. */
function requireOnlyKeys(body, allowed) {
  const extra = Object.keys(body).filter((key) => !allowed.includes(key));
  if (extra.length) {
    throw new WorkItemError('unexpected_fields', `unexpected fields: ${extra.join(', ')}`, 400);
  }
}

function nowIso() {
  return new Date().toISOString();
}

async function mutate(store, id, producer, { onVersionConflict = null } = {}) {
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
    actor: 'operator',
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
  if (!isAdmin && !isWorker) {
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

  try {
    if (parts.length === 2 && request.method === 'GET') {
      const payload = await loadMissionControlEvidence(env, fetchImpl);
      return jsonResponse(payload);
    }

    if (parts[2] === 'operations' && parts.length === 3 && request.method === 'GET') {
      // Read-only projection of the durable records. It grants no authority and writes nothing.
      await workItemStore(env);
      await ensureOutboxSchema(env.DB);
      const rows = async (sql) => (await env.DB.prepare(sql).all()).results || [];
      const operations = projectMissionControlOperations({
        now: nowIso(),
        workItems: await rows('SELECT * FROM mc_work_items'),
        events: await rows('SELECT event_id, work_item_id, event_type, from_state, to_state, occurred_at, evidence_digest, detail_json FROM mc_work_item_events'),
        effects: await rows('SELECT * FROM mc_effects'),
        leases: await rows('SELECT * FROM mc_work_item_leases'),
      });
      return jsonResponse({ operations });
    }

    if (parts[2] === 'canary-observations' && parts.length === 3 && request.method === 'POST') {
      requireCanary(env);
      const store = await workItemStore(env);
      const body = await readJson(request);
      requireOnlyKeys(body, ['status']);
      const saved = await recordCanaryObservation(store, { status: body.status, checkedAt: nowIso() });
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
      if (item.producer !== CANARY_PRODUCER || item.propertyId !== env.MISSION_CONTROL_CANARY) {
        throw new WorkItemError('canary_ineligible', 'Only the canary work item of the enabled property can be dispatched here', 403);
      }
      if (item.state !== 'INVESTIGATION_READY' || !item.investigation?.digest) {
        throw new WorkItemError('illegal_transition', 'Only an investigation-ready item with a signed contract can be dispatched', 409);
      }
      await ensureOutboxSchema(env.DB);
      const planned = await planEffect(env.DB, {
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
      const claim = await claimDispatch(env.DB, planned.effect.effectId);
      if (!claim.permit) {
        throw new WorkItemError('dispatch_not_claimable', `dispatch intent cannot be claimed now (${claim.reason || 'unavailable'})`, 409);
      }
      return jsonResponse({
        dispatch: {
          effectId: planned.effect.effectId,
          attempt: claim.permit.attempt,
          created: planned.created,
          contractDigest: item.investigation.digest,
          requestId: item.investigation.requestId,
        },
      });
    }

    if (parts[2] === 'work-items' && parts.length === 3 && request.method === 'GET') {
      const store = await workItemStore(env);
      const workItems = await store.list();
      return jsonResponse({ workItems });
    }

    if (parts[2] === 'work-items' && parts.length === 4 && request.method === 'GET') {
      const store = await workItemStore(env);
      const item = await store.get(decodeURIComponent(parts[3]));
      if (!item) return jsonResponse({ error: 'Work item was not found' }, 404);
      return jsonResponse({ workItem: item });
    }

    if (parts[2] === 'work-items' && parts.length === 5 && request.method === 'POST') {
      const id = decodeURIComponent(parts[3]);
      const action = parts[4];
      const store = await workItemStore(env);
      const body = await readJson(request);
      const dispatch = {};
      const conflictHooks = {};
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
      }, conflictHooks);
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
    const workItemError = mapWorkItemError(error);
    if (workItemError) {
      return jsonResponse({ error: workItemError.message, code: workItemError.code }, workItemError.status || 409);
    }
    console.error('[mission-control] request failed');
    return jsonResponse({ error: 'Mission Control evidence is temporarily unavailable' }, 502);
  }
}
