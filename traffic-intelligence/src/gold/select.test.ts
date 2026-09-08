import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptGold } from "./adapter";
import { assertGoldContract } from "./assert";
import { filterMetrics, overviewMetrics, selectSite, selectWindow } from "./select";
import { FILTER_DEFAULTS } from "./url-state";
import type { GoldContract } from "./types";

const gold = assertAndLoad();

function assertAndLoad(): GoldContract {
  const data = adaptGold(
    JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/fixture.v1.json"), "utf8"),
    ) as unknown,
  );
  assertGoldContract(data);
  return data;
}

describe("slice selection", () => {
  it("returns precomputed windows instead of synthesizing one", () => {
    const seven = selectWindow(gold, "7d");
    const month = selectWindow(gold, "28d");
    expect(seven.window.id).toBe("7d");
    expect(month.window.id).toBe("28d");
    expect(seven.overview.metrics[0]?.timeWindow.id).toBe("7d");
  });

  it("uses site metrics when a site is selected, otherwise overview", () => {
    const payload = selectWindow(gold, "28d");
    const site = selectSite(payload, "gfd");
    expect(site?.domain).toBe("goodflippindesign.com");
    const siteMetrics = overviewMetrics(payload, site);
    const eco = overviewMetrics(payload, null);
    expect(siteMetrics[0]?.id).toContain("gfd");
    expect(eco[0]?.id).toBe("edge.requests");
  });

  it("filters metrics by source without combining remaining sources", () => {
    const payload = selectWindow(gold, "28d");
    const ga4 = filterMetrics(payload.overview.metrics, { ...FILTER_DEFAULTS, source: "ga4" });
    expect(ga4.length).toBeGreaterThan(0);
    expect(ga4.every((m) => m.source === "ga4")).toBe(true);
  });
});
