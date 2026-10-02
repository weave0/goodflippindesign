// Topology regression guard. In 2026-10 a plan to "release the gfd-auth Worker" for Mission Control was drafted
// before anyone noticed that production Mission Control is not served by that Worker at all. This test pins the
// real architecture in the repository so that mistake cannot be re-made silently:
//
//   https://goodflippindesign.com/api/mission-control
//     -> Cloudflare Pages project `goodflippindesign` (advanced mode)
//     -> _worker.js -> workers/auth.js -> handleMissionControlRequest
//
//   gfd-auth.weave0.workers.dev  is a LEGACY standalone Worker and is NOT the Mission Control origin.
//
// It needs no network. The operator preflight (scripts/mc-production-preflight.mjs) confirms the same topology
// live against the Cloudflare control plane.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CANONICAL_MC_ORIGIN, PAGES_PROJECT, REQUIRED_BINDINGS } from '../workers/lib/worker-provenance.js';
import { isCanonicalOrigin } from '../scripts/lib/mc-production-preflight.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const text = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const LEGACY_HOST = 'gfd-auth.weave0.workers.dev';

// 1. The Pages project is what the root config describes.
const pagesToml = text('wrangler.toml');
assert.match(pagesToml, /^name\s*=\s*"goodflippindesign"/m);
assert.match(pagesToml, /^pages_build_output_dir\s*=/m, 'root wrangler.toml is a Pages project');
assert.equal(PAGES_PROJECT, 'goodflippindesign');
assert.equal(CANONICAL_MC_ORIGIN, 'https://goodflippindesign.com');

// Root Pages secret guidance is part of the topology contract too: MC credentials belong to the Pages project,
// never the legacy standalone Worker. Keep the check scoped to the secret-comment section so unrelated deploy
// commands elsewhere in the config do not create false positives.
const pagesSecretHeader = '# Pages secrets (set via: wrangler pages secret put <NAME> --project-name goodflippindesign)';
assert.ok(pagesToml.includes(pagesSecretHeader), 'root Pages secret guidance uses the exact Pages command');
const secretStart = pagesToml.indexOf(pagesSecretHeader);
const secretEnd = pagesToml.indexOf('# Feature flags', secretStart);
assert.ok(secretStart >= 0 && secretEnd > secretStart, 'root Pages secret guidance section exists');
const rootSecretSection = pagesToml.slice(secretStart, secretEnd);
assert.doesNotMatch(rootSecretSection, /wrangler secret put/, 'root Pages secret guidance must never use Worker secret syntax');
for (const name of REQUIRED_BINDINGS) {
  assert.match(rootSecretSection, new RegExp(name), `root Pages secret guidance includes ${name}`);
}

// 2. Pages advanced mode: _worker.js routes /api/* into workers/auth.js.
assert.ok(existsSync(join(ROOT, '_worker.js')), 'Pages advanced-mode entry exists');
const pagesWorker = text('_worker.js');
assert.match(pagesWorker, /import\(["']\.\/workers\/auth\.js["']\)/, '_worker.js loads workers/auth.js');
assert.match(pagesWorker, /pathname\.startsWith\(["']\/api\/["']\)/, '_worker.js sends /api/* to the auth worker');
assert.match(pagesWorker, /env\.ASSETS/, 'the Pages static-asset binding is how the runtime reads its build stamp');

// 3. workers/auth.js mounts the Mission Control handler (including the provenance endpoint).
const auth = text('workers/auth.js');
assert.match(auth, /import \{ handleMissionControlRequest \} from '\.\/mission-control-api\.js'/);
assert.match(auth, /url\.pathname === '\/api\/mission-control' \|\| url\.pathname\.startsWith\('\/api\/mission-control\/'\)/);
assert.match(text('workers/mission-control-api.js'), /parts\[2\] === 'provenance'/);

// 4. The standalone Worker config is explicitly marked legacy and the Pages build stamps the release.
const legacy = text('workers/wrangler.toml');
assert.match(legacy, /^name = "gfd-auth"/m);
assert.match(legacy, /LEGACY standalone Worker[\s\S]*NOT the Mission Control runtime/);
assert.match(JSON.parse(text('package.json')).scripts.build, /stamp-pages-release\.mjs/);
assert.match(text('.gitignore'), /^release-stamp\.json$/m);

// 5. The canonical origin is the Pages custom domain, never the legacy Worker or the Pages preview host.
assert.equal(isCanonicalOrigin(CANONICAL_MC_ORIGIN), true);
for (const origin of [`https://${LEGACY_HOST}`, 'https://goodflippindesign.pages.dev', 'https://58d05431.goodflippindesign.pages.dev']) {
  assert.equal(isCanonicalOrigin(origin), false, origin);
}

// 6. No release machinery targets the standalone Worker, and nothing tells an operator to deploy MC to it.
for (const file of readdirSync(join(ROOT, '.github', 'workflows'))) {
  const body = text(`.github/workflows/${file}`);
  assert.doesNotMatch(body, /workers\/wrangler\.toml/, `${file} must not deploy the legacy gfd-auth config`);
  assert.doesNotMatch(body, /deploy[^\n]*gfd-auth/i, `${file} must not deploy gfd-auth`);
}
assert.ok(!existsSync(join(ROOT, 'scripts', 'deploy-gfd-auth-worker.mjs')));
assert.ok(!existsSync(join(ROOT, '.github', 'workflows', 'deploy-gfd-auth-worker.yml')));

// 7. Mission Control operator docs/scripts: secrets go to the Pages project; the legacy host is only ever
//    mentioned as legacy/not-this, and `wrangler secret put` against workers/wrangler.toml never appears for MC.
const mcDocs = readdirSync(join(ROOT, 'docs'))
  .filter((file) => /^mission-control.*\.md$/.test(file))
  .map((file) => `docs/${file}`);
const mcFiles = [
  ...mcDocs,
  'scripts/mc-production-preflight.mjs',
  'scripts/lib/mc-production-preflight.mjs',
  'scripts/fwomps-aiaimate-host-binding.py',
];
for (const file of mcFiles) {
  const body = text(file);
  for (const name of REQUIRED_BINDINGS) {
    const lines = body.split('\n').filter((line) => line.includes(name) && /wrangler\s+secret\s+put/.test(line));
    assert.deepEqual(lines, [], `${file}: ${name} must be set with \`wrangler pages secret put\`, not a Worker secret`);
  }
  assert.doesNotMatch(body, /wrangler secret put[^\n]*workers\/wrangler\.toml/, `${file}: no Worker secret put against workers/wrangler.toml`);
  for (const line of body.split('\n')) {
    if (line.includes(LEGACY_HOST)) assert.match(line, /legacy|not|never|NOT|refus|reject|≠/i, `${file}: ${LEGACY_HOST} may only be mentioned as legacy/not-canonical: ${line.trim()}`);
  }
}
assert.match(text('docs/mission-control-worker-provenance.md'), /wrangler pages secret put/);

console.log('mission control topology guard: all passed');
