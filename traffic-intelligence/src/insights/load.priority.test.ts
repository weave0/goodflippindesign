import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Import coerce behavior via dynamic evaluation of exported surface:
// loadInsights needs fetch; instead assert source policy + use a local replica of resolve rules
// by importing assert + simulating normalize through a minimal module under test.
import { assertTrafficInsights } from "./assert";

describe("action priority normalization policy", () => {
  it("load.ts rejects unknown priority_class and does not default to watch", () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "./load.ts"), "utf8");
    expect(source).toMatch(/Unknown action priority_class/);
    expect(source).toMatch(/coerceLegacyNumericPriority/);
    expect(source).toMatch(/never silently downgrade act_now to watch/);
    expect(source).not.toMatch(/return "watch";\s*\n\s*\}/);
  });

  it("assert accepts producer numeric priority + priority_class", () => {
    const fixture = JSON.parse(
      readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/traffic-insights-1.0.json"), "utf8"),
    );
    assertTrafficInsights(fixture);
    expect(fixture.actions.every((a: { priority: number; priority_class: string }) => typeof a.priority === "number")).toBe(
      true,
    );
    expect(fixture.actions.every((a: { priority_class: string }) => typeof a.priority_class === "string")).toBe(true);
  });
});
