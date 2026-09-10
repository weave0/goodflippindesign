import { useEffect, useMemo, useState } from "react";
import type { GoldContract, Metric } from "./gold/types";
import { loadGold } from "./gold/load";
import { selectSite, selectWindow } from "./gold/select";
import { FILTER_DEFAULTS, filtersEqual, parseFilters, serializeFilters, type Filters, type ViewId } from "./gold/url-state";
import { EvidenceDrawer } from "./components/EvidenceDrawer";
import { FiltersBar } from "./components/FiltersBar";
import { OverviewView } from "./views/OverviewView";
import { HumansView } from "./views/HumansView";
import { AIView } from "./views/AIView";
import { AutomationView } from "./views/AutomationView";
import { SiteDossierView, SitesView } from "./views/SitesView";
import { ContentView } from "./views/ContentView";
import { TechnologyView } from "./views/TechnologyView";
import { GeographyView } from "./views/GeographyView";
import { LaboratoryView } from "./views/LaboratoryView";
import { AnomaliesView } from "./views/AnomaliesView";
import { HealthView } from "./views/HealthView";

const PRIMARY_NAV: { id: ViewId; label: string; matches: ViewId[] }[] = [
  { id: "overview", label: "Overview", matches: ["overview", "anomalies"] },
  { id: "humans", label: "Audience", matches: ["humans", "geography"] },
  { id: "sites", label: "Sites & content", matches: ["sites", "site", "content"] },
  { id: "ai", label: "AI & automation", matches: ["ai", "automation"] },
  { id: "laboratory", label: "Data quality", matches: ["laboratory", "health", "technology"] },
];

const PRIMARY_NAV_RESET: Partial<Filters> = {
  source: FILTER_DEFAULTS.source,
  taxonomy: FILTER_DEFAULTS.taxonomy,
  class: FILTER_DEFAULTS.class,
  actor: FILTER_DEFAULTS.actor,
  country: FILTER_DEFAULTS.country,
  device: FILTER_DEFAULTS.device,
  browser: FILTER_DEFAULTS.browser,
  referrerClass: FILTER_DEFAULTS.referrerClass,
  path: FILTER_DEFAULTS.path,
  status: FILTER_DEFAULTS.status,
  contentType: FILTER_DEFAULTS.contentType,
  cache: FILTER_DEFAULTS.cache,
  confidence: FILTER_DEFAULTS.confidence,
  quality: FILTER_DEFAULTS.quality,
  coverage: FILTER_DEFAULTS.coverage,
};

const VIEW_COPY: Record<ViewId, { title: string; lede: string }> = {
  overview: {
    title: "Traffic overview",
    lede: "What changed, what matters, and where to look next.",
  },
  humans: {
    title: "Audience",
    lede: "Observed human activity, acquisition, engagement, devices and geography from browser-side evidence.",
  },
  ai: {
    title: "AI & automation",
    lede: "Measured machine activity, named AI actors and other automation kept separate from human evidence.",
  },
  automation: {
    title: "AI & automation",
    lede: "Machine activity that is not classified as AI.",
  },
  sites: {
    title: "Sites & content",
    lede: "Which properties and pages are attracting attention, growing, failing or wasting traffic.",
  },
  site: {
    title: "Property detail",
    lede: "A single property's measured activity and coverage.",
  },
  content: {
    title: "Sites & content",
    lede: "Pages attracting humans, AI and search crawlers, including high-error and high-bandwidth paths.",
  },
  technology: {
    title: "Data quality",
    lede: "Technical evidence used to explain traffic and measurement behavior.",
  },
  geography: {
    title: "Audience",
    lede: "Where observed traffic originates, without mixing incompatible measurement sources.",
  },
  laboratory: {
    title: "Data quality",
    lede: "Coverage, source disagreement, missingness and measurement limitations.",
  },
  anomalies: {
    title: "Traffic overview",
    lede: "Material changes and exceptions that deserve attention.",
  },
  health: {
    title: "Data quality",
    lede: "Errors, threats and measurement gaps that require operator action.",
  },
};

export function App() {
  const [gold, setGold] = useState<GoldContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() =>
    typeof window === "undefined" ? FILTER_DEFAULTS : parseFilters(window.location.search),
  );
  const [evidence, setEvidence] = useState<Metric | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadGold()
      .then((doc) => {
        if (!cancelled) setGold(doc);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onPop = () => setFilters(parseFilters(window.location.search));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = filters.theme;
  }, [filters.theme]);

  useEffect(() => {
    const qs = serializeFilters(filters);
    const next = `${window.location.pathname}${qs}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) window.history.replaceState(filters, "", next);
  }, [filters]);

  const patchFilters = (patch: Partial<Filters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      return filtersEqual(prev, next) ? prev : next;
    });
  };

  const payload = useMemo(() => (gold ? selectWindow(gold, filters.window) : null), [gold, filters.window]);
  const site = payload ? selectSite(payload, filters.site) : null;
  const copy = VIEW_COPY[filters.view];

  if (error) {
    return (
      <main className="main fatal-state">
        <h1>Traffic intelligence unavailable</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!gold || !payload) {
    return (
      <main className="main fatal-state">
        <h1>Loading traffic intelligence…</h1>
      </main>
    );
  }

  return (
    <div className="app" data-theme={filters.theme} data-dataset={gold.contract.kind}>
      <a className="skip" href="#main">Skip to content</a>

      <header className="app-header">
        <div className="brand-row">
          <div className="brand">
            <strong>GFD Traffic Intelligence</strong>
            <span>{payload.window.start} → {payload.window.end}</span>
          </div>
          <div className="top-actions">
            <button
              type="button"
              className="icon-btn"
              onClick={() => patchFilters({ theme: filters.theme === "dark" ? "light" : "dark" })}
            >
              {filters.theme === "dark" ? "Light" : "Dark"}
            </button>
            <button type="button" className="icon-btn" onClick={() => patchFilters({ ...PRIMARY_NAV_RESET, view: "laboratory" })}>
              Data notes
            </button>
          </div>
        </div>

        {gold.contract.kind === "fixture" ? (
          <div className="fixture-warning" role="status">
            <strong>Live traffic is not connected.</strong>
            <span>This environment is displaying contract test data, not current GFD performance.</span>
          </div>
        ) : null}

        <nav className="primary-nav" aria-label="Traffic intelligence">
          {PRIMARY_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className="primary-nav__button"
              aria-current={item.matches.includes(filters.view) ? "page" : undefined}
              onClick={() => {
                if (!item.matches.includes(filters.view)) {
                  patchFilters({ ...PRIMARY_NAV_RESET, view: item.id });
                }
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-row">
            <div>
              <h1>{copy.title}</h1>
              <p className="lede">{copy.lede}</p>
            </div>
          </div>
          <FiltersBar gold={gold} payload={payload} filters={filters} onChange={patchFilters} />
        </header>

        <main id="main" className="main">
          {filters.view === "overview" && <OverviewView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "humans" && <HumansView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "geography" && <GeographyView payload={payload} filters={filters} />}

          {filters.view === "sites" && (
            <>
              <SitesView payload={payload} onOpenSite={(id) => patchFilters({ view: "site", site: id })} />
              <ContentView payload={payload} filters={filters} />
            </>
          )}
          {filters.view === "site" && site && <SiteDossierView site={site} onOpen={setEvidence} />}
          {filters.view === "site" && !site && <p className="empty">Select a property above to open its detail.</p>}
          {filters.view === "content" && <ContentView payload={payload} filters={filters} />}

          {filters.view === "ai" && (
            <>
              <AIView payload={payload} filters={filters} onOpen={setEvidence} />
              <AutomationView payload={payload} filters={filters} />
            </>
          )}
          {filters.view === "automation" && <AutomationView payload={payload} filters={filters} />}

          {filters.view === "laboratory" && (
            <>
              <LaboratoryView gold={gold} payload={payload} filters={filters} onOpen={setEvidence} />
              <HealthView payload={payload} filters={filters} onOpen={setEvidence} />
              <TechnologyView payload={payload} filters={filters} onOpen={setEvidence} />
            </>
          )}
          {filters.view === "technology" && <TechnologyView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "health" && <HealthView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "anomalies" && <AnomaliesView payload={payload} />}
        </main>
      </div>

      <EvidenceDrawer metric={evidence} gold={gold} onClose={() => setEvidence(null)} />
    </div>
  );
}
