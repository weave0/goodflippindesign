#!/usr/bin/env node
/**
 * sync-to-r2.js — Syncs local media files to Cloudflare R2 + D1 asset registry
 *
 * Usage:
 *   node scripts/sync-to-r2.js                       # Sync all enabled sources
 *   node scripts/sync-to-r2.js --source mediadrop     # Sync specific source by id
 *   node scripts/sync-to-r2.js --brand gfv            # Only sync GFV assets
 *   node scripts/sync-to-r2.js --dry-run              # Preview without uploading
 *   node scripts/sync-to-r2.js --reset                # Clear sync manifest (re-sync all)
 *   node scripts/sync-to-r2.js --status               # Show sync statistics
 *
 * Prerequisites:
 *   - wrangler CLI authenticated (`wrangler login`)
 *   - R2 bucket "gfv-media" exists (`wrangler r2 bucket create gfv-media`)
 *   - D1 database with cms_assets table
 *
 * This script:
 *   1. Scans configured source directories for media files
 *   2. Filters to new/unprocessed files (via sync manifest)
 *   3. Uploads each file to R2 via wrangler CLI
 *   4. Registers metadata in D1 via direct SQL (wrangler d1 execute)
 *   5. Updates local sync manifest
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Config ──────────────────────────────────────────────────────
const CONFIG_PATH = path.resolve(__dirname, '..', 'sync-config.json');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.gif', '.bmp', '.tiff']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v']);
const AUDIO_EXTENSIONS = new Set(['.wav', '.mp3', '.m4a', '.flac', '.aac', '.ogg']);
const DESIGN_EXTENSIONS = new Set(['.psd', '.ai', '.fig', '.sketch', '.xd', '.indd']);

const MIME_MAP = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.m4v': 'video/mp4',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  '.flac': 'audio/flac', '.aac': 'audio/aac', '.ogg': 'audio/ogg',
};

// ── Helpers ─────────────────────────────────────────────────────

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`Config not found: ${CONFIG_PATH}`);
    console.error('Create sync-config.json in project root. See MEDIA_PLATFORM_ARCHITECTURE.md');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function getAssetType(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (DESIGN_EXTENSIONS.has(ext)) return 'design';
  return 'other';
}

function inferBrand(relativePath, sourceConfig) {
  if (sourceConfig.brand) return sourceConfig.brand;

  const parts = relativePath.split(path.sep);

  // BrandSpecific/<BrandName>/... → mapped slug
  if (parts[0] === 'BrandSpecific' && parts.length > 1) {
    const brandMap = {
      GoodFlippinVibes: 'gfv',
      GoodFlippinDesign: 'gfd',
      CultureSherpa: 'culturesherpa',
      CitizenApproved: 'citizenapproved',
      AIAimate: 'aiaimate',
    };
    return brandMap[parts[1]] || 'unknown';
  }

  // GFV art categories
  const gfvCategories = [
    '80s Ideas', 'Abstract', 'Badges', 'Cats of Instagram', 'Characters',
    'Comedy', 'Film Club', 'Luminous', 'Mascot', 'Olympics', 'Oscars',
  ];
  if (gfvCategories.some(c => parts[0].startsWith(c))) return 'gfv';
  if (parts[0].startsWith('Portfolio')) return 'gfd';
  if (parts[0].startsWith('Brand')) return 'all';
  return 'all';
}

function inferCategory(relativePath, sourceConfig) {
  if (sourceConfig.category) return sourceConfig.category;
  const parts = relativePath.split(path.sep);
  // Strip descriptions after " — "
  const folder = parts[0].split(' — ')[0].trim();
  return folder.toLowerCase().replace(/\s+/g, '-');
}

function computeFileHash(filePath) {
  const hash = crypto.createHash('sha256');
  const data = fs.readFileSync(filePath);
  hash.update(data);
  return hash.digest('hex');
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').toLowerCase();
}

function loadManifest(manifestPath) {
  if (fs.existsSync(manifestPath)) {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  }
  return {
    version: 2,
    lastSync: null,
    synced: {},     // { relativePath: { r2Key, assetId, hash, syncedAt } }
    errors: [],
    stats: { total: 0, uploaded: 0, skipped: 0, failed: 0 },
  };
}

function saveManifest(manifest, manifestPath) {
  manifest.lastSync = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
}

function scanSource(sourceConfig, excludePatterns) {
  const results = [];
  const basePath = sourceConfig.path;

  if (!fs.existsSync(basePath)) {
    console.warn(`  ⚠ Source path not found: ${basePath}`);
    return results;
  }

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'README.md') continue;

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory() && sourceConfig.recursive !== false) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();

        // Check exclusion patterns
        if (excludePatterns.some(p => {
          if (p.startsWith('*.')) return ext === p.slice(1);
          return entry.name === p;
        })) continue;

        const assetType = getAssetType(ext);
        if (assetType === 'other' || assetType === 'design') continue;

        const relativePath = path.relative(basePath, fullPath);
        const stat = fs.statSync(fullPath);

        results.push({
          filename: entry.name,
          fullPath,
          relativePath,
          ext,
          assetType,
          mimeType: MIME_MAP[ext] || 'application/octet-stream',
          brand: inferBrand(relativePath, sourceConfig),
          category: inferCategory(relativePath, sourceConfig),
          sizeBytes: stat.size,
          sizeMB: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
          modified: stat.mtime.toISOString(),
          sourceId: sourceConfig.id,
        });
      }
    }
  }

  walk(basePath);
  return results;
}

// ── R2 Upload via Wrangler CLI ──────────────────────────────────

/**
 * Stable asset ID — deterministic from source+path so re-runs never create duplicate D1 rows.
 */
function makeAssetId(sourceId, relativePath) {
  return 'asset_' + crypto.createHash('sha256').update(`${sourceId}:${relativePath}`).digest('hex').slice(0, 16);
}

/**
 * Stable R2 key — no timestamp so re-uploads land at the same object path (idempotent).
 */
function makeR2Key(brand, category, filename) {
  return `${brand}/${category}/${sanitizeFilename(filename)}`;
}

function uploadToR2(filePath, r2Key, bucketName) {
  // Use spawn-style escaping: pass file path as a separate argument to avoid shell quoting issues
  const cmd = `npx wrangler r2 object put "${bucketName}/${r2Key}" --file="${filePath.replace(/\\/g, '/')}" --content-type "${MIME_MAP[path.extname(filePath).toLowerCase()] || 'application/octet-stream'}"`;
  try {
    execSync(cmd, { stdio: 'pipe', timeout: 120000 });
  } catch (e) {
    const detail = (e.stderr || e.stdout || e.message || '').toString().slice(0, 300);
    throw new Error(`R2 upload failed: ${detail}`);
  }
}

function registerInD1(asset, r2Key, assetId, contentHash, databaseName) {
  const now = new Date().toISOString();
  const tags = JSON.stringify([asset.category, asset.brand]);

  // Escape single quotes in title for SQL
  const safeTitle = asset.filename.replace(/'/g, "''");
  const safeSrcPath = asset.fullPath.replace(/\\/g, '/').replace(/'/g, "''");

  const sql = `INSERT OR IGNORE INTO cms_assets (id, brand, category, title, file_path, media_type, mime_type, file_size, source_type, source_path, content_hash, uploaded_by, created_at, updated_at, tags) VALUES ('${assetId}', '${asset.brand}', '${asset.category}', '${safeTitle}', '${r2Key}', '${asset.assetType}', '${asset.mimeType}', ${asset.sizeBytes}, 'local_sync', '${safeSrcPath}', '${contentHash}', 'sync-agent', '${now}', '${now}', '${tags}')`;

  try {
    execSync(`npx wrangler d1 execute "${databaseName}" --remote --command "${sql.replace(/"/g, '\\"')}"`, {
      stdio: 'pipe',
      timeout: 30000,
    });
    return assetId;
  } catch (e) {
    // If source_type column doesn't exist yet, retry without it
    const fallbackSql = `INSERT OR IGNORE INTO cms_assets (id, brand, category, title, file_path, media_type, mime_type, file_size, uploaded_by, created_at, updated_at, tags) VALUES ('${assetId}', '${asset.brand}', '${asset.category}', '${safeTitle}', '${r2Key}', '${asset.assetType}', '${asset.mimeType}', ${asset.sizeBytes}, 'sync-agent', '${now}', '${now}', '${tags}')`;
    try {
      execSync(`npx wrangler d1 execute "${databaseName}" --remote --command "${fallbackSql.replace(/"/g, '\\"')}"`, {
        stdio: 'pipe',
        timeout: 30000,
      });
    } catch (e2) {
      const detail = (e2.stderr || e2.stdout || e2.message || '').toString().slice(0, 300);
      throw new Error(`D1 insert failed: ${detail}`);
    }
    return assetId;
  }
}

// ── Main ────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const reset = args.includes('--reset');
  const statusOnly = args.includes('--status');
  const sourceFilter = args.find((a, i) => args[i - 1] === '--source');
  const brandFilter = args.find((a, i) => args[i - 1] === '--brand');

  const config = loadConfig();
  const manifestPath = config.manifestPath || path.join(config.sources[0]?.path || '.', '.sync-manifest.json');

  if (reset) {
    if (fs.existsSync(manifestPath)) {
      fs.unlinkSync(manifestPath);
      console.log('✓ Sync manifest cleared. Next sync will process all files.');
    }
    return;
  }

  const manifest = loadManifest(manifestPath);

  if (statusOnly) {
    console.log('=== SYNC STATUS ===\n');
    console.log(`Last sync: ${manifest.lastSync || 'never'}`);
    console.log(`Total synced: ${Object.keys(manifest.synced).length} files`);
    console.log(`Stats: ${JSON.stringify(manifest.stats, null, 2)}`);
    if (manifest.errors.length > 0) {
      console.log(`\nRecent errors (${manifest.errors.length}):`);
      manifest.errors.slice(-10).forEach(e => console.log(`  ✗ ${e.file}: ${e.error}`));
    }
    return;
  }

  // Filter sources
  let sources = config.sources.filter(s => s.enabled !== false);
  if (sourceFilter) {
    sources = sources.filter(s => s.id === sourceFilter);
    if (sources.length === 0) {
      console.error(`Source "${sourceFilter}" not found or disabled.`);
      console.error(`Available: ${config.sources.map(s => `${s.id} (${s.enabled !== false ? 'enabled' : 'disabled'})`).join(', ')}`);
      process.exit(1);
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('  WEAVE MEDIA PLATFORM — Local → R2 Sync');
  console.log(`${'='.repeat(60)}\n`);
  if (dryRun) console.log('  ⚡ DRY RUN — no files will be uploaded\n');

  let totalNew = 0;
  let totalUploaded = 0;
  let totalSkipped = 0;
  let totalFailed = 0;

  for (const source of sources) {
    console.log(`\n📂 Scanning: ${source.path} (${source.id})`);

    const assets = scanSource(source, config.exclude || []);
    console.log(`   Found ${assets.length} media files`);

    // Filter by brand if specified
    const filtered = brandFilter ? assets.filter(a => a.brand === brandFilter) : assets;

    // Filter to new/unsynced files
    const newAssets = filtered.filter(a => {
      const key = `${source.id}:${a.relativePath}`;
      const existing = manifest.synced[key];
      if (!existing) return true;
      // Re-sync if file was modified after last sync
      return new Date(a.modified) > new Date(existing.syncedAt);
    });

    console.log(`   New/modified: ${newAssets.length} files`);
    totalNew += newAssets.length;

    if (newAssets.length === 0) continue;

    // Check file sizes
    const oversized = newAssets.filter(a => a.sizeMB > (config.maxFileSizeMB || 50));
    if (oversized.length > 0) {
      console.log(`   ⚠ Skipping ${oversized.length} files over ${config.maxFileSizeMB || 50}MB`);
    }

    const toSync = newAssets.filter(a => a.sizeMB <= (config.maxFileSizeMB || 50));

    for (const asset of toSync) {
      const r2Key = makeR2Key(asset.brand, asset.category, asset.filename);
      const assetId = makeAssetId(source.id, asset.relativePath);
      const manifestKey = `${source.id}:${asset.relativePath}`;

      if (dryRun) {
        console.log(`   → [DRY] ${asset.relativePath} → R2:${r2Key} (${asset.sizeMB}MB, ${asset.brand})`);
        totalSkipped++;
        continue;
      }

      try {
        process.stdout.write(`   ↑ ${asset.relativePath} (${asset.sizeMB}MB)... `);

        // Compute content hash for deduplication
        const contentHash = computeFileHash(asset.fullPath);

        // Upload to R2
        uploadToR2(asset.fullPath, r2Key, config.r2BucketName || 'gfv-media');

        // Register in D1 (stable assetId means INSERT OR IGNORE is safe on re-run)
        registerInD1(asset, r2Key, assetId, contentHash, 'gfd_community');

        // Update manifest + save incrementally so partial runs don't lose progress
        manifest.synced[manifestKey] = {
          r2Key,
          assetId,
          hash: contentHash,
          syncedAt: new Date().toISOString(),
          brand: asset.brand,
          category: asset.category,
          sizeBytes: asset.sizeBytes,
        };
        saveManifest(manifest, manifestPath); // incremental save

        console.log('✓');
        totalUploaded++;
      } catch (err) {
        console.log(`✗ ${err.message}`);
        manifest.errors.push({
          file: asset.relativePath,
          error: err.message,
          timestamp: new Date().toISOString(),
        });
        saveManifest(manifest, manifestPath); // save error entry too
        totalFailed++;
      }
    }
  }

  // Keep only last 100 errors
  if (manifest.errors.length > 100) {
    manifest.errors = manifest.errors.slice(-100);
  }

  manifest.stats = {
    total: Object.keys(manifest.synced).length,
    uploaded: totalUploaded,
    skipped: totalSkipped,
    failed: totalFailed,
    lastRun: new Date().toISOString(),
  };

  if (!dryRun) {
    saveManifest(manifest, manifestPath);
  }

  console.log(`\n${'─'.repeat(40)}`);
  console.log(`  New files found:  ${totalNew}`);
  console.log(`  Uploaded to R2:   ${totalUploaded}`);
  console.log(`  Skipped:          ${totalSkipped}`);
  console.log(`  Failed:           ${totalFailed}`);
  console.log(`  Total in registry: ${Object.keys(manifest.synced).length}`);
  console.log(`${'─'.repeat(40)}\n`);
}

main();
