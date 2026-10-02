#!/usr/bin/env node
/**
 * Machine-readable estate readiness report: 25 governed properties against the proven loop prerequisites.
 * Read-only. Facts only: see scripts/lib/estate-property-readiness-report.mjs.
 *
 *   node --no-warnings scripts/estate-property-readiness-report.mjs [--fwomps-home ~/.fwomps] [--out report.json]
 */

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildReadinessReport } from './lib/estate-property-readiness-report.mjs';

const args = process.argv.slice(2);
const first = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] ?? null : null; };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const [registry, brands, healthTargets] = await Promise.all(
  ['estate/registry.json', 'brands.json', 'config/health-targets.json'].map((rel) => readJson(path.join(root, rel))),
);
const home = first('--fwomps-home');
const hostConfig = home ? await readJson(path.join(path.resolve(home), 'config.json')) : null;
const report = await buildReadinessReport({ registry, brands, healthTargets, hostConfig, fwompsHome: home ? path.resolve(home) : null, generatedAt: first('--at') || new Date().toISOString() });

const out = first('--out');
if (out) await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
const s = report.summary;
console.log(`governed ${s.governedProperties} · dispatch-ready ${s.dispatchReady.length} (${s.dispatchReady.join(', ') || 'none'}) · repo ${s.repositoryKnown} · live URL ${s.productionUrlKnown} · health producer ${s.healthProducer} · machine contract ${s.machineHealthContract} · verification declared ${s.verificationDeclared} · host registered ${s.hostRegistered ?? 'unchecked'}`);
console.log('next cohort:');
for (const entry of report.nextCohort.properties) console.log(`  ${entry.propertyId} (${entry.repository}) missing: ${entry.missing.join(', ')}`);
