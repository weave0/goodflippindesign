#!/usr/bin/env node
/**
 * apply-d1-schema.js
 * Applies d1-schema-cms.sql to the remote D1 database via Cloudflare REST API.
 * Bypasses wrangler so no CLOUDFLARE_API_TOKEN permission issues with CLI auth.
 *
 * Usage:
 *   node scripts/apply-d1-schema.js
 *   node scripts/apply-d1-schema.js --token sk_xxx   (override token)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ACCOUNT_ID = '3253d907ea85a18eb442283d7308b193';
const DATABASE_ID = 'a46ec9df-31b8-4285-845b-1fd3a62bd1b5';
const SCHEMA_FILE = path.join(__dirname, '..', 'd1-schema-cms.sql');

// Token resolution: --token flag > CLOUDFLARE_D1_TOKEN env > CLOUDFLARE_API_TOKEN env
const args = process.argv.slice(2);
const tokenFlagIdx = args.indexOf('--token');
const API_TOKEN = tokenFlagIdx !== -1
  ? args[tokenFlagIdx + 1]
  : (process.env.CLOUDFLARE_D1_TOKEN || process.env.CLOUDFLARE_API_TOKEN);

if (!API_TOKEN) {
  console.error('No API token found. Set CLOUDFLARE_D1_TOKEN env var or pass --token sk_xxx');
  console.error('\nTo create a token with D1 permissions:');
  console.error('  https://dash.cloudflare.com/profile/api-tokens');
  console.error('  → Create Token → Custom Token');
  console.error('  → Add permission: Account | D1 | Edit');
  process.exit(1);
}

/**
 * Split SQL file into individual statements (skip comments and blanks).
 */
function splitStatements(sql) {
  return sql
    .split(';')
    .map(s => s.replace(/--[^\n]*/g, '').trim())
    .filter(s => s.length > 10); // skip empty / comment-only chunks
}

/**
 * Execute a single SQL statement against D1 via REST API.
 */
function d1Query(sql) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ sql: sql + ';' });
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/d1/database/${DATABASE_ID}/query`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.success) {
            reject(new Error(json.errors?.[0]?.message || JSON.stringify(json.errors)));
          } else {
            resolve(json.result);
          }
        } catch {
          reject(new Error(`Bad response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  if (!fs.existsSync(SCHEMA_FILE)) {
    console.error(`Schema file not found: ${SCHEMA_FILE}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(SCHEMA_FILE, 'utf8');
  const statements = splitStatements(sql);

  console.log(`Applying ${statements.length} SQL statements to D1 (${DATABASE_ID})...\n`);

  let ok = 0, failed = 0;
  for (const stmt of statements) {
    const preview = stmt.replace(/\s+/g, ' ').slice(0, 80);
    try {
      await d1Query(stmt);
      console.log(`  ✅  ${preview}`);
      ok++;
    } catch (err) {
      // "table already exists" is OK — schema is idempotent (IF NOT EXISTS)
      if (err.message.includes('already exists')) {
        console.log(`  ⏭  (already exists) ${preview}`);
        ok++;
      } else {
        console.error(`  ❌  ${preview}`);
        console.error(`      ${err.message}`);
        failed++;
      }
    }
  }

  console.log(`\n─────────────────────────────────────`);
  console.log(`✅ Applied: ${ok}  ❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nIf you got "Authentication error", your token is missing D1 permissions.');
    console.log('Create a token at: https://dash.cloudflare.com/profile/api-tokens');
    console.log('  Custom Token → Account | D1 | Edit → Create Token');
    console.log('Then run: $env:CLOUDFLARE_D1_TOKEN="your-new-token"; node scripts/apply-d1-schema.js');
  }
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
