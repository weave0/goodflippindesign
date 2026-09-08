import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, overviewMetrics, selectSite } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { TimeSeriesChart } from "../components/Charts";
import { AnomalyList, Section } from "./common";

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
  const metrics = filterMetrics(overviewMetrics(payload, site), filters);
  const series = payload.series.filter((s) => (filters.source === "all" ? true : s.source === filters.source));

  return (
    <>
      <Section
        title="Independent source cards"
        note={
          site
            ? `Site slice: ${site.domain}. These are the site's pipeline metrics, not a roll-up you should add to other sites.`
            : "Each card is one source. Do not add them together. There is no ecosystem 'visitors' total."
        }
      >
        <MetricGrid metrics={metrics} onOpen={onOpen} />
      </Section>
      <Section title="Volume over time" note={`${payload.window.start} → ${payload.window.end}. Overlay is comparison, not a sum.`}>
        <TimeSeriesChart series={series} />
      </Section>
      <div className="split">
        <Section title="Major anomalies">
          <AnomalyList items={payload.overview.anomalies} />
        </Section>
        <Section title="Major opportunities">
          {payload.overview.opportunities.map((item) => (
            <div key={item.id} className="callout ok">
              <strong>{item.title}</strong>
              <div>{item.detail}</div>
              {item.action ? <div className="section-note">{item.action}</div> : null}
            </div>
          ))}
        </Section>
      </div>
      <Section title="Measurement health" note="Health is coverage and sampling — not a traffic score.">
        <MetricGrid metrics={filterMetrics(payload.overview.health, filters)} onOpen={onOpen} />
      </Section>
    </>
  );
}
