#!/usr/bin/env node
/**
 * r2-bulk-import.js
 * Bulk-upload GFV + CultureSherpa images to Cloudflare R2 (gfv-media bucket)
 * and seed cms_assets in D1 (gfd_community).
 *
 * Usage:
 *   node scripts/r2-bulk-import.js [--dry-run] [--source gfv|cs|all]
 *
 * Auth: uses wrangler OAuth (run `npx wrangler login` first if needed)
 */

const { execSync, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");

// ─── Config ────────────────────────────────────────────────────────────────
const BUCKET = "gfv-media";
const ACCOUNT_ID = "3253d907ea85a18eb442283d7308b193";
const DB_NAME = "gfd_community";
const CONCURRENCY = 20; // parallel API uploads
const R2_PREFIX = "cms/media";

// Cloudflare credentials (from wrangler config — no separate R2 keys needed)
const CF_TOKEN = (() => {
  try {
    const toml = fs.readFileSync(
      path.join(process.env.APPDATA, "xdg.config", ".wrangler", "config", "default.toml"),
      "utf8"
    );
    const m = toml.match(/oauth_token\s*=\s*"([^"]+)"/);
    return m ? m[1] : null;
  } catch { return null; }
})();

const DRY_RUN = process.argv.includes("--dry-run");
const SOURCE_ARG = process.argv.find((a) => a.startsWith("--source="));
const SOURCE = SOURCE_ARG ? SOURCE_ARG.split("=")[1] : "all";

// ─── Source dirs ────────────────────────────────────────────────────────────
const SOURCES = {
  gfv: {
    root: path.join(__dirname, "..", "GFD Dev Projects", "GFV", "website", "public"),
    includeDirs: ["art", "assets", "icons", "shared"], // skip admin + fonts
    brand: "gfv",
    category_fn: (rel) => {
      const parts = rel.split(path.sep);
      // parts[0] = includeDirs entry (e.g. "art"), parts[1] = subfolder category
      return parts.length > 2 ? `${parts[0]}/${parts[1]}` : parts[0] || "uncategorized";
    },
  },
  cs: {
    root: "S:\\cultural_images",
    includeDirs: null, // all subdirs
    brand: "culturesherpa",
    category_fn: (rel) => rel.split(path.sep)[0] || "cultural",
  },
};

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"]);

// ─── Helpers ────────────────────────────────────────────────────────────────
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function generateId(brand, relPath) {
  const hash = crypto.createHash("md5").update(relPath).digest("hex").slice(0, 8);
  const base = slugify(path.basename(relPath, path.extname(relPath)));
  return `${brand}-${base}-${hash}`.slice(0, 80);
}

function collectImages(sourceKey) {
  const src = SOURCES[sourceKey];
  if (!fs.existsSync(src.root)) {
    console.warn(`⚠ Source not found: ${src.root}`);
    return [];
  }

  const files = [];
  const walk = (dir, relBase) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.join(relBase, entry.name);
      if (entry.isDirectory()) {
        if (!src.includeDirs || src.includeDirs.includes(entry.name) || relBase !== "") {
          walk(full, rel);
        }
      } else if (IMAGE_EXTS.has(path.extname(entry.name).toLowerCase())) {
        files.push({ full, rel, brand: src.brand, category: src.category_fn(rel) });
      }
    }
  };

  if (src.includeDirs) {
    for (const dir of src.includeDirs) {
      const dirPath = path.join(src.root, dir);
      if (fs.existsSync(dirPath)) walk(dirPath, dir);
    }
  } else {
    walk(src.root, "");
  }
  return files;
}

// ─── Upload queue ─────────────────────────────────────────────────────────
async function uploadOne(file) {
  const ext = path.extname(file.full).toLowerCase();
  const assetId = generateId(file.brand, file.rel);
  const r2Key = `${R2_PREFIX}/${assetId}${ext}`;
  const mimeMap = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
    ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml",
  };
  const contentType = mimeMap[ext] || "application/octet-stream";

  if (DRY_RUN) {
    return { assetId, r2Key, file, ok: true, dry: true };
  }

  // Use Cloudflare REST API — no S3 keys needed, works with OAuth token
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${r2Key}`;
  try {
    const body = fs.readFileSync(file.full);
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CF_TOKEN}`,
        "Content-Type": contentType,
      },
      body,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { assetId, r2Key, file, ok: false, err: `HTTP ${res.status}: ${text.slice(0, 200)}` };
    }
    return { assetId, r2Key, file, ok: true };
  } catch (e) {
    return { assetId, r2Key, file, ok: false, err: e.message };
  }
}

async function runWithConcurrency(tasks, limit) {
  const results = [];
  const queue = [...tasks];
  const workers = [];
  let completed = 0;
  const total = tasks.length;
  const start = Date.now();

  const worker = async () => {
    while (queue.length) {
      const task = queue.shift();
      if (!task) break;
      const result = await task();
      results.push(result);
      completed++;
      if (completed % 20 === 0 || completed === total) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = (completed / elapsed).toFixed(1);
        process.stdout.write(`\r  ${completed}/${total} (${rate}/s, ${elapsed}s elapsed)  `);
      }
    }
  };

  for (let i = 0; i < limit; i++) workers.push(worker());
  await Promise.all(workers);
  process.stdout.write("\n");
  return results;
}

// ─── D1 seed ──────────────────────────────────────────────────────────────
const D1_BATCH_SIZE = 50; // SQLite per-statement row limit (SQLITE_TOOBIG above ~200)

function buildInsertSQL(results) {
  const rows = results
    .filter((r) => r.ok)
    .map((r) => {
      const stat = fs.statSync(r.file.full);
      const title = path.basename(r.file.full, path.extname(r.file.full))
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const now = new Date().toISOString();
      const safeTitle = title.replace(/'/g, "''");
      const safeId = r.assetId.replace(/'/g, "''");
      const safeKey = r.r2Key.replace(/'/g, "''");
      const safeCat = r.file.category.replace(/'/g, "''");
      const safeBrand = r.file.brand.replace(/'/g, "''");
      const ext = path.extname(r.file.full).toLowerCase();
      const mediaType = ext === ".svg" ? "vector" : "image";
      return `('${safeId}','${safeBrand}','${safeCat}','${safeTitle}','','${safeKey}','${mediaType}','',${stat.size},0,0,'','[]','[]','','',1,0,1,100,'','approved','','','${now}','${now}')`;
    });

  if (!rows.length) return [];

  const header =
    `INSERT OR IGNORE INTO cms_assets\n` +
    `  (id,brand,category,title,description,file_path,media_type,mime_type,file_size,width,height,thumbnail_path,tags,emotions,video_embed_url,video_source,version,featured,active,sort_order,uploaded_by,review_status,approved_by,approved_at,created_at,updated_at)\nVALUES\n`;

  const batches = [];
  for (let i = 0; i < rows.length; i += D1_BATCH_SIZE) {
    batches.push(header + rows.slice(i, i + D1_BATCH_SIZE).join(",\n") + ";");
  }
  return batches;
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  if (!DRY_RUN && !CF_TOKEN) {
    console.error("❌  No wrangler OAuth token found. Run `npx wrangler login` first.");
    process.exit(1);
  }

  const sourceKeys = SOURCE === "all" ? ["gfv", "cs"] : [SOURCE];

  console.log(`\n🪣  R2 Bulk Import → ${BUCKET}`);
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no uploads)" : "LIVE"}`);
  console.log(`   Sources: ${sourceKeys.join(", ")}\n`);

  let allFiles = [];
  for (const key of sourceKeys) {
    const files = collectImages(key);
    console.log(`  ${key.toUpperCase()}: found ${files.length} images`);
    allFiles = allFiles.concat(files);
  }
  console.log(`\n  Total: ${allFiles.length} images to upload\n`);

  if (!allFiles.length) {
    console.error("No images found. Check source paths.");
    process.exit(1);
  }

  // Check already-uploaded (list existing R2 keys would be ideal, but
  // wrangler r2 object list isn't available — so we rely on INSERT OR IGNORE in D1)
  const tasks = allFiles.map((f) => () => uploadOne(f));

  console.log(`⬆  Uploading with concurrency=${CONCURRENCY}...`);
  const results = await runWithConcurrency(tasks, CONCURRENCY);

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);

  console.log(`\n  ✅ Uploaded: ${ok.length}`);
  if (failed.length) {
    console.log(`  ❌ Failed:   ${failed.length}`);
    const failLog = path.join(os.tmpdir(), "r2-import-failures.json");
    fs.writeFileSync(failLog, JSON.stringify(failed, null, 2));
    console.log(`     → See ${failLog}`);
  }

  // Generate + apply D1 seed
  const batches = buildInsertSQL(results);
  if (batches.length) {
    console.log(`\n📄  D1 seed: ${ok.length} rows in ${batches.length} batches of ${D1_BATCH_SIZE}`);

    if (!DRY_RUN) {
      console.log("💾  Seeding D1...");
      let seeded = 0;
      for (let i = 0; i < batches.length; i++) {
        const sqlFile = path.join(os.tmpdir(), `r2-import-seed-${i}.sql`);
        fs.writeFileSync(sqlFile, batches[i]);
        try {
          execSync(
            `npx wrangler d1 execute ${DB_NAME} --file "${sqlFile}" --remote`,
            { cwd: path.join(__dirname, ".."), encoding: "utf8", timeout: 60000, stdio: "pipe" }
          );
          seeded += D1_BATCH_SIZE;
          process.stdout.write(`\r  batch ${i + 1}/${batches.length} done  `);
        } catch (e) {
          console.error(`\n  ❌ Batch ${i + 1} failed:`, e.message.slice(-200));
        }
      }
      console.log(`\n  ✅ D1 seeded ~${Math.min(seeded, ok.length)} rows`);
    } else {
      console.log("  (skipped — dry run)");
    }
  }

  console.log("\n🎉  Done.\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
