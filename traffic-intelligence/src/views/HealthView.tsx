import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, filterRanked } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { RankedBars } from "../components/Charts";
import { RankedTable, Section } from "./common";

export function HealthView({
  payload,
  filters,
  onOpen,
}: {
  payload: WindowPayload;
  filters: Filters;
  onOpen: (metric: Metric) => void;
}) {
  return (
    <>
      <Section title="Technical health" note="Error and threat rates are pipeline ratios, not UI divisions.">
        <MetricGrid metrics={filterMetrics(payload.health.metrics, filters)} onOpen={onOpen} />
      </Section>
      <div className="split">
        <Section title="Status mix">
          <RankedBars rows={filterRanked(payload.health.errors, filters)} />
        </Section>
        <Section title="Sites with errors">
          <RankedTable rows={filterRanked(payload.health.sites, filters)} />
        </Section>
      </div>
      <Section title="Error paths">
        <RankedTable rows={filterRanked(payload.health.paths, filters)} />
      </Section>
    </>
  );
}
