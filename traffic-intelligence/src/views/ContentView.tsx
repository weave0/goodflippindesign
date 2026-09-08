import type { WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { ContentTable, Section } from "./common";

function pathMatch<T extends { path: string; siteId: string }>(rows: T[], filters: Filters): T[] {
  return rows.filter((row) => {
    if (filters.site !== "all" && row.siteId !== filters.site) return false;
    if (filters.path && !row.path.toLowerCase().includes(filters.path.toLowerCase())) return false;
    return true;
  });
}

export function ContentView({ payload, filters }: { payload: WindowPayload; filters: Filters }) {
  const c = payload.content;
  return (
    <>
      <Section title="Human-popular pages" note="GA4 / browser evidence. Not edge page views.">
        <ContentTable rows={pathMatch(c.humanPopular, filters)} />
      </Section>
      <Section title="AI-popular pages" note="Edge requests classed as AI. Not readers.">
        <ContentTable rows={pathMatch(c.aiPopular, filters)} />
      </Section>
      <Section title="Search-crawler-popular pages">
        <ContentTable rows={pathMatch(c.searchCrawlerPopular, filters)} />
      </Section>
      <div className="split">
        <Section title="High-error paths">
          <ContentTable rows={pathMatch(c.highError, filters)} />
        </Section>
        <Section title="404 destinations">
          <ContentTable rows={pathMatch(c.notFound, filters)} />
        </Section>
      </div>
      <div className="split">
        <Section title="High-bandwidth content">
          <ContentTable rows={pathMatch(c.highBandwidth, filters)} />
        </Section>
        <Section title="High-engagement content" note="GA4 engagement as emitted. Sampled.">
          <ContentTable rows={pathMatch(c.highEngagement, filters)} />
        </Section>
      </div>
      <Section
        title="Strong AI-to-human ratios"
        note="Ratios are pipeline-provided displays. The UI does not divide AI requests by GA4 sessions."
      >
        <ContentTable rows={pathMatch(c.aiToHuman, filters)} />
      </Section>
      <Section title="Strong human-to-machine ratios" note="Same rule: display only.">
        <ContentTable rows={pathMatch(c.humanToMachine, filters)} />
      </Section>
    </>
  );
}
