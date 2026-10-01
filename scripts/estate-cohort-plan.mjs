#!/usr/bin/env node
/**
 * Deterministic next-cohort declarations from governed sources + a recorded repository-facts snapshot. Read-only.
 *
 *   node --no-warnings scripts/estate-cohort-plan.mjs [--facts <facts.json>] [--readiness <report.json>] [--out plan.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCohortPlan } from './lib/estate-cohort-plan.mjs';

const args = process.argv.slice(2);
const first = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] ?? null : null; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (file) => JSON.parse(await readFile(path.resolve(file), 'utf8'));
const [registry, healthTargets] = await Promise.all(['estate/registry.json', 'config/health-targets.json'].map((rel) => readJson(path.join(root, rel))));
const plan = buildCohortPlan({
  registry,
  healthTargets,
  repoFacts: await readJson(first('--facts') || path.join(root, 'docs/evidence/estate-cohort-repo-facts-2026-10-01.json')),
  readinessReport: await readJson(first('--readiness') || path.join(root, 'docs/evidence/estate-property-readiness-2026-10-01.json')),
  generatedAt: first('--at') || new Date().toISOString(),
});
if (first('--out')) await writeFile(first('--out'), `${JSON.stringify(plan, null, 2)}\n`);
for (const entry of plan.properties) {
  console.log(`${entry.propertyId.padEnd(24)} ${entry.platform.padEnd(22)} route ${entry.machineHealthContract.route?.file || '-'}  blockers: ${entry.blockers.length}`);
}
