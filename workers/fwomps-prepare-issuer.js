/**
 * MC-FW-002 PREPARE contract issuer (GFD side of `gfd->fwomps:prepare-repair:v1`).
 *
 * Separate from the MC-FW-001 OBSERVE adapter in every authority dimension:
 * its own schema (`mc-fw-prepare-repair-1`), purpose, audience, asymmetric
 * Ed25519 key (private seed only in the `MISSION_CONTROL_PREPARE_SIGNING_KEY`
 * Worker secret, never returned or logged), key id, adjudication permission
 * (`mc.prepare.approve`) and replay ledger.
 *
 *   contract_digest = SHA256(JCS(envelope minus authentication.contract_digest/signature))
 *   signature       = Ed25519(UTF8(purpose) || 0x00 || UTF8(audience) || 0x00 || contract_digest)
 *
 * The contract carries a host-registered workspace id, never a filesystem root,
 * command, sandbox, protected-path list, or promotion field. A signed contract
 * is a grant to *prepare* an unpromoted candidate; it is not repair, PR, merge,
 * deploy, or resolution authority.
 */

// Mirrors CANARY_PRODUCER in mission-control-work-items.js (pinned by the issuer test) so this
// module stays importable without the estate registry JSON.
const CANARY_PRODUCER = 'mc-canary';
import { digestOf, jcsBytes } from './fwomps-investigation-adapter.js';

export const PREPARE_SCHEMA = 'mc-fw-prepare-repair-1';
export const PREPARE_PURPOSE = 'gfd->fwomps:prepare-repair:v1';
export const PREPARE_AUDIENCE = 'fwomps';
export const PREPARE_PERMISSION = 'mc.prepare.approve';
export const PREPARE_TASK_POLICY = 'mc-fw-002-repair-v1';
export const PREPARE_ELIGIBILITY_VERSION = 'gfd-mc-prepare-eligibility-1';
export const MAX_EVIDENCE_AGE_MS = 24 * 60 * 60 * 1000;

const SHA40 = /^[0-9a-f]{40}$/;
const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SEED_HEX = /^[0-9a-f]{64}$/;
const REPOSITORY_ID = /^[1-9][0-9]{0,19}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,127}$/;
const GLOB = /[*?[\]{}]/;
const PKCS8_ED25519_PREFIX = '302e020100300506032b657004220420';
const MAX_PATHS = 16;

export class PrepareIssuerError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = 'PrepareIssuerError';
    this.code = code;
    this.status = status;
  }
}

function hexBytes(text) {
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(text.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomHex(n) {
  const buffer = new Uint8Array(n);
  crypto.getRandomValues(buffer);
  return toHex(buffer);
}

function utc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function concat(...parts) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
}

/** Import the PREPARE Ed25519 private key from its 32-byte hex seed secret. Never exported. */
export async function importPrepareSigningKey(seedHex) {
  const seed = String(seedHex || '').trim().toLowerCase();
  if (!SEED_HEX.test(seed)) {
    throw new PrepareIssuerError('prepare_signing_key_unavailable', 'PREPARE signing key is not configured', 503);
  }
  return crypto.subtle.importKey('pkcs8', hexBytes(PKCS8_ED25519_PREFIX + seed), { name: 'Ed25519' }, false, ['sign']);
}

/** The exact §3 digest input: only authentication.contract_digest and .signature are omitted. */
export function prepareDigestInput(envelope) {
  const { authentication, ...rest } = envelope;
  const { contract_digest: _digest, signature: _signature, ...auth } = authentication || {};
  return { ...rest, authentication: auth };
}

export async function signPrepareEnvelope(unsigned, signingKey) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', jcsBytes(prepareDigestInput(unsigned))));
  const encoder = new TextEncoder();
  const message = concat(
    encoder.encode(unsigned.purpose), new Uint8Array([0]), encoder.encode(unsigned.audience), new Uint8Array([0]), digest,
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: 'Ed25519' }, signingKey, message));
  return {
    ...unsigned,
    authentication: {
      ...unsigned.authentication,
      contract_digest: `sha256:${toHex(digest)}`,
      signature: toHex(signature),
    },
  };
}

function utf8Compare(a, b) {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  for (let i = 0; i < Math.min(left.length, right.length); i += 1) {
    if (left[i] !== right[i]) return left[i] - right[i];
  }
  return left.length - right.length;
}

/** Same exact Git-tree path rules FWOMPS enforces; refusing here keeps bad grants from being signed. */
export function validateRequestedPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_PATHS) {
    throw new PrepareIssuerError('requested_paths_invalid', 'requested paths must be a non-empty bounded list', 400);
  }
  for (const path of paths) {
    if (typeof path !== 'string' || !path || path.length > 1024 || /[\u0000-\u001f\u007f]/u.test(path)
      || path.startsWith('/') || path.includes('\\') || path.includes(':') || GLOB.test(path)
      || path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || seg.toLowerCase() === '.git')) {
      throw new PrepareIssuerError('requested_path_invalid', 'a requested path is not an exact repository-relative path', 400);
    }
  }
  const sorted = [...new Set(paths)].sort(utf8Compare);
  if (sorted.length !== paths.length || sorted.some((path, i) => path !== paths[i])) {
    throw new PrepareIssuerError('requested_paths_order', 'requested paths must be sorted and unique', 400);
  }
  if (new Set(paths.map((p) => p.toLowerCase())).size !== paths.length) {
    throw new PrepareIssuerError('requested_path_alias', 'requested paths contain case aliases', 400);
  }
  return paths;
}

/** Adjudication boundary: an authenticated admin explicitly holding `mc.prepare.approve`. */
export function prepareApprover(user) {
  const metadata = user?.publicMetadata || {};
  const permissions = Array.isArray(metadata.permissions) ? metadata.permissions : [];
  if (metadata.role !== 'admin' || !permissions.includes(PREPARE_PERMISSION) || !TOKEN.test(String(user?.id || ''))) {
    throw new PrepareIssuerError('prepare_permission_required', `PREPARE requires an admin holding ${PREPARE_PERMISSION}`, 403);
  }
  return user.id;
}

/** Current eligibility of a work item for PREPARE. Canary and operator-asserted items never qualify. */
export function prepareEligibility(workItem, binding, now) {
  if (!workItem || workItem.producer === CANARY_PRODUCER || workItem.producer === 'operator') {
    throw new PrepareIssuerError('diagnostic_ineligible', 'canary or operator-asserted observations are not repair evidence', 409);
  }
  if (workItem.state !== 'DIAGNOSED') {
    throw new PrepareIssuerError('diagnostic_ineligible', 'only a currently DIAGNOSED work item can be prepared', 409);
  }
  const seen = Date.parse(workItem.lastSeen || '');
  if (!Number.isFinite(seen) || now.getTime() - seen > MAX_EVIDENCE_AGE_MS || seen > now.getTime() + 60_000) {
    throw new PrepareIssuerError('evidence_stale', 'diagnostic evidence is not fresh', 409);
  }
  const prepare = binding?.prepareBinding;
  if (!binding?.repository || binding.conflict || !prepare
    || !TOKEN.test(String(prepare.workspace_id || '')) || !REPOSITORY_ID.test(String(prepare.repository_id || ''))
    || !TOKEN.test(String(prepare.reproduction_profile_id || '')) || !TOKEN.test(String(prepare.verification_profile_id || ''))) {
    throw new PrepareIssuerError('prepare_binding_unavailable', 'the governed estate binding has no PREPARE registration', 409);
  }
  if (String(workItem.repository || '').toLowerCase() !== binding.repository.toLowerCase()) {
    throw new PrepareIssuerError('repository_mismatch', 'work item repository disagrees with the estate binding', 409);
  }
  return prepare;
}

/**
 * Build and sign one PREPARE contract for an eligible work item.
 * options: { requestedPaths, baseSha, approverId, requesterId, requestedAt, signingKey, keyId, now, lifetimeSeconds }
 */
export async function buildSignedPrepareContract(workItem, binding, options) {
  const now = options?.now instanceof Date ? options.now : new Date();
  const prepare = prepareEligibility(workItem, binding, now);
  const paths = validateRequestedPaths(options.requestedPaths);
  const baseSha = String(options.baseSha || '');
  // Bound to the revision the MC-FW-001 investigation actually ran against, never a caller value.
  const evidenceRevision = String(workItem.evidenceRevision || '');
  if (!SHA40.test(baseSha) || !SHA40.test(evidenceRevision)) {
    throw new PrepareIssuerError('malformed_revision', 'base SHA and evidence revision must be full lowercase commit SHAs', 400);
  }
  if (!KEY_ID.test(String(options.keyId || '')) || !options.signingKey) {
    throw new PrepareIssuerError('prepare_signing_key_unavailable', 'PREPARE signing key is not configured', 503);
  }
  const approverId = String(options.approverId || '');
  const requesterId = String(options.requesterId || approverId);
  if (!TOKEN.test(approverId) || !TOKEN.test(requesterId)) {
    throw new PrepareIssuerError('malformed_actor', 'requester and approver subjects must be canonical ids', 400);
  }
  const lifetime = Number.isInteger(options.lifetimeSeconds) ? options.lifetimeSeconds : 600;
  if (lifetime <= 0 || lifetime > 900) {
    throw new PrepareIssuerError('malformed_lifetime', 'PREPARE lifetime must be in (0, 900] seconds', 400);
  }
  const issuedAt = utc(now);
  const requestedMs = options.requestedAt ? Date.parse(options.requestedAt) : now.getTime();
  if (!Number.isFinite(requestedMs)) {
    throw new PrepareIssuerError('malformed_actor_time', 'request time is not a valid timestamp', 400);
  }
  const requestedAt = utc(new Date(requestedMs));
  if (requestedMs > now.getTime()) {
    throw new PrepareIssuerError('malformed_actor_time', 'request time is in the future', 400);
  }
  const observedAt = utc(new Date(workItem.lastSeen));
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
  const diagnosticDigest = await digestOf(diagnosticPayload);
  if (!workItem.diagnosis?.resultDigest || workItem.investigation?.diagnosticDigest !== diagnosticDigest) {
    // The diagnostic changed since it was investigated (or was never diagnosed): a fresh
    // investigation is required before a PREPARE grant can describe it.
    throw new PrepareIssuerError('diagnostic_changed_since_investigation', 'the diagnostic no longer matches its investigated digest', 409);
  }
  const unsigned = {
    schema_version: PREPARE_SCHEMA,
    operation: 'prepare_repair',
    audience: PREPARE_AUDIENCE,
    purpose: PREPARE_PURPOSE,
    request_id: `mcpr_${randomHex(16)}`,
    contract_id: `mcpc_${randomHex(16)}`,
    actors: {
      requester_subject_id: requesterId,
      approver_subject_id: approverId,
      requested_at: requestedAt,
      approved_at: issuedAt,
    },
    lifetime: {
      issued_at: issuedAt,
      expires_at: utc(new Date(now.getTime() + lifetime * 1000)),
      nonce: randomHex(16),
    },
    diagnostic: {
      id: workItem.workItemId,
      digest: diagnosticDigest,
      eligibility_decision: 'eligible',
      eligibility_version: PREPARE_ELIGIBILITY_VERSION,
      source_revision: evidenceRevision,
    },
    evidence: [{
      id: `${workItem.workItemId}:observation`,
      digest: workItem.evidenceDigest,
      source_revision: evidenceRevision,
      snapshot_digest: await digestOf({
        work_item_id: workItem.workItemId,
        evidence_revision: evidenceRevision,
        evidence_digest: workItem.evidenceDigest,
        generated_at: workItem.lastSeen,
      }),
      observed_at: observedAt,
      freshness_state: 'fresh',
    }],
    property: {
      id: workItem.propertyId,
      repository_id: String(prepare.repository_id),
      repository: binding.repository,
    },
    workspace: { workspace_id: prepare.workspace_id, base_sha: baseSha },
    requested: { paths, operation_class: 'edit_tracked_files' },
    profile: {
      reproduction_profile_id: prepare.reproduction_profile_id,
      task_policy_version: PREPARE_TASK_POLICY,
      verification_profile_id: prepare.verification_profile_id,
    },
    authentication: { key_id: options.keyId },
  };
  const payload = await signPrepareEnvelope(unsigned, options.signingKey);
  return {
    schemaVersion: PREPARE_SCHEMA,
    purpose: PREPARE_PURPOSE,
    contractId: payload.contract_id,
    contractDigest: payload.authentication.contract_digest,
    expiresAt: payload.lifetime.expires_at,
    // A PREPARE grant is not promotion, merge, deploy or resolution authority.
    promotionAuthority: false,
    payload,
  };
}

/** Durable GFD-side replay ledger and audit record of issued grants (one row per contract id). */
export async function recordPrepareGrant(db, grant, { workItemId, approverId, issuedAt }) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS mc_prepare_grants (
    contract_id TEXT PRIMARY KEY,
    work_item_id TEXT NOT NULL,
    contract_digest TEXT NOT NULL UNIQUE,
    nonce TEXT NOT NULL UNIQUE,
    approver_id TEXT NOT NULL,
    issued_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  )`).run();
  await db.prepare(`INSERT INTO mc_prepare_grants
    (contract_id, work_item_id, contract_digest, nonce, approver_id, issued_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(
    grant.contractId, workItemId, grant.contractDigest, grant.payload.lifetime.nonce, approverId, issuedAt, grant.expiresAt,
  ).run();
}
