#!/usr/bin/env node
// Writes release-stamp.json (build output, gitignored). Runs as the last step of `npm run build`, which is the
// existing Cloudflare Pages build command. Never fails the build: a bad stamp is recorded as `invalid` and the
// production gate refuses it, rather than blocking a deploy of the site.
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { STAMP_FILE, buildStamp } from './lib/pages-release-stamp.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stamp = buildStamp(process.env);
writeFileSync(path.join(root, STAMP_FILE), `${JSON.stringify(stamp, null, 2)}\n`);
console.log(`release stamp: ${stamp.state}${stamp.sha ? ` ${stamp.sha}` : ''} (${stamp.source})`);
if (stamp.state === 'invalid') console.warn(`WARNING: ${stamp.reason}; production provenance will not be considered current`);
