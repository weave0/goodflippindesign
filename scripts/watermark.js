#!/usr/bin/env node
/**
 * scripts/watermark.js — Batch image watermarker using Sharp
 *
 * Applies a brand logo/text watermark to images before uploading to R2.
 * Supports: opacity, position, scale, padding, multi-brand configs.
 *
 * Usage:
 *   node scripts/watermark.js --input "Z:\MediaDrop\Art\Illustration\art.png" --brand gfv
 *   node scripts/watermark.js --input "Z:\MediaDrop\Art\" --brand gfv --batch
 *   node scripts/watermark.js --input file.png --brand gfv --platforms instagram,x,linkedin
 *
 * Requires: npm install sharp (already in package.json)
 * Output: {input-name}-watermarked-{format}.jpg (next to original, or in --output dir)
 */

'use strict';

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// ────────────────────────────────────────────────────────────
//   Platform specs (must stay in sync with social-publisher.js)
// ────────────────────────────────────────────────────────────

const PLATFORM_SPECS = {
  instagram: { square: [1080, 1080], portrait: [1080, 1350], landscape: [1080, 566], story: [1080, 1920] },
  facebook:  { feed: [1200, 628],    square: [1080, 1080],   story: [1080, 1920] },
  x:         { landscape: [1200, 675], square: [1080, 1080] },
  linkedin:  { landscape: [1200, 627], square: [1080, 1080], portrait: [627, 1200] },
  pinterest: { standard: [1000, 1500], square: [1000, 1000], tall: [1000, 2100] },
  tiktok:    { reel: [1080, 1920] },
  youtube:   { thumbnail: [1280, 720] },
};

const DEFAULT_FORMATS = {
  instagram: 'square',
  facebook:  'feed',
  x:         'landscape',
  linkedin:  'landscape',
  pinterest: 'standard',
  tiktok:    'reel',
  youtube:   'thumbnail',
};

// ────────────────────────────────────────────────────────────
//   Brand watermark configs
//   logo_path: path relative to this script's location (../assets/...)
//   position:  northwest|north|northeast|west|center|east|southwest|south|southeast
//   opacity:   0.0–1.0
//   scale:     fraction of image width
// ────────────────────────────────────────────────────────────

const BRAND_CONFIGS = {
  gfv: {
    name: 'Good Flippin Vibes',
    logo_path: '../assets/brand/logo/gfv-logo-dark.svg',
    fallback_text: 'GFV',
    position: 'southeast',
    opacity: 0.65,
    scale: 0.12,      // logo width = 12% of image width
    padding: 24,      // px from edge
  },
  gfd: {
    name: 'Good Flippin Design',
    logo_path: '../assets/brand/logo/gfd-logo.svg',
    fallback_text: 'GFD',
    position: 'southeast',
    opacity: 0.65,
    scale: 0.12,
    padding: 24,
  },
  aiaimate: {
    name: 'AI Aimate',
    logo_path: '../assets/logos/aiaimate-logo.png',
    fallback_text: 'AIAimate',
    position: 'south',
    opacity: 0.55,
    scale: 0.14,
    padding: 32,
  },
  citizenapproved: {
    name: 'CitizenApproved',
    logo_path: '../assets/logos/citizenapproved/citizenapproved-logo.png',
    fallback_text: 'CitizenApproved',
    position: 'southeast',
    opacity: 0.60,
    scale: 0.15,
    padding: 24,
  },
  culturesherpa: {
    name: 'CultureSherpa',
    logo_path: '../assets/logos/culturesherpa-logo.png',
    fallback_text: 'CultureSherpa',
    position: 'southeast',
    opacity: 0.60,
    scale: 0.14,
    padding: 24,
  },
};

// ────────────────────────────────────────────────────────────
//   Build an SVG text watermark (fallback when no logo found)
// ────────────────────────────────────────────────────────────

function buildTextWatermarkSVG(text, fontSize = 36) {
  const w = text.length * (fontSize * 0.65) + 32;
  const h = fontSize + 24;
  return Buffer.from(`
    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <style>
        text {
          font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
          font-weight: 700;
          letter-spacing: 2px;
        }
      </style>
      <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        fill="white" font-size="${fontSize}" opacity="0.9">${text}</text>
    </svg>
  `);
}

// ────────────────────────────────────────────────────────────
//   Resolve gravity to Sharp composite gravity string
// ────────────────────────────────────────────────────────────

function gravityFromPosition(position) {
  const map = {
    northwest: 'northwest',
    north: 'north',
    northeast: 'northeast',
    west: 'west',
    center: 'center',
    east: 'east',
    southwest: 'southwest',
    south: 'south',
    southeast: 'southeast',
  };
  return map[position] || 'southeast';
}

// ────────────────────────────────────────────────────────────
//   Core watermark function
// ────────────────────────────────────────────────────────────

/**
 * Apply watermark overlay to a single image and resize for a target platform/format.
 * @param {string} inputPath - source image file
 * @param {string} outputPath - output file path
 * @param {string} brand - gfv|gfd|aiaimate|citizenapproved|culturesherpa
 * @param {[number,number]} targetSize - [width, height] in pixels
 * @param {object} [overrides] - override brand config values
 */
async function watermarkImage(inputPath, outputPath, brand, targetSize, overrides = {}) {
  const cfg = { ...(BRAND_CONFIGS[brand] || BRAND_CONFIGS.gfv), ...overrides };
  const [targetW, targetH] = targetSize;

  // Load and resize the source image (cover crop)
  const image = sharp(inputPath)
    .resize(targetW, targetH, {
      fit: 'cover',
      position: 'attention',   // smart crop using attention algorithm
    });

  // Get output metadata for sizing the watermark
  const meta = await sharp(inputPath).metadata();
  const srcW = meta.width || targetW;

  // Calculate watermark width as fraction of output width
  const wmWidth = Math.round(targetW * cfg.scale);

  // Load or generate the watermark overlay
  let wmBuffer;
  const logoAbsPath = path.resolve(__dirname, cfg.logo_path);

  if (cfg.logo_path && fs.existsSync(logoAbsPath)) {
    const ext = path.extname(logoAbsPath).toLowerCase();
    if (ext === '.svg') {
      // SVG: rasterize at target watermark width
      wmBuffer = await sharp(fs.readFileSync(logoAbsPath))
        .resize(wmWidth)
        .png()
        .toBuffer();
    } else {
      wmBuffer = await sharp(logoAbsPath)
        .resize(wmWidth)
        .png()
        .toBuffer();
    }
  } else {
    // Fallback: SVG text watermark
    const fontSize = Math.max(16, Math.round(wmWidth * 0.35));
    const svgBuf = buildTextWatermarkSVG(cfg.fallback_text || brand.toUpperCase(), fontSize);
    wmBuffer = await sharp(svgBuf).resize(wmWidth).png().toBuffer();
  }

  // Apply opacity by modulating alpha channel
  const wmWithAlpha = await sharp(wmBuffer)
    .ensureAlpha()
    .modulate({})
    .composite([{
      input: Buffer.from([0, 0, 0, Math.round(255 * cfg.opacity)]),
      raw: { width: 1, height: 1, channels: 4 },
      tile: true,
      blend: 'dest-in',
    }])
    .toBuffer();

  // Composite watermark onto resized image
  const gravity = gravityFromPosition(cfg.position);
  const result = await image
    .composite([{
      input: wmWithAlpha,
      gravity,
      blend: 'over',
    }])
    .jpeg({ quality: 92, progressive: true })
    .toFile(outputPath);

  return { outputPath, width: result.width, height: result.height };
}

// ────────────────────────────────────────────────────────────
//   Process a single file for one or more platforms
// ────────────────────────────────────────────────────────────

async function processFile(inputPath, brand, platforms, outputDir, options = {}) {
  const results = [];
  const basename = path.basename(inputPath, path.extname(inputPath));
  const outDir = outputDir || path.dirname(inputPath);

  for (const platform of platforms) {
    const formats = options.formats
      ? options.formats.split(',')
      : [DEFAULT_FORMATS[platform] || 'square'];

    for (const format of formats) {
      const spec = PLATFORM_SPECS[platform]?.[format];
      if (!spec) {
        console.warn(`  ⚠ Unknown format: ${platform}/${format} — skipping`);
        continue;
      }

      const outName = `${basename}-${platform}-${format}.jpg`;
      const outPath = path.join(outDir, outName);

      try {
        await watermarkImage(inputPath, outPath, brand, spec, options.watermarkOverrides || {});
        console.log(`  ✓ ${platform}/${format} → ${outPath} (${spec[0]}×${spec[1]})`);
        results.push({ platform, format, path: outPath, size: spec });
      } catch (err) {
        console.error(`  ✗ ${platform}/${format} → FAILED: ${err.message}`);
        results.push({ platform, format, error: err.message });
      }
    }
  }

  return results;
}

// ────────────────────────────────────────────────────────────
//   Batch directory processing
// ────────────────────────────────────────────────────────────

async function processBatch(inputDir, brand, platforms, outputDir) {
  const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tiff', '.bmp'];
  const files = fs.readdirSync(inputDir)
    .filter(f => IMAGE_EXTS.includes(path.extname(f).toLowerCase()))
    .map(f => path.join(inputDir, f));

  if (files.length === 0) {
    console.log('No image files found in directory');
    return;
  }

  console.log(`Processing ${files.length} images for brand: ${brand}`);
  for (const file of files) {
    console.log(`\nProcessing: ${path.basename(file)}`);
    await processFile(file, brand, platforms, outputDir);
  }
}

// ────────────────────────────────────────────────────────────
//   CLI entry point
// ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  const getArg = (flag, def = null) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] ? args[i + 1] : def;
  };
  const hasFlag = (flag) => args.includes(flag);

  const input = getArg('--input');
  const brand = getArg('--brand', 'gfv');
  const platformsArg = getArg('--platforms', 'instagram,facebook,x,linkedin');
  const outputDir = getArg('--output');
  const isBatch = hasFlag('--batch');
  const listBrands = hasFlag('--list-brands');
  const listPlatforms = hasFlag('--list-platforms');

  if (listBrands) {
    console.log('\nAvailable brands:');
    Object.entries(BRAND_CONFIGS).forEach(([k, v]) => console.log(`  ${k.padEnd(20)} — ${v.name}`));
    return;
  }

  if (listPlatforms) {
    console.log('\nAvailable platforms and formats:');
    Object.entries(PLATFORM_SPECS).forEach(([p, formats]) => {
      Object.entries(formats).forEach(([f, size]) => {
        console.log(`  ${p.padEnd(12)} ${f.padEnd(12)} — ${size[0]}×${size[1]}`);
      });
    });
    return;
  }

  if (!input) {
    console.log(`
watermark.js — Brand watermarker + platform resizer

Usage:
  node scripts/watermark.js --input <file_or_dir> --brand <brand> [options]

Options:
  --input      Path to image file or directory (required)
  --brand      Brand key: gfv|gfd|aiaimate|citizenapproved|culturesherpa (default: gfv)
  --platforms  Comma-separated platforms (default: instagram,facebook,x,linkedin)
  --output     Output directory (default: same as input)
  --batch      Process all images in input directory
  --list-brands    Show available brands
  --list-platforms Show all platform/format specs

Examples:
  node scripts/watermark.js --input art.png --brand gfv
  node scripts/watermark.js --input art.png --brand gfv --platforms instagram,x
  node scripts/watermark.js --input "Z:\\MediaDrop\\Art\\" --brand gfv --batch
`);
    return;
  }

  const platforms = platformsArg.split(',').map(p => p.trim().toLowerCase());

  // Validate
  const validBrands = Object.keys(BRAND_CONFIGS);
  if (!validBrands.includes(brand)) {
    console.error(`Unknown brand "${brand}". Valid: ${validBrands.join(', ')}`);
    process.exit(1);
  }

  const validPlatforms = Object.keys(PLATFORM_SPECS);
  const invalidPlatforms = platforms.filter(p => !validPlatforms.includes(p));
  if (invalidPlatforms.length > 0) {
    console.error(`Unknown platforms: ${invalidPlatforms.join(', ')}. Valid: ${validPlatforms.join(', ')}`);
    process.exit(1);
  }

  const exists = fs.existsSync(input);
  if (!exists) {
    console.error(`Input not found: ${input}`);
    process.exit(1);
  }

  const isDir = fs.statSync(input).isDirectory();

  if (isDir || isBatch) {
    await processBatch(isDir ? input : path.dirname(input), brand, platforms, outputDir);
  } else {
    console.log(`\nProcessing: ${path.basename(input)}`);
    await processFile(input, brand, platforms, outputDir);
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
