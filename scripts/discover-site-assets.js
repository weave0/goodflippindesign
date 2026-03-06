#!/usr/bin/env node
/**
 * discover-site-assets.js — Scrapes deployed brand sites for <img> assets
 * and stores them in D1 `discovered_assets` via the CMS API.
 *
 * Usage:
 *   node scripts/discover-site-assets.js                  # All brands
 *   node scripts/discover-site-assets.js --brand gfv      # One brand
 *   node scripts/discover-site-assets.js --dry-run        # Print, don't save
 *
 * What it does:
 *   1. Fetches the HTML of each configured brand page URL
 *   2. Extracts all <img src> / <source srcset> / CSS background-image URLs
 *   3. Resolves relative URLs to absolute
 *   4. POSTs unique assets to POST /api/cms/assets/discover
 *   5. Deduplicates by asset_url (D1 UNIQUE constraint handles the rest)
 *
 * Prerequisites:
 *   npm install node-fetch node-html-parser
 */

// ──────────────────────────────────────────────────────────────
//  Configuration
// ──────────────────────────────────────────────────────────────

const CMS_BASE_URL = process.env.CMS_URL || 'https://goodflippindesign.com';
const CMS_API_KEY = process.env.CMS_API_KEY;

const BRAND_SITES = [
  {
    brand: 'gfv',
    domain: 'goodflippinvibes.com',
    pages: [
      'https://goodflippinvibes.com',
      'https://goodflippinvibes.com/community-portal.html',
      'https://goodflippinvibes.com/donate.html',
    ],
  },
  {
    brand: 'gfd',
    domain: 'goodflippindesign.com',
    pages: [
      'https://goodflippindesign.com',
      'https://goodflippindesign.com/gallery.html',
    ],
  },
  {
    brand: 'culturesherpa',
    domain: 'culturesherpa.org',
    pages: ['https://culturesherpa.org'],
  },
  {
    brand: 'citizenapproved',
    domain: 'citizenapproved.com',
    pages: ['https://citizenapproved.com'],
  },
  {
    brand: 'aiaimate',
    domain: 'aiaimate.com',
    pages: ['https://aiaimate.com'],
  },
];

// Only external (non-data-URI) assets, and not tracking pixels / analytics
const SKIP_URL_PATTERNS = [
  /^data:/i,
  /google-analytics/i,
  /googletagmanager/i,
  /facebook\.com\/tr/i,
  /\.woff2?$/i,
  /\.ttf$/i,
];

// Asset file extensions to capture
const ASSET_EXTS = /\.(jpe?g|png|webp|avif|gif|svg|mp4|webm|mov)(\?.*)?$/i;

// ──────────────────────────────────────────────────────────────
//  Scraper
// ──────────────────────────────────────────────────────────────

async function fetchPage(url) {
  let fetch;
  try { fetch = (await import('node-fetch')).default; }
  catch { fetch = global.fetch; }

  const res = await fetch(url, {
    headers: { 'User-Agent': 'GFD-AssetScanner/1.0 (+https://goodflippindesign.com)' },
    redirect: 'follow',
    timeout: 15000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Extract all asset URLs from an HTML string.
 * Returns an array of { url, type, alt, src_attr } objects.
 */
function extractAssets(html, baseUrl, domain) {
  const assets = [];
  const seen = new Set();

  function add(rawUrl, type, alt = '') {
    if (!rawUrl || typeof rawUrl !== 'string') return;
    rawUrl = rawUrl.trim().split(/\s+/)[0]; // strip srcset descriptors
    if (!rawUrl) return;

    // Resolve relative URLs
    let resolved;
    try {
      resolved = new URL(rawUrl, baseUrl).toString();
    } catch { return; }

    if (seen.has(resolved)) return;
    seen.add(resolved);

    // Skip non-asset URLs
    if (!ASSET_EXTS.test(resolved)) return;
    if (SKIP_URL_PATTERNS.some(p => p.test(resolved))) return;

    assets.push({ url: resolved, type, alt });
  }

  // <img src> and <img srcset>
  for (const m of html.matchAll(/<img\s[^>]*>/gi)) {
    const tag = m[0];
    const src = (tag.match(/\bsrc=["']([^"']+)/i) || [])[1];
    const alt = (tag.match(/\balt=["']([^"']*)/i) || [])[1] || '';
    const srcset = (tag.match(/\bsrcset=["']([^"']+)/i) || [])[1];
    if (src) add(src, 'image', alt);
    if (srcset) {
      for (const part of srcset.split(',')) add(part.trim(), 'image', alt);
    }
  }

  // <source srcset> (picture element)
  for (const m of html.matchAll(/<source\s[^>]*srcset=["']([^"']+)/gi)) {
    for (const part of m[1].split(',')) add(part.trim(), 'image');
  }

  // <video poster> and <source src>
  for (const m of html.matchAll(/<video\s[^>]*poster=["']([^"']+)/gi)) {
    add(m[1], 'image');
  }
  for (const m of html.matchAll(/<source\s[^>]*src=["']([^"']+)/gi)) {
    add(m[1], 'video');
  }

  // CSS background-image: url(...)
  for (const m of html.matchAll(/background(?:-image)?\s*:\s*url\(['"]?([^'")]+)/gi)) {
    add(m[1], 'image');
  }

  return assets;
}

// ──────────────────────────────────────────────────────────────
//  API reporter
// ──────────────────────────────────────────────────────────────

async function reportDiscovery(brand, domain, pageUrl, assets, dryRun) {
  if (assets.length === 0) return 0;

  if (dryRun) {
    for (const a of assets) console.log(`  🔍 ${a.url}  [${a.type}]  alt="${a.alt}"`);
    return assets.length;
  }

  let fetch;
  try { fetch = (await import('node-fetch')).default; }
  catch { fetch = global.fetch; }

  const headers = { 'Content-Type': 'application/json' };
  if (CMS_API_KEY) headers['Authorization'] = `Bearer ${CMS_API_KEY}`;

  const payload = { brand, site_domain: domain, page_url: pageUrl, assets };
  const res = await fetch(`${CMS_BASE_URL}/api/cms/assets/discover`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
  }

  const result = await res.json();
  return result.inserted || assets.length;
}

// ──────────────────────────────────────────────────────────────
//  Main
// ──────────────────────────────────────────────────────────────

async function discoverAll(opts = {}) {
  const { dryRun = false, brand: filterBrand = null } = opts;
  let totalNew = 0, totalErrors = 0;

  const sitesToScan = filterBrand
    ? BRAND_SITES.filter(s => s.brand === filterBrand)
    : BRAND_SITES;

  for (const site of sitesToScan) {
    console.log(`\n🌐 ${site.brand.toUpperCase()}  (${site.domain})`);

    for (const pageUrl of site.pages) {
      process.stdout.write(`  📄 ${pageUrl}  ...`);
      try {
        const html = await fetchPage(pageUrl);
        const assets = extractAssets(html, pageUrl, site.domain);
        process.stdout.write(`  ${assets.length} assets\n`);

        if (assets.length > 0) {
          const inserted = await reportDiscovery(site.brand, site.domain, pageUrl, assets, dryRun);
          if (!dryRun) console.log(`     ↳ ${inserted} new entries saved to D1`);
          totalNew += inserted;
        }
      } catch (err) {
        process.stdout.write('\n');
        console.error(`  ❌ ${err.message}`);
        totalErrors++;
      }
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`✅ New discovered_assets rows: ${totalNew}  ❌ Page errors: ${totalErrors}`);
  if (dryRun) console.log('(dry-run — nothing was saved)');
}

(async () => {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const brandIdx = args.indexOf('--brand');
  const brand = brandIdx !== -1 ? args[brandIdx + 1] : null;

  if (!CMS_API_KEY && !dryRun) {
    console.warn('⚠  CMS_API_KEY not set — discovered assets will not be saved (401).');
    console.warn('   Set it to your Clerk session token: $env:CMS_API_KEY = "..."');
    console.warn('   Or run with --dry-run to preview only.\n');
  }

  await discoverAll({ dryRun, brand });
})();
