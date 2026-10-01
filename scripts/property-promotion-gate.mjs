#!/usr/bin/env node
/**
 * Property promotion gate (report command). Read-only: never edits the registry, never touches production,
 * never writes to an FWOMPS host. See scripts/lib/property-promotion-gate.mjs for the ten checks.
 *
 *   node --no-warnings scripts/property-promotion-gate.mjs                       # all governed properties
 *   node --no-warnings scripts/property-promotion-gate.mjs --property aiaimate.com
 *   node --no-warnings scripts/property-promotion-gate.mjs --fwomps-home ~/.fwomps   # also READ the host config
 *   node --no-warnings scripts/property-promotion-gate.mjs --json out.json
 *   node --no-warnings scripts/property-promotion-gate.mjs --require aiaimate.com    # exit 1 unless promotable
 */

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { formatGateReport, gapInventory, runPromotionGate } from './lib/property-promotion-gate.mjs';

const args = process.argv.slice(2);
const values = (flag) => args.flatMap((arg, i) => (arg === flag && args[i + 1] ? [args[i + 1]] : []));
const first = (flag) => values(flag)[0] ?? null;

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const readJson = async (rel) => JSON.parse(await readFile(path.join(root, rel), 'utf8'));
  const [registry, brands, healthTargets] = await Promise.all([readJson('estate/registry.json'), readJson('brands.json'), readJson('config/health-targets.json')]);
  const only = values('--property');
  const required = first('--require');
  const fwompsHome = first('--fwomps-home');
  const gate = await runPromotionGate({ registry, brands, healthTargets }, { only: only.length ? only : null, fwompsHome, probes: true });

  console.log(formatGateReport(gate));
  if (only.length || required) {
    for (const property of gate.properties.filter((p) => (only.length ? only.includes(p.propertyId) : p.propertyId === required))) {
      console.log(`\n${property.propertyId}  promotable=${property.promotable}  hostVerified=${property.hostVerified}`);
      for (const [code, check] of Object.entries(property.checks)) console.log(`  ${check.status.padEnd(16)} ${code.padEnd(3)} ${check.name}: ${check.reason}`);
    }
  }
  const jsonPath = first('--json');
  if (jsonPath) await writeFile(jsonPath, `${JSON.stringify({ gate, inventory: gapInventory(gate) }, null, 2)}\n`);
  if (required) {
    const property = gate.properties.find((p) => p.propertyId === required);
    const ok = property && property.promotable && (!fwompsHome || property.hostVerified);
    console.log(`\n--require ${required}: ${ok ? 'PROMOTABLE' : 'NOT PROMOTABLE'}`);
    process.exitCode = ok ? 0 : 1;
  }
}

main().catch((error) => { console.error(`Property promotion gate failed: ${error.stack || error.message}`); process.exitCode = 1; });
