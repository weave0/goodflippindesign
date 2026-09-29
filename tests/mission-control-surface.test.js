import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../admin.css', import.meta.url), 'utf8');
const cockpit = css.slice(css.indexOf('/* Mission Control operator cockpit */'));
assert.ok(cockpit.length > 0, 'mission control cockpit styles exist');
assert.match(cockpit, /@media \(max-width: 720px\)/);
assert.equal(cockpit.includes('min-width: 640px'), false);
assert.equal(cockpit.includes('min-width:640px'), false);
assert.match(cockpit, /grid-template-columns:\s*1fr 1fr/);

const admin = await readFile(new URL('../admin.html', import.meta.url), 'utf8');
assert.match(admin, /mission-control-admin\.js/);
assert.match(admin, /id="view-mission-control"/);
assert.match(admin, /id="mc-diagnostics"/);

const cockpitJs = await readFile(new URL('../mission-control-admin.js', import.meta.url), 'utf8');
assert.match(cockpitJs, /Work queue unavailable\. No all-clear is implied\./);
assert.match(cockpitJs, /operator\.diagnostics/);

const worker = await readFile(new URL('../_worker.js', import.meta.url), 'utf8');
assert.match(worker, /\/mission-control-admin\.js/);

for (const page of ['../index.html', '../community-portal.html', '../investors.html']) {
  const html = await readFile(new URL(page, import.meta.url), 'utf8');
  assert.equal(html.includes('mission-control-admin.js'), false, `${page} must not load the private cockpit`);
  assert.equal(html.includes('/api/mission-control'), false, `${page} must not call the private evidence API`);
}

const panels = await readFile(new URL('../admin-panels.js', import.meta.url), 'utf8');
assert.match(panels, /window\.__adminApi = api/);
assert.match(panels, /'mission-control': \{ name: 'Mission Control'/);

console.log('mission control surface checks passed');
