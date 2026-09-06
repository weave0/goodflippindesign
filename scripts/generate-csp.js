#!/usr/bin/env node
/**
 * GFD Ecosystem - CSP & Security Headers Generator
 *
 * Reads scripts/csp-config.js and writes output files for each site.
 *
 * Usage:
 *   node scripts/generate-csp.js           # regenerate all sites
 *   node scripts/generate-csp.js gfd       # regenerate one site
 *   node scripts/generate-csp.js --dry-run # print output without writing
 *
 * Outputs:
 *   gfd          → _headers  (Cloudflare Pages)
 *   culturesherpa → GFD Dev Projects/CultureSherpa/cloudfront-headers-policy-generated.json
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { SITES } = require('./csp-config');

const ROOT = path.resolve(__dirname, '..');
const DRY_RUN = process.argv.includes('--dry-run');
const TARGET = process.argv.find(a => !a.startsWith('-') && a !== process.argv[0] && a !== process.argv[1]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Join directive values into a CSP string segment */
function buildDirective(name, values) {
  return `${name} ${values.join(' ')}`;
}

/** Build a full CSP string from a directives object */
function buildCSP(directives) {
  return Object.entries(directives)
    .map(([name, values]) => buildDirective(name, values))
    .join('; ');
}

// ─── Cloudflare Pages: _headers format ───────────────────────────────────────

function generateCloudflareHeaders(site) {
  const lines = [];

  lines.push('/*');

  // Security headers
  for (const [header, value] of Object.entries(site.securityHeaders)) {
    if (header === 'Content-Security-Policy') continue; // handled separately
    lines.push(`  ${header}: ${value}`);
  }

  // CSP
  lines.push(`  Content-Security-Policy: ${buildCSP(site.csp)}`);

  // Link headers (preconnect etc.)
  if (site.linkHeaders) {
    for (const link of site.linkHeaders) {
      lines.push(`  Link: ${link}`);
    }
  }

  lines.push('');

  // Cache-control rules
  for (const rule of (site.cacheRules || [])) {
    lines.push(rule.path);
    lines.push(`  Cache-Control: ${rule.value}`);
    lines.push('');
  }

  return lines.join('\n');
}

// ─── CloudFront: Response Headers Policy JSON ─────────────────────────────────

function generateCloudFrontJSON(site) {
  const policy = {
    Comment: site.cloudfront.comment,
    Name: site.cloudfront.policyName,
    SecurityHeadersConfig: {
      ...site.cloudFrontSecurityConfig,
      ContentSecurityPolicy: {
        Override: true,
        ContentSecurityPolicy: buildCSP(site.csp),
      },
    },
  };

  // Reorder so ContentSecurityPolicy appears after the others for readability
  const { ContentSecurityPolicy, ...rest } = policy.SecurityHeadersConfig;
  policy.SecurityHeadersConfig = { ...rest, ContentSecurityPolicy };

  return JSON.stringify(policy, null, 4);
}

// ─── Write Output ─────────────────────────────────────────────────────────────

function write(outputPath, content, siteName) {
  const absPath = path.resolve(ROOT, outputPath);
  const relativePath = path.relative(ROOT, absPath);

  if (DRY_RUN) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`DRY RUN → ${relativePath}`);
    console.log('─'.repeat(60));
    console.log(content);
    return;
  }

  const dir = path.dirname(absPath);
  if (!fs.existsSync(dir)) {
    // Some site targets (e.g. culturesherpa) point at a sibling project
    // checkout that only exists next to the canonical GFD working copy —
    // not in every clone or git worktree of this repo. Never fabricate a
    // missing directory tree to write into: only ever update a file whose
    // parent directory is already genuinely present. This makes it
    // impossible for this script to materialize a foreign project's
    // scaffold as a side effect of running from elsewhere.
    console.log(`  ⚠ ${siteName}: skipping ${relativePath} — target directory does not exist in this checkout`);
    return;
  }

  const existing = fs.existsSync(absPath) ? fs.readFileSync(absPath, 'utf8') : null;

  if (existing === content) {
    console.log(`  ✓ ${siteName}: ${relativePath} (unchanged)`);
    return;
  }

  fs.writeFileSync(absPath, content, 'utf8');
  console.log(`  ✎ ${siteName}: ${relativePath} (updated)`);
}

// ─── Generate per Platform ────────────────────────────────────────────────────

function generate(key, site) {
  console.log(`\n→ ${site.name} (${site.platform})`);

  switch (site.platform) {
    case 'cloudflare-pages': {
      const content = generateCloudflareHeaders(site);
      write(site.outputPath, content, site.name);
      break;
    }
    case 'cloudfront': {
      const content = generateCloudFrontJSON(site);
      write(site.outputPath, content, site.name);
      break;
    }
    default:
      console.warn(`  ⚠ Unknown platform "${site.platform}" for ${site.name} — skipping`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

console.log(`\nGFD CSP Generator${DRY_RUN ? ' (DRY RUN)' : ''}`);
console.log('='.repeat(40));

if (TARGET && !SITES[TARGET]) {
  console.error(`\nError: Unknown site "${TARGET}". Available: ${Object.keys(SITES).join(', ')}`);
  process.exit(1);
}

const targets = TARGET ? { [TARGET]: SITES[TARGET] } : SITES;

for (const [key, site] of Object.entries(targets)) {
  generate(key, site);
}

console.log('\nDone.\n');
