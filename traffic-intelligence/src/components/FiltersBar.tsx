import { useEffect, useMemo } from "react";
import type { GoldContract, SiteRecord, WindowPayload } from "../gold/types";
import { windowIsAvailable } from "../gold/select";
import type { Filters } from "../gold/url-state";
import { filterOperatorSites, isOperatorProperty } from "../insights/operator-properties";
import type { TrafficInsightDocument } from "../insights/types";

const RANGE_PRESETS = [
  { id: "7d", label: "7 days" },
  { id: "28d", label: "28 days" },
  { id: "90d", label: "90 days" },
] as const;

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDateTime(value?: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(date);
}

function includedEnd(payload: WindowPayload): string {
  const end = new Date(payload.window.end);
  if (Number.isNaN(end.getTime())) return payload.window.end;
  if (payload.window.boundary === "half_open") end.setUTCDate(end.getUTCDate() - 1);
  return formatDate(end.toISOString());
}

export function FiltersBar({
  gold,
  payload,
  filters,
  onChange,
  insights = null,
}: {
  gold: GoldContract;
  payload: WindowPayload;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
  insights?: TrafficInsightDocument | null;
}) {
  const operatorCtx = useMemo(
    () => ({
      insights,
      sites: payload.sites,
      topology: gold.topology ?? null,
    }),
    [insights, payload.sites, gold.topology],
  );
  const operatorSites = useMemo(() => {
    const base = filterOperatorSites(payload.sites, operatorCtx);
    // Preserve insight-only operator selections (property_id not present as a Gold site id).
    if (
      filters.site !== "all" &&
      isOperatorProperty(filters.site, operatorCtx) &&
      !base.some((site) => site.id === filters.site || site.domain.toLowerCase() === filters.site.toLowerCase())
    ) {
      const synthetic: SiteRecord = {
        id: filters.site,
        domain: filters.site,
        name: filters.site,
        metrics: [],
        sourceCoverage: [],
        measurementHealth: "unknown_coverage",
        measurementHealthNote: "Insight property selection (not a Gold topology site id).",
      };
      return [...base, synthetic];
    }
    return base;
  }, [payload.sites, operatorCtx, filters.site]);

  const siteSelectionHidden =
    filters.site !== "all" && !isOperatorProperty(filters.site, operatorCtx);

  useEffect(() => {
    if (siteSelectionHidden) {
      onChange({ site: "all" });
    }
  }, [siteSelectionHidden, onChange]);

  const siteSelectValue = siteSelectionHidden
    ? "all"
    : operatorSites.some((site) => site.id === filters.site)
      ? filters.site
      : (operatorSites.find((site) => site.domain.toLowerCase() === filters.site.toLowerCase())?.id ?? "all");

  const windows = Object.keys(gold.windows);
  const showAdvanced = ["laboratory", "health", "technology"].includes(filters.view);
  const activeWindowId = payload.window.id;
  const exactSpan = `${formatDate(payload.window.start)} – ${includedEnd(payload)}`;
  const freshness = formatDateTime(payload.window.extractedAt ?? payload.window.generatedAt ?? gold.contract.producedAt);
  const availablePresetCount = RANGE_PRESETS.filter((preset) => windowIsAvailable(gold, preset.id)).length;
  const nonPresetWindows = windows.filter((id) => !RANGE_PRESETS.some((preset) => preset.id === id));
  const showOtherWindow = nonPresetWindows.includes(activeWindowId);

  return (
    <div className={`filters${showAdvanced ? " is-advanced" : ""}`} role="search" aria-label="Traffic filters">
      <section className="time-context" aria-label="Active reporting period">
        <div className="time-context__heading">
          <div>
            <span className="time-context__eyebrow">Reporting period</span>
            <strong className="time-context__span">{exactSpan}</strong>
          </div>
          <div className="time-context__meta">
            <span>{payload.window.timezone || "UTC"} complete days</span>
            <span>Range: {payload.window.label}</span>
            {freshness ? <span>Collected: {freshness}</span> : null}
            {payload.window.partialCurrentPeriod ? <strong>Includes partial current period</strong> : null}
          </div>
        </div>

        <div className="time-context__presets" role="group" aria-label="Reporting range">
          {RANGE_PRESETS.map((preset) => {
            const available = windowIsAvailable(gold, preset.id);
            return (
              <button
                key={preset.id}
                type="button"
                className="range-button"
                aria-pressed={available && activeWindowId === preset.id}
                disabled={!available}
                title={available ? `Show ${preset.label}` : `${preset.label} is not available in the current governed dataset`}
                onClick={() => onChange({ window: preset.id })}
              >
                {preset.label}
              </button>
            );
          })}

          {showOtherWindow ? (
            <label className="time-context__other">
              <span>Other governed range</span>
              <select value={activeWindowId} onChange={(e) => onChange({ window: e.target.value })}>
                {nonPresetWindows.map((id) => (
                  <option key={id} value={id}>
                    {gold.windows[id]?.window.label ?? id}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        {availablePresetCount < 2 ? (
          <p className="time-context__warning" role="status">
            Only one governed analytical window is currently available. Additional range controls stay disabled rather than pretending unsupported history exists.
          </p>
        ) : null}
      </section>

      <label className="filter">
        <span>Property</span>
        <select
          value={siteSelectValue}
          onChange={(e) => onChange({ site: e.target.value })}
        >
          <option value="all">All properties</option>
          {operatorSites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.domain}
            </option>
          ))}
        </select>
      </label>

      {filters.view === "ai" || filters.view === "automation" ? (
        <label className="filter">
          <span>Traffic class</span>
          <select value={filters.class} onChange={(e) => onChange({ class: e.target.value })}>
            <option value="all">All machine activity</option>
            <option value="ai_crawler">AI crawler</option>
            <option value="ai_search">AI search</option>
            <option value="ai_assistant">AI assistant</option>
            <option value="user_triggered_ai_agent">User-triggered AI agent</option>
            <option value="search_crawler">Search crawler</option>
            <option value="hostile">Hostile</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      ) : null}

      {showAdvanced ? (
        <>
          <label className="filter">
            <span>Source</span>
            <select value={filters.source} onChange={(e) => onChange({ source: e.target.value })}>
              <option value="all">All sources</option>
              {gold.sources.map((source, index) => (
                <option key={`${source.id}:${source.shortLabel}:${index}`} value={source.id}>
                  {source.label}
                </option>
              ))}
            </select>
          </label>

          <label className="filter">
            <span>Evidence</span>
            <select value={filters.quality} onChange={(e) => onChange({ quality: e.target.value })}>
              <option value="all">All evidence</option>
              <option value="measured">Measured</option>
              <option value="sampled">Sampled</option>
              <option value="inferred">Inferred</option>
              <option value="estimated">Estimated</option>
              <option value="unavailable">Unavailable</option>
              <option value="unknowable">Unknowable</option>
            </select>
          </label>

          <label className="filter">
            <span>Coverage</span>
            <select value={filters.coverage} onChange={(e) => onChange({ coverage: e.target.value })}>
              <option value="all">All coverage</option>
              <option value="full_coverage">Full</option>
              <option value="partial_coverage">Partial</option>
              <option value="source_unavailable">Source unavailable</option>
              <option value="structurally_unknowable">Structurally unknowable</option>
            </select>
          </label>
        </>
      ) : null}
    </div>
  );
}
