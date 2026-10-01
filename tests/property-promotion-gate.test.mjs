import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CHECKS, gapInventory, runPromotionGate } from '../scripts/lib/property-promotion-gate.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const sha = (rel) => createHash('sha256').update(readFileSync(join(ROOT, rel))).digest('hex');
const canonical = () => ({ registry: read('estate/registry.json'), brands: read('brands.json'), healthTargets: read('config/health-targets.json') });
const statuses = (property) => Object.fromEntries(Object.entries(property.checks).map(([code, check]) => [code, check.status]));

const registryHashBefore = sha('estate/registry.json');

// ---------------------------------------------------------------------------------------------
// canonical estate, with the REAL executable probes (in-memory D1)
// ---------------------------------------------------------------------------------------------
{
  const gate = await runPromotionGate(canonical());
  assert.equal(gate.properties.length, 25);
  assert.deepEqual(CHECKS.map(([code]) => code), ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10']);

  const promotable = gate.properties.filter((p) => p.promotable).map((p) => p.propertyId);
  assert.deepEqual(promotable, ['aiaimate.com'], 'exactly one property is promotable today');

  const aia = gate.properties.find((p) => p.propertyId === 'aiaimate.com');
  assert.deepEqual(statuses(aia), {
    C1: 'PASS', C2: 'PASS', C3: 'PENDING_OPERATOR', C4: 'PENDING_OPERATOR', C5: 'PASS',
    C6: 'PASS', C7: 'PASS', C8: 'PASS', C9: 'PASS', C10: 'PASS',
  });
  assert.equal(aia.hostVerified, false, 'host steps are explicitly operator-pending, not assumed');
  assert.match(aia.checks.C8.reason, /refused without an intent/);
  assert.match(aia.checks.C9.reason, /same work item DIAGNOSED/);

  // The gate is strictly stronger than the readiness analyzer and agrees where they overlap.
  for (const property of gate.properties) {
    if (property.promotable) assert.equal(property.readinessDispatchReady, true);
    if (!property.readinessDispatchReady) assert.equal(property.promotable, false);
  }

  // The other 24 fail for real, named reasons; nothing is silently skipped.
  const others = gate.properties.filter((p) => p.propertyId !== 'aiaimate.com');
  assert.equal(others.length, 24);
  for (const property of others) {
    assert.equal(property.promotable, false, property.propertyId);
    assert.equal(property.checks.C2.status, 'FAIL', `${property.propertyId} declares none of the four closed-loop fields`);
    assert.equal(property.checks.C6.status, 'FAIL');
    for (const code of ['C7', 'C8', 'C9']) assert.equal(property.checks[code].status, 'BLOCKED', `${property.propertyId} ${code}`);
    assert.match(property.checks.C7.reason, /blocked by C6/);
    assert.equal(property.checks.C4.status, 'PENDING_OPERATOR');
    assert.equal(property.checks.C5.status, 'PASS');
  }

  // Inventory is grouped by the actual missing prerequisite and accounts for every property.
  const inventory = gapInventory(gate);
  assert.equal(inventory.total, 25);
  assert.deepEqual(inventory.promotable, ['aiaimate.com']);
  for (const [code] of CHECKS) {
    const group = inventory.byCheck[code];
    assert.equal(group.PASS.length + group.FAIL.length + group.BLOCKED.length + group.PENDING_OPERATOR.length, 25, code);
  }
  assert.equal(inventory.byRootCause.missing_verification_scope.length, 24);
  assert.equal(inventory.byRootCause.missing_repository_authority.length, 17);
}

// ---------------------------------------------------------------------------------------------
// hostile fixtures, static checks only (probes off: C6..C9 are reported BLOCKED, never guessed)
// ---------------------------------------------------------------------------------------------
function variant(mutate) {
  const input = canonical();
  const property = structuredClone(input.registry.properties.find((p) => p.id === 'aiaimate.com'));
  property.id = 'example.com';
  property.domain = 'example.com';
  property.brand_id = null;
  property.classification = 'unclassified';
  property.operating.repository = 'weave0/example';
  input.healthTargets.targets.push({ id: 'example', brand: 'example', url: 'https://example.com', machineContract: { contract: 'gfd-property-health', contractVersion: 1, propertyId: 'example.com', productId: 'example' } });
  const extra = { property, targets: input.healthTargets.targets };
  mutate?.(extra);
  input.registry.properties = [extra.property];
  input.healthTargets = { ...input.healthTargets, targets: extra.targets };
  return input;
}
const runStatic = async (mutate, options = {}) => (await runPromotionGate(variant(mutate), { probes: false, ...options })).properties[0];

{
  const ok = await runStatic();
  assert.deepEqual(['C1', 'C2', 'C5', 'C10'].map((c) => ok.checks[c].status), ['PASS', 'PASS', 'PASS', 'PASS']);
  for (const code of ['C6', 'C7', 'C8', 'C9']) assert.equal(ok.checks[code].status, 'BLOCKED');
  assert.equal(ok.promotable, false, 'a registry the probes did not exercise is never promotable');

  for (const scope of ['planetary', 'Production', ' production', '', 7]) {
    const bad = await runStatic(({ property }) => { property.operating.verification_scope = scope; });
    assert.equal(bad.checks.C2.status, 'FAIL', JSON.stringify(scope));
  }
  assert.match((await runStatic(({ property }) => { delete property.operating.verification_predicate; })).checks.C2.reason, /undeclared: verification_predicate/);
  assert.match((await runStatic(({ property }) => { property.operating.verification_predicate = '   '; })).checks.C2.reason, /undeclared|non-empty/);
  assert.match((await runStatic(({ property }) => { delete property.operating.verification_profile; })).checks.C2.reason, /verification_profile/);
  assert.match((await runStatic(({ property }) => { delete property.operating.investigation_profile; })).checks.C3.reason, /no investigation profile declared/);
  assert.equal((await runStatic(({ property }) => { property.operating.investigation_profile = 'Bad Profile!'; })).checks.C3.status, 'FAIL');

  assert.equal((await runStatic(({ property }) => { delete property.operating.repository; })).checks.C1.status, 'FAIL');
  assert.equal(await runStatic(({ property }) => { property.governed = false; }), undefined, 'an ungoverned property is not part of the gate at all');

  // id and domain move TOGETHER, so only the canonical-hostname rule can refuse them
  for (const bad of ['Example.com', 'not a host', 'localhost', 'a..com', '-bad.com']) {
    const result = await runStatic(({ property }) => { property.id = bad; property.domain = bad; });
    assert.equal(result.checks.C5.status, 'FAIL', bad);
    assert.match(result.checks.C5.reason, /canonical lowercase hostname/, bad);
  }
  assert.match((await runStatic(({ property }) => { property.domain = 'other.com'; })).checks.C5.reason, /differs from domain/);

  const unmonitored = await runStatic(({ targets }) => { targets.pop(); });
  assert.equal(unmonitored.checks.C10.status, 'FAIL');
  assert.match(unmonitored.checks.C10.reason, /no governed health target/);
  const noContract = await runStatic(({ targets }) => { delete targets[targets.length - 1].machineContract; });
  assert.match(noContract.checks.C10.reason, /no versioned machine-health contract/);
}
{
  // registry/brand drift is a C1 failure
  const input = variant(({ property }) => { property.brand_id = 'aiaimate'; property.operating.repository = 'weave0/not-aiaimate'; });
  const drift = (await runPromotionGate(input, { probes: false })).properties[0];
  assert.equal(drift.checks.C1.status, 'FAIL');
  assert.match(drift.checks.C1.reason, /repository drift/);
}

// ---------------------------------------------------------------------------------------------
// host verification: a READ-ONLY look at an FWOMPS home
// ---------------------------------------------------------------------------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'gate-host-'));
  const workspace = join(dir, 'ws');
  mkdirSync(workspace);
  const writeHost = (name, config) => { const home = join(dir, name); mkdirSync(home); if (config) writeFileSync(join(home, 'config.json'), JSON.stringify(config)); return home; };
  const good = () => ({
    workspaces: { aiaimate: { name: 'aiaimate', root: workspace } },
    mission_control: {
      enabled: true,
      properties: { 'aiaimate.com': { workspace: 'aiaimate', repository: 'weave0/aiaimate', investigation_profile: 'web-health-readonly-v1' } },
      investigation_profiles: { 'web-health-readonly-v1': { name: 'web-health-readonly-v1', commands: [['x']] } },
    },
  });
  const gateFor = async (home) => (await runPromotionGate(canonical(), { only: ['aiaimate.com'], probes: false, fwompsHome: home })).properties[0];
  const before = readFileSync(join(writeHost('good', good()), 'config.json'), 'utf8');

  const ok = await gateFor(join(dir, 'good'));
  assert.equal(ok.checks.C3.status, 'PASS');
  assert.equal(ok.checks.C4.status, 'PASS');
  assert.equal(ok.hostVerified, true);
  assert.equal(readFileSync(join(dir, 'good', 'config.json'), 'utf8'), before, 'the host config is only ever read');

  const absent = await gateFor(writeHost('absent', null));
  assert.equal(absent.checks.C3.status, 'FAIL'); assert.equal(absent.checks.C4.status, 'FAIL');
  const cases = {
    'mission control disabled': (c) => { c.mission_control.enabled = false; },
    'no binding for the property': (c) => { c.mission_control.properties = {}; },
    'binding names a different profile': (c) => { c.mission_control.properties['aiaimate.com'].investigation_profile = 'other-profile'; },
    'binding names a different repository': (c) => { c.mission_control.properties['aiaimate.com'].repository = 'weave0/other'; },
    'workspace not registered': (c) => { c.workspaces = {}; },
    'workspace root missing on disk': (c) => { c.workspaces.aiaimate.root = join(dir, 'nope'); },
  };
  let n = 0;
  for (const [name, mutate] of Object.entries(cases)) {
    const config = good(); mutate(config);
    const result = await gateFor(writeHost(`bad${n += 1}`, config));
    assert.equal(result.checks.C4.status, 'FAIL', name);
    assert.equal(result.hostVerified, false, name);
  }
  const unregistered = good(); unregistered.mission_control.investigation_profiles = {};
  assert.equal((await gateFor(writeHost('noprofile', unregistered))).checks.C3.status, 'FAIL');
}

// ---------------------------------------------------------------------------------------------
// the CLI: read-only, exit code is the contract
// ---------------------------------------------------------------------------------------------
{
  const run = (...args) => spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts', 'property-promotion-gate.mjs'), ...args], { encoding: 'utf8' });
  const ok = run('--require', 'aiaimate.com');
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /--require aiaimate\.com: PROMOTABLE/);
  const no = run('--require', 'goodflippindesign.com');
  assert.equal(no.status, 1);
  assert.match(no.stdout, /NOT PROMOTABLE/);
  assert.match(no.stdout, /C2 verification_declaration_valid/);
  const outFile = join(mkdtempSync(join(tmpdir(), 'gate-cli-')), 'gate.json');
  assert.equal(run('--property', 'aiaimate.com', '--json', outFile).status, 0);
  const written = JSON.parse(readFileSync(outFile, 'utf8'));
  assert.equal(written.gate.properties.length, 1);
  assert.deepEqual(written.inventory.promotable, ['aiaimate.com']);
  assert.equal(run('--require', 'aiaimate.com', '--fwomps-home', mkdtempSync(join(tmpdir(), 'gate-empty-'))).status, 1, 'host verification requested but the host is not bound');
}

assert.equal(sha('estate/registry.json'), registryHashBefore, 'the gate never writes the registry');
console.log('Property promotion gate hostile tests passed.');
