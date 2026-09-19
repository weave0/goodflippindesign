// Regression coverage for scripts/cf-pages-projects.sh — the TI-012 estate
// config Pages inventory defect (PR #305). Spawns the real script against a
// local mock of the Cloudflare Pages project-list endpoint so these tests
// exercise the exact bash/curl/jq logic the production workflow runs, not a
// reimplementation of it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), "cf-pages-projects.sh");

function project(id, name) {
  return { id, name, domains: [`${name}.example.com`] };
}

// handler receives (req, url) and returns { status, body } or throws to
// simulate a network failure.
async function withMockServer(handler, run) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url);
    let result;
    try {
      result = handler(req, url, requests.length);
    } catch {
      req.destroy();
      return;
    }
    res.writeHead(result.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.body));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

// Async on purpose: a synchronous spawn would block this process's single
// event loop while curl waits on it, and the mock HTTP server below runs on
// that same event loop — a sync spawn would deadlock the server against its
// own client.
async function runScript(baseUrl) {
  try {
    const { stdout, stderr } = await execFileAsync(SCRIPT, [], {
      env: {
        ...process.env,
        CF_API_BASE: baseUrl,
        CF_ACCOUNT_ID: "test-account",
        CLOUDFLARE_API_TOKEN: "test-token",
      },
      encoding: "utf8",
      // Default (1MB) is smaller than a large real-world inventory; raise
      // it so the harness doesn't mask output the script legitimately
      // produced (see the large-inventory regression test below).
      maxBuffer: 64 * 1024 * 1024,
    });
    return { status: 0, stdout, stderr };
  } catch (error) {
    return {
      status: typeof error.code === "number" ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

test("one-page Pages inventory works", async () => {
  await withMockServer(
    () => ({
      status: 200,
      body: {
        success: true,
        result: [project("p1", "site-one"), project("p2", "site-two")],
        result_info: { page: 1, total_pages: 1 },
      },
    }),
    async (baseUrl, requests) => {
      const proc = await runScript(baseUrl);
      assert.equal(proc.status, 0, proc.stderr);
      const out = JSON.parse(proc.stdout);
      assert.equal(out.success, true);
      assert.equal(out.result.length, 2);
      assert.deepEqual(out.result.map((p) => p.id).sort(), ["p1", "p2"]);
      assert.equal(requests.length, 1);
    }
  );
});

test("multi-page inventory aggregates all projects, including one only on a later page", async () => {
  await withMockServer(
    (req, url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (page === 1) {
        return {
          status: 200,
          body: {
            success: true,
            result: [project("p1", "site-one")],
            result_info: { page: 1, total_pages: 3 },
          },
        };
      }
      if (page === 2) {
        return {
          status: 200,
          body: {
            success: true,
            result: [project("p2", "site-two")],
            result_info: { page: 2, total_pages: 3 },
          },
        };
      }
      return {
        status: 200,
        body: {
          success: true,
          // This project only ever appears on the final page.
          result: [project("p3", "site-three-late-page")],
          result_info: { page: 3, total_pages: 3 },
        },
      };
    },
    async (baseUrl, requests) => {
      const proc = await runScript(baseUrl);
      assert.equal(proc.status, 0, proc.stderr);
      const out = JSON.parse(proc.stdout);
      const ids = out.result.map((p) => p.id).sort();
      assert.deepEqual(ids, ["p1", "p2", "p3"]);
      const lateProject = out.result.find((p) => p.id === "p3");
      assert.ok(lateProject, "project appearing only on a later page must be represented");
      assert.equal(lateProject.name, "site-three-late-page");
      assert.equal(requests.length, 3);
    }
  );
});

test("a failed later-page request fails closed and yields no output", async () => {
  await withMockServer(
    (req, url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      if (page === 1) {
        return {
          status: 200,
          body: {
            success: true,
            result: [project("p1", "site-one")],
            result_info: { page: 1, total_pages: 2 },
          },
        };
      }
      return {
        status: 400,
        body: {
          success: false,
          errors: [{ code: 1000, message: "simulated later-page failure" }],
          result: null,
        },
      };
    },
    async (baseUrl) => {
      const proc = await runScript(baseUrl);
      assert.notEqual(proc.status, 0, "script must fail closed, not exit 0");
      assert.equal(proc.stdout.trim(), "", "a failed later page must not yield a falsely complete artifact");
      assert.match(proc.stderr, /rejected on page 2/);
      assert.match(proc.stderr, /HTTP 400/);
      assert.match(proc.stderr, /1000/);
      assert.match(proc.stderr, /simulated later-page failure/);
    }
  );
});

test("inconsistent total_pages across requests fails closed", async () => {
  await withMockServer(
    (req, url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      const totalPages = page === 1 ? 2 : 5; // total_pages changes mid-pagination
      return {
        status: 200,
        body: {
          success: true,
          result: [project(`p${page}`, `site-${page}`)],
          result_info: { page, total_pages: totalPages },
        },
      };
    },
    async (baseUrl) => {
      const proc = await runScript(baseUrl);
      assert.notEqual(proc.status, 0);
      assert.equal(proc.stdout.trim(), "");
      assert.match(proc.stderr, /pagination became inconsistent/);
    }
  );
});

test("duplicate projects across pages fail closed", async () => {
  await withMockServer(
    (req, url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return {
        status: 200,
        body: {
          success: true,
          // Same id on every page.
          result: [project("dupe", `site-page-${page}`)],
          result_info: { page, total_pages: 2 },
        },
      };
    },
    async (baseUrl) => {
      const proc = await runScript(baseUrl);
      assert.notEqual(proc.status, 0);
      assert.match(proc.stderr, /duplicate project ids/);
    }
  );
});

test("the previously rejected per_page request form is never sent again", async () => {
  await withMockServer(
    (req, url) => {
      if (url.searchParams.has("per_page")) {
        return {
          status: 400,
          body: {
            success: false,
            errors: [{ code: 9109, message: "per_page is not a supported query parameter" }],
          },
        };
      }
      return {
        status: 200,
        body: {
          success: true,
          result: [project("p1", "site-one")],
          result_info: { page: 1, total_pages: 1 },
        },
      };
    },
    async (baseUrl, requests) => {
      const proc = await runScript(baseUrl);
      assert.equal(proc.status, 0, proc.stderr);
      assert.ok(requests.length > 0);
      for (const url of requests) {
        assert.equal(url.searchParams.has("per_page"), false, "per_page must not be reintroduced");
      }
    }
  );
});

test("a large inventory does not overflow the argument list (production regression)", async () => {
  // Production run 35414829781 failed with "Argument list too long" because
  // the final aggregation step passed the whole project list as a jq
  // --argjson CLI argument. A real account can have enough Pages projects
  // to exceed ARG_MAX (~2MB on Linux) that way. Build a payload comfortably
  // past that so a regression trips this test instead of production.
  const bigProjects = Array.from({ length: 20000 }, (_, i) =>
    project(`id-${i}-${"x".repeat(40)}`, `site-${i}-${"y".repeat(40)}`)
  );
  await withMockServer(
    () => ({
      status: 200,
      body: {
        success: true,
        result: bigProjects,
        result_info: { page: 1, total_pages: 1 },
      },
    }),
    async (baseUrl) => {
      const proc = await runScript(baseUrl);
      assert.equal(proc.status, 0, proc.stderr);
      const out = JSON.parse(proc.stdout);
      assert.equal(out.result.length, 20000);
    }
  );
});

// --- Hostile redaction tests -----------------------------------------
// Diagnostics must never become a secret-exfiltration path. These assume
// a worst case: Cloudflare's own error body (or a malicious/compromised
// endpoint standing in for it) reflects the credential back verbatim.
// runScript always sets CLOUDFLARE_API_TOKEN="test-token".

test("redacts the live token when Cloudflare's error message reflects it back", async () => {
  await withMockServer(
    () => ({
      status: 400,
      body: {
        success: false,
        errors: [{ code: 9999, message: "Rejected for Authorization: Bearer test-token — token test-token is invalid" }],
      },
    }),
    async (baseUrl) => {
      const proc = await runScript(baseUrl);
      assert.notEqual(proc.status, 0);
      assert.doesNotMatch(proc.stderr, /test-token/, "the raw token value must never appear in diagnostics");
      assert.match(proc.stderr, /\[REDACTED\]/);
      assert.match(proc.stderr, /rejected on page 1/);
      assert.match(proc.stderr, /HTTP 400/);
    }
  );
});

test("redacts Authorization/Bearer/Cookie shapes even for a credential that isn't the live token", async () => {
  await withMockServer(
    () => ({
      status: 403,
      body: {
        success: false,
        errors: [{
          code: 9106,
          message: 'Upstream debug echo: {"authorization":"Bearer sk-unrelated-secret-abc123","cookie":"session=other-secret-xyz789"} Authorization: Bearer another-leaked-value; Cookie: raw=leaked-cookie-value',
        }],
      },
    }),
    async (baseUrl) => {
      const proc = await runScript(baseUrl);
      assert.notEqual(proc.status, 0);
      for (const leaked of [
        "sk-unrelated-secret-abc123",
        "other-secret-xyz789",
        "another-leaked-value",
        "leaked-cookie-value",
      ]) {
        assert.doesNotMatch(
          proc.stderr,
          new RegExp(leaked.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")),
          `credential-shaped value "${leaked}" must be redacted`
        );
      }
      assert.match(proc.stderr, /\[REDACTED\]/);
      assert.match(proc.stderr, /HTTP 403/);
    }
  );
});

test("redacts the token in a network-failure diagnostic (no server listening)", async () => {
  // Point at a closed local port so curl fails at the transport level,
  // exercising the "unable to reach Cloudflare API" path directly.
  const proc = await runScript("http://127.0.0.1:1");
  assert.notEqual(proc.status, 0);
  assert.doesNotMatch(proc.stderr, /test-token/);
  assert.match(proc.stderr, /unable to reach Cloudflare API/);
  assert.match(proc.stderr, /endpoint class: pages\/projects/);
});
