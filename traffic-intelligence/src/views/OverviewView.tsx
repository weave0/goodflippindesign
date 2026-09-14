import { useMemo, useState } from "react";
import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterMetrics, overviewMetrics, selectSite } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { TimeSeriesChart } from "../components/Charts";
import type {
  InsightPriority,
  OperationalBrief,
  PropertyHealth,
  TrafficInsightDocument,
} from "../insights/types";
import {
  TREND_METRIC_OPTIONS,
  briefsForProperty,
  estateBriefOf,
  estateStatusLabel,
  focusedTrendSeries,
  priorityLabel,
  prioritizedActions,
  propertyHealthRows,
  rankedBriefs,
  rankedTrendChanges,
} from "../insights/select";
import { Section } from "./common";

function statusTone(status: string): "ok" | "watch" | "action" | "blocked" {
  if (status === "stable" || status === "healthy" || status === "rising" || status === "normal" || status === "complete") {
    return "ok";
  }
  if (status === "degraded" || status === "act_now" || status === "declining" || status === "elevated" || status === "blocked") {
    return "action";
  }
  if (status === "measurement_blocked" || status === "insufficient_evidence") return "blocked";
  return "watch";
}

function BriefCard({
  brief,
  onOpenProperty,
}: {
  brief: OperationalBrief;
  onOpenProperty: (propertyId: string) => void;
}) {
  const [openMeta, setOpenMeta] = useState(false);
  return (
    <article className={`brief-card brief-card--${statusTone(brief.priority)}`}>
      <header className="brief-card__header">
        <div className="brief-card__badges">
          <span className={`priority-pill priority-pill--${brief.priority}`}>{priorityLabel(brief.priority)}</span>
          <span className="meta-chip">{brief.category}</span>
          <span className="meta-chip">{brief.severity}</span>
          <span className="meta-chip">confidence {brief.confidence}</span>
        </div>
        <button type="button" className="linkish" onClick={() => onOpenProperty(brief.property_id)}>
          {brief.property_id}
        </button>
      </header>
      <h3>{brief.headline}</h3>
      <p>{brief.summary}</p>
      <p className="brief-card__action">
        <strong>Do:</strong> {brief.recommended_action}
      </p>
      <p className="section-note">
        <strong>Verify:</strong> {brief.verification_condition}
      </p>
      {brief.persistence.length ? (
        <p className="section-note">Persistence: {brief.persistence.join(", ")}</p>
      ) : null}
      <button type="button" className="disclosure-toggle" aria-expanded={openMeta} onClick={() => setOpenMeta((v) => !v)}>
        {openMeta ? "Hide evidence metadata" : "Show evidence metadata"}
      </button>
      {openMeta ? (
        <div className="disclosure-panel">
          <p className="section-note">Findings: {brief.finding_ids.join(", ") || "—"}</p>
          <p className="section-note">Corroborating: {brief.corroborating_signals.join("; ") || "—"}</p>
          <p className="section-note">Contradictory: {brief.contradictory_signals.join("; ") || "—"}</p>
          <p className="section-note">Limitations: {brief.limitations.join("; ") || "—"}</p>
        </div>
      ) : null}
    </article>
  );
}

function HealthCell({ label, value }: { label: string; value: string }) {
  return (
    <span className={`health-chip health-chip--${statusTone(value)}`} title={label}>
      <em>{label}</em> {value}
    </span>
  );
}

export function OverviewView({
  payload,
  filters,
  insights,
  insightsError,
  onOpen,
  onSelectProperty,
}: {
  payload: WindowPayload;
  filters: Filters;
  insights: TrafficInsightDocument | null;
  insightsError: string | null;
  onOpen: (metric: Metric) => void;
  onSelectProperty: (propertyId: string) => void;
}) {
  const [trendMetric, setTrendMetric] = useState<string>("requests");
  const [showWatch, setShowWatch] = useState(false);
  const [showAllActions, setShowAllActions] = useState(false);
  const [focusProperty, setFocusProperty] = useState<string | null>(null);
  const [showMeasurements, setShowMeasurements] = useState(false);

  const site = selectSite(payload, filters.site);
  const siteDomain = site?.domain ?? (filters.site && filters.site !== "all" ? filters.site : null);
  const metrics = filterMetrics(overviewMetrics(payload, site), filters).filter((metric) => metric.value !== null);

  const estate = useMemo(() => estateBriefOf(insights), [insights]);
  const primaryPriorities: InsightPriority[] = showWatch
    ? ["act_now", "investigate", "watch"]
    : ["act_now", "investigate"];
  const briefs = useMemo(
    () => rankedBriefs(insights, siteDomain, primaryPriorities),
    [insights, siteDomain, showWatch],
  );
  const watchCount = useMemo(
    () => rankedBriefs(insights, siteDomain, ["watch"]).length,
    [insights, siteDomain],
  );
  const actions = useMemo(() => prioritizedActions(insights, siteDomain), [insights, siteDomain]);
  const health = useMemo(() => propertyHealthRows(insights, siteDomain), [insights, siteDomain]);
  const trendRows = useMemo(
    () => rankedTrendChanges(insights, payload, trendMetric, siteDomain, 8),
    [insights, payload, trendMetric, siteDomain],
  );

  const chartProperty =
    focusProperty ||
    siteDomain ||
    trendRows[0]?.property_id ||
    health[0]?.property_id ||
    null;
  const chartSeries = useMemo(
    () => focusedTrendSeries(insights, payload, chartProperty, trendMetric),
    [insights, payload, chartProperty, trendMetric],
  );

  const dossierProperty = siteDomain;
  const dossierBriefs = useMemo(
    () => (dossierProperty ? briefsForProperty(insights, dossierProperty) : []),
    [insights, dossierProperty],
  );
  const dossierHealth = useMemo(
    () => (dossierProperty ? health.find((row) => row.property_id === dossierProperty) ?? null : null),
    [health, dossierProperty],
  );
  const dossierActions = useMemo(
    () => (dossierProperty ? prioritizedActions(insights, dossierProperty) : []),
    [insights, dossierProperty],
  );

  const visibleActions = showAllActions ? actions : actions.slice(0, 8);
  const schemaReady = Boolean(insights && (insights.schema_version === "1.0.0" || insights.estate_brief));
  const missingSynthesis =
    insights?.schema_version === "1.1.0" && (!insights.estate_brief || !insights.briefs);
  const metricOption = TREND_METRIC_OPTIONS.find((o) => o.id === trendMetric);

  const openProperty = (propertyId: string) => {
    setFocusProperty(propertyId);
    onSelectProperty(propertyId);
  };

  return (
    <>
      <section className="cockpit-hero" aria-labelledby="overview-summary-title">
        <div className="cockpit-hero__main">
          <span className="eyebrow">Decision cockpit</span>
          <div className="cockpit-hero__title-row">
            <h2 id="overview-summary-title">
              {insightsError
                ? "Governed insights unavailable"
                : missingSynthesis
                  ? "Insight synthesis incomplete"
                  : estate
                    ? estateStatusLabel(estate.status)
                    : insights
                      ? "Estate brief unavailable"
                      : "Waiting for governed insight sidecar"}
            </h2>
            {estate ? (
              <span className={`status-badge status-badge--${statusTone(estate.status)}`} role="status">
                {estateStatusLabel(estate.status)}
              </span>
            ) : null}
          </div>
          <p>
            {siteDomain
              ? `Property focus: ${siteDomain}. Period filters stay active; drill-down uses the same governed sidecar.`
              : "Estate-first operator view: status, what changed, what improved, what to do, and confidence — before raw queues."}
          </p>
          {insightsError ? <p className="empty" role="status">{insightsError}</p> : null}
          {!insightsError && !insights ? (
            <p className="empty" role="status">
              Insight sidecar has not loaded. Decision surfaces stay empty (fail closed).
            </p>
          ) : null}
          {!insightsError && insights && !schemaReady ? (
            <p className="empty" role="status">
              Insight document is missing estate synthesis. Require producer schema 1.1.0 with estate_brief.
            </p>
          ) : null}
          {insights?.fixture ? (
            <p className="fixture-banner" role="status">
              Insight sidecar is fixture / gold test data — not live GFD traffic.
            </p>
          ) : null}
        </div>
        <aside className="cockpit-hero__period" aria-label="Reporting freshness">
          <span className="eyebrow">Reporting period</span>
          <strong>{payload.window.label}</strong>
          <span className="mono">
            {payload.window.start} → {payload.window.end}
          </span>
          {insights?.generated_at ? (
            <span>Insights generated {insights.generated_at}</span>
          ) : (
            <span>Insights freshness unavailable</span>
          )}
          <span>{payload.sites.length} properties in Gold topology</span>
        </aside>
      </section>

      <Section title="Executive estate brief" note="Producer estate_brief — not browser-invented narrative.">
        {insightsError || !insights ? (
          <p className="empty">Unavailable until the insight sidecar loads.</p>
        ) : !estate ? (
          <p className="empty">Fail closed: estate_brief missing from insight sidecar.</p>
        ) : (
          <div className="estate-brief-grid">
            <BriefList title="What changed" items={estate.top_changes} empty="No material changes called out." />
            <BriefList title="What improved" items={estate.top_wins} empty="No wins called out." />
            <BriefList
              title="Measurement limitations"
              items={estate.measurement_limitations}
              empty="No measurement limitations called out."
            />
            <BriefList title="Top actions" items={estate.top_actions} empty="No top actions called out." />
            <div className="estate-panel">
              <h3>Properties to inspect</h3>
              {estate.properties_to_inspect.length ? (
                <ul className="chip-list">
                  {estate.properties_to_inspect.map((id) => (
                    <li key={id}>
                      <button type="button" className="chip-button" onClick={() => openProperty(id)}>
                        {id}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">None flagged.</p>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Top briefs"
        note="Ranked operational briefs. Default: Act now + Investigate. Expand to include Watch."
      >
        {insightsError || !insights ? (
          <p className="empty">Unavailable until the insight sidecar loads.</p>
        ) : insights.schema_version === "1.1.0" && !insights.briefs.length ? (
          <p className="empty">Fail closed: no briefs in schema 1.1 sidecar.</p>
        ) : briefs.length ? (
          <>
            <div className="brief-list">
              {briefs.map((brief) => (
                <BriefCard key={brief.brief_id} brief={brief} onOpenProperty={openProperty} />
              ))}
            </div>
            {watchCount > 0 ? (
              <button type="button" className="range-button" aria-pressed={showWatch} onClick={() => setShowWatch((v) => !v)}>
                {showWatch ? "Hide Watch briefs" : `Show Watch (${watchCount})`}
              </button>
            ) : null}
          </>
        ) : (
          <p className="empty">
            {showWatch
              ? "No briefs for this filter."
              : "No Act now / Investigate briefs for this filter. Expand Watch if needed."}
          </p>
        )}
      </Section>

      <Section
        title="Comparative trends"
        note={`${metricOption?.label ?? trendMetric} · Cloudflare edge · units labeled · missingness shown. Ranked change table + focused chart — not 25 mini-series.`}
      >
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
        {insightsError || !insights ? (
          <p className="empty">Producer series unavailable until the insight sidecar loads.</p>
        ) : (
          <div className="trend-focus-grid">
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Property</th>
                    <th>Current half</th>
                    <th>Prior half</th>
                    <th>Δ</th>
                    <th>Missingness</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.length ? (
                    trendRows.map((row) => (
                      <tr key={`${row.property_id}:${row.metric_name}`}>
                        <td>
                          <button type="button" className="linkish" onClick={() => openProperty(row.property_id)}>
                            {row.property_id}
                          </button>
                          <div className="section-note">
                            {row.label} · {row.unit} · {row.source}
                          </div>
                        </td>
                        <td className="num">{row.current_value.toLocaleString("en-US")}</td>
                        <td className="num">
                          {row.prior_value === null ? "—" : row.prior_value.toLocaleString("en-US")}
                        </td>
                        <td className="num">
                          {row.absolute_delta === null
                            ? "—"
                            : `${row.absolute_delta >= 0 ? "+" : ""}${row.absolute_delta.toLocaleString("en-US")}`}
                          {row.percent_delta !== null
                            ? ` (${row.percent_delta >= 0 ? "+" : ""}${(row.percent_delta * 100).toFixed(1)}%)`
                            : ""}
                        </td>
                        <td className="num">{row.missing_dates ? `${row.missing_dates} gap signal` : "none"}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <p className="empty">No comparable series for this metric/filter.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="trend-focus-chart">
              <div className="trend-focus-chart__header">
                <h3>Focused series</h3>
                <label>
                  Focus property{" "}
                  <select
                    value={chartProperty ?? ""}
                    onChange={(event) => setFocusProperty(event.target.value || null)}
                  >
                    <option value="">Select…</option>
                    {(trendRows.length
                      ? trendRows.map((r) => r.property_id)
                      : health.map((h) => h.property_id)
                    )
                      .filter((id, idx, arr) => arr.indexOf(id) === idx)
                      .map((id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {chartProperty && chartSeries.length ? (
                <TimeSeriesChart series={chartSeries} />
              ) : (
                <p className="empty">Select a property to focus one series.</p>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section title="Property health matrix" note="Producer property_health component statuses. Click a row to open the dossier.">
        {insightsError || !insights ? (
          <p className="empty">Unavailable until the insight sidecar loads.</p>
        ) : !health.length ? (
          <p className="empty">
            {insights.schema_version === "1.1.0"
              ? "Fail closed: property_health empty."
              : "property_health requires schema 1.1.0."}
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data health-matrix">
              <thead>
                <tr>
                  <th>Property</th>
                  <th>Overall</th>
                  <th>Components</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {health.map((row: PropertyHealth) => (
                  <tr key={row.property_id}>
                    <td>
                      <button type="button" className="linkish" onClick={() => openProperty(row.property_id)}>
                        {row.property_id}
                      </button>
                    </td>
                    <td>
                      <span className={`priority-pill priority-pill--${row.overall}`}>{priorityLabel(row.overall)}</span>
                    </td>
                    <td className="health-components">
                      <HealthCell label="traffic" value={row.traffic} />
                      <HealthCell label="delivery" value={row.delivery} />
                      <HealthCell label="threats" value={row.threats} />
                      <HealthCell label="measurement" value={row.measurement} />
                    </td>
                    <td>{row.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Action queue" note="Deduped producer actions (one per brief). Top 5–8 by priority; expand for the rest.">
        {insightsError || !insights ? (
          <p className="empty">Unavailable until the insight sidecar loads.</p>
        ) : actions.length ? (
          <>
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
                  {visibleActions.map((action) => (
                    <tr key={action.action_id}>
                      <td>
                        <span className={`priority-pill priority-pill--${action.priority}`}>
                          {priorityLabel(action.priority)}
                        </span>
                        <div className="section-note">{action.severity}</div>
                      </td>
                      <td>
                        {action.property_id ? (
                          <button type="button" className="linkish" onClick={() => openProperty(action.property_id!)}>
                            {action.property_id}
                          </button>
                        ) : (
                          action.scope
                        )}
                      </td>
                      <td>{action.action_class}</td>
                      <td>{action.recommended_action}</td>
                      <td>{action.verification_condition}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {actions.length > 8 ? (
              <button
                type="button"
                className="range-button"
                aria-pressed={showAllActions}
                onClick={() => setShowAllActions((v) => !v)}
              >
                {showAllActions ? "Show top actions only" : `Show all actions (${actions.length})`}
              </button>
            ) : null}
          </>
        ) : (
          <p className="empty">No governed actions for this filter.</p>
        )}
      </Section>

      {dossierProperty ? (
        <Section
          title={`Property dossier · ${dossierProperty}`}
          note="Drill-down preserves the active reporting period. Evidence refs stay producer-governed."
        >
          <div className="dossier-grid">
            <div className="estate-panel">
              <h3>Health</h3>
              {dossierHealth ? (
                <div className="health-components">
                  <span className={`priority-pill priority-pill--${dossierHealth.overall}`}>
                    {priorityLabel(dossierHealth.overall)}
                  </span>
                  <HealthCell label="traffic" value={dossierHealth.traffic} />
                  <HealthCell label="delivery" value={dossierHealth.delivery} />
                  <HealthCell label="threats" value={dossierHealth.threats} />
                  <HealthCell label="measurement" value={dossierHealth.measurement} />
                  <p className="section-note">{dossierHealth.notes || "No notes."}</p>
                </div>
              ) : (
                <p className="empty">No property_health row for this site.</p>
              )}
            </div>
            <div className="estate-panel">
              <h3>Briefs</h3>
              {dossierBriefs.length ? (
                <ul className="plain-list">
                  {dossierBriefs.map((b) => (
                    <li key={b.brief_id}>
                      <strong>{priorityLabel(b.priority)}</strong> — {b.headline}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No briefs for this property.</p>
              )}
            </div>
            <div className="estate-panel">
              <h3>Actions & evidence</h3>
              {dossierActions.length ? (
                <ul className="plain-list">
                  {dossierActions.map((a) => (
                    <li key={a.action_id}>
                      {a.recommended_action}
                      <div className="section-note">
                        refs: {a.evidence_refs.join(", ") || "—"} · findings:{" "}
                        {(a.finding_ids?.length ? a.finding_ids : [a.finding_id]).join(", ")}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No actions for this property.</p>
              )}
            </div>
          </div>
          <div className="trend-focus-chart" style={{ marginTop: 12 }}>
            <h3>Series · {trendMetric}</h3>
            {focusedTrendSeries(insights, payload, dossierProperty, trendMetric).length ? (
              <TimeSeriesChart series={focusedTrendSeries(insights, payload, dossierProperty, trendMetric)} />
            ) : (
              <p className="empty">No series for this property/metric in the active window.</p>
            )}
          </div>
        </Section>
      ) : null}

      <Section title="Supporting measurements" note="Source-native Gold metrics. Progressive disclosure — methodology stays secondary.">
        <button
          type="button"
          className="disclosure-toggle"
          aria-expanded={showMeasurements}
          onClick={() => setShowMeasurements((v) => !v)}
        >
          {showMeasurements ? "Hide key measurements" : "Show key measurements"}
        </button>
        {showMeasurements ? <MetricGrid metrics={metrics.slice(0, 8)} onOpen={onOpen} /> : null}
      </Section>
    </>
  );
}

function BriefList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="estate-panel">
      <h3>{title}</h3>
      {items.length ? (
        <ul className="plain-list">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="empty">{empty}</p>
      )}
    </div>
  );
}
