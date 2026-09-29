import { describe, expect, it } from 'vitest';

import {
  RESULT_SCHEMA,
  buildSignedInvestigationContract,
  keyBytesFromEnv,
  readInvestigationResult,
  signResultHolding,
  verifySignedEnvelope,
  INVESTIGATION_PURPOSE,
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

  it('rejects a result whose signature, identity, or schema does not verify', async () => {
    const holding = {
      schema_version: RESULT_SCHEMA,
      work_item_id: item.workItemId,
      request_id: 'mci_aaaaaaaaaaaaaaaa',
      contract_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      worker_id: 'fwomps-worker-a',
      diagnosis: { summary: 'The health contract property id drifted.', evidence: ['propertyId mismatch'] },
      authentication: { key_id: 'gfd-result-test' },
    };
    const signed = await signResultHolding(holding, key);
    const accepted = await readInvestigationResult(signed, key);
    expect(accepted.summary).toContain('property id');
    expect(await verifySignedEnvelope(signed, key, RESULT_PURPOSE, ['authentication', 'mac'])).toBe(true);

    const forged = { ...signed, authentication: { ...signed.authentication, mac: 'ab'.repeat(32) } };
    await expect(readInvestigationResult(forged, key)).rejects.toThrow(/signature/);
    await expect(readInvestigationResult({ ...signed, schema_version: 'mc-fw-result-guess' }, key)).rejects.toThrow(/schema/);
    await expect(readInvestigationResult({
      ...signed,
      diagnosis: { summary: 'no', command: 'rm -rf /' },
    }, key)).rejects.toThrow(/holding contract/);
  });
});
