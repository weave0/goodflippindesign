import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { adaptGold } from "./adapter";
import { assertGoldContract, collectMetrics } from "./assert";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/canonical-gold-m1.2.json");

describe("canonical Gold validation after adaptation", () => {
  it("does not skip metrics because the synthesized window id is canonical", () => {
    const raw = JSON.parse(readFileSync(fixturePath, "utf8")) as unknown;
    const adapted = adaptGold(raw);

    expect(adapted.defaultWindowId).toBe("canonical");
    expect(() => assertGoldContract(adapted)).not.toThrow();
    expect(collectMetrics(adapted).length).toBeGreaterThan(0);
  });
});
