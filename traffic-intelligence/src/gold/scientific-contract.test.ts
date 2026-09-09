import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptGold } from "./adapter";
import { assertGoldContract, collectMetrics } from "./assert";
import { formatMetric } from "./format";
import { sumOrNull } from "./null-arith";
import type { GoldContract } from "./types";

function load(): GoldContract {
  const data = adaptGold(
    JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/fixture.v1.json"), "utf8")) as unknown,
  );
  assertGoldContract(data);
  return data;
}

describe("presentation fixture after Gold 1.2 adapt", () => {
  const gold = load();
  const metrics = collectMetrics(gold);

  it("does not render unavailable/unknowable as zero", () => {
    for (const metric of metrics) {
      if (metric.evidence_state === "unavailable" || metric.evidence_state === "unknowable") {
        expect(metric.value).toBeNull();
        expect(formatMetric(metric)).not.toBe("0");
      }
    }
  });

  it("scientific sumOrNull refuses null inputs", () => {
    expect(sumOrNull([10, null])).toBeNull();
    expect(sumOrNull([0, 0])).toBe(0);
  });

  it("request metrics do not carry ecosystem human unique semantics", () => {
    for (const metric of metrics) {
      if (metric.semantics?.source_boundary === "request" || metric.grain === "request") {
        expect(metric.semantics?.unique_count_semantics ?? "not_unique_count").not.toBe("ecosystem_human_unique_deduplicated");
      }
    }
  });
});
