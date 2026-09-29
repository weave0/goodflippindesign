#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { VERIFICATION_SCOPES } from '../workers/lib/mission-control-work-items.js';

function normalizeProvider(value) {
  return typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null;
}

function hostname(value) {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function operatingBlock(property) {
  const value = property?.operating;
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function deploymentBlock(property, brand) {
  const operating = operatingBlock(property);
  const explicit = operating.deploy_identity;
  if (explicit && typeof explicit === 'object' && !Array.isArray(explicit)) {
    return {
      provider: normalizeProvider(explicit.provider),
      project: typeof explicit.project === 'string' && explicit.project.trim() ? explicit.project.trim() : null,
      source: 'estate/registry.json:operating.deploy_identity',
    };
  }
  const fallback = brand?.deployment;
  if (fallback && typeof fallback === 'object' && !Array.isArray(fallback)) {
    return {
      provider: normalizeProvider(fallback.provider),
      project: typeof fallback.project === 'string' && fallback.project.trim() ? fallback.project.trim() : null,
      source: 'brands.json:deployment',
    };
  }
  return { provider: null, project: null, source: null };
}

function repositoryBlock(property, brand) {
  const operating = operatingBlock(property);
  if (typeof operating.repository === 'string' && operating.repository.trim()) {
    return {
      repository: operating.repository.trim(),
      source: 'estate/registry.json:operating.repository',
    };
  }
  if (typeof brand?.repo === 'string' && brand.repo.trim()) {
    return {
      repository: brand.repo.trim(),
      source: 'brands.json:repo',
    };
  }
  return { repository: null, source: null };
}

function healthForProperty(property, targets) {
  const domain = String(property?.domain || '').toLowerCase();
  const brandId = property?.brand_id;
  return targets.filter(target => {
    if (brandId && target?.brand === brandId) return true;
    const candidates = [target?.url, target?.sweepUrl, target?.cloudflareSweepUrl]
      .map(hostname)
      .filter(Boolean);
    return candidates.includes(domain);
  });
}

function debt(code, severity, detail) {
  return { code, severity, detail };
}

export function analyzeEstateOperatingReadiness({ registry, brands, healthTargets }) {
  if (!registry || registry.contract_name !== 'gfd-estate-registry') {
    throw new Error('registry must be the gfd-estate-registry contract');
  }
  const properties = asArray(registry.properties);
  const publicBrands = brands?.public && typeof brands.public === 'object' ? brands.public : {};
  const targets = asArray(healthTargets?.targets ?? healthTargets);

  const rows = properties.map(property => {
    const brand = property?.brand_id ? publicBrands[property.brand_id] ?? null : null;
    const repository = repositoryBlock(property, brand);
    const deployment = deploymentBlock(property, brand);
    const healthTargetsForProperty = healthForProperty(property, targets);
    const operating = operatingBlock(property);

    const investigationProfile =
      typeof operating.investigation_profile === 'string' && operating.investigation_profile.trim()
        ? operating.investigation_profile.trim()
        : null;
    const verificationProfile =
      typeof operating.verification_profile === 'string' && operating.verification_profile.trim()
        ? operating.verification_profile.trim()
        : null;
    const verificationScope =
      typeof operating.verification_scope === 'string' && operating.verification_scope.trim()
        ? operating.verification_scope.trim()
        : null;
    const verificationPredicate =
      typeof operating.verification_predicate === 'string' && operating.verification_predicate.trim()
        ? operating.verification_predicate.trim()
        : null;
    const verificationScopeSupported = VERIFICATION_SCOPES.includes(verificationScope);
    const machineHealthTargets = healthTargetsForProperty.filter(target => target?.machineContract);

    const debts = [];
    if (property?.classification === 'unclassified') {
      debts.push(debt('unclassified_property', 'info', 'Property is governed but has no authoritative brand classification.'));
    }
    if (!repository.repository) {
      debts.push(debt('missing_repository_authority', 'blocker', 'No declared canonical repository is available for bounded investigation.'));
    }
    if (!deployment.provider || deployment.provider === 'unknown') {
      debts.push(debt('missing_deployment_provider', 'warning', 'Production deployment provider is not declared.'));
    }
    if (
      deployment.provider &&
      deployment.provider !== 'unknown' &&
      ['cloudflare-pages', 'vercel'].includes(deployment.provider) &&
      !deployment.project
    ) {
      debts.push(debt('missing_deployment_project', 'warning', 'Deployment provider is known but project identity is absent.'));
    }
    if (healthTargetsForProperty.length === 0) {
      debts.push(debt('missing_health_target', 'warning', 'No local governed health target maps to this property.'));
    }
    if (healthTargetsForProperty.length > 0 && machineHealthTargets.length === 0) {
      debts.push(debt('missing_machine_health_contract', 'maturity', 'Health exists but still depends on page/content semantics instead of a versioned machine contract.'));
    }
    if (!investigationProfile) {
      debts.push(debt('missing_investigation_profile', 'blocker', 'No host-registered investigation profile is declared for Mission Control dispatch.'));
    }
    if (!verificationProfile) {
      debts.push(debt('missing_verification_profile', 'blocker', 'No production verification profile is declared for closed-loop resolution.'));
    }
    if (!verificationScope) {
      debts.push(debt('missing_verification_scope', 'blocker', 'No canonical verification scope is declared for closed-loop resolution.'));
    } else if (!verificationScopeSupported) {
      debts.push(debt('invalid_verification_scope', 'blocker', `Verification scope is not supported by Mission Control: ${verificationScope}.`));
    }
    if (!verificationPredicate) {
      debts.push(debt('missing_verification_predicate', 'blocker', 'No deterministic verification predicate is declared for closed-loop resolution.'));
    }

    const dispatchReady = Boolean(
      repository.repository &&
      investigationProfile &&
      verificationProfile &&
      verificationScopeSupported &&
      verificationPredicate
    );
    const monitorReady = healthTargetsForProperty.length > 0;
    const machineHealthReady = machineHealthTargets.length > 0;
    const deployIdentityReady = Boolean(deployment.provider && deployment.provider !== 'unknown');

    return {
      propertyId: property?.id ?? property?.domain ?? null,
      domain: property?.domain ?? null,
      governed: property?.governed === true,
      classification: property?.classification ?? null,
      brandId: property?.brand_id ?? null,
      lifecycle: property?.lifecycle ?? null,
      repository: repository.repository,
      repositorySource: repository.source,
      deploymentProvider: deployment.provider,
      deploymentProject: deployment.project,
      deploymentSource: deployment.source,
      healthTargetIds: healthTargetsForProperty.map(target => target.id).filter(Boolean).sort(),
      machineHealthTargetIds: machineHealthTargets.map(target => target.id).filter(Boolean).sort(),
      investigationProfile,
      verificationProfile,
      verificationScope,
      verificationPredicate,
      dispatchReady,
      monitorReady,
      machineHealthReady,
      deployIdentityReady,
      debt: debts,
    };
  });

  const governedRows = rows.filter(row => row.governed);
  const debtCounts = {};
  for (const row of governedRows) {
    for (const item of row.debt) debtCounts[item.code] = (debtCounts[item.code] || 0) + 1;
  }

  return {
    contractName: 'gfd-estate-operating-readiness',
    schemaVersion: '1.0.0',
    sourceRegistryVersion: registry.schema_version ?? null,
    summary: {
      governedProperties: governedRows.length,
      repositoryAuthorityKnown: governedRows.filter(row => row.repository).length,
      deploymentProviderKnown: governedRows.filter(row => row.deployIdentityReady).length,
      healthMonitored: governedRows.filter(row => row.monitorReady).length,
      machineHealthContract: governedRows.filter(row => row.machineHealthReady).length,
      dispatchReady: governedRows.filter(row => row.dispatchReady).length,
      debtCounts,
    },
    properties: rows,
  };
}

export function formatEstateOperatingReadiness(report) {
  const s = report.summary;
  const lines = [
    `Estate operating readiness: ${s.governedProperties} governed properties`,
    `- canonical repository authority: ${s.repositoryAuthorityKnown}/${s.governedProperties}`,
    `- deployment provider known: ${s.deploymentProviderKnown}/${s.governedProperties}`,
    `- health monitored: ${s.healthMonitored}/${s.governedProperties}`,
    `- machine health contract: ${s.machineHealthContract}/${s.governedProperties}`,
    `- Mission Control dispatch ready: ${s.dispatchReady}/${s.governedProperties}`,
    '',
    'Confluence debt:',
  ];
  for (const [code, count] of Object.entries(s.debtCounts).sort()) {
    lines.push(`- ${code}: ${count}`);
  }
  return lines.join('\n');
}

async function readJson(root, relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
}

async function main() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const root = path.resolve(scriptDir, '..');
  const [registry, brands, healthTargets] = await Promise.all([
    readJson(root, 'estate/registry.json'),
    readJson(root, 'brands.json'),
    readJson(root, 'config/health-targets.json'),
  ]);
  const report = analyzeEstateOperatingReadiness({ registry, brands, healthTargets });
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    process.stdout.write(formatEstateOperatingReadiness(report) + '\n');
  }
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedAs && invokedAs === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Estate operating readiness failed: ${error.message}`);
    process.exitCode = 1;
  });
}
