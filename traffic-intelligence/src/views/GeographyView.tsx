import type { WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterRanked } from "../gold/select";
import { RankedBars } from "../components/Charts";
import { Section } from "./common";

export function GeographyView({ payload, filters }: { payload: WindowPayload; filters: Filters }) {
  const g = payload.geography;
  return (
    <>
      <p className="callout">
        Four geographies, four meanings. Edge country is not a human map. Browser geography is sampled GA4. AI geography is
        actor infrastructure. Threat geography is security events.
      </p>
      <div className="split">
        <Section title="Total edge geography" note={g.captions.edge}>
          <RankedBars rows={filterRanked(g.edge, filters)} />
        </Section>
        <Section title="Confirmed browser geography" note={g.captions.browser}>
          <RankedBars rows={filterRanked(g.browser, filters)} />
        </Section>
      </div>
      <div className="split">
        <Section title="AI geography" note={g.captions.ai}>
          <RankedBars rows={filterRanked(g.ai, filters)} tone="ai" />
        </Section>
        <Section title="Threat geography" note={g.captions.threat}>
          <RankedBars rows={filterRanked(g.threat, filters)} tone="threat" />
        </Section>
      </div>
    </>
  );
}
