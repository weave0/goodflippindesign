/**
 * Property promotion gate: one deterministic, evidence-producing answer to
 *   "can this estate property be promoted from registry-only to dispatch-ready?"
 *
 * A REPORT, not a state machine. It reuses what already exists and invents no parallel authority:
 *   - the estate operating-readiness analyzer (debt codes, repository/health/machine-contract facts),
 *   - the registry validation helper (canonical VERIFICATION_SCOPES),
 *   - resolveEstateBinding / qualifyFromRegistry (the real qualification path),
 *   - the real Mission Control API, outbox, work-item store and result bridge, exercised against an
 *     IN-MEMORY D1 that is created for the run and thrown away.
 * It never writes the registry, never touches production, never touches the FWOMPS host (the host is only
 * READ, and only if --fwomps-home is given), and never grants repair/write authority: the probes issue a
 * read-only contract and accept an authenticated read-only result, nothing more.
 *
 * Checks (stable ids, in order):
 *   C1  registry_binding_valid          governed, canonical repository, no registry/brand drift
 *   C2  verification_declaration_valid  scope in the canonical set, predicate present
 *   C3  investigation_profile_known     declared and well-formed; host registration PENDING_OPERATOR unless verified
 *   C4  host_workspace_binding          explicitly PENDING_OPERATOR unless --fwomps-home verifies it
 *   C5  canonical_target_derivable      fwomps:<propertyId> is derivable and canonical
 *   C6  signed_contract_issuable        REAL path: observation -> qualify from the registry -> signed contract
 *   C7  dispatch_intent_plannable       REAL outbox: investigation_dispatch bound to the contract digest
 *   C8  lease_authority_invariant       REAL API+store: lease REFUSED without a durable intent, issued under one
 *   C9  result_bridge_compatible        REAL bridge: authenticated read-only result -> same item DIAGNOSED, no repair authority
 *   C10 verification_path_declared      verification profile + monitored target + machine-health contract
 *
 * Statuses: PASS | FAIL | PENDING_OPERATOR (explicitly an operator action, not a defect) | BLOCKED (an earlier
 * check this one depends on failed).
 */

import { randomBytes } from 'node:crypto';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { analyzeEstateOperatingReadiness } from '../estate-operating-readiness.mjs';
import { verificationDeclarationProblems } from './estate-operating-validation.mjs';

export const CHECKS = Object.freeze([
  ['C1', 'registry_binding_valid'],
  ['C2', 'verification_declaration_valid'],
  ['C3', 'investigation_profile_known'],
  ['C4', 'host_workspace_binding'],
  ['C5', 'canonical_target_derivable'],
  ['C6', 'signed_contract_issuable'],
  ['C7', 'dispatch_intent_plannable'],
  ['C8', 'lease_authority_invariant'],
  ['C9', 'result_bridge_compatible'],
  ['C10', 'verification_path_declared'],
]);

const PROFILE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const result = (status, reason, evidence) => ({ status, reason, ...(evidence === undefined ? {} : { evidence }) });
const pass = (reason, evidence) => result('PASS', reason, evidence);
const fail = (reason, evidence) => result('FAIL', reason, evidence);
const pending = (reason, evidence) => result('PENDING_OPERATOR', reason, evidence);
const blocked = (by, reason) => result('BLOCKED', `blocked by ${by}: ${reason}`);

// ---------------------------------------------------------------------------------------------
// static checks (pure: registry/brands/health facts only)
// ---------------------------------------------------------------------------------------------

function staticChecks(property, row, brand) {
  const operating = property?.operating && typeof property.operating === 'object' ? property.operating : {};
  const out = {};

  // C1
  const problems = [];
  if (property.governed !== true) problems.push('property is not governed');
  if (!row.repository) problems.push('no canonical repository authority (registry operating.repository or brands.json repo)');
  const registryRepo = typeof operating.repository === 'string' ? operating.repository.trim().toLowerCase() : null;
  const brandRepo = typeof brand?.repo === 'string' ? brand.repo.trim().toLowerCase() : null;
  if (registryRepo && brandRepo && registryRepo !== brandRepo) problems.push(`repository drift: registry ${registryRepo} vs brands.json ${brandRepo}`);
  out.C1 = problems.length ? fail(problems.join('; '), { repository: row.repository, source: row.repositorySource }) : pass(`repository ${row.repository} (${row.repositorySource})`);

  // C2
  const declared = ['investigation_profile', 'verification_profile', 'verification_scope', 'verification_predicate']
    .filter((field) => typeof operating[field] !== 'string' || !operating[field].trim());
  const shape = verificationDeclarationProblems(property.domain, operating);
  if (declared.length || shape.length) {
    out.C2 = fail([declared.length ? `undeclared: ${declared.join(', ')}` : null, ...shape].filter(Boolean).join('; '));
  } else {
    out.C2 = pass(`scope ${operating.verification_scope}, predicate declared`);
  }

  // C5
  const id = typeof property.id === 'string' ? property.id : '';
  if (!HOSTNAME.test(id) || id !== id.toLowerCase()) out.C5 = fail(`property id ${JSON.stringify(id)} is not a canonical lowercase hostname`);
  else if (property.domain !== id) out.C5 = fail(`property id ${id} differs from domain ${property.domain}`);
  else out.C5 = pass(`fwomps:${id}`);

  // C10
  const gaps = [];
  if (typeof operating.verification_profile !== 'string' || !operating.verification_profile.trim()) gaps.push('no verification profile');
  if (!row.monitorReady) gaps.push('no governed health target (nothing observes this property)');
  else if (!row.machineHealthReady) gaps.push('health target has no versioned machine-health contract (re-observation cannot be deterministic)');
  out.C10 = gaps.length ? fail(gaps.join('; ')) : pass(`verification profile ${operating.verification_profile}; machine-health target(s) ${row.machineHealthTargetIds.join(', ')}`);

  return out;
}

// ---------------------------------------------------------------------------------------------
// host checks (read-only JSON read of an FWOMPS home; PENDING_OPERATOR when none is given)
// ---------------------------------------------------------------------------------------------

function hostChecks(property, row, operating, fwompsHome) {
  const profile = typeof operating.investigation_profile === 'string' ? operating.investigation_profile.trim() : '';
  const wellFormed = PROFILE_NAME.test(profile);
  if (!fwompsHome) {
    return {
      C3: wellFormed
        ? pending(`profile ${profile} is declared and well-formed; registration on the FWOMPS host is host-owned and not verifiable without --fwomps-home`)
        : fail(profile ? `profile name ${JSON.stringify(profile)} is malformed` : 'no investigation profile declared'),
      C4: pending(`workspace binding ${property.id} -> workspace -> ${row.repository ?? '<no repository>'} is host-owned; run the host-binding tool (scripts/fwomps-aiaimate-host-binding.py is the AIAIMate instance)`),
    };
  }
  if (!wellFormed) {
    return { C3: fail(profile ? `profile name ${JSON.stringify(profile)} is malformed` : 'no investigation profile declared'), C4: blocked('C3', 'no profile to bind') };
  }
  const configPath = path.join(fwompsHome, 'config.json');
  let host;
  try {
    host = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch {
    return { C3: fail(`FWOMPS host config unreadable at ${configPath}`), C4: fail(`FWOMPS host config unreadable at ${configPath}`) };
  }
  const mc = host.mission_control || {};
  const binding = (mc.properties || {})[property.id];
  const profiles = mc.investigation_profiles || {};
  const profileKnown = Array.isArray(profiles) ? profiles.some((p) => p?.name === profile) : Object.hasOwn(profiles, profile);
  const c3 = profileKnown ? pass(`profile ${profile} is registered on the host`) : fail(`profile ${profile} is not registered on the FWOMPS host`);
  let c4;
  if (!mc.enabled) c4 = fail('Mission Control is not enabled on the FWOMPS host');
  else if (!binding) c4 = fail(`no host binding for ${property.id}`);
  else if (binding.investigation_profile !== profile) c4 = fail(`host binds ${property.id} to profile ${binding.investigation_profile}, registry declares ${profile}`);
  else if (String(binding.repository || '').toLowerCase() !== String(row.repository || '').toLowerCase()) c4 = fail(`host repository ${binding.repository} differs from registry ${row.repository}`);
  else if (!(host.workspaces || {})[binding.workspace]) c4 = fail(`workspace ${binding.workspace} is not registered on the host`);
  else if (!existsSync(host.workspaces[binding.workspace].root)) c4 = fail(`workspace root for ${binding.workspace} does not exist on this machine`);
  else c4 = pass(`bound to workspace ${binding.workspace} at ${host.workspaces[binding.workspace].root}`);
  return { C3: c3, C4: c4 };
}

// ---------------------------------------------------------------------------------------------
// executable probes: the REAL code path against an in-memory D1 (never production)
// ---------------------------------------------------------------------------------------------

let hooked = false;
function allowJsonImports() {
  if (hooked) return;
  hooked = true;
  // Bundlers accept `import x from './f.json'`; plain Node needs the attribute.
  registerHooks({
    resolve(specifier, context, nextResolve) {
      const resolved = nextResolve(specifier, context);
      return resolved.url.endsWith('.json') ? { ...resolved, importAttributes: { type: 'json' } } : resolved;
    },
  });
}

const hex = (bytes) => randomBytes(bytes).toString('hex');
const WORKER_ID = 'gate-worker';
const REVISION = 'a'.repeat(40);

export async function openProbeRuntime() {
  allowJsonImports();
  const load = (rel) => import(new URL(rel, `file:///${ROOT.replaceAll('\\', '/')}/`).href);
  const [{ Miniflare }, api, items, lib, outbox, adapter] = await Promise.all([
    import('miniflare'),
    load('workers/mission-control-api.js'),
    load('workers/mission-control-work-items.js'),
    load('workers/lib/mission-control-work-items.js'),
    load('workers/lib/mission-control-outbox.js'),
    load('workers/fwomps-investigation-adapter.js'),
  ]);
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("gate") } }', d1Databases: { DB: 'promotion-gate' } });
  const DB = await mf.getD1Database('DB');
  await items.ensureWorkItemSchema(DB);
  await outbox.ensureOutboxSchema(DB);
  const resultKey = hex(32);
  const env = {
    DB,
    MISSION_CONTROL_CONTRACT_KEY: hex(32),
    MISSION_CONTROL_CONTRACT_KEY_ID: 'gate-contract',
    MISSION_CONTROL_RESULT_KEY: resultKey,
    MISSION_CONTROL_RESULT_KEY_ID: 'gate-result',
    MISSION_CONTROL_RESULT_WORKER_ID: WORKER_ID,
  };
  return { mf, DB, env, api, items, lib, outbox, adapter, resultKey, dispose: () => mf.dispose() };
}

async function call(rt, user, workItemId, action, body) {
  const request = new Request(`https://gate.invalid/api/mission-control/work-items/${encodeURIComponent(workItemId)}/${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
  });
  const response = await rt.api.handleMissionControlRequest(request, rt.env, user);
  let json = {};
  try { json = await response.json(); } catch { /* non-json */ }
  return { status: response.status, json };
}

const ADMIN = { id: 'promotion-gate', publicMetadata: { role: 'admin' } };
const WORKER = { id: 'promotion-gate-worker', publicMetadata: { role: 'mission-control-worker' } };

/** C6..C9 for one property, in order; later checks are BLOCKED if an earlier one failed. */
export async function runLifecycleProbe(rt, propertyId) {
  const out = {};
  const stop = (from, by, reason) => {
    const ids = CHECKS.map(([id]) => id);
    for (const id of ids.slice(ids.indexOf(from))) if (['C6', 'C7', 'C8', 'C9'].includes(id) && !out[id]) out[id] = blocked(by, reason);
  };
  try {
    const observed = await rt.lib.createObservedWorkItem({
      producer: 'promotion-gate', propertyId, findingKey: `gate:probe:${propertyId}`,
      observedAt: new Date().toISOString(), evidenceDigest: `sha256:${hex(32)}`, severity: 'low',
    });
    const saved = await rt.items.createD1WorkItemStore(rt.DB).save(observed, { at: observed.lastSeen, from: null, to: 'OBSERVED', reason: 'promotion gate probe', actor: 'promotion-gate', detail: {} });
    const id = saved.workItemId;

    // C6: the real qualification path, then the real contract issuance
    const qualified = await call(rt, ADMIN, id, 'transition', { to: 'QUALIFIED' });
    if (qualified.status !== 200) {
      out.C6 = fail(`qualification refused (${qualified.json.code || qualified.status}): ${qualified.json.error || 'no detail'}`);
      stop('C7', 'C6', 'no signed contract');
      return out;
    }
    const issued = await call(rt, ADMIN, id, 'investigate', { evidenceRevision: REVISION });
    if (issued.status !== 200 || !issued.json.contract) {
      out.C6 = fail(`contract issuance refused (${issued.json.code || issued.status}): ${issued.json.error || 'no detail'}`);
      stop('C7', 'C6', 'no signed contract');
      return out;
    }
    const ready = issued.json.workItem;
    const contract = issued.json.contract;
    const readOnly = contract.contract?.requested_mode === 'read_only' && ready.investigation?.repairAuthority === false;
    out.C6 = readOnly
      ? pass(`read-only contract ${ready.investigation.requestId} issued for ${ready.repository} (profile ${ready.investigationProfile})`, { contractDigest: ready.investigation.digest })
      : fail('contract was issued without the read-only guarantee');
    if (!readOnly) { stop('C7', 'C6', 'contract not read-only'); return out; }

    // C7: durable dispatch intent bound to the exact contract digest
    let intent;
    try {
      intent = await rt.outbox.planEffect(rt.DB, {
        workItemId: id, requestedLifecycleVersion: ready.lifecycleVersion, effectType: 'investigation_dispatch',
        target: `fwomps:${ready.propertyId}`, candidateDigest: ready.investigation.digest,
        payload: { summary: 'promotion gate probe', propertyId: ready.propertyId },
      });
      out.C7 = intent.created && intent.effect.status === 'PLANNED'
        ? pass(`intent ${intent.effect.effectId} planned against lifecycle version ${intent.effect.requestedLifecycleVersion}`)
        : fail('intent was not freshly planned');
    } catch (error) {
      out.C7 = fail(`intent could not be planned: ${error.message}`);
    }
    if (out.C7.status !== 'PASS') { stop('C8', 'C7', 'no durable intent'); return out; }

    // C8: the invariant must be ENFORCED (refusal without intent) and SATISFIABLE (success under one)
    const bare = await call(rt, WORKER, id, 'lease', {});
    let grant = null;
    if (bare.status === 200) {
      out.C8 = fail('INVARIANT NOT ENFORCED: a lease was issued with no durable dispatch intent');
      grant = bare.json.leaseGrant;
    } else if (bare.json.code !== 'dispatch_intent_required') {
      out.C8 = fail(`lease without an intent was refused for the wrong reason (${bare.json.code || bare.status}), not dispatch_intent_required`);
    } else {
      const claim = await rt.outbox.claimDispatch(rt.DB, intent.effect.effectId);
      const authorised = await call(rt, WORKER, id, 'lease', { effect_id: intent.effect.effectId, attempt: claim.permit?.attempt });
      if (authorised.status === 200 && authorised.json.leaseGrant) {
        out.C8 = pass('lease refused without an intent (dispatch_intent_required) and issued under the claimed intent');
        grant = authorised.json.leaseGrant;
      } else {
        out.C8 = fail(`lease under a valid claimed intent was refused (${authorised.json.code || authorised.status}): ${authorised.json.error || ''}`);
      }
    }
    if (!grant) { stop('C9', 'C8', 'no lease'); return out; }

    // C9: an authenticated read-only result is accepted for THIS property's identity
    const unsigned = {
      schema_version: 'mc-fw-investigation-result-1',
      request_id: ready.investigation.requestId,
      contract_digest: ready.investigation.digest,
      attempt: grant.attempt,
      lease_token_digest: grant.lease_token_digest,
      worker: { id: WORKER_ID, fwomps_version: 'promotion-gate', completed_at: new Date().toISOString() },
      source: { property_id: ready.propertyId, repository: ready.repository, workspace_name: ready.propertyId, inspected_head_sha: REVISION, source_state: 'accepted_by_host_policy' },
      evidence: { revision: REVISION, snapshot_digest: contract.evidence.snapshot_digest, diagnostic_id: id, diagnostic_digest: contract.diagnostic.digest },
      outcome: 'not_reproduced',
      summary: `profile ${ready.investigationProfile}: not_reproduced`,
      observations: [],
      execution_receipts: [{ profile: ready.investigationProfile, index: 0, status: 'pass', exit_code: 0, output_digest: `sha256:${hex(32)}`, stdout_excerpt: '', stderr_excerpt: '', output_truncated: false, timed_out: false, authoritative_sandbox: true }],
      repairability: { state: 'not_indicated', advisory_repair_scope: [] },
      stop_reason: null,
      authentication: { key_id: 'gate-result' },
    };
    const envelope = await rt.adapter.signResultEnvelope(unsigned, rt.adapter.keyBytesFromEnv(rt.resultKey));
    const accepted = await call(rt, WORKER, id, 'result', envelope);
    const diagnosed = accepted.json.workItem;
    const writes = await rt.DB.prepare("SELECT COUNT(*) AS n FROM mc_effects WHERE work_item_id = ? AND effect_type IN ('pull_request','deployment')").bind(id).first();
    if (accepted.status === 200 && diagnosed?.state === 'DIAGNOSED' && diagnosed.workItemId === id && !diagnosed.activeLease && Number(writes.n) === 0) {
      out.C9 = pass('authenticated read-only result accepted: same work item DIAGNOSED, lease released, no repair/deploy authority recorded');
    } else {
      out.C9 = fail(`result bridge refused or misbehaved (${accepted.json.code || accepted.status}): ${accepted.json.error || ''}`);
    }
  } catch (error) {
    for (const [checkId] of CHECKS) if (['C6', 'C7', 'C8', 'C9'].includes(checkId) && !out[checkId]) out[checkId] = fail(`probe error: ${error.message}`);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// the gate
// ---------------------------------------------------------------------------------------------

/**
 * @param {object} input registry/brands/healthTargets as the readiness analyzer takes them
 * @param {object} options { only: propertyId[]|null, fwompsHome: string|null, probes: boolean }
 *   probes exercise the COMMITTED registry through the real code path; pass probes:false for a registry that
 *   is not the committed one (fixtures), in which case C6..C9 are reported BLOCKED rather than guessed.
 */
export async function runPromotionGate(input, options = {}) {
  const { only = null, fwompsHome = null, probes = true } = options;
  const readiness = analyzeEstateOperatingReadiness(input);
  const rows = new Map(readiness.properties.map((row) => [row.propertyId, row]));
  const brands = input.brands?.public ?? {};
  const properties = (input.registry.properties || []).filter((p) => p.governed === true && (!only || only.includes(p.id)));
  const rt = probes ? await openProbeRuntime() : null;
  const report = [];
  try {
    for (const property of properties) {
      const row = rows.get(property.id);
      const operating = property.operating && typeof property.operating === 'object' ? property.operating : {};
      const checks = { ...staticChecks(property, row, property.brand_id ? brands[property.brand_id] : null), ...hostChecks(property, row, operating, fwompsHome) };
      if (rt) Object.assign(checks, await runLifecycleProbe(rt, property.id));
      else for (const code of ['C6', 'C7', 'C8', 'C9']) checks[code] = blocked('probe-mode', 'executable probes were not run for this registry');
      const ordered = Object.fromEntries(CHECKS.map(([code, name]) => [code, { name, ...checks[code] }]));
      const statuses = Object.values(ordered).map((c) => c.status);
      report.push({
        propertyId: property.id,
        classification: property.classification ?? null,
        // GFD-side promotable: nothing failed or blocked; host steps may be explicitly operator-pending.
        promotable: statuses.every((s) => s === 'PASS' || s === 'PENDING_OPERATOR'),
        // fully ready: the FWOMPS host has been verified too.
        hostVerified: ordered.C3.status === 'PASS' && ordered.C4.status === 'PASS',
        readinessDispatchReady: row.dispatchReady,
        readinessDebt: row.debt.map((d) => d.code),
        checks: ordered,
      });
    }
  } finally {
    if (rt) await rt.dispose();
  }
  return { contractName: 'gfd-property-promotion-gate', schemaVersion: '1.0.0', fwompsHomeVerified: Boolean(fwompsHome), probes: Boolean(probes), properties: report };
}

/** Gap inventory grouped by the prerequisite that is actually missing. */
export function gapInventory(gate) {
  const byCheck = {};
  for (const [code, name] of CHECKS) byCheck[code] = { name, FAIL: [], BLOCKED: [], PENDING_OPERATOR: [], PASS: [] };
  for (const property of gate.properties) {
    for (const [code, check] of Object.entries(property.checks)) byCheck[code][check.status].push({ propertyId: property.propertyId, reason: check.reason });
  }
  // Root causes use the readiness analyzer's own debt vocabulary, so the two reports speak one language.
  const byRootCause = {};
  for (const property of gate.properties) {
    if (property.promotable) continue;
    for (const code of property.readinessDebt) (byRootCause[code] ||= []).push(property.propertyId);
  }
  return { byCheck, byRootCause, promotable: gate.properties.filter((p) => p.promotable).map((p) => p.propertyId), total: gate.properties.length };
}

export function formatGateReport(gate) {
  const inv = gapInventory(gate);
  const lines = [`Property promotion gate: ${inv.total} governed properties; GFD-side promotable: ${inv.promotable.length} (${inv.promotable.join(', ') || 'none'})`];
  lines.push(gate.fwompsHomeVerified ? 'FWOMPS host: verified read-only from --fwomps-home' : 'FWOMPS host: not verified (C3/C4 are PENDING_OPERATOR, an explicit operator action)');
  lines.push('');
  for (const [code, group] of Object.entries(inv.byCheck)) {
    lines.push(`${code} ${group.name}: PASS ${group.PASS.length} · PENDING_OPERATOR ${group.PENDING_OPERATOR.length} · FAIL ${group.FAIL.length} · BLOCKED ${group.BLOCKED.length}`);
  }
  lines.push('', 'Root causes among non-promotable properties (readiness debt vocabulary):');
  for (const [code, ids] of Object.entries(inv.byRootCause).sort((a, b) => b[1].length - a[1].length)) lines.push(`- ${code}: ${ids.length}`);
  return lines.join('\n');
}

