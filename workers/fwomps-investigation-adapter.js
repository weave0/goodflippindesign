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
 * FWOMPS has not published a result wire schema yet (the lease slice calls
 * that a later envelope). Result intake therefore stays behind
 * gfd-investigation-result-holding-1. The operator UI reads the holding
 * diagnosis, never raw FWOMPS result fields.
 */

export const INVESTIGATION_SCHEMA = 'mc-fw-investigation-request-1';
export const INVESTIGATION_PURPOSE = 'gfd->fwomps:investigation-request:v1';
export const RESULT_SCHEMA = 'gfd-investigation-result-holding-1';
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

const RESULT_TOP_FIELDS = [
  'schema_version', 'work_item_id', 'request_id', 'contract_digest',
  'worker_id', 'diagnosis', 'authentication',
];

export async function signResultHolding(holding, key) {
  requireObject(holding, 'result');
  const unsigned = JSON.parse(JSON.stringify(holding));
  unsigned.authentication = { key_id: holding.authentication?.key_id };
  const mac = await macFor(unsigned, key, RESULT_PURPOSE);
  unsigned.authentication = { key_id: holding.authentication?.key_id, mac };
  return unsigned;
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

export async function readInvestigationResult(envelope, key) {
  requireObject(envelope, 'result');
  const present = Object.keys(envelope);
  const missing = RESULT_TOP_FIELDS.filter((field) => !present.includes(field));
  const extra = present.filter((field) => !RESULT_TOP_FIELDS.includes(field));
  if (missing.length || extra.length) {
    throw new InvestigationAdapterError(
      'malformed_result',
      'investigation result does not match the holding contract',
    );
  }
  if (envelope.schema_version !== RESULT_SCHEMA) {
    throw new InvestigationAdapterError('schema_version_mismatch', 'unsupported investigation result schema');
  }
  if (!REQUEST_ID.test(envelope.request_id || '')) {
    throw new InvestigationAdapterError('malformed_request_id', 'result request id is not canonical');
  }
  if (!DIGEST_TEXT.test(envelope.contract_digest || '')) {
    throw new InvestigationAdapterError('malformed_digest', 'result contract digest is not canonical');
  }
  if (typeof envelope.work_item_id !== 'string' || !envelope.work_item_id) {
    throw new InvestigationAdapterError('malformed_work_item', 'result work item id is required');
  }
  if (typeof envelope.worker_id !== 'string' || !envelope.worker_id) {
    throw new InvestigationAdapterError('malformed_worker', 'result worker id is required');
  }
  requireObject(envelope.diagnosis, 'result.diagnosis');
  const diagnosisFields = Object.keys(envelope.diagnosis);
  if (diagnosisFields.some((field) => !['summary', 'evidence'].includes(field))) {
    throw new InvestigationAdapterError('malformed_result', 'diagnosis contains fields outside the holding contract');
  }
  if (typeof envelope.diagnosis.summary !== 'string' || !envelope.diagnosis.summary.trim()) {
    throw new InvestigationAdapterError('malformed_diagnosis', 'diagnosis summary is required');
  }
  if (envelope.diagnosis.evidence !== undefined && !Array.isArray(envelope.diagnosis.evidence)) {
    throw new InvestigationAdapterError('malformed_diagnosis', 'diagnosis evidence must be a list of statements');
  }
  scanForbidden(envelope.diagnosis, 'diagnosis');
  requireObject(envelope.authentication, 'result.authentication');
  if (!(key instanceof Uint8Array) || !key.byteLength) {
    throw new InvestigationAdapterError('signing_key_unavailable', 'result verification key is not configured');
  }
  const verified = await verifySignedEnvelope(envelope, key, RESULT_PURPOSE, ['authentication', 'mac']);
  if (!verified) {
    throw new InvestigationAdapterError('mac_invalid', 'investigation result signature did not verify');
  }
  return {
    schemaVersion: RESULT_SCHEMA,
    workItemId: envelope.work_item_id,
    requestId: envelope.request_id,
    contractDigest: envelope.contract_digest,
    workerId: envelope.worker_id,
    summary: envelope.diagnosis.summary.trim(),
    evidence: (envelope.diagnosis.evidence || []).map((item) => String(item)),
    resultDigest: await envelopeDigest(envelope, ['authentication', 'mac']),
  };
}
