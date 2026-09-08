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
  const sites = payload.sites;
  const actors = payload.ai.actors;
  const countries = [
    ...new Set(
      [...payload.geography.edge, ...payload.geography.browser, ...payload.geography.ai, ...payload.geography.threat].map(
        (row) => row.label,
      ),
    ),
  ];

  return (
    <div className="filters" role="search" aria-label="Global filters">
      <label className="filter">
        <span>Window</span>
        <select value={filters.window} onChange={(e) => onChange({ window: e.target.value })}>
          {windows.map((id) => (
            <option key={id} value={id}>
              {gold.windows[id]?.window.label ?? id}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Site</span>
        <select value={filters.site} onChange={(e) => onChange({ site: e.target.value })}>
          <option value="all">All properties</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.domain}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Source</span>
        <select value={filters.source} onChange={(e) => onChange({ source: e.target.value })}>
          <option value="all">All sources</option>
          {gold.sources.map((source) => (
            <option key={source.id} value={source.id}>
              {source.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Taxonomy</span>
        <select value={filters.taxonomy} onChange={(e) => onChange({ taxonomy: e.target.value })}>
          <option value="all">All classes</option>
          {payload.taxonomy.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Human / machine class</span>
        <select value={filters.class} onChange={(e) => onChange({ class: e.target.value })}>
          <option value="all">All</option>
          <option value="human_evidence">Human evidence</option>
          <option value="ai_crawler">AI Crawler</option>
          <option value="ai_search">AI Search</option>
          <option value="ai_assistant">AI Assistant</option>
          <option value="user_triggered_ai_agent">User-triggered AI agent</option>
          <option value="search_crawler">Search crawler</option>
          <option value="hostile">Hostile</option>
        </select>
      </label>
      <label className="filter">
        <span>AI actor</span>
        <select value={filters.actor} onChange={(e) => onChange({ actor: e.target.value })}>
          <option value="all">All actors</option>
          {actors.map((actor) => (
            <option key={actor.id} value={actor.id}>
              {actor.name}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Country</span>
        <select value={filters.country} onChange={(e) => onChange({ country: e.target.value })}>
          <option value="all">All countries</option>
          {countries.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Device</span>
        <select value={filters.device} onChange={(e) => onChange({ device: e.target.value })}>
          <option value="all">All devices</option>
          {payload.humans.devices.map((row) => (
            <option key={row.id} value={row.label}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Browser</span>
        <select value={filters.browser} onChange={(e) => onChange({ browser: e.target.value })}>
          <option value="all">All browsers</option>
          {payload.humans.browsers.map((row) => (
            <option key={row.id} value={row.label}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Referrer class</span>
        <select value={filters.referrerClass} onChange={(e) => onChange({ referrerClass: e.target.value })}>
          <option value="all">All</option>
          {payload.humans.acquisition.map((row) => (
            <option key={row.id} value={row.label}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Path</span>
        <input
          value={filters.path}
          onChange={(e) => onChange({ path: e.target.value })}
          placeholder="/atlas"
          aria-label="Path contains"
        />
      </label>
      <label className="filter">
        <span>Status code</span>
        <select value={filters.status} onChange={(e) => onChange({ status: e.target.value })}>
          <option value="all">All</option>
          {payload.technology.status.map((row) => (
            <option key={row.id} value={row.label}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Content type</span>
        <select value={filters.contentType} onChange={(e) => onChange({ contentType: e.target.value })}>
          <option value="all">All</option>
          {payload.technology.contentType.map((row) => (
            <option key={row.id} value={row.label}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Cache</span>
        <select value={filters.cache} onChange={(e) => onChange({ cache: e.target.value })}>
          <option value="all">All</option>
          {payload.technology.cache.map((row) => (
            <option key={row.id} value={row.label}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="filter">
        <span>Confidence</span>
        <select value={filters.confidence} onChange={(e) => onChange({ confidence: e.target.value })}>
          <option value="all">All</option>
          <option value="has_interval">Has interval</option>
          <option value="none">No interval declared</option>
        </select>
      </label>
      <label className="filter">
        <span>Measurement quality</span>
        <select value={filters.quality} onChange={(e) => onChange({ quality: e.target.value })}>
          <option value="all">All</option>
          <option value="EXACT">EXACT</option>
          <option value="SAMPLED">SAMPLED</option>
          <option value="ESTIMATED">ESTIMATED</option>
          <option value="INCOMPLETE">INCOMPLETE</option>
          <option value="UNAVAILABLE">UNAVAILABLE</option>
        </select>
      </label>
    </div>
  );
}
