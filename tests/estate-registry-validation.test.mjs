import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verificationDeclarationProblems } from '../scripts/lib/estate-operating-validation.mjs';
import { analyzeEstateOperatingReadiness } from '../scripts/estate-operating-readiness.mjs';
import { VERIFICATION_SCOPES } from '../workers/lib/mission-control-work-items.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const canonicalRegistry = JSON.parse(readFileSync(join(ROOT, 'estate', 'registry.json'), 'utf8'));
const dir = mkdtempSync(join(tmpdir(), 'estate-validate-'));

function runValidator(mutate) {
  const registry = structuredClone(canonicalRegistry);
  mutate(registry.properties.find((p) => p.domain === 'aiaimate.com').operating);
  const file = join(dir, `registry-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, JSON.stringify(registry));
  return spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts', 'validate-estate-registry.mjs'), '--registry', file], { encoding: 'utf8' });
}

// The canonical registry itself is valid.
{
  const ok = spawnSync(process.execPath, ['--no-warnings', join(ROOT, 'scripts', 'validate-estate-registry.mjs')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
}

// Every supported scope passes; an unsupported one is rejected by the real script, before any runtime qualification.
for (const scope of VERIFICATION_SCOPES) {
  const done = runValidator((operating) => { operating.verification_scope = scope; });
  assert.equal(done.status, 0, `${scope}: ${done.stderr}`);
}
for (const bad of ['planetary', 'Production', ' production', 'prod']) {
  const done = runValidator((operating) => { operating.verification_scope = bad; });
  assert.equal(done.status, 1, `scope ${JSON.stringify(bad)} must fail estate:validate`);
  assert.match(done.stderr, /verification_scope/);
  assert.match(done.stderr, /not a supported Mission Control scope/);
}
for (const bad of ['', '   ', 7, null, {}]) {
  const done = runValidator((operating) => { operating.verification_scope = bad; });
  assert.equal(done.status, 1, `scope ${JSON.stringify(bad)} must fail estate:validate`);
}
{
  const done = runValidator((operating) => { operating.verification_predicate = '  '; });
  assert.equal(done.status, 1);
  assert.match(done.stderr, /verification_predicate/);
}

// Unit: one canonical set. The validator and the readiness analyzer cannot disagree.
assert.deepEqual(verificationDeclarationProblems('x.com', { verification_scope: 'production' }), []);
assert.equal(verificationDeclarationProblems('x.com', { verification_scope: 'planetary' }).length, 1);
assert.deepEqual(verificationDeclarationProblems('x.com', {}), []);
{
  const registry = structuredClone(canonicalRegistry);
  registry.properties.find((p) => p.domain === 'aiaimate.com').operating.verification_scope = 'planetary';
  const report = analyzeEstateOperatingReadiness({ registry, brands: JSON.parse(readFileSync(join(ROOT, 'brands.json'), 'utf8')), healthTargets: JSON.parse(readFileSync(join(ROOT, 'config', 'health-targets.json'), 'utf8')) });
  const aia = report.properties.find((row) => row.domain === 'aiaimate.com');
  assert.equal(aia.dispatchReady, false);
  assert(aia.debt.some((item) => item.code === 'invalid_verification_scope'), 'readiness also rejects the value');
}

console.log('Estate registry validation hostile tests passed.');
