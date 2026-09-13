import { useMemo, useState } from "react";
import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, overviewMetrics, selectSite } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { TimeSeriesChart } from "../components/Charts";
import type { InsightFinding, TrafficInsightDocument } from "../insights/types";
import {
  TREND_METRIC_OPTIONS,
  findingCountsByProperty,
  insightTrendSeries,
  partitionFindings,
  prioritizedActions,
} from "../insights/select";
import { Section } from "./common";

function findingTone(kind: InsightFinding["kind"]): "watch" | "action" | "ok" {
  if (kind === "issue" || kind === "change" || kind === "data_gap") return "action";
  if (kind === "success" || kind === "opportunity") return "ok";
  return "watch";
}

function FindingCard({ finding }: { finding: InsightFinding }) {
  const comparison = finding.comparison;
  return (
    <article className={`finding finding--${findingTone(finding.kind)}`}>
      <div>
        <p className="finding__meta">
          <span>{finding.kind}</span>
          <span>{finding.severity}</span>
          {finding.property_id ? <span>{finding.property_id}</span> : null}
        </p>
        <h3>{finding.title}</h3>
        <p>{finding.explanation}</p>
        <p className="section-note">{finding.why_it_matters}</p>
        {comparison ? (
          <p className="section-note">
            {comparison.baseline_value.toLocaleString("en-US")} → {comparison.current_value.toLocaleString("en-US")} {comparison.unit}
            {comparison.percent_delta !== null
              ? ` (${comparison.percent_delta >= 0 ? "+" : ""}${(comparison.percent_delta * 100).toFixed(1)}%)`
              : ""}
          </p>
        ) : null}
      </div>
      <p className="finding__action">{finding.recommended_action}</p>
    </article>
  );
}

function FindingQueue({
  title,
  note,
  findings,
  empty,
}: {
  title: string;
  note: string;
  findings: InsightFinding[];
  empty: string;
}) {
  return (
    <Section title={title} note={note}>
      {findings.length ? (
        <div className="findings-list">
          {findings.slice(0, 6).map((finding) => (
            <FindingCard key={finding.finding_id} finding={finding} />
          ))}
        </div>
      ) : (
        <p className="empty">{empty}</p>
      )}
    </Section>
  );
}

export function OverviewView({
  payload,
  filters,
  insights,
  insightsError,
  onOpen,
}: {
  payload: WindowPayload;
  filters: Filters;
  insights: TrafficInsightDocument | null;
  insightsError: string | null;
  onOpen: (metric: Metric) => void;
}) {
  const [trendMetric, setTrendMetric] = useState<string>("requests");
  const site = selectSite(payload, filters.site);
  const siteDomain = site?.domain ?? (filters.site && filters.site !== "all" ? filters.site : null);
  const metrics = filterMetrics(overviewMetrics(payload, site), filters).filter((metric) => metric.value !== null);
  const queues = useMemo(() => partitionFindings(insights, siteDomain), [insights, siteDomain]);
  const actions = useMemo(() => prioritizedActions(insights, siteDomain), [insights, siteDomain]);
  const trendSeries = useMemo(
    () => insightTrendSeries(insights, payload, siteDomain, trendMetric),
    [insights, payload, siteDomain, trendMetric],
  );
  const counts = useMemo(() => findingCountsByProperty(insights), [insights]);
  const attentionCount = queues.needsAttention.length + queues.gaps.length;
  const propertyRows = payload.sites.slice(0, 40);

  return (
    <>
      <section className="hero-summary" aria-labelledby="overview-summary-title">
        <div>
          <span className="eyebrow">Command center</span>
          <h2 id="overview-summary-title">
            {insightsError
              ? "Governed insights unavailable"
              : attentionCount
                ? `${attentionCount} items need attention.`
                : insights
                  ? "No material issues in the governed feed."
                  : "Waiting for governed insight sidecar."}
          </h2>
          <p>
            {site
              ? `Showing ${site.domain}. Findings and trends come from the producer sidecar; measurements stay source-native.`
              : "Showing the GFD estate. Queues, trends, and actions are producer-governed — never invented in the browser."}
          </p>
          {insightsError ? <p className="empty" role="status">{insightsError}</p> : null}
          {insights?.fixture ? (
            <p className="fixture-banner" role="status">
              Insight sidecar is fixture data — not live GFD traffic.
            </p>
          ) : null}
        </div>
        <div className="hero-summary__period">
          <span>{payload.window.label}</span>
          <strong>
            {payload.window.start} → {payload.window.end}
          </strong>
          <span>{propertyRows.length} properties in Gold topology</span>
        </div>
      </section>

      <div className="mission-grid">
        <FindingQueue
          title="Needs attention"
          note="Governed issues and material changes."
          findings={queues.needsAttention}
          empty={insightsError ? "Insight sidecar unavailable." : "No governed issues or changes for this filter."}
        />
        <FindingQueue
          title="Momentum / wins"
          note="Governed successes and opportunities."
          findings={queues.momentum}
          empty={insightsError ? "Insight sidecar unavailable." : "No governed wins for this filter."}
        />
        <FindingQueue
          title="Measurement gaps"
          note="Fail-closed coverage and acquisition gaps."
          findings={queues.gaps}
          empty={insightsError ? "Insight sidecar unavailable." : "No governed measurement gaps for this filter."}
        />
      </div>

      <Section title="Estate trend" note="Daily producer series for the active reporting window. Series are never added across sources.">
        <div className="trend-controls" role="group" aria-label="Trend metric">
          {TREND_METRIC_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="range-button"
              aria-pressed={trendMetric === option.id}
              onClick={() => setTrendMetric(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        {insightsError ? (
          <p className="empty">Producer series unavailable until the insight sidecar loads.</p>
        ) : (
          <TimeSeriesChart series={trendSeries} />
        )}
      </Section>

      <Section title="Action queue" note="Prioritized next actions from the governed producer feed.">
        {actions.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Property</th>
                  <th>Class</th>
                  <th>Action</th>
                  <th>Verify</th>
                </tr>
              </thead>
              <tbody>
                {actions.slice(0, 12).map((action) => (
                  <tr key={action.action_id}>
                    <td className="num">
                      P{action.priority} · {action.severity}
                    </td>
                    <td>{action.property_id ?? action.scope}</td>
                    <td>{action.action_class}</td>
                    <td>{action.recommended_action}</td>
                    <td>{action.verification_condition}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">{insightsError ? "Insight sidecar unavailable." : "No governed actions for this filter."}</p>
        )}
      </Section>

      <Section title="Property health" note="Gold topology plus governed finding counts. No blended visitor totals.">
        {propertyRows.length ? (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Coverage</th>
                  <th>Findings</th>
                  <th>Issues</th>
                  <th>Wins</th>
                  <th>Gaps</th>
                </tr>
              </thead>
              <tbody>
                {propertyRows.map((row) => {
                  const key = row.domain;
                  const hit =
                    counts.get(key) ||
                    counts.get(row.id) ||
                    [...counts.entries()].find(([id]) => id.includes(key) || key.includes(id))?.[1];
                  return (
                    <tr key={row.id}>
                      <td>{row.domain}</td>
                      <td>{row.measurementHealth}</td>
                      <td className="num">{hit?.total ?? 0}</td>
                      <td className="num">{(hit?.issue ?? 0) + (hit?.change ?? 0)}</td>
                      <td className="num">{(hit?.success ?? 0) + (hit?.opportunity ?? 0)}</td>
                      <td className="num">{hit?.data_gap ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No properties in the current Gold topology.</p>
        )}
      </Section>

      <Section
        title="Key measurements"
        note="Source-native Gold metrics for the active window. Open a card for methodology."
      >
        <MetricGrid metrics={metrics.slice(0, 8)} onOpen={onOpen} />
      </Section>
    </>
  );
}
