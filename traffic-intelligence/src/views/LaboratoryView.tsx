import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, filterRanked } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { SourceComparisonTable } from "../components/Charts";
import { RankedTable, Section } from "./common";
import { StatusBadge } from "../components/StatusBadge";

export function LaboratoryView({
  payload,
  filters,
  onOpen,
}: {
  payload: WindowPayload;
  filters: Filters;
  onOpen: (metric: Metric) => void;
}) {
  const lab = payload.laboratory;
  return (
    <>
      <Section
        title="Measurement laboratory"
        note="This view exists to keep sources from being blended. Disagreement is a result, not a bug."
      >
        <div className="chip-row">
          {lab.coverage.map((s) => (
            <span key={s.id} className="chip">
              {s.label} <StatusBadge status={s.coverage} />
            </span>
          ))}
        </div>
      </Section>
      <Section title="Source disagreement">
        <SourceComparisonTable rows={lab.disagreement} onOpen={onOpen} />
        {lab.disagreement.map((row) => (
          <p key={row.id} className="section-note">
            {row.note}
          </p>
        ))}
      </Section>
      <Section title="Sample factor">
        <MetricGrid metrics={filterMetrics(lab.sampleFactors, filters)} onOpen={onOpen} />
      </Section>
      <Section title="Missingness">
        <RankedTable rows={filterRanked(lab.missingness, filters)} />
      </Section>
      <Section title="Definition notes">
        <ul>
          {lab.definitionNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
