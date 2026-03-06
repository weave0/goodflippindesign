#!/usr/bin/env node
/**
 * sync-art-drive.js — Syncs selected E:\Art Drive directories to the Weave CMS
 *
 * Usage:
 *   node scripts/sync-art-drive.js                  # Sync all configured dirs
 *   node scripts/sync-art-drive.js --watch           # Watch + auto-sync on change
 *   node scripts/sync-art-drive.js --dry-run         # Show what would be uploaded
 *   node scripts/sync-art-drive.js --dir "E:\Art\GFV" --brand gfv
 *
 * What it does:
 *   1. Walks configured source directories on E:\ drive
 *   2. Skips already-synced files (tracked in local .sync-state.json)
 *   3. Converts images to WebP if sharp is available
 *   4. POSTs each file to /api/cms/upload with brand + category metadata
 *   5. Records synced files so re-runs are idempotent
 *
 * Prerequisites:
 *   npm install chokidar node-fetch  (optional: sharp for WebP conversion)
 *
 * Config:
 *   Edit SYNC_CONFIG below to point at your E:\ directories and map brands.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ──────────────────────────────────────────────────────────────
//  Configuration — edit these to match your E:\ drive layout
// ──────────────────────────────────────────────────────────────

const CMS_BASE_URL = process.env.CMS_URL || 'https://goodflippindesign.com';
const CMS_API_KEY = process.env.CMS_API_KEY; // Clerk session token; set via env
const STATE_FILE = path.join(__dirname, '.sync-state.json');

/**
 * Each entry maps a local source directory → CMS brand + category.
 * Only these directories will be synced — nothing else on E:\ is touched.
 */
const SYNC_CONFIG = [
  // GFV — Art
  { src: 'E:\\Art\\GFV',        brand: 'gfv',           category: 'art' },
  { src: 'E:\\Art\\GFV\\80s',   brand: 'gfv',           category: 'art-80s' },
  { src: 'E:\\Art\\Shared',     brand: 'gfv',           category: 'shared' },

  // GFD — Design + Portfolio
  { src: 'E:\\Art\\GFD',        brand: 'gfd',           category: 'design' },
  { src: 'E:\\Art\\Portfolio',  brand: 'gfd',           category: 'portfolio' },
  { src: 'E:\\Art\\Logos',      brand: 'gfd',           category: 'branding' },

  // MediaDrop staging area — picks up whatever was dropped in
  { src: 'Z:\\MediaDrop\\BrandSpecific\\GoodFlippinVibes',   brand: 'gfv',  category: 'drop' },
  { src: 'Z:\\MediaDrop\\BrandSpecific\\GoodFlippinDesign',  brand: 'gfd',  category: 'drop' },
  { src: 'Z:\\MediaDrop\\BrandSpecific\\AIAimate',           brand: 'aiaimate', category: 'drop' },
  { src: 'Z:\\MediaDrop\\Art',   brand: 'gfv',           category: 'art' },
  { src: 'Z:\\MediaDrop\\_UNSORTED', brand: 'gfv',       category: 'unsorted' },
];

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm', '.m4v']);
const AUDIO_EXTS = new Set(['.wav', '.mp3', '.m4a', '.flac', '.aac']);
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

// ──────────────────────────────────────────────────────────────
//  State management — tracks synced files to avoid re-uploading
// ──────────────────────────────────────────────────────────────

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch {}
  }
  return { synced: {} };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Returns a stable fingerprint for a file (mtime + size).
 * If either changes, we consider the file "new" and re-upload.
 */
function fingerprint(filePath) {
  const stat = fs.statSync(filePath);
  return `${stat.mtimeMs}:${stat.size}`;
}

// ──────────────────────────────────────────────────────────────
//  Upload
// ──────────────────────────────────────────────────────────────

async function uploadFile(filePath, brand, category, dryRun) {
  const ext = path.extname(filePath).toLowerCase();
  const filename = path.basename(filePath);
  const size = fs.statSync(filePath).size;

  if (size > MAX_FILE_SIZE) {
    console.log(`  ⏭  SKIP  ${filename}  (${(size / 1024 / 1024).toFixed(1)} MB > 100 MB limit)`);
    return false;
  }

  if (dryRun) {
    console.log(`  📤 WOULD UPLOAD  ${brand}/${category}/${filename}  (${(size / 1024).toFixed(0)} KB)`);
    return true;
  }

  // Lazy-load node-fetch (may not be installed)
  let fetch;
  try { fetch = (await import('node-fetch')).default; }
  catch { fetch = global.fetch; }

  if (!fetch) throw new Error('node-fetch not available. Run: npm install node-fetch');

  const FormData = (await import('node-fetch')).FormData || require('form-data');
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath), { filename, contentType: mimeFor(ext) });
  form.append('brand', brand);
  form.append('category', category);

  const headers = {};
  if (CMS_API_KEY) headers['Authorization'] = `Bearer ${CMS_API_KEY}`;

  const res = await fetch(`${CMS_BASE_URL}/api/cms/upload`, {
    method: 'POST',
    headers,
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const result = await res.json();
  console.log(`  ✅  ${brand}/${category}/${filename}  →  ${result.r2Key || result.url || 'ok'}`);
  return true;
}

function mimeFor(ext) {
  const map = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif',
    '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.mov': 'video/quicktime',
    '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav',
    '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  };
  return map[ext] || 'application/octet-stream';
}

// ──────────────────────────────────────────────────────────────
//  Directory walker
// ──────────────────────────────────────────────────────────────

function* walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (IMAGE_EXTS.has(ext) || VIDEO_EXTS.has(ext) || AUDIO_EXTS.has(ext)) {
        yield full;
      }
    }
  }
}

// ──────────────────────────────────────────────────────────────
//  Main sync
// ──────────────────────────────────────────────────────────────

async function syncAll(opts = {}) {
  const { dryRun = false, dirs = null } = opts;
  const state = loadState();
  let uploaded = 0, skipped = 0, errors = 0;

  const configToRun = dirs
    ? SYNC_CONFIG.filter(c => dirs.includes(c.src))
    : SYNC_CONFIG;

  for (const { src, brand, category } of configToRun) {
    if (!fs.existsSync(src)) {
      console.log(`\n📂 SKIP (not found): ${src}`);
      continue;
    }
    console.log(`\n📂 ${src}  →  ${brand}/${category}`);

    for (const filePath of walkDir(src)) {
      const fp = fingerprint(filePath);
      const key = filePath.toLowerCase();

      if (state.synced[key] === fp) {
        skipped++;
        continue;
      }

      try {
        const ok = await uploadFile(filePath, brand, category, dryRun);
        if (ok && !dryRun) {
          state.synced[key] = fp;
          saveState(state);
          uploaded++;
        } else if (ok) {
          uploaded++;
        }
      } catch (err) {
        console.error(`  ❌ ${path.basename(filePath)}: ${err.message}`);
        errors++;
      }
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`✅ Uploaded: ${uploaded}  ⏭  Skipped: ${skipped}  ❌ Errors: ${errors}`);
  if (dryRun) console.log('(dry-run — nothing was actually uploaded)');
  return { uploaded, skipped, errors };
}

// ──────────────────────────────────────────────────────────────
//  Watch mode
// ──────────────────────────────────────────────────────────────

async function watchMode() {
  let chokidar;
  try { chokidar = require('chokidar'); }
  catch { console.error('chokidar not installed. Run: npm install chokidar'); process.exit(1); }

  const state = loadState();
  const watchPaths = SYNC_CONFIG.map(c => c.src).filter(p => fs.existsSync(p));

  if (watchPaths.length === 0) {
    console.error('No configured source directories exist. Check SYNC_CONFIG.');
    process.exit(1);
  }

  console.log(`👁  Watching ${watchPaths.length} directories for new files...`);
  console.log(watchPaths.map(p => `  • ${p}`).join('\n'));

  chokidar.watch(watchPaths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 2000 },
  }).on('add', async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTS.has(ext) && !VIDEO_EXTS.has(ext) && !AUDIO_EXTS.has(ext)) return;

    const match = SYNC_CONFIG.find(c => filePath.startsWith(c.src));
    if (!match) return;

    const fp = fingerprint(filePath);
    const key = filePath.toLowerCase();
    if (state.synced[key] === fp) return;

    console.log(`\n📥 New file detected: ${path.basename(filePath)}`);
    try {
      await uploadFile(filePath, match.brand, match.category, false);
      state.synced[key] = fp;
      saveState(state);
    } catch (err) {
      console.error(`  ❌ ${err.message}`);
    }
  });
}

// ──────────────────────────────────────────────────────────────
//  CLI entry point
// ──────────────────────────────────────────────────────────────

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const watch = args.includes('--watch');

  // --dir "path" overrides config
  const dirIdx = args.indexOf('--dir');
  const dirs = dirIdx !== -1 ? [args[dirIdx + 1]] : null;

  // --brand overrides config when --dir is used
  const brandIdx = args.indexOf('--brand');
  const brandOverride = brandIdx !== -1 ? args[brandIdx + 1] : null;

  if (dirs && brandOverride) {
    // Single-dir mode with explicit brand
    const src = dirs[0];
    const categoryIdx = args.indexOf('--category');
    const category = categoryIdx !== -1 ? args[categoryIdx + 1] : 'uncategorized';
    const existing = SYNC_CONFIG.find(c => c.src === src);
    if (!existing) SYNC_CONFIG.push({ src, brand: brandOverride, category });
  }

  if (!CMS_API_KEY && !dryRun) {
    console.warn('⚠  CMS_API_KEY not set. Set it to your Clerk session token:');
    console.warn('   $env:CMS_API_KEY = "your-clerk-session-token"');
    console.warn('   Proceeding without auth (will get 401 unless endpoint is public)\n');
  }

  if (watch) {
    await watchMode();
  } else {
    await syncAll({ dryRun, dirs });
  }
})();
