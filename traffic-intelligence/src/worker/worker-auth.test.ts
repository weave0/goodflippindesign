// @vitest-environment node
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// The Pages advanced-mode worker is plain JS shipped verbatim from public/. Import it by URL so it is exercised
// exactly as deployed (no TypeScript declaration shim, no bundler transform).
type Worker = { fetch(request: Request, env: Env): Promise<Response> };
type Env = { ASSETS: { fetch(request: Request): Promise<Response> }; MISSION_CONTROL_FEED_TOKEN?: string };

const FEED_SECRET = "mcf_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8S9t0U1v";
const ADMIN_JWT = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyXzEifQ.c2lnbmF0dXJl";
const GOLD = "https://traffic.goodflippindesign.com/gold/canonical-gold-m1.2.json";
const INSIGHTS = "https://traffic.goodflippindesign.com/gold/traffic-insights-1.0.json";

let worker: Worker;

beforeAll(async () => {
  const url = new URL("../../public/_worker.js", import.meta.url).href;
  worker = (await import(/* @vite-ignore */ url)).default as Worker;
});

const assets = () => ({
  fetch: vi.fn(async (request: Request) => new Response(JSON.stringify({ path: new URL(request.url).pathname, contract_name: "gfd-canonical-gold" }), { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" } })),
});

const envWith = (overrides: Partial<Env> = {}): Env & { ASSETS: ReturnType<typeof assets> } => ({ ASSETS: assets(), MISSION_CONTROL_FEED_TOKEN: FEED_SECRET, ...overrides }) as Env & { ASSETS: ReturnType<typeof assets> };

const call = (url: string, { token, method = "GET", env = envWith() }: { token?: string; method?: string; env?: Env } = {}) =>
  worker.fetch(new Request(url, { method, headers: token ? { Authorization: "Bearer " + token } : {} }), env);

const profileFetch = (status: number, body: unknown = {}) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

afterEach(() => vi.restoreAllMocks());

describe("Gold wall: no credential", () => {
  it("denies an unauthenticated request without touching the asset store or the profile service", async () => {
    const spy = profileFetch(200, { email: "brett.l.weaver@gmail.com" });
    const env = envWith();
    const response = await call(GOLD, { env });
    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
    expect(env.ASSETS.fetch).not.toHaveBeenCalled();
  });

  it("denied responses stay private, no-store and noindex", async () => {
    const response = await call(GOLD);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toMatch(/noindex/);
    expect(response.headers.get("Vary")).toBe("Authorization");
  });
});

describe("Gold wall: Mission Control service credential", () => {
  it("serves both governed documents for a valid feed token, privately and non-publicly", async () => {
    for (const url of [GOLD, INSIGHTS]) {
      const response = await call(url, { token: FEED_SECRET });
      expect(response.status).toBe(200);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
      expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
      expect(response.headers.get("Vary")).toBe("Authorization");
      expect((await response.json()).contract_name).toBe("gfd-canonical-gold");
    }
  });

  it("never calls the Clerk profile service for a feed credential", async () => {
    const spy = profileFetch(200, { email: "brett.l.weaver@gmail.com" });
    await call(GOLD, { token: FEED_SECRET });
    await call(GOLD, { token: "mcf_wrong" });
    expect(spy).not.toHaveBeenCalled();
  });

  it("rejects a wrong, truncated, extended, or differently-cased token", async () => {
    for (const bad of ["mcf_wrong", FEED_SECRET.slice(0, -1), FEED_SECRET + "x", FEED_SECRET.toLowerCase(), "mcf_", FEED_SECRET.slice(4)]) {
      const env = envWith();
      const response = await call(GOLD, { token: bad, env });
      expect(response.status, bad).toBe(401);
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
  });

  it("fails closed when the secret is unset, empty, or too weak, even if the caller presents the same string", async () => {
    for (const secret of [undefined, "", "mcf_short"]) {
      const env = envWith({ MISSION_CONTROL_FEED_TOKEN: secret });
      const response = await call(GOLD, { token: secret ?? "mcf_", env });
      expect(response.status).toBe(401);
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
  });

  it("is read-only: mutating methods are refused before any asset is served", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const env = envWith();
      const response = await call(GOLD, { token: FEED_SECRET, method, env });
      expect(response.status, method).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET, HEAD");
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
    expect((await call(GOLD, { token: FEED_SECRET, method: "HEAD" })).status).toBe(200);
  });

  it("is limited to the governed Gold documents, not the rest of /gold or its variants", async () => {
    for (const path of ["fixture.v1.json", "ti-work-queue-1.0.json", "CANONICAL_PROVENANCE.md", "canonical-gold-m1.2.json/../fixture.v1.json", "%63anonical-gold-m1.2.json", "Canonical-Gold-M1.2.json"]) {
      const env = envWith();
      const response = await call("https://traffic.goodflippindesign.com/gold/" + path, { token: FEED_SECRET, env });
      expect(response.status, path).toBe(403);
      expect(env.ASSETS.fetch, path).not.toHaveBeenCalled();
    }
  });

  it("cannot reach the admin session: it is a feed credential, not an admin identity", async () => {
    const spy = profileFetch(200, { email: "brett.l.weaver@gmail.com" });
    const response = await call("https://traffic.goodflippindesign.com/api/admin-session", { token: FEED_SECRET });
    expect(response.status).toBe(401);
    expect(spy).not.toHaveBeenCalled();
  });

  it("does not gate or expose anything outside /gold with the feed credential, and never serves the app shell as Gold", async () => {
    const env = envWith();
    const response = await call("https://traffic.goodflippindesign.com/", { token: FEED_SECRET, env });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).not.toBe("private, no-store, max-age=0");
  });

  it("never serializes the secret into any response body or header, allowed or denied", async () => {
    const cases: Array<Promise<Response>> = [
      call(GOLD, { token: FEED_SECRET }),
      call(GOLD, { token: FEED_SECRET, method: "POST" }),
      call(GOLD, { token: FEED_SECRET + "x" }),
      call(GOLD),
      call("https://traffic.goodflippindesign.com/gold/fixture.v1.json", { token: FEED_SECRET }),
      call("https://traffic.goodflippindesign.com/api/admin-session", { token: FEED_SECRET }),
    ];
    for (const response of await Promise.all(cases)) {
      const headers = [...response.headers.entries()].flat().join("\n");
      expect(headers).not.toContain(FEED_SECRET);
      expect(await response.text()).not.toContain(FEED_SECRET);
    }
  });

  it("never logs the secret", async () => {
    const sinks = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    await call(GOLD, { token: FEED_SECRET });
    await call(GOLD, { token: FEED_SECRET + "x" });
    for (const sink of sinks) expect(JSON.stringify(sink.mock.calls)).not.toContain(FEED_SECRET);
  });
});

describe("Gold wall: human administrator", () => {
  it("still admits a valid administrator session, forwarding it for verification", async () => {
    const spy = profileFetch(200, { email: "Brett.L.Weaver@gmail.com" });
    const response = await call(GOLD, { token: ADMIN_JWT });
    expect(response.status).toBe(200);
    expect(spy).toHaveBeenCalledTimes(1);
    const [target, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(target).toBe("https://goodflippindesign.com/api/profile");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer " + ADMIN_JWT);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  });

  it("gives administrators the whole Gold folder, unlike the feed credential", async () => {
    profileFetch(200, { email: "brett.l.weaver@gmail.com" });
    expect((await call("https://traffic.goodflippindesign.com/gold/fixture.v1.json", { token: ADMIN_JWT })).status).toBe(200);
    expect((await call("https://traffic.goodflippindesign.com/gold/ti-work-queue-1.0.json", { token: ADMIN_JWT })).status).toBe(200);
  });

  it("admits administrators even when the feed secret is not configured", async () => {
    profileFetch(200, { email: "brett.l.weaver@gmail.com" });
    expect((await call(GOLD, { token: ADMIN_JWT, env: envWith({ MISSION_CONTROL_FEED_TOKEN: undefined }) })).status).toBe(200);
  });

  it("keeps the admin session endpoint working for administrators", async () => {
    profileFetch(200, { email: "brett.l.weaver@gmail.com" });
    const response = await call("https://traffic.goodflippindesign.com/api/admin-session", { token: ADMIN_JWT });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, admin: true });
  });

  it("still refuses non-administrators, rejected sessions, and an unavailable profile service", async () => {
    profileFetch(200, { email: "someone@example.com" });
    expect((await call(GOLD, { token: ADMIN_JWT })).status).toBe(403);
    vi.restoreAllMocks();
    profileFetch(401);
    expect((await call(GOLD, { token: ADMIN_JWT })).status).toBe(401);
    vi.restoreAllMocks();
    profileFetch(500);
    expect((await call(GOLD, { token: ADMIN_JWT })).status).toBe(503);
  });

  it("cannot be bypassed by /GOLD or percent-encoded spellings of the wall", async () => {
    for (const path of ["/GOLD/canonical-gold-m1.2.json", "/%67old/canonical-gold-m1.2.json", "/Gold/traffic-insights-1.0.json"]) {
      const env = envWith();
      const response = await call("https://traffic.goodflippindesign.com" + path, { env });
      expect(response.status, path).toBe(401);
      expect(env.ASSETS.fetch).not.toHaveBeenCalled();
    }
  });
});
