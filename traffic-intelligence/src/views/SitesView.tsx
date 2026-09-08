import type { Metric, SiteRecord, WindowPayload } from "../gold/types";
import { formatMetric } from "../gold/format";
import { MetricGrid } from "../components/MetricCard";
import { RankedBars } from "../components/Charts";
import { RankedTable, Section } from "./common";
import { CoverageBadge } from "../components/StatusBadge";

function pick(site: SiteRecord, suffix: string) {
  return site.metrics.find((m) => m.id.endsWith(suffix) || m.id.includes(suffix));
}

export function SitesView({
  payload,
  onOpenSite,
}: {
  payload: WindowPayload;
  onOpenSite: (siteId: string) => void;
}) {
  return (
    <Section
      title="Properties"
      note="Each row is one site. Do not sum the request column with GA4 sessions. Coverage badges say which sources exist."
    >
      <div className="site-grid">
        {payload.sites.map((site) => {
          const requests = pick(site, "requests");
          const edgePv = pick(site, "edge_pv");
          const rum = pick(site, "rum");
          const sessions = pick(site, "ga4_sessions");
          const ai = pick(site, "ai");
          const errors = pick(site, "errors");
          const threat = pick(site, "threat_rate");
          const cache = pick(site, "cache");
          const bandwidth = pick(site, "bandwidth");
          return (
            <button key={site.id} type="button" className="site-card" onClick={() => onOpenSite(site.id)}>
              <div className="row-between">
                <div>
                  <h3>{site.name}</h3>
                  <div className="domain">{site.domain}</div>
                </div>
                <CoverageBadge state={site.measurementHealth} always />
              </div>
              <div className="section-note">{site.measurementHealthNote}</div>
              <div className="chip-row">
                {site.sourceCoverage.map((s) => (
                  <span key={`${s.id}:${s.shortLabel}`} className="chip">
                    {s.shortLabel} {s.typicalEvidence} · {s.coverage}
                  </span>
                ))}
              </div>
              <dl className="bars" style={{ gridTemplateColumns: "1fr" }}>
                <Mini label="Requests" metric={requests} />
                <Mini label="Edge PV" metric={edgePv} />
                <Mini label="Browser obs." metric={rum} />
                <Mini label="GA4 sessions" metric={sessions} />
                <Mini label="AI" metric={ai} />
                <Mini label="Errors" metric={errors} />
                <Mini label="Threat rate" metric={threat} />
                <Mini label="Cache" metric={cache} />
                <Mini label="Bandwidth" metric={bandwidth} />
              </dl>
              <div className="kicker">Core Web Vitals</div>
              <div className="chip-row">
                {site.cwv?.map((m) => (
                  <span key={m.id} className="chip">
                    {m.label} {formatMetric(m)}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </Section>
  );
}

function Mini({ label, metric }: { label: string; metric?: Metric }) {
  return (
    <div className="row-between" style={{ fontSize: 12 }}>
      <span className="section-note">{label}</span>
      <span className="mono">{metric ? formatMetric(metric) : "—"}</span>
    </div>
  );
}

export function SiteDossierView({
  site,
  onOpen,
}: {
  site: SiteRecord;
  onOpen: (metric: Metric) => void;
}) {
  return (
    <>
      <Section title={`${site.name} dossier`} note={site.measurementHealthNote}>
        <p className="lede">{site.domain}</p>
        <CoverageBadge state={site.measurementHealth} always />
        <MetricGrid metrics={site.metrics} onOpen={onOpen} />
      </Section>
      <Section title="Source coverage">
        <RankedTable
          rows={site.sourceCoverage.map((s) => ({
            id: s.id,
            label: s.label,
            value: null,
            display: `${s.typicalEvidence} · ${s.coverage}`,
            source: s.id,
            evidence_state: s.typicalEvidence,
            evidenceState: s.typicalEvidence,
            coverage: s.coverage,
            grain: "count" as const,
            definitionId: "def.confidence",
            extra: s.coverageNote,
          }))}
        />
      </Section>
      <div className="split">
        <Section title="AI actors on this site">
          <RankedBars rows={site.aiActors ?? []} tone="ai" />
        </Section>
        <Section title="Errors">
          <RankedBars rows={site.errors ?? []} />
        </Section>
      </div>
      <Section title="Core Web Vitals">
        <MetricGrid metrics={site.cwv ?? []} onOpen={onOpen} />
      </Section>
    </>
  );
}


