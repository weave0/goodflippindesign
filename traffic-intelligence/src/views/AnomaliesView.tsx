import type { WindowPayload } from "../gold/types";
import { AnomalyList, Section } from "./common";

export function AnomaliesView({ payload }: { payload: WindowPayload }) {
  return (
    <Section title="Anomaly timeline" note="Pipeline-flagged events. The UI does not detect spikes itself.">
      <AnomalyList items={payload.anomalies} />
    </Section>
  );
}
