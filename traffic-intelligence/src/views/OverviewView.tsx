import { useEffect, useMemo, useState } from "react";
import type { Gold12Topology, Metric, WindowPayload } from "../gold/types";
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
  ESTATE_CONFIG_STATE_LABEL,
  estateBriefOf,
  estateConfigOf,
  estateConfigRow,
  estateProvenanceLines,
  estateStatusLabel,
  focusedTrendSeries,
  priorityLabel,
  prioritizedActions,
  propertyHealthRows,
  rankedBriefs,
  rankedTrendChanges,
} from "../insights/select";
import {
  countHiddenOperatorProperties,
  filterOperatorPropertyIds,
  isOperatorProperty,
} from "../insights/operator-properties";
import type { WorkQueueDocument } from "../work/types";
import { WorkActionControls, workItemFor } from "../work/WorkActionControls";
import { eligibilityFor } from "../work/eligibility";
import { rankNextWork } from "../work/ranking";
import { Section } from "./common";

function statusTone(status: string): "ok" | "watch" | "action" | "blocked" {
  if (
    status === "measurement_blocked" ||
    status === "insufficient_evidence" ||
    status === "blocked"
  ) {
    return "blocked";
  }
  if (status === "stable" || status === "healthy" || status === "rising" || status === "normal" || status === "complete") {
    return "ok";
  }
  if (status === "degraded" || status === "act_now" || status === "declining" || status === "elevated") {
    return "action";
  }
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
  workQueue = null,
  topology = null,
  onOpen,
  onSelectProperty,
}: {
  payload: WindowPayload;
  filters: Filters;
  insights: TrafficInsightDocument | null;
  insightsError: string | null;
  workQueue?: WorkQueueDocument | null;
  topology?: Gold12Topology | null;
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
  const estateConfig = useMemo(() => estateConfigOf(insights), [insights]);
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
  const recommendActions = useMemo(() => {
    if (!insights) return [];
    return actions.filter((action) => {
      const brief =
        (action.brief_id ? insights.briefs.find((b) => b.brief_id === action.brief_id) : null) ??
        insights.briefs.find((b) =>
          b.finding_ids.some((id) => (action.finding_ids ?? []).includes(id) || id === action.finding_id),
        ) ??
        null;
      const findings = (action.finding_ids?.length ? action.finding_ids : [action.finding_id])
        .map((id) => insights.findings.find((f) => f.finding_id === id))
        .filter((f): f is NonNullable<typeof f> => Boolean(f));
      const item = workItemFor(workQueue, action.action_id);
      const eligibility =
        item?.eligibility ??
        eligibilityFor({ action, brief, finding: findings[0] ?? null, findings });
      return eligibility === "recommend";
    });
  }, [actions, insights, workQueue]);
  const operatorCtx = useMemo(
    () => ({
      insights,
      sites: payload.sites,
      topology,
    }),
    [insights, payload.sites, topology],
  );
  const allHealth = useMemo(() => propertyHealthRows(insights, siteDomain), [insights, siteDomain]);
  const health = useMemo(
    () => allHealth.filter((row) => isOperatorProperty(row.property_id, operatorCtx)),
    [allHealth, operatorCtx],
  );
  const hiddenHealthCount = useMemo(
    () =>
      countHiddenOperatorProperties(
        allHealth.map((row) => row.property_id),
        operatorCtx,
      ),
    [allHealth, operatorCtx],
  );
  const trendRows = useMemo(
    () => rankedTrendChanges(insights, payload, trendMetric, siteDomain, 8),
    [insights, payload, trendMetric, siteDomain],
  );

  const focusCandidates = useMemo(() => {
    const ids = [
      ...trendRows.map((r) => r.property_id),
      ...health.map((h) => h.property_id),
    ];
    const unique = ids.filter((id, idx, arr) => arr.indexOf(id) === idx);
    return filterOperatorPropertyIds(unique, operatorCtx);
  }, [trendRows, health, operatorCtx]);

  useEffect(() => {
    if (focusProperty && siteDomain && focusProperty !== siteDomain) {
      setFocusProperty(null);
      return;
    }
    if (focusProperty && focusCandidates.length && !focusCandidates.includes(focusProperty)) {
      setFocusProperty(null);
    }
  }, [focusProperty, siteDomain, focusCandidates]);

  const chartProperty =
    (focusProperty && (!focusCandidates.length || focusCandidates.includes(focusProperty))
      ? focusProperty
      : null) ||
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
  const dossierEstateConfig = useMemo(
    () => (dossierProperty ? estateConfigRow(insights, dossierProperty) : null),
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
  const dossierConfigFindings = useMemo(
    () =>
      dossierProperty && insights
        ? insights.findings.filter(
            (finding) =>
              finding.property_id === dossierProperty &&
              finding.finding_id.includes(".estate-config."),
          )
        : [],
    [insights, dossierProperty],
  );
  const dossierPathFailures = useMemo(
    () =>
      dossierProperty && insights
        ? insights.findings.filter(
            (finding) =>
              finding.property_id === dossierProperty &&
              finding.finding_id.includes(".path-health."),
          )
        : [],
    [insights, dossierProperty],
  );

  const nextWork = useMemo(
    () => (workQueue?.items ? rankNextWork(workQueue.items).slice(0, 8) : []),
    [workQueue],
  );
  const funnelMetrics = workQueue?.metrics ?? null;

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

      {funnelMetrics ? (
        <Section title="Work funnel metrics" note="Additive schema 1.1.0 metrics from last sync — counts only, no invented success.">
          <div className="estate-brief-grid" role="group" aria-label="Work funnel metrics">
            <div className="estate-panel">
              <h3>Queue</h3>
              <p className="section-note">
                planned {funnelMetrics.planned} · auto {funnelMetrics.auto} · recommend {funnelMetrics.recommend} · open
                issues {funnelMetrics.open_issues}
              </p>
            </div>
            <div className="estate-panel">
              <h3>Last sync</h3>
              <p className="section-note">
                creates {funnelMetrics.creates_last_sync} · updates {funnelMetrics.updates_last_sync} · closes{" "}
                {funnelMetrics.closes_last_sync} · consolidated {funnelMetrics.consolidated_groups} · superseded{" "}
                {funnelMetrics.superseded_duplicates}
              </p>
            </div>
            <div className="estate-panel">
              <h3>By impact</h3>
              <p className="section-note">
                {Object.keys(funnelMetrics.by_impact_class).length
                  ? Object.entries(funnelMetrics.by_impact_class)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")
                  : "—"}
              </p>
            </div>
            <div className="estate-panel">
              <h3>By lifecycle</h3>
              <p className="section-note">
                {Object.keys(funnelMetrics.by_lifecycle).length
                  ? Object.entries(funnelMetrics.by_lifecycle)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(" · ")
                  : "—"}
              </p>
            </div>
          </div>
        </Section>
      ) : null}

      <Section
        title="What should we work on next?"
        note="Ranked by governed impact_score (desc). Actionable lifecycles only; consolidated members nest under the primary row."
      >
        {!workQueue ? (
          <p className="empty">Work queue sidecar missing — ranking unavailable (fail soft).</p>
        ) : nextWork.length === 0 ? (
          <p className="empty">No actionable work items in the queue for this estate snapshot.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Impact</th>
                  <th>Title / why</th>
                  <th>Property / group</th>
                  <th>Lifecycle</th>
                  <th>Issue</th>
                </tr>
              </thead>
              <tbody>
                {nextWork.map(({ item, members }) => (
                  <tr key={item.action_id}>
                    <td>
                      <span className="meta-chip">
                        {item.impact_class} · {item.impact_score}
                      </span>
                    </td>
                    <td>
                      <strong>{item.title}</strong>
                      <div className="section-note">{item.impact_rationale}</div>
                      {members.length ? (
                        <div className="section-note">
                          Members: {members.map((m) => m.property_id ?? m.action_id).join(", ")}
                        </div>
                      ) : null}
                    </td>
                    <td>
                      {item.group_role === "primary" && item.root_cause_key ? (
                        <span className="mono">{item.root_cause_key}</span>
                      ) : item.property_id ? (
                        <button type="button" className="linkish" onClick={() => openProperty(item.property_id!)}>
                          {item.property_id}
                        </button>
                      ) : (
                        item.root_cause_key ?? "estate"
                      )}
                    </td>
                    <td>{item.lifecycle}</td>
                    <td>
                      {item.html_url ? (
                        <a className="work-link" href={item.html_url} target="_blank" rel="noreferrer">
                          #{item.issue_number}
                        </a>
                      ) : (
                        <span className="section-note">no issue yet</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

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
        title="Deployment & config authority"
        note="Producer estate_config accounting — every governed zone, and which authority proved which fact. Least privilege is not a defect."
      >
        {insightsError || !insights ? (
          <p className="empty">Unavailable until the insight sidecar loads.</p>
        ) : !estateConfig ? (
          <p className="empty">
            Deployment/config evidence was not supplied to this sidecar: deployment authority is unobserved, not
            healthy.
          </p>
        ) : (
          <div className="estate-config">
            <p className="section-note" data-testid="estate-config-summary">
              {estateConfig.accounted_zone_count} of {estateConfig.governed_zone_count} governed zones accounted for ·{" "}
              {(["healthy", "governance_gap", "config_drift", "unobserved"] as const)
                .map((state) => `${ESTATE_CONFIG_STATE_LABEL[state]} ${estateConfig.state_counts[state] ?? 0}`)
                .join(" · ")}{" "}
              · Pages inventory {estateConfig.pages_inventory.count} projects (complete)
            </p>
            <ul className="plain-list">
              {estateConfig.credential_boundaries.map((note) => (
                <li key={note} className="section-note">
                  {note}
                </li>
              ))}
            </ul>
            <table className="data">
              <thead>
                <tr>
                  <th>Zone</th>
                  <th>State</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {estateConfig.properties.map((row) => (
                  <tr key={row.property_id}>
                    <td>
                      <button type="button" className="chip-button" onClick={() => openProperty(row.property_id)}>
                        {row.property_id}
                      </button>
                    </td>
                    <td>{ESTATE_CONFIG_STATE_LABEL[row.state]}</td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
        note={`${metricOption?.label ?? trendMetric} · Cloudflare edge · producer trend_comparisons only (no browser half-splits). Unavailable windows show coverage reasons, never invented deltas.`}
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
                    <th>Current window</th>
                    <th>Baseline</th>
                    <th>Δ</th>
                    <th>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {trendRows.length ? (
                    trendRows.map((row) => (
                      <tr key={`${row.property_id}:${row.metric_name}:${row.period_days}`}>
                        <td>
                          <button type="button" className="linkish" onClick={() => openProperty(row.property_id)}>
                            {row.property_id}
                          </button>
                          <div className="section-note">
                            {row.label} · {row.unit} · {row.source}
                          </div>
                        </td>
                        <td className="num">
                          {row.available && row.current_value !== null
                            ? row.current_value.toLocaleString("en-US")
                            : "—"}
                        </td>
                        <td className="num">
                          {row.available && row.prior_value !== null
                            ? row.prior_value.toLocaleString("en-US")
                            : "—"}
                        </td>
                        <td className="num">
                          {!row.available
                            ? "unavailable"
                            : row.absolute_delta === null
                              ? "—"
                              : `${row.absolute_delta >= 0 ? "+" : ""}${row.absolute_delta.toLocaleString("en-US")}`}
                          {row.available && row.percent_delta !== null
                            ? ` (${row.percent_delta >= 0 ? "+" : ""}${(row.percent_delta * 100).toFixed(1)}%)`
                            : ""}
                          {!row.available && row.unavailable_reason ? (
                            <div className="section-note">{row.unavailable_reason}</div>
                          ) : null}
                        </td>
                        <td className="num">
                          {row.available
                            ? row.missing_dates.length
                              ? `${row.missing_dates.length} missing`
                              : row.coverage_state
                            : row.coverage_state || "insufficient coverage"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5}>
                        <p className="empty">No producer trend_comparisons for this metric/period/filter.</p>
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
                    {focusCandidates.map((id) => (
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
            {hiddenHealthCount > 0 ? (
              <p className="section-note" role="status">
                {hiddenHealthCount} topology-only row{hiddenHealthCount === 1 ? "" : "s"} hidden; see Sites &amp; content.
              </p>
            ) : null}
          </div>
        )}
      </Section>

      <Section
        title="Action queue"
        note="Deduped producer actions with GitHub work links (central queue: weave0/goodflippindesign). Top 5–8 by priority; expand for the rest."
      >
        {insightsError || !insights ? (
          <p className="empty">Unavailable until the insight sidecar loads.</p>
        ) : actions.length ? (
          <>
            {!workQueue ? (
              <p className="section-note" role="status">
                Work queue sidecar missing — showing actions without issue links (fail soft).
              </p>
            ) : workQueue.fixture ? (
              <p className="section-note" role="status">
                Work queue is fixture data — issue links appear after deploy-time sync.
              </p>
            ) : null}
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Priority</th>
                    <th>Property</th>
                    <th>Class</th>
                    <th>Action</th>
                    <th>Work</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleActions.map((action) => {
                    const brief =
                      (action.brief_id ? insights.briefs.find((b) => b.brief_id === action.brief_id) : null) ??
                      insights.briefs.find((b) =>
                        b.finding_ids.some(
                          (id) => (action.finding_ids ?? []).includes(id) || id === action.finding_id,
                        ),
                      ) ??
                      null;
                    const findings = (action.finding_ids?.length ? action.finding_ids : [action.finding_id])
                      .map((id) => insights.findings.find((f) => f.finding_id === id))
                      .filter((f): f is NonNullable<typeof f> => Boolean(f));
                    const item = workItemFor(workQueue, action.action_id);
                    return (
                      <tr key={action.action_id}>
                        <td>
                          <span className={`priority-pill priority-pill--${action.priority_class}`}>
                            {priorityLabel(action.priority_class)}
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
                        <td>
                          {action.recommended_action}
                          <div className="section-note">Verify: {action.verification_condition}</div>
                        </td>
                        <td>
                          <WorkActionControls
                            action={action}
                            brief={brief}
                            findings={findings}
                            insights={insights}
                            workItem={item}
                            onViewEvidence={(propertyId) => {
                              if (propertyId) openProperty(propertyId);
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })}
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

      <Section
        title="Recommendations"
        note="Weaker findings stay recommendations until promoted into the GitHub work queue."
      >
        {insightsError || !insights ? (
          <p className="empty">Unavailable until the insight sidecar loads.</p>
        ) : recommendActions.length ? (
          <ul className="plain-list recommend-list">
            {recommendActions.map((action) => {
              const brief =
                (action.brief_id ? insights.briefs.find((b) => b.brief_id === action.brief_id) : null) ??
                null;
              const findings = (action.finding_ids?.length ? action.finding_ids : [action.finding_id])
                .map((id) => insights.findings.find((f) => f.finding_id === id))
                .filter((f): f is NonNullable<typeof f> => Boolean(f));
              const item = workItemFor(workQueue, action.action_id);
              return (
                <li key={`rec-${action.action_id}`}>
                  <strong>{priorityLabel(action.priority_class)}</strong>
                  {action.property_id ? ` · ${action.property_id}` : ""} — {action.recommended_action}
                  <WorkActionControls
                    action={action}
                    brief={brief}
                    findings={findings}
                    insights={insights}
                    workItem={item}
                    onViewEvidence={(propertyId) => {
                      if (propertyId) openProperty(propertyId);
                    }}
                  />
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">No recommendation-only actions for this filter.</p>
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
              <h3>Deployment &amp; config</h3>
              {dossierEstateConfig ? (
                <div data-testid="dossier-estate-config">
                  <p>
                    <strong>{ESTATE_CONFIG_STATE_LABEL[dossierEstateConfig.state]}</strong> — {dossierEstateConfig.reason}
                  </p>
                  <ul className="plain-list">
                    {estateProvenanceLines(dossierEstateConfig).map((line) => (
                      <li key={line} className="section-note">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : insights && !estateConfig ? (
                <p className="empty">Deployment/config evidence was not supplied: unobserved, not healthy.</p>
              ) : null}
              {dossierConfigFindings.length ? (
                <ul className="plain-list">
                  {dossierConfigFindings.map((finding) => (
                    <li key={finding.finding_id}>
                      <strong>{finding.title}</strong>
                      <div>{finding.explanation}</div>
                      <div className="section-note">
                        {finding.kind} · {finding.action_class} · {finding.coverage_state}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : dossierEstateConfig?.state === "healthy" ? (
                <p className="empty">Healthy: no deployment/config drift or governance gap.</p>
              ) : null}
            </div>
            <div className="estate-panel">
              <h3>HTTP failures</h3>
              {dossierPathFailures.length ? (
                <ul className="plain-list">
                  {dossierPathFailures.map((finding) => (
                    <li key={finding.finding_id}>
                      <strong>{finding.title}</strong>
                      <div>{finding.explanation}</div>
                      <div className="section-note">
                        {finding.coverage_state} · {finding.source_id}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="empty">No material path/status failure cluster detected.</p>
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
