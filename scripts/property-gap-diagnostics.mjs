#!/usr/bin/env node
/**
 * Property promotion gap diagnostics. Read-only report; never edits the registry or promotes anything.
 *
 *   node --no-warnings scripts/property-gap-diagnostics.mjs [--json out.json]
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { runPromotionGate } from './lib/property-promotion-gate.mjs';
import { diagnoseGap, formatGapReport } from './lib/property-gap-diagnostics.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
const [registry, brands, healthTargets] = await Promise.all([readJson('estate/registry.json'), readJson('brands.json'), readJson('config/health-targets.json')]);
const report = diagnoseGap(await runPromotionGate({ registry, brands, healthTargets }, { probes: true }));

console.log(formatGapReport(report));
const flag = process.argv.indexOf('--json');
if (flag >= 0 && process.argv[flag + 1]) await writeFile(process.argv[flag + 1], `${JSON.stringify(report, null, 2)}\n`);
