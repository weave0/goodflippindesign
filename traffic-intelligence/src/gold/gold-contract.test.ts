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

describe("presentation Gold fixture", () => {
  const gold = loadFixture();

  it("is labeled fixture and carries canonical 1.2", () => {
    expect(gold.contract.kind).toBe("fixture");
    expect(gold.canonical?.schema_version).toBe("1.2.0");
    expect(gold.contract.generatedAt).toBe(gold.canonical?.generated_at);
  });

  it("does not use site-row sums as the overview edge total", () => {
    const payload = selectWindow(gold, gold.defaultWindowId);
    const overview = payload.overview.metrics.find((m) => m.id === "edge.requests" || m.metric_id === "edge.requests");
    if (!overview) return;
    const siteSum = payload.sites.reduce((acc, site) => {
      const requests = site.metrics.find((m) => m.id.endsWith(".requests") && m.source === "cloudflare");
      if (requests?.value == null) return acc;
      return acc === null ? null : acc + requests.value;
    }, 0 as number | null);
    expect(overview.value).not.toBe(siteSum);
    expect(overview.source).toBe("cloudflare");
  });

  it("keeps unavailable/unknowable values null", () => {
    for (const metric of collectMetrics(gold)) {
      if (metric.evidence_state === "unavailable" || metric.evidence_state === "unknowable") {
        expect(metric.value).toBeNull();
      }
    }
  });
});
