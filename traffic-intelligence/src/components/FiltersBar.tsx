import type { GoldContract, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";

export function FiltersBar({
  gold,
  payload,
  filters,
  onChange,
}: {
  gold: GoldContract;
  payload: WindowPayload;
  filters: Filters;
  onChange: (patch: Partial<Filters>) => void;
}) {
  const windows = Object.keys(gold.windows);
  const showAdvanced = ["laboratory", "health", "technology"].includes(filters.view);

  return (
    <div className={`filters${showAdvanced ? " is-advanced" : ""}`} role="search" aria-label="Traffic filters">
      <label className="filter">
        <span>Period</span>
        <select value={filters.window} onChange={(e) => onChange({ window: e.target.value })}>
          {windows.map((id) => (
            <option key={id} value={id}>
              {gold.windows[id]?.window.label ?? id}
            </option>
          ))}
        </select>
      </label>

      <label className="filter">
        <span>Property</span>
        <select value={filters.site} onChange={(e) => onChange({ site: e.target.value })}>
          <option value="all">All properties</option>
          {payload.sites.map((site) => (
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
