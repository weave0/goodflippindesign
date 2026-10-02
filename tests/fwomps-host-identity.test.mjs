import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { judgeKeyRecord, kcvFromBytes, readHostIdentity } from '../scripts/lib/fwomps-host-identity.mjs';
import { keyCheckValue, strongHexKeyBytes, strongTokenBytes } from '../workers/lib/key-check-value.js';
import { evaluatePreflight } from '../scripts/lib/mc-production-preflight.mjs';

const WORKER_ID = 'fwomps-operator-1';
const WORKER_KEY_ID = 'gfd-result-1';
const CONTRACT_KEY_ID = 'gfd-contract-1';
const WORKER_SECRET = '7'.repeat(64);
const CONTRACT_SECRET = '5'.repeat(64);
const NOW = '2026-10-01T12:00:00+00:00';

const workerRecord = (over = {}) => ({ key_id: WORKER_KEY_ID, worker_id: WORKER_ID, secret_hex: WORKER_SECRET, created_at: NOW, revoked: false, ...over });
const contractRecord = (over = {}) => ({ key_id: CONTRACT_KEY_ID, secret_hex: CONTRACT_SECRET, created_at: NOW, revoked: false, ...over });

/** Builds a throwaway FWOMPS home. `files` maps relative paths to string content (or objects => JSON). */
function home({ config = { mission_control: { enabled: true, worker_id: WORKER_ID, worker_key_id: WORKER_KEY_ID } }, files = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'fwomps-home-'));
  if (config !== null) writeFileSync(join(dir, 'config.json'), typeof config === 'string' ? config : JSON.stringify(config));
  for (const [rel, content] of Object.entries(files)) {
    const file = join(dir, rel);
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}
const good = () => ({ 'mission-control/worker-keys/gfd-result-1.json': workerRecord(), 'mission-control/contract-keys/gfd-contract-1.json': contractRecord() });
const read = (opts) => readHostIdentity(home(opts));

// valid enrollment passes
{
  const h = read({ files: good() });
  assert.equal(h.workerId, WORKER_ID);
  assert.equal(h.workerKey.enrolled, true);
  assert.deepEqual(h.workerKey.problems, []);
  assert.deepEqual(h.contractKeys.map((k) => [k.keyId, k.enrolled]), [[CONTRACT_KEY_ID, true]]);
}

// config names a matching worker key id but the file is absent
{
  const h = read({ files: { 'mission-control/contract-keys/gfd-contract-1.json': contractRecord() } });
  assert.equal(h.workerKeyId, WORKER_KEY_ID, 'config claims the key');
  assert.equal(h.workerKey.enrolled, false);
  assert.deepEqual(h.workerKey.problems, ['file_absent']);
}

// no worker_key_id configured at all / config unreadable
assert.deepEqual(read({ config: { mission_control: { worker_id: WORKER_ID } }, files: good() }).workerKey.problems, ['worker_key_id_not_configured']);
assert.equal(read({ config: null, files: good() }), null);
assert.equal(read({ config: '{not json', files: good() }), null);
assert.equal(readHostIdentity(null), null);

// wrong file / wrong key id inside the file
assert.deepEqual(read({ files: { ...good(), 'mission-control/worker-keys/gfd-result-1.json': workerRecord({ key_id: 'someone-elses-key' }) } }).workerKey.problems, ['key_id_mismatch']);
// a key enrolled under a different id does not satisfy the configured id
assert.deepEqual(read({ files: { 'mission-control/worker-keys/other.json': workerRecord({ key_id: 'other' }) } }).workerKey.problems, ['file_absent']);
// belongs to a different worker
assert.deepEqual(read({ files: { ...good(), 'mission-control/worker-keys/gfd-result-1.json': workerRecord({ worker_id: 'another-worker' }) } }).workerKey.problems, ['worker_id_mismatch']);
assert.deepEqual(read({ files: { ...good(), 'mission-control/worker-keys/gfd-result-1.json': workerRecord({ worker_id: undefined }) } }).workerKey.problems, ['worker_id_missing']);

// malformed files
for (const [label, content, expected] of [
  ['not json', '{oops', 'unreadable_or_malformed_json'],
  ['empty', '', 'unreadable_or_malformed_json'],
  ['array', '[]', 'not_an_object'],
  ['secret too short', workerRecord({ secret_hex: 'ab' }), 'secret_malformed'],
  ['secret not hex', workerRecord({ secret_hex: 'z'.repeat(64) }), 'secret_malformed'],
  ['secret missing', workerRecord({ secret_hex: undefined }), 'secret_malformed'],
  ['secret wrong type', workerRecord({ secret_hex: 12345 }), 'secret_malformed'],
  ['created_at bad', workerRecord({ created_at: 'whenever' }), 'created_at_malformed'],
  ['revoked', workerRecord({ revoked: true }), 'revoked'],
  ['revoked flag missing', workerRecord({ revoked: undefined }), 'revoked_flag_malformed'],
  ['oversized', `{"pad":"${'x'.repeat(5000)}"}`, 'file_too_large'],
]) {
  const h = read({ files: { ...good(), 'mission-control/worker-keys/gfd-result-1.json': content } });
  assert.equal(h.workerKey.enrolled, false, label);
  assert.ok(h.workerKey.problems.includes(expected), `${label}: ${h.workerKey.problems}`);
}

// an invalid configured key id (path traversal) is refused without touching the filesystem
for (const id of ['../config', '..\\..\\secrets', 'a/b', '', 'x'.repeat(65), 'has space']) {
  const h = read({ config: { mission_control: { worker_id: WORKER_ID, worker_key_id: id } }, files: good() });
  assert.equal(h.workerKey.enrolled, false, JSON.stringify(id));
  assert.ok(['key_id_invalid', 'worker_key_id_not_configured'].includes(h.workerKey.problems[0]), id);
}

// a symlink in place of the key file is not accepted (best effort: skipped where symlinks are not permitted)
{
  const dir = home({ files: { 'mission-control/worker-keys/real.json': workerRecord(), 'mission-control/contract-keys/gfd-contract-1.json': contractRecord() } });
  try {
    symlinkSync(join(dir, 'mission-control/worker-keys/real.json'), join(dir, 'mission-control/worker-keys/gfd-result-1.json'));
    assert.deepEqual(readHostIdentity(dir).workerKey.problems, ['not_a_regular_file']);
  } catch (error) {
    if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
  }
}

// contract keys: each file judged; invalid ones are not enrolled
{
  const h = read({ files: { ...good(), 'mission-control/contract-keys/bad.json': contractRecord({ key_id: 'bad', secret_hex: 'nope' }), 'mission-control/contract-keys/..evil.json': contractRecord() } });
  const byId = Object.fromEntries(h.contractKeys.map((k) => [k.keyId, k]));
  assert.equal(byId[CONTRACT_KEY_ID].enrolled, true);
  assert.equal(byId.bad.enrolled, false);
  assert.ok(!('..evil' in byId), 'ids outside the key alphabet are never even inspected');
}

// key material never appears in what is returned, even for failing files
{
  for (const files of [good(), { ...good(), 'mission-control/worker-keys/gfd-result-1.json': workerRecord({ revoked: true }) }]) {
    const text = JSON.stringify(read({ files }));
    assert.ok(!text.includes(WORKER_SECRET) && !text.includes(CONTRACT_SECRET), 'secret_hex must never be returned');
  }
  assert.deepEqual(judgeKeyRecord(workerRecord(), { keyId: WORKER_KEY_ID, workerId: WORKER_ID, kind: 'worker' }), []);
}

// key check values: the Worker (Web Crypto) and the host (node:crypto) agree byte for byte, are role-separated and one-way
{
  const bytes = strongHexKeyBytes(WORKER_SECRET);
  for (const role of ['contract', 'result', 'bearer']) assert.equal(await keyCheckValue(bytes, role), kcvFromBytes(bytes, role), role);
  assert.match(kcvFromBytes(bytes, 'result'), /^kcv:[0-9a-f]{16}$/);
  assert.notEqual(kcvFromBytes(bytes, 'result'), kcvFromBytes(bytes, 'contract'));
  assert.notEqual(kcvFromBytes(bytes, 'result'), kcvFromBytes(strongHexKeyBytes(CONTRACT_SECRET), 'result'));
  assert.ok(!kcvFromBytes(bytes, 'result').includes(WORKER_SECRET.slice(0, 16)));
  await assert.rejects(() => keyCheckValue(bytes, 'bogus'));
  await assert.rejects(() => keyCheckValue(new Uint8Array(4), 'result'));
  // only strong keys ever get a check value
  assert.equal(strongHexKeyBytes('short'), null);
  assert.equal(strongHexKeyBytes('z'.repeat(64)), null);
  assert.equal(strongTokenBytes('too-short'), null);
  assert.ok(strongTokenBytes('3'.repeat(128)));
  assert.equal(strongTokenBytes('t'.repeat(32)), null);
  assert.equal(strongTokenBytes('3'.repeat(127)), null);
  assert.equal(strongTokenBytes('A'.repeat(128)), null);
  // the host reader exposes the check value of an enrolled key (in memory) and none for a bad one
  const h = read({ files: good() });
  assert.equal(h.workerKey.kcv, kcvFromBytes(strongHexKeyBytes(WORKER_SECRET), 'result'));
  assert.equal(h.contractKeys[0].kcv, kcvFromBytes(strongHexKeyBytes(CONTRACT_SECRET), 'contract'));
  assert.equal(read({ files: { ...good(), 'mission-control/worker-keys/gfd-result-1.json': workerRecord({ revoked: true }) } }).workerKey.kcv, undefined);
  // the delivery bearer env var NAME comes from the host config (validated), never a value
  assert.equal(read({ config: { mission_control: { worker_id: WORKER_ID, worker_key_id: WORKER_KEY_ID, delivery: { bearer_env: 'GFD_MC_WORKER_TOKEN' } } }, files: good() }).bearerEnv, 'GFD_MC_WORKER_TOKEN');
  assert.equal(read({ config: { mission_control: { worker_id: WORKER_ID, worker_key_id: WORKER_KEY_ID, delivery: { bearer_env: 'lower; rm -rf' } } }, files: good() }).bearerEnv, null);
}

// end to end through the gate: a host that names the key but cannot sign never turns it GREEN
{
  const fp = (await import('../scripts/lib/mc-production-preflight.mjs')).fingerprint;
  const BEARER_KCV = kcvFromBytes(strongTokenBytes('b'.repeat(128)), 'bearer');
  const present = (n, v, kcv) => [n, { state: 'present', ...(v ? { fingerprint: fp(v) } : {}), ...(kcv ? { kcv } : {}) }];
  const probeBody = {
    schemaVersion: 'gfd-mc-runtime-provenance-1',
    runtime: { kind: 'cloudflare-pages-advanced-worker', servedHost: 'goodflippindesign.com' },
    bindings: Object.fromEntries([present('MISSION_CONTROL_CONTRACT_KEY', null, kcvFromBytes(strongHexKeyBytes(CONTRACT_SECRET), 'contract')), present('MISSION_CONTROL_CONTRACT_KEY_ID', CONTRACT_KEY_ID), present('MISSION_CONTROL_RESULT_KEY', null, kcvFromBytes(strongHexKeyBytes(WORKER_SECRET), 'result')), present('MISSION_CONTROL_RESULT_KEY_ID', WORKER_KEY_ID), present('MISSION_CONTROL_RESULT_WORKER_ID', WORKER_ID), present('MISSION_CONTROL_WORKER_TOKEN', null, BEARER_KCV)]),
  };
  const base = { expectedWorkerId: WORKER_ID, origin: 'https://goodflippindesign.com', probe: { status: 200, body: probeBody }, gate: { fwompsHomeVerified: true, properties: [] }, bearerKcv: BEARER_KCV };
  const withFiles = (files) => evaluatePreflight({ ...base, host: read({ files }) });
  assert.equal(withFiles(good()).checks.P6.status, 'PASS');
  assert.equal(withFiles(good()).hostIdentity.workerKeyEnrolled, true);
  assert.equal(withFiles(good()).hostIdentity.workerKeyMaterialMatches, true);
  // an enrolled but DIFFERENT key (same id) is caught by the key check value
  const swapped = withFiles({ ...good(), 'mission-control/worker-keys/gfd-result-1.json': workerRecord({ secret_hex: '3'.repeat(64) }) });
  assert.equal(swapped.checks.P6.status, 'FAIL');
  assert.match(swapped.checks.P6.reason, /worker key material/);
  assert.equal(swapped.hostIdentity.workerKeyMaterialMatches, false);
  const claimOnly = withFiles({ 'mission-control/contract-keys/gfd-contract-1.json': contractRecord() });
  assert.equal(claimOnly.checks.P6.status, 'FAIL');
  assert.match(claimOnly.checks.P6.reason, /file_absent/);
  assert.equal(claimOnly.checks.P7.status, 'FAIL');
  assert.equal(claimOnly.hostIdentity.workerKeyEnrolled, false);
}

console.log('fwomps host identity tests: all passed');
