// connect-pages-git.js — run with: node scripts/connect-pages-git.js
const https = require('https');
const fs = require('fs');
const path = require('path');

const ACCOUNT_ID = '3253d907ea85a18eb442283d7308b193';

// Read token from .env (handles commented lines)
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');
const tokenMatch = envContent.match(/^CLOUDFLARE_API_TOKEN\s*=\s*(\S+)/m);
if (!tokenMatch) {
  console.error('ERROR: CLOUDFLARE_API_TOKEN not found in .env');
  process.exit(1);
}
const TOKEN = tokenMatch[1];
console.log(`Token: ${TOKEN.substring(0, 6)}...`);

const CONNECTIONS = [
  { project: 'minnesotapeace', owner: 'weave0', repo: 'jamie-mediation', branch: 'main' },
  { project: 'citizenapproved', owner: 'weave0', repo: 'CitizenApproved', branch: 'main' },
];

function apiRequest(method, projectSlug, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = JSON.stringify(body);
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${projectSlug}`,
      method,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function getProject(slug) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.cloudflare.com',
      path: `/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${slug}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${TOKEN}` },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function main() {
  console.log('\n=== Pre-flight: current state ===');
  for (const c of CONNECTIONS) {
    const info = await getProject(c.project);
    if (!info || !info.result) {
      console.log(`  ${c.project}: NOT FOUND or auth error`);
    } else {
      const src = info.result.source;
      console.log(`  ${c.project}: type=${src?.type ?? 'none'}  repo=${src?.config?.owner ?? '-'}/${src?.config?.repo_name ?? '-'}`);
    }
  }

  console.log('\n=== Patching ===');
  for (const c of CONNECTIONS) {
    process.stdout.write(`  ${c.project} → ${c.owner}/${c.repo} ... `);
    try {
      const result = await apiRequest('PATCH', c.project, {
        source: {
          type: 'github',
          config: {
            owner: c.owner,
            repo_name: c.repo,
            production_branch: c.branch,
            pr_comments_enabled: true,
            deployments_enabled: true,
          },
        },
      });
      if (result.body.success) {
        console.log('OK');
      } else {
        console.log('FAILED');
        console.error('  Errors:', JSON.stringify(result.body.errors, null, 2));
      }
    } catch (e) {
      console.log('ERROR:', e.message);
    }
  }

  console.log('\n=== Post-flight: verified state ===');
  for (const c of CONNECTIONS) {
    const info = await getProject(c.project);
    const src = info?.result?.source;
    const connected = src?.type === 'github' && src?.config?.repo_name === c.repo;
    console.log(`  ${connected ? '✓' : '✗'} ${c.project}: ${src?.type ?? 'none'} → ${src?.config?.owner ?? '-'}/${src?.config?.repo_name ?? '-'}`);
  }
}

main().catch(console.error);
