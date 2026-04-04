#!/usr/bin/env node
/**
 * catalog-art.js — Inventory E: drive art assets and produce a curation-ready catalog.
 *
 * Usage:
 *   node scripts/catalog-art.js              # scan all sources
 *   node scripts/catalog-art.js --brand gfv  # scan one brand
 *   node scripts/catalog-art.js --import sheriff,posters  # import specific series to R2
 *
 * Outputs: art-catalog.json (persistent inventory with curation flags)
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CATALOG_PATH = path.resolve(__dirname, '..', 'art-catalog.json');

// ── Source definitions ───────────────────────────────────────────────
// Each source maps a local folder to brand + series metadata.
// series are auto-discovered from top-level subdirectories.
const SOURCES = [
  {
    brand: 'gfv',
    root: 'E:\\art\\GFV',
    description: 'Good Flippin Vibes — original AI art series',
    seriesOverrides: {
      // Manually tag series with purpose/readiness
      'Sheriff':            { social: true,  gallery: true,  description: '60 character illustrations — social-ready' },
      'art/luminous':       { social: true,  gallery: true,  description: 'Luminous neon/glow art — brand signature' },
      'art/mascot':         { social: true,  gallery: true,  description: 'Brand mascot variations' },
      'Posters':            { social: true,  gallery: true,  description: 'Movie/show poster art' },
      'Oscars':             { social: true,  gallery: false, description: 'Oscar-themed art — seasonal' },
      'Street Life':        { social: true,  gallery: true,  description: 'Street culture illustrations' },
      'Paddy Dill':         { social: true,  gallery: true,  description: 'Character series with audio/video' },
      'Zebra':              { social: true,  gallery: true,  description: 'Zebra character art' },
      'Chill Bee\'s':       { social: true,  gallery: false, description: '7 chill bee illustrations' },
      'PIckleFish':         { social: true,  gallery: false, description: 'PickleFish character art with video' },
      'Flippin Rocky':      { social: true,  gallery: false, description: 'Rocky-themed art with video' },
      'Wii Todd':           { social: true,  gallery: false, description: 'Character series with video/audio' },
      '80s Ideas That Didn\'t': { social: true, gallery: false, description: '80s retro concept art' },
      'Irivine':            { social: false, gallery: false, description: '4 images — assess for relevance' },
      'Right\'s Dispute':   { social: false, gallery: false, description: '4 small images — likely archival' },
      'Logo':               { social: false, gallery: false, description: 'Empty folder' },
      'art/abstract':       { social: true,  gallery: true,  description: 'Abstract art — good for backgrounds' },
      'art/artts':          { social: false, gallery: false, description: 'Unclear purpose — review manually' },
      'art/comedy':         { social: true,  gallery: false, description: 'Comedy-themed art' },
      'art/video-assets':   { social: false, gallery: false, description: 'Video production assets — not standalone' },
    }
  },
  {
    brand: 'gfd',
    root: 'E:\\art\\GFD',
    description: 'Good Flippin Design — consultancy brand assets'
  },
  {
    brand: 'aiaimate',
    root: 'E:\\art\\AIAIMate',
    description: 'AI Aimate — brand assets'
  },
  {
    brand: 'citizenapproved',
    root: 'E:\\art\\CitizenApproved',
    description: 'CitizenApproved — brand assets'
  }
];

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif']);
const VIDEO_EXTS = new Set(['.mp4', '.mov', '.avi', '.mkv', '.webm']);
const AUDIO_EXTS = new Set(['.mp3', '.wav', '.flac', '.ogg']);
const EXCLUDE = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);

function scanDirectory(dirPath, depth = 0) {
  if (!fs.existsSync(dirPath)) return null;

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];
  const subdirs = [];

  for (const entry of entries) {
    if (EXCLUDE.has(entry.name.toLowerCase())) continue;
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      const stat = fs.statSync(fullPath);
      let type = 'other';
      if (IMAGE_EXTS.has(ext)) type = 'image';
      else if (VIDEO_EXTS.has(ext)) type = 'video';
      else if (AUDIO_EXTS.has(ext)) type = 'audio';

      files.push({
        name: entry.name,
        ext,
        type,
        sizeKB: Math.round(stat.size / 1024),
        path: fullPath
      });
    } else if (entry.isDirectory() && depth < 2) {
      subdirs.push({ name: entry.name, path: fullPath });
    }
  }

  return { files, subdirs };
}

function catalogSource(source) {
  const { brand, root, description, seriesOverrides = {} } = source;

  if (!fs.existsSync(root)) {
    return { brand, root, description, available: false, series: [] };
  }

  const scan = scanDirectory(root);
  const series = [];

  // Root-level files (non-series)
  const rootImages = scan.files.filter(f => f.type === 'image');
  if (rootImages.length > 0) {
    series.push({
      name: '(root)',
      path: root,
      images: rootImages.length,
      videos: scan.files.filter(f => f.type === 'video').length,
      audio: scan.files.filter(f => f.type === 'audio').length,
      totalSizeMB: Math.round(scan.files.reduce((s, f) => s + f.sizeKB, 0) / 1024 * 10) / 10,
      sampleFiles: rootImages.slice(0, 3).map(f => f.name),
      ...(seriesOverrides['(root)'] || { social: false, gallery: false, description: 'Root-level files' })
    });
  }

  // Each subdirectory is a potential series
  for (const subdir of scan.subdirs) {
    const subscan = scanDirectory(subdir.path, 1);
    if (!subscan) continue;

    // Include nested subdirs (e.g., art/luminous)
    for (const nested of subscan.subdirs) {
      const nestedScan = scanDirectory(nested.path, 2);
      if (nestedScan) {
        // Create sub-series entry
        const nestedKey = subdir.name + '/' + nested.name;
        const nestedImages = nestedScan.files.filter(f => f.type === 'image');
        if (nestedImages.length > 0 || nestedScan.files.filter(f => f.type === 'video').length > 0) {
          const override = seriesOverrides[nestedKey] || {};
          series.push({
            name: nestedKey,
            path: nested.path,
            images: nestedImages.length,
            videos: nestedScan.files.filter(f => f.type === 'video').length,
            audio: nestedScan.files.filter(f => f.type === 'audio').length,
            totalSizeMB: Math.round(nestedScan.files.reduce((s, f) => s + f.sizeKB, 0) / 1024 * 10) / 10,
            sampleFiles: nestedImages.slice(0, 3).map(f => f.name),
            social: override.social ?? null,
            gallery: override.gallery ?? null,
            description: override.description || ''
          });
        }
      }
    }

    // Top-level series entry (direct files in this subdir only)
    const directImages = subscan.files.filter(f => f.type === 'image');
    const directVideos = subscan.files.filter(f => f.type === 'video');
    const directAudio = subscan.files.filter(f => f.type === 'audio');

    if (directImages.length > 0 || directVideos.length > 0) {
      const override = seriesOverrides[subdir.name] || {};
      series.push({
        name: subdir.name,
        path: subdir.path,
        images: directImages.length,
        videos: directVideos.length,
        audio: directAudio.length,
        totalSizeMB: Math.round(subscan.files.reduce((s, f) => s + f.sizeKB, 0) / 1024 * 10) / 10,
        sampleFiles: directImages.slice(0, 3).map(f => f.name),
        social: override.social ?? null,
        gallery: override.gallery ?? null,
        description: override.description || ''
      });
    }
  }

  // Sort: social-ready first, then by image count desc
  series.sort((a, b) => {
    if (a.social && !b.social) return -1;
    if (!a.social && b.social) return 1;
    return b.images - a.images;
  });

  const totalImages = series.reduce((s, sr) => s + sr.images, 0);
  const totalVideos = series.reduce((s, sr) => s + sr.videos, 0);
  const totalSizeMB = Math.round(series.reduce((s, sr) => s + sr.totalSizeMB, 0) * 10) / 10;

  return {
    brand,
    root,
    description,
    available: true,
    totalImages,
    totalVideos,
    totalSizeMB,
    seriesCount: series.length,
    series
  };
}

function printSummary(catalog) {
  console.log('\n' + '='.repeat(70));
  console.log('  ART CATALOG — E: Drive Inventory');
  console.log('='.repeat(70));

  for (const source of catalog.sources) {
    console.log(`\n── ${source.brand.toUpperCase()} ──────────────────────────────`);
    if (!source.available) {
      console.log('  ⚠  Path not found: ' + source.root);
      continue;
    }
    console.log(`  ${source.description}`);
    console.log(`  ${source.totalImages} images, ${source.totalVideos} videos, ${source.totalSizeMB}MB total`);
    console.log(`  ${source.seriesCount} series\n`);

    for (const s of source.series) {
      const flags = [
        s.social ? '✓social' : '',
        s.gallery ? '✓gallery' : '',
        s.social === false && s.gallery === false ? '⊘skip' : '',
        s.social === null ? '?untagged' : ''
      ].filter(Boolean).join(' ');

      console.log(`  ${s.name.padEnd(25)} ${String(s.images).padStart(3)} img  ${String(s.videos).padStart(2)} vid  ${String(s.totalSizeMB).padStart(7)}MB  [${flags}]`);
      if (s.description) console.log(`    → ${s.description}`);
    }
  }

  const socialReady = catalog.sources.flatMap(s => s.series || []).filter(s => s.social);
  const totalSocialImages = socialReady.reduce((s, sr) => s + sr.images, 0);
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  Social-ready: ${socialReady.length} series, ${totalSocialImages} images`);
  console.log(`  Saved to: ${CATALOG_PATH}`);
  console.log('─'.repeat(70) + '\n');
}

// ── Main ─────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const brandFilter = args.includes('--brand') ? args[args.indexOf('--brand') + 1] : null;

const sources = brandFilter
  ? SOURCES.filter(s => s.brand === brandFilter)
  : SOURCES;

if (sources.length === 0) {
  console.error(`No source found for brand: ${brandFilter}`);
  process.exit(1);
}

const catalog = {
  generatedAt: new Date().toISOString(),
  sources: sources.map(catalogSource)
};

fs.writeFileSync(CATALOG_PATH, JSON.stringify(catalog, null, 2));
printSummary(catalog);
