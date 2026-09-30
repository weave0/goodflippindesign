import { describe, expect, it } from 'vitest';

import vector from '../fixtures/mc-fw001-result-vector.json';

import {
  RESULT_SCHEMA,
  buildSignedInvestigationContract,
  buildSignedLeaseGrant,
  keyBytesFromEnv,
  readInvestigationResult,
  resolveResultKey,
  verifySignedEnvelope,
  INVESTIGATION_PURPOSE,
  LEASE_PURPOSE,
  RESULT_PURPOSE,
} from '../../workers/fwomps-investigation-adapter.js';

const key = keyBytesFromEnv('mission-control-test-key');
const item = {
  workItemId: 'health:aiaimate:machine_contract_mismatch',
  propertyId: 'aiaimate.com',
  repository: 'weave0/aiaimate',
  investigationProfile: 'gfd-property-health',
  severity: 'high',
  confidence: 'machine-contract',
  occurrenceCount: 4,
  lastSeen: '2026-09-29T07:24:48Z',
  verificationPredicate: 'Run the same configured health probe again and require this finding key to be absent.',
  evidenceDigest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  lifecycle: 'QUALIFIED',
};

describe('FWOMPS investigation adapter', () => {
  it('signs an investigation request without repair authority', async () => {
    const contract = await buildSignedInvestigationContract(item, {
      evidenceRevision: '257210036bff85961a1b9c96c0572aabcaaa9cd4',
      subjectId: 'user_admin',
      key,
      keyId: 'gfd-mission-control-test',
      now: new Date('2026-09-29T12:00:00Z'),
    });

    expect(contract.wireStatus).toBe('signed');
    expect(contract.repairAuthority).toBe(false);
    expect(contract.payload.operation).toBe('investigate');
    expect(contract.payload.contract.requested_mode).toBe('read_only');
    expect(contract.payload.property.expected_repository).toBe('weave0/aiaimate');
    expect(await verifySignedEnvelope(
      contract.payload,
      key,
      INVESTIGATION_PURPOSE,
      ['authentication', 'mac'],
    )).toBe(true);
  });

  it('signs a lease grant the worker cannot invent', async () => {
    const contract = await buildSignedInvestigationContract(item, {
      evidenceRevision: '257210036bff85961a1b9c96c0572aabcaaa9cd4',
      subjectId: 'user_admin',
      key,
      keyId: 'gfd-mission-control-test',
      now: new Date('2026-09-29T12:00:00Z'),
    });
    const grant = await buildSignedLeaseGrant({
      requestId: contract.requestId,
      contractDigest: contract.digest,
      workerId: 'fwomps-worker-a',
      attempt: 1,
      maxAttempts: 1,
      expiresAt: contract.payload.contract.expires_at,
      key,
      keyId: 'gfd-mission-control-test',
      now: new Date('2026-09-29T12:00:00Z'),
    });
    expect(grant.payload.schema_version).toBe('mc-fw-lease-grant-1');
    expect(grant.payload.worker_id).toBe('fwomps-worker-a');
    expect(grant.payload.attempt).toBe(1);
    expect(await verifySignedEnvelope(grant.payload, key, LEASE_PURPOSE, ['mac'])).toBe(true);
    expect(await verifySignedEnvelope(grant.payload, key, RESULT_PURPOSE, ['mac'])).toBe(false);
    const raw = Uint8Array.from(grant.leaseTokenHex.match(/../g), (byte) => Number.parseInt(byte, 16));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
    const hex = [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    expect(grant.leaseTokenDigest).toBe(`sha256:${hex}`);
  });

  it('verifies the published result vector and refuses a different purpose or repair scope', async () => {
    expect(vector.purpose).toBe(RESULT_PURPOSE);
    expect(RESULT_SCHEMA).toBe('mc-fw-investigation-result-1');
    const binding = {
      key: keyBytesFromEnv(vector.key_hex),
      keyId: vector.envelope.authentication.key_id,
      workerId: vector.envelope.worker.id,
    };
    const accepted = await readInvestigationResult(vector.envelope, binding);
    expect(accepted.resultDigest).toBe(vector.expected.result_digest);
    expect(accepted.outcome).toBe('reproduced');
    expect(accepted.repairAuthority).toBe(false);
    expect(accepted.advisoryRepairScope).toBeUndefined();
    expect(accepted.summary).toContain('reproduced');
    expect(await verifySignedEnvelope(vector.envelope, binding.key, RESULT_PURPOSE, vector.mac_path)).toBe(true);
    expect(await verifySignedEnvelope(
      vector.envelope,
      binding.key,
      INVESTIGATION_PURPOSE,
      vector.mac_path,
    )).toBe(false);

    for (const tamper of vector.negative) {
      const forged = structuredClone(vector.envelope);
      let cursor = forged;
      for (const part of tamper.path.slice(0, -1)) cursor = cursor[part];
      cursor[tamper.path.at(-1)] = tamper.value;
      await expect(readInvestigationResult(forged, binding)).rejects.toThrow();
      expect(await verifySignedEnvelope(forged, binding.key, RESULT_PURPOSE, vector.mac_path)).toBe(false);
    }

    const scoped = structuredClone(vector.envelope);
    scoped.repairability = { state: 'indicated', advisory_repair_scope: ['src/app'] };
    await expect(readInvestigationResult(scoped, binding)).rejects.toThrow(/repair/);
  });

  it('resolves a result key only by key id', () => {
    const env = {
      MISSION_CONTROL_RESULT_KEY_ID: 'gfd-result-test',
      MISSION_CONTROL_RESULT_KEY: 'mission-control-result-key',
      MISSION_CONTROL_RESULT_WORKER_ID: 'fwomps-worker-a',
    };
    expect(resolveResultKey(env, 'gfd-result-test').workerId).toBe('fwomps-worker-a');
    expect(() => resolveResultKey(env, 'fwomps-worker-a')).toThrow(/known worker key/);
    expect(() => resolveResultKey({
      ...env,
      MISSION_CONTROL_RESULT_WORKER_ID: '',
    }, 'gfd-result-test')).toThrow(/not configured/);
  });
});
