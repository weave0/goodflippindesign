import type { WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterRanked } from "../gold/select";
import { RankedBars } from "../components/Charts";
import { RankedTable, Section } from "./common";

export function AutomationView({ payload, filters }: { payload: WindowPayload; filters: Filters }) {
  const rows = filterRanked(payload.automation.filter(Boolean), filters);
  return (
    <>
      <Section
        title="Other automation"
        note="Separated from AI actors on purpose. Search crawlers, monitors, curl, scanners and hostile traffic are not 'the bots' as a single pile."
      >
        <RankedBars rows={rows} />
      </Section>
      <Section title="Detail">
        <RankedTable rows={rows} valueHeader="Edge requests / events" />
      </Section>
    </>
  );
}
