#!/usr/bin/env node
/**
 * Production preflight gate for the real-host Mission Control investigation. READ-ONLY.
 * Exit 0 only when every check passes; the investigation must not start otherwise.
 *
 *   node --no-warnings scripts/mc-production-preflight.mjs \
 *     --expected-sha <40-hex merged main sha> --expected-worker-id <id> \
 *     --fwomps-home ~/.fwomps [--json out.json] [--origin https://goodflippindesign.com] \
 *     [--control-plane env|wrangler] [--probe-identity auto|runner|operator]
 *
 * Cloudflare read credential (--control-plane, default env): `env` reads CLOUDFLARE_API_TOKEN (read-only Pages token);
 * `wrangler` uses the operator's existing Wrangler login via `wrangler auth token` (see scripts/lib/cloudflare-token.mjs).
 * Both feed the same exact control-plane checks and the token is used for GET only. Never a silent fallback.
 *
 * Provenance credential (--probe-identity, default auto): P3-P11 consume ONE observation-level read, GET
 * /api/mission-control/provenance, which is on the canary-runner's accepted surface. `auto` uses
 * GFD_MC_CANARY_RUNNER_TOKEN when set (the dedicated machine identity: no operator/admin authority), otherwise
 * GFD_OPERATOR_TOKEN. The identity used is recorded in the evidence. With the canary OFF the runner is inert (by design),
 * so run this after the canary is enabled (runbook step 6).
 *
 * Tokens are read from the environment only (never argv, never printed, never in the evidence file).
 * Tests inject snapshots into the pure evaluator directly.
 * See scripts/lib/mc-production-preflight.mjs for the twelve checks.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runPromotionGate } from './lib/property-promotion-gate.mjs';
import { CANONICAL_MC_ORIGIN, evaluatePreflight, fetchRuntimeProbe, formatPreflight, resolveProbeIdentity } from './lib/mc-production-preflight.mjs';
import { fetchPagesControlPlane } from './lib/pages-control-plane.mjs';
import { resolveCloudflareToken } from './lib/cloudflare-token.mjs';
import { scanEvidence } from './lib/mc-off-proof.mjs';
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
const controlPlaneSource = first('--control-plane') || 'env';
const cloudflare = resolveCloudflareToken({ source: controlPlaneSource });
const controlPlane = cloudflare.error ? { error: cloudflare.error } : await fetchPagesControlPlane({ token: cloudflare.token });
const probeCredential = resolveProbeIdentity({ choice: first('--probe-identity') || 'auto' });
if (probeCredential.error && !String(probeCredential.error).includes('is not set')) {
  console.error(`--probe-identity: ${probeCredential.error}`);
  process.exit(2);
}

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
  controlPlane, probe: await fetchRuntimeProbe({ origin, token: probeCredential.token }), host, gate, canonicalD1Id: canonicalD1Id(), bearerKcv,
  probeIdentity: probeCredential.identity,
});
const evidence = { ...result, controlPlaneSource, observedAt: new Date().toISOString() };

console.log(formatPreflight(result));
const jsonPath = first('--json');
if (jsonPath) {
  const text = `${JSON.stringify(evidence, null, 2)}\n`;
  const leaks = scanEvidence(text, [process.env.GFD_MC_CANARY_RUNNER_TOKEN, process.env.GFD_OPERATOR_TOKEN, process.env.GFD_MC_WORKER_TOKEN, process.env.CLOUDFLARE_API_TOKEN, cloudflare.token].filter(Boolean));
  if (leaks.length) { console.error(`preflight evidence not written: it contains ${leaks.join(', ')}`); process.exit(2); }
  writeFileSync(jsonPath, text);
}
process.exitCode = result.canStartInvestigation ? 0 : 1;
