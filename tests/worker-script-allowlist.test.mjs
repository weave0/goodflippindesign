/**
 * Static/runtime check for the Pages advanced-mode worker.
 * Root-level .js is denied unless it is in allowedExact. Every same-origin
 * script in a served HTML <head> must still come back from the worker as 200.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import worker from '../_worker.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CONTENT_TYPES = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function assetFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  } catch {
    return null;
  }
  let file = path.resolve(ROOT, rel);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : `${ROOT}${path.sep}`;
  if (file !== ROOT && !file.startsWith(rootWithSep)) return null;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    file = path.join(file, 'index.html');
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return null;
  return file;
}

const env = {
  ASSETS: {
    async fetch(request) {
      const file = assetFile(new URL(request.url).pathname);
      if (!file) {
        return new Response('missing', {
          status: 404,
          headers: { 'content-type': 'text/plain; charset=utf-8' },
        });
      }
      const type = CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      return new Response(fs.readFileSync(file), {
        headers: { 'content-type': type },
      });
    },
  },
};

async function fetchPath(pathname) {
  const response = await worker.fetch(
    new Request(`https://goodflippindesign.com${pathname}`),
    env,
    {},
  );
  const body = await response.text();
  return { response, body };
}

function workerBlocked(result) {
  return result.response.status === 404 && result.body === 'Not found';
}

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '.wrangler') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(full, out);
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(full);
  }
  return out;
}

function pagePath(file) {
  return `/${path.relative(ROOT, file).split(path.sep).join('/')}`;
}

function normalizePath(pathname) {
  const parts = [];
  for (const part of pathname.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `/${parts.join('/')}`;
}

function resolveScript(src, page) {
  if (src.startsWith('/')) return normalizePath(src);
  return normalizePath(page.replace(/[^/]*$/, '') + src);
}

function headScriptPaths(html, page) {
  const end = html.search(/<\/head>/i);
  const head = (end === -1 ? '' : html.slice(0, end)).replace(/<!--[\s\S]*?-->/g, '');
  const paths = [];
  const tags = /<script\b([^>]*)>/gi;
  let match;
  while ((match = tags.exec(head))) {
    const srcMatch = match[1].match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i);
    const src = srcMatch && (srcMatch[1] || srcMatch[2] || srcMatch[3]);
    if (!src) continue;
    const trimmed = src.trim();
    if (!trimmed || /^(?:[a-z]+:)?\/\//i.test(trimmed) || /^(?:data|blob|mailto):/i.test(trimmed)) continue;
    const bare = trimmed.split('#')[0].split('?')[0];
    if (!bare) continue;
    paths.push(resolveScript(bare, page));
  }
  return paths;
}

test('/ga4-consent.js is served as JavaScript and stays opt-in', async () => {
  const { response, body } = await fetchPath('/ga4-consent.js');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /javascript/i);
  assert.match(body, /analytics_storage:\s*'denied'/);
  assert.match(body, /value === 'granted'/);
  assert.match(body, /googletagmanager\.com\/gtag\/js\?id=/);
  assert.doesNotMatch(body, /analytics_storage:\s*'granted'/);

  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(index, /src="\/ga4-consent\.js"[^>]+data-ga4="G-QPPVJM1B60"/);
});

test('every same-origin script in a served HTML head is allowed through the worker', async () => {
  const problems = [];
  for (const file of walkHtml(ROOT)) {
    const page = pagePath(file);
    const served = await fetchPath(page);
    if (workerBlocked(served)) continue;
    const html = fs.readFileSync(file, 'utf8');
    for (const scriptPath of headScriptPaths(html, page)) {
      const result = await fetchPath(scriptPath);
      if (workerBlocked(result)) {
        problems.push(`${page} -> ${scriptPath} is denied by the worker (add it to allowedExact if it is root-level .js)`);
        continue;
      }
      if (!scriptPath.toLowerCase().endsWith('.js')) continue;
      const contentType = result.response.headers.get('content-type') || '';
      if (result.response.status !== 200 || !/javascript/i.test(contentType)) {
        problems.push(`${page} -> ${scriptPath} status ${result.response.status} content-type ${contentType || '(none)'}`);
      }
    }
  }
  assert.deepEqual(problems, []);
});

test('root scripts and internal paths stay denied', async () => {
  const blocked = [
    '/not-a-public-script.js',
    '/_worker.js',
    '/package.json',
    '/config.js',
    '/docs/secret.md',
    '/tests/secret.js',
    '/workers/auth.js',
  ];
  for (const pathname of blocked) {
    const result = await fetchPath(pathname);
    assert.equal(workerBlocked(result), true, `${pathname} should stay denied`);
    assert.equal(result.response.headers.get('x-robots-tag'), 'noindex, nofollow');
  }
});

test('incubations, Red Leopard / Lowertown, and admin assets stay reachable', async () => {
  const luck = await fetchPath('/incubations/goodflippinluck/index.html');
  assert.equal(luck.response.status, 200);
  assert.match(luck.body, /Good Flippin Luck/);

  const news = await fetchPath('/incubations/goodflippinnews/index.html');
  assert.equal(news.response.status, 200);
  assert.match(news.body, /Good Flippin/);

  const red = await fetchPath('/redleopardofstpaul/index.html');
  assert.equal(red.response.status, 200);
  assert.match(red.body, /Red Leopard of St\. Paul/);
  assert.match(red.body, /Lowertown/);

  for (const asset of ['/admin-panels.js', '/mission-control-admin.js', '/robots.txt']) {
    const result = await fetchPath(asset);
    assert.equal(result.response.status, 200, asset);
  }
});

test('admin.html is noindex and does not publish the workstation hostname', async () => {
  const admin = await fetchPath('/admin.html');
  assert.equal(admin.response.status, 200);
  assert.equal(admin.response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.match(admin.body, /name="robots" content="noindex, nofollow, noarchive"/);
  assert.doesNotMatch(admin.body, /WEAVERASUS/);

  const pretty = await fetchPath('/admin');
  assert.equal(pretty.response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');

  const panels = await fetchPath('/admin-panels.js');
  assert.equal(panels.response.status, 200);
  assert.doesNotMatch(panels.body, /WEAVERASUS/);
});
