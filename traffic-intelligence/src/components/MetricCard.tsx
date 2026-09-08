import type { Metric } from "../gold/types";
import { evidenceHint, formatConfidence, formatMetric, isAbsentMetric, sourceLabel } from "../gold/format";
import { EvidencePair } from "./StatusBadge";
import { Sparkline } from "./Charts";

export function MetricCard({
  metric,
  onOpen,
}: {
  metric: Metric;
  onOpen: (metric: Metric) => void;
}) {
  const ci = formatConfidence(metric);
  const absent = isAbsentMetric(metric);
  return (
    <button
      type="button"
      className={`metric-card${absent ? " is-unavailable" : ""}`}
      onClick={() => onOpen(metric)}
      aria-label={`${metric.label}, ${sourceLabel(metric.source)}, ${formatMetric(metric)}, ${metric.evidenceState}, coverage ${metric.coverage}. ${evidenceHint(metric.evidenceState)}`}
    >
      <div className="metric-card__meta">
        <span className="metric-card__source" data-source={metric.source}>
          {sourceLabel(metric.source)}
        </span>
        <EvidencePair evidence={metric.evidenceState} coverage={metric.coverage} />
      </div>
      <div className="metric-card__label">{metric.label}</div>
      <div className="metric-card__value">{formatMetric(metric)}</div>
      {metric.unit && !absent && !metric.display ? <div className="metric-card__unit">{metric.unit}</div> : null}
      {metric.deltaDisplay ? <div className="metric-card__delta">{metric.deltaDisplay}</div> : null}
      {ci ? (
        <div className={`metric-card__ci${metric.confidence?.intervalValid === false ? " is-invalid" : ""}`}>{ci}</div>
      ) : null}
      {typeof metric.sampling?.interval === "number" ? (
        <div className="metric-card__ci">
          sample interval {metric.sampling.interval}
        </div>
      ) : null}
      {metric.sparkline && metric.sparkline.length > 1 ? (
        <Sparkline values={metric.sparkline} source={metric.source} />
      ) : null}
    </button>
  );
}

export function MetricGrid({
  metrics,
  onOpen,
}: {
  metrics: Metric[];
  onOpen: (metric: Metric) => void;
}) {
  if (!metrics.length) return <p className="empty">No metrics match the current filters.</p>;
  return (
    <div className="metric-grid">
      {metrics.map((metric) => (
        <MetricCard key={metric.id} metric={metric} onOpen={onOpen} />
      ))}
    </div>
  );
}
