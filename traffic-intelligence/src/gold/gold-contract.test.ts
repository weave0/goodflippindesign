import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptGold } from "./adapter";
import { assertGoldContract, collectMetrics } from "./assert";
import { selectWindow } from "./select";
import type { GoldContract } from "./types";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/fixture.v1.json");

function loadFixture(): GoldContract {
  const data = adaptGold(JSON.parse(readFileSync(fixturePath, "utf8")) as unknown);
  assertGoldContract(data);
  return data;
}

describe("Gold fixture contract", () => {
  const gold = loadFixture();

  it("declares fixture kind and required definition terms", () => {
    expect(gold.contract.kind).toBe("fixture");
    expect(gold.contract.name).toBe("gfd-traffic-intelligence-gold");
    const terms = gold.definitions.map((d) => d.term);
    for (const term of [
      "visitor",
      "user",
      "session",
      "pageview",
      "human",
      "bot",
      "AI crawler",
      "AI agent",
      "threat",
      "confidence",
    ]) {
      expect(terms).toContain(term);
    }
  });

  it("lists six disjoint sources and never a combined source", () => {
    const ids = gold.sources.map((s) => s.id);
    expect(ids).toEqual([
      "cloudflare_edge",
      "cloudflare_rum",
      "ga4",
      "vercel",
      "first_party",
      "modeled",
    ]);
    const metrics = collectMetrics(gold);
    expect(metrics.every((m) => ids.includes(m.source))).toBe(true);
    expect(metrics.some((m) => /visitor/i.test(m.label) && m.source === "cloudflare_edge")).toBe(false);
  });

  it("keeps UNAVAILABLE/UNKNOWABLE values null and modeled metrics non-measured", () => {
    const metrics = collectMetrics(gold);
    for (const metric of metrics) {
      if (metric.evidenceState === "UNAVAILABLE" || metric.evidenceState === "UNKNOWABLE") {
        expect(metric.value).toBeNull();
      }
      if (metric.source === "modeled") expect(metric.evidenceState).not.toBe("MEASURED");
    }
  });

  it("does not use site-row sums as the overview edge total", () => {
    const payload = selectWindow(gold, "28d");
    const overview = payload.overview.metrics.find((m) => m.id === "edge.requests");
    const siteSum = payload.sites.reduce((acc, site) => {
      const requests = site.metrics.find((m) => m.id.endsWith(".requests") && m.source === "cloudflare_edge");
      return acc + (requests?.value ?? 0);
    }, 0);
    expect(overview?.value).toBeTypeOf("number");
    expect(overview?.value).not.toBe(siteSum);
    expect(overview?.source).toBe("cloudflare_edge");
  });

  it("ships named AI actors required by the UX contract", () => {
    const names = selectWindow(gold, "28d").ai.actors.map((a) => a.name);
    for (const name of ["ClaudeBot", "GPTBot", "ChatGPT-User", "Applebot", "Amazonbot", "Meta External Agent"]) {
      expect(names).toContain(name);
    }
  });
});
