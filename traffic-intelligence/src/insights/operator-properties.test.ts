import { describe, expect, it } from "vitest";
import type { SiteRecord } from "../gold/types";
import type { Gold12Topology } from "../gold/types";
import {
  filterOperatorPropertyIds,
  filterOperatorSites,
  hasGovernedTrafficSignal,
  isExplicitWebOperatorProperty,
  isOperatorProperty,
  looksLikeRawDnsOrServiceLabel,
} from "./operator-properties";
import type {
  InsightAction,
  InsightDailySeries,
  OperationalBrief,
  PropertyHealth,
  TrafficInsightDocument,
  TrendComparison,
} from "./types";

function site(partial: Partial<SiteRecord> & Pick<SiteRecord, "id" | "domain">): SiteRecord {
  return {
    name: partial.domain,
    metrics: [],
    sourceCoverage: [],
    measurementHealth: "unknown_coverage",
    measurementHealthNote: "",
    ...partial,
  };
}

function emptyInsights(over: Partial<TrafficInsightDocument> = {}): TrafficInsightDocument {
  return {
    schema_version: "1.1.0",
    contract_name: "gfd-traffic-insights",
    fixture: true,
    generated_at: "2026-09-14T00:00:00Z",
    source_gold_schema_version: "1.2.0",
    source_gold_generated_at: "2026-09-14T00:00:00Z",
    series: [],
    findings: [],
    actions: [],
    briefs: [],
    estate_brief: null,
    property_health: [],
    trend_comparisons: [],
    limitations: [],
    ...over,
  };
}

function seriesFor(propertyId: string): InsightDailySeries {
  return {
    series_id: `s:${propertyId}`,
    source: "cloudflare",
    property_id: propertyId,
    metric_name: "requests",
    label: "Requests",
    unit: "count",
    source_metric_id: "m1",
    source_snapshot: "snap",
    evidence_state: "measured",
    exactness: "exact",
    coverage: { state: "full_coverage", observed_fraction: 1 },
    observation_start: "2026-09-01",
    observation_end: "2026-09-10",
    points: [{ date: "2026-09-10", value: 10 }],
    missing_dates: [],
    limitations: [],
  };
}

function briefFor(propertyId: string): OperationalBrief {
  return {
    brief_id: `b:${propertyId}`,
    property_id: propertyId,
    category: "traffic",
    headline: "Head",
    summary: "Sum",
    severity: "medium",
    priority: "investigate",
    direction: "up",
    materiality: {
      absolute_delta_requests: 1,
      absolute_delta_pageviews: null,
      percent_delta: null,
    },
    persistence: ["7d"],
    finding_ids: [],
    corroborating_signals: [],
    contradictory_signals: [],
    confidence: "medium",
    recommended_action: "Check",
    verification_condition: "Verify",
    action_class: "observe",
    limitations: [],
  };
}

function actionFor(propertyId: string): InsightAction {
  return {
    action_id: `a:${propertyId}`,
    finding_id: "f1",
    finding_ids: ["f1"],
    brief_id: null,
    priority: 2,
    priority_class: "investigate",
    severity: "medium",
    scope: "property",
    property_id: propertyId,
    action_class: "observe",
    recommended_action: "Act",
    verification_condition: "Verify",
    evidence_refs: [],
    status: "new",
  };
}

function unavailableTrend(propertyId: string): TrendComparison {
  return {
    property_id: propertyId,
    metric_name: "requests",
    period_days: 7,
    current_start: null,
    current_end: null,
    baseline_start: null,
    baseline_end: null,
    current_value: null,
    baseline_value: null,
    absolute_delta: null,
    percent_delta: null,
    available: false,
    unavailable_reason: "insufficient coverage",
    source: "cloudflare",
    exactness: "unknown",
    coverage_state: "partial_coverage",
    expected_date_count: null,
    missing_dates: [],
    source_metric_ids: [],
    source_snapshots: [],
  };
}

function availableTrend(propertyId: string): TrendComparison {
  return {
    ...unavailableTrend(propertyId),
    available: true,
    unavailable_reason: null,
    current_start: "2026-09-03",
    current_end: "2026-09-10",
    baseline_start: "2026-08-27",
    baseline_end: "2026-09-03",
    current_value: 20,
    baseline_value: 10,
    absolute_delta: 10,
    percent_delta: 1,
    coverage_state: "full_coverage",
    exactness: "exact",
  };
}

const allUnknownHealth = (propertyId: string): PropertyHealth => ({
  property_id: propertyId,
  traffic: "unknown",
  delivery: "unknown",
  threats: "unknown",
  measurement: "unknown",
  overall: "measurement_blocked",
  notes: "",
});

describe("looksLikeRawDnsOrServiceLabel", () => {
  it("flags DMARC, DKIM, ACME, and Clerk hosts", () => {
    expect(looksLikeRawDnsOrServiceLabel("_dmarc.example.com")).toBe(true);
    expect(looksLikeRawDnsOrServiceLabel("selector._domainkey.example.com")).toBe(true);
    expect(looksLikeRawDnsOrServiceLabel("_acme-challenge.example.com")).toBe(true);
    expect(looksLikeRawDnsOrServiceLabel("clerk.accounts.dev")).toBe(true);
    expect(looksLikeRawDnsOrServiceLabel("foo.clerk.example.com")).toBe(true);
  });

  it("does not flag ordinary web hostnames", () => {
    expect(looksLikeRawDnsOrServiceLabel("example.com")).toBe(false);
    expect(looksLikeRawDnsOrServiceLabel("www.example.com")).toBe(false);
  });
});

describe("isOperatorProperty", () => {
  it("keeps example.com with insight series", () => {
    const insights = emptyInsights({ series: [seriesFor("example.com")] });
    expect(
      isOperatorProperty("example.com", {
        insights,
        sites: [site({ id: "example.com", domain: "example.com", measurementHealth: "instrumentation_absent" })],
      }),
    ).toBe(true);
  });

  it("hides _dmarc.example.com when all-unknown and no series/briefs/actions", () => {
    const insights = emptyInsights({
      property_health: [allUnknownHealth("_dmarc.example.com")],
    });
    expect(
      isOperatorProperty("_dmarc.example.com", {
        insights,
        sites: [
          site({
            id: "_dmarc.example.com",
            domain: "_dmarc.example.com",
            measurementHealth: "instrumentation_absent",
          }),
        ],
      }),
    ).toBe(false);
  });

  it("keeps a DNS-looking label when it has a brief or action only", () => {
    expect(
      isOperatorProperty("_dmarc.example.com", {
        insights: emptyInsights({ briefs: [briefFor("_dmarc.example.com")] }),
        sites: [],
      }),
    ).toBe(true);
    expect(
      isOperatorProperty("_dmarc.example.com", {
        insights: emptyInsights({ actions: [actionFor("_dmarc.example.com")] }),
        sites: [],
      }),
    ).toBe(true);
  });

  it("keeps web SiteRecord without series when Gold marks it proxied / logical_property", () => {
    const proxied = site({
      id: "web-1",
      domain: "shop.example.com",
      measurementHealth: "full_coverage",
    });
    expect(
      isOperatorProperty("shop.example.com", {
        insights: emptyInsights(),
        sites: [proxied],
      }),
    ).toBe(true);

    const topology: Gold12Topology = {
      nodes: [
        {
          node_id: "lp-1",
          node_type: "logical_property",
          label: "brand.example",
          visibility: "dns_only",
        },
      ],
      relationships: [],
    };
    expect(
      isOperatorProperty("brand.example", {
        insights: emptyInsights(),
        sites: [site({ id: "lp-1", domain: "brand.example", measurementHealth: "instrumentation_absent" })],
        topology,
      }),
    ).toBe(true);
    expect(isExplicitWebOperatorProperty("brand.example", { sites: [site({ id: "lp-1", domain: "brand.example" })], topology })).toBe(
      true,
    );
  });

  it("keeps available trend_comparisons as a governed signal", () => {
    expect(
      hasGovernedTrafficSignal(
        "example.com",
        emptyInsights({ trend_comparisons: [availableTrend("example.com")] }),
      ),
    ).toBe(true);
    expect(
      hasGovernedTrafficSignal(
        "example.com",
        emptyInsights({ trend_comparisons: [unavailableTrend("example.com")] }),
      ),
    ).toBe(false);
  });

  it("does not treat parent-domain series as a signal for _dmarc child", () => {
    expect(
      isOperatorProperty("_dmarc.example.com", {
        insights: emptyInsights({ series: [seriesFor("example.com")] }),
        sites: [
          site({
            id: "_dmarc.example.com",
            domain: "_dmarc.example.com",
            measurementHealth: "instrumentation_absent",
          }),
        ],
      }),
    ).toBe(false);
  });

  it("hides dns_only topology hostnames without signals even when label is ordinary", () => {
    expect(
      isOperatorProperty("mail-relay.example.com", {
        insights: emptyInsights(),
        sites: [
          site({
            id: "mail-relay.example.com",
            domain: "mail-relay.example.com",
            measurementHealth: "instrumentation_absent",
          }),
        ],
      }),
    ).toBe(false);
  });

  it("Focus candidates exclude hidden DNS without series", () => {
    const insights = emptyInsights({
      series: [seriesFor("example.com")],
      property_health: [
        allUnknownHealth("example.com"),
        allUnknownHealth("_dmarc.example.com"),
        allUnknownHealth("clerk.accounts.dev"),
      ],
    });
    const sites = [
      site({ id: "example.com", domain: "example.com", measurementHealth: "full_coverage" }),
      site({
        id: "_dmarc.example.com",
        domain: "_dmarc.example.com",
        measurementHealth: "instrumentation_absent",
      }),
      site({
        id: "clerk.accounts.dev",
        domain: "clerk.accounts.dev",
        measurementHealth: "instrumentation_absent",
      }),
    ];
    const ctx = { insights, sites };
    const candidates = filterOperatorPropertyIds(
      ["example.com", "_dmarc.example.com", "clerk.accounts.dev"],
      ctx,
    );
    expect(candidates).toEqual(["example.com"]);
    expect(filterOperatorSites(sites, ctx).map((s) => s.domain)).toEqual(["example.com"]);
  });

  it("maps Gold site id to domain for signal matching", () => {
    const insights = emptyInsights({ briefs: [briefFor("goodflippindesign.com")] });
    const sites = [site({ id: "gfd", domain: "goodflippindesign.com", measurementHealth: "full_coverage" })];
    expect(hasGovernedTrafficSignal("gfd", insights, sites)).toBe(true);
    expect(isOperatorProperty("gfd", { insights, sites })).toBe(true);
  });
});
