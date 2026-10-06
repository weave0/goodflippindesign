#!/usr/bin/env node
/**
 * Production canary OFF proof. Proves that the production Mission Control canary is OFF by showing that the VALID
 * canary-runner credential is inert on every route (see scripts/lib/mc-off-proof.mjs for the full contract).
 *
 *   node --no-warnings scripts/mc-production-off-proof.mjs --label initial|final --expected-sha <40-hex> \
 *     --out docs/evidence/mc-canary-off-proof-<label>-<date>.json [--control-plane api|wrangler|wrangler-list] [--origin https://goodflippindesign.com]
 *
 *   GFD_MC_CANARY_RUNNER_TOKEN   the runner credential (environment only; never an argument, never recorded)
 *   --control-plane              api: CLOUDFLARE_API_TOKEN (read-only Pages token). wrangler: the Wrangler login via
 *                                `wrangler auth token`, GET only; the same exact checks (full SHA + stage), no new credential.
 *                                wrangler-list: `wrangler pages deployment list` only (7-character SHA match, no stage check).
 *
 * Read-only against production: every probe is inert even if the canary were ON. Exit 0 only for OFF_PROVEN.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { apiSnapshot, wranglerSnapshot } from './lib/pages-release-snapshot.mjs';
import { resolveCloudflareToken } from './lib/cloudflare-token.mjs';
import { RUNNER_ENV, runOffProof, scanEvidence } from './lib/mc-off-proof.mjs';

const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? null : null; };
const fail = (message, code = 1) => { console.error(`off-proof: ${message}`); process.exit(code); };

const label = value('--label');
const expectedSha = value('--expected-sha');
const out = value('--out');
const origin = value('--origin') || undefined;
const plane = value('--control-plane') || 'api';
if (!out) fail('--out <evidence.json> is required');
if (!['api', 'wrangler', 'wrangler-list'].includes(plane)) fail('--control-plane must be api, wrangler or wrangler-list');
const cloudflare = plane === 'wrangler-list' ? {} : resolveCloudflareToken({ source: plane === 'api' ? 'env' : 'wrangler' });
if (cloudflare.error) fail(cloudflare.error);
const outPath = path.resolve(out);
if (existsSync(outPath)) fail(`${outPath} already exists; evidence is never overwritten`);

const controlPlane = plane === 'wrangler-list'
  ? async () => wranglerSnapshot()
  : () => apiSnapshot({ token: cloudflare.token });

let evidence;
try {
  evidence = await runOffProof({
    origin, runnerToken: process.env[RUNNER_ENV], expectedSha, label, controlPlane,
    extraSecrets: [process.env.GFD_MC_WORKER_TOKEN, process.env.GFD_OPERATOR_TOKEN, process.env.CLOUDFLARE_API_TOKEN, cloudflare.token].filter(Boolean),
  });
} catch (error) {
  fail(error.message);
}
evidence.release.controlPlaneSource = plane;

const text = `${JSON.stringify(evidence, null, 2)}\n`;
const leaks = scanEvidence(text, [process.env[RUNNER_ENV], process.env.GFD_MC_WORKER_TOKEN, process.env.GFD_OPERATOR_TOKEN, process.env.CLOUDFLARE_API_TOKEN, cloudflare.token].filter(Boolean));
if (leaks.length) fail(`evidence not written: it contains ${leaks.join(', ')}`, 2);
mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, text, { flag: 'wx' });

const s = evidence.summary;
console.log(`off-proof ${evidence.label}: ${evidence.verdict}  probes ${s.probesOk}/${s.probes}  controls ${s.controlsOk}/${s.controls}  release ${evidence.release.after?.id ?? 'unknown'} @ ${String(evidence.release.after?.commitHash || '').slice(0, 12)}`);
for (const failure of evidence.failures) console.log(`  FAIL ${failure}`);
console.log(`evidence: ${outPath}`);
process.exit(evidence.verdict === 'OFF_PROVEN' ? 0 : 3);
