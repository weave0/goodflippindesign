#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  analyzeEstateOperatingReadiness,
} from './estate-operating-readiness.mjs';

const PRODUCER = 'estate-operating-readiness';
const FINDING_FEED_CONTRACT = 'gfd-mission-control-finding-feed';
const FINDING_FEED_SCHEMA = '1.0.0';

const SEVERITY = Object.freeze({
  blocker: 'high',
  warning: 'medium',
  maturity: 'low',
  info: 'info',
});

const NEXT_ACTION = Object.freeze({
  unclassified_property:
    'Declare the property classification/brand relationship in the canonical estate registry or record an explicit governed rationale for remaining unclassified.',
  missing_repository_authority:
    'Verify the canonical source repository and declare estate/registry.json operating.repository, default_branch, and repository provenance.',
  missing_deployment_provider:
    'Verify the production deployment provider and declare operating.deploy_identity in the canonical estate registry.',
  missing_deployment_project:
    'Verify and declare the provider project/deployment identity used to serve this property.',
  missing_health_target:
    'Add a governed production health target for the property or record an explicit monitoring exemption with evidence.',
  missing_machine_health_contract:
    'Replace branding/content-string health semantics with a versioned machine-readable health contract and bind the target to it.',
  missing_investigation_profile:
    'Define and register a bounded read-only FWOMPS investigation profile, then bind its canonical name in the estate registry.',
  missing_verification_profile:
    'Define the production verification profile/predicate required for closed-loop resolution, then bind it in the estate registry.',
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function digest(value) {
  const encoded = JSON.stringify(canonicalize(value));
  return 'sha256:' + createHash('sha256').update(encoded, 'utf8').digest('hex');
}

function requireUtcInstant(value) {
  if (typeof value !== 'string' || !value.endsWith('Z') || !Number.isFinite(Date.parse(value))) {
    throw new Error('observedAt must be a valid explicit UTC timestamp ending in Z');
  }
  return value;
}

function normalizeSeverity(value) {
  return SEVERITY[value] ?? 'medium';
}

function findingEvidence(report, row, item) {
  return {
    readinessContract: report.contractName,
    readinessSchemaVersion: report.schemaVersion,
    sourceRegistryVersion: report.sourceRegistryVersion,
    propertyId: row.propertyId,
    domain: row.domain,
    code: item.code,
    detail: item.detail,
    repository: row.repository,
    repositorySource: row.repositorySource,
    deploymentProvider: row.deploymentProvider,
    deploymentProject: row.deploymentProject,
    deploymentSource: row.deploymentSource,
    healthTargetIds: row.healthTargetIds,
    machineHealthTargetIds: row.machineHealthTargetIds,
    investigationProfile: row.investigationProfile,
    verificationProfile: row.verificationProfile,
  };
}

export function readinessFindingsFromReport(report, { observedAt }) {
  if (!report || report.contractName !== 'gfd-estate-operating-readiness') {
    throw new Error('report must be a gfd-estate-operating-readiness document');
  }
  requireUtcInstant(observedAt);

  const governed = (report.properties || [])
    .filter(row => row?.governed === true)
    .sort((a, b) => String(a.propertyId).localeCompare(String(b.propertyId)));

  const findings = [];
  for (const row of governed) {
    for (const item of [...(row.debt || [])].sort((a, b) => String(a.code).localeCompare(String(b.code)))) {
      const evidence = findingEvidence(report, row, item);
      findings.push({
        producer: PRODUCER,
        propertyId: row.propertyId,
        findingKey: `operating:${item.code}`,
        title: `${row.domain || row.propertyId}: ${item.code.replaceAll('_', ' ')}`,
        severity: normalizeSeverity(item.severity),
        confidence: 1,
        observedAt,
        evidenceRevision: `estate-registry:${report.sourceRegistryVersion || 'unknown'}`,
        evidenceDigest: digest(evidence),
        detail: item.detail,
        suggestedNextAction:
          NEXT_ACTION[item.code] ||
          'Inspect the operating-readiness evidence and declare the missing governed state.',
      });
    }
  }

  return {
    contractName: FINDING_FEED_CONTRACT,
    schemaVersion: FINDING_FEED_SCHEMA,
    producer: PRODUCER,
    generatedAt: observedAt,
    snapshotComplete: true,
    scope: {
      propertyIds: governed.map(row => row.propertyId),
      findingKeyPrefix: 'operating:',
    },
    findings,
  };
}

export function summarizeReadinessFindings(feed) {
  const byKey = {};
  for (const finding of feed.findings || []) {
    byKey[finding.findingKey] = (byKey[finding.findingKey] || 0) + 1;
  }
  const lines = [
    `Mission Control readiness findings: ${feed.findings.length} active findings across ${feed.scope.propertyIds.length} governed properties`,
  ];
  for (const [key, count] of Object.entries(byKey).sort()) {
    lines.push(`- ${key}: ${count}`);
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
  const feed = readinessFindingsFromReport(report, {
    observedAt: new Date().toISOString(),
  });

  if (process.argv.includes('--summary')) {
    process.stdout.write(summarizeReadinessFindings(feed) + '\n');
  } else {
    process.stdout.write(JSON.stringify(feed, null, 2) + '\n');
  }
}

const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedAs && invokedAs === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Estate readiness finding generation failed: ${error.message}`);
    process.exitCode = 1;
  });
}
