#!/usr/bin/env node
/**
 * Cloudflare Analytics Collector
 * Pulls zone analytics, Workers metrics, and Pages data from CF GraphQL API.
 *
 * Usage:
 *   CLOUDFLARE_API_TOKEN=your_token node scripts/cf-analytics.js
 *   -- or set it in .env --
 *   node scripts/cf-analytics.js
 *
 * Output: analytics/snapshot.json (referenced by analytics.html dashboard)
 *
 * Required token permissions (dash.cloudflare.com/profile/api-tokens):
 *   Zone: Zone Analytics Read (all zones)
 *   Account: Account Analytics Read
 *   Workers: Workers Analytics Read
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

// ─── Config ──────────────────────────────────────────────────────────────────

const ACCOUNT_ID = "3253d907ea85a18eb442283d7308b193";

// Sites to track — zone IDs discovered on first run, then cached in snapshot
const TRACKED_SITES = [
  { name: "goodflippindesign.com", pages_project: "goodflippindesign" },
  { name: "goodflippinvibes.com", pages_project: "good-flippin-vibes" },
  { name: "globaldeets.com", pages_project: "globaldeets" },
  { name: "heavymoose.com", pages_project: "heavymoose" },
  { name: "minnesotapeace.com", pages_project: "minnesotapeace" },
  { name: "citizenapproved.org", pages_project: "citizenapproved" },
  { name: "goodflippinluck.com", pages_project: "goodflippinluck" },
  { name: "goodflippinnews.com", pages_project: "goodflippinnews" },
  { name: "redleopardofstpaul.com", pages_project: "redleopardofstpaul" },
];

const WORKERS_TO_TRACK = [
  "gfd-auth",
  "gfd-stripe",
  "gfv-social-publisher",
  "goodflippindesign",
];

const OUTPUT_DIR = path.join(__dirname, "..", "analytics");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "snapshot.json");
const DAYS_BACK = 30;

// ─── Env / Token ─────────────────────────────────────────────────────────────

function loadToken() {
  // Check env first
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  if (process.env.CF_API_TOKEN) return process.env.CF_API_TOKEN;

  // Try .env file
  const envFile = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, "utf8").split("\n");
    for (const line of lines) {
      const m = line.match(/^(?:CLOUDFLARE_API_TOKEN|CF_API_TOKEN)\s*=\s*(.+)/);
      if (m) return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  return null;
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

function cfRequest(path, token, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "api.cloudflare.com",
      path,
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: "parse_error", raw: data.slice(0, 200) });
        }
      });
    });

    req.on("error", reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

function graphQL(token, query, variables = {}) {
  return cfRequest("/client/v4/graphql", token, { query, variables });
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function dateRange(daysBack = DAYS_BACK) {
  const end = new Date();
  const start = new Date(end.getTime() - daysBack * 24 * 60 * 60 * 1000);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
    startDateTime: start.toISOString().slice(0, 16),
    endDateTime: end.toISOString().slice(0, 16),
  };
}

// ─── Data Fetchers ───────────────────────────────────────────────────────────

async function getZones(token) {
  const res = await cfRequest(
    `/client/v4/zones?account.id=${ACCOUNT_ID}&per_page=50`,
    token
  );
  if (!res.success) throw new Error(`Zones API error: ${JSON.stringify(res.errors)}`);
  return res.result;
}

async function getZoneAnalytics(token, zoneId, zoneName) {
  const { startDate, endDate } = dateRange();

  const query = `
    query ZoneAnalytics($zoneTag: String!, $start: Date!, $end: Date!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            limit: 30
            filter: { date_geq: $start, date_leq: $end }
            orderBy: [date_ASC]
          ) {
            date: dimensions { date }
            sum {
              requests
              pageViews
              bytes
              cachedRequests
              cachedBytes
              threats
            }
            uniq {
              uniques
            }
          }
          topDeviceTypes: httpRequests1dGroups(
            limit: 1
            filter: { date_geq: $start, date_leq: $end }
          ) {
            sum { browserMap { pageViews, uaBrowserFamily } }
          }
          topCountries: httpRequests1dGroups(
            limit: 1
            filter: { date_geq: $start, date_leq: $end }
          ) {
            sum { countryMap { requests, clientCountryName } }
          }
        }
      }
    }
  `;

  const res = await graphQL(token, query, {
    zoneTag: zoneId,
    start: startDate,
    end: endDate,
  });

  const zones = res?.data?.viewer?.zones?.[0];
  if (!zones) return { error: "no_data", zone: zoneName };

  const daily = zones.httpRequests1dGroups || [];
  const totals = daily.reduce(
    (acc, d) => ({
      requests: acc.requests + (d.sum?.requests || 0),
      pageViews: acc.pageViews + (d.sum?.pageViews || 0),
      bytes: acc.bytes + (d.sum?.bytes || 0),
      cachedRequests: acc.cachedRequests + (d.sum?.cachedRequests || 0),
      threats: acc.threats + (d.sum?.threats || 0),
      uniques: acc.uniques + (d.uniq?.uniques || 0),
    }),
    { requests: 0, pageViews: 0, bytes: 0, cachedRequests: 0, threats: 0, uniques: 0 }
  );

  // Country breakdown from last day
  const countryMap =
    zones.topCountries?.[0]?.sum?.countryMap
      ?.sort((a, b) => b.requests - a.requests)
      .slice(0, 10) || [];

  // Browser breakdown
  const browserMap =
    zones.topDeviceTypes?.[0]?.sum?.browserMap
      ?.sort((a, b) => b.pageViews - a.pageViews)
      .slice(0, 8) || [];

  return {
    zone: zoneName,
    zoneId,
    period: `${startDate} → ${endDate}`,
    totals,
    cacheHitRate:
      totals.requests > 0
        ? Math.round((totals.cachedRequests / totals.requests) * 100)
        : 0,
    daily: daily.map((d) => ({
      date: d.date?.date,
      requests: d.sum?.requests || 0,
      pageViews: d.sum?.pageViews || 0,
      uniques: d.uniq?.uniques || 0,
      bytes: d.sum?.bytes || 0,
    })),
    topCountries: countryMap,
    topBrowsers: browserMap,
  };
}

async function getWorkersAnalytics(token) {
  const { startDateTime, endDateTime } = dateRange(7); // last 7 days for workers

  const query = `
    query WorkersAnalytics($accountTag: String!, $start: String!, $end: String!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          workersInvocationsAdaptive(
            limit: 10000
            filter: { datetimeHour_geq: $start, datetimeHour_leq: $end }
          ) {
            dimensions { scriptName }
            sum {
              requests
              errors
              subrequests
            }
            quantiles { cpuTimeP50, cpuTimeP99 }
          }
        }
      }
    }
  `;

  const res = await graphQL(token, query, {
    accountTag: ACCOUNT_ID,
    start: startDateTime,
    end: endDateTime,
  });

  const workers = res?.data?.viewer?.accounts?.[0]?.workersInvocationsAdaptive || [];

  // Aggregate by script name
  const byScript = {};
  for (const w of workers) {
    const name = w.dimensions?.scriptName || "unknown";
    if (!byScript[name]) {
      byScript[name] = { requests: 0, errors: 0, subrequests: 0, cpuSamples: [] };
    }
    byScript[name].requests += w.sum?.requests || 0;
    byScript[name].errors += w.sum?.errors || 0;
    byScript[name].subrequests += w.sum?.subrequests || 0;
    if (w.quantiles?.cpuTimeP50) byScript[name].cpuSamples.push(w.quantiles.cpuTimeP50);
  }

  return Object.entries(byScript)
    .map(([name, data]) => ({
      name,
      requests: data.requests,
      errors: data.errors,
      errorRate:
        data.requests > 0 ? Math.round((data.errors / data.requests) * 100 * 10) / 10 : 0,
      subrequests: data.subrequests,
      avgCpuMs:
        data.cpuSamples.length > 0
          ? Math.round(
              (data.cpuSamples.reduce((a, b) => a + b, 0) / data.cpuSamples.length / 1000) * 10
            ) / 10
          : 0,
    }))
    .sort((a, b) => b.requests - a.requests);
}

async function getPagesDeployments(token) {
  const results = [];
  for (const site of TRACKED_SITES.slice(0, 5)) {
    // just top 5 to avoid rate limits
    try {
      const res = await cfRequest(
        `/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${site.pages_project}/deployments?per_page=1`,
        token
      );
      if (res.success && res.result?.length > 0) {
        const d = res.result[0];
        results.push({
          project: site.pages_project,
          domain: site.name,
          latestDeployment: d.created_on,
          environment: d.environment,
          status: d.latest_stage?.status,
          commitMessage: d.deployment_trigger?.metadata?.commit_message?.slice(0, 80),
        });
      }
    } catch (e) {
      // skip on error
    }
  }
  return results;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const token = loadToken();
  if (!token) {
    console.error(`
❌ No Cloudflare API token found.

To fix: create a token at https://dash.cloudflare.com/profile/api-tokens
with these permissions:
  • Zone: Zone Analytics:Read (all zones)
  • Account: Account Analytics:Read
  • Workers Scripts: Read (for worker analytics)

Then add to .env:
  CLOUDFLARE_API_TOKEN=your_token_here

Re-run: node scripts/cf-analytics.js
`);
    process.exit(1);
  }

  console.log("🔍 Fetching Cloudflare zones...");
  const zones = await getZones(token);
  const zoneMap = {};
  for (const z of zones) {
    zoneMap[z.name] = z.id;
  }
  console.log(`   Found ${zones.length} zones: ${zones.map((z) => z.name).join(", ")}`);

  const snapshot = {
    generated: new Date().toISOString(),
    accountId: ACCOUNT_ID,
    periodDays: DAYS_BACK,
    sites: {},
    workers: [],
    deployments: [],
    ecosystemTotals: {
      requests: 0,
      pageViews: 0,
      uniques: 0,
      bytesGB: 0,
      threats: 0,
    },
  };

  // Zone analytics
  for (const site of TRACKED_SITES) {
    const zoneId = zoneMap[site.name];
    if (!zoneId) {
      console.log(`   ⚠️  No zone found for ${site.name} (not in CF DNS)`);
      continue;
    }
    process.stdout.write(`   📊 ${site.name}...`);
    try {
      const data = await getZoneAnalytics(token, zoneId, site.name);
      snapshot.sites[site.name] = data;
      snapshot.ecosystemTotals.requests += data.totals?.requests || 0;
      snapshot.ecosystemTotals.pageViews += data.totals?.pageViews || 0;
      snapshot.ecosystemTotals.uniques += data.totals?.uniques || 0;
      snapshot.ecosystemTotals.bytesGB +=
        (data.totals?.bytes || 0) / 1024 / 1024 / 1024;
      snapshot.ecosystemTotals.threats += data.totals?.threats || 0;
      console.log(
        ` ${(data.totals?.requests || 0).toLocaleString()} req, ${(data.totals?.uniques || 0).toLocaleString()} uniques`
      );
    } catch (e) {
      console.log(` ERROR: ${e.message}`);
      snapshot.sites[site.name] = { error: e.message };
    }
    // Polite delay
    await new Promise((r) => setTimeout(r, 200));
  }

  // Round bytes
  snapshot.ecosystemTotals.bytesGB =
    Math.round(snapshot.ecosystemTotals.bytesGB * 100) / 100;

  // Workers analytics
  console.log("   ⚙️  Workers analytics (7d)...");
  try {
    snapshot.workers = await getWorkersAnalytics(token);
    console.log(`   Found ${snapshot.workers.length} worker scripts`);
  } catch (e) {
    console.log(`   Workers error: ${e.message}`);
  }

  // Pages deployment status
  console.log("   🚀 Pages deployment status...");
  try {
    snapshot.deployments = await getPagesDeployments(token);
  } catch (e) {
    console.log(`   Deployments error: ${e.message}`);
  }

  // Write output
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot, null, 2));

  console.log(`
✅ Snapshot saved → analytics/snapshot.json
   Period:    Last ${DAYS_BACK} days
   Sites:     ${Object.keys(snapshot.sites).length}
   Ecosystem: ${snapshot.ecosystemTotals.requests.toLocaleString()} total requests
              ${snapshot.ecosystemTotals.pageViews.toLocaleString()} page views
              ${snapshot.ecosystemTotals.uniques.toLocaleString()} unique visitors
              ${snapshot.ecosystemTotals.bytesGB} GB bandwidth
              ${snapshot.ecosystemTotals.threats} threats blocked
`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
