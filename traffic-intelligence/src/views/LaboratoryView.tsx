import type { GoldContract, Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, filterRanked } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { SourceComparisonTable } from "../components/Charts";
import { RankedTable, Section } from "./common";
import { CoverageBadge, EvidenceBadge } from "../components/StatusBadge";

export function LaboratoryView({
  gold,
  payload,
  filters,
  onOpen,
}: {
  gold: GoldContract;
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
              {s.label} <EvidenceBadge state={s.typicalEvidence} /> <CoverageBadge state={s.coverage} />
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
      {gold.sourceSupport?.length ? (
        <Section title="Source support" note="Independent facts. Schema presence is not permission; permission is not returned data.">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Dataset</th>
                  <th>in schema</th>
                  <th>query permitted</th>
                  <th>window supported</th>
                  <th>retention</th>
                  <th>data returned</th>
                  <th>sampling</th>
                </tr>
              </thead>
              <tbody>
                {gold.sourceSupport.map((row) => (
                  <tr key={`${row.source_id}:${row.dataset_id}`}>
                    <td>{row.source_id}</td>
                    <td>{row.dataset_id}</td>
                    <td>{String(row.dataset_in_schema)}</td>
                    <td>{row.query_permitted}</td>
                    <td>{row.requested_window_supported}</td>
                    <td>{row.historical_retention_supported}</td>
                    <td>{row.data_returned}</td>
                    <td>{row.sampling_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
      {gold.topology ? (
        <Section title="Topology" note="Serving and observation boundaries. Aliases and shared infrastructure are not independent audiences and are not summed.">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Node</th>
                  <th>Type</th>
                  <th>Visibility</th>
                </tr>
              </thead>
              <tbody>
                {gold.topology.nodes.map((node) => (
                  <tr key={node.node_id}>
                    <td>{node.label}</td>
                    <td>{node.node_type}</td>
                    <td>{node.visibility ?? "unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>From</th>
                  <th>Relation</th>
                  <th>To</th>
                </tr>
              </thead>
              <tbody>
                {gold.topology.relationships.map((rel) => (
                  <tr key={rel.relationship_id}>
                    <td>{rel.from_node_id}</td>
                    <td>{rel.relation}</td>
                    <td>{rel.to_node_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      ) : null}
    </>
  );
}
