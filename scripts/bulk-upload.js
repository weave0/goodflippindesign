#!/usr/bin/env node
/**
 * Bulk Upload CLI — uploads a folder of media files to the GFD CMS API.
 *
 * Usage:
 *   node scripts/bulk-upload.js --dir "Z:\MediaDrop" --brand gfd --token <clerk-jwt>
 *   node scripts/bulk-upload.js --dir "E:\Art Drive\GFV" --brand gfv --token <clerk-jwt>
 *
 * Options:
 *   --dir      Directory to scan (required)
 *   --brand    Brand slug: gfd | gfv | culturesherpa | aiaimate (required)
 *   --token    Clerk session JWT (required; get from admin portal DevTools → Network tab)
 *   --host     API host (default: https://goodflippindesign.com)
 *   --category Asset category (default: uploads)
 *   --dry-run  List files without uploading
 *   --concur   Max parallel uploads (default: 3)
 *
 * Getting your token (one-time, valid ~60s but auto-refreshed per upload):
 *   1. Open admin panel → DevTools → Network
 *   2. Find any /api/cms/* request → copy Authorization header value (after "Bearer ")
 *   Because tokens expire quickly, this script will re-use the same token for all
 *   uploads in a single run. For very large batches, run in smaller directory subsets.
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');
const http  = require('http');

// ── Parse CLI args ──────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf('--' + name);
  return idx !== -1 ? args[idx + 1] : null;
}
function hasFlag(name) { return args.includes('--' + name); }

const dir      = getArg('dir');
const brand    = getArg('brand')    || 'gfd';
const token    = getArg('token');
const host     = getArg('host')     || 'https://goodflippindesign.com';
const category = getArg('category') || 'uploads';
const concur   = Math.max(1, parseInt(getArg('concur') || '3', 10));
const dryRun   = hasFlag('dry-run');

if (!dir) { console.error('Error: --dir is required'); process.exit(1); }
if (!token && !dryRun) { console.error('Error: --token is required (unless --dry-run)'); process.exit(1); }
if (!fs.existsSync(dir)) { console.error(`Error: directory not found: ${dir}`); process.exit(1); }

// ── Supported media extensions ──────────────────────────────────────
const SUPPORTED_EXT = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg',
  '.mp4', '.mov', '.webm', '.avi', '.mkv',
  '.mp3', '.wav', '.aac', '.ogg', '.flac',
  '.pdf', '.doc', '.docx',
]);

function getMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (['.mp4','.mov','.webm','.avi','.mkv'].includes(ext)) return 'video';
  if (['.mp3','.wav','.aac','.ogg','.flac'].includes(ext)) return 'audio';
  if (['.pdf','.doc','.docx'].includes(ext)) return 'document';
  return 'image';
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.aac': 'audio/aac',
    '.pdf': 'application/pdf',
  };
  return map[ext] || 'application/octet-stream';
}

// ── Recursive directory scanner ─────────────────────────────────────
function scanDir(dirPath) {
  const results = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDir(full));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (SUPPORTED_EXT.has(ext)) results.push(full);
    }
  }
  return results;
}

// ── Multipart form builder (no external deps) ───────────────────────
function buildMultipart(fields, fileInfo) {
  const boundary = '----GFDUpload' + Math.random().toString(36).slice(2);
  const CRLF = '\r\n';
  const chunks = [];

  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(
      `--${boundary}${CRLF}Content-Disposition: form-data; name="${name}"${CRLF}${CRLF}${value}${CRLF}`
    ));
  }

  const { fileName, mimeType, data } = fileInfo;
  chunks.push(Buffer.from(
    `--${boundary}${CRLF}Content-Disposition: form-data; name="file"; filename="${fileName}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`
  ));
  chunks.push(data);
  chunks.push(Buffer.from(`${CRLF}--${boundary}--${CRLF}`));

  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

// ── HTTP request ────────────────────────────────────────────────────
function uploadFile(filePath) {
  return new Promise((resolve, reject) => {
    const fileData  = fs.readFileSync(filePath);
    const fileName  = path.basename(filePath);
    const mimeType  = getMimeType(filePath);
    const mediaType = getMediaType(filePath);
    const title     = fileName.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');

    const { body, contentType } = buildMultipart(
      { title, brand, category, media_type: mediaType },
      { fileName, mimeType, data: fileData }
    );

    const url = new URL('/api/cms/upload', host);
    const isHttps = url.protocol === 'https:';
    const requestFn = isHttps ? https.request : http.request;

    const req = requestFn({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType,
        'Content-Length': body.length,
      },
    }, (res) => {
      let raw = '';
      res.on('data', (d) => { raw += d; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, id: json.id || json.asset?.id });
          } else {
            resolve({ ok: false, error: json.error || `HTTP ${res.statusCode}` });
          }
        } catch {
          resolve({ ok: false, error: `HTTP ${res.statusCode}: ${raw.slice(0, 120)}` });
        }
      });
    });

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

// ── Concurrency pool ────────────────────────────────────────────────
async function runPool(tasks, poolSize, onResult) {
  let idx = 0;
  let active = 0;
  let done = 0;

  return new Promise((resolve) => {
    function next() {
      while (active < poolSize && idx < tasks.length) {
        const i = idx++;
        active++;
        tasks[i]().then((result) => {
          onResult(i, result);
          active--;
          done++;
          if (done === tasks.length) resolve();
          else next();
        }).catch((err) => {
          onResult(i, { ok: false, error: err.message });
          active--;
          done++;
          if (done === tasks.length) resolve();
          else next();
        });
      }
    }
    next();
  });
}

// ── Main ────────────────────────────────────────────────────────────
(async () => {
  console.log(`Scanning: ${dir}`);
  const files = scanDir(dir);
  console.log(`Found ${files.length} supported media file(s)\n`);

  if (files.length === 0) {
    console.log('Nothing to upload.');
    return;
  }

  if (dryRun) {
    files.forEach((f, i) => console.log(`  [${i + 1}/${files.length}] ${f}`));
    console.log('\n--dry-run: no files uploaded.');
    return;
  }

  let passed = 0;
  let failed = 0;
  const errors = [];

  const tasks = files.map((filePath, i) => () => {
    process.stdout.write(`[${i + 1}/${files.length}] Uploading ${path.basename(filePath)}… `);
    return uploadFile(filePath);
  });

  await runPool(tasks, concur, (i, result) => {
    if (result.ok) {
      process.stdout.write(`✓ (id: ${result.id})\n`);
      passed++;
    } else {
      process.stdout.write(`✗ ${result.error}\n`);
      failed++;
      errors.push({ file: files[i], error: result.error });
    }
  });

  console.log(`\n─────────────────────────────────`);
  console.log(`✓ Uploaded:  ${passed}`);
  console.log(`✗ Failed:    ${failed}`);
  if (errors.length) {
    console.log('\nFailed files:');
    errors.forEach((e) => console.log(`  ${e.file}\n    → ${e.error}`));
  }
})();
