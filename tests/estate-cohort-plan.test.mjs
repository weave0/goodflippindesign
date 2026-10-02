import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { buildCohortPlan, detectPlatform, profileArgvDigest } from '../scripts/lib/estate-cohort-plan.mjs';

const read = (rel) => JSON.parse(readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), 'utf8'));
const inputs = () => ({
  registry: read('estate/registry.json'),
  healthTargets: read('config/health-targets.json'),
  repoFacts: read('docs/evidence/estate-cohort-repo-facts-2026-10-01.json'),
  readinessReport: read('docs/evidence/estate-property-readiness-2026-10-01.json'),
  generatedAt: '2026-10-01T00:00:00.000Z',
});

const plan = buildCohortPlan(inputs());
assert.deepEqual(plan.authority, { repair: false, deployment: false, promotion: false });
assert.deepEqual(plan.properties.map((p) => p.propertyId), ['citizenapproved.org', 'culturesherpa.org', 'globaldeets.com', 'goodflippindesign.com']);
assert.deepEqual(buildCohortPlan(inputs()), plan, 'deterministic');

for (const entry of plan.properties) {
  assert.equal(entry.repositoryAuthority.known, true, entry.propertyId);
  assert.equal(entry.machineHealthContract.payload.propertyId, entry.propertyId);
  assert.deepEqual(entry.missing, ['machine_health_contract', 'verification_declaration', 'reviewed_read_only_profile', 'host_registration']);
  assert.equal(entry.verificationDeclaration.registryPatch.operating.verification_scope, 'production');
  assert.match(entry.readOnlyProfile.name, /^web-health-readonly-[a-z0-9-]+-v1$/);
  const route = entry.machineHealthContract.route;
  if (route) {
    const digest = `sha256:${createHash('sha256').update(JSON.stringify(entry.readOnlyProfile.argv)).digest('hex')}`;
    assert.equal(entry.readOnlyProfile.argvDigest, digest);
    assert.ok(entry.hostRegistration.steps.some((step) => step.endsWith('--apply')));
    assert.ok(entry.hostRegistration.steps.some((step) => step.endsWith('--verify')));
    assert.ok(entry.hostRegistration.steps.every((step) => !step.includes('[--apply | --verify]')));
    for (const step of entry.hostRegistration.steps.filter((step) => step.includes('host-binding.py'))) {
      assert.ok(step.includes(`--expected-argv-digest ${digest}`));
    }
    // The generated route contains exactly what the host profile's fixed argv searches for.
    assert.ok(route.source.includes("contract: 'gfd-property-health'"), entry.propertyId);
    assert.ok(route.source.includes(`propertyId: '${entry.propertyId}'`), entry.propertyId);
    assert.ok(!/repair|deploy|token|secret/i.test(route.source), 'a health route carries no authority or secrets');
    assert.ok(entry.machineHealthContract.healthTargetPatch.set.sweepUrl.endsWith(route.publicPath));
  }
}

const byId = Object.fromEntries(plan.properties.map((p) => [p.propertyId, p]));
assert.equal(byId['citizenapproved.org'].platform, 'nextjs-static-export');
assert.equal(byId['globaldeets.com'].platform, 'pages-functions');
assert.equal(byId['goodflippindesign.com'].platform, 'pages-advanced-worker');
assert.ok(byId['goodflippindesign.com'].blockers.some((b) => /advanced mode/.test(b)), 'the generator does not pretend functions/ works under _worker.js');
assert.equal(byId['culturesherpa.org'].platform, 'unknown');
assert.equal(byId['culturesherpa.org'].machineHealthContract.route, null, 'no route is invented for an unknown platform');
assert.ok(byId['culturesherpa.org'].blockers.some((b) => /deploy identity is unknown/.test(b)));
assert.equal(detectPlatform(null), 'unknown');
const partial = inputs();
partial.readinessReport.nextCohort.properties[0].missing = ['host_registration'];
assert.deepEqual(buildCohortPlan(partial).properties[0].missing, ['host_registration'], 'completed prerequisites stay completed');
const route = 'portal/app/api/health/route.ts';
const property = 'aiaimate.com';
const pythonTest = spawnSync(process.env.PYTHON || 'python', [
  fileURLToPath(new URL('./fwomps-property-host-binding.test.py', import.meta.url)), route, property, profileArgvDigest(route, property),
], { encoding: 'utf8' });
assert.equal(pythonTest.status, 0, pythonTest.stdout + pythonTest.stderr);
console.log('estate cohort plan checks passed');
