/**
 * GFD-side adapter for the FWOMPS Mission Control investigation boundary.
 *
 * The investigation request uses the MC-FW-001 field set and MAC construction
 * from the accepted authority model:
 *   schema mc-fw-investigation-request-1
 *   purpose gfd->fwomps:investigation-request:v1
 *   digest  SHA-256(JCS(envelope without authentication.mac))
 *   mac     HMAC-SHA256(key, UTF8(purpose) || 0x00 || raw digest)
 *
 * Lease grants and results use the published MC-FW-001 wire formats.
 * GFD signs `mc-fw-lease-grant-1`. FWOMPS signs `mc-fw-investigation-result-1`.
 * Result `key_id` selects the worker key. The envelope's worker id is checked
 * against that binding afterwards, and repair scope is never returned.
 */

export const INVESTIGATION_SCHEMA = 'mc-fw-investigation-request-1';
export const INVESTIGATION_PURPOSE = 'gfd->fwomps:investigation-request:v1';
export const LEASE_SCHEMA = 'mc-fw-lease-grant-1';
export const LEASE_PURPOSE = 'gfd->fwomps:lease-grant:v1';
export const RESULT_SCHEMA = 'mc-fw-investigation-result-1';
export const RESULT_PURPOSE = 'fwomps->gfd:investigation-result:v1';

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const DIGEST_TEXT = /^sha256:[0-9a-f]{64}$/;
const MAC_TEXT = /^[0-9a-f]{64}$/;
const REQUEST_ID = /^mci_[A-Za-z0-9_-]{8,76}$/;
const SHA = /^[0-9a-f]{40}$/;

const FORBIDDEN_PAYLOAD_FIELDS = new Set([
  'root', 'source_root', 'workspace_path', 'verification_commands', 'shell',
  'command', 'argv', 'sandbox_backend', 'trust', 'protected_paths',
  'permitted_paths', 'promotion', 'approval', 'credentials', 'env', 'environment',
]);

export class InvestigationAdapterError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'InvestigationAdapterError';
    this.code = code;
  }
}

function utf16Units(value) {
  const units = [];
  for (let i = 0; i < value.length; i += 1) units.push(value.charCodeAt(i));
  return units;
}

function compareUtf16(a, b) {
  const left = utf16Units(a);
  const right = utf16Units(b);
  const length = Math.min(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

function encodeString(value) {
  return JSON.stringify(value);
}

function encode(value, path) {
  if (value === null) return 'null';
  if (value === true) return 'true';
  if (value === false) return 'false';
  if (typeof value === 'string') return encodeString(value);
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value > MAX_SAFE_INTEGER || value < -MAX_SAFE_INTEGER) {
      throw new InvestigationAdapterError(
        'malformed_number',
        `MC v1 protocol values must be safe integers at ${path}`,
      );
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, index) => encode(item, `${path}[${index}]`)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new InvestigationAdapterError('malformed_key', `object keys must be strings at ${path}`);
    }
    keys.sort(compareUtf16);
    return `{${keys.map((key) => `${encodeString(key)}:${encode(value[key], `${path}.${key}`)}`).join(',')}}`;
  }
  throw new InvestigationAdapterError('unsupported_type', `unsupported MC value at ${path}`);
}

export function jcsBytes(value) {
  return new TextEncoder().encode(encode(value, '$'));
}

async function sha256(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(digest);
}

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function digestOf(value) {
  return `sha256:${hex(await sha256(jcsBytes(value)))}`;
}

export function keyBytesFromEnv(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i += 1) out[i] = Number.parseInt(trimmed.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  if (trimmed.length < 16) return null;
  return new TextEncoder().encode(trimmed);
}

function concat(parts) {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmacSha256(key, message) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, message);
  return new Uint8Array(signature);
}

function withoutMac(envelope, macPath) {
  const copy = JSON.parse(JSON.stringify(envelope));
  let cursor = copy;
  for (let i = 0; i < macPath.length - 1; i += 1) {
    cursor = cursor?.[macPath[i]];
    if (!cursor || typeof cursor !== 'object') {
      throw new InvestigationAdapterError('malformed_mac', 'envelope is missing its MAC field');
    }
  }
  const last = macPath[macPath.length - 1];
  if (!Object.prototype.hasOwnProperty.call(cursor, last)) {
    throw new InvestigationAdapterError('malformed_mac', 'envelope is missing its MAC field');
  }
  delete cursor[last];
  return copy;
}

async function macFor(unsigned, key, purpose) {
  const digest = await sha256(jcsBytes(unsigned));
  const message = concat([new TextEncoder().encode(purpose), new Uint8Array([0]), digest]);
  return hex(await hmacSha256(key, message));
}

export async function envelopeDigest(envelope, macPath) {
  const raw = await sha256(jcsBytes(withoutMac(envelope, macPath)));
  return `sha256:${hex(raw)}`;
}

function scanForbidden(value, path) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbidden(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PAYLOAD_FIELDS.has(key)) {
      throw new InvestigationAdapterError('forbidden_field', `${path}.${key} is not a permitted investigation field`);
    }
    scanForbidden(child, `${path}.${key}`);
  }
}

function randomHex(bytes) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return hex(buffer);
}

function requireObject(value, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InvestigationAdapterError('malformed_field', `${where} must be an object`);
  }
}

export async function buildSignedInvestigationContract(workItem, options) {
  requireObject(workItem, 'work item');
  const evidenceRevision = String(options?.evidenceRevision || '').toLowerCase();
  if (!SHA.test(evidenceRevision)) {
    throw new InvestigationAdapterError(
      'malformed_evidence_revision',
      'evidence revision must be the 40-character commit SHA the investigation is bound to',
    );
  }
  if (!workItem.repository || !workItem.investigationProfile) {
    throw new InvestigationAdapterError(
      'binding_unavailable',
      'the governed estate binding has no canonical repository or investigation profile for this work item',
    );
  }
  const key = options?.key;
  const keyId = options?.keyId;
  if (!(key instanceof Uint8Array) || !key.byteLength || typeof keyId !== 'string' || !keyId) {
    throw new InvestigationAdapterError('signing_key_unavailable', 'investigation signing key is not configured');
  }

  const now = options.now instanceof Date ? options.now : new Date();
  const issuedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const lifetimeSeconds = Number.isInteger(options.lifetimeSeconds) ? options.lifetimeSeconds : 600;
  if (lifetimeSeconds <= 0 || lifetimeSeconds > 900) {
    throw new InvestigationAdapterError('malformed_lifetime', 'investigation lifetime must be between 1 and 900 seconds');
  }
  const maxRuntimeSeconds = Number.isInteger(options.maxRuntimeSeconds) ? options.maxRuntimeSeconds : 180;
  if (maxRuntimeSeconds <= 0 || maxRuntimeSeconds > 300) {
    throw new InvestigationAdapterError('malformed_runtime', 'investigation runtime must be between 1 and 300 seconds');
  }
  const expiresAt = new Date(now.getTime() + lifetimeSeconds * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

  const diagnosticPayload = {
    work_item_id: workItem.workItemId,
    property_id: workItem.propertyId,
    severity: workItem.severity,
    confidence: workItem.confidence,
    occurrence_count: workItem.occurrenceCount,
    last_seen: workItem.lastSeen,
    verification_predicate: workItem.verificationPredicate,
    investigation_profile: workItem.investigationProfile,
  };
  scanForbidden(diagnosticPayload, 'diagnostic.payload');
  const diagnosticDigest = await digestOf(diagnosticPayload);
  const snapshot = {
    work_item_id: workItem.workItemId,
    evidence_revision: evidenceRevision,
    evidence_digest: workItem.evidenceDigest,
    generated_at: workItem.lastSeen,
  };
  const requestId = `mci_${randomHex(16)}`;
  if (!REQUEST_ID.test(requestId)) {
    throw new InvestigationAdapterError('malformed_request_id', 'request id was not canonical');
  }

  const unsigned = {
    schema_version: INVESTIGATION_SCHEMA,
    request_id: requestId,
    operation: 'investigate',
    diagnostic: {
      id: workItem.workItemId,
      digest: diagnosticDigest,
      source: {
        path: `mission-control/work-items/${workItem.workItemId}`,
        file_sha256: diagnosticDigest,
        json_pointer: '',
      },
      payload: diagnosticPayload,
    },
    property: {
      id: workItem.propertyId,
      expected_repository: workItem.repository,
    },
    evidence: {
      repository: workItem.repository,
      revision: evidenceRevision,
      snapshot_digest: await digestOf(snapshot),
      generated_at: workItem.lastSeen,
      freshness_state: 'operator-attested',
    },
    operator: {
      subject_id: String(options.subjectId || ''),
      requested_at: issuedAt,
    },
    contract: {
      issued_at: issuedAt,
      expires_at: expiresAt,
      nonce: randomHex(16),
      max_runtime_seconds: maxRuntimeSeconds,
      requested_mode: 'read_only',
    },
    authentication: {
      key_id: keyId,
    },
  };
  if (!unsigned.operator.subject_id) {
    throw new InvestigationAdapterError('malformed_operator', 'operator subject is required');
  }

  const mac = await macFor(unsigned, key, INVESTIGATION_PURPOSE);
  const payload = {
    ...unsigned,
    authentication: { key_id: keyId, mac },
  };
  return {
    schemaVersion: INVESTIGATION_SCHEMA,
    purpose: INVESTIGATION_PURPOSE,
    requestId,
    digest: await envelopeDigest(payload, ['authentication', 'mac']),
    wireStatus: 'signed',
    repairAuthority: false,
    payload,
  };
}

function canonicalUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new InvestigationAdapterError('malformed_timestamp', 'timestamp is not a UTC instant');
  }
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export async function buildSignedLeaseGrant(options) {
  const key = options?.key;
  const keyId = options?.keyId;
  if (!(key instanceof Uint8Array) || !key.byteLength || typeof keyId !== 'string' || !keyId) {
    throw new InvestigationAdapterError('signing_key_unavailable', 'lease signing key is not configured');
  }
  if (!REQUEST_ID.test(options?.requestId || '')) {
    throw new InvestigationAdapterError('malformed_request_id', 'lease request id is not canonical');
  }
  if (!DIGEST_TEXT.test(options?.contractDigest || '')) {
    throw new InvestigationAdapterError('malformed_digest', 'lease contract digest is not canonical');
  }
  const workerId = options?.workerId;
  if (typeof workerId !== 'string' || !workerId.trim() || workerId.length > 128) {
    throw new InvestigationAdapterError('malformed_worker', 'enrolled worker id is required');
  }
  const attempt = options?.attempt;
  const maxAttempts = options?.maxAttempts;
  if (!Number.isInteger(attempt) || attempt < 1
    || !Number.isInteger(maxAttempts) || maxAttempts < 1
    || attempt > maxAttempts) {
    throw new InvestigationAdapterError('malformed_attempt', 'lease attempt is outside the allowed range');
  }
  const issuedAt = canonicalUtc(options.now);
  const expiresAt = canonicalUtc(options.expiresAt);
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new InvestigationAdapterError('malformed_lease_lifetime', 'lease expires at or before it is issued');
  }
  const token = new Uint8Array(32);
  crypto.getRandomValues(token);
  const leaseTokenDigest = `sha256:${hex(await sha256(token))}`;
  const unsigned = {
    schema_version: LEASE_SCHEMA,
    purpose: LEASE_PURPOSE,
    request_id: options.requestId,
    contract_digest: options.contractDigest,
    worker_id: workerId,
    attempt,
    lease_token_digest: leaseTokenDigest,
    lease_issued_at: issuedAt,
    lease_expires_at: expiresAt,
    max_attempts: maxAttempts,
    key_id: keyId,
  };
  const payload = { ...unsigned, mac: await macFor(unsigned, key, LEASE_PURPOSE) };
  return {
    schemaVersion: LEASE_SCHEMA,
    purpose: LEASE_PURPOSE,
    payload,
    leaseTokenHex: hex(token),
    leaseTokenDigest,
    attempt,
    workerId,
    expiresAt,
  };
}

export async function verifySignedEnvelope(envelope, key, purpose, macPath) {
  requireObject(envelope, 'envelope');
  let cursor = envelope;
  for (const part of macPath) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return false;
    cursor = cursor[part];
  }
  if (typeof cursor !== 'string' || !MAC_TEXT.test(cursor)) return false;
  const expected = await macFor(withoutMac(envelope, macPath), key, purpose);
  if (expected.length !== cursor.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ cursor.charCodeAt(i);
  return diff === 0;
}

const OUTCOMES = new Set(['reproduced', 'not_reproduced', 'inconclusive', 'blocked']);
const STOP_REASONS = new Set([
  'repository_identity',
  'sandbox_unavailable',
  'worktree_not_accepted',
  'worktree_changed_during_run',
  'sandbox_authority_lost',
  'source_materialization_failed',
  'profile_unavailable',
  'runtime_budget_exhausted',
  'internal_error',
]);
const RECEIPT_STATUSES = new Set(['pass', 'fail', 'error']);
const SOURCE_STATES = new Set(['accepted_by_host_policy', 'not_accepted']);
const RESULT_TOP_KEYS = [
  'schema_version', 'request_id', 'contract_digest', 'attempt', 'lease_token_digest', 'worker',
  'source', 'evidence', 'outcome', 'summary', 'observations', 'execution_receipts',
  'repairability', 'stop_reason', 'authentication',
];
const WORKER_KEYS = ['id', 'fwomps_version', 'completed_at'];
const SOURCE_KEYS = ['property_id', 'repository', 'workspace_name', 'inspected_head_sha', 'source_state'];
const EVIDENCE_KEYS = ['revision', 'snapshot_digest', 'diagnostic_id', 'diagnostic_digest'];
const RECEIPT_KEYS = [
  'profile', 'index', 'status', 'exit_code', 'output_digest', 'stdout_excerpt', 'stderr_excerpt',
  'output_truncated', 'timed_out', 'authoritative_sandbox',
];
const REPAIRABILITY_KEYS = ['state', 'advisory_repair_scope'];
const TIMESTAMP_TEXT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const REPOSITORY_TEXT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const WORKSPACE_TEXT = /^[A-Za-z0-9_.-]{1,128}$/;
const VERSION_TEXT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAX_EXCERPT_CHARS = 2014;
const MAX_RECEIPTS = 16;

function exactKeys(value, keys, where) {
  requireObject(value, where);
  const present = Object.keys(value);
  const missing = keys.filter((key) => !present.includes(key));
  const extra = present.filter((key) => !keys.includes(key));
  if (missing.length || extra.length) {
    throw new InvestigationAdapterError('malformed_result', `${where} does not match the result contract`);
  }
}

function boundedText(value, where, max) {
  if (typeof value !== 'string' || value.length > max) {
    throw new InvestigationAdapterError('malformed_result', `${where} is outside the result contract`);
  }
  return value;
}

function requireSha(value, where) {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw new InvestigationAdapterError('malformed_result', `${where} must be a 40-character commit SHA`);
  }
}

export function resolveResultKey(env, keyId) {
  if (typeof keyId !== 'string' || !keyId) {
    throw new InvestigationAdapterError('unknown_key', 'result authentication.key_id is required');
  }
  const configuredId = env?.MISSION_CONTROL_RESULT_KEY_ID;
  if (typeof configuredId !== 'string' || !configuredId || keyId !== configuredId) {
    throw new InvestigationAdapterError('unknown_key', 'result key_id is not a known worker key');
  }
  const key = keyBytesFromEnv(env?.MISSION_CONTROL_RESULT_KEY);
  const workerId = env?.MISSION_CONTROL_RESULT_WORKER_ID;
  if (!(key instanceof Uint8Array) || !key.byteLength || typeof workerId !== 'string' || !workerId.trim()) {
    throw new InvestigationAdapterError('signing_key_unavailable', 'result verification key is not configured');
  }
  return { key, keyId, workerId };
}

export async function signResultEnvelope(unsigned, key) {
  requireObject(unsigned, 'result');
  if (!(key instanceof Uint8Array) || !key.byteLength) {
    throw new InvestigationAdapterError('signing_key_unavailable', 'result signing key is not configured');
  }
  const mac = await macFor(unsigned, key, RESULT_PURPOSE);
  return {
    ...unsigned,
    authentication: { ...unsigned.authentication, mac },
  };
}

function validateReceipt(receipt, index) {
  exactKeys(receipt, RECEIPT_KEYS, `execution_receipts[${index}]`);
  boundedText(receipt.profile, `execution_receipts[${index}].profile`, 128);
  if (receipt.profile.length < 1) {
    throw new InvestigationAdapterError('malformed_result', 'receipt profile is required');
  }
  if (receipt.index !== index) {
    throw new InvestigationAdapterError('malformed_result', 'receipt index does not match its position');
  }
  if (!RECEIPT_STATUSES.has(receipt.status)) {
    throw new InvestigationAdapterError('malformed_result', 'receipt status is outside the closed vocabulary');
  }
  if (receipt.exit_code !== null && !Number.isInteger(receipt.exit_code)) {
    throw new InvestigationAdapterError('malformed_result', 'receipt exit_code must be an integer or null');
  }
  if (!DIGEST_TEXT.test(receipt.output_digest || '')) {
    throw new InvestigationAdapterError('malformed_digest', 'receipt output digest is not canonical');
  }
  boundedText(receipt.stdout_excerpt, `execution_receipts[${index}].stdout_excerpt`, MAX_EXCERPT_CHARS);
  boundedText(receipt.stderr_excerpt, `execution_receipts[${index}].stderr_excerpt`, MAX_EXCERPT_CHARS);
  if (typeof receipt.output_truncated !== 'boolean' || typeof receipt.timed_out !== 'boolean'
    || typeof receipt.authoritative_sandbox !== 'boolean') {
    throw new InvestigationAdapterError('malformed_result', 'receipt flags must be JSON booleans');
  }
}

function validateResultShape(envelope) {
  exactKeys(envelope, RESULT_TOP_KEYS, 'result');
  if (envelope.schema_version !== RESULT_SCHEMA) {
    throw new InvestigationAdapterError('schema_version_mismatch', 'unsupported investigation result schema');
  }
  if (!REQUEST_ID.test(envelope.request_id || '')) {
    throw new InvestigationAdapterError('malformed_request_id', 'result request id is not canonical');
  }
  if (!DIGEST_TEXT.test(envelope.contract_digest || '') || !DIGEST_TEXT.test(envelope.lease_token_digest || '')) {
    throw new InvestigationAdapterError('malformed_digest', 'result digest is not canonical');
  }
  if (!Number.isInteger(envelope.attempt) || envelope.attempt < 1) {
    throw new InvestigationAdapterError('malformed_attempt', 'result attempt must be a positive integer');
  }
  exactKeys(envelope.worker, WORKER_KEYS, 'result.worker');
  boundedText(envelope.worker.id, 'result.worker.id', 128);
  if (!envelope.worker.id || !VERSION_TEXT.test(envelope.worker.fwomps_version)
    || !TIMESTAMP_TEXT.test(envelope.worker.completed_at)) {
    throw new InvestigationAdapterError('malformed_worker', 'result worker identity is not canonical');
  }
  exactKeys(envelope.source, SOURCE_KEYS, 'result.source');
  boundedText(envelope.source.property_id, 'result.source.property_id', 253);
  if (!envelope.source.property_id || !REPOSITORY_TEXT.test(envelope.source.repository)
    || !WORKSPACE_TEXT.test(envelope.source.workspace_name)
    || !SOURCE_STATES.has(envelope.source.source_state)) {
    throw new InvestigationAdapterError('malformed_result', 'result source is outside the contract');
  }
  requireSha(envelope.source.inspected_head_sha, 'result.source.inspected_head_sha');
  exactKeys(envelope.evidence, EVIDENCE_KEYS, 'result.evidence');
  requireSha(envelope.evidence.revision, 'result.evidence.revision');
  if (!DIGEST_TEXT.test(envelope.evidence.snapshot_digest || '')
    || !DIGEST_TEXT.test(envelope.evidence.diagnostic_digest || '')
    || typeof envelope.evidence.diagnostic_id !== 'string'
    || !envelope.evidence.diagnostic_id
    || envelope.evidence.diagnostic_id.length > 256) {
    throw new InvestigationAdapterError('malformed_result', 'result evidence identity is not canonical');
  }
  if (!OUTCOMES.has(envelope.outcome)) {
    throw new InvestigationAdapterError('malformed_result', 'result outcome is outside the closed vocabulary');
  }
  if (envelope.stop_reason !== null && !STOP_REASONS.has(envelope.stop_reason)) {
    throw new InvestigationAdapterError('malformed_result', 'result stop_reason is outside the closed vocabulary');
  }
  const summary = boundedText(envelope.summary, 'result.summary', 2000);
  if (!summary.trim()) {
    throw new InvestigationAdapterError('malformed_result', 'result summary is required');
  }
  if (!Array.isArray(envelope.observations) || envelope.observations.length > MAX_RECEIPTS) {
    throw new InvestigationAdapterError('malformed_result', 'result observations are outside the contract');
  }
  envelope.observations.forEach((line, index) => boundedText(line, `observations[${index}]`, 500));
  if (!Array.isArray(envelope.execution_receipts) || envelope.execution_receipts.length > MAX_RECEIPTS) {
    throw new InvestigationAdapterError('malformed_result', 'result receipts are outside the contract');
  }
  envelope.execution_receipts.forEach(validateReceipt);
  exactKeys(envelope.repairability, REPAIRABILITY_KEYS, 'result.repairability');
  if (envelope.repairability.state !== 'not_indicated'
    || !Array.isArray(envelope.repairability.advisory_repair_scope)
    || envelope.repairability.advisory_repair_scope.length !== 0) {
    throw new InvestigationAdapterError(
      'repair_authority_denied',
      'investigation result repairability is evidence only and carries no repair scope',
    );
  }
  exactKeys(envelope.authentication, ['key_id', 'mac'], 'result.authentication');
  if (typeof envelope.authentication.key_id !== 'string' || !envelope.authentication.key_id
    || envelope.authentication.key_id.length > 128) {
    throw new InvestigationAdapterError('malformed_key_id', 'result key_id is not canonical');
  }
  if (envelope.source.source_state === 'accepted_by_host_policy'
    && envelope.source.inspected_head_sha !== envelope.evidence.revision) {
    throw new InvestigationAdapterError('malformed_result', 'accepted source head does not match the evidence revision');
  }
  const executed = envelope.outcome === 'reproduced' || envelope.outcome === 'not_reproduced';
  if (executed) {
    if (envelope.stop_reason !== null || envelope.source.source_state !== 'accepted_by_host_policy'
      || envelope.execution_receipts.length < 1
      || envelope.execution_receipts.some((receipt) => receipt.status === 'error' || !receipt.authoritative_sandbox)) {
      throw new InvestigationAdapterError('malformed_result', 'an executed outcome lacks an authoritative receipt');
    }
  }
  if (envelope.stop_reason === 'runtime_budget_exhausted' && envelope.outcome !== 'inconclusive') {
    throw new InvestigationAdapterError('malformed_result', 'a budget stop is inconclusive');
  }
  if (envelope.outcome === 'blocked') {
    if (!envelope.stop_reason || envelope.stop_reason === 'runtime_budget_exhausted'
      || envelope.execution_receipts.length !== 0) {
      throw new InvestigationAdapterError('malformed_result', 'a blocked result has no receipts and a closed stop_reason');
    }
  }
  if (envelope.stop_reason && envelope.stop_reason !== 'runtime_budget_exhausted' && envelope.outcome !== 'blocked') {
    throw new InvestigationAdapterError('malformed_result', 'an authority stop yields a blocked result');
  }
}

export async function readInvestigationResult(envelope, binding) {
  requireObject(envelope, 'result');
  validateResultShape(envelope);
  if (!(binding?.key instanceof Uint8Array) || !binding.key.byteLength || typeof binding.keyId !== 'string'
    || typeof binding.workerId !== 'string' || !binding.workerId) {
    throw new InvestigationAdapterError('signing_key_unavailable', 'result verification key is not configured');
  }
  if (envelope.authentication.key_id !== binding.keyId) {
    throw new InvestigationAdapterError('unknown_key', 'result key_id does not match the resolved worker key');
  }
  const verified = await verifySignedEnvelope(envelope, binding.key, RESULT_PURPOSE, ['authentication', 'mac']);
  if (!verified) {
    throw new InvestigationAdapterError('mac_invalid', 'investigation result signature did not verify');
  }
  if (envelope.worker.id !== binding.workerId) {
    throw new InvestigationAdapterError('worker_mismatch', 'result worker does not match the key_id binding');
  }
  return {
    schemaVersion: RESULT_SCHEMA,
    workItemId: envelope.evidence.diagnostic_id,
    requestId: envelope.request_id,
    contractDigest: envelope.contract_digest,
    attempt: envelope.attempt,
    leaseTokenDigest: envelope.lease_token_digest,
    workerId: envelope.worker.id,
    keyId: envelope.authentication.key_id,
    summary: envelope.summary.trim(),
    outcome: envelope.outcome,
    stopReason: envelope.stop_reason,
    evidenceRevision: envelope.evidence.revision,
    snapshotDigest: envelope.evidence.snapshot_digest,
    diagnosticDigest: envelope.evidence.diagnostic_digest,
    propertyId: envelope.source.property_id,
    repository: envelope.source.repository,
    sourceState: envelope.source.source_state,
    resultDigest: await envelopeDigest(envelope, ['authentication', 'mac']),
    repairAuthority: false,
  };
}
