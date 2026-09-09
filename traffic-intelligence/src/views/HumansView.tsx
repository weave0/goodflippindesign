import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, filterRanked } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { RankedBars } from "../components/Charts";
import { RankedTable, Section } from "./common";

export function HumansView({
  payload,
  filters,
  onOpen,
}: {
  payload: WindowPayload;
  filters: Filters;
  onOpen: (metric: Metric) => void;
}) {
  const h = payload.humans;
  const machine = filterRanked(
    payload.taxonomy.filter((row) => row.id !== "tax.human_evidence"),
    { ...filters, source: filters.source === "all" ? "cloudflare_edge" : filters.source },
  );

  return (
    <>
      <Section
        title="Humans vs machines"
        note="Left: browser-side evidence (RUM / GA4 / first-party). Right: edge taxonomy, including UNKNOWN. These are different objects. A browser-like UA is not proof of a human."
      >
        <div className="split">
          <div>
            <h3 className="kicker">Evidence that suggests humans</h3>
            <MetricGrid metrics={filterMetrics(h.metrics, filters)} onOpen={onOpen} />
          </div>
          <div>
            <h3 className="kicker">Evidence that suggests automation (edge class)</h3>
            <RankedBars rows={machine} />
          </div>
        </div>
      </Section>
      <Section title="Sessions" note="GA4 sessions and RUM sessions are not the same grain.">
        <MetricGrid metrics={filterMetrics(h.sessions, filters)} onOpen={onOpen} />
      </Section>
      <div className="split">
        <Section title="Acquisition">
          <RankedBars rows={filterRanked(h.acquisition, filters)} />
        </Section>
        <Section title="Search">
          <RankedTable rows={filterRanked(h.search, filters)} />
        </Section>
      </div>
      <div className="split">
        <Section title="Social">
          <RankedBars rows={filterRanked(h.social, filters)} />
        </Section>
        <Section title="Referrers">
          <RankedTable rows={filterRanked(h.referrers, filters)} />
        </Section>
      </div>
      <div className="split-3">
        <Section title="Device">
          <RankedBars rows={filterRanked(h.devices, filters)} />
        </Section>
        <Section title="Browser">
          <RankedBars rows={filterRanked(h.browsers, filters)} />
        </Section>
        <Section title="Browser geography" note="GA4 country on sessions. Not edge geography.">
          <RankedBars rows={filterRanked(h.geography, filters)} />
        </Section>
      </div>
      <div className="split">
        <Section title="Landing pages">
          <RankedTable rows={filterRanked(h.landingPages, filters)} />
        </Section>
        <Section title="Content">
          <RankedTable rows={filterRanked(h.content, filters)} />
        </Section>
      </div>
      <Section title="Core Web Vitals" note="RUM only. Properties without RUM are excluded, not zero.">
        <MetricGrid metrics={filterMetrics(h.cwv, filters)} onOpen={onOpen} />
      </Section>
    </>
  );
}
