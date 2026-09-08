import type { Definition, GoldContract, Metric } from "../gold/types";
import { coverageHint, evidenceHint, formatConfidence, formatMetric, sourceLabel } from "../gold/format";
import { CoverageBadge, EvidenceBadge } from "./StatusBadge";

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
  const window = metric.timeWindow;
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
          <EvidenceBadge state={metric.evidenceState} />
          <CoverageBadge state={metric.coverage} />
        </p>
        <p className="section-note">
          {evidenceHint(metric.evidenceState)} · {coverageHint(metric.coverage)}
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
          <dt>Observation window</dt>
          <dd>
            {window.start} → {window.end} ({window.id})
            <div className="section-note">
              timezone {window.timezone ?? "not declared"}
              {window.boundary ? ` · ${window.boundary}` : ""}
              {window.partialCurrentPeriod ? " · partial current period (pipeline flag)" : ""}
            </div>
            {window.extractedAt || window.generatedAt ? (
              <div className="section-note">
                extracted {window.extractedAt ?? "—"} · generated {window.generatedAt ?? "—"}
              </div>
            ) : null}
          </dd>
          <dt>Evidence state</dt>
          <dd>{metric.evidenceState}</dd>
          <dt>Coverage</dt>
          <dd>{metric.coverage}</dd>
          <dt>Sample interval</dt>
          <dd>
            {metric.sampling?.interval ?? "—"}
            {metric.sampling?.intervalMeaning ? <div className="section-note">{metric.sampling.intervalMeaning}</div> : null}
          </dd>
          <dt>Sample factor</dt>
          <dd>
            {metric.sampling?.factor ?? "—"}
            {metric.sampling?.factorMeaning ? <div className="section-note">{metric.sampling.factorMeaning}</div> : null}
          </dd>
          <dt>Confidence</dt>
          <dd>
            {formatConfidence(metric) ?? "Unknown — missing confidence is not 100%."}
            {metric.confidence?.intervalValid === false ? (
              <div className="callout">Interval marked invalid. Bounds are retained and must not be read as a valid CI.</div>
            ) : null}
            {typeof metric.confidence?.lower === "number" ? (
              <div className="section-note">
                lower {metric.confidence.lower} · upper {metric.confidence.upper} · valid{" "}
                {String(metric.confidence.intervalValid ?? "undeclared")}
              </div>
            ) : null}
          </dd>
          {metric.ratio ? (
            <>
              <dt>Ratio</dt>
              <dd>
                {metric.ratio.display ?? metric.ratio.value} ({metric.ratio.unit})
                {metric.ratio.authoritative ? " · pipeline-authoritative" : ""}
                <div className="section-note">
                  numerator {metric.ratio.numeratorRef ?? "—"}
                  {metric.ratio.numeratorValue != null ? ` = ${metric.ratio.numeratorValue}` : ""} · denominator{" "}
                  {metric.ratio.denominatorRef ?? "—"}
                  {metric.ratio.denominatorValue != null ? ` = ${metric.ratio.denominatorValue}` : ""}
                </div>
              </dd>
            </>
          ) : null}
          {metric.uniqueSemantics ? (
            <>
              <dt>Unique semantics</dt>
              <dd>{metric.uniqueSemantics.replaceAll("_", " ")}</dd>
            </>
          ) : null}
          {metric.sourceNativeClass || metric.normalizedClass ? (
            <>
              <dt>Classification</dt>
              <dd>
                native: {metric.sourceNativeClass ?? "—"}
                <div className="section-note">normalized: {metric.normalizedClass ?? "—"}</div>
              </dd>
            </>
          ) : null}
          {metric.provenance ? (
            <>
              <dt>Provenance</dt>
              <dd>
                {metric.provenance.modelId ? (
                  <div>
                    {metric.provenance.modelId} {metric.provenance.modelVersion ?? ""}
                  </div>
                ) : null}
                {metric.provenance.method ? <div>{metric.provenance.method}</div> : null}
                {metric.provenance.contributingSources?.length ? (
                  <div className="section-note">sources: {metric.provenance.contributingSources.join(", ")}</div>
                ) : null}
                {metric.provenance.contributingMetricIds?.length ? (
                  <div className="section-note">metrics: {metric.provenance.contributingMetricIds.join(", ")}</div>
                ) : null}
              </dd>
            </>
          ) : null}
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
