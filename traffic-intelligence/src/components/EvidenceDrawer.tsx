import type { Definition, GoldContract, Metric } from "../gold/types";
import { formatConfidence, formatMetric, sourceLabel, statusHint } from "../gold/format";
import { StatusBadge } from "./StatusBadge";

export function EvidenceDrawer({
  metric,
  gold,
  onClose,
}: {
  metric: Metric | null;
  gold: GoldContract;
  onClose: () => void;
}) {
  if (!metric) return null;
  const definition: Definition | undefined = gold.definitions.find((d) => d.id === metric.definitionId);
  const source = gold.sources.find((s) => s.id === metric.source);
  return (
    <>
      <button type="button" className="drawer-backdrop" aria-label="Close evidence" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="evidence-title">
        <div className="row-between">
          <p className="kicker">Evidence</p>
          <button type="button" className="icon-btn" onClick={onClose}>
            Close
          </button>
        </div>
        <h2 id="evidence-title">{metric.label}</h2>
        <p className="lede">
          {formatMetric(metric)} · {sourceLabel(metric.source)}
        </p>
        <p>
          <StatusBadge status={metric.status} /> {statusHint(metric.status)}
        </p>
        <dl>
          <dt>Definition</dt>
          <dd>
            {definition ? (
              <>
                <strong>{definition.term}</strong>
                <div>{definition.text}</div>
              </>
            ) : (
              metric.definitionId
            )}
          </dd>
          <dt>Source</dt>
          <dd>
            {sourceLabel(metric.source)}
            {source ? <div className="section-note">{source.coverageNote}</div> : null}
          </dd>
          <dt>Grain</dt>
          <dd>{metric.grain}</dd>
          <dt>Time window</dt>
          <dd>
            {metric.timeWindow.start} → {metric.timeWindow.end} ({metric.timeWindow.id})
          </dd>
          <dt>Exact/sampled/estimated</dt>
          <dd>{metric.status}</dd>
          <dt>Sample interval</dt>
          <dd>{metric.sampleInterval ?? "—"}</dd>
          <dt>Sample factor</dt>
          <dd>{metric.sampleFactor ?? "—"}</dd>
          <dt>Confidence</dt>
          <dd>{formatConfidence(metric) ?? "Unknown — missing confidence is not 100%."}</dd>
          <dt>Known limitations</dt>
          <dd>
            <ul>
              {(metric.limitations ?? definition?.knownLimitations ?? ["None declared on this metric."]).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
          <dt>Pipeline version</dt>
          <dd className="mono">{metric.pipelineVersion}</dd>
        </dl>
      </aside>
    </>
  );
}
