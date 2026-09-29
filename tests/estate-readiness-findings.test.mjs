import assert from 'node:assert/strict';

import {
  readinessFindingsFromReport,
  summarizeReadinessFindings,
} from '../scripts/estate-readiness-findings.mjs';

const report = {
  contractName: 'gfd-estate-operating-readiness',
  schemaVersion: '1.0.0',
  sourceRegistryVersion: '1.0.0',
  summary: {
    governedProperties: 2,
    debtCounts: {
      missing_investigation_profile: 1,
      missing_repository_authority: 1,
      missing_verification_predicate: 1,
      missing_verification_profile: 1,
      missing_verification_scope: 1,
    },
  },
  properties: [
    {
      propertyId: 'aiaimate.com',
      domain: 'aiaimate.com',
      governed: true,
      repository: 'weave0/aiaimate',
      repositorySource: 'estate/registry.json:operating.repository',
      deploymentProvider: 'vercel',
      deploymentProject: 'aiaimate',
      deploymentSource: 'brands.json:deployment',
      healthTargetIds: ['aiaimate'],
      machineHealthTargetIds: ['aiaimate'],
      investigationProfile: null,
      verificationProfile: null,
      verificationScope: null,
      verificationPredicate: null,
      debt: [
        {
          code: 'missing_investigation_profile',
          severity: 'blocker',
          detail: 'No host-registered investigation profile is declared for Mission Control dispatch.',
        },
        {
          code: 'missing_verification_profile',
          severity: 'blocker',
          detail: 'No production verification profile is declared for closed-loop resolution.',
        },
        {
          code: 'missing_verification_scope',
          severity: 'blocker',
          detail: 'No canonical verification scope is declared for closed-loop resolution.',
        },
        {
          code: 'missing_verification_predicate',
          severity: 'blocker',
          detail: 'No deterministic verification predicate is declared for closed-loop resolution.',
        },
      ],
    },
    {
      propertyId: 'mystery.example',
      domain: 'mystery.example',
      governed: true,
      repository: null,
      repositorySource: null,
      deploymentProvider: null,
      deploymentProject: null,
      deploymentSource: null,
      healthTargetIds: [],
      machineHealthTargetIds: [],
      investigationProfile: null,
      verificationProfile: null,
      verificationScope: null,
      verificationPredicate: null,
      debt: [
        {
          code: 'missing_repository_authority',
          severity: 'blocker',
          detail: 'No declared canonical repository is available for bounded investigation.',
        },
      ],
    },
    {
      propertyId: 'outside.example',
      domain: 'outside.example',
      governed: false,
      debt: [
        {
          code: 'missing_repository_authority',
          severity: 'blocker',
          detail: 'Should not enter governed finding scope.',
        },
      ],
    },
  ],
};

const observedAt = '2026-09-29T17:00:00.000Z';

{
  const feed = readinessFindingsFromReport(report, { observedAt });
  assert.equal(feed.contractName, 'gfd-mission-control-finding-feed');
  assert.equal(feed.schemaVersion, '1.0.0');
  assert.equal(feed.producer, 'estate-operating-readiness');
  assert.equal(feed.snapshotComplete, true);
  assert.deepEqual(feed.scope.propertyIds, ['aiaimate.com', 'mystery.example']);
  assert.equal(feed.scope.findingKeyPrefix, 'operating:');
  assert.equal(feed.findings.length, 5);

  const investigation = feed.findings.find(
    finding => finding.propertyId === 'aiaimate.com' &&
      finding.findingKey === 'operating:missing_investigation_profile',
  );
  assert(investigation);
  assert.equal(investigation.severity, 'high');
  assert.equal(investigation.confidence, 1);
  assert.equal(investigation.observedAt, observedAt);
  assert.match(investigation.evidenceDigest, /^sha256:[0-9a-f]{64}$/);
  assert.match(investigation.suggestedNextAction, /bounded read-only FWOMPS investigation profile/);

  const predicate = feed.findings.find(
    finding => finding.propertyId === 'aiaimate.com' &&
      finding.findingKey === 'operating:missing_verification_predicate',
  );
  assert.match(predicate.suggestedNextAction, /deterministic predicate/);

  assert.equal(feed.findings.some(finding => finding.propertyId === 'outside.example'), false);
}

{
  const first = readinessFindingsFromReport(report, { observedAt });
  const second = readinessFindingsFromReport(report, {
    observedAt: '2026-09-29T18:00:00.000Z',
  });

  const firstFinding = first.findings.find(
    finding => finding.propertyId === 'mystery.example',
  );
  const secondFinding = second.findings.find(
    finding => finding.propertyId === 'mystery.example',
  );

  // Observation time changes, but durable identity and evidence do not.
  assert.equal(firstFinding.findingKey, secondFinding.findingKey);
  assert.equal(firstFinding.propertyId, secondFinding.propertyId);
  assert.equal(firstFinding.evidenceDigest, secondFinding.evidenceDigest);
}

{
  const changed = structuredClone(report);
  changed.properties[1].debt[0].detail = 'Repository authority is still missing, with new evidence.';
  const a = readinessFindingsFromReport(report, { observedAt });
  const b = readinessFindingsFromReport(changed, { observedAt });

  const left = a.findings.find(finding => finding.propertyId === 'mystery.example');
  const right = b.findings.find(finding => finding.propertyId === 'mystery.example');

  assert.equal(left.findingKey, right.findingKey, 'finding identity remains stable');
  assert.notEqual(left.evidenceDigest, right.evidenceDigest, 'evidence changes are digest-visible');
}

{
  const resolved = structuredClone(report);
  resolved.properties[1].debt = [];
  delete resolved.summary.debtCounts.missing_repository_authority;
  const feed = readinessFindingsFromReport(resolved, { observedAt });

  assert.equal(
    feed.findings.some(
      finding =>
        finding.propertyId === 'mystery.example' &&
        finding.findingKey === 'operating:missing_repository_authority',
    ),
    false,
    'absence from a complete later snapshot is resolvable evidence',
  );
  assert.equal(feed.snapshotComplete, true);
}

{
  const summary = summarizeReadinessFindings(
    readinessFindingsFromReport(report, { observedAt }),
  );
  assert.match(summary, /5 active findings across 2 governed properties/);
  assert.match(summary, /operating:missing_investigation_profile: 1/);
  assert.match(summary, /operating:missing_repository_authority: 1/);
}

{
  assert.throws(
    () => readinessFindingsFromReport(
      { contractName: 'wrong', properties: [] },
      { observedAt },
    ),
    /gfd-estate-operating-readiness/,
  );
  assert.throws(
    () => readinessFindingsFromReport(report, { observedAt: '2026-09-29T17:00:00-05:00' }),
    /explicit UTC/,
  );
}


{
  const missingProperties = {
    contractName: 'gfd-estate-operating-readiness',
    schemaVersion: '1.0.0',
    summary: { governedProperties: 0, debtCounts: {} },
  };
  assert.throws(
    () => readinessFindingsFromReport(missingProperties, { observedAt }),
    /properties array/,
    'a truncated complete snapshot must fail closed instead of clearing findings',
  );

  const missingDebt = structuredClone(report);
  delete missingDebt.properties[0].debt;
  assert.throws(
    () => readinessFindingsFromReport(missingDebt, { observedAt }),
    /debt must be an array/,
    'missing per-property debt must fail closed',
  );

  const truncatedDebt = structuredClone(report);
  truncatedDebt.properties[1].debt = [];
  assert.throws(
    () => readinessFindingsFromReport(truncatedDebt, { observedAt }),
    /summary debt-count manifest/,
    'a present-but-truncated debt array must not publish destructive absence',
  );

  const duplicateProperty = structuredClone(report);
  duplicateProperty.properties[1].propertyId = duplicateProperty.properties[0].propertyId;
  assert.throws(
    () => readinessFindingsFromReport(duplicateProperty, { observedAt }),
    /duplicate governed propertyId/,
    'duplicate property identity must not be accepted as a complete snapshot',
  );
}

console.log('Estate readiness finding-feed hostile tests passed.');
