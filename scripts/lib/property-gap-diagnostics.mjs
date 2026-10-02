/**
 * Diagnostics for the property-promotion gap: why is each governed property other than aiaimate.com not
 * dispatch-ready, who owns each missing piece, and in what order must the pieces land?
 *
 * Built strictly on the promotion gate's own output (readiness debt vocabulary + C1..C10 results). It is a REPORT:
 * it never edits the registry, never promotes a property, and recommends no promotion. Promotion stays a
 * separate, reviewed, evidence-backed decision per property (aiaimate.com is the only promoted property).
 */

/** Resolution order: each category is a prerequisite for the ones after it. */
export const CATEGORIES = Object.freeze([
  {
    id: 'classification', owner: 'registry owner (decision)', crossRepo: false,
    codes: ['unclassified_property'],
    action: 'Decide what the property is (primary brand domain, redirect, parked, retired) and record it in estate/registry.json. A parked or redirect-only property may correctly never become dispatch-ready.',
  },
  {
    id: 'repository', owner: 'registry owner', crossRepo: false,
    codes: ['missing_repository_authority'],
    action: 'Record the one canonical repository (operating.repository, agreeing with brands.json) the investigation will read.',
  },
  {
    id: 'deployment', owner: 'registry owner', crossRepo: false,
    codes: ['missing_deployment_provider'],
    action: 'Record where the property is deployed (deployment provider) so an observation has a provable target.',
  },
  {
    id: 'observation', owner: 'GFD (config/health-targets.json)', crossRepo: false,
    codes: ['missing_health_target'],
    action: 'Add a governed health target so the sweep actually observes the property.',
  },
  {
    id: 'machine_health_contract', owner: "the property's own repository", crossRepo: true,
    codes: ['missing_machine_health_contract'],
    action: "The property's health route must serve the versioned gfd-property-health machine contract (re-observation cannot be deterministic without it). This is a change in the target repository, not in GFD.",
  },
  {
    id: 'declarations', owner: 'GFD (estate/registry.json)', crossRepo: false,
    codes: ['missing_investigation_profile', 'missing_verification_profile', 'missing_verification_scope', 'missing_verification_predicate'],
    action: 'Declare investigation_profile, verification_profile, verification_scope (canonical set) and verification_predicate under operating in estate/registry.json.',
  },
  {
    id: 'host_binding', owner: 'FWOMPS host operator', crossRepo: true,
    codes: [],
    action: 'Register the property -> workspace -> repository -> read-only profile binding on the real FWOMPS host and verify it (C3/C4). Applies to every property, including aiaimate.com until its binding is applied.',
  },
]);

const CODE_TO_CATEGORY = new Map(CATEGORIES.flatMap((c) => c.codes.map((code) => [code, c.id])));

export function diagnoseGap(gate, { promoted = ['aiaimate.com'] } = {}) {
  const rows = [];
  const unmappedCodes = new Set();
  for (const property of gate.properties) {
    if (promoted.includes(property.propertyId)) continue;
    const categories = new Set();
    for (const code of property.readinessDebt || []) {
      const cat = CODE_TO_CATEGORY.get(code);
      if (cat) categories.add(cat); else unmappedCodes.add(code);
    }
    // A failing C1/C2/C10 with no mapped debt still has a verbatim reason; never lose it.
    const unexplained = Object.entries(property.checks)
      .filter(([code, c]) => ['C1', 'C2', 'C10'].includes(code) && c.status === 'FAIL' && !categories.size)
      .map(([code, c]) => `${code}: ${c.reason}`);
    categories.add('host_binding'); // every property needs a host binding and no property has one verified here
    const ordered = CATEGORIES.filter((c) => categories.has(c.id));
    const failingChecks = Object.entries(property.checks).filter(([, c]) => c.status === 'FAIL').map(([code]) => code);
    rows.push({
      propertyId: property.propertyId,
      classification: property.classification ?? null,
      promotable: property.promotable === true,
      blockers: ordered.map((c) => c.id),
      steps: ordered.length,
      needsOwnerDecision: categories.has('classification'),
      needsTargetRepositoryChange: categories.has('machine_health_contract'),
      failingChecks,
      unexplained,
    });
  }
  rows.sort((a, b) => a.steps - b.steps || a.propertyId.localeCompare(b.propertyId));

  const cohorts = new Map();
  for (const row of rows) {
    const key = row.blockers.join('+');
    if (!cohorts.has(key)) cohorts.set(key, { blockers: row.blockers, steps: row.steps, properties: [] });
    cohorts.get(key).properties.push(row.propertyId);
  }
  const byCategory = Object.fromEntries(CATEGORIES.map((c) => [c.id, rows.filter((r) => r.blockers.includes(c.id)).map((r) => r.propertyId)]));

  return {
    contractName: 'gfd-property-gap-diagnostics',
    schemaVersion: '1.0.0',
    promoted,
    promotionPerformed: false,
    recommendation: 'none - this report never promotes a property; each promotion needs its own reviewed change and evidence',
    blockedCount: rows.length,
    resolutionOrder: CATEGORIES.map((c) => ({ id: c.id, owner: c.owner, crossRepo: c.crossRepo, action: c.action, blocks: byCategory[c.id].length })),
    cohorts: [...cohorts.values()].sort((a, b) => a.steps - b.steps || b.properties.length - a.properties.length),
    properties: rows,
    unmappedDebtCodes: [...unmappedCodes].sort(),
  };
}

export function formatGapReport(report) {
  const lines = [
    `Property promotion gap: ${report.blockedCount} blocked properties (promoted: ${report.promoted.join(', ')}); promotion performed: ${report.promotionPerformed}`,
    `Recommendation: ${report.recommendation}`,
    '',
    'Resolution order (each is a prerequisite for the next):',
  ];
  report.resolutionOrder.forEach((c, i) => lines.push(`  ${i + 1}. ${c.id} [${c.owner}${c.crossRepo ? ', cross-repo' : ''}] blocks ${c.blocks}/${report.blockedCount}: ${c.action}`));
  lines.push('', 'Cohorts (identical blocker sets, fewest steps first):');
  for (const cohort of report.cohorts) lines.push(`  ${cohort.steps} steps  ${cohort.blockers.join(' + ')}  ->  ${cohort.properties.length}: ${cohort.properties.join(', ')}`);
  if (report.unmappedDebtCodes.length) lines.push('', `UNMAPPED debt codes (extend CATEGORIES): ${report.unmappedDebtCodes.join(', ')}`);
  return lines.join('\n');
}
