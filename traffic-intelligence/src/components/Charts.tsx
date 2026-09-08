import type { Heatmap, NamedSeries, RankedItem, SourceId } from "../gold/types";
import { formatMetric, formatNumber, sourceLabel } from "../gold/format";
import type { Metric } from "../gold/types";

const SOURCE_COLOR: Record<SourceId, string> = {
  cloudflare_edge: "var(--edge)",
  cloudflare_rum: "var(--rum)",
  ga4: "var(--ga4)",
  vercel: "var(--vercel)",
  first_party: "var(--first)",
  modeled: "var(--model)",
};

export function Sparkline({ values, source }: { values: number[]; source: SourceId }) {
  const numeric = values.filter((v) => Number.isFinite(v));
  if (numeric.length < 2) return null;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const span = max - min || 1;
  const w = 120;
  const h = 28;
  const d = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * w;
      const y = h - ((value - min) / span) * (h - 4) - 2;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} aria-hidden="true">
      <path d={d} fill="none" stroke={SOURCE_COLOR[source]} strokeWidth="1.5" />
    </svg>
  );
}

export function TimeSeriesChart({ series }: { series: NamedSeries[] }) {
  const visible = series.filter((s) => s.points.some((p) => p.value !== null));
  if (!visible.length) return <p className="empty">No series in this window.</p>;
  return (
    <div>
      <p className="section-note">
        Each series is scaled to itself. Different grains are not plotted on one axis.
      </p>
      <div className="series-grid">
        {visible.map((s) => (
          <MiniSeries key={s.id} series={s} />
        ))}
      </div>
    </div>
  );
}

function MiniSeries({ series }: { series: NamedSeries }) {
  const values = series.points.map((p) => p.value).filter((v): v is number => v !== null);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 320;
  const h = 72;
  const pad = { l: 2, r: 2, t: 6, b: 6 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;
  let d = "";
  let drawing = false;
  series.points.forEach((p, i) => {
    if (p.value === null) {
      drawing = false;
      return;
    }
    const x = pad.l + (i / Math.max(series.points.length - 1, 1)) * innerW;
    const y = pad.t + innerH - ((p.value - min) / (max - min || 1)) * innerH;
    d += `${drawing ? "L" : "M"}${x} ${y} `;
    drawing = true;
  });
  const first = series.points[0]?.date;
  const last = series.points[series.points.length - 1]?.date;
  return (
    <div className="mini-series">
      <div className="row-between">
        <span>
          {series.label} · {sourceLabel(series.source)}
        </span>
        <span className={`badge badge-${series.evidenceState}`}>{series.evidenceState}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={`${series.label} time series`}>
        <path
          d={d.trim()}
          fill="none"
          stroke={SOURCE_COLOR[series.source]}
          strokeWidth="1.8"
          strokeDasharray={series.evidenceState === "ESTIMATED" || series.evidenceState === "INFERRED" || series.coverage === "INCOMPLETE" ? "4 3" : undefined}
        />
      </svg>
      <div className="row-between section-note">
        <span>
          {first} → {last}
        </span>
        <span className="mono">
          {formatNumber(min)}–{formatNumber(max)}
        </span>
      </div>
    </div>
  );
}

export function RankedBars({
  rows,
  onSelect,
  tone,
}: {
  rows: RankedItem[];
  onSelect?: (row: RankedItem) => void;
  tone?: "ai" | "threat" | SourceId;
}) {
  if (!rows.length) return <p className="empty">No rows for these filters.</p>;
  const max = Math.max(...rows.map((r) => r.value ?? 0), 1);
  const fillClass = tone ? `bar-fill source-${tone}` : "bar-fill";
  return (
    <div className="bars">
      {rows.map((row) => {
        const width = row.value === null ? 0 : Math.max(2, (row.value / max) * 100);
        const label = row.display ?? (row.value === null ? "—" : formatNumber(row.value));
        const inner = (
          <>
            <span>{row.label}</span>
            <span className="bar-track">
              <span className={`${fillClass} source-${row.source}`} style={{ width: `${width}%` }} />
            </span>
            <span className="bar-value">
              {label}
              {row.shareDisplay ? ` · ${row.shareDisplay}` : ""}
            </span>
          </>
        );
        return onSelect ? (
          <button type="button" className="bar-row" key={row.id} onClick={() => onSelect(row)}>
            {inner}
          </button>
        ) : (
          <div className="bar-row" key={row.id}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

export function HeatmapChart({ heatmap }: { heatmap: Heatmap }) {
  const xs = [...new Set(heatmap.cells.map((c) => c.x))];
  const ys = [...new Set(heatmap.cells.map((c) => c.y))];
  const max = Math.max(...heatmap.cells.map((c) => c.value ?? 0), 1);
  return (
    <div>
      <p className="section-note">
        {heatmap.label} · {sourceLabel(heatmap.source)} · {heatmap.evidenceState} · {heatmap.coverage}
      </p>
      <div className="heatmap" role="img" aria-label={heatmap.label}>
        <div className="heatmap-row">
          <span />
          {xs.map((x) => (
            <span key={x} className="kicker" style={{ textAlign: "center" }}>
              {x}
            </span>
          ))}
        </div>
        {ys.map((y) => (
          <div className="heatmap-row" key={y}>
            <span className="kicker">{y}</span>
            {xs.map((x) => {
              const cell = heatmap.cells.find((c) => c.x === x && c.y === y);
              const t = (cell?.value ?? 0) / max;
              return (
                <span
                  key={`${y}-${x}`}
                  className="heat-cell"
                  title={`${y} ${x}: ${cell?.value ?? "—"} (${cell?.evidenceState ?? "UNAVAILABLE"})`}
                  style={{ background: `color-mix(in srgb, var(--ai) ${Math.round(t * 80)}%, var(--bg-hover))` }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SourceComparisonTable({
  rows,
  onOpen,
}: {
  rows: {
    id: string;
    label: string;
    grainNote: string;
    values: Partial<Record<SourceId, Metric>>;
    note: string;
  }[];
  onOpen: (metric: Metric) => void;
}) {
  const sources: SourceId[] = ["cloudflare_edge", "cloudflare_rum", "ga4", "vercel", "first_party"];
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Comparison</th>
            {sources.map((s) => (
              <th key={s}>{sourceLabel(s)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <strong>{row.label}</strong>
                <div className="section-note">{row.grainNote}</div>
              </td>
              {sources.map((s) => {
                const metric = row.values[s];
                if (!metric) return <td key={s}>—</td>;
                return (
                  <td key={s} className="num" title={`${metric.label} · ${metric.grain} · ${metric.evidenceState} · ${metric.coverage}`}>
                    <button type="button" className="linkish" onClick={() => onOpen(metric)}>
                      {formatMetric(metric)}
                    </button>
                    <div>
                      <span className={`badge badge-${metric.evidenceState}`}>{metric.evidenceState}</span>
                      {metric.coverage !== "COMPLETE" ? (
                        <span className={`badge badge-${metric.coverage}`}>{metric.coverage}</span>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
