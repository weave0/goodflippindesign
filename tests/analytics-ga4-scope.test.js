const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pages = [
  'index.html', 'gallery.html', 'music.html', 'music-djz.html',
  'music-shariff.html', 'music-aardvarco.html',
  'music-heavymoose-dross1.html', 'music-heavymoose-dross2.html',
  'temp_review.html',
];
// GA Admin: GFD property 522463875, stream 13393411447 (verified 2026-10-15).
const measurementId = 'G-QPPVJM1B60';

for (const page of pages) {
  test(`${page} has one GFD GA4 setup without cross-property linker`, () => {
    const html = fs.readFileSync(path.resolve(__dirname, '..', page), 'utf8');
    const scripts = [...html.matchAll(/src="\/ga4-consent\.js"[^>]+data-ga4="(G-[A-Z0-9]+)"/g)].map(m => m[1]);
    const configs = [...html.matchAll(/gtag\(\s*['"]config['"]\s*,\s*['"](G-[A-Z0-9]+)['"]/g)].map(m => m[1]);
    assert.deepEqual(scripts, [measurementId]);
    assert.deepEqual(configs, [], 'only the consent initializer may configure GA');
    assert.doesNotMatch(html.slice(0, html.indexOf('</head>')), /['"]linker['"]\s*:/);
  });
}
