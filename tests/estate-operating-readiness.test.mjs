import assert from 'node:assert/strict';
import {
  analyzeEstateOperatingReadiness,
  formatEstateOperatingReadiness,
} from '../scripts/estate-operating-readiness.mjs';

function fixture(overrides = {}) {
  const registry = {
    contract_name: 'gfd-estate-registry',
    schema_version: '1.0.0',
    properties: [
      {
        id: 'aiaimate.com',
        domain: 'aiaimate.com',
        governed: true,
        classification: 'brand_primary_domain',
        brand_id: 'aiaimate',
        lifecycle: 'active',
      },
      {
        id: 'mystery.example',
        domain: 'mystery.example',
        governed: true,
        classification: 'unclassified',
        brand_id: null,
        lifecycle: 'unknown',
      },
    ],
  };

  const brands = {
    public: {
      aiaimate: {
        domain: 'aiaimate.com',
        repo: 'weave0/aiaimate',
        deployment: { provider: 'vercel', project: 'aiaimate', status: 'live' },
      },
    },
  };

  const healthTargets = {
    targets: [
      {
        id: 'aiaimate',
        brand: 'aiaimate',
        url: 'https://aiaimate.com',
        sweepUrl: 'https://aiaimate.com/api/health',
        machineContract: {
          contract: 'gfd-property-health',
          contractVersion: 1,
          propertyId: 'aiaimate.com',
        },
      },
    ],
  };

  return {
    registry: overrides.registry ?? registry,
    brands: overrides.brands ?? brands,
    healthTargets: overrides.healthTargets ?? healthTargets,
  };
}

{
  const report = analyzeEstateOperatingReadiness(fixture());
  assert.equal(report.contractName, 'gfd-estate-operating-readiness');
  assert.equal(report.summary.governedProperties, 2);
  assert.equal(report.summary.repositoryAuthorityKnown, 1);
  assert.equal(report.summary.healthMonitored, 1);
  assert.equal(report.summary.machineHealthContract, 1);
  assert.equal(report.summary.dispatchReady, 0);

  const aia = report.properties.find(row => row.domain === 'aiaimate.com');
  assert.equal(aia.repository, 'weave0/aiaimate');
  assert.equal(aia.repositorySource, 'brands.json:repo');
  assert.equal(aia.deploymentProvider, 'vercel');
  assert.equal(aia.deploymentProject, 'aiaimate');
  assert.deepEqual(aia.healthTargetIds, ['aiaimate']);
  assert.deepEqual(aia.machineHealthTargetIds, ['aiaimate']);
  assert(aia.debt.some(item => item.code === 'missing_investigation_profile'));
  assert(aia.debt.some(item => item.code === 'missing_verification_profile'));
  assert(aia.debt.some(item => item.code === 'missing_verification_scope'));
  assert(aia.debt.some(item => item.code === 'missing_verification_predicate'));
  assert(!aia.debt.some(item => item.code === 'missing_repository_authority'));

  const mystery = report.properties.find(row => row.domain === 'mystery.example');
  assert(mystery.debt.some(item => item.code === 'unclassified_property'));
  assert(mystery.debt.some(item => item.code === 'missing_repository_authority'));
  assert(mystery.debt.some(item => item.code === 'missing_health_target'));
}

{
  const f = fixture();
  f.registry.properties[0].operating = {
    repository: 'weave0/aiaimate-authoritative',
    investigation_profile: 'aiaimate-readonly-v1',
    verification_profile: 'aiaimate-production-v1',
    verification_scope: 'production',
    verification_predicate: 'aiaimate machine health contract passes on a fresh production probe',
    deploy_identity: { provider: 'cloudflare-pages', project: 'aiaimate-edge' },
  };
  const report = analyzeEstateOperatingReadiness(f);
  const aia = report.properties.find(row => row.domain === 'aiaimate.com');

  assert.equal(aia.repository, 'weave0/aiaimate-authoritative');
  assert.equal(aia.repositorySource, 'estate/registry.json:operating.repository');
  assert.equal(aia.deploymentProvider, 'cloudflare-pages');
  assert.equal(aia.deploymentProject, 'aiaimate-edge');
  assert.equal(aia.dispatchReady, true);
  assert.equal(aia.verificationScope, 'production');
  assert.match(aia.verificationPredicate, /fresh production probe/);
  assert.equal(report.summary.dispatchReady, 1);
}

{
  const f = fixture();
  f.registry.properties[0].operating = {
    repository: 'weave0/aiaimate-authoritative',
    investigation_profile: 'aiaimate-readonly-v1',
    verification_profile: 'aiaimate-production-v1',
    verification_scope: 'planetary',
    verification_predicate: 'aiaimate machine health contract passes on a fresh production probe',
  };
  const report = analyzeEstateOperatingReadiness(f);
  const aia = report.properties.find(row => row.domain === 'aiaimate.com');

  assert.equal(aia.dispatchReady, false);
  assert(aia.debt.some(item => item.code === 'invalid_verification_scope'));
  assert(!aia.debt.some(item => item.code === 'missing_verification_scope'));
}

{
  const f = fixture();
  f.brands.public.aiaimate.repo = null;
  f.brands.public.aiaimate.deployment = { provider: 'unknown', project: null, status: 'live' };
  const report = analyzeEstateOperatingReadiness(f);
  const aia = report.properties.find(row => row.domain === 'aiaimate.com');

  assert.equal(aia.repository, null);
  assert.equal(aia.deployIdentityReady, false);
  assert(aia.debt.some(item => item.code === 'missing_repository_authority'));
  assert(aia.debt.some(item => item.code === 'missing_deployment_provider'));
}

{
  const f = fixture();
  delete f.healthTargets.targets[0].machineContract;
  const report = analyzeEstateOperatingReadiness(f);
  const aia = report.properties.find(row => row.domain === 'aiaimate.com');

  assert.equal(aia.monitorReady, true);
  assert.equal(aia.machineHealthReady, false);
  assert(aia.debt.some(item => item.code === 'missing_machine_health_contract'));
}

{
  const f = fixture();
  f.healthTargets.targets = [
    {
      id: 'domain-only',
      url: 'https://aiaimate.com/status',
    },
  ];
  const report = analyzeEstateOperatingReadiness(f);
  const aia = report.properties.find(row => row.domain === 'aiaimate.com');
  assert.deepEqual(aia.healthTargetIds, ['domain-only']);
}

{
  assert.throws(
    () => analyzeEstateOperatingReadiness({
      registry: { contract_name: 'not-the-registry', properties: [] },
      brands: {},
      healthTargets: {},
    }),
    /gfd-estate-registry/,
  );
}

{
  const text = formatEstateOperatingReadiness(analyzeEstateOperatingReadiness(fixture()));
  assert.match(text, /Estate operating readiness: 2 governed properties/);
  assert.match(text, /canonical repository authority: 1\/2/);
  assert.match(text, /Mission Control dispatch ready: 0\/2/);
  assert.match(text, /missing_repository_authority: 1/);
}

console.log('Estate operating readiness hostile tests passed.');
