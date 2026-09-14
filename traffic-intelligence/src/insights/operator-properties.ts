/**
 * TI-008: operator-property eligibility for cockpit surfaces.
 *
 * KEEP when a property has governed traffic signal (series / available
 * trend_comparisons / briefs / actions) OR Gold marks it as an explicit
 * web/operator property (topology logical_property or proxied visibility).
 * HIDE raw DNS/service/verification topology that lacks those KEEP signals.
 * Does not remove topology from Sites & content / Laboratory views.
 */

import type { Gold12Topology, SiteRecord } from "../gold/types";
import type { TrafficInsightDocument } from "./types";

/** Labels that look like DNS / verification / infra topology, not operator properties. */
const RAW_DNS_OR_SERVICE_LABEL =
  /(?:^|\.)(_dmarc|_domainkey|_acme-challenge)(?:\.|$)|(?:^|\.)clerk\./i;

export interface OperatorPropertyContext {
  insights: TrafficInsightDocument | null;
  sites?: readonly SiteRecord[] | null;
  topology?: Gold12Topology | null;
}

function norm(value: string): string {
  return value.trim().toLowerCase();
}

/** Exact property identity (insight property_id ↔ Gold site id/domain). No parent-domain bleed. */
function sameProperty(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return norm(a) === norm(b);
}

function siteMatchesKey(site: SiteRecord, propertyKey: string): boolean {
  return sameProperty(site.id, propertyKey) || sameProperty(site.domain, propertyKey);
}

function findSite(propertyKey: string, sites: readonly SiteRecord[] | null | undefined): SiteRecord | null {
  if (!sites?.length || !propertyKey) return null;
  return sites.find((site) => siteMatchesKey(site, propertyKey)) ?? null;
}

function findTopologyNode(propertyKey: string, topology: Gold12Topology | null | undefined, site: SiteRecord | null) {
  if (!topology?.nodes?.length) return null;
  if (site) {
    const bySite = topology.nodes.find((node) => node.node_id === site.id);
    if (bySite) return bySite;
  }
  return (
    topology.nodes.find((node) => sameProperty(node.node_id, propertyKey) || sameProperty(node.label, propertyKey)) ??
    null
  );
}

/** Keys that identify this property in Gold + insights (id and/or domain). */
function propertyAliases(propertyKey: string, sites: readonly SiteRecord[] | null | undefined): string[] {
  const aliases = new Set<string>([propertyKey]);
  const site = findSite(propertyKey, sites);
  if (site) {
    aliases.add(site.id);
    aliases.add(site.domain);
  }
  return [...aliases];
}

function insightRefsProperty(
  propertyIds: readonly (string | null | undefined)[],
  aliases: readonly string[],
): boolean {
  return propertyIds.some((id) => id != null && aliases.some((alias) => sameProperty(id, alias)));
}

/** True when insights reference this property with a governed cockpit signal. */
export function hasGovernedTrafficSignal(
  propertyKey: string,
  insights: TrafficInsightDocument | null,
  sites?: readonly SiteRecord[] | null,
): boolean {
  if (!insights || !propertyKey) return false;
  const aliases = propertyAliases(propertyKey, sites);

  if (insightRefsProperty(
    (insights.series ?? []).map((row) => row.property_id),
    aliases,
  )) {
    return true;
  }

  if (
    insightRefsProperty(
      (insights.trend_comparisons ?? []).filter((row) => row.available).map((row) => row.property_id),
      aliases,
    )
  ) {
    return true;
  }

  if (insightRefsProperty(
    (insights.briefs ?? []).map((row) => row.property_id),
    aliases,
  )) {
    return true;
  }

  if (
    insightRefsProperty(
      (insights.actions ?? []).map((row) => row.property_id),
      aliases,
    )
  ) {
    return true;
  }

  return false;
}

export function looksLikeRawDnsOrServiceLabel(label: string): boolean {
  if (!label) return false;
  return RAW_DNS_OR_SERVICE_LABEL.test(label.trim());
}

/**
 * Explicit web/operator property from real Gold topology / SiteRecord fields:
 * - topology node_type === "logical_property"
 * - topology visibility === "proxied" (adapter maps this to measurementHealth full_coverage)
 */
export function isExplicitWebOperatorProperty(
  propertyKey: string,
  ctx: Pick<OperatorPropertyContext, "sites" | "topology">,
): boolean {
  const site = findSite(propertyKey, ctx.sites);
  const node = findTopologyNode(propertyKey, ctx.topology, site);

  if (node?.node_type === "logical_property") return true;
  if (node?.visibility === "proxied") return true;

  // Adapter maps visibility "proxied" → measurementHealth "full_coverage"
  if (site?.measurementHealth === "full_coverage") return true;

  return false;
}

function isDnsOnlyTopology(
  propertyKey: string,
  ctx: Pick<OperatorPropertyContext, "sites" | "topology">,
): boolean {
  const site = findSite(propertyKey, ctx.sites);
  const node = findTopologyNode(propertyKey, ctx.topology, site);
  if (node?.visibility === "dns_only") return true;
  // Adapter maps visibility "dns_only" → measurementHealth "instrumentation_absent"
  if (site?.measurementHealth === "instrumentation_absent") return true;
  return false;
}

/**
 * Shared cockpit eligibility predicate.
 * KEEP if governed traffic signal OR explicit web/operator Gold property.
 * HIDE DNS/service/verification (and dns_only topology) when those KEEP signals are absent.
 */
export function isOperatorProperty(propertyKey: string, ctx: OperatorPropertyContext): boolean {
  if (!propertyKey || propertyKey === "all") return true;

  if (hasGovernedTrafficSignal(propertyKey, ctx.insights, ctx.sites)) return true;
  if (isExplicitWebOperatorProperty(propertyKey, ctx)) return true;

  const site = findSite(propertyKey, ctx.sites);
  const label = site?.domain ?? propertyKey;
  if (looksLikeRawDnsOrServiceLabel(label) || looksLikeRawDnsOrServiceLabel(propertyKey)) {
    return false;
  }
  if (isDnsOnlyTopology(propertyKey, ctx)) return false;

  return true;
}

export function filterOperatorSites(
  sites: readonly SiteRecord[],
  ctx: OperatorPropertyContext,
): SiteRecord[] {
  return sites.filter((site) => isOperatorProperty(site.domain, ctx) || isOperatorProperty(site.id, ctx));
}

export function filterOperatorPropertyIds(
  propertyIds: readonly string[],
  ctx: OperatorPropertyContext,
): string[] {
  return propertyIds.filter((id) => isOperatorProperty(id, ctx));
}

export function countHiddenOperatorProperties(
  propertyIds: readonly string[],
  ctx: OperatorPropertyContext,
): number {
  return propertyIds.reduce((n, id) => (isOperatorProperty(id, ctx) ? n : n + 1), 0);
}
