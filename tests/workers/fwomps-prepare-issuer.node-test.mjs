// MC-FW-002 PREPARE issuer tests. Plain `node --test` (no Workers pool needed):
//   node --test tests/workers/fwomps-prepare-issuer.node-test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  PREPARE_PERMISSION,
  PrepareIssuerError,
  buildSignedPrepareContract,
  importPrepareSigningKey,
  prepareApprover,
  prepareDigestInput,
  signPrepareEnvelope,
  validateRequestedPaths,
} from '../../workers/fwomps-prepare-issuer.js';
import { jcsBytes } from '../../workers/fwomps-investigation-adapter.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/mc-fw002-prepare-contract.json', import.meta.url)));

function hexBytes(text) {
  return Uint8Array.from(text.match(/../g).map((byte) => Number.parseInt(byte, 16)));
}

async function verify(payload, publicKeyHex) {
  const key = await crypto.subtle.importKey('raw', hexBytes(publicKeyHex), { name: 'Ed25519' }, false, ['verify']);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', jcsBytes(prepareDigestInput(payload))));
  const enc = new TextEncoder();
  const message = new Uint8Array([...enc.encode(payload.purpose), 0, ...enc.encode(payload.audience), 0, ...digest]);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, hexBytes(payload.authentication.signature), message);
}

test('cross-language fixture: GFD produces the exact FWOMPS digest and signature', async () => {
  const key = await importPrepareSigningKey(fixture.seed_hex);
  const signed = await signPrepareEnvelope(fixture.unsigned, key);
  assert.equal(signed.authentication.contract_digest, fixture.expected_contract_digest);
  assert.equal(signed.authentication.signature, fixture.expected_signature_hex);
  assert.deepEqual(signed, fixture.signed);
  assert.ok(await verify(signed, fixture.public_key_hex));
});

test('digest excludes exactly contract_digest and signature', async () => {
  const base = jcsBytes(prepareDigestInput(fixture.signed));
  const forged = structuredClone(fixture.signed);
  forged.authentication.signature = 'f'.repeat(128);
  forged.authentication.contract_digest = `sha256:${'0'.repeat(64)}`;
  assert.deepEqual(jcsBytes(prepareDigestInput(forged)), base);
  forged.authentication.key_id = 'other';
  assert.notDeepEqual(jcsBytes(prepareDigestInput(forged)), base);
});

test('adjudication requires an admin explicitly holding mc.prepare.approve', () => {
  const ok = { id: 'user_admin', publicMetadata: { role: 'admin', permissions: [PREPARE_PERMISSION] } };
  assert.equal(prepareApprover(ok), 'user_admin');
  for (const user of [
    { id: 'u', publicMetadata: { role: 'admin' } },
    { id: 'u', publicMetadata: { role: 'mission-control-worker', permissions: [PREPARE_PERMISSION] } },
    { id: 'u', publicMetadata: { role: 'mc-canary-runner', permissions: [PREPARE_PERMISSION] } },
    { id: 'u', publicMetadata: { role: 'admin', permissions: ['mc.observe'] } },
  ]) {
    assert.throws(() => prepareApprover(user), (e) => e instanceof PrepareIssuerError && e.status === 403);
  }
});

test('requested paths use the same exact rules as FWOMPS', () => {
  assert.deepEqual(validateRequestedPaths(['a/b.js', 'c.js']), ['a/b.js', 'c.js']);
  for (const paths of [[], ['/etc/x'], ['a/../b'], ['a//b'], ['a\\b'], ['C:/x'], ['*.js'], ['.git/config'],
    ['b.js', 'a.js'], ['a.js', 'a.js'], ['A.js', 'a.js']]) {
    assert.throws(() => validateRequestedPaths(paths), PrepareIssuerError, JSON.stringify(paths));
  }
});

const now = new Date('2026-10-07T12:00:00Z');
const binding = {
  repository: 'weave0/example',
  conflict: false,
  prepareBinding: {
    workspace_id: 'ws-example', repository_id: '123456789', reproduction_profile_id: 'repro-v1', verification_profile_id: 'verify-v1',
  },
};
const item = {
  workItemId: 'mcw_abc', propertyId: 'example.com', producer: 'health-sweep', state: 'DIAGNOSED',
  repository: 'weave0/example', lastSeen: '2026-10-07T11:00:00.000Z', evidenceDigest: `sha256:${'2'.repeat(64)}`,
  severity: 'high', confidence: 'high', occurrenceCount: 3, verificationPredicate: 'http_ok', investigationProfile: 'web-health',
};

test('builds a signed PREPARE contract that verifies and carries no root/command/promotion field', async () => {
  const signingKey = await importPrepareSigningKey(fixture.seed_hex);
  const grant = await buildSignedPrepareContract(item, binding, {
    requestedPaths: ['src/a.js'], baseSha: 'b'.repeat(40), evidenceRevision: 'a'.repeat(40),
    approverId: 'user_admin', signingKey, keyId: 'gfdprep_1', now,
  });
  assert.equal(grant.promotionAuthority, false);
  assert.ok(await verify(grant.payload, fixture.public_key_hex));
  assert.equal(grant.payload.workspace.workspace_id, 'ws-example');
  const text = JSON.stringify(grant.payload);
  for (const forbidden of ['"root"', '"argv"', '"command"', '"promotion"', '"merge"', fixture.seed_hex]) {
    assert.ok(!text.includes(forbidden), forbidden);
  }
  assert.ok(Date.parse(grant.payload.lifetime.expires_at) - Date.parse(grant.payload.lifetime.issued_at) <= 900_000);
});

test('eligibility refuses canary, non-diagnosed, stale, unbound and mismatched items', async () => {
  const signingKey = await importPrepareSigningKey(fixture.seed_hex);
  const options = { requestedPaths: ['src/a.js'], baseSha: 'b'.repeat(40), evidenceRevision: 'a'.repeat(40),
    approverId: 'user_admin', signingKey, keyId: 'gfdprep_1', now };
  const cases = [
    [{ ...item, producer: 'mc-canary' }, binding, 'diagnostic_ineligible'],
    [{ ...item, state: 'QUALIFIED' }, binding, 'diagnostic_ineligible'],
    [{ ...item, lastSeen: '2026-10-05T11:00:00.000Z' }, binding, 'evidence_stale'],
    [item, { ...binding, prepareBinding: null }, 'prepare_binding_unavailable'],
    [{ ...item, repository: 'weave0/other' }, binding, 'repository_mismatch'],
  ];
  for (const [workItem, b, code] of cases) {
    await assert.rejects(buildSignedPrepareContract(workItem, b, options), (e) => e.code === code, code);
  }
  await assert.rejects(importPrepareSigningKey(''), (e) => e.code === 'prepare_signing_key_unavailable');
});

test('issuer canary producer constant matches the work-item module', () => {
  const source = readFileSync(new URL('../../workers/mission-control-work-items.js', import.meta.url), 'utf8');
  assert.match(source, /export const CANARY_PRODUCER = 'mc-canary';/u);
});
