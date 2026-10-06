/**
 * Revision-bound Mission Control evidence artifact.
 *
 * One canonical, self-describing, immutable artifact per proof. It binds a result to the exact revisions that
 * produced it (GFD, the Cloudflare Pages deployment that served it, the runtime stamp, FWOMPS, AIAIMate), carries
 * the preflight verdict, the work-item/effect/lease/result identity, lifecycle, idempotency, repository-mutation
 * and secret-leak audits, and states WHICH KIND of evidence it is. A later proof gets a new artifact; an existing
 * artifact is never rewritten (the file writer refuses to overwrite - #378 stays the immutable `015e06e` baseline).
 *
 * What this module does and does not do:
 *  - It computes whether the RECORDED facts are internally consistent and complete for the claimed classification.
 *    It cannot prove the facts are true; they come from the run that produced them (D1 dumps, wire log, git state,
 *    Cloudflare records) and each assertion names the field it judged so a reviewer can check.
 *  - Derived data (assertions, valid, failedAssertions, the audit) is a pure function of the body facts and is
 *    NEVER authoritative: verification recomputes it.
 *  - The embedded artifactDigest is a content / self-consistency digest. It is not a signature and not an
 *    independently anchored attestation; it does not prove who produced the artifact. Committing the file to Git
 *    adds a separate integrity record, the JSON alone does not.
 *  - A secret-leak finding can never be persisted: see SecretLeakError / writeEvidence.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const EVIDENCE_SCHEMA = 'gfd-mc-revision-evidence-1';

/** The four kinds of evidence, strictly ordered by how much of production they touch. They never blend. */
export const CLASSIFICATIONS = Object.freeze({
  'ci-proven': {
    label: 'CI-proven',
    proves: 'The GFD chain and hostile matrix on a pinned wire format in CI against an in-memory/test D1.',
    doesNotProve: ['real FWOMPS bytes', 'production runtime', 'production D1', 'a real incident'],
    production: false,
  },
  'tier2-isolated-specimen': {
    label: 'Tier-2 isolated specimen',
    proves: 'One bounded round trip with the real FWOMPS CLI in an isolated FWOMPS home against a local GFD worker and throwaway D1.',
    doesNotProve: ['production runtime', 'production D1', 'the operator FWOMPS host', 'a real incident'],
    production: false,
  },
  'controlled-production-canary': {
    label: 'Controlled production canary',
    proves: 'The real operator FWOMPS host, real production Pages runtime and production D1 completed one explicitly synthetic, read-only investigation.',
    doesNotProve: ['behavior on a naturally occurring incident', 'any property other than aiaimate.com'],
    production: true,
  },
  'naturally-occurring-production-incident': {
    label: 'Naturally occurring production incident',
    proves: 'A real production degradation, detected by the production sweep, was diagnosed end to end.',
    doesNotProve: ['repair or deploy authority (never granted)'],
    production: true,
  },
});

const SHA40 = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

// ------------------------------------------------------------------------------------------------
// secret-leak audit
// ------------------------------------------------------------------------------------------------

const LEAK_PATTERNS = Object.freeze([
  ['bearer_token', /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/],
  ['jwt', /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/],
  ['github_token', /\b(?:ghp|gho|ghs|ghu|github_pat)_[A-Za-z0-9_]{16,}/],
  ['stripe_or_secret_key', /\b(?:sk|rk|whsec)_[A-Za-z0-9_]{12,}/],
  ['private_key_block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  // Canonical work/effect IDs contain content digests, not key material. Exempt only their exact namespace,
  // as with sha256:<hex>; known-secret matching still catches a credential masquerading as an identifier.
  ['bare_64_hex', /(?<![A-Za-z0-9:])(?<!gfdwi_v1_)(?<!gfdeffect_v1_)[0-9a-fA-F]{64}(?![A-Za-z0-9])/],
]);

/** Environment variables that may legitimately hold credentials in the operator's shell. Values are read in memory only. */
export const KNOWN_SECRET_ENV_NAMES = Object.freeze([
  'CLOUDFLARE_API_TOKEN', 'GFD_OPERATOR_TOKEN',
  'FWOMPS_MC_CONTRACT_KEY_HEX', 'FWOMPS_MC_WORKER_KEY_HEX', 'GFD_MC_WORKER_TOKEN',
  'MISSION_CONTROL_CONTRACT_KEY', 'MISSION_CONTROL_RESULT_KEY', 'MISSION_CONTROL_WORKER_TOKEN', 'MISSION_CONTROL_GITHUB_TOKEN', 'MISSION_CONTROL_CANARY_RUNNER_TOKEN', 'GFD_MC_CANARY_RUNNER_TOKEN',
  'CLERK_SECRET_KEY', 'CLERK_SECRET_KEY_GFD', 'INTERNAL_SECRET', 'GITHUB_TOKEN', 'GH_TOKEN',
]);

/** Collects secret VALUES from an environment object for in-memory scanning. Never reads values from argv. */
export function collectKnownSecrets(env, extraNames = []) {
  const values = [...KNOWN_SECRET_ENV_NAMES, ...extraNames].map((name) => env[name]);
  return [...new Set(values.filter((v) => typeof v === 'string' && v.trim().length >= 8))];
}

// A value can appear verbatim, trimmed, in the other hex case, or JSON-escaped inside the serialized artifact.
function variantsOf(secret) {
  const out = new Set([secret, secret.trim(), JSON.stringify(secret).slice(1, -1)]);
  if (/^[0-9a-fA-F]+$/.test(secret.trim())) {
    out.add(secret.trim().toLowerCase());
    out.add(secret.trim().toUpperCase());
  }
  return [...out].filter((v) => v.length >= 8);
}

/**
 * @param serialized the text to scan
 * @param knownSecrets values that must never appear (held in memory by the caller; never stored or returned)
 * @returns { clean, scannedBytes, findings: [{kind, count}] } - kinds and counts only, never the matches
 */
export function auditForSecrets(serialized, knownSecrets = []) {
  const findings = [];
  const known = knownSecrets.filter((x) => typeof x === 'string' && x.trim().length >= 8);
  const hits = known.filter((secret) => variantsOf(secret).some((v) => serialized.includes(v))).length;
  if (hits) findings.push({ kind: 'known_secret_value', count: hits });
  for (const [kind, pattern] of LEAK_PATTERNS) {
    const matches = serialized.match(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`));
    if (matches?.length) findings.push({ kind, count: matches.length });
  }
  // Do not persist how many environment-only secret values were supplied. That number is intentionally
  // ephemeral and cannot be re-derived from the artifact body during later verification.
  return { clean: findings.length === 0, scannedBytes: Buffer.byteLength(serialized), patterns: LEAK_PATTERNS.map(([k]) => k), findings };
}

// ------------------------------------------------------------------------------------------------
// canonical digest
// ------------------------------------------------------------------------------------------------

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isObj(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
export const digestOf = (value) => `sha256:${createHash('sha256').update(canonical(value)).digest('hex')}`;

// ------------------------------------------------------------------------------------------------
// assertions (pure functions of the body facts)
// ------------------------------------------------------------------------------------------------

const assertion = (id, pass, detail) => ({ id, pass: Boolean(pass), detail });

// The only path a read-only investigation takes (mirrors PRIMARY_TRANSITIONS in workers/lib/mission-control-work-items.js).
const READ_ONLY_PATH = Object.freeze({ OBSERVED: 'QUALIFIED', QUALIFIED: 'INVESTIGATION_READY', INVESTIGATION_READY: 'INVESTIGATING', INVESTIGATING: 'DIAGNOSED' });

/** Starts at OBSERVED, every edge is the legal next step, each `from` is the previous `to`, and time never goes backwards. */
function lifecycleIsConnectedPath(lc) {
  if (!Array.isArray(lc) || lc.length < 1 || lc[0].from !== 'OBSERVED') return false;
  let previousAt = -Infinity;
  for (let i = 0; i < lc.length; i += 1) {
    const t = lc[i];
    if (READ_ONLY_PATH[t.from] !== t.to) return false;
    if (i > 0 && lc[i - 1].to !== t.from) return false;
    const at = Date.parse(t.at);
    if (!Number.isFinite(at) || at < previousAt) return false;
    previousAt = at;
  }
  return true;
}

function productionAssertions(f) {
  const out = [];
  const cf = f.revisions?.cloudflare || {};
  const rt = f.revisions?.runtimeStamp || {};
  const gfd = f.revisions?.gfd || {};
  out.push(assertion('gfd_sha_valid_on_main', SHA40.test(gfd.sha || '') && gfd.onOriginMain === true, `gfd.sha=${gfd.sha}, onOriginMain=${gfd.onOriginMain}`));
  out.push(assertion('cloudflare_deployment_recorded', cf.project === 'goodflippindesign' && cf.environment === 'production' && UUID.test(cf.deploymentId || '') && cf.stage === 'deploy:success' && SHA40.test(cf.commitHash || ''), `deployment ${cf.deploymentId} ${cf.stage}`));
  out.push(assertion('three_way_revision_agreement', gfd.sha === cf.commitHash && cf.commitHash === rt.sha && SHA40.test(rt.sha || ''), `gfd=${gfd.sha} cloudflare=${cf.commitHash} runtime=${rt.sha}`));
  const pf = f.preflight;
  const codes = ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11'];
  out.push(assertion('preflight_green', isObj(pf) && pf.canStartInvestigation === true && codes.every((c) => pf.checks?.[c]?.status === 'PASS') && pf.expectedSha === gfd.sha,
    isObj(pf) ? `canStart=${pf.canStartInvestigation}, failing=${(pf.failing || []).join(',') || 'none'}` : 'no preflight recorded'));
  out.push(assertion('preflight_bound_to_same_deployment', isObj(pf) && pf.cloudflare?.deploymentId === cf.deploymentId && pf.cloudflare?.commitHash === cf.commitHash, `preflight deployment ${pf?.cloudflare?.deploymentId}`));
  const hi = isObj(pf) ? pf.hostIdentity : null;
  out.push(assertion('host_can_sign_results', hi?.workerKeyEnrolled === true && hi?.contractKeyEnrolled === true && hi?.workerKeyMaterialMatches === true && hi?.contractKeyMaterialMatches === true && hi?.deliveryBearerMatches === true,
    `enrolled worker/contract=${hi?.workerKeyEnrolled}/${hi?.contractKeyEnrolled}, material match worker/contract/bearer=${hi?.workerKeyMaterialMatches}/${hi?.contractKeyMaterialMatches}/${hi?.deliveryBearerMatches}`));
  out.push(assertion('fwomps_and_aiaimate_revisions_pinned', SHA40.test(f.revisions?.fwomps?.sha || '') && SHA40.test(f.revisions?.aiaimate?.sha || ''), `fwomps=${f.revisions?.fwomps?.sha}, aiaimate=${f.revisions?.aiaimate?.sha}`));
  out.push(assertion('production_d1_identity_recorded', UUID.test(f.d1?.databaseId || '') && UUID.test(f.d1?.canonicalDatabaseId || '') && f.d1.databaseId === f.d1.canonicalDatabaseId, `d1=${f.d1?.databaseId}`));
  return out;
}

function subjectAssertions(f) {
  const out = [];
  const s = f.subject || {};
  out.push(assertion('exactly_one_work_item_effect_attempt', f.counts?.workItems === 1 && f.counts?.dispatchEffects === 1 && f.counts?.attempts === 1 && Boolean(s.workItemId) && Boolean(s.effectId) && s.attempt === 1,
    `workItems=${f.counts?.workItems}, effects=${f.counts?.dispatchEffects}, attempts=${f.counts?.attempts}`));
  out.push(assertion('result_digest_recorded', DIGEST.test(s.resultDigest || '') && Boolean(s.requestId) && Boolean(s.leaseId), `resultDigest=${s.resultDigest}`));
  const lc = Array.isArray(f.lifecycle) ? f.lifecycle : [];
  const states = lc.map((t) => t.to);
  out.push(assertion('lifecycle_reaches_diagnosed', lc.length >= 2 && states.at(-1) === 'DIAGNOSED' && lc.every((t) => t.at && t.from && t.to), `transitions=${lc.length}, final=${states.at(-1)}`));
  out.push(assertion('lifecycle_is_a_connected_legal_path', lifecycleIsConnectedPath(lc), `path=${lc.map((t) => `${t.from}>${t.to}`).join(', ')}`));
  out.push(assertion('lifecycle_has_no_repair_states', !states.some((st) => /REPAIR|DEPLOY|PROMOT|RESOLVED/.test(String(st))), `states=${states.join('>')}`));
  out.push(assertion('lease_released', f.lease?.releasedAfterResult === true && f.lease?.activeAfterResult === false, `released=${f.lease?.releasedAfterResult}`));
  const r = f.idempotency || {};
  const sameDigest = Array.isArray(r.redeliveries) && r.redeliveries.length >= 1 && r.redeliveries.every((d) => d.status >= 200 && d.status < 300 && d.resultDigest === f.subject?.resultDigest);
  out.push(assertion('idempotent_redelivery', sameDigest && r.newWorkItems === 0 && r.newEffects === 0 && r.newResultEvents === 0, `redeliveries=${r.redeliveries?.length ?? 0}, newWorkItems=${r.newWorkItems}, newEffects=${r.newEffects}, newResultEvents=${r.newResultEvents}`));
  out.push(assertion('no_duplicate_work_effect_or_result', r.duplicateWorkItems === 0 && r.duplicateEffects === 0 && r.duplicateResults === 0, `dupWork=${r.duplicateWorkItems}, dupEffects=${r.duplicateEffects}, dupResults=${r.duplicateResults}`));
  const m = f.repositoryMutation || {};
  out.push(assertion('no_repository_mutation', m.headBefore === m.headAfter && SHA40.test(m.headBefore || '') && m.worktreeCleanBefore === true && m.worktreeCleanAfter === true && m.remoteWritesAttempted === 0 && m.repairOrDeployEffects === 0,
    `head ${m.headBefore} -> ${m.headAfter}, clean ${m.worktreeCleanBefore}/${m.worktreeCleanAfter}, remoteWrites=${m.remoteWritesAttempted}`));
  return out;
}

function classificationAssertions(f) {
  const out = [];
  const c = f.classification;
  const spec = CLASSIFICATIONS[c];
  out.push(assertion('classification_known', Boolean(spec), `classification=${c}`));
  if (!spec) return out;
  const obs = f.observation || {};
  if (c === 'controlled-production-canary') {
    out.push(assertion('canary_is_unmistakably_synthetic', obs.synthetic === true && obs.canary === true && /canary|synthetic/i.test(obs.label || '') && obs.natural !== true, `label=${obs.label}`));
    out.push(assertion('canary_property_is_aiaimate', f.subject?.propertyId === 'aiaimate.com', `property=${f.subject?.propertyId}`));
  }
  if (c === 'naturally-occurring-production-incident') {
    out.push(assertion('incident_is_organic_not_synthetic', obs.synthetic !== true && obs.canary !== true && obs.natural === true && Boolean(obs.productionSweepRunId) && Boolean(obs.firstObservedAt), `sweepRun=${obs.productionSweepRunId}`));
  }
  if (c === 'ci-proven') {
    out.push(assertion('ci_run_recorded', Boolean(f.ci?.runId) && SHA40.test(f.ci?.sha || ''), `run=${f.ci?.runId}`));
    out.push(assertion('ci_revision_matches_gfd', SHA40.test(f.revisions?.gfd?.sha || '') && f.ci?.sha === f.revisions.gfd.sha, `ci=${f.ci?.sha}, gfd=${f.revisions?.gfd?.sha}`));
    out.push(assertion('ci_makes_no_production_claim', !f.revisions?.cloudflare && !f.preflight && obs.synthetic !== false, 'no Cloudflare/preflight section'));
  }
  if (c === 'tier2-isolated-specimen') {
    out.push(assertion('tier2_uses_isolated_home', f.specimen?.isolatedFwompsHome === true && f.specimen?.operatorHomeTouched === false, `isolated=${f.specimen?.isolatedFwompsHome}`));
    out.push(assertion('tier2_revisions_pinned', SHA40.test(f.revisions?.gfd?.sha || '') && SHA40.test(f.revisions?.fwomps?.sha || '') && SHA40.test(f.revisions?.aiaimate?.sha || ''), `gfd=${f.revisions?.gfd?.sha}, fwomps=${f.revisions?.fwomps?.sha}, aiaimate=${f.revisions?.aiaimate?.sha}`));
    out.push(assertion('tier2_makes_no_production_claim', !f.revisions?.cloudflare && !f.preflight, 'no Cloudflare/preflight section'));
  }
  return out;
}

// ------------------------------------------------------------------------------------------------
// verdict, build, verify
// ------------------------------------------------------------------------------------------------

const BODY_KEYS = Object.freeze([
  'schemaVersion', 'classification', 'classificationDetail', 'generatedAt', 'revisions', 'preflight', 'observation', 'subject',
  'counts', 'lifecycle', 'lease', 'idempotency', 'd1', 'repositoryMutation', 'ci', 'specimen', 'notes',
]);
const DERIVED_KEYS = Object.freeze(['secretLeakAudit', 'assertions', 'valid', 'failedAssertions', 'artifactDigest']);

const classificationDetailOf = (classification) => {
  const spec = CLASSIFICATIONS[classification];
  return spec ? { label: spec.label, proves: spec.proves, doesNotProve: spec.doesNotProve, touchesProduction: spec.production } : null;
};

const bodyOf = (artifact) => Object.fromEntries(BODY_KEYS.filter((k) => k in artifact).map((k) => [k, artifact[k]]));

/**
 * The ONLY place a verdict is computed. Derived data is a pure function of the body facts, so a stored copy is
 * never authoritative. The secret audit scans the body WITHOUT the derived sections, so a finding cannot hide
 * behind them.
 */
export function deriveVerdict(body, knownSecrets = []) {
  const spec = CLASSIFICATIONS[body.classification];
  const assertions = [
    ...classificationAssertions(body),
    ...(spec?.production ? productionAssertions(body) : []),
    ...subjectAssertions(body),
  ];
  const audit = auditForSecrets(JSON.stringify(bodyOf(body)), knownSecrets);
  assertions.push(assertion('secret_leak_audit_clean', audit.clean, audit.clean ? 'no credential material found' : `findings: ${audit.findings.map((x) => `${x.kind}x${x.count}`).join(', ')}`));
  return { assertions, audit, valid: assertions.every((a) => a.pass), failedAssertions: assertions.filter((a) => !a.pass).map((a) => a.id) };
}

/**
 * Builds the artifact from recorded run facts. Pure. `knownSecrets` are checked and discarded.
 * If the secret audit finds anything the returned artifact is for in-memory reporting only: writeEvidence refuses
 * it unconditionally.
 */
export function buildEvidence(facts, { knownSecrets = [], now = new Date() } = {}) {
  const body = {
    schemaVersion: EVIDENCE_SCHEMA,
    classification: facts.classification,
    classificationDetail: classificationDetailOf(facts.classification),
    generatedAt: now.toISOString(),
    revisions: facts.revisions ?? null,
    preflight: facts.preflight ?? null,
    observation: facts.observation ?? null,
    subject: facts.subject ?? null,
    counts: facts.counts ?? null,
    lifecycle: facts.lifecycle ?? null,
    lease: facts.lease ?? null,
    idempotency: facts.idempotency ?? null,
    d1: facts.d1 ?? null,
    repositoryMutation: facts.repositoryMutation ?? null,
    ci: facts.ci ?? null,
    specimen: facts.specimen ?? null,
    notes: facts.notes ?? [],
  };
  const verdict = deriveVerdict(body, knownSecrets);
  const artifact = { ...body, secretLeakAudit: verdict.audit, assertions: verdict.assertions, valid: verdict.valid, failedAssertions: verdict.failedAssertions };
  artifact.artifactDigest = digestOf({ ...artifact, artifactDigest: undefined });
  return artifact;
}

/**
 * Verifies a stored artifact by RECOMPUTING it. The body facts are the only input; classification detail,
 * assertions, validity, failed assertions and the secret audit are re-derived and compared with what is stored,
 * then the content digest is checked. Hand-editing `valid`, `assertions` or the facts fails even if someone
 * recomputes the digest. Known secret values (if supplied) are additionally scanned for.
 */
export function verifyEvidence(artifact, { knownSecrets = [] } = {}) {
  if (!isObj(artifact) || artifact.schemaVersion !== EVIDENCE_SCHEMA) return { ok: false, problems: ['not a revision-bound evidence artifact'] };
  const problems = [];
  const unknownKeys = Object.keys(artifact).filter((k) => !BODY_KEYS.includes(k) && !DERIVED_KEYS.includes(k));
  if (unknownKeys.length) problems.push(`unexpected top-level fields: ${unknownKeys.join(', ')}`);
  const body = bodyOf(artifact);

  if (canonical(body.classificationDetail ?? null) !== canonical(classificationDetailOf(body.classification))) {
    problems.push('classificationDetail does not match the classification');
  }
  const recomputed = deriveVerdict(body, []);
  if (canonical(artifact.assertions ?? null) !== canonical(recomputed.assertions)) problems.push('stored assertions differ from the assertions recomputed from the facts');
  if (artifact.valid !== recomputed.valid) problems.push(`stored valid=${artifact.valid} but the facts derive valid=${recomputed.valid}`);
  if (canonical(artifact.failedAssertions ?? null) !== canonical(recomputed.failedAssertions)) problems.push('stored failedAssertions differ from the recomputed ones');
  const stored = artifact.secretLeakAudit;
  if (!isObj(stored) || canonical(stored) !== canonical(recomputed.audit)) {
    problems.push('stored secret-leak audit differs from the recomputed audit');
  }
  const withKnown = knownSecrets.length ? deriveVerdict(body, knownSecrets).audit : recomputed.audit;
  if (!withKnown.clean) problems.push(`secret-leak audit finds ${withKnown.findings.map((x) => x.kind).join(', ')}`);
  if (recomputed.valid !== true) problems.push(`facts do not make a valid artifact: ${recomputed.failedAssertions.join(', ')}`);

  const { artifactDigest, ...rest } = artifact;
  if (digestOf({ ...rest, artifactDigest: undefined }) !== artifactDigest) problems.push('artifactDigest does not match the content (artifact was edited)');
  return { ok: problems.length === 0, problems };
}

// ------------------------------------------------------------------------------------------------
// writing: the secret-leak fence
// ------------------------------------------------------------------------------------------------

/** Immutable file name, bound to the revision and (for production classes) the Pages deployment. */
/**
 * Immutable file name, bound to the revision and (for production classes) the Pages deployment.
 * Every component is validated before it can reach a path: a failure record can carry arbitrary (even hostile)
 * classification / revision / id strings, so anything not matching a strict whitelist degrades to a fixed token.
 */
export function evidenceFileName(artifact) {
  const classification = Object.hasOwn(CLASSIFICATIONS, artifact?.classification) ? artifact.classification : 'unknown-class';
  const gfdSha = artifact?.revisions?.gfd?.sha;
  const gfd = typeof gfdSha === 'string' && SHA40.test(gfdSha) ? gfdSha.slice(0, 12) : 'unbound';
  const depId = artifact?.revisions?.cloudflare?.deploymentId;
  const dep = typeof depId === 'string' && UUID.test(depId) ? `-${depId.slice(0, 8)}` : '';
  const at = Date.parse(artifact?.generatedAt);
  const stamp = (Number.isFinite(at) ? new Date(at).toISOString() : '1970-01-01T00:00:00.000Z').replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const name = `mc-evidence-${classification}-${gfd}${dep}-${stamp}${artifact?.valid === true ? '' : '-INVALID'}.json`;
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes('..')) throw new Error('refusing to derive an unsafe evidence file name');
  return name;
}

/** Joins a validated file name to the output directory and proves the result stays inside it. */
function contained(dir, name) {
  const base = path.resolve(dir);
  const file = path.resolve(base, name);
  if (path.dirname(file) !== base) throw new Error('refusing to write outside the evidence directory');
  return file;
}

/** Raised when the artifact contains credential material. Carries finding kinds and counts only. */
export class SecretLeakError extends Error {
  constructor(findings) {
    super(`secret-leak fence: refusing to persist an artifact containing credential material (${findings.map((f) => `${f.kind}x${f.count}`).join(', ')})`);
    this.name = 'SecretLeakError';
    this.findings = findings.map(({ kind, count }) => ({ kind, count }));
  }
}

/**
 * A sanitized stand-in for an artifact that tripped the fence. Contains NO field names or values from the
 * original body: the classification label, a timestamp and finding kinds/counts only.
 */
export function buildLeakReceipt(classification, findings, { now = new Date() } = {}) {
  return {
    schemaVersion: 'gfd-mc-evidence-leak-receipt-1',
    classification: CLASSIFICATIONS[classification] ? classification : 'unknown',
    generatedAt: now.toISOString(),
    findings: findings.map(({ kind, count }) => ({ kind, count })),
    note: 'The evidence artifact was NOT written because it contained credential material. Fix the source facts and rebuild.',
  };
}

/**
 * Writes a new artifact; refuses to overwrite anything.
 *
 * The secret-leak fence is unconditional: the exact bytes about to be written are re-audited here, independent of
 * any flag stored on the artifact, and a finding throws SecretLeakError. `allowInvalid` may record a LOGICAL
 * failure only; it can never override the fence.
 */
export function writeEvidence(artifact, dir, { allowInvalid = false, knownSecrets = [] } = {}) {
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  const audit = auditForSecrets(text, knownSecrets);
  const storedFlag = artifact?.secretLeakAudit;
  if (!audit.clean || storedFlag?.clean === false) {
    throw new SecretLeakError(audit.clean ? (storedFlag.findings || []) : audit.findings);
  }
  if (!artifact.valid && !allowInvalid) throw new Error(`refusing to write an invalid evidence artifact: ${artifact.failedAssertions.join(', ')}`);
  const file = contained(dir, evidenceFileName(artifact));
  if (existsSync(file)) throw new Error(`refusing to overwrite existing evidence ${file}; each proof gets its own artifact`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, text, { flag: 'wx' });
  return file;
}

/** Writes the sanitized receipt for a fenced artifact (new file only). */
export function writeLeakReceipt(classification, error, dir, { now = new Date() } = {}) {
  const receipt = buildLeakReceipt(classification, error.findings, { now });
  const stamp = receipt.generatedAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const file = contained(dir, `mc-evidence-LEAK-RECEIPT-${receipt.classification}-${stamp}.json`);
  if (existsSync(file)) throw new Error(`refusing to overwrite existing receipt ${file}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
  return file;
}
