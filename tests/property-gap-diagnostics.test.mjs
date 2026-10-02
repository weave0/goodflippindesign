import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { runPromotionGate } from '../scripts/lib/property-promotion-gate.mjs';
import { CATEGORIES, diagnoseGap, formatGapReport } from '../scripts/lib/property-gap-diagnostics.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => JSON.parse(readFileSync(`${ROOT}${rel}`, 'utf8'));
const sha = (rel) => createHash('sha256').update(readFileSync(`${ROOT}${rel}`)).digest('hex');
const before = sha('estate/registry.json');

const gate = await runPromotionGate({ registry: read('estate/registry.json'), brands: read('brands.json'), healthTargets: read('config/health-targets.json') });
const report = diagnoseGap(gate);

// the report is about the gap, and promotes nothing
assert.equal(report.promotionPerformed, false);
assert.match(report.recommendation, /never promotes/);
assert.deepEqual(report.promoted, ['aiaimate.com']);
assert.equal(report.blockedCount, gate.properties.length - 1);
assert.equal(report.blockedCount, 24);
assert.ok(!report.properties.some((p) => p.propertyId === 'aiaimate.com'));
assert.ok(report.properties.every((p) => p.promotable === false), 'no second property is promotable');

// every governed non-promoted property is accounted for exactly once, in exactly one cohort
const ids = report.properties.map((p) => p.propertyId);
assert.equal(new Set(ids).size, ids.length);
assert.deepEqual([...ids].sort(), gate.properties.filter((p) => p.propertyId !== 'aiaimate.com').map((p) => p.propertyId).sort());
assert.deepEqual(report.cohorts.flatMap((c) => c.properties).sort(), [...ids].sort());

// the diagnosis is complete: no readiness debt code is unmapped, every blocked property has a blocker, and
// every one still needs a host binding
assert.deepEqual(report.unmappedDebtCodes, []);
for (const row of report.properties) {
  assert.ok(row.blockers.length >= 1);
  assert.ok(row.blockers.includes('host_binding'), `${row.propertyId} needs a host binding`);
  assert.equal(row.steps, row.blockers.length);
  // blockers always appear in dependency order
  const order = CATEGORIES.map((c) => c.id);
  assert.deepEqual([...row.blockers].sort((a, b) => order.indexOf(a) - order.indexOf(b)), row.blockers);
}

// the nearest-to-ready properties still have real work (nothing is "one click from promotion")
assert.ok(report.properties[0].steps >= 2, 'even the closest property needs declarations and a host binding');
assert.ok(report.properties.every((p) => !p.unexplained.length), 'no failing check is left unexplained');

// properties that need the target repository to change are called out as cross-repo work
const crossRepo = report.properties.filter((p) => p.needsTargetRepositoryChange).map((p) => p.propertyId);
assert.ok(crossRepo.includes('goodflippindesign.com') && crossRepo.includes('globaldeets.com'));
assert.ok(report.properties.filter((p) => p.needsOwnerDecision).length >= 1, 'unclassified properties need an owner decision, not just config');

// resolution order is dependency order and counts add up
assert.deepEqual(report.resolutionOrder.map((c) => c.id), CATEGORIES.map((c) => c.id));
assert.equal(report.resolutionOrder.find((c) => c.id === 'host_binding').blocks, 24);
assert.equal(report.resolutionOrder.find((c) => c.id === 'declarations').blocks, 24);

// an unknown debt code is surfaced, not swallowed
{
  const fake = { properties: [{ propertyId: 'x.example', classification: null, promotable: false, readinessDebt: ['brand_new_debt'], checks: { C1: { status: 'FAIL', reason: 'mystery' } } }] };
  const r = diagnoseGap(fake);
  assert.deepEqual(r.unmappedDebtCodes, ['brand_new_debt']);
  assert.deepEqual(r.properties[0].unexplained, ['C1: mystery']);
  assert.match(formatGapReport(r), /UNMAPPED debt codes/);
}

// reading never touches the registry
assert.equal(sha('estate/registry.json'), before);
assert.match(formatGapReport(report), /Resolution order/);

console.log('property gap diagnostics tests: all passed');
