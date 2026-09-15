import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertWorkQueue } from "./assert";
import { emptyWorkQueueFixture } from "./sync-core";

describe("assertWorkQueue", () => {
  it("accepts committed fixture", () => {
    const raw = JSON.parse(
      readFileSync(resolve(__dirname, "../../public/gold/ti-work-queue-1.0.json"), "utf8"),
    );
    expect(() => assertWorkQueue(raw)).not.toThrow();
    expect(raw.fixture).toBe(true);
  });

  it("accepts empty builder fixture", () => {
    expect(() => assertWorkQueue(emptyWorkQueueFixture())).not.toThrow();
  });

  it("rejects wrong contract", () => {
    expect(() =>
      assertWorkQueue({
        ...emptyWorkQueueFixture(),
        contract_name: "nope",
      }),
    ).toThrow(/contract_name/);
  });
});
