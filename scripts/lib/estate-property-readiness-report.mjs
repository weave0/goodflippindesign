/**
 * Estate property readiness report (MC-CONFLUENCE-002 §7): facts only.
 *
 * For every governed property it records which loop prerequisites are KNOWN from governed sources and which are
 * not. Nothing is inferred and nothing is marked ready by assumption: a prerequisite is `true` only when a
 * governed source says so, `false` when it is absent, and `null` when it could not be checked (for example the
 * FWOMPS host registration when no host config was read). `dispatchReady` is the promotion gate's own verdict.
 *
 * Pure: inputs in, document out. It reads nothing and writes nothing.
 */

import { runPromotionGate } from './property-promotion-gate.mjs';

export const READINESS_REPORT_SCHEMA = 'gfd-estate-property-readiness-1';
export const COHORT_SIZE = 4;

// A host profile is "reviewed" only if this repository pins it. web-health-readonly-v1 is pinned by
// scripts/fwomps-aiaimate-host-binding.py and is specific to weave0/aiaimate's health route.
const REVIEWED_PROFILES = Object.freeze({ 'web-health-readonly-v1': ['weave0/aiaimate'] });

const normalize = (value) => String(value || '').trim().toLowerCase();

function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function targetsFor(propertyId, healthTargets) {
  return (healthTargets?.targets || []).filter((target) => {
    const declared = target.machineContract?.propertyId;
    // A declared machine-contract property is authoritative. Only targets without that declaration
    // fall back to URL-host attribution, matching workers/estate-bindings.js.
    const attributed = declared || hostnameOf(target.url);
    return normalize(attributed) === normalize(propertyId);
  });
}

function hostFacts(propertyId, hostConfig) {
  if (!hostConfig) return { read: false, registered: null, workspace: null, profileRegistered: null, commands: null };
  const mc = hostConfig.mission_control || {};
  const binding = mc.properties?.[propertyId] || null;
  const profile = binding ? mc.investigation_profiles?.[binding.investigation_profile] : null;
  return {
    read: true,
    registered: Boolean(binding && mc.enabled),
    workspace: binding?.workspace || null,
    profileRegistered: binding ? Boolean(profile) : false,
    commands: profile?.commands?.length ?? (binding ? 0 : null),
    boundRepository: binding?.repository || null,
  };
}

export async function buildReadinessReport({ registry, brands, healthTargets, hostConfig = null, fwompsHome = null, generatedAt }) {
  const gate = await runPromotionGate({ registry, brands, healthTargets }, { probes: true, fwompsHome });
  const gateById = new Map(gate.properties.map((row) => [row.propertyId, row]));

  const rows = (registry.properties || []).map((property) => {
    const id = property.id;
    const operating = property.operating || {};
    const brandRepo = property.brand_id ? brands.public?.[property.brand_id]?.repo || null : null;
    const registryRepo = operating.repository || null;
    const conflict = Boolean(registryRepo && brandRepo && normalize(registryRepo) !== normalize(brandRepo));
    const repository = conflict ? null : (registryRepo || brandRepo || null);
    const targets = targetsFor(id, healthTargets);
    const machine = targets.filter((target) => target.machineContract);
    const host = hostFacts(id, hostConfig);
    const gateRow = gateById.get(id);
    const declaredProfile = operating.investigation_profile || null;
    const reviewed = Boolean(declaredProfile && REVIEWED_PROFILES[declaredProfile]?.includes(repository));
    const facts = {
      canonicalRepository: { known: Boolean(repository), value: repository, source: registryRepo ? 'estate/registry.json' : (brandRepo ? 'brands.json' : null), conflict },
      canonicalProductionUrl: {
        known: Boolean(property.domain) && property.deployment_status === 'live',
        value: property.domain && property.deployment_status === 'live' ? `https://${property.domain}` : null,
        deploymentStatus: property.deployment_status || null,
      },
      healthEvidenceProducer: {
        known: targets.length > 0,
        targets: targets.map((target) => target.id),
        machineContract: machine.length > 0,
      },
      stableFindingKey: {
        known: targets.length > 0,
        pattern: targets.length ? targets.map((target) => `health:${target.id}:<finding_kind>`) : null,
      },
      verificationPredicate: {
        declared: Boolean(operating.verification_profile && operating.verification_scope && operating.verification_predicate),
        profile: operating.verification_profile || null,
        scope: operating.verification_scope || null,
      },
      fwompsRepositoryRegistration: { registered: host.registered, hostConfigRead: host.read, workspace: host.workspace },
      approvedReadOnlyProfile: { declared: declaredProfile, registeredOnHost: host.profileRegistered },
      safeHostCommands: { count: host.commands, reviewedInRepository: reviewed },
    };
    const blockers = [];
    if (!facts.canonicalRepository.known) blockers.push('no canonical repository authority');
    if (!facts.canonicalProductionUrl.known) blockers.push('production URL not established (deployment status is not live)');
    if (!facts.healthEvidenceProducer.known) blockers.push('no health evidence producer');
    else if (!facts.healthEvidenceProducer.machineContract) blockers.push('health producer exposes no machine-health contract');
    if (!facts.verificationPredicate.declared) blockers.push('verification profile/scope/predicate not declared');
    if (!declaredProfile) blockers.push('no approved read-only investigation profile declared');
    else if (!reviewed) blockers.push(`profile ${declaredProfile} is not a reviewed profile for ${repository}`);
    if (host.read && !host.registered) blockers.push('not registered on the FWOMPS host');
    if (!host.read) blockers.push('FWOMPS host registration not checked (no host config supplied)');
    return {
      propertyId: id,
      classification: property.classification || null,
      ...facts,
      dispatchReady: Boolean(gateRow?.promotable && (host.read ? gateRow?.hostVerified : false)),
      gate: { promotable: Boolean(gateRow?.promotable), hostVerified: Boolean(gateRow?.hostVerified), failedChecks: Object.entries(gateRow?.checks || {}).filter(([, check]) => check.status === 'FAIL').map(([code]) => code) },
      readinessDebt: gateRow?.readinessDebt || [],
      blockers,
    };
  });

  // Cohort: governed, live, repository known, already producing health evidence, not yet dispatch-ready.
  // Ranked by how few prerequisites are missing; ties break on property id. Only declarations, no promotion.
  const missingOf = (row) => [
    ...(row.healthEvidenceProducer.machineContract ? [] : ['machine_health_contract']),
    ...(row.verificationPredicate.declared ? [] : ['verification_declaration']),
    ...(row.approvedReadOnlyProfile.declared && row.safeHostCommands.reviewedInRepository ? [] : ['reviewed_read_only_profile']),
    ...(row.fwompsRepositoryRegistration.registered ? [] : ['host_registration']),
  ];
  const candidates = rows
    .filter((row) => row.canonicalRepository.known && row.canonicalProductionUrl.known && row.healthEvidenceProducer.known && !row.dispatchReady)
    .map((row) => ({ propertyId: row.propertyId, repository: row.canonicalRepository.value, missing: missingOf(row) }))
    .sort((left, right) => left.missing.length - right.missing.length || left.propertyId.localeCompare(right.propertyId));
  const nextCohort = candidates.slice(0, COHORT_SIZE);

  return {
    schema: READINESS_REPORT_SCHEMA,
    generatedAt,
    authority: { repair: false, deployment: false, promotion: false },
    hostConfigRead: Boolean(hostConfig),
    summary: {
      governedProperties: rows.length,
      dispatchReady: rows.filter((row) => row.dispatchReady).map((row) => row.propertyId),
      repositoryKnown: rows.filter((row) => row.canonicalRepository.known).length,
      productionUrlKnown: rows.filter((row) => row.canonicalProductionUrl.known).length,
      healthProducer: rows.filter((row) => row.healthEvidenceProducer.known).length,
      machineHealthContract: rows.filter((row) => row.healthEvidenceProducer.machineContract).length,
      verificationDeclared: rows.filter((row) => row.verificationPredicate.declared).length,
      hostRegistered: hostConfig ? rows.filter((row) => row.fwompsRepositoryRegistration.registered).length : null,
    },
    properties: rows,
    nextCohort: {
      rule: `governed + live + repository known + health evidence present + not dispatch-ready, fewest missing prerequisites first (max ${COHORT_SIZE}); declarations only`,
      properties: nextCohort,
      excludedCandidates: candidates.slice(COHORT_SIZE),
    },
  };
}
