import type { Metric, WindowPayload } from "../gold/types";
import type { Filters } from "../gold/url-state";
import { filterActors, filterMetrics, filterRanked } from "../gold/select";
import { MetricGrid } from "../components/MetricCard";
import { HeatmapChart, RankedBars, TimeSeriesChart } from "../components/Charts";
import { RankedTable, Section } from "./common";
import { EvidencePair } from "../components/StatusBadge";

export function AIView({
  payload,
  filters,
  onOpen,
}: {
  payload: WindowPayload;
  filters: Filters;
  onOpen: (metric: Metric) => void;
}) {
  const actors = filterActors(payload.ai.actors, filters);
  const selected = filters.actor === "all" ? null : actors[0];

  return (
    <>
      <Section title="AI classes" note="Source-native Cloudflare classes (AI Crawler, AI Search, AI Assistant) are preserved. They are not collapsed into one AI bucket. UNKNOWN remains visible in taxonomy.">
        <RankedBars rows={filterRanked(payload.ai.classTotals, filters)} tone="ai" />
      </Section>
      <Section title="Named actors">
        <div className="chip-row">
          {payload.ai.actors.map((actor) => (
            <span key={actor.id} className="chip">
              {actor.name} · {actor.sourceNativeClass} / {actor.normalizedClass} ·{" "}
              <EvidencePair evidence={actor.evidence_state ?? actor.evidenceState} exactness={actor.exactness} coverage={actor.coverage} />
            </span>
          ))}
        </div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="data">
            <thead>
              <tr>
                <th>Actor</th>
                <th>Native class</th>
                <th>Normalized</th>
                <th>Requests</th>
                <th>Evidence</th>
              </tr>
            </thead>
            <tbody>
              {actors.map((actor) => {
                const requests = actor.metrics[0];
                return (
                  <tr key={actor.id}>
                    <td>
                      <strong>{actor.name}</strong>
                    </td>
                    <td>{actor.sourceNativeClass}</td>
                    <td>{actor.normalizedClass}</td>
                    <td className="num">
                      {requests ? (
                        <button type="button" className="icon-btn" onClick={() => onOpen(requests)}>
                          {requests.display ?? requests.value?.toLocaleString("en-US") ?? "—"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <EvidencePair evidence={actor.evidence_state ?? actor.evidenceState} exactness={actor.exactness} coverage={actor.coverage} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Section>
      {selected ? (
        <Section title={`Dossier · ${selected.name}`}>
          <MetricGrid metrics={filterMetrics(selected.metrics, filters)} onOpen={onOpen} />
          <div className="split">
            <div>
              <h3 className="kicker">Target sites</h3>
              <RankedBars rows={selected.targetSites} tone="ai" />
            </div>
            <div>
              <h3 className="kicker">Target pages</h3>
              <RankedTable rows={selected.targetPages} />
            </div>
          </div>
          {selected.robotsActivity ? (
            <MetricGrid metrics={selected.robotsActivity} onOpen={onOpen} />
          ) : null}
          {selected.crawlDepth ? (
            <>
              <h3 className="kicker">Crawl depth</h3>
              <RankedBars rows={selected.crawlDepth} />
            </>
          ) : null}
          {selected.responseMix ? (
            <>
              <h3 className="kicker">Success / error mix</h3>
              <RankedBars rows={selected.responseMix} />
            </>
          ) : null}
        </Section>
      ) : null}
      <div className="split">
        <Section title="Target sites">
          <RankedBars rows={filterRanked(payload.ai.targetSites, filters)} tone="ai" />
        </Section>
        <Section title="Target pages">
          <RankedTable rows={filterRanked(payload.ai.targetPages, filters)} />
        </Section>
      </div>
      <Section title="robots / sitemap">
        <MetricGrid metrics={filterMetrics(payload.ai.robots, filters)} onOpen={onOpen} />
      </Section>
      <Section title="Temporal activity">
        <TimeSeriesChart series={payload.ai.temporal} />
      </Section>
      {payload.ai.heatmap ? (
        <Section title="Weekday × hour">
          <HeatmapChart heatmap={payload.ai.heatmap} />
        </Section>
      ) : null}
      <Section title="Response mix">
        <RankedBars rows={filterRanked(payload.ai.responseMix, filters)} />
      </Section>
    </>
  );
}
