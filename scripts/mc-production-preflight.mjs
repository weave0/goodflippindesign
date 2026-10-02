#!/usr/bin/env node
/**
 * Production preflight gate for the real-host Mission Control investigation. READ-ONLY.
 * Exit 0 only when every check passes; the investigation must not start otherwise.
 *
 *   CLOUDFLARE_API_TOKEN=<read-only token: Account > Cloudflare Pages > Read> \
 *   GFD_OPERATOR_TOKEN=<operator Clerk session bearer> \
 *   node --no-warnings scripts/mc-production-preflight.mjs \
 *     --expected-sha <40-hex merged main sha> --expected-worker-id <id> \
 *     --fwomps-home ~/.fwomps [--json out.json] [--origin https://goodflippindesign.com]
 *
 * Both tokens are read from the environment only (never argv, never printed, never in the evidence file).
 * The executable always reads the live Cloudflare control plane. Tests inject snapshots into the pure evaluator directly.
 * See scripts/lib/mc-production-preflight.mjs for the twelve checks.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPromotionGate } from './lib/property-promotion-gate.mjs';
import { CANONICAL_MC_ORIGIN, evaluatePreflight, fetchRuntimeProbe, formatPreflight } from './lib/mc-production-preflight.mjs';
import { fetchPagesControlPlane } from './lib/pages-control-plane.mjs';
import { kcvFromBytes, readHostIdentity } from './lib/fwomps-host-identity.mjs';
import { strongTokenBytes } from '../workers/lib/key-check-value.js';

const args = process.argv.slice(2);
const first = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] ?? null : null; };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

const origin = first('--origin') || CANONICAL_MC_ORIGIN;
const expectedSha = first('--expected-sha');
const expectedWorkerId = first('--expected-worker-id');
const homeArg = first('--fwomps-home');
const fwompsHome = homeArg ? path.resolve(homeArg.replace(/^~(?=$|[\\/])/, os.homedir())) : null;
const operatorToken = process.env.GFD_OPERATOR_TOKEN;

function expectedOnMain() {
  try { git(['merge-base', '--is-ancestor', expectedSha, 'origin/main']); return true; } catch { return false; }
}

function canonicalD1Id() {
  const toml = readFileSync(path.join(root, 'wrangler.toml'), 'utf8'); // the Pages project's config, not workers/wrangler.toml
  return /\[\[d1_databases\]\][^[]*?binding\s*=\s*"DB"[^[]*?database_id\s*=\s*"([0-9a-f-]{36})"/s.exec(toml)?.[1] ?? null;
}

let localHeadSha = null;
try { localHeadSha = git(['rev-parse', 'HEAD']); } catch { /* reported by P0 */ }

if (args.includes('--control-plane-file')) {
  console.error('--control-plane-file is test-only and is not accepted by the production preflight executable');
  process.exit(2);
}
const controlPlane = await fetchPagesControlPlane({ token: process.env.CLOUDFLARE_API_TOKEN });

const gate = await runPromotionGate(
  { registry: readJson('estate/registry.json'), brands: readJson('brands.json'), healthTargets: readJson('config/health-targets.json') },
  { fwompsHome, probes: true },
);
// The delivery bearer lives in the FWOMPS operator's shell, not in a file. Compare it with the runtime's token by a one-way
// key check value; the value itself is never printed, stored or returned.
const host = readHostIdentity(fwompsHome);
const bearerBytes = host?.bearerEnv ? strongTokenBytes(process.env[host.bearerEnv]) : null;
const bearerKcv = bearerBytes ? kcvFromBytes(bearerBytes, 'bearer') : null;

const result = evaluatePreflight({
  expectedSha, localHeadSha, expectedOnMain: Boolean(expectedSha) && expectedOnMain(), expectedWorkerId, origin,
  controlPlane, probe: await fetchRuntimeProbe({ origin, token: operatorToken }), host, gate, canonicalD1Id: canonicalD1Id(), bearerKcv,
});
const evidence = { ...result, observedAt: new Date().toISOString() };

console.log(formatPreflight(result));
const jsonPath = first('--json');
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(evidence, null, 2)}\n`);
process.exitCode = result.canStartInvestigation ? 0 : 1;
