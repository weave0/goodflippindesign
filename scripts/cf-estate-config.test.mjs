// TI-012 Phases C/D regression coverage for scripts/cf-estate-config.mjs.
//
// Exercises the real module against a local mock of the Cloudflare API (plus the
// real CLI as a subprocess for the exit-code / no-artifact-on-failure / stderr
// exfiltration contracts). Diagnostics are treated as a secret-exfiltration
// surface: the hostile-redaction tests are the point of this file.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, access, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  EstateAcquisitionError,
  EstateValidationError,
  acquireEstate,
  cfGet,
  fetchAllPages,
  parseExpectedZones,
  parsePagesInventory,
  redact,
  renderSummary,
  validateEstateArtifact,
} from "./cf-estate-config.mjs";

const execFileAsync = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.join(HERE, "cf-estate-config.mjs");
const WORKFLOW = path.join(HERE, "..", ".github", "workflows", "traffic-intelligence-deploy.yml");

const ZONE_TOKEN = "zt_ANALYTICS_super_secret_token_0123456789";
const DEPLOY_TOKEN = "dt_DEPLOY_super_secret_token_9876543210";
const FAST = { retries: 0, retryDelayMs: 0 };

// ---------------------------------------------------------------------------
// fixtures / harness
// ---------------------------------------------------------------------------

const zone = (name, status = "active") => ({ id: `id-${name}`, name, status });
const dnsRecord = (name, type, content, proxied = true) => ({ id: `dns-${name}-${type}-${content}`, name, type, content, proxied });
const project = (id, name, domains, source) => ({ id, name, domains, ...(source ? { source } : {}) });
const ok = (result, result_info) => ({ status: 200, body: { success: true, result, ...(result_info ? { result_info } : {}) } });

async function withMockServer(handler, run) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push({ url, headers: req.headers });
    let result;
    try {
      result = handler(url, requests.length, req);
    } catch {
      req.destroy();
      return;
    }
    res.writeHead(result.status, { "Content-Type": result.contentType ?? "application/json" });
    res.end(result.raw ?? JSON.stringify(result.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// A well-behaved Cloudflare for a small estate.
function healthyCloudflare(zones, { dns = {}, zonePages = null } = {}) {
  return (url) => {
    if (url.pathname === "/zones") {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (zonePages) return ok(zonePages[page - 1], { page, total_pages: zonePages.length, total_count: zonePages.flat().length });
      return ok(zones, { page: 1, total_pages: 1, total_count: zones.length });
    }
    const match = url.pathname.match(/^\/zones\/id-(.+)\/dns_records$/);
    if (match) {
      const records = dns[match[1]] ?? [dnsRecord(match[1], "CNAME", "site.pages.dev")];
      return ok(records, { page: 1, total_pages: 1, total_count: records.length });
    }
    return { status: 404, body: { success: false, errors: [{ code: 7003, message: "No route" }], result: null } };
  };
}

const PAGES = [
  project("p1", "site-a", ["a.com", "www.a.com", "site-a.pages.dev"], { type: "github", config: { owner: "weave0", repo_name: "site-a" } }),
  project("p2", "site-b", ["b.com"]),
];

async function acquire(baseUrl, expectedZones, overrides = {}) {
  return acquireEstate({
    base: baseUrl,
    accountId: "acct",
    zoneToken: ZONE_TOKEN,
    secrets: [DEPLOY_TOKEN],
    expectedZones,
    pagesProjects: PAGES,
    now: () => new Date("2026-09-19T12:00:00Z"),
    ...FAST,
    ...overrides,
  });
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, (error) => {
    assert.ok(error instanceof EstateAcquisitionError, `expected EstateAcquisitionError, got ${error?.name}: ${error?.message}`);
    assert.match(error.message, pattern);
    return true;
  });
}

async function runCli(args, env) {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [CLI, ...args], {
      env: { ...process.env, ...env },
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return { status: typeof error.code === "number" ? error.code : 1, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
}

// ---------------------------------------------------------------------------
// Zone-list request form + pagination
// ---------------------------------------------------------------------------

test("one-page estate: every governed zone is accounted for and validates", async () => {
  await withMockServer(healthyCloudflare([zone("a.com"), zone("b.com")]), async (base, requests) => {
    const artifact = await acquire(base, ["a.com", "b.com"]);
    assert.equal(artifact.properties.length, 2);
    assert.equal(artifact.inventory.zones.count, 2);
    assert.equal(artifact.inventory.pages.count, 2);
    const a = artifact.properties.find((p) => p.property_id === "a.com");
    assert.equal(a.evidence.pages.status, "observed");
    assert.equal(a.pages.source_repository, "weave0/site-a");
    const accounting = validateEstateArtifact(artifact, { expectedZones: ["a.com", "b.com"], secrets: [ZONE_TOKEN, DEPLOY_TOKEN] });
    assert.equal(accounting.observed, 2);
    const zoneRequest = requests.find((r) => r.url.pathname === "/zones");
    assert.equal(zoneRequest.url.searchParams.get("account.id"), "acct");
    assert.equal(zoneRequest.url.searchParams.get("per_page"), "50");
    assert.equal(zoneRequest.headers.authorization, `Bearer ${ZONE_TOKEN}`);
  });
});

test("multi-page zone list aggregates every page; a zone only on the last page is still represented", async () => {
  const pages = [[zone("a.com")], [zone("b.com")], [zone("late.com")]];
  await withMockServer(healthyCloudflare(null, { zonePages: pages }), async (base, requests) => {
    const artifact = await acquire(base, ["a.com", "b.com", "late.com"]);
    const late = artifact.properties.find((p) => p.property_id === "late.com");
    assert.equal(late.zone_status, "active");
    assert.equal(late.evidence.zone.status, "observed");
    assert.equal(artifact.inventory.zones.count, 3);
    assert.equal(requests.filter((r) => r.url.pathname === "/zones").length, 3);
  });
});

test("a failed later zone-list page fails closed: no partial artifact", async () => {
  await withMockServer(
    (url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (page === 1) return ok([zone("a.com")], { page: 1, total_pages: 2, total_count: 2 });
      return { status: 500, body: { success: false, errors: [{ code: 1000, message: "boom" }], result: null } };
    },
    async (base) => {
      await rejects(acquire(base, ["a.com", "b.com"]), /zone-list request rejected: HTTP 500 — Cloudflare error 1000: boom/);
    },
  );
});

test("truncated pagination is detected via total_count", async () => {
  await withMockServer(
    () => ok([zone("a.com")], { page: 1, total_pages: 1, total_count: 3 }),
    async (base) => {
      await rejects(acquire(base, ["a.com"]), /returned 1 entries but Cloudflare advertised total_count=3/);
    },
  );
});

test("duplicate zones across pages fail closed", async () => {
  const pages = [[zone("a.com")], [zone("a.com")]];
  await withMockServer(healthyCloudflare(null, { zonePages: pages }), async (base) => {
    await rejects(acquire(base, ["a.com"]), /duplicate entries across pages/);
  });
});

test("inconsistent total_pages across pages fails closed", async () => {
  await withMockServer(
    (url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return ok([zone(`z${page}.com`)], { page, total_pages: page === 1 ? 3 : 2 });
    },
    async (base) => {
      await rejects(acquire(base, ["z1.com"]), /pagination became inconsistent: total_pages changed from 3 to 2/);
    },
  );
});

test("a reported page that does not match the requested page fails closed", async () => {
  await withMockServer(
    () => ok([zone("a.com")], { page: 2, total_pages: 2 }),
    async (base) => {
      await rejects(acquire(base, ["a.com"]), /page mismatch: requested page 1, Cloudflare reported page 2/);
    },
  );
});

for (const [label, info, pattern] of [
  ["total_pages: 0", { page: 1, total_pages: 0 }, /non-positive-integer result_info\.total_pages/],
  ['total_pages: "3" (string)', { page: 1, total_pages: "3" }, /non-positive-integer result_info\.total_pages/],
  ["total_pages: null", { page: 1, total_pages: null }, /non-positive-integer result_info\.total_pages/],
  ["total_pages: false", { page: 1, total_pages: false }, /non-positive-integer result_info\.total_pages/],
  ["total_pages: 999999999999", { page: 1, total_pages: 999999999999 }, /non-positive-integer result_info\.total_pages/],
  ["total_pages beyond the safety bound", { page: 1, total_pages: 5000 }, /exceeding the safety bound/],
  ['page: "1" (string)', { page: "1", total_pages: 1 }, /non-positive-integer result_info\.page/],
  ["page: 0", { page: 0, total_pages: 1 }, /non-positive-integer result_info\.page/],
]) {
  test(`fails closed on hostile result_info (${label}) instead of truncating`, async () => {
    await withMockServer(() => ok([zone("a.com")], info), async (base) => {
      await rejects(acquire(base, ["a.com"]), pattern);
    });
  });
}

for (const hostile of [null, false, "3", [], 7]) {
  test(`fails closed on a non-object result_info (${JSON.stringify(hostile)}) instead of treating it as absent`, async () => {
    await withMockServer(
      () => ({ status: 200, body: { success: true, result: [zone("a.com")], result_info: hostile } }),
      async (base) => {
        await rejects(acquire(base, ["a.com"]), /non-object result_info/);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// Malformed / rejected Cloudflare responses
// ---------------------------------------------------------------------------

test("success:false on HTTP 200 is a rejection, not data", async () => {
  await withMockServer(
    () => ({ status: 200, body: { success: false, errors: [{ code: 9109, message: "Invalid access token" }], result: [zone("a.com")] } }),
    async (base) => {
      await rejects(acquire(base, ["a.com"]), /zone-list request rejected: HTTP 200 — Cloudflare error 9109: Invalid access token/);
    },
  );
});

test('a string success:"true" is not accepted as the boolean true', async () => {
  await withMockServer(
    () => ({ status: 200, body: { success: "true", result: [zone("a.com")] } }),
    async (base) => {
      await rejects(acquire(base, ["a.com"]), /rejected: HTTP 200/);
    },
  );
});

test("a non-2xx response is rejected even when its body falsely claims success:true", async () => {
  await withMockServer(
    () => ({ status: 503, body: { success: true, result: [zone("a.com")] } }),
    async (base) => {
      await rejects(acquire(base, ["a.com"]), /rejected: HTTP 503/);
    },
  );
});

for (const [label, result] of [
  ["null", null],
  ["an object", { a: 1 }],
  ["a string", "reflected"],
]) {
  test(`a result that is ${label} instead of an array fails closed`, async () => {
    await withMockServer(
      () => ({ status: 200, body: { success: true, result } }),
      async (base) => {
        await rejects(acquire(base, ["a.com"]), /did not contain a result array/);
      },
    );
  });
}

test("a non-object entry inside result fails closed", async () => {
  await withMockServer(() => ok(["a.com"], { page: 1, total_pages: 1 }), async (base) => {
    await rejects(acquire(base, ["a.com"]), /non-object result entry/);
  });
});

test("a non-JSON error body still yields the operation, HTTP status and a bounded redacted snippet", async () => {
  await withMockServer(
    () => ({ status: 502, raw: "<html>Bad gateway from edge</html>", contentType: "text/html" }),
    async (base) => {
      await rejects(acquire(base, ["a.com"]), /zone-list request rejected: HTTP 502 — response body was not JSON: <html>Bad gateway/);
    },
  );
});

test("the operator-grade diagnostic names the operation, HTTP status, Cloudflare code/message and endpoint class", async () => {
  await withMockServer(
    () => ({ status: 400, body: { success: false, errors: [{ code: 8000000, message: "Invalid list options provided" }] } }),
    async (base) => {
      await assert.rejects(acquire(base, ["a.com"]), (error) => {
        assert.equal(
          error.message,
          "zone-list request rejected: HTTP 400 — Cloudflare error 8000000: Invalid list options provided (endpoint class: zones)",
        );
        return true;
      });
    },
  );
});

test("an unreachable API produces a static message (no underlying error text)", async () => {
  await rejects(
    acquire("http://127.0.0.1:1", ["a.com"]),
    /^zone-list request failed: unable to reach Cloudflare API \(endpoint class: zones\)$/,
  );
});

// ---------------------------------------------------------------------------
// Retry behaviour
// ---------------------------------------------------------------------------

test("a transient 429 is retried and then succeeds", async () => {
  await withMockServer(
    (url, n) => (n === 1 ? { status: 429, body: { success: false, errors: [{ code: 971, message: "rate" }] } } : ok([zone("a.com")], { page: 1, total_pages: 1 })),
    async (base, requests) => {
      const body = await cfGet({ base, path: "/zones", token: ZONE_TOKEN, operation: "zone-list", endpointClass: "zones", retries: 2, retryDelayMs: 0 });
      assert.equal(body.result.length, 1);
      assert.equal(requests.length, 2);
    },
  );
});

test("a non-retryable 4xx is not retried", async () => {
  await withMockServer(
    () => ({ status: 403, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } }),
    async (base, requests) => {
      await assert.rejects(cfGet({ base, path: "/zones", token: ZONE_TOKEN, operation: "zone-list", endpointClass: "zones", retries: 3, retryDelayMs: 0 }));
      assert.equal(requests.length, 1);
    },
  );
});

test("a persistent 500 is bounded by the retry budget", async () => {
  await withMockServer(
    () => ({ status: 500, body: { success: false, errors: [{ code: 1, message: "down" }] } }),
    async (base, requests) => {
      await assert.rejects(cfGet({ base, path: "/zones", token: ZONE_TOKEN, operation: "zone-list", endpointClass: "zones", retries: 2, retryDelayMs: 0 }), /HTTP 500/);
      assert.equal(requests.length, 3);
    },
  );
});

// ---------------------------------------------------------------------------
// DNS acquisition and per-zone accounting
// ---------------------------------------------------------------------------

test("DNS records are paginated and apex/www are extracted", async () => {
  await withMockServer(
    (url) => {
      if (url.pathname === "/zones") return ok([zone("a.com")], { page: 1, total_pages: 1, total_count: 1 });
      const page = Number(url.searchParams.get("page") ?? "1");
      const pages = [
        [dnsRecord("a.com", "CNAME", "site-a.pages.dev"), dnsRecord("mail.a.com", "MX", "mx.a.com")],
        [dnsRecord("www.a.com", "CNAME", "site-a.pages.dev")],
      ];
      return ok(pages[page - 1], { page, total_pages: 2, total_count: 3 });
    },
    async (base) => {
      const artifact = await acquire(base, ["a.com"]);
      const [property] = artifact.properties;
      assert.equal(property.dns_apex.length, 1);
      assert.equal(property.dns_www.length, 1, "a record only on DNS page 2 must not be lost");
      assert.deepEqual(Object.keys(property.dns_apex[0]).sort(), ["content", "name", "proxied", "type"]);
    },
  );
});

test("one zone's unreadable DNS is accounted for with an explicit reason — not dropped, not fatal", async () => {
  const cloudflare = healthyCloudflare([zone("a.com"), zone("b.com")]);
  await withMockServer(
    (url) =>
      url.pathname === "/zones/id-b.com/dns_records"
        ? { status: 403, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } }
        : cloudflare(url),
    async (base) => {
      const warnings = [];
      const artifact = await acquire(base, ["a.com", "b.com"], { onWarning: (m) => warnings.push(m) });
      const b = artifact.properties.find((p) => p.property_id === "b.com");
      assert.equal(b.evidence.dns.status, "unavailable");
      assert.equal(b.evidence.dns.reason, "HTTP 403 — Cloudflare error 10000: Authentication error");
      assert.equal(b.evidence.zone.status, "observed");
      assert.equal(warnings.length, 1);
      const accounting = validateEstateArtifact(artifact, { expectedZones: ["a.com", "b.com"] });
      assert.deepEqual([accounting.observed, accounting.accounted_unavailable], [1, 1]);
    },
  );
});

test("DNS unavailable for EVERY zone is a systemic failure, not a valid estate", async () => {
  await withMockServer(
    (url) =>
      url.pathname.endsWith("/dns_records")
        ? { status: 403, body: { success: false, errors: [{ code: 10000, message: "Authentication error" }] } }
        : healthyCloudflare([zone("a.com"), zone("b.com")])(url),
    async (base) => {
      const artifact = await acquire(base, ["a.com", "b.com"]);
      assert.throws(() => validateEstateArtifact(artifact, { expectedZones: ["a.com", "b.com"] }), /systemic acquisition failure/);
    },
  );
});

test("an expected zone missing from Cloudflare's complete list is explicitly accounted for, never silently dropped", async () => {
  await withMockServer(healthyCloudflare([zone("a.com")]), async (base) => {
    const artifact = await acquire(base, ["a.com", "ghost.com"]);
    const ghost = artifact.properties.find((p) => p.property_id === "ghost.com");
    assert.equal(ghost.evidence.zone.status, "unavailable");
    assert.match(ghost.evidence.zone.reason, /absent from the complete zone list/);
    validateEstateArtifact(artifact, { expectedZones: ["a.com", "ghost.com"] });
  });
});

// ---------------------------------------------------------------------------
// Pages evidence (deploy authority)
// ---------------------------------------------------------------------------

test("Pages evidence distinguishes observed, no_project (a positive negative) and ambiguous", async () => {
  const pagesProjects = [
    project("p1", "site-a", ["a.com"], { type: "github", config: { owner: "weave0", repo_name: "site-a" } }),
    project("p2", "dup-1", ["dup.com"]),
    project("p3", "dup-2", ["www.dup.com"]),
    project("p4", "site-www", ["www.onlywww.com"]),
  ];
  await withMockServer(
    healthyCloudflare([zone("a.com"), zone("none.com"), zone("dup.com"), zone("onlywww.com")]),
    async (base) => {
      const artifact = await acquire(base, ["a.com", "none.com", "dup.com", "onlywww.com"], { pagesProjects });
      const by = Object.fromEntries(artifact.properties.map((p) => [p.property_id, p]));
      assert.equal(by["a.com"].evidence.pages.status, "observed");
      assert.equal(by["a.com"].evidence.pages.authority, "deploy_credential");
      assert.equal(by["none.com"].evidence.pages.status, "no_project");
      assert.match(by["none.com"].evidence.pages.reason, /complete Pages inventory \(4 projects\)/);
      assert.deepEqual(by["none.com"].pages, {});
      assert.equal(by["dup.com"].evidence.pages.status, "unavailable");
      assert.match(by["dup.com"].evidence.pages.reason, /Ambiguous: 2 Pages projects/);
      assert.equal(by["onlywww.com"].pages.project_name, "site-www");
      // direct-upload (no git source) keeps source_type null — a governance-gap input, not "unavailable"
      assert.equal(by["onlywww.com"].pages.source_type, null);
      validateEstateArtifact(artifact, { expectedZones: ["a.com", "none.com", "dup.com", "onlywww.com"] });
    },
  );
});

test("duplicate Pages projects in the inventory file are rejected", () => {
  const text = JSON.stringify({ success: true, result: [project("p1", "x", []), project("p1", "y", [])] });
  assert.throws(() => parsePagesInventory(text), /duplicate projects/);
  const byName = JSON.stringify({ success: true, result: [project("p1", "x", []), project("p2", "x", [])] });
  assert.throws(() => parsePagesInventory(byName), /duplicate projects/);
});

for (const [label, text] of [
  ["not JSON", "not json"],
  ["success:false", JSON.stringify({ success: false, result: [] })],
  ['string success:"true"', JSON.stringify({ success: "true", result: [] })],
  ["result not an array", JSON.stringify({ success: true, result: {} })],
  ["a project without an id", JSON.stringify({ success: true, result: [{ name: "x" }] })],
  ["malformed domains", JSON.stringify({ success: true, result: [{ id: "1", name: "x", domains: [1] }] })],
]) {
  test(`the Pages inventory file is rejected when malformed (${label})`, () => {
    assert.throws(() => parsePagesInventory(text), EstateAcquisitionError);
  });
}

test("an empty Pages inventory is valid and yields explicit no_project evidence for every zone", async () => {
  await withMockServer(healthyCloudflare([zone("a.com")]), async (base) => {
    const artifact = await acquire(base, ["a.com"], { pagesProjects: parsePagesInventory('{"success":true,"result":[]}') });
    assert.equal(artifact.inventory.pages.count, 0);
    assert.equal(artifact.properties[0].evidence.pages.status, "no_project");
  });
});

// ---------------------------------------------------------------------------
// Estate completeness validation (reconciliation against the governed estate)
// ---------------------------------------------------------------------------

async function goodArtifact(expectedZones = ["a.com", "b.com"]) {
  let artifact;
  await withMockServer(healthyCloudflare(expectedZones.map((z) => zone(z))), async (base) => {
    artifact = await acquire(base, expectedZones);
  });
  return artifact;
}

const mutations = [
  ["a governed zone silently absent", (a) => a.properties.pop(), /governed zone b\.com is silently absent/],
  ["an ungoverned property", (a) => a.properties.push({ ...structuredClone(a.properties[0]), property_id: "stray.com" }), /ungoverned property stray\.com/],
  ["duplicate properties", (a) => a.properties.push(structuredClone(a.properties[0])), /duplicate property_id/],
  ["governed_zones omitting an expected zone", (a) => a.governed_zones.pop(), /governed_zones omits expected zone b\.com/],
  ["governed_zones with an unexpected zone", (a) => a.governed_zones.push("x.com"), /unexpected zone x\.com/],
  ["fixture:true", (a) => { a.fixture = true; }, /fixture=false/],
  ["wrong schema_version", (a) => { a.schema_version = "1.0.0"; }, /unsupported schema_version/],
  ["wrong contract_name", (a) => { a.contract_name = "other"; }, /unexpected contract_name/],
  ["an invalid generated_at", (a) => { a.generated_at = "yesterday"; }, /generated_at is not a valid timestamp/],
  ["an incomplete pages inventory", (a) => { a.inventory.pages.complete = false; }, /pages inventory is not declared complete/],
  ["an incomplete zone inventory", (a) => { a.inventory.zones.complete = "yes"; }, /zones inventory is not declared complete/],
  ["a Pages inventory with no declared authority", (a) => { delete a.inventory.pages.authority; }, /pages inventory must declare authority deploy_credential/],
  ["a zone inventory attributed to the wrong authority", (a) => { a.inventory.zones.authority = "deploy_credential"; }, /zones inventory must declare authority analytics_credential/],
  ["a non-integer zone inventory count", (a) => { a.inventory.zones.count = "2"; }, /zones inventory count must be a non-negative integer/],
  ["a missing inventory", (a) => { delete a.inventory; }, /inventory\.zones is missing/],
  ["a property with no evidence block", (a) => { delete a.properties[0].evidence; }, /no evidence accounting/],
  ["an invalid evidence status", (a) => { a.properties[0].evidence.dns.status = "maybe"; }, /invalid dns evidence status/],
  ["unavailable evidence with no reason", (a) => { a.properties[0].evidence.pages = { status: "unavailable", authority: "deploy_credential" }; a.properties[0].pages = {}; }, /without an explicit reason/],
  ["unavailable evidence with a blank reason", (a) => { a.properties[0].evidence.pages = { status: "no_project", authority: "deploy_credential", reason: "  " }; a.properties[0].pages = {}; }, /without an explicit reason/],
  ["the wrong authority for Pages", (a) => { a.properties[0].evidence.pages.authority = "analytics_credential"; }, /pages evidence names the wrong authority/],
  ["observed Pages evidence with no project", (a) => { a.properties[0].pages = {}; }, /observed Pages evidence but carries no project/],
  ["Pages facts that the evidence does not claim", (a) => { a.properties[1].evidence.pages = { status: "no_project", authority: "deploy_credential", reason: "none" }; }, /Pages facts its evidence accounting does not claim/],
  ["observed zone evidence with no zone_status", (a) => { a.properties[0].zone_status = null; }, /no zone_status/],
  ["non-list DNS records", (a) => { a.properties[0].dns_apex = "nope"; }, /DNS records must be lists/],
  ["properties not being a list", (a) => { a.properties = {}; }, /properties must be a list/],
];
for (const [label, mutate, pattern] of mutations) {
  test(`validation fails closed on ${label}`, async () => {
    const artifact = await goodArtifact();
    mutate(artifact);
    assert.throws(() => validateEstateArtifact(artifact, { expectedZones: ["a.com", "b.com"] }), (error) => {
      assert.ok(error instanceof EstateValidationError);
      assert.match(error.message, pattern);
      return true;
    });
  });
}

test("Pages evidence unavailable for EVERY zone is a systemic failure, but all no_project is a valid known negative", async () => {
  const unavailable = await goodArtifact();
  for (const p of unavailable.properties) {
    p.pages = {};
    p.evidence.pages = { status: "unavailable", authority: "deploy_credential", reason: "HTTP 403" };
  }
  assert.throws(() => validateEstateArtifact(unavailable, { expectedZones: ["a.com", "b.com"] }), /pages evidence is unavailable for every governed zone/);

  const negative = await goodArtifact();
  for (const p of negative.properties) {
    p.pages = {};
    p.evidence.pages = { status: "no_project", authority: "deploy_credential", reason: "complete inventory, no project claims it" };
  }
  assert.doesNotThrow(() => validateEstateArtifact(negative, { expectedZones: ["a.com", "b.com"] }));
});

test("validation fails closed when a credential was serialized into the artifact", async () => {
  const artifact = await goodArtifact();
  artifact.properties[0].evidence.dns = { status: "unavailable", authority: "analytics_credential", reason: `leaked ${DEPLOY_TOKEN}` };
  assert.throws(
    () => validateEstateArtifact(artifact, { expectedZones: ["a.com", "b.com"], secrets: [ZONE_TOKEN, DEPLOY_TOKEN] }),
    /a credential was serialized/,
  );
});

test("validation reports every problem, not just the first", async () => {
  const artifact = await goodArtifact();
  artifact.fixture = true;
  artifact.inventory.pages.complete = false;
  artifact.properties.pop();
  await assert.rejects(
    async () => validateEstateArtifact(artifact, { expectedZones: ["a.com", "b.com"] }),
    (error) => error.problems.length >= 3,
  );
});

test("expected zones must be non-empty and unique", () => {
  assert.throws(() => parseExpectedZones(""), /no governed estate/);
  assert.throws(() => parseExpectedZones("a.com,a.com"), /duplicate/);
  assert.deepEqual(parseExpectedZones(" a.com , b.com,,"), ["a.com", "b.com"]);
});

// ---------------------------------------------------------------------------
// Hostile redaction: diagnostics must never become a secret-exfiltration path
// ---------------------------------------------------------------------------

const b64 = (s) => Buffer.from(s).toString("base64");
const hostileMessages = {
  "the live analytics token, raw": `denied for ${ZONE_TOKEN}`,
  "the live analytics token, URL-encoded": `denied for ${encodeURIComponent(ZONE_TOKEN + " x/y")}`,
  "the live analytics token, base64": `denied for ${b64(ZONE_TOKEN)}`,
  "the live analytics token, hex": `denied for ${Buffer.from(ZONE_TOKEN).toString("hex")}`,
  "the deploy token (not the request token), raw": `denied for ${DEPLOY_TOKEN}`,
  "an Authorization header echo": `request headers: Authorization: Bearer ${ZONE_TOKEN}, X-Other: 1`,
  "a lower-case standalone bearer": `token bearer abcDEF123._~+/=-tail`,
  "a mixed-case AUTHORIZATION with a quoted comma-delimited Digest value": `AuThOrIzAtIoN: Digest username="u", response="RESP123", cnonce="C"`,
  "a Cookie header": `Cookie: CF_Authorization=SESSIONSECRET; other=1`,
  "a Set-Cookie header": `Set-Cookie: session=SESSIONSECRET; HttpOnly`,
  "a Global API key header": `X-Auth-Key: 0123456789abcdef0123456789abcdef01234`,
  "a bare 37-hex Global API key": `key 0123456789abcdef0123456789abcdef01234 leaked`,
  "an api_key assignment": `api_key=SUPERSECRETVALUE and more`,
  "a GitHub PAT": `ghp_abcdefghijklmnopqrstuvwxyz0123456789`,
  "a fine-grained GitHub PAT": `github_pat_11ABCDEFG0abcdefghijklmnopqrstuv_wxyz`,
  "a long opaque secret that is not ours": "Z".repeat(64),
  "a secret on a line after an embedded newline": `line one\nAuthorization: Bearer ${ZONE_TOKEN}`,
  "a secret split by carriage returns": `a\r\rCookie: SESSIONSECRET`,
  "a Unicode line separator hiding a header": `x\u2028Authorization: Bearer hidden`,
};

for (const [label, message] of Object.entries(hostileMessages)) {
  test(`redact() scrubs ${label}`, () => {
    const out = redact(message, [ZONE_TOKEN, DEPLOY_TOKEN]);
    for (const needle of [ZONE_TOKEN, DEPLOY_TOKEN, "SESSIONSECRET", "SUPERSECRETVALUE", "RESP123", "0123456789abcdef0123456789abcdef01234", "abcdefghijklmnopqrstuvwxyz0123456789", "hidden", "abcDEF123"]) {
      assert.ok(!out.includes(needle), `${label}: leaked ${needle} in ${JSON.stringify(out)}`);
    }
    assert.ok(!out.includes(b64(ZONE_TOKEN)) && !out.includes(encodeURIComponent(ZONE_TOKEN)));
    assert.ok(!/[\r\n\u2028\u2029]/.test(out), "output must be a single line");
  });
}

test("redact() strips terminal escapes and workflow-command injection framing", () => {
  const out = redact("\u001b[31mred\u001b[0m\n::add-mask::x\n::error::forged", []);
  assert.ok(!out.includes("\u001b"));
  assert.ok(!/(^|\n)::/.test(out), "no line may begin with a workflow command");
});

test("redact() never throws on non-string input or hostile secrets", () => {
  assert.doesNotThrow(() => redact(undefined, [null, undefined, 42, "", "a"]));
  assert.doesNotThrow(() => redact({ toString() { return "x"; } }, [ZONE_TOKEN]));
});

test("redact() leaves ordinary diagnostics readable", () => {
  const text = "zone-list request rejected: HTTP 403 — Cloudflare error 10000: Authentication error";
  assert.equal(redact(text, [ZONE_TOKEN]), text);
});

for (const [label, message] of Object.entries(hostileMessages)) {
  test(`a Cloudflare error message reflecting ${label} never reaches the thrown diagnostic`, async () => {
    await withMockServer(
      () => ({ status: 401, body: { success: false, errors: [{ code: 10000, message }] } }),
      async (base) => {
        await assert.rejects(acquire(base, ["a.com"]), (error) => {
          for (const needle of [ZONE_TOKEN, DEPLOY_TOKEN, "SESSIONSECRET", "SUPERSECRETVALUE", "RESP123", "abcdefghijklmnopqrstuvwxyz0123456789"]) {
            assert.ok(!error.message.includes(needle) && !error.reason.includes(needle), `leaked ${needle}`);
          }
          assert.ok(!/[\r\n]/.test(error.message));
          assert.match(error.message, /^zone-list request rejected: HTTP 401 — Cloudflare error 10000:/);
          return true;
        });
      },
    );
  });
}

test("a hostile Cloudflare error code cannot smuggle text into the diagnostic", async () => {
  await withMockServer(
    () => ({ status: 401, body: { success: false, errors: [{ code: `evil ${ZONE_TOKEN}\n::error::x`, message: "m" }] } }),
    async (base) => {
      await assert.rejects(acquire(base, ["a.com"]), (error) => {
        assert.match(error.message, /Cloudflare error unknown: m/);
        assert.ok(!error.message.includes(ZONE_TOKEN));
        return true;
      });
    },
  );
});

test("a hostile non-JSON error body reflecting the token is redacted and bounded", async () => {
  await withMockServer(
    () => ({ status: 500, raw: `${"A".repeat(5)} Authorization: Bearer ${ZONE_TOKEN} ${"x".repeat(5000)}`, contentType: "text/plain" }),
    async (base) => {
      await assert.rejects(acquire(base, ["a.com"]), (error) => {
        assert.ok(!error.message.includes(ZONE_TOKEN));
        assert.ok(error.message.length < 600, `unbounded diagnostic (${error.message.length})`);
        return true;
      });
    },
  );
});

test("a token reflected into a per-zone DNS reason is redacted in the artifact and its warning", async () => {
  const cloudflare = healthyCloudflare([zone("a.com"), zone("b.com")]);
  await withMockServer(
    (url) =>
      url.pathname === "/zones/id-b.com/dns_records"
        ? { status: 403, body: { success: false, errors: [{ code: 10000, message: `bad token ${ZONE_TOKEN} / ${DEPLOY_TOKEN}` }] } }
        : cloudflare(url),
    async (base) => {
      const warnings = [];
      const artifact = await acquire(base, ["a.com", "b.com"], { onWarning: (m) => warnings.push(m) });
      const blob = JSON.stringify(artifact) + warnings.join("\n");
      assert.ok(!blob.includes(ZONE_TOKEN) && !blob.includes(DEPLOY_TOKEN));
    },
  );
});

test("a hostile scalar in result_info cannot surface through a runtime error", async () => {
  await withMockServer(
    () => ({ status: 200, body: { success: true, result: [zone("a.com")], result_info: { page: 1, total_pages: ZONE_TOKEN } } }),
    async (base) => {
      await assert.rejects(acquire(base, ["a.com"]), (error) => {
        assert.ok(!error.message.includes(ZONE_TOKEN));
        assert.match(error.message, /non-positive-integer result_info\.total_pages/);
        return true;
      });
    },
  );
});

test("the network-failure diagnostic carries no token even though the token is in the request", async () => {
  await assert.rejects(
    cfGet({ base: "http://127.0.0.1:1", path: "/zones", token: ZONE_TOKEN, operation: "zone-list", endpointClass: "zones", retries: 0 }),
    (error) => {
      assert.ok(!error.message.includes(ZONE_TOKEN));
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// CLI: exit codes, no artifact on failure, stderr never leaks
// ---------------------------------------------------------------------------

async function cliFixture() {
  const dir = await mkdtemp(path.join(tmpdir(), "estate-"));
  const pagesFile = path.join(dir, "pages.json");
  await writeFile(pagesFile, JSON.stringify({ success: true, result: PAGES }));
  return { dir, pagesFile, out: path.join(dir, "estate.json"), summary: path.join(dir, "summary.md") };
}
const cliEnv = (base, extra = {}) => ({
  CF_API_BASE: base,
  CF_ACCOUNT_ID: "acct",
  CF_ZONE_API_TOKEN: ZONE_TOKEN,
  CLOUDFLARE_API_TOKEN: DEPLOY_TOKEN,
  CF_EXPECTED_ZONES: "a.com,b.com",
  ...extra,
});
const exists = (file) => access(file).then(() => true, () => false);

test("CLI build writes a validated artifact, the accounting summary and the counters", async () => {
  const fx = await cliFixture();
  await withMockServer(healthyCloudflare([zone("a.com"), zone("b.com")]), async (base) => {
    const proc = await runCli(["build", "--pages-projects", fx.pagesFile, "--out", fx.out, "--summary", fx.summary], cliEnv(base));
    assert.equal(proc.status, 0, proc.stderr);
    assert.match(proc.stdout, /estate_config_properties=2/);
    assert.match(proc.stdout, /governed_zones=2/);
    assert.match(proc.stdout, /pages_inventory_projects=2/);
    const artifact = JSON.parse(await readFile(fx.out, "utf8"));
    assert.equal(artifact.contract_name, "gfd-estate-config");
    const summary = await readFile(fx.summary, "utf8");
    assert.match(summary, /Governed zones: \*\*2\*\*/);
    assert.match(summary, /\| a\.com \| observed \| observed \| observed \| site-a \| github \|/);
    assert.match(summary, /\| b\.com \|.*\| site-b \| direct upload \|/);
    assert.ok(!(await readdir(fx.dir)).some((f) => f.includes(".tmp-")), "no temp file left behind");
    const validate = await runCli(["validate", "--artifact", fx.out], cliEnv(base));
    assert.equal(validate.status, 0, validate.stderr);
    assert.match(validate.stdout, /estate_artifact_valid=true governed=2/);
  });
});

test("CLI build against a rejecting API exits non-zero, writes NO artifact, and explains without leaking", async () => {
  const fx = await cliFixture();
  await withMockServer(
    () => ({ status: 403, body: { success: false, errors: [{ code: 10000, message: `Authentication error for ${ZONE_TOKEN} and ${DEPLOY_TOKEN}` }] } }),
    async (base) => {
      const proc = await runCli(["build", "--pages-projects", fx.pagesFile, "--out", fx.out], cliEnv(base));
      assert.notEqual(proc.status, 0);
      assert.match(proc.stderr, /estate-config acquisition failed: zone-list request rejected: HTTP 403 — Cloudflare error 10000: Authentication error/);
      assert.ok(!(proc.stdout + proc.stderr).includes(ZONE_TOKEN));
      assert.ok(!(proc.stdout + proc.stderr).includes(DEPLOY_TOKEN));
      assert.equal(await exists(fx.out), false, "an incomplete estate artifact must not exist on disk");
    },
  );
});

test("CLI build fails closed on a later-page failure without a partial artifact", async () => {
  const fx = await cliFixture();
  await withMockServer(
    (url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return page === 1
        ? ok([zone("a.com")], { page: 1, total_pages: 2, total_count: 2 })
        : { status: 500, body: { success: false, errors: [{ code: 1, message: "later page down" }] } };
    },
    async (base) => {
      const proc = await runCli(["build", "--pages-projects", fx.pagesFile, "--out", fx.out], cliEnv(base));
      assert.notEqual(proc.status, 0);
      assert.match(proc.stderr, /HTTP 500/);
      assert.equal(await exists(fx.out), false);
    },
  );
});

test("CLI build refuses to write when systemic DNS failure leaves the estate unaccounted", async () => {
  const fx = await cliFixture();
  await withMockServer(
    (url) =>
      url.pathname.endsWith("/dns_records")
        ? { status: 403, body: { success: false, errors: [{ code: 10000, message: "nope" }] } }
        : healthyCloudflare([zone("a.com"), zone("b.com")])(url),
    async (base) => {
      const proc = await runCli(["build", "--pages-projects", fx.pagesFile, "--out", fx.out], cliEnv(base));
      assert.notEqual(proc.status, 0);
      assert.match(proc.stderr, /systemic acquisition failure/);
      assert.equal(await exists(fx.out), false);
    },
  );
});

test("CLI build against an unreachable API never prints the token", async () => {
  const fx = await cliFixture();
  const proc = await runCli(["build", "--pages-projects", fx.pagesFile, "--out", fx.out], cliEnv("http://127.0.0.1:1"));
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /unable to reach Cloudflare API \(endpoint class: zones\)/);
  assert.ok(!(proc.stdout + proc.stderr).includes(ZONE_TOKEN));
});

test("CLI reduces an unexpected runtime error to its class name", async () => {
  const fx = await cliFixture();
  await writeFile(fx.pagesFile, JSON.stringify({ success: true, result: PAGES }));
  const proc = await runCli(["validate", "--artifact", path.join(fx.dir, "does-not-exist.json")], cliEnv("http://127.0.0.1:1"));
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /estate-config acquisition failed: unexpected Error/);
  assert.ok(!proc.stderr.includes(fx.dir), "an unexpected error must not echo file paths or messages");
});

test("CLI validate rejects an artifact that silently dropped a governed zone", async () => {
  const fx = await cliFixture();
  const artifact = await goodArtifact();
  artifact.properties.pop();
  await writeFile(fx.out, JSON.stringify(artifact));
  const proc = await runCli(["validate", "--artifact", fx.out], cliEnv("http://127.0.0.1:1"));
  assert.notEqual(proc.status, 0);
  assert.match(proc.stderr, /governed zone b\.com is silently absent/);
});

test("CLI requires the credentials and an expected estate", async () => {
  const fx = await cliFixture();
  const noToken = await runCli(["build", "--pages-projects", fx.pagesFile, "--out", fx.out], cliEnv("http://127.0.0.1:1", { CF_ZONE_API_TOKEN: "" }));
  assert.notEqual(noToken.status, 0);
  assert.match(noToken.stderr, /CF_ZONE_API_TOKEN is required/);
  const noZones = await runCli(["build", "--pages-projects", fx.pagesFile, "--out", fx.out], cliEnv("http://127.0.0.1:1", { CF_EXPECTED_ZONES: "" }));
  assert.notEqual(noZones.status, 0);
  assert.match(noZones.stderr, /no governed estate/);
});

// ---------------------------------------------------------------------------
// Summary rendering
// ---------------------------------------------------------------------------

test("summary rendering neutralises table-breaking and multi-line reason text", async () => {
  const artifact = await goodArtifact();
  artifact.properties[0].evidence.dns = { status: "unavailable", authority: "analytics_credential", reason: "a | b\n| injected | row |" };
  const summary = renderSummary(artifact);
  const rows = summary.split("\n").filter((line) => line.startsWith("| a.com"));
  assert.equal(rows.length, 1);
  assert.ok(rows[0].includes("a \\| b"));
});

// ---------------------------------------------------------------------------
// Direct paginator contract (used for zones and DNS)
// ---------------------------------------------------------------------------

test("fetchAllPages never returns a partial inventory: any failure rejects", async () => {
  await withMockServer(
    (url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (page === 3) return { status: 502, body: { success: false, errors: [{ code: 1, message: "gateway" }] } };
      return ok([{ id: `i${page}` }], { page, total_pages: 3 });
    },
    async (base) => {
      const result = await fetchAllPages({ base, path: "/x", token: ZONE_TOKEN, operation: "x-list", endpointClass: "x", ...FAST }).then(
        (items) => ({ items }),
        (error) => ({ error }),
      );
      assert.equal(result.items, undefined);
      assert.match(result.error.message, /x-list request rejected: HTTP 502/);
    },
  );
});

// ---------------------------------------------------------------------------
// Workflow guards: the rejected Pages request form must never come back
// ---------------------------------------------------------------------------

test("the workflow never sends per_page to the Pages project endpoint", async () => {
  const workflow = await readFile(WORKFLOW, "utf8");
  for (const line of workflow.split("\n")) {
    if (/pages\/projects\b(?!\/\$)/.test(line) && !/\/domains/.test(line) && !line.trim().startsWith("#")) {
      assert.ok(!/per_page/.test(line), `Pages project listing must not use per_page: ${line.trim()}`);
    }
  }
  const pagesScript = await readFile(path.join(HERE, "cf-pages-projects.sh"), "utf8");
  const requestLines = pagesScript.split("\n").filter((line) => line.includes("pages/projects?"));
  assert.ok(requestLines.length > 0);
  for (const line of requestLines) assert.ok(!/per_page/.test(line), line);
});

test("the workflow builds the estate through the tested script, not inline shell", async () => {
  const workflow = await readFile(WORKFLOW, "utf8");
  assert.match(workflow, /scripts\/cf-pages-projects\.sh/);
  assert.match(workflow, /node scripts\/cf-estate-config\.mjs build/);
  assert.match(workflow, /estate-config-1\.1\.production\.json/);
  assert.ok(!/estate-config-1\.0\.production\.json/.test(workflow), "the legacy 1.0 estate artifact name must not be produced");
  assert.ok(!/api\.cloudflare\.com\/client\/v4\/zones"/.test(workflow.split("Acquire bounded Cloudflare estate configuration evidence")[1]?.split("Rebuild insights")[0] ?? ""), "no inline zone curl in the estate step");
});
