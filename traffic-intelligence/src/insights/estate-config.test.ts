import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertEstateConfig, assertTrafficInsights } from "./assert";
import { estateConfigOf, estateConfigRow, estateProvenanceLines } from "./select";
import type { EstateConfigAccounting, EstateConfigPropertyAccounting, TrafficInsightDocument } from "./types";

const fixture = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../public/gold/traffic-insights-1.0.json"), "utf8"),
) as TrafficInsightDocument;

const row = (overrides: Partial<EstateConfigPropertyAccounting> = {}): EstateConfigPropertyAccounting => ({
  property_id: "a.com",
  state: "healthy",
  reason: "Pages project exposes GitHub production authority and no conflicting serving DNS was observed.",
  authorities: { zone: "analytics_credential", dns: "analytics_credential", pages: "deploy_credential" },
  evidence_status: { zone: "observed", dns: "observed", pages: "observed" },
  evidence_reasons: {},
  ...overrides,
});

const accounting = (rows: EstateConfigPropertyAccounting[] = [row(), row({ property_id: "b.com" })]): EstateConfigAccounting => {
  const counts: Record<string, number> = { healthy: 0, governance_gap: 0, config_drift: 0, unobserved: 0 };
  for (const r of rows) counts[r.state] = (counts[r.state] ?? 0) + 1;
  return {
    schema_version: "1.1.0",
    governed_zone_count: rows.length,
    accounted_zone_count: rows.length,
    state_counts: counts,
    zone_inventory: { authority: "analytics_credential", complete: true, count: rows.length },
    pages_inventory: { authority: "deploy_credential", complete: true, count: 3 },
    credential_boundaries: ["The measurement (analytics) credential intentionally lacks Pages authority."],
    properties: rows,
  };
};

const withEstate = (estate: unknown) => ({ ...structuredClone(fixture), estate_config: estate });

describe("estate_config accounting contract", () => {
  it("accepts a sidecar with no estate_config (legacy / evidence not supplied)", () => {
    expect(() => assertTrafficInsights(structuredClone(fixture))).not.toThrow();
    expect(() => assertTrafficInsights(withEstate(null))).not.toThrow();
  });

  it("accepts a fully reconciled accounting", () => {
    expect(() => assertTrafficInsights(withEstate(accounting()))).not.toThrow();
  });

  it("accepts explicit, reasoned unavailability and positive-negative Pages evidence", () => {
    const unavailable = row({
      property_id: "dark.com",
      state: "unobserved",
      reason: "Pages configuration was not observed.",
      evidence_status: { zone: "observed", dns: "observed", pages: "unavailable" },
      evidence_reasons: { pages: "HTTP 403 — Cloudflare error 10000: Authentication error" },
    });
    const noProject = row({
      property_id: "none.com",
      state: "governance_gap",
      evidence_status: { zone: "observed", dns: "observed", pages: "no_project" },
      evidence_reasons: { pages: "The complete Pages inventory (3 projects) contains no project claiming none.com" },
    });
    expect(() => assertEstateConfig(accounting([row(), unavailable, noProject]))).not.toThrow();
  });

  const bad: Array<[string, (a: EstateConfigAccounting) => void, RegExp]> = [
    ["a governed zone unaccounted for", (a) => { a.governed_zone_count = 3; }, /accounts for 2 of 3 governed zones/],
    ["accounted count that disagrees with the rows", (a) => { a.accounted_zone_count = 5; }, /does not match its properties/],
    ["state counts that disagree with the per-property states", (a) => { a.state_counts.healthy = 1; a.state_counts.unobserved = 1; }, /state_counts\.healthy does not match/],
    ["a state count that is fractional", (a) => { a.state_counts.healthy = 2.5; }, /exactly the four known states/],
    ["a negative state count", (a) => { a.state_counts.healthy = -1; }, /exactly the four known states/],
    ["an unknown state key", (a) => { a.state_counts.bogus = 0; }, /exactly the four known states/],
    ["a missing state key", (a) => { delete a.state_counts.unobserved; }, /exactly the four known states/],
    ["an incomplete pages inventory", (a) => { a.pages_inventory.complete = false; }, /pages_inventory is not complete/],
    ["an incomplete zone inventory", (a) => { a.zone_inventory.complete = false; }, /zone_inventory is not complete/],
    ["a negative inventory count", (a) => { a.pages_inventory.count = -1; }, /non-negative integer count/],
    ["a fractional inventory count", (a) => { a.zone_inventory.count = 1.5; }, /non-negative integer count/],
    ["a fractional governed_zone_count", (a) => { a.governed_zone_count = 2.5; }, /non-negative integer governed_zone_count/],
    ["a duplicate property", (a) => { a.properties.push(row()); a.accounted_zone_count = 3; a.governed_zone_count = 3; a.state_counts.healthy = 3; }, /more than once/],
    ["an invalid state", (a) => { (a.properties[0] as { state: string }).state = "fine"; }, /state is invalid/],
    ["unavailable evidence with no reason", (a) => { a.properties[0]!.evidence_status.pages = "unavailable"; }, /without an explicit reason/],
    ["an invalid evidence status", (a) => { a.properties[0]!.evidence_status.dns = "maybe"; }, /invalid dns evidence status/],
    ["a missing authority", (a) => { a.properties[0]!.authorities.pages = ""; }, /pages evidence must name authority deploy_credential/],
    ["Pages attributed to the measurement credential", (a) => { a.properties[0]!.authorities.pages = "analytics_credential"; }, /pages evidence must name authority deploy_credential/],
    ["DNS attributed to the deployment credential", (a) => { a.properties[0]!.authorities.dns = "deploy_credential"; }, /dns evidence must name authority analytics_credential/],
    ["a non-array properties", (a) => { (a as unknown as { properties: unknown }).properties = {}; }, /properties must be an array/],
    ["an unsupported schema", (a) => { (a as unknown as { schema_version: string }).schema_version = "9"; }, /schema_version must be 1\.1\.0/],
    ["a malformed inventory", (a) => { (a.pages_inventory as unknown as { complete: string }).complete = "yes"; }, /pages_inventory/],
  ];
  for (const [label, mutate, pattern] of bad) {
    it(`fails closed on ${label}`, () => {
      const a = accounting();
      mutate(a);
      expect(() => assertTrafficInsights(withEstate(a))).toThrow(pattern);
    });
  }
});

describe("estate_config selectors", () => {
  const doc = { ...structuredClone(fixture), estate_config: accounting() } as TrafficInsightDocument;

  it("returns the accounting and a row per property", () => {
    expect(estateConfigOf(doc)?.governed_zone_count).toBe(2);
    expect(estateConfigRow(doc, "b.com")?.property_id).toBe("b.com");
    expect(estateConfigRow(doc, "missing.com")).toBeNull();
    expect(estateConfigRow(doc, null)).toBeNull();
  });

  it("treats absent accounting as null, never as healthy", () => {
    expect(estateConfigOf({ ...fixture, estate_config: undefined } as TrafficInsightDocument)).toBeNull();
    expect(estateConfigOf(null)).toBeNull();
  });

  it("explains which authority proved which fact", () => {
    const lines = estateProvenanceLines(row());
    expect(lines).toEqual([
      "Zone status: proven by the measurement (analytics) credential",
      "DNS records: proven by the measurement (analytics) credential",
      "Pages configuration: proven by the trusted deployment credential",
    ]);
  });

  it("does not report the analytics credential lacking Pages authority as a failure when deploy proved it", () => {
    const text = estateProvenanceLines(row()).join(" ");
    expect(text).not.toMatch(/not observed|unavailable|denied/i);
  });

  it("names the reason for unobserved evidence and the positive negative for no_project", () => {
    const lines = estateProvenanceLines(
      row({
        evidence_status: { zone: "observed", dns: "unavailable", pages: "no_project" },
        evidence_reasons: { dns: "HTTP 403", pages: "no project in complete inventory" },
      }),
    );
    expect(lines[1]).toBe("DNS records: not observed (HTTP 403)");
    expect(lines[2]).toBe("Pages configuration: the trusted deployment credential positively found no Pages project for this domain");
  });
});
