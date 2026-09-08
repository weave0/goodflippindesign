import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, filterRanked } from "../gold/select";
import { RankedBars } from "../components/Charts";
import { MetricGrid } from "../components/MetricCard";
import { RankedTable, Section } from "./common";

export function TechnologyView({
  payload,
  filters,
  onOpen,
}: {
  payload: WindowPayload;
  filters: Filters;
  onOpen: (metric: Metric) => void;
}) {
  const t = payload.technology;
  return (
    <>
      <div className="split">
        <Section title="Response status">
          <RankedBars rows={filterRanked(t.status, filters)} />
        </Section>
        <Section title="HTTP method">
          <RankedBars rows={filterRanked(t.method, filters)} />
        </Section>
      </div>
      <div className="split">
        <Section title="Protocol">
          <RankedBars rows={filterRanked(t.protocol, filters)} />
        </Section>
        <Section title="TLS">
          <RankedBars rows={filterRanked(t.tls, filters)} />
        </Section>
      </div>
      <div className="split">
        <Section title="Cache status">
          <RankedBars rows={filterRanked(t.cache, filters)} />
        </Section>
        <Section title="Content type">
          <RankedBars rows={filterRanked(t.contentType, filters)} />
        </Section>
      </div>
      <Section title="Edge colo">
        <RankedTable rows={filterRanked(t.colo, filters)} />
      </Section>
      <Section title="Origin / performance" note="Present only where the pipeline emitted origin timing.">
        <MetricGrid metrics={filterMetrics(t.origin, filters)} onOpen={onOpen} />
      </Section>
      <Section title="Deployment correlation">
        <RankedTable rows={filterRanked(t.deployments, filters)} />
      </Section>
    </>
  );
}
