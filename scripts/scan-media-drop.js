#!/usr/bin/env node
/**
 * scan-media-drop.js — Scans Z:\MediaDrop for new/unprocessed assets
 *
 * Usage:
 *   node scripts/scan-media-drop.js          # Scan and report
 *   node scripts/scan-media-drop.js --json   # Output JSON manifest
 *   node scripts/scan-media-drop.js --watch  # Watch for new files
 *   node scripts/scan-media-drop.js --no-manifest # Do not write .media-manifest.json
 *
 * This is the universal asset detection script for the Weave Media Platform.
 * It scans all MediaDrop directories and reports new files, categorized by type and brand.
 *
 * It maintains a lightweight local manifest at Z:\MediaDrop\.media-manifest.json.
 * By default, every scan marks currently discovered assets as "seen" (stored in `processed`)
 * so subsequent scans only report newly added files.
 */

const fs = require("fs");
const path = require("path");

const MEDIA_DROP = "Z:\\MediaDrop";

const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".svg",
  ".gif",
  ".bmp",
  ".tiff",
]);
const VIDEO_EXTENSIONS = new Set([
  ".mp4",
  ".mov",
  ".webm",
  ".avi",
  ".mkv",
  ".m4v",
]);
const AUDIO_EXTENSIONS = new Set([
  ".wav",
  ".mp3",
  ".m4a",
  ".flac",
  ".aac",
  ".ogg",
]);
const DESIGN_EXTENSIONS = new Set([
  ".psd",
  ".ai",
  ".fig",
  ".sketch",
  ".xd",
  ".indd",
]);

const MANIFEST_PATH = path.join(MEDIA_DROP, ".media-manifest.json");

function getAssetType(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return "image";
  if (VIDEO_EXTENSIONS.has(ext)) return "video";
  if (AUDIO_EXTENSIONS.has(ext)) return "audio";
  if (DESIGN_EXTENSIONS.has(ext)) return "design";
  return "other";
}

function inferBrand(relativePath) {
  const parts = relativePath.split(path.sep);
  if (parts[0] === "BrandSpecific" && parts.length > 1) {
    const brandMap = {
      GoodFlippinVibes: "gfv",
      GoodFlippinDesign: "gfd",
      CultureSherpa: "culturesherpa",
      CitizenApproved: "citizenapproved",
      AIAimate: "aiaimate",
    };
    return brandMap[parts[1]] || "unknown";
  }
  // GFV-specific art categories
  const gfvCategories = [
    "80s Ideas",
    "Abstract",
    "Badges",
    "Cats of Instagram",
    "Characters",
    "Comedy",
    "Film Club",
    "Luminous",
    "Mascot",
    "Olympics",
    "Oscars",
  ];
  if (gfvCategories.some((c) => parts[0].startsWith(c))) return "gfv";
  if (parts[0].startsWith("Portfolio")) return "gfd";
  return "all"; // shared across brands
}

function inferCategory(relativePath) {
  const parts = relativePath.split(path.sep);
  // Skip special characters in folder names (descriptions after " — ")
  const folder = parts[0].split(" — ")[0].trim();
  return folder.toLowerCase().replace(/\s+/g, "-");
}

function scanDirectory(dir, baseDir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, baseDir));
    } else if (entry.isFile()) {
      // Skip hidden files and the manifest itself
      if (entry.name.startsWith(".") || entry.name === "README.md") continue;

      const ext = path.extname(entry.name).toLowerCase();
      const assetType = getAssetType(ext);
      if (assetType === "other") continue; // Skip non-media files

      const relativePath = path.relative(baseDir, fullPath);
      const stat = fs.statSync(fullPath);

      results.push({
        filename: entry.name,
        path: fullPath,
        relativePath,
        extension: ext,
        assetType,
        brand: inferBrand(relativePath),
        category: inferCategory(relativePath),
        sizeBytes: stat.size,
        sizeMB: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
      });
    }
  }
  return results;
}

function loadManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
    return JSON.parse(raw);
  }
  return { version: 1, processed: [], lastScan: null, totalAssets: 0 };
}

function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes("--json");
  const watchMode = args.includes("--watch");
  const noManifestWrite = args.includes("--no-manifest");

  if (!fs.existsSync(MEDIA_DROP)) {
    console.error(`MediaDrop directory not found: ${MEDIA_DROP}`);
    process.exit(1);
  }

  if (!jsonOutput) {
    console.log("Scanning Z:\\MediaDrop...\n");
  }

  const assets = scanDirectory(MEDIA_DROP, MEDIA_DROP);
  const manifest = loadManifest();
  const processedPaths = new Set(
    Array.isArray(manifest.processed) ? manifest.processed : [],
  );
  const newAssets = assets.filter((a) => !processedPaths.has(a.relativePath));

  // Summary by type
  const byType = {};
  const byBrand = {};
  for (const asset of assets) {
    byType[asset.assetType] = (byType[asset.assetType] || 0) + 1;
    byBrand[asset.brand] = (byBrand[asset.brand] || 0) + 1;
  }

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          scanDate: new Date().toISOString(),
          totalAssets: assets.length,
          newAssets: newAssets.length,
          byType,
          byBrand,
          assets,
        },
        null,
        2,
      ),
    );
  } else {
    // Human-readable output
    console.log("=== MEDIA DROP SCAN RESULTS ===\n");
    console.log(`Total assets found: ${assets.length}`);
    console.log(`New (unprocessed):  ${newAssets.length}\n`);

    console.log("By Type:");
    for (const [type, count] of Object.entries(byType)) {
      console.log(`  ${type.padEnd(10)} ${count}`);
    }

    console.log("\nBy Brand:");
    for (const [brand, count] of Object.entries(byBrand)) {
      console.log(`  ${brand.padEnd(20)} ${count}`);
    }

    if (newAssets.length > 0) {
      console.log(`\n--- NEW ASSETS (${newAssets.length}) ---\n`);
      for (const asset of newAssets.slice(0, 50)) {
        console.log(
          `  [${asset.assetType}] ${asset.relativePath} (${asset.sizeMB}MB, ${asset.brand})`,
        );
      }
      if (newAssets.length > 50) {
        console.log(`  ... and ${newAssets.length - 50} more`);
      }
    } else {
      console.log("\nNo new assets detected since last scan.");
    }
  }

  // Update manifest (tracks what's been seen so next scan reports only new files)
  if (!noManifestWrite) {
    const previouslyProcessed = Array.isArray(manifest.processed)
      ? manifest.processed
      : [];
    const seenNow = assets.map((a) => a.relativePath);

    manifest.version = manifest.version || 1;
    manifest.lastScan = new Date().toISOString();
    manifest.totalAssets = assets.length;
    manifest.processed = Array.from(
      new Set([...previouslyProcessed, ...seenNow]),
    ).sort((a, b) => String(a).localeCompare(String(b)));

    saveManifest(manifest);
  }

  if (watchMode) {
    console.log("\nWatching for new files... (Ctrl+C to stop)\n");
    fs.watch(MEDIA_DROP, { recursive: true }, (eventType, filename) => {
      if (!filename || filename.startsWith(".") || filename === "README.md")
        return;
      const ext = path.extname(filename).toLowerCase();
      const type = getAssetType(ext);
      if (type === "other") return;
      console.log(
        `[${new Date().toLocaleTimeString()}] ${eventType}: ${filename} (${type})`,
      );
    });
  }
}

main();
