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

const NAV: { id: ViewId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "humans", label: "Humans" },
  { id: "ai", label: "AI & agents" },
  { id: "automation", label: "Other automation" },
  { id: "sites", label: "Sites" },
  { id: "content", label: "Content" },
  { id: "technology", label: "Technology" },
  { id: "geography", label: "Geography" },
  { id: "laboratory", label: "Laboratory" },
  { id: "anomalies", label: "Anomalies" },
  { id: "health", label: "Technical health" },
];

const VIEW_COPY: Record<ViewId, { title: string; lede: string }> = {
  overview: {
    title: "Executive overview",
    lede: "Edge volume, browser observations, GA4, Vercel, machine/AI activity, errors, threats, and measurement health — each from its own source.",
  },
  humans: {
    title: "Human evidence",
    lede: "Browser-side sessions, engagement, acquisition and Core Web Vitals. Not an edge unique count.",
  },
  ai: {
    title: "AI & agents",
    lede: "Crawlers, search, assistants and user-triggered agents as classed by the pipeline, with named actors.",
  },
  automation: {
    title: "Other automation",
    lede: "Search crawlers, monitors, clients, scanners and hostile traffic — kept out of the AI view.",
  },
  sites: {
    title: "Sites",
    lede: "One card per property. Click through for a dossier. Coverage is part of the measurement.",
  },
  site: {
    title: "Site dossier",
    lede: "Single-property Gold slice. Still not a blended visitor number.",
  },
  content: {
    title: "Content",
    lede: "Pages that attract humans, AI, search crawlers — and pages that fail.",
  },
  technology: {
    title: "Technology",
    lede: "Status, method, protocol, TLS, cache, colo, origin timing, deployment correlation.",
  },
  geography: {
    title: "Geography",
    lede: "Edge, browser, AI and threat maps are not interchangeable.",
  },
  laboratory: {
    title: "Measurement laboratory",
    lede: "Where Cloudflare edge, RUM, GA4, Vercel and first-party disagree — on purpose.",
  },
  anomalies: {
    title: "Anomalies",
    lede: "Pipeline-flagged spikes, divergence, and deployment-correlated changes.",
  },
  health: {
    title: "Technical health",
    lede: "Errors, threats, and paths that deserve operator action.",
  },
};

export function App() {
  const [gold, setGold] = useState<GoldContract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() =>
    typeof window === "undefined" ? FILTER_DEFAULTS : parseFilters(window.location.search),
  );
  const [evidence, setEvidence] = useState<Metric | null>(null);
  const [navOpen, setNavOpen] = useState(false);

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
    if (next !== current) {
      window.history.replaceState(filters, "", next);
    }
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
      <main className="main">
        <h1>Gold contract unavailable</h1>
        <p>{error}</p>
      </main>
    );
  }

  if (!gold || !payload) {
    return (
      <main className="main">
        <h1>Loading Gold contract…</h1>
        <p className="lede">Static JSON only. No live analytics APIs.</p>
      </main>
    );
  }

  return (
    <div className="app" data-theme={filters.theme} data-dataset={gold.contract.kind}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <nav className={`nav${navOpen ? " is-open" : ""}`} aria-label="Observatory">
        <div className="brand">
          <strong>GFD Traffic Intelligence</strong>
          <span>
            {gold.contract.pipelineVersion}
          </span>
          {gold.contract.kind === "fixture" ? (
            <div className="data-mode" data-mode="fixture">
              Fixture dataset · not live GFD traffic
            </div>
          ) : null}
        </div>
        <div className="nav-list">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className="nav-btn"
              aria-current={filters.view === item.id || (item.id === "sites" && filters.view === "site") ? "page" : undefined}
              onClick={() => {
                patchFilters({ view: item.id });
                setNavOpen(false);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="nav-foot">
          Observation {payload.window.start} → {payload.window.end}
          <span>
            {payload.window.timezone ?? "timezone undeclared"}
            {payload.window.partialCurrentPeriod ? " · partial period" : ""}
          </span>
          <span>generated_at {gold.contract.generatedAt}</span>
          <span>Shareable URL state is on.</span>
        </div>
      </nav>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-row">
            <div>
              <h1>{copy.title}</h1>
              <p className="lede">{copy.lede}</p>
            </div>
            <div className="top-actions">
              <button type="button" className="icon-btn mobile-nav-toggle" onClick={() => setNavOpen((v) => !v)}>
                Menu
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => patchFilters({ theme: filters.theme === "dark" ? "light" : "dark" })}
              >
                {filters.theme === "dark" ? "Light" : "Dark"}
              </button>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  const first = payload.overview.metrics[0];
                  if (first) setEvidence(first);
                }}
              >
                Methodology
              </button>
            </div>
          </div>
          <FiltersBar gold={gold} payload={payload} filters={filters} onChange={patchFilters} />
        </header>
        <main id="main" className="main">
          {filters.view === "overview" && <OverviewView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "humans" && <HumansView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "ai" && <AIView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "automation" && <AutomationView payload={payload} filters={filters} />}
          {filters.view === "sites" && (
            <SitesView
              payload={payload}
              onOpenSite={(id) => patchFilters({ view: "site", site: id })}
            />
          )}
          {filters.view === "site" && site && <SiteDossierView site={site} onOpen={setEvidence} />}
          {filters.view === "site" && !site && (
            <p className="empty">Select a site in the filter bar to open a dossier.</p>
          )}
          {filters.view === "content" && <ContentView payload={payload} filters={filters} />}
          {filters.view === "technology" && <TechnologyView payload={payload} filters={filters} onOpen={setEvidence} />}
          {filters.view === "geography" && <GeographyView payload={payload} filters={filters} />}
          {filters.view === "laboratory" && (
            <LaboratoryView gold={gold} payload={payload} filters={filters} onOpen={setEvidence} />
          )}
          {filters.view === "anomalies" && <AnomaliesView payload={payload} />}
          {filters.view === "health" && <HealthView payload={payload} filters={filters} onOpen={setEvidence} />}
        </main>
      </div>
      <EvidenceDrawer metric={evidence} gold={gold} onClose={() => setEvidence(null)} />
    </div>
  );
}
