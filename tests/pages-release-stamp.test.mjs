import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { STAMP_SCHEMA, buildStamp, interpretStamp } from '../scripts/lib/pages-release-stamp.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SHA = '0123456789abcdef0123456789abcdef01234567';
const NOW = new Date('2026-10-01T03:00:00.000Z');
const roundTrip = (value) => JSON.parse(JSON.stringify(value));

// Pages build with a good SHA
const good = buildStamp({ CF_PAGES: '1', CF_PAGES_COMMIT_SHA: SHA, CF_PAGES_BRANCH: 'main', CF_PAGES_URL: 'https://x.pages.dev' }, NOW);
assert.deepEqual([good.state, good.source, good.sha, good.branch], ['stamped', 'cloudflare-pages', SHA, 'main']);
assert.equal(interpretStamp(roundTrip(good)).state, 'stamped');

// Pages build with absent / malformed SHA can never be current
for (const bad of [undefined, '', 'main', SHA.toUpperCase(), SHA.slice(1), `${SHA}0`, 'g'.repeat(40)]) {
  const stamp = buildStamp({ CF_PAGES: '1', CF_PAGES_COMMIT_SHA: bad }, NOW);
  assert.equal(stamp.state, 'invalid', `sha ${JSON.stringify(bad)}`);
  assert.equal(stamp.sha, null);
  assert.equal(interpretStamp(roundTrip(stamp)).sha, null);
}

// A local/test build is explicit and never masquerades as production, even if a SHA is in the environment
for (const env of [{}, { CF_PAGES_COMMIT_SHA: SHA }, { CF_PAGES: '0', CF_PAGES_COMMIT_SHA: SHA }, { GITHUB_SHA: SHA }]) {
  const stamp = buildStamp(env, NOW);
  assert.deepEqual([stamp.state, stamp.source, stamp.sha], ['local', 'local', null]);
  assert.equal(interpretStamp(roundTrip(stamp)).state, 'local');
}

// The deployment URL is kept only when it is a real https *.pages.dev deployment URL
for (const [url, expected] of [
  ['https://58d05431.goodflippindesign.pages.dev', 'https://58d05431.goodflippindesign.pages.dev'],
  ['https://58d05431.goodflippindesign.pages.dev/', 'https://58d05431.goodflippindesign.pages.dev'],
  ['http://58d05431.goodflippindesign.pages.dev', null],
  ['https://58d05431.goodflippindesign.pages.dev.evil.example', null],
  ['https://evil.example/58d05431.goodflippindesign.pages.dev', null],
  [undefined, null],
]) {
  const stamp = buildStamp({ CF_PAGES: '1', CF_PAGES_COMMIT_SHA: SHA, CF_PAGES_URL: url }, NOW);
  assert.equal(interpretStamp(roundTrip(stamp)).url, expected, String(url));
}

// Tampered / foreign stamps read back as invalid
for (const forged of [
  null, 'x', {}, { schemaVersion: 'other' },
  { schemaVersion: STAMP_SCHEMA, source: 'local', state: 'stamped', sha: SHA, builtAt: NOW.toISOString() },
  { schemaVersion: STAMP_SCHEMA, source: 'cloudflare-pages', state: 'stamped', sha: 'abc', builtAt: NOW.toISOString() },
  { schemaVersion: STAMP_SCHEMA, source: 'cloudflare-pages', state: 'stamped', sha: SHA, builtAt: 'never' },
]) {
  const read = interpretStamp(forged);
  assert.equal(read.state, 'invalid');
  assert.equal(read.sha, null);
}

// The build script writes the (gitignored) file, and it is never tracked
const file = `${ROOT}release-stamp.json`;
rmSync(file, { force: true });
execFileSync('node', ['scripts/stamp-pages-release.mjs'], { cwd: ROOT, env: { ...process.env, CF_PAGES: '1', CF_PAGES_COMMIT_SHA: SHA, CF_PAGES_BRANCH: 'main' } });
assert.equal(JSON.parse(readFileSync(file, 'utf8')).sha, SHA);
assert.equal(execFileSync('git', ['check-ignore', 'release-stamp.json'], { cwd: ROOT, encoding: 'utf8' }).trim(), 'release-stamp.json');
assert.equal(execFileSync('git', ['ls-files', 'release-stamp.json'], { cwd: ROOT, encoding: 'utf8' }).trim(), '', 'never committed');
execFileSync('node', ['scripts/stamp-pages-release.mjs'], { cwd: ROOT, env: { PATH: process.env.PATH } });
assert.equal(JSON.parse(readFileSync(file, 'utf8')).state, 'local', 'a rebuild without Pages env overwrites to local');
rmSync(file, { force: true });
assert.ok(!existsSync(file));

// `npm run build` (the existing Pages build command) ends with the stamp
assert.match(JSON.parse(readFileSync(`${ROOT}package.json`, 'utf8')).scripts.build, /stamp-pages-release\.mjs$/);

console.log('pages release stamp tests: all passed');
