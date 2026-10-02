#!/usr/bin/env node
/**
 * Revision-bound Mission Control evidence artifact: build or verify. See scripts/lib/revision-bound-evidence.mjs.
 *
 *   node --no-warnings scripts/mc-evidence.mjs --facts run-facts.json --out docs/evidence      # build + write (new file only)
 *   node --no-warnings scripts/mc-evidence.mjs --verify docs/evidence/<artifact>.json          # recompute + re-check everything
 *
 * Secrets: the operator credentials that may be present in this shell (CLOUDFLARE_API_TOKEN, GFD_OPERATOR_TOKEN,
 * FWOMPS_MC_CONTRACT_KEY_HEX, FWOMPS_MC_WORKER_KEY_HEX, GFD_MC_WORKER_TOKEN, MISSION_CONTROL_*, ...) are read
 * from the environment IN MEMORY ONLY and scanned for in the artifact. Values are never accepted on argv, printed,
 * or stored. `--also-env NAME` adds another environment variable NAME (not a value) to the scan.
 *
 * Fences: an artifact containing credential material is NEVER written, regardless of --record-failure; with
 * --record-failure only a sanitized receipt (classification, timestamp, finding kinds/counts) is written.
 * --record-failure otherwise permits recording a LOGICAL failure, marked valid:false. Existing files are never overwritten.
 */
import { readFileSync } from 'node:fs';

import {
  SecretLeakError, buildEvidence, collectKnownSecrets, verifyEvidence, writeEvidence, writeLeakReceipt,
} from './lib/revision-bound-evidence.mjs';

const args = process.argv.slice(2);
const first = (flag) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] ?? null : null; };
const all = (flag) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const knownSecrets = collectKnownSecrets(process.env, all('--also-env'));

const verifyPath = first('--verify');
if (verifyPath) {
  const result = verifyEvidence(JSON.parse(readFileSync(verifyPath, 'utf8')), { knownSecrets });
  console.log(result.ok ? 'evidence OK' : `evidence NOT OK:\n  ${result.problems.join('\n  ')}`);
  process.exitCode = result.ok ? 0 : 1;
} else {
  const factsPath = first('--facts');
  const outDir = first('--out');
  if (!factsPath || !outDir) {
    console.error('usage: --facts <run-facts.json> --out <dir>  |  --verify <artifact.json>');
    process.exitCode = 2;
  } else {
    const facts = JSON.parse(readFileSync(factsPath, 'utf8'));
    const artifact = buildEvidence(facts, { knownSecrets });
    console.log(`evidence: ${artifact.valid ? 'VALID' : `INVALID (${artifact.failedAssertions.join(', ')})`}`);
    try {
      console.log(`wrote ${writeEvidence(artifact, outDir, { allowInvalid: args.includes('--record-failure'), knownSecrets })}`);
    } catch (error) {
      process.exitCode = 1;
      if (error instanceof SecretLeakError) {
        console.error(error.message); // kinds and counts only
        if (args.includes('--record-failure')) {
          try { console.error(`wrote sanitized receipt ${writeLeakReceipt(artifact.classification, error, outDir)}`); } catch (receiptError) { console.error(receiptError.message); }
        }
      } else {
        console.error(error.message);
      }
    }
  }
}
