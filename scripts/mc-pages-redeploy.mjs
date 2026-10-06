#!/usr/bin/env node
/**
 * Same-revision production redeploy (see scripts/lib/pages-redeploy.mjs for why this is the only safe path).
 *
 *   node --no-warnings scripts/mc-pages-redeploy.mjs --expected-sha <40-hex>                 # PLAN (read-only)
 *   node --no-warnings scripts/mc-pages-redeploy.mjs --expected-sha <40-hex> --apply [--json <out.json>] [--timeout-seconds 900]
 *
 *   CLOUDFLARE_API_TOKEN  Pages-write token, environment only. In CI it is the repository secret used by
 *                         .github/workflows/mc-pages-redeploy.yml, so no local credential is needed.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { RedeployError, createPagesApi, redeploySameRevision } from './lib/pages-redeploy.mjs';

const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? null : null; };
const apply = args.includes('--apply');
const timeoutSeconds = Number(value('--timeout-seconds') || 900);
const jsonOut = value('--json');
const fail = (message, code = 1) => { console.error(`redeploy: ${message}`); process.exit(code); };

if (!(timeoutSeconds >= 30 && timeoutSeconds <= 3600)) fail('--timeout-seconds must be between 30 and 3600');
if (jsonOut && existsSync(path.resolve(jsonOut))) fail(`${path.resolve(jsonOut)} already exists; evidence is never overwritten`);

let evidence;
try {
  const api = createPagesApi({ token: process.env.CLOUDFLARE_API_TOKEN });
  evidence = await redeploySameRevision({ expectedSha: value('--expected-sha'), api, apply, timeoutMs: timeoutSeconds * 1000 });
} catch (error) {
  if (!(error instanceof RedeployError)) fail('unexpected failure', 2);
  if (error.evidence) console.error(JSON.stringify(error.evidence));
  fail(`${error.code}: ${error.message}`, 3);
}

if (jsonOut) {
  mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
  writeFileSync(path.resolve(jsonOut), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
}
console.log(JSON.stringify(evidence, null, 2));
