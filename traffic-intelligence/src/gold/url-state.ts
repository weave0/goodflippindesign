export const VIEWS = [
  "overview",
  "humans",
  "ai",
  "automation",
  "sites",
  "site",
  "content",
  "technology",
  "geography",
  "laboratory",
  "anomalies",
  "health",
] as const;

export type ViewId = (typeof VIEWS)[number];

export interface Filters {
  view: ViewId;
  window: string;
  site: string;
  source: string;
  taxonomy: string;
  class: string;
  actor: string;
  country: string;
  device: string;
  browser: string;
  referrerClass: string;
  path: string;
  status: string;
  contentType: string;
  cache: string;
  confidence: string;
  quality: string;
  coverage: string;
  theme: "dark" | "light";
}

export const FILTER_DEFAULTS: Filters = {
  view: "overview",
  window: "28d",
  site: "all",
  source: "all",
  taxonomy: "all",
  class: "all",
  actor: "all",
  country: "all",
  device: "all",
  browser: "all",
  referrerClass: "all",
  path: "",
  status: "all",
  contentType: "all",
  cache: "all",
  confidence: "all",
  quality: "all",
  coverage: "all",
  theme: "dark",
};

const KEYS = Object.keys(FILTER_DEFAULTS) as (keyof Filters)[];

export function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const next: Filters = { ...FILTER_DEFAULTS };
  for (const key of KEYS) {
    const raw = params.get(key);
    if (raw === null || raw === "") continue;
    if (key === "view") {
      next.view = (VIEWS as readonly string[]).includes(raw) ? (raw as ViewId) : "overview";
    } else if (key === "theme") {
      next.theme = raw === "light" ? "light" : "dark";
    } else {
      next[key] = raw;
    }
  }
  return next;
}

export function serializeFilters(filters: Filters): string {
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = filters[key];
    const fallback = FILTER_DEFAULTS[key];
    if (value === fallback || value === "") continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function filtersEqual(a: Filters, b: Filters): boolean {
  return KEYS.every((key) => a[key] === b[key]);
}
