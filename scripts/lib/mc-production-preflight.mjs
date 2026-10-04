/**
 * Production preflight for the real-host Mission Control investigation (FWOMPS host -> production GFD).
 *
 * Production Mission Control is served by the Cloudflare Pages project `goodflippindesign`
 * (https://goodflippindesign.com -> _worker.js -> workers/auth.js). The investigation may not start unless EVERY
 * check passes. Release identity is established by three sources that must agree:
 *   - the operator's expected SHA (a merged commit on origin/main),
 *   - Cloudflare's canonical production deployment record (control plane; the authoritative release record),
 *   - the stamp the running Pages build wrote about itself (runtime).
 * The gate is read-only end to end: reads of the Cloudflare Pages API, one authenticated GET to the runtime
 * provenance endpoint, and read-only reads of the FWOMPS home and this checkout. It holds no repair, deploy or
 * write authority. Evidence carries revisions, ids, states and short fingerprints of non-secret identifiers,
 * never a credential or the operator bearer.
 *
 *   P0  local_checkout_is_expected      checkout == expected SHA, reachable from origin/main
 *   P1  cloudflare_deployment_healthy   canonical Pages production deployment exists, succeeded, correct project/branch/repo/domain
 *   P2  cloudflare_commit_matches       canonical deployment commit == expected SHA
 *   P3  runtime_endpoint_reachable      provenance endpoint answered through https://goodflippindesign.com
 *   P4  runtime_stamp_matches           runtime build stamp == Cloudflare canonical commit == expected, built for the canonical deployment URL
 *   P5  mission_control_bindings        all seven bindings present+valid at runtime AND declared in the Pages env (credentials as secret_text)
 *   P6  worker_identity_matches         worker id / key ids agree AND the host holds the SAME key material (one-way KCV) and delivery bearer
 *   P7  fwomps_host_verified            the real ~/.fwomps binds aiaimate.com -> workspace -> weave0/aiaimate -> profile
 *   P8  sole_dispatch_ready             aiaimate.com is the only dispatch-ready / promotable property
 *   P9  protocol_versions_match         schemas + purposes at runtime == this revision's
 *   P10 read_only_authority             no repair/deploy/repository-write authority; one attempt
 *   P11 canonical_d1                    production D1 binding is the canonical resource and reachable with the MC schema
 */

import { createHash } from 'node:crypto';

import {
  INVESTIGATION_PURPOSE,
  INVESTIGATION_SCHEMA,
  LEASE_PURPOSE,
  LEASE_SCHEMA,
  RESULT_PURPOSE,
  RESULT_SCHEMA,
} from '../../workers/fwomps-investigation-adapter.js';
import {
  CANONICAL_MC_ORIGIN,
  MISSION_CONTROL_API_SCHEMA,
  PROVENANCE_SCHEMA,
  REQUIRED_BINDINGS,
  RUNTIME_KIND,
} from '../../workers/lib/worker-provenance.js';
import { judgeControlPlane } from './pages-control-plane.mjs';

export const PROPERTY_ID = 'aiaimate.com';
export { CANONICAL_MC_ORIGIN, REQUIRED_BINDINGS };
export const CREDENTIAL_BINDINGS = Object.freeze(['MISSION_CONTROL_CONTRACT_KEY', 'MISSION_CONTROL_RESULT_KEY', 'MISSION_CONTROL_WORKER_TOKEN', 'MISSION_CONTROL_CANARY_RUNNER_TOKEN']);
export const CHECKS = Object.freeze([
  ['P0', 'local_checkout_is_expected'],
  ['P1', 'cloudflare_deployment_healthy'],
  ['P2', 'cloudflare_commit_matches'],
  ['P3', 'runtime_endpoint_reachable'],
  ['P4', 'runtime_stamp_matches'],
  ['P5', 'mission_control_bindings'],
  ['P6', 'worker_identity_matches'],
  ['P7', 'fwomps_host_verified'],
  ['P8', 'sole_dispatch_ready'],
  ['P9', 'protocol_versions_match'],
  ['P10', 'read_only_authority'],
  ['P11', 'canonical_d1'],
]);

const SHA40 = /^[0-9a-f]{40}$/;
const PASS = (reason) => ({ status: 'PASS', reason });
const FAIL = (reason) => ({ status: 'FAIL', reason });
const BLOCKED = (by) => ({ status: 'BLOCKED', reason: `blocked by ${by}` });

// ---------------------------------------------------------------------------------------------
// Evidence hygiene. The runtime probe and the Cloudflare API are UNTRUSTED inputs: the operator bearer is sent to
// the origin, so a misrouted or malicious endpoint could reflect credential text into any field it returns. Nothing
// from those responses reaches a reason string or the persisted evidence unless it passes one of these validators;
// everything else is replaced by fixed text. Reasons name WHICH field deviated, never the value it carried.
// ---------------------------------------------------------------------------------------------
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sha = (v) => (typeof v === 'string' && SHA40.test(v) ? v : null);
const ts = (v) => (typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null);
const en = (v, allowed) => (allowed.includes(v) ? v : null);
/** A short identifier-shaped token (project names, branches, stage names); anything token-like or odd becomes [invalid]. */
const tok = (v) => (typeof v === 'string' && v.length <= 80 && /^[A-Za-z0-9._:/@+-]+$/.test(v) && (SHA40.test(v) || UUID.test(v) || !/[A-Za-z0-9_-]{24,}/.test(v)) ? v : '[invalid]');
/** Prose from trusted code that may embed external values: redact token-shaped runs and bound the length. */
const scrub = (text) => String(text ?? '').replace(/[A-Za-z0-9_-]{24,}/g, (run) => (SHA40.test(run) ? run : '[redacted]')).slice(0, 300);
const safeOrigin = (value) => { try { const u = new URL(value); return `${u.protocol}//${u.host}`; } catch { return '(invalid)'; } };
const safeDeploymentUrl = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && /^[a-z0-9-]+\.goodflippindesign\.pages\.dev$/.test(u.hostname) && !u.port
      ? u.origin
      : null;
  } catch {
    return null;
  }
};
const STATES = ['present', 'missing', 'invalid'];
const READ_ONLY_CONTRACT = Object.freeze({ investigation: true, readOnly: true, repairAuthority: false, deployAuthority: false, writeAuthority: false, maxAttempts: 1 });
const RELEASE_STATES = ['stamped', 'invalid', 'local', 'unstamped'];

/** Same fingerprint the runtime computes for non-secret identifiers. */
export function fingerprint(value) {
  return `sha256:${createHash('sha256').update(String(value).trim()).digest('hex').slice(0, 16)}`;
}

export const EXPECTED_PROTOCOL = Object.freeze({
  missionControlApi: MISSION_CONTROL_API_SCHEMA,
  investigationRequest: { schema: INVESTIGATION_SCHEMA, purpose: INVESTIGATION_PURPOSE },
  leaseGrant: { schema: LEASE_SCHEMA, purpose: LEASE_PURPOSE },
  investigationResult: { schema: RESULT_SCHEMA, purpose: RESULT_PURPOSE },
});

/** The runtime stamp's CF_PAGES_URL must be the canonical deployment's own URL (both normalised to an https origin). */
function deploymentUrlsMatch(runtimeUrl, canonicalUrl) {
  try {
    const a = new URL(runtimeUrl);
    const b = new URL(canonicalUrl);
    return a.protocol === 'https:' && b.protocol === 'https:' && a.host === b.host && a.host.endsWith('.pages.dev');
  } catch {
    return false;
  }
}

/** True only for the one canonical Mission Control origin (never gfd-auth.weave0.workers.dev). */
export function isCanonicalOrigin(origin) {
  try {
    const url = new URL(origin);
    return url.protocol === 'https:' && url.hostname === new URL(CANONICAL_MC_ORIGIN).hostname && !url.port;
  } catch {
    return false;
  }
}

/**
 * Fetches the runtime provenance report. The operator bearer is attached ONLY when the origin is the canonical
 * Mission Control origin (https, exact host, no userinfo/port); for anything else no request is made at all, so a
 * mistyped, redirected-to or malicious origin never receives the credential. Redirects are never followed.
 */
export async function fetchRuntimeProbe({ origin, token, fetchImpl = fetch }) {
  if (!isCanonicalOrigin(origin)) return { error: 'refusing to send the operator credential to a non-canonical origin' };
  try { const url = new URL(origin); if (url.username || url.password) return { error: 'refusing an origin with embedded credentials' }; } catch { return { error: 'invalid origin' }; }
  if (!token) return { error: 'GFD_OPERATOR_TOKEN is not set' };
  try {
    const res = await fetchImpl(new URL('/api/mission-control/provenance', CANONICAL_MC_ORIGIN), {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    let body = null;
    try { body = await res.json(); } catch { /* non-JSON error page */ }
    return { status: res.status, body };
  } catch (error) {
    return { error: error?.name === 'TimeoutError' ? 'timed out' : 'network error' };
  }
}

/**
 * @param input {
 *   expectedSha, localHeadSha, expectedOnMain: boolean, expectedWorkerId, origin,
 *   controlPlane: { project } | { error },          // pages-control-plane snapshot
 *   probe: { status, body } | { error },            // runtime provenance endpoint
 *   host: scripts/lib/fwomps-host-identity.mjs readHostIdentity() | null,
 *   gate: runPromotionGate result with the real FWOMPS home,
 *   canonicalD1Id: string                            // database_id from the committed wrangler.toml
 * }
 */
export function evaluatePreflight(input) {
  const { expectedSha, localHeadSha, expectedOnMain, expectedWorkerId, origin, controlPlane, probe, host, gate, canonicalD1Id, bearerKcv = null } = input;
  const out = {};
  let hostIdentityFacts = null;

  // P0
  if (!SHA40.test(expectedSha || '')) out.P0 = FAIL('--expected-sha must be a full 40-character lowercase commit SHA');
  else if (localHeadSha !== expectedSha) out.P0 = FAIL(`this checkout is ${sha(localHeadSha) || 'unknown'}, not the expected ${expectedSha}; protocol constants would not describe that revision`);
  else if (!expectedOnMain) out.P0 = FAIL('expected revision is not reachable from origin/main');
  else out.P0 = PASS(`checkout == expected == ${expectedSha}, reachable from origin/main`);

  // P1 / P2: Cloudflare control plane is the authoritative release record
  const judged = judgeControlPlane(controlPlane);
  const deployment = judged.facts?.canonicalDeployment || null;
  out.P1 = judged.ok
    ? PASS(`Pages project ${tok(judged.facts.project)}: canonical production deployment ${tok(deployment.id)} (${tok(deployment.branch)}) deployed ${ts(deployment.completedOn) || 'at an unreported time'}; ${tok(judged.facts.sourceRepository)}; domain goodflippindesign.com`)
    : FAIL(judged.problems.map(scrub).join('; '));
  if (!judged.ok) out.P2 = BLOCKED('P1');
  else if (deployment.commitHash !== expectedSha) out.P2 = FAIL(`Cloudflare serves ${sha(deployment.commitHash) || '[invalid]'} (deployment ${tok(deployment.id)}), expected ${expectedSha}`);
  else out.P2 = PASS(`canonical deployment ${tok(deployment.id)} commit == expected`);

  // P3
  const body = probe?.body;
  if (!isCanonicalOrigin(origin)) out.P3 = FAIL('origin is not the canonical Mission Control origin');
  else if (!probe || probe.error) out.P3 = FAIL(`provenance endpoint unreachable: ${scrub(probe?.error || 'no response')}`);
  else if (probe.status === 401 || probe.status === 403) out.P3 = FAIL(`operator credential refused by the endpoint (HTTP ${Number(probe.status)})`);
  else if (probe.status !== 200) out.P3 = FAIL(`provenance endpoint answered HTTP ${Number(probe.status)}${probe.status === 404 ? ' - the deployed revision predates the endpoint' : ''}`);
  else if (body?.schemaVersion !== PROVENANCE_SCHEMA) out.P3 = FAIL('response is not a Mission Control runtime provenance report');
  else if (body.runtime?.kind !== RUNTIME_KIND || body.runtime?.servedHost !== new URL(CANONICAL_MC_ORIGIN).hostname) {
    out.P3 = FAIL('response did not identify itself as the Pages runtime serving goodflippindesign.com');
  } else out.P3 = PASS(`${PROVENANCE_SCHEMA} observed ${ts(body.observedAt) || 'at an unreported time'} from goodflippindesign.com`);
  const reachable = out.P3.status === 'PASS';

  // P4
  if (!reachable) out.P4 = BLOCKED('P3');
  else if (out.P2.status !== 'PASS') out.P4 = BLOCKED('P2');
  else if (body.release?.state !== 'stamped' || body.release?.source !== 'cloudflare-pages' || !SHA40.test(body.release?.sha || '')) {
    out.P4 = FAIL(`runtime release stamp is ${en(body.release?.state, RELEASE_STATES) || 'unrecognised'}${body.release?.state === 'stamped' ? ' but not a well-formed cloudflare-pages stamp' : ''}; an unstamped, local or invalid build is never current`);
  } else if (!deploymentUrlsMatch(body.release.url, deployment.url)) {
    out.P4 = FAIL('runtime was built for a different Pages deployment than the canonical one (deployment URL differs or is absent); the same commit can be deployed more than once');
  } else if (body.release.sha !== deployment.commitHash) out.P4 = FAIL(`runtime stamped ${body.release.sha} but Cloudflare's canonical deployment is ${sha(deployment.commitHash) || '[invalid]'}`);
  else out.P4 = PASS(`runtime stamp == Cloudflare canonical commit == expected, and built for the canonical deployment URL (${body.release.sha}, built ${ts(body.release.builtAt) || 'at an unreported time'})`);

  // P5
  if (!reachable) out.P5 = BLOCKED('P3');
  else {
    const problems = [];
    const bad = REQUIRED_BINDINGS.filter((name) => body.bindings?.[name]?.state !== 'present');
    if (bad.length) problems.push(`runtime unavailable: ${bad.map((n) => `${n}=${en(body.bindings?.[n]?.state, STATES) || 'unreported'}`).join(', ')}`);
    const declared = judged.facts?.productionEnvVars || {};
    const undeclared = REQUIRED_BINDINGS.filter((name) => !Object.hasOwn(declared, name));
    if (!judged.ok) problems.push('the Pages production environment could not be read to confirm the bindings are declared');
    else if (undeclared.length) problems.push(`not declared in the Pages production environment: ${undeclared.join(', ')}`);
    else {
      // Credentials must be encrypted secrets. A plain_text binding (even one with a value) exposes it in the project
      // configuration, and an empty plain_text placeholder is the failure mode already seen on gfd-auth.
      const wrongType = CREDENTIAL_BINDINGS.filter((name) => declared[name] !== 'secret_text');
      if (wrongType.length) problems.push(`credential bindings must be secret_text in the Pages production environment: ${wrongType.join(', ')}`);
      const idWrongType = REQUIRED_BINDINGS.filter((name) => !CREDENTIAL_BINDINGS.includes(name) && !['secret_text', 'plain_text'].includes(declared[name]));
      if (idWrongType.length) problems.push(`unrecognised binding type for: ${idWrongType.join(', ')}`);
    }
    if (!bad.length && body.ready !== true) problems.push('runtime reports not ready (its blocker text is not trusted and not recorded)');
    out.P5 = problems.length ? FAIL(problems.join('; ')) : PASS('all seven Mission Control bindings present and usable at runtime, and declared in the Pages production environment');
  }

  // P6
  if (!reachable) out.P6 = BLOCKED('P3');
  else if (typeof expectedWorkerId !== 'string' || !expectedWorkerId.trim()) out.P6 = FAIL('--expected-worker-id is not configured');
  else if (!host) out.P6 = FAIL('FWOMPS host identity could not be read');
  else {
    const problems = [];
    const b = body.bindings || {};
    if (b.MISSION_CONTROL_RESULT_WORKER_ID?.fingerprint !== fingerprint(expectedWorkerId)) problems.push('runtime MISSION_CONTROL_RESULT_WORKER_ID != expected worker id');
    if (host.workerId !== expectedWorkerId) problems.push('FWOMPS host worker_id != expected worker id');
    if (!host.workerKeyId || b.MISSION_CONTROL_RESULT_KEY_ID?.fingerprint !== fingerprint(host.workerKeyId)) problems.push('runtime result key id != FWOMPS host worker key id');
    // The id in config.json is only a claim. The host must hold a valid enrolled worker key, or it cannot sign results.
    if (host.workerKey?.enrolled !== true) problems.push(`FWOMPS host worker key is not enrolled at worker-keys/<id>.json (${(host.workerKey?.problems || ['unknown']).join(', ')})`);
    // ...and the enrolled contract key that matches the runtime's contract key id must be valid, or it cannot verify contracts/leases.
    const wantContract = b.MISSION_CONTROL_CONTRACT_KEY_ID?.fingerprint;
    const contract = (host.contractKeys || []).find((k) => fingerprint(k.keyId) === wantContract);
    if (!contract) problems.push('runtime contract key id is not enrolled on the FWOMPS host');
    else if (contract.enrolled !== true) problems.push(`FWOMPS host contract key is not usable (${(contract.problems || ['unknown']).join(', ')})`);
    // Same ids are not the same keys. Compare one-way, role-separated key check values: the runtime's and the host's
    // (and the delivery bearer in THIS shell) must commit to identical key bytes, or signatures will not verify.
    const contractMatches = Boolean(contract?.enrolled) && typeof b.MISSION_CONTROL_CONTRACT_KEY?.kcv === 'string' && b.MISSION_CONTROL_CONTRACT_KEY.kcv === contract.kcv;
    const workerMatches = host.workerKey?.enrolled === true && typeof b.MISSION_CONTROL_RESULT_KEY?.kcv === 'string' && b.MISSION_CONTROL_RESULT_KEY.kcv === host.workerKey.kcv;
    const bearerMatches = typeof b.MISSION_CONTROL_WORKER_TOKEN?.kcv === 'string' && typeof bearerKcv === 'string' && b.MISSION_CONTROL_WORKER_TOKEN.kcv === bearerKcv;
    if (contract?.enrolled && !contractMatches) problems.push('the contract key material on the FWOMPS host does not match the runtime MISSION_CONTROL_CONTRACT_KEY (or the runtime key is not a strong 64-hex key)');
    if (host.workerKey?.enrolled === true && !workerMatches) problems.push('the worker key material on the FWOMPS host does not match the runtime MISSION_CONTROL_RESULT_KEY (or the runtime key is not a strong 64-hex key)');
    if (!bearerMatches) problems.push(bearerKcv == null ? 'the delivery bearer is not present in this shell, so it cannot be compared with MISSION_CONTROL_WORKER_TOKEN' : 'the delivery bearer in this shell does not match MISSION_CONTROL_WORKER_TOKEN (or the runtime token is not strong)');
    out.P6 = problems.length ? FAIL(problems.join('; ')) : PASS('worker id and key ids agree (by fingerprint), and the FWOMPS host holds the SAME contract and worker key material and delivery bearer as the runtime (by one-way key check value)');
    hostIdentityFacts = {
      workerKeyEnrolled: host.workerKey?.enrolled === true,
      workerKeyIdFingerprint: host.workerKeyId ? fingerprint(host.workerKeyId) : null,
      contractKeyEnrolled: contract?.enrolled === true,
      contractKeyIdFingerprint: contract ? fingerprint(contract.keyId) : null,
      contractKeyMaterialMatches: contractMatches,
      workerKeyMaterialMatches: workerMatches,
      deliveryBearerMatches: bearerMatches,
    };
  }

  // P7, P8
  const aia = gate?.properties?.find((p) => p.propertyId === PROPERTY_ID);
  if (!gate?.fwompsHomeVerified) out.P7 = FAIL('the FWOMPS home was not read; host verification did not run');
  else if (!aia) out.P7 = FAIL(`${PROPERTY_ID} is not a governed property`);
  else if (host?.workerKey?.enrolled !== true) out.P7 = FAIL(`the FWOMPS host cannot sign results: worker key not enrolled (${(host?.workerKey?.problems || ['host identity unreadable']).join(', ')})`);
  else if (!aia.promotable || !aia.hostVerified) {
    const failing = Object.entries(aia.checks).filter(([, c]) => c.status !== 'PASS').map(([code, c]) => `${code} ${c.status}: ${scrub(c.reason)}`);
    out.P7 = FAIL(`host verification did not pass: ${failing.join(' | ')}`);
  } else out.P7 = PASS('C1-C10 all PASS with the real host read (workspace, repository and read-only profile bound)');

  if (!gate?.properties?.length) out.P8 = FAIL('no property gate result');
  else {
    const ready = gate.properties.filter((p) => p.readinessDispatchReady).map((p) => p.propertyId).sort();
    const promotable = gate.properties.filter((p) => p.promotable).map((p) => p.propertyId).sort();
    const others = gate.properties.filter((p) => p.propertyId !== PROPERTY_ID).length;
    if (JSON.stringify(ready) !== JSON.stringify([PROPERTY_ID]) || JSON.stringify(promotable) !== JSON.stringify([PROPERTY_ID])) {
      out.P8 = FAIL(`dispatch-ready=[${ready.join(', ')}] promotable=[${promotable.join(', ')}]; only ${PROPERTY_ID} may be either`);
    } else out.P8 = PASS(`${PROPERTY_ID} is the sole dispatch-ready property; the other ${others} remain blocked`);
  }

  // P9
  if (!reachable) out.P9 = BLOCKED('P3');
  else {
    const have = body.protocol || {};
    const problems = [];
    if (have.missionControlApi !== EXPECTED_PROTOCOL.missionControlApi) problems.push('missionControlApi');
    for (const key of ['investigationRequest', 'leaseGrant', 'investigationResult']) {
      if (have[key]?.schema !== EXPECTED_PROTOCOL[key].schema || have[key]?.purpose !== EXPECTED_PROTOCOL[key].purpose) {
        problems.push(key);
      }
    }
    out.P9 = problems.length ? FAIL(`runtime protocol differs from this revision in: ${problems.join(', ')}`)
      : PASS(`${INVESTIGATION_SCHEMA} / ${LEASE_SCHEMA} / ${RESULT_SCHEMA} / ${MISSION_CONTROL_API_SCHEMA}`);
  }

  // P10
  if (!reachable) out.P10 = BLOCKED('P3');
  else {
    const c = body.capabilities || {};
    const ok = c.investigation === true && c.readOnly === true && c.repairAuthority === false
      && c.deployAuthority === false && c.writeAuthority === false && c.maxAttempts === 1;
    out.P10 = ok ? PASS('read-only investigation; repair=false, deploy=false, repository write=false; one attempt')
      : FAIL(`runtime capability report is not strictly read-only (deviating fields: ${Object.keys(READ_ONLY_CONTRACT).filter((k) => c[k] !== READ_ONLY_CONTRACT[k]).join(', ')})`);
  }

  // P11
  if (!reachable) out.P11 = BLOCKED('P3');
  else if (!judged.ok) out.P11 = BLOCKED('P1');
  else {
    const problems = [];
    const bound = judged.facts.productionD1?.DB;
    if (!canonicalD1Id) problems.push('canonical D1 id could not be read from wrangler.toml');
    else if (bound !== canonicalD1Id) problems.push(`Pages production DB binding is ${bound == null ? 'absent' : tok(bound)}, not the canonical ${canonicalD1Id}`);
    const d1 = body.d1 || {};
    if (d1.bound !== true || d1.reachable !== true) problems.push('runtime D1 binding is not reachable');
    else if (d1.workItemSchema !== true) problems.push('runtime D1 does not carry the Mission Control work-item schema');
    out.P11 = problems.length ? FAIL(problems.join('; ')) : PASS(`production DB binding == canonical D1 ${canonicalD1Id}; reachable with the work-item schema`);
  }

  const checks = Object.fromEntries(CHECKS.map(([code, name]) => [code, { name, ...out[code] }]));
  const failing = Object.entries(checks).filter(([, c]) => c.status !== 'PASS').map(([code]) => code);
  return {
    contractName: 'gfd-mc-production-preflight',
    schemaVersion: '2.0.0',
    runtimeTarget: { kind: RUNTIME_KIND, project: judged.facts?.project == null ? null : tok(judged.facts.project), origin: origin == null ? null : safeOrigin(origin) },
    expectedSha: expectedSha ?? null,
    cloudflare: deployment
      ? { deploymentId: tok(deployment.id), environment: tok(deployment.environment), branch: tok(deployment.branch), commitHash: sha(deployment.commitHash), stage: `${tok(deployment.stageName)}:${tok(deployment.stageStatus)}`, completedOn: ts(deployment.completedOn), createdOn: ts(deployment.createdOn), url: safeDeploymentUrl(deployment.url) }
      : null,
    runtimeRelease: body?.release ? { state: en(body.release.state, RELEASE_STATES), sha: sha(body.release.sha), builtAt: ts(body.release.builtAt), source: en(body.release.source, ['cloudflare-pages', 'local']), url: safeDeploymentUrl(body.release.url) } : null,
    hostIdentity: hostIdentityFacts,
    checks,
    canStartInvestigation: failing.length === 0,
    failing,
    authority: { mutates: false, repair: false, deploy: false, repositoryWrite: false },
  };
}

export function formatPreflight(result) {
  const lines = [`MC production preflight: ${result.canStartInvestigation ? 'GREEN - investigation may start' : `RED - blocked by ${result.failing.join(', ')}`}`];
  for (const [code, c] of Object.entries(result.checks)) lines.push(`  ${c.status.padEnd(7)} ${code.padEnd(3)} ${c.name}: ${c.reason}`);
  return lines.join('\n');
}
