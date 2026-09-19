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
