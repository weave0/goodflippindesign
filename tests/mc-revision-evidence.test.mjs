import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CLASSIFICATIONS, SecretLeakError, auditForSecrets, buildEvidence, buildLeakReceipt, digestOf, evidenceFileName, verifyEvidence, writeEvidence, writeLeakReceipt,
} from '../scripts/lib/revision-bound-evidence.mjs';

const GFD = 'a'.repeat(40);
const FW = 'b'.repeat(40);
const AIA = 'c'.repeat(40);
const DEP = '58d05431-3a61-47ab-a8ec-0e1678829e3f';
const D1 = 'a46ec9df-31b8-4285-845b-1fd3a62bd1b5';
const RESULT_DIGEST = `sha256:${'d'.repeat(64)}`;
const NOW = new Date('2026-10-02T12:00:00.000Z');

const passAll = () => Object.fromEntries(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'P11'].map((c) => [c, { name: c, status: 'PASS', reason: 'ok' }]));
const preflight = () => ({
  expectedSha: GFD, canStartInvestigation: true, failing: [], checks: passAll(),
  cloudflare: { deploymentId: DEP, commitHash: GFD },
  hostIdentity: { workerKeyEnrolled: true, workerKeyIdFingerprint: 'sha256:0123456789abcdef', contractKeyEnrolled: true, contractKeyIdFingerprint: 'sha256:fedcba9876543210', contractKeyMaterialMatches: true, workerKeyMaterialMatches: true, deliveryBearerMatches: true },
});
const subject = () => ({ propertyId: 'aiaimate.com', workItemId: 'gfdwi_v1_x', effectId: 'eff_1', attempt: 1, requestId: 'req_1', leaseId: 'lease_1', resultDigest: RESULT_DIGEST });
const common = () => ({
  subject: subject(),
  counts: { workItems: 1, dispatchEffects: 1, attempts: 1 },
  lifecycle: [
    { at: '2026-10-02T11:00:00Z', from: 'OBSERVED', to: 'QUALIFIED', actor: 'operator' },
    { at: '2026-10-02T11:01:00Z', from: 'QUALIFIED', to: 'INVESTIGATION_READY', actor: 'operator' },
    { at: '2026-10-02T11:02:00Z', from: 'INVESTIGATION_READY', to: 'INVESTIGATING', actor: 'operator' },
    { at: '2026-10-02T11:03:00Z', from: 'INVESTIGATING', to: 'DIAGNOSED', actor: 'fwomps-operator-1' },
  ],
  lease: { releasedAfterResult: true, activeAfterResult: false },
  idempotency: { redeliveries: [{ status: 200, resultDigest: RESULT_DIGEST }, { status: 200, resultDigest: RESULT_DIGEST }], newWorkItems: 0, newEffects: 0, newResultEvents: 0, duplicateWorkItems: 0, duplicateEffects: 0, duplicateResults: 0 },
  repositoryMutation: { headBefore: AIA, headAfter: AIA, worktreeCleanBefore: true, worktreeCleanAfter: true, remoteWritesAttempted: 0, repairOrDeployEffects: 0 },
});
const productionRevisions = () => ({
  gfd: { sha: GFD, onOriginMain: true },
  cloudflare: { project: 'goodflippindesign', environment: 'production', deploymentId: DEP, commitHash: GFD, stage: 'deploy:success', completedOn: '2026-10-02T10:00:00Z' },
  runtimeStamp: { sha: GFD, builtAt: '2026-10-02T09:58:00Z' },
  fwomps: { sha: FW },
  aiaimate: { sha: AIA },
});
const canary = () => ({
  ...common(), classification: 'controlled-production-canary', revisions: productionRevisions(), preflight: preflight(),
  observation: { synthetic: true, canary: true, natural: false, label: 'SYNTHETIC CANARY - not a real incident' },
  d1: { databaseId: D1, canonicalDatabaseId: D1 },
});
const natural = () => ({ ...canary(), classification: 'naturally-occurring-production-incident', observation: { natural: true, synthetic: false, canary: false, productionSweepRunId: 'sweep_9', firstObservedAt: '2026-10-02T10:30:00Z' } });
const ci = () => ({ ...common(), classification: 'ci-proven', observation: { synthetic: true }, ci: { runId: '123', sha: GFD }, revisions: { gfd: { sha: GFD, onOriginMain: true } } });
const tier2 = () => ({ ...common(), classification: 'tier2-isolated-specimen', observation: { synthetic: true }, specimen: { isolatedFwompsHome: true, operatorHomeTouched: false }, revisions: { gfd: { sha: GFD, onOriginMain: true }, fwomps: { sha: FW }, aiaimate: { sha: AIA } } });

const build = (facts, opts) => buildEvidence(facts, { now: NOW, ...opts });
const failed = (facts) => build(facts).failedAssertions;
const mut = (make, fn) => { const f = make(); fn(f); return f; };

// --- each classification builds a valid artifact with its boundary stated ------------------------------
for (const [name, make] of [['controlled-production-canary', canary], ['naturally-occurring-production-incident', natural], ['ci-proven', ci], ['tier2-isolated-specimen', tier2]]) {
  const a = build(make());
  assert.equal(a.valid, true, `${name}: ${a.failedAssertions}`);
  assert.equal(a.classification, name);
  assert.ok(a.classificationDetail.doesNotProve.length > 0, 'every class states what it does NOT prove');
  assert.equal(verifyEvidence(a).ok, true);
}
assert.deepEqual(Object.keys(CLASSIFICATIONS), ['ci-proven', 'tier2-isolated-specimen', 'controlled-production-canary', 'naturally-occurring-production-incident']);

// --- evidence classes never blend ---------------------------------------------------------------------
assert.ok(failed(mut(canary, (f) => { f.observation.synthetic = false; })).includes('canary_is_unmistakably_synthetic'));
assert.ok(failed(mut(canary, (f) => { f.observation.label = 'production incident'; })).includes('canary_is_unmistakably_synthetic'));
assert.ok(failed(mut(canary, (f) => { f.observation.natural = true; })).includes('canary_is_unmistakably_synthetic'));
assert.ok(failed(mut(natural, (f) => { f.observation.synthetic = true; })).includes('incident_is_organic_not_synthetic'), 'a synthetic observation can never be labelled a natural incident');
assert.ok(failed(mut(natural, (f) => { f.observation.canary = true; })).includes('incident_is_organic_not_synthetic'));
assert.ok(failed(mut(natural, (f) => { delete f.observation.productionSweepRunId; })).includes('incident_is_organic_not_synthetic'));
assert.ok(failed(mut(ci, (f) => { f.revisions.cloudflare = productionRevisions().cloudflare; })).includes('ci_makes_no_production_claim'), 'CI evidence cannot carry a production claim');
assert.ok(failed(mut(tier2, (f) => { f.specimen.operatorHomeTouched = true; })).includes('tier2_uses_isolated_home'));
assert.ok(failed(mut(canary, (f) => { f.classification = 'something-else'; })).includes('classification_known'));
assert.ok(failed(mut(canary, (f) => { f.subject.propertyId = 'other.example'; })).includes('canary_property_is_aiaimate'));

// --- revision binding (production classes) ---------------------------------------------------------------
assert.ok(failed(mut(canary, (f) => { f.revisions.runtimeStamp.sha = 'e'.repeat(40); })).includes('three_way_revision_agreement'));
assert.ok(failed(mut(canary, (f) => { f.revisions.cloudflare.commitHash = 'e'.repeat(40); })).includes('three_way_revision_agreement'));
assert.ok(failed(mut(canary, (f) => { f.revisions.gfd.onOriginMain = false; })).includes('gfd_sha_valid_on_main'));
assert.ok(failed(mut(canary, (f) => { f.revisions.cloudflare.stage = 'build:success'; })).includes('cloudflare_deployment_recorded'));
assert.ok(failed(mut(canary, (f) => { delete f.revisions.cloudflare.deploymentId; })).includes('cloudflare_deployment_recorded'));
assert.ok(failed(mut(canary, (f) => { delete f.revisions.fwomps; })).includes('fwomps_and_aiaimate_revisions_pinned'));
assert.ok(failed(mut(canary, (f) => { f.preflight.canStartInvestigation = false; })).includes('preflight_green'));
assert.ok(failed(mut(canary, (f) => { f.preflight.checks.P4.status = 'FAIL'; })).includes('preflight_green'));
assert.ok(failed(mut(canary, (f) => { delete f.preflight; })).includes('preflight_green'));
assert.ok(failed(mut(canary, (f) => { f.preflight.expectedSha = 'e'.repeat(40); })).includes('preflight_green'));
assert.ok(failed(mut(canary, (f) => { f.preflight.cloudflare.deploymentId = 'other'; })).includes('preflight_bound_to_same_deployment'));
assert.ok(failed(mut(canary, (f) => { f.d1.databaseId = 'ffffffff-0000-0000-0000-000000000000'; })).includes('production_d1_identity_recorded'));

// --- single work item / effect / attempt, lifecycle, lease, result ----------------------------------------
assert.ok(failed(mut(canary, (f) => { f.counts.workItems = 2; })).includes('exactly_one_work_item_effect_attempt'));
assert.ok(failed(mut(canary, (f) => { f.counts.dispatchEffects = 2; })).includes('exactly_one_work_item_effect_attempt'));
assert.ok(failed(mut(canary, (f) => { f.subject.attempt = 2; })).includes('exactly_one_work_item_effect_attempt'));
assert.ok(failed(mut(canary, (f) => { f.subject.resultDigest = 'nope'; })).includes('result_digest_recorded'));
assert.ok(failed(mut(canary, (f) => { f.lifecycle.pop(); })).includes('lifecycle_reaches_diagnosed'));
// the lifecycle must be ONE connected, legal, time-ordered path starting at OBSERVED
for (const [label, mutate] of [
  ['skipped a state', (f) => { f.lifecycle.splice(1, 1); }],
  ['disconnected from', (f) => { f.lifecycle[2].from = 'QUALIFIED'; }],
  ['does not start at OBSERVED', (f) => { f.lifecycle.shift(); }],
  ['illegal edge', (f) => { f.lifecycle[1].to = 'DIAGNOSED'; f.lifecycle[2].from = 'DIAGNOSED'; }],
  ['time goes backwards', (f) => { f.lifecycle[2].at = '2026-10-02T10:00:00Z'; }],
  ['timestamp not parseable', (f) => { f.lifecycle[1].at = 'later'; }],
  ['duplicate transition', (f) => { f.lifecycle.splice(1, 0, { ...f.lifecycle[0] }); }],
  ['repair edge appended', (f) => { f.lifecycle.push({ at: '2026-10-02T11:04:00Z', from: 'DIAGNOSED', to: 'REPAIR_READY', actor: 'x' }); }],
]) assert.ok(failed(mut(canary, mutate)).includes('lifecycle_is_a_connected_legal_path'), label);
assert.equal(build(canary()).assertions.find((a) => a.id === 'lifecycle_is_a_connected_legal_path').pass, true);
assert.ok(failed(mut(canary, (f) => { f.lifecycle.push({ at: 'x', from: 'DIAGNOSED', to: 'REPAIR_PROPOSED', actor: 'x' }); })).includes('lifecycle_has_no_repair_states'));
assert.ok(failed(mut(canary, (f) => { f.lease.releasedAfterResult = false; })).includes('lease_released'));

// --- idempotency ------------------------------------------------------------------------------------------
assert.ok(failed(mut(canary, (f) => { f.idempotency.redeliveries = []; })).includes('idempotent_redelivery'), 'no redelivery tested => not proven');
assert.ok(failed(mut(canary, (f) => { f.idempotency.redeliveries[1].status = 409; })).includes('idempotent_redelivery'));
assert.ok(failed(mut(canary, (f) => { f.idempotency.redeliveries[0].resultDigest = `sha256:${'f'.repeat(64)}`; })).includes('idempotent_redelivery'));
assert.ok(failed(mut(canary, (f) => { f.idempotency.newResultEvents = 1; })).includes('idempotent_redelivery'));
assert.ok(failed(mut(canary, (f) => { f.idempotency.duplicateEffects = 1; })).includes('no_duplicate_work_effect_or_result'));

// --- repository mutation ------------------------------------------------------------------------------------
assert.ok(failed(mut(canary, (f) => { f.repositoryMutation.headAfter = 'e'.repeat(40); })).includes('no_repository_mutation'));
assert.ok(failed(mut(canary, (f) => { f.repositoryMutation.worktreeCleanAfter = false; })).includes('no_repository_mutation'));
assert.ok(failed(mut(canary, (f) => { f.repositoryMutation.remoteWritesAttempted = 1; })).includes('no_repository_mutation'));
assert.ok(failed(mut(canary, (f) => { f.repositoryMutation.repairOrDeployEffects = 1; })).includes('no_repository_mutation'));
assert.ok(failed(mut(canary, (f) => { delete f.repositoryMutation; })).includes('no_repository_mutation'));

// --- secret-leak audit ----------------------------------------------------------------------------------------
{
  const KEY = '9'.repeat(64);
  const TOKEN = 'operator-bearer-sentinel-0123456789';
  for (const [label, mutate] of [
    ['bare 64-hex key', (f) => { f.notes = [`key ${KEY}`]; }],
    ['bearer header', (f) => { f.notes = ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345']; }],
    ['jwt', (f) => { f.notes = ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.c2lnbmF0dXJl']; }],
    ['github token', (f) => { f.notes = ['ghp_abcdefghijklmnopqrstuvwxyz0123456789']; }],
    ['known value', (f) => { f.notes = [`bearer was ${TOKEN}`]; }],
  ]) {
    const a = build(mut(canary, mutate), { knownSecrets: [TOKEN] });
    assert.equal(a.valid, false, label);
    assert.ok(a.failedAssertions.includes('secret_leak_audit_clean'), label);
    const text = JSON.stringify(a);
    assert.ok(!text.includes(KEY.repeat(1)) || label !== 'bare 64-hex key' || a.secretLeakAudit.findings[0].kind, 'audit reports kinds and counts');
    assert.ok(a.secretLeakAudit.findings.every((x) => Object.keys(x).sort().join() === 'count,kind'), 'findings never carry the matched text');
  }
  // digests and commit SHAs are not secrets
  const clean = build(canary());
  assert.equal(clean.secretLeakAudit.clean, true);
  assert.ok(JSON.stringify(clean).includes(RESULT_DIGEST));
  assert.equal(auditForSecrets(`sha256:${'a'.repeat(64)} ${GFD}`).clean, true);
  assert.equal(auditForSecrets(`${'a'.repeat(64)}`).clean, false);
}

// --- tamper evidence ----------------------------------------------------------------------------------------------
{
  const a = JSON.parse(JSON.stringify(build(canary())));
  assert.equal(verifyEvidence(a).ok, true);
  const edited = JSON.parse(JSON.stringify(a)); edited.revisions.aiaimate.sha = 'e'.repeat(40);
  assert.match(verifyEvidence(edited).problems.join(), /edited/);
  const flipped = JSON.parse(JSON.stringify(a)); flipped.valid = true; flipped.assertions[0].pass = false;
  assert.equal(verifyEvidence(flipped).ok, false);
  const bad = JSON.parse(JSON.stringify(build(mut(canary, (f) => { f.counts.workItems = 2; }))));
  assert.match(verifyEvidence(bad).problems.join(), /do not make a valid artifact/);
  assert.equal(verifyEvidence({ schemaVersion: 'other' }).ok, false);
}

// --- file names can never traverse out of the evidence directory --------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'mc-names-'));
  const hostile = ['../../../escape', '..\\..\\escape', 'a/b', 'a\\b', '', 'x'.repeat(300), 'C:\\Windows', '%2e%2e%2f', 'a b', 'ok\u0000nul'];
  for (const classification of hostile) {
    const artifact = { ...build(mut(canary, (f) => { f.counts.workItems = 2; })), classification };
    const name = evidenceFileName(artifact);
    assert.match(name, /^[A-Za-z0-9._-]+$/, JSON.stringify(classification));
    assert.ok(!name.includes('..') && !name.includes('/') && !name.includes('\\'));
    assert.match(name, /^mc-evidence-unknown-class-/, 'an unrecognised classification degrades to a fixed token');
    if (classification === hostile[0]) writeEvidence(artifact, dir, { allowInvalid: true, knownSecrets: [] });
    else assert.throws(() => writeEvidence(artifact, dir, { allowInvalid: true }), /refusing to overwrite/);
  }
  // hostile revision / deployment strings are dropped, never embedded
  const base = build(mut(canary, (f) => { f.counts.workItems = 2; }));
  const withIds = { ...base, revisions: { ...base.revisions, gfd: { ...base.revisions.gfd, sha: '../../etc/passwd' }, cloudflare: { ...base.revisions.cloudflare, deploymentId: '../../x' } } };
  const name = evidenceFileName(withIds);
  assert.ok(name.includes('-unbound-') && !name.includes('passwd') && !name.includes('x-2026'));
  assert.equal(evidenceFileName({ ...base, generatedAt: '../../t' }).includes('..'), false);
  // everything written is a direct child of the directory (nothing escaped to the parent)
  const written = readdirSync(dir);
  assert.ok(written.length >= 1 && written.every((f) => /^[A-Za-z0-9._-]+$/.test(f)));
  assert.deepEqual(readdirSync(join(dir, '..')).filter((f) => f === 'escape' || f === 'etc'), []);
  // a leak receipt name is equally constrained
  const leakDir = mkdtempSync(join(tmpdir(), 'mc-receipt-'));
  const receiptFile = writeLeakReceipt('../../escape', new SecretLeakError([{ kind: 'jwt', count: 1 }]), leakDir, { now: NOW });
  assert.equal(join(receiptFile, '..'), leakDir);
  assert.match(receiptFile, /LEAK-RECEIPT-unknown-/);
  // a valid artifact still gets its descriptive, revision-bound name
  assert.match(evidenceFileName(build(canary())), /^mc-evidence-controlled-production-canary-aaaaaaaaaaaa-58d05431-20261002T120000Z\.json$/);
}

// --- immutable, revision-bound files; never overwrites ---------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'mc-evidence-'));
  const a = build(canary());
  assert.match(evidenceFileName(a), /^mc-evidence-controlled-production-canary-aaaaaaaaaaaa-58d05431-20261002T120000Z\.json$/);
  const file = writeEvidence(a, dir);
  assert.equal(verifyEvidence(JSON.parse(readFileSync(file, 'utf8'))).ok, true);
  assert.throws(() => writeEvidence(a, dir), /refusing to overwrite/);
  const later = build(canary(), { now: new Date('2026-10-02T13:00:00.000Z') });
  assert.notEqual(writeEvidence(later, dir), file, 'a later proof gets its own artifact');
  const invalid = build(mut(canary, (f) => { f.counts.workItems = 2; }));
  assert.throws(() => writeEvidence(invalid, dir), /invalid evidence/);
  assert.ok(writeEvidence(invalid, dir, { allowInvalid: true }), 'a failure may be recorded, but is marked valid:false');
  const existing = join(dir, 'x.json'); writeFileSync(existing, '{}');
}

// --- secret-leak fence: a detected secret can NEVER be persisted ------------------------------------------------------
{
  const KEY = '9'.repeat(64);
  const TOKEN = 'operator-bearer-sentinel-0123456789';
  const dir = mkdtempSync(join(tmpdir(), 'mc-fence-'));
  const leaky = build(mut(canary, (f) => { f.notes = [`oops ${KEY}`]; }));
  assert.equal(leaky.valid, false);
  for (const options of [{}, { allowInvalid: true }, { allowInvalid: true, knownSecrets: [TOKEN] }]) {
    assert.throws(() => writeEvidence(leaky, dir, options), (error) => error instanceof SecretLeakError && !error.message.includes(KEY));
  }
  assert.deepEqual(readdirSync(dir), [], 'nothing was written');

  // the fence does not trust the flag stored on the artifact: a forged "clean" audit still cannot persist a secret
  const forged = JSON.parse(JSON.stringify(build(canary())));
  forged.notes = [`token ${KEY}`];
  assert.equal(forged.secretLeakAudit.clean, true, 'the stored audit claims clean');
  assert.throws(() => writeEvidence(forged, dir, { allowInvalid: true }), SecretLeakError);
  // a known (non-pattern) value is fenced too, even in a different hex case / JSON-escaped
  const odd = build(mut(canary, (f) => { f.notes = [`bearer was ${TOKEN}`]; }), { knownSecrets: [TOKEN] });
  assert.throws(() => writeEvidence(odd, dir, { allowInvalid: true, knownSecrets: [TOKEN] }), SecretLeakError);
  const hexSecret = 'AbCdEf0123456789';
  assert.equal(auditForSecrets(`x ${hexSecret.toLowerCase()} y`, [hexSecret]).clean, false, 'other-case hex variant is caught');
  assert.equal(auditForSecrets(`x ${JSON.stringify('a"b\\c-secret-1234').slice(1, -1)} y`, ['a"b\\c-secret-1234']).clean, false, 'JSON-escaped variant is caught');
  assert.deepEqual(readdirSync(dir), []);

  // the sanitized receipt carries no body, no field names, no values
  const error = (() => { try { writeEvidence(leaky, dir); } catch (e) { return e; } return null; })();
  const receiptFile = writeLeakReceipt(leaky.classification, error, dir, { now: NOW });
  const receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
  assert.deepEqual(Object.keys(receipt).sort(), ['classification', 'findings', 'generatedAt', 'note', 'schemaVersion']);
  assert.equal(receipt.classification, 'controlled-production-canary');
  assert.deepEqual(receipt.findings, [{ kind: 'bare_64_hex', count: 1 }]);
  const text = readFileSync(receiptFile, 'utf8');
  for (const forbidden of [KEY, 'oops', 'notes', 'workItemId', DEP, GFD]) assert.ok(!text.includes(forbidden), `receipt must not contain ${forbidden}`);
  assert.deepEqual(buildLeakReceipt('not-a-class', [{ kind: 'jwt', count: 2, value: 'x' }]).findings, [{ kind: 'jwt', count: 2 }]);
  assert.equal(buildLeakReceipt('not-a-class', []).classification, 'unknown');
}

// --- CLI: known secrets come from the environment only, and the fence holds end to end -------------------------------
{
  const TOKEN = 'cf-api-token-sentinel-0123456789abcdef';
  const dir = mkdtempSync(join(tmpdir(), 'mc-cli-'));
  const factsFile = join(dir, 'facts.json');
  const cli = (extra, env = {}) => spawnSync(process.execPath, ['--no-warnings', fileURLToPath(new URL('../scripts/mc-evidence.mjs', import.meta.url)), '--facts', factsFile, '--out', join(dir, 'out'), ...extra], {
    encoding: 'utf8', env: { PATH: process.env.PATH, ...env },
  });

  writeFileSync(factsFile, JSON.stringify(mut(canary, (f) => { f.notes = [`pasted ${TOKEN}`]; })));
  // no env => an arbitrary-format token is not detectable by pattern (that is why known values matter)
  const blind = cli(['--record-failure']);
  assert.equal(blind.status, 0, 'without the env value the arbitrary token is invisible to the pattern audit');
  rmSync(join(dir, 'out'), { recursive: true, force: true });

  for (const name of ['CLOUDFLARE_API_TOKEN', 'GFD_OPERATOR_TOKEN', 'FWOMPS_MC_CONTRACT_KEY_HEX', 'FWOMPS_MC_WORKER_KEY_HEX', 'GFD_MC_WORKER_TOKEN']) {
    const value = name.endsWith('_HEX') ? 'AB'.repeat(32).slice(0, 63) + 'c' : `${name.toLowerCase()}-sentinel-value-12345`;
    writeFileSync(factsFile, JSON.stringify(mut(canary, (f) => { f.notes = [`pasted ${value}`]; })));
    const refused = cli([], { [name]: value });
    assert.equal(refused.status, 1, name);
    assert.ok(!refused.stdout.includes(value) && !refused.stderr.includes(value), `${name} value must never be printed`);
    assert.match(refused.stderr, /secret-leak fence/);
    assert.ok(!existsSync(join(dir, 'out')) || readdirSync(join(dir, 'out')).length === 0, `${name}: no artifact written`);

    // --record-failure does NOT override the fence; it writes only the sanitized receipt
    const recorded = cli(['--record-failure'], { [name]: value });
    assert.equal(recorded.status, 1);
    const files = readdirSync(join(dir, 'out'));
    assert.deepEqual(files.map((f) => f.startsWith('mc-evidence-LEAK-RECEIPT-')), [true], `${name}: only a receipt exists`);
    const receiptText = readFileSync(join(dir, 'out', files[0]), 'utf8');
    assert.ok(!receiptText.includes(value) && !receiptText.includes('pasted'));
    rmSync(join(dir, 'out'), { recursive: true, force: true });
  }

  // an operator-specific env var name can be added with --also-env (name on argv, value from env)
  writeFileSync(factsFile, JSON.stringify(mut(canary, (f) => { f.notes = [`pasted ${TOKEN}`]; })));
  assert.equal(cli(['--also-env', 'MY_EXTRA_TOKEN'], { MY_EXTRA_TOKEN: TOKEN }).status, 1);
  rmSync(join(dir, 'out'), { recursive: true, force: true });

  // a clean run writes; verify (with the secrets in env) passes; the tool refuses to rewrite it
  writeFileSync(factsFile, JSON.stringify(canary()));
  assert.equal(cli([], { CLOUDFLARE_API_TOKEN: TOKEN }).status, 0);
  const written = join(dir, 'out', readdirSync(join(dir, 'out'))[0]);
  const verify = spawnSync(process.execPath, ['--no-warnings', fileURLToPath(new URL('../scripts/mc-evidence.mjs', import.meta.url)), '--verify', written], { encoding: 'utf8', env: { PATH: process.env.PATH, CLOUDFLARE_API_TOKEN: TOKEN } });
  assert.match(verify.stdout, /evidence OK/);
}

// --- verification recomputes semantics: derived fields are never authoritative -----------------------------------------
{
  const redigest = (artifact) => { const { artifactDigest, ...rest } = artifact; return { ...artifact, artifactDigest: digestOf({ ...rest, artifactDigest: undefined }) }; };
  const clean = JSON.parse(JSON.stringify(build(canary())));
  assert.equal(verifyEvidence(clean).ok, true);

  // an invalid artifact (two work items) hand-edited to look valid, with the digest recomputed
  const invalid = JSON.parse(JSON.stringify(build(mut(canary, (f) => { f.counts.workItems = 2; }))));
  assert.equal(invalid.valid, false);
  const flipped = redigest({ ...invalid, valid: true, failedAssertions: [] });
  assert.equal(flipped.artifactDigest === invalid.artifactDigest, false);
  const flippedResult = verifyEvidence(flipped);
  assert.equal(flippedResult.ok, false);
  assert.match(flippedResult.problems.join(), /stored valid=true but the facts derive valid=false/);

  // also flipping every assertion to pass
  const allPass = redigest({ ...invalid, valid: true, failedAssertions: [], assertions: invalid.assertions.map((a) => ({ ...a, pass: true })) });
  const allPassResult = verifyEvidence(allPass);
  assert.equal(allPassResult.ok, false);
  assert.match(allPassResult.problems.join(), /assertions differ/);

  // editing a fact so the stored verdict goes stale, digest recomputed
  const staleFacts = redigest({ ...clean, counts: { ...clean.counts, workItems: 5 } });
  assert.match(verifyEvidence(staleFacts).problems.join(), /assertions differ|stored valid/);

  // editing the classification detail / smuggling a field / hiding a secret behind the derived sections
  assert.match(verifyEvidence(redigest({ ...clean, classificationDetail: { ...clean.classificationDetail, doesNotProve: [] } })).problems.join(), /classificationDetail/);
  assert.match(verifyEvidence(redigest({ ...clean, extra: 'x' })).problems.join(), /unexpected top-level fields/);
  const hidden = redigest({ ...clean, notes: [`k ${'8'.repeat(64)}`] });
  assert.equal(verifyEvidence(hidden).ok, false);
  assert.match(verifyEvidence(hidden).problems.join(), /secret-leak audit/);

  // the stored audit may not be forged to read clean
  const leakyBuilt = JSON.parse(JSON.stringify(build(mut(canary, (f) => { f.notes = [`k ${'8'.repeat(64)}`]; }))));
  const forgedAudit = redigest({ ...leakyBuilt, secretLeakAudit: { ...leakyBuilt.secretLeakAudit, clean: true, findings: [] }, valid: true, failedAssertions: [], assertions: leakyBuilt.assertions.map((a) => ({ ...a, pass: true })) });
  assert.equal(verifyEvidence(forgedAudit).ok, false);

  // known secrets are scanned at verify time too
  const withToken = JSON.parse(JSON.stringify(build(mut(canary, (f) => { f.notes = ['arbitrary-format-token-abc123xyz']; }))));
  assert.equal(verifyEvidence(withToken).ok, true, 'invisible to patterns');
  assert.equal(verifyEvidence(withToken, { knownSecrets: ['arbitrary-format-token-abc123xyz'] }).ok, false);

  // a changed digest alone is detected
  assert.match(verifyEvidence({ ...clean, artifactDigest: `sha256:${'0'.repeat(64)}` }).problems.join(), /artifactDigest/);

  // the host-can-sign assertion is part of every production artifact
  assert.ok(failed(mut(canary, (f) => { f.preflight.hostIdentity.workerKeyEnrolled = false; })).includes('host_can_sign_results'));
  assert.ok(failed(mut(canary, (f) => { delete f.preflight.hostIdentity; })).includes('host_can_sign_results'));
for (const key of ['contractKeyEnrolled', 'contractKeyMaterialMatches', 'workerKeyMaterialMatches', 'deliveryBearerMatches']) {
  assert.ok(failed(mut(canary, (f) => { f.preflight.hostIdentity[key] = false; })).includes('host_can_sign_results'), key);
}
}

// --- the digest is documented as a content digest, not an attestation ---------------------------------------------------
{
  const src = readFileSync(fileURLToPath(new URL('../scripts/lib/revision-bound-evidence.mjs', import.meta.url)), 'utf8');
  assert.match(src, /not a signature and not an[\s*]+independently anchored[\s*]+attestation/);
  assert.match(readFileSync(fileURLToPath(new URL('../docs/mission-control-worker-provenance.md', import.meta.url)), 'utf8'), /not a cryptographic signature/);
}

console.log('mc revision evidence tests: all passed');
