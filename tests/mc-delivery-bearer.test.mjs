// The delivery bearer has one canonical shape (128 lowercase hex = 512 bits). The provisioner must never mint another.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { strongTokenBytes } from '../workers/lib/key-check-value.js';
import { generateCanaryRunnerToken, generateDeliveryBearer, resolveCanaryRunnerProvision, resolveCanaryRunnerToken, resolveDeliveryBearer } from '../scripts/lib/mc-delivery-bearer.mjs';

for (let i = 0; i < 20; i += 1) {
  const bearer = generateDeliveryBearer();
  assert.match(bearer, /^[0-9a-f]{128}$/);
  assert.ok(strongTokenBytes(bearer), 'generated bearer satisfies the runtime/preflight validator');
}
assert.notEqual(generateDeliveryBearer(), generateDeliveryBearer());

const valid = 'ab'.repeat(64);
assert.deepEqual(resolveDeliveryBearer(valid), { bearer: valid, generated: false }); // reuse an already-valid host bearer
for (const absent of [undefined, null, '']) {
  const made = resolveDeliveryBearer(absent);
  assert.equal(made.generated, true); assert.ok(strongTokenBytes(made.bearer));
}
for (const bad of ['ab'.repeat(32), 'AB'.repeat(64), `${'ab'.repeat(63)}zz`, 'x']) {
  assert.throws(() => resolveDeliveryBearer(bad, 'GFD_MC_WORKER_TOKEN'), /canonical 128-lowercase-hex/, 'malformed host bearer fails clearly');
  try { resolveDeliveryBearer(bad); } catch (error) { assert.ok(!error.message.includes(bad) || bad.length < 4, 'error must not echo the bearer'); }
}

// the provisioner uses the canonical generator and no inline 32-byte generation remains
const provisioner = readFileSync(new URL('../scripts/mc-production-provision.mjs', import.meta.url), 'utf8');
assert.ok(provisioner.includes("from './lib/mc-delivery-bearer.mjs'"));
assert.ok(!/randomBytes\(\s*32\s*\)/.test(provisioner), 'no 256-bit bearer generation in the provisioner');

// canary-runner token: same canonical strength, but an independent secret that never equals the delivery bearer
{
  const worker = 'ab'.repeat(64);
  const made = resolveCanaryRunnerToken(undefined, worker);
  assert.equal(made.generated, true); assert.ok(strongTokenBytes(made.token)); assert.notEqual(made.token, worker);
  const reused = resolveCanaryRunnerToken('cd'.repeat(64), worker);
  assert.deepEqual(reused, { token: 'cd'.repeat(64), generated: false });
  assert.throws(() => resolveCanaryRunnerToken('ab'.repeat(32), worker, 'GFD_MC_CANARY_RUNNER_TOKEN'), /canonical 128-lowercase-hex/);
  assert.throws(() => resolveCanaryRunnerToken(worker, worker, 'GFD_MC_CANARY_RUNNER_TOKEN'), /independent/);
  assert.throws(() => resolveCanaryRunnerProvision(undefined, worker, { remoteInstalled: true, replace: false, envName: 'GFD_MC_CANARY_RUNNER_TOKEN' }), /cannot be compared/);
  assert.throws(() => resolveCanaryRunnerProvision('cd'.repeat(64), worker, { remoteInstalled: true, replace: false, envName: 'GFD_MC_CANARY_RUNNER_TOKEN' }), /cannot be compared/, 'opaque remote value must never be assumed synchronized with a local token');
  assert.deepEqual(resolveCanaryRunnerProvision('cd'.repeat(64), worker, { remoteInstalled: true, replace: true, envName: 'GFD_MC_CANARY_RUNNER_TOKEN' }), { token: 'cd'.repeat(64), generated: false }, 'deliberate replace re-pairs remote to the validated local token');
  assert.throws(() => resolveCanaryRunnerProvision('CD'.repeat(64), worker, { remoteInstalled: false, replace: false, envName: 'GFD_MC_CANARY_RUNNER_TOKEN' }), /canonical 128-lowercase-hex/);
  const replacedRemote = resolveCanaryRunnerProvision(undefined, worker, { remoteInstalled: true, replace: true, envName: 'GFD_MC_CANARY_RUNNER_TOKEN' });
  assert.equal(replacedRemote.generated, true); assert.ok(strongTokenBytes(replacedRemote.token)); assert.notEqual(replacedRemote.token, worker);
  for (let i = 0; i < 10; i += 1) { const t = generateCanaryRunnerToken(worker); assert.ok(strongTokenBytes(t)); assert.notEqual(t, worker); }
  const provisioner2 = readFileSync(new URL('../scripts/mc-production-provision.mjs', import.meta.url), 'utf8');
  assert.ok(provisioner2.includes("'MISSION_CONTROL_CANARY_RUNNER_TOKEN'") && provisioner2.includes('--rotate-canary-runner') && provisioner2.includes('--revoke-canary-runner'));
  assert.ok(provisioner2.includes('resolveCanaryRunnerProvision'), 'provisioner must validate runner pairing before success');
  assert.ok(!provisioner2.includes('WARNING: ${RUNNER_NAME} is installed'), 'runner pairing uncertainty must fail, not warn and continue');
  assert.ok(!provisioner2.includes('if (localRunner) resolveCanaryRunnerToken'), 'plan must not accept an opaque remote secret merely because the local token is well formed');
  assert.ok(
    provisioner2.includes("created: rotating && !before.includes(RUNNER_NAME) ? [RUNNER_NAME] : []"),
    'rotating an absent runner secret must record it as created so rollback can remove it',
  );
  // state files record secret NAMES only: nothing in save() calls receives a token value
  const saveCalls = provisioner2.split('\n').filter((line) => line.includes('= save({'));
  assert.ok(saveCalls.length >= 3);
  for (const call of saveCalls) assert.ok(!/\b(runnerToken|next|bearer|localRunner)\b/.test(call), 'provisioning state must never contain a secret value');
}

console.log('mc delivery bearer tests passed');
