import type { Anomaly, Metric, Opportunity, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, overviewMetrics, selectSite } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { TimeSeriesChart } from "../components/Charts";
import { Section } from "./common";

function Finding({ title, detail, action, tone = "watch" }: { title: string; detail: string; action?: string; tone?: "watch" | "action" | "ok" }) {
  return (
    <article className={`finding finding--${tone}`}>
      <div>
        <h3>{title}</h3>
        <p>{detail}</p>
      </div>
      {action ? <p className="finding__action">{action}</p> : null}
    </article>
  );
}

function anomalyTone(item: Anomaly): "watch" | "action" | "ok" {
  if (item.severity === "action") return "action";
  if (item.severity === "info") return "ok";
  return "watch";
}

function opportunityTone(_item: Opportunity): "ok" {
  return "ok";
}

export function OverviewView({
  payload,
  filters,
  onOpen,
}: {
  payload: WindowPayload;
  filters: Filters;
  onOpen: (metric: Metric) => void;
}) {
  const site = selectSite(payload, filters.site);
  const metrics = filterMetrics(overviewMetrics(payload, site), filters).filter((metric) => metric.value !== null);
  const series = payload.series.filter((s) => (filters.source === "all" ? true : s.source === filters.source));
  const findings = [
    ...payload.overview.anomalies.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      action: item.action,
      tone: anomalyTone(item),
    })),
    ...payload.overview.opportunities.slice(0, 3).map((item) => ({
      id: item.id,
      title: item.title,
      detail: item.detail,
      action: item.action,
      tone: opportunityTone(item),
    })),
  ].slice(0, 5);

  return (
    <>
      <section className="hero-summary" aria-labelledby="overview-summary-title">
        <div>
          <span className="eyebrow">Current read</span>
          <h2 id="overview-summary-title">
            {findings.length ? `${findings.length} things deserve attention.` : "No material findings are available for this period."}
          </h2>
          <p>
            {site
              ? `Showing ${site.domain}. Numbers below remain source-specific and are not blended into a synthetic visitor total.`
              : "Showing the GFD ecosystem. Human, edge and machine measurements remain distinct when their sources measure different things."}
          </p>
        </div>
        <div className="hero-summary__period">
          <span>{payload.window.label}</span>
          <strong>{payload.window.start} → {payload.window.end}</strong>
        </div>
      </section>

      <Section title="What matters now" note="Material findings first; supporting measurements follow.">
        {findings.length ? (
          <div className="findings-list">
            {findings.map((item) => (
              <Finding key={item.id} title={item.title} detail={item.detail} action={item.action} tone={item.tone} />
            ))}
          </div>
        ) : (
          <p className="empty">No anomalies or opportunities were supplied for this period.</p>
        )}
      </Section>

      <Section
        title="Key measurements"
        note="Only available measurements are shown here. Open a card for source, coverage and methodology."
      >
        <MetricGrid metrics={metrics.slice(0, 8)} onOpen={onOpen} />
      </Section>

      <Section title="Trend" note="Source series may be compared visually but are never added together.">
        <TimeSeriesChart series={series.slice(0, 6)} />
      </Section>

      <Section title="Measurement confidence" note="Use this only when deciding how much weight to give the findings above.">
        <MetricGrid metrics={filterMetrics(payload.overview.health, filters).slice(0, 6)} onOpen={onOpen} />
      </Section>
    </>
  );
}
