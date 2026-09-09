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
        Cloudflare request country is not a demographic dataset and not human location. RUM-observed browser geography and
        GA4-observed user geography are separate, sampled, browser-side slices.
      </p>
      <div className="split">
        <Section title="Cloudflare request country" note={g.captions.edge}>
          <RankedBars rows={filterRanked(g.edge, filters)} />
        </Section>
        <Section title="RUM / GA4-observed geography" note={g.captions.browser}>
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
