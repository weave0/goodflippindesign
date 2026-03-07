#!/usr/bin/env node
/**
 * crawl-site-assets.js — Discover and index assets deployed on ecosystem websites
 *
 * Usage:
 *   node scripts/crawl-site-assets.js                                    # Crawl all sites
 *   node scripts/crawl-site-assets.js --site goodflippinvibes.com        # Single site
 *   node scripts/crawl-site-assets.js --site goodflippindesign.com --page /gallery.html
 *   node scripts/crawl-site-assets.js --dry-run                          # Preview only
 *   node scripts/crawl-site-assets.js --json                             # JSON output
 *
 * This script:
 *   1. Fetches HTML pages from configured ecosystem sites
 *   2. Extracts all media references (img src, video, background-image, srcset)
 *   3. Downloads headers to get content type and size
 *   4. Registers discovered assets in D1 cms_asset_deployments
 *   5. Links to existing cms_assets records by content hash when possible
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execSync } = require('child_process');

// ── Config ──────────────────────────────────────────────────────

const CONFIG_PATH = path.resolve(__dirname, '..', 'sync-config.json');
const CRAWL_STATE_PATH = path.resolve(__dirname, '..', '.crawl-state.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('sync-config.json not found. Run setup first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

// ── HTTP Helpers ────────────────────────────────────────────────

function fetchPage(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout, headers: { 'User-Agent': 'WeaveMediaCrawler/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Follow redirect
        const redirectUrl = new URL(res.headers.location, url).href;
        fetchPage(redirectUrl, timeout).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function headRequest(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'HEAD',
      timeout,
      headers: { 'User-Agent': 'WeaveMediaCrawler/1.0' },
    };
    const req = mod.request(options, (res) => {
      resolve({
        status: res.statusCode,
        contentType: res.headers['content-type'] || '',
        contentLength: parseInt(res.headers['content-length'] || '0', 10),
        etag: res.headers['etag'] || '',
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
    req.end();
  });
}

// ── HTML Parsing (lightweight, no dependencies) ─────────────────

function extractMediaFromHTML(html, pageUrl) {
  const base = new URL(pageUrl);
  const assets = [];

  // <img src="...">
  const imgSrcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
  let match;
  while ((match = imgSrcRegex.exec(html)) !== null) {
    const src = match[1];
    if (isMediaUrl(src)) {
      assets.push({
        url: resolveUrl(src, base),
        attribute: 'src',
        element: 'img',
        selector: inferSelector(html, match.index, 'img'),
      });
    }
  }

  // <img srcset="...">
  const srcsetRegex = /<img[^>]+srcset=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    const candidates = match[1].split(',').map(s => s.trim().split(/\s+/)[0]);
    for (const src of candidates) {
      if (isMediaUrl(src)) {
        assets.push({
          url: resolveUrl(src, base),
          attribute: 'srcset',
          element: 'img',
          selector: inferSelector(html, match.index, 'img'),
        });
      }
    }
  }

  // <source src="..."> and <source srcset="...">
  const sourceRegex = /<source[^>]+(?:src|srcset)=["']([^"']+)["']/gi;
  while ((match = sourceRegex.exec(html)) !== null) {
    const src = match[1].split(',')[0].trim().split(/\s+/)[0];
    if (isMediaUrl(src)) {
      assets.push({
        url: resolveUrl(src, base),
        attribute: 'src',
        element: 'source',
        selector: inferSelector(html, match.index, 'source'),
      });
    }
  }

  // <video src="..." poster="...">
  const videoSrcRegex = /<video[^>]+src=["']([^"']+)["']/gi;
  while ((match = videoSrcRegex.exec(html)) !== null) {
    assets.push({
      url: resolveUrl(match[1], base),
      attribute: 'src',
      element: 'video',
      selector: inferSelector(html, match.index, 'video'),
    });
  }
  const posterRegex = /<video[^>]+poster=["']([^"']+)["']/gi;
  while ((match = posterRegex.exec(html)) !== null) {
    assets.push({
      url: resolveUrl(match[1], base),
      attribute: 'poster',
      element: 'video',
      selector: inferSelector(html, match.index, 'video'),
    });
  }

  // background-image: url(...)
  const bgRegex = /background(?:-image)?\s*:\s*url\(["']?([^"')]+)["']?\)/gi;
  while ((match = bgRegex.exec(html)) !== null) {
    const src = match[1];
    if (isMediaUrl(src)) {
      assets.push({
        url: resolveUrl(src, base),
        attribute: 'background-image',
        element: 'style',
        selector: '',
      });
    }
  }

  // <link rel="icon|apple-touch-icon" href="...">
  const iconRegex = /<link[^>]+rel=["'](?:icon|apple-touch-icon|shortcut icon)["'][^>]+href=["']([^"']+)["']/gi;
  while ((match = iconRegex.exec(html)) !== null) {
    assets.push({
      url: resolveUrl(match[1], base),
      attribute: 'href',
      element: 'link',
      selector: 'link[rel="icon"]',
    });
  }

  // <meta property="og:image" content="...">
  const ogRegex = /<meta[^>]+(?:property|name)=["']og:image["'][^>]+content=["']([^"']+)["']/gi;
  while ((match = ogRegex.exec(html)) !== null) {
    assets.push({
      url: resolveUrl(match[1], base),
      attribute: 'content',
      element: 'meta',
      selector: 'meta[property="og:image"]',
    });
  }

  return deduplicateAssets(assets);
}

function isMediaUrl(src) {
  if (!src || src.startsWith('data:') || src.startsWith('javascript:') || src.startsWith('#')) return false;
  const ext = path.extname(new URL(src, 'https://example.com').pathname).toLowerCase();
  const mediaExts = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.gif',
    '.mp4', '.mov', '.webm', '.ico', '.bmp', '.tiff',
  ]);
  // Also include extensionless URLs that come from known asset paths
  return mediaExts.has(ext) || /\/(assets|images|media|img)\//i.test(src);
}

function resolveUrl(src, base) {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

function inferSelector(html, matchIndex, tagName) {
  // Try to extract class or id from the matched tag
  const before = html.substring(Math.max(0, matchIndex - 200), matchIndex + 200);
  const tagMatch = new RegExp(`<${tagName}[^>]*>`, 'i').exec(before);
  if (!tagMatch) return tagName;

  const tag = tagMatch[0];
  const idMatch = /id=["']([^"']+)["']/.exec(tag);
  if (idMatch) return `${tagName}#${idMatch[1]}`;

  const classMatch = /class=["']([^"']+)["']/.exec(tag);
  if (classMatch) return `${tagName}.${classMatch[1].split(/\s+/)[0]}`;

  return tagName;
}

function deduplicateAssets(assets) {
  const seen = new Map();
  for (const asset of assets) {
    const key = asset.url;
    if (!seen.has(key)) {
      seen.set(key, asset);
    }
  }
  return Array.from(seen.values());
}

// ── D1 Registration ─────────────────────────────────────────────

function registerDeployment(asset, siteDomain, pagePath, databaseName) {
  const now = new Date().toISOString();
  const safeUrl = asset.url.replace(/'/g, "''");
  const safeSelector = (asset.selector || '').replace(/'/g, "''");

  const sql = `INSERT OR REPLACE INTO cms_asset_deployments (asset_id, site_domain, page_path, element_selector, element_attribute, live_url, status, last_crawled_at, created_at, updated_at) VALUES ('', '${siteDomain}', '${pagePath}', '${safeSelector}', '${asset.attribute}', '${safeUrl}', 'active', '${now}', '${now}', '${now}')`;

  try {
    execSync(`npx wrangler d1 execute "${databaseName}" --command="${sql}"`, {
      stdio: 'pipe',
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const jsonOutput = args.includes('--json');
  const siteFilter = args.find((a, i) => args[i - 1] === '--site');
  const pageFilter = args.find((a, i) => args[i - 1] === '--page');

  const config = loadConfig();
  const sites = config.ecosystemSites || [];

  if (sites.length === 0) {
    console.error('No ecosystem sites configured in sync-config.json');
    process.exit(1);
  }

  const targetSites = siteFilter ? sites.filter(s => s.domain === siteFilter) : sites;
  if (siteFilter && targetSites.length === 0) {
    console.error(`Site "${siteFilter}" not found. Available: ${sites.map(s => s.domain).join(', ')}`);
    process.exit(1);
  }

  const allResults = [];

  if (!jsonOutput) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('  WEAVE MEDIA PLATFORM — Site Asset Crawler');
    console.log(`${'='.repeat(60)}\n`);
    if (dryRun) console.log('  Preview mode — nothing will be registered in D1\n');
  }

  for (const site of targetSites) {
    const pages = pageFilter ? [pageFilter] : (site.pages || ['/']);
    if (!jsonOutput) console.log(`\n🌐 ${site.domain} (${site.brand})`);

    const siteAssets = [];

    for (const pagePath of pages) {
      const pageUrl = `https://${site.domain}${pagePath}`;
      if (!jsonOutput) process.stdout.write(`   📄 ${pagePath}... `);

      try {
        const html = await fetchPage(pageUrl);
        const assets = extractMediaFromHTML(html, pageUrl);
        if (!jsonOutput) console.log(`${assets.length} assets found`);

        // Enrich with HEAD info (content type, size)
        for (const asset of assets) {
          try {
            const head = await headRequest(asset.url);
            asset.contentType = head.contentType;
            asset.contentLength = head.contentLength;
            asset.status = head.status;
            asset.etag = head.etag;
          } catch {
            asset.contentType = '';
            asset.contentLength = 0;
            asset.status = 0;
          }

          asset.siteDomain = site.domain;
          asset.pagePath = pagePath;
          asset.brand = site.brand;
        }

        siteAssets.push(...assets);

        // Register in D1 (unless dry run)
        if (!dryRun) {
          let registered = 0;
          for (const asset of assets) {
            if (registerDeployment(asset, site.domain, pagePath, 'gfd_community')) {
              registered++;
            }
          }
          if (!jsonOutput) console.log(`      → Registered ${registered}/${assets.length} in D1`);
        }
      } catch (err) {
        if (!jsonOutput) console.log(`✗ ${err.message}`);
      }
    }

    // Deduplicate across pages for this site
    const unique = deduplicateAssets(siteAssets);

    allResults.push({
      domain: site.domain,
      brand: site.brand,
      pagesScanned: pages.length,
      assetsFound: unique.length,
      assets: unique,
    });

    if (!jsonOutput) {
      console.log(`   Total unique assets: ${unique.length}`);
      // Show breakdown
      const byType = {};
      for (const a of unique) {
        const ext = path.extname(new URL(a.url, 'https://x.com').pathname).toLowerCase() || 'unknown';
        byType[ext] = (byType[ext] || 0) + 1;
      }
      for (const [ext, count] of Object.entries(byType)) {
        console.log(`     ${ext.padEnd(8)} ${count}`);
      }
    }
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      crawledAt: new Date().toISOString(),
      sites: allResults,
      totalAssets: allResults.reduce((sum, s) => sum + s.assetsFound, 0),
    }, null, 2));
  } else {
    const total = allResults.reduce((sum, s) => sum + s.assetsFound, 0);
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`  Sites crawled:  ${allResults.length}`);
    console.log(`  Total assets:   ${total}`);
    console.log(`${'─'.repeat(40)}\n`);
  }

  // Save crawl state
  const state = {
    lastCrawl: new Date().toISOString(),
    sites: allResults.map(s => ({ domain: s.domain, assetsFound: s.assetsFound })),
  };
  fs.writeFileSync(CRAWL_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
}

main().catch(err => {
  console.error('Crawl failed:', err.message);
  process.exit(1);
});
