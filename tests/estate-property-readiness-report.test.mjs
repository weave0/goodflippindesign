import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { buildReadinessReport, COHORT_SIZE, READINESS_REPORT_SCHEMA } from '../scripts/lib/estate-property-readiness-report.mjs';

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8'));
const inputs = () => ({ registry: read('estate/registry.json'), brands: read('brands.json'), healthTargets: read('config/health-targets.json') });
const AT = '2026-10-01T00:00:00.000Z';

// Without a host config nothing about the FWOMPS host is assumed: no property is dispatch-ready, and the
// host facts are explicitly unknown (null), never false-by-default or true-by-default.
const unchecked = await buildReadinessReport({ ...inputs(), generatedAt: AT });
assert.equal(unchecked.schema, READINESS_REPORT_SCHEMA);
assert.deepEqual(unchecked.authority, { repair: false, deployment: false, promotion: false });
assert.equal(unchecked.properties.length, 25);
assert.equal(unchecked.hostConfigRead, false);
assert.deepEqual(unchecked.summary.dispatchReady, []);
assert.equal(unchecked.summary.hostRegistered, null);
for (const row of unchecked.properties) {
  assert.equal(row.fwompsRepositoryRegistration.registered, null, row.propertyId);
  assert.equal(row.dispatchReady, false, row.propertyId);
  assert.ok(row.blockers.some((blocker) => /not checked/.test(blocker)), `${row.propertyId} says the host was not checked`);
}

// Deterministic: same inputs, same document.
assert.deepEqual(await buildReadinessReport({ ...inputs(), generatedAt: AT }), unchecked);

// Facts agree with the governed sources, not with assumptions.
const registry = inputs().registry;
const aia = unchecked.properties.find((row) => row.propertyId === 'aiaimate.com');
assert.equal(aia.canonicalRepository.value, 'weave0/aiaimate');
assert.equal(aia.healthEvidenceProducer.machineContract, true);
assert.equal(aia.verificationPredicate.declared, true);
assert.equal(aia.safeHostCommands.reviewedInRepository, true);
for (const row of unchecked.properties.filter((entry) => entry.propertyId !== 'aiaimate.com')) {
  assert.equal(row.safeHostCommands.reviewedInRepository, false, `${row.propertyId} has no reviewed profile`);
  assert.equal(row.verificationPredicate.declared, false, `${row.propertyId} declares no verification predicate yet`);
}
assert.deepEqual(unchecked.properties.map((row) => row.propertyId), registry.properties.map((property) => property.id));

// A host config that registers a property does not make it dispatch-ready on its own: the gate decides.
const hostConfig = { mission_control: { enabled: true, properties: { 'globaldeets.com': { workspace: 'globaldeets', repository: 'weave0/globaldeets', investigation_profile: 'x' } }, investigation_profiles: {} } };
const claimed = await buildReadinessReport({ ...inputs(), hostConfig, generatedAt: AT });
const gd = claimed.properties.find((row) => row.propertyId === 'globaldeets.com');
assert.equal(gd.fwompsRepositoryRegistration.registered, true);
assert.equal(gd.approvedReadOnlyProfile.registeredOnHost, false, 'a binding without its profile is not an approved profile');
assert.equal(gd.dispatchReady, false);

// Cohort: small, only properties whose repository, live URL and health evidence are already known.
const cohort = unchecked.nextCohort.properties;
assert.ok(cohort.length > 0 && cohort.length <= COHORT_SIZE);
for (const entry of cohort) {
  const row = unchecked.properties.find((candidate) => candidate.propertyId === entry.propertyId);
  assert.ok(row.canonicalRepository.known && row.canonicalProductionUrl.known && row.healthEvidenceProducer.known, entry.propertyId);
  assert.equal(row.dispatchReady, false);
}

// A declared machineContract.propertyId is authoritative even when the URL hostname points elsewhere.
// The URL fallback applies only when no machine property declaration exists.
const attributionInputs = {
  registry: {
    properties: [
      { id: 'aiaimate.com', domain: 'aiaimate.com', deployment_status: 'live', operating: {} },
      { id: 'globaldeets.com', domain: 'globaldeets.com', deployment_status: 'live', operating: {} },
    ],
  },
  brands: { public: {} },
  healthTargets: {
    targets: [{
      id: 'declared-aiaimate',
      url: 'https://globaldeets.com/health',
      checkType: 'page',
      machineContract: { propertyId: 'aiaimate.com' },
    }],
  },
};
const attributed = await buildReadinessReport({ ...attributionInputs, generatedAt: AT });
assert.deepEqual(attributed.properties.find((row) => row.propertyId === 'aiaimate.com').healthEvidenceProducer.targets, ['declared-aiaimate']);
assert.deepEqual(attributed.properties.find((row) => row.propertyId === 'globaldeets.com').healthEvidenceProducer.targets, []);

console.log('estate property readiness report checks passed');
