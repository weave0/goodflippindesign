import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import estateRegistry from "../../estate/registry.json";
import { App } from "./App";
import { adaptGold } from "./gold/adapter";
import { assertGoldContract } from "./gold/assert";

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "../public/gold");
const fixture = adaptGold(JSON.parse(readFileSync(join(fixtureDir, "fixture.v1.json"), "utf8")) as unknown);
assertGoldContract(fixture);
const insights = JSON.parse(readFileSync(join(fixtureDir, "traffic-insights-1.0.json"), "utf8"));
const workQueue = JSON.parse(readFileSync(join(fixtureDir, "ti-work-queue-1.0.json"), "utf8"));
const governedDomains = estateRegistry.properties
  .filter((property) => property.governed)
  .map((property) => property.domain)
  .sort();

function stubResponses(insightPayload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url.includes("ti-work-queue")
        ? workQueue
        : url.includes("traffic-insights")
          ? insightPayload
          : fixture;
      return { ok: true, json: async () => body };
    }),
  );
}

function renderedMissingDomains(): string[] {
  const gap = within(screen.getByRole("region", { name: "Estate traffic accounting gap" }));
  const prefix = "Missing from traffic accounting: ";
  const text = gap.getByText(/^Missing from traffic accounting:/).textContent ?? "";
  expect(text.startsWith(prefix)).toBe(true);
  return text.slice(prefix.length).split(/,\s*/);
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("exact governed estate accountability", () => {
  it("names every missing governed domain exactly once and never counts synthetic properties", async () => {
    stubResponses(insights);
    render(<App />);
    await screen.findByRole("heading", { name: "What happened across the web estate" });

    const coverage = within(screen.getByText("Estate traffic coverage").closest("article")!);
    expect(coverage.getByText(`0/${governedDomains.length}`)).toBeInTheDocument();
    expect(
      coverage.getByText(`0 represented · ${governedDomains.length} without an equal-window comparison`),
    ).toBeInTheDocument();
    // Full ordered equality catches omissions, substitutions, extras and duplicate domains.
    expect(renderedMissingDomains()).toEqual(governedDomains);
    expect(new Set(renderedMissingDomains()).size).toBe(governedDomains.length);
  });

  it("removes only genuinely represented domains while retaining the full estate denominator", async () => {
    expect(governedDomains.length).toBeGreaterThanOrEqual(2);
    // This is a test-only payload. The committed synthetic fixture is never relabeled as live evidence.
    // Replace the longer identity first so example.com cannot corrupt shop.example.com.
    const partialEstateInsights = JSON.parse(
      JSON.stringify(insights)
        .replaceAll("shop.example.com", governedDomains[1]!)
        .replaceAll("example.com", governedDomains[0]!),
    );
    stubResponses(partialEstateInsights);
    render(<App />);
    await screen.findByRole("heading", { name: "What happened across the web estate" });

    const coverage = within(screen.getByText("Estate traffic coverage").closest("article")!);
    expect(coverage.getByText(`2/${governedDomains.length}`)).toBeInTheDocument();
    expect(
      coverage.getByText(`2 represented · ${governedDomains.length - 2} without an equal-window comparison`),
    ).toBeInTheDocument();
    expect(renderedMissingDomains()).toEqual(governedDomains.slice(2));
  });
});
