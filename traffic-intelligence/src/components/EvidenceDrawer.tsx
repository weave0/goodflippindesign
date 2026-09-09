import type { Definition, GoldContract, Metric } from "../gold/types";
import { coverageHint, coverageStateOf, evidenceHint, exactnessHint, formatConfidence, formatMetric, sourceLabel } from "../gold/format";
import { CoverageBadge, EvidenceBadge, ExactnessBadge } from "./StatusBadge";

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
  const evidence = metric.evidence_state ?? metric.evidenceState;
  const coverage = coverageStateOf(metric);
  const window = metric.timeWindow;
  const observation = metric.observation;
  const ratio = metric.ratio;
  const provenance = metric.provenance;
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
        <p className="badge-pair">
          <EvidenceBadge state={evidence} />
          <ExactnessBadge state={metric.exactness} />
          <CoverageBadge state={coverage} always />
        </p>
        <p className="section-note">
          {evidenceHint(evidence)} · {exactnessHint(metric.exactness)} · {coverageHint(coverage)}
        </p>
        <dl>
          <dt>Definition</dt>
          <dd>{metric.metric_definition}</dd>
          {definition ? (
            <>
              <dt>Supplemental glossary</dt>
              <dd>
              <>
                <strong>{definition.term}</strong>
                <div>{definition.text}</div>
              </>
              </dd>
            </>
          ) : null}
          <dt>Source</dt>
          <dd>{sourceLabel(metric.source)}</dd>
          <dt>Grain / boundary</dt>
          <dd>
            {metric.grain}
            {metric.semantics?.source_boundary ? ` · ${metric.semantics.source_boundary}` : ""}
          </dd>
          <dt>Uniqueness</dt>
          <dd>{metric.semantics?.unique_count_semantics ?? metric.uniqueSemantics ?? "not_unique_count"}</dd>
          <dt>Observation window</dt>
          <dd>
            {(observation?.start ?? window.start)} → {(observation?.end ?? window.end)}
            <div className="section-note">
              timezone {observation?.timezone ?? window.timezone ?? "not declared"}
              {observation?.boundary ? ` · ${observation.boundary}` : window.boundary ? ` · ${window.boundary}` : ""}
              {(observation?.partial_current_period ?? window.partialCurrentPeriod) ? " · partial current period" : ""}
            </div>
            <div className="section-note">
              extracted_at {observation?.extracted_at ?? window.extractedAt ?? "—"}
            </div>
            <div className="section-note">
              document generated_at {gold.contract.generatedAt} — not the measurement period
            </div>
          </dd>
          <dt>Evidence state</dt>
          <dd>{evidence}</dd>
          <dt>Exactness</dt>
          <dd>{metric.exactness}</dd>
          <dt>Coverage</dt>
          <dd>
            {coverage}
            {metric.coverage.observed_fraction != null ? ` · observed_fraction ${metric.coverage.observed_fraction}` : ""}
            {metric.coverage.missingness_reason ? <div className="section-note">{metric.coverage.missingness_reason}</div> : null}
          </dd>
          <dt>Sample interval</dt>
          <dd>
            {metric.sampling && "interval" in metric.sampling ? String(metric.sampling.interval ?? "—") : "—"}
            {metric.sampling && "meaning" in metric.sampling && metric.sampling.meaning ? (
              <div className="section-note">{metric.sampling.meaning}</div>
            ) : null}
          </dd>
          <dt>Sample factor</dt>
          <dd>{metric.sampling && "factor" in metric.sampling ? String(metric.sampling.factor ?? "—") : "—"}</dd>
          <dt>Confidence</dt>
          <dd>
            {formatConfidence(metric) ?? "Unknown — missing confidence is not 100%."}
            {(metric.confidence_interval?.valid === false || metric.confidence?.valid === false || metric.confidence?.intervalValid === false) && (
              <div className="callout">Interval marked invalid. Bounds are retained and must not be read as a valid CI.</div>
            )}
          </dd>
          {ratio ? (
            <>
              <dt>Ratio</dt>
              <dd>
                {"supplied_display" in ratio ? ratio.supplied_display : "display" in ratio ? ratio.display : null} ({"ratio_unit" in ratio ? ratio.ratio_unit : "unit" in ratio ? ratio.unit : ""})
                <div className="section-note">Producer-supplied. The UI does not recompute this ratio.</div>
                {"numerator" in ratio && ratio.numerator ? (
                  <div className="section-note">
                    numerator {ratio.numerator.reference_type}:{ratio.numerator.reference_id}
                    {"numerator_value" in ratio && ratio.numerator_value != null ? ` = ${ratio.numerator_value}` : ""}
                  </div>
                ) : (
                  <div className="section-note">numerator {"numeratorRef" in ratio ? ratio.numeratorRef : "—"}</div>
                )}
                {"denominator" in ratio && ratio.denominator ? (
                  <div className="section-note">
                    denominator {ratio.denominator.reference_type}:{ratio.denominator.reference_id}
                    {"denominator_value" in ratio && ratio.denominator_value != null ? ` = ${ratio.denominator_value}` : ""}
                  </div>
                ) : (
                  <div className="section-note">denominator {"denominatorRef" in ratio ? ratio.denominatorRef : "—"}</div>
                )}
              </dd>
            </>
          ) : null}
          {metric.classification ? (
            <>
              <dt>Classification</dt>
              <dd>
                native: {metric.classification.source_native_class ?? "—"}
                <div className="section-note">normalized: {metric.classification.normalized_class}</div>
                <div className="section-note">
                  source {metric.classification.source_id} · dataset {metric.classification.dataset_id}
                </div>
                {metric.classification.reason ? <div className="section-note">{metric.classification.reason}</div> : null}
              </dd>
            </>
          ) : null}
          {provenance ? (
            <>
              <dt>Method lineage</dt>
              <dd>
                {("method_id" in provenance && provenance.method_id) || ("modelId" in provenance && provenance.modelId) ? (
                  <div>
                    {("method_id" in provenance && provenance.method_id) || ("modelId" in provenance ? provenance.modelId : "")}{" "}
                    {("method_version" in provenance && provenance.method_version) || ("modelVersion" in provenance ? provenance.modelVersion : "")}
                  </div>
                ) : (
                  "—"
                )}
                {("source_metrics" in provenance && provenance.source_metrics?.length) ? (
                  <div className="section-note">source_metrics: {provenance.source_metrics.join(", ")}</div>
                ) : null}
              </dd>
            </>
          ) : null}
          <dt>Known limitations</dt>
          <dd>
            <ul>
              {(metric.limitations ??
                (provenance && "limitations" in provenance ? provenance.limitations : undefined) ??
                definition?.knownLimitations ?? ["None declared on this metric."]).map((item) => (
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
