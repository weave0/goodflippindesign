import type { Metric } from "../gold/types";
import { formatConfidence, formatMetric, sourceLabel, statusHint } from "../gold/format";
import { StatusBadge } from "./StatusBadge";
import { Sparkline } from "./Charts";

export function MetricCard({
  metric,
  onOpen,
}: {
  metric: Metric;
  onOpen: (metric: Metric) => void;
}) {
  const ci = formatConfidence(metric);
  return (
    <button
      type="button"
      className={`metric-card${metric.status === "UNAVAILABLE" ? " is-unavailable" : ""}`}
      onClick={() => onOpen(metric)}
      aria-label={`${metric.label}, ${sourceLabel(metric.source)}, ${formatMetric(metric)}, ${metric.status}. ${statusHint(metric.status)}`}
    >
      <div className="metric-card__meta">
        <span className="metric-card__source" data-source={metric.source}>
          {sourceLabel(metric.source)}
        </span>
        <StatusBadge status={metric.status} />
      </div>
      <div className="metric-card__label">{metric.label}</div>
      <div className="metric-card__value">{formatMetric(metric)}</div>
      {metric.unit && metric.status !== "UNAVAILABLE" && !metric.display ? (
        <div className="metric-card__unit">{metric.unit}</div>
      ) : null}
      {metric.deltaDisplay ? <div className="metric-card__delta">{metric.deltaDisplay}</div> : null}
      {ci ? <div className="metric-card__ci">{ci}</div> : null}
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
