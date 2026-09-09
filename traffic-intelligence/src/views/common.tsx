import type { ReactNode } from "react";
import type { ContentRow, RankedItem } from "../gold/types";
import { EvidencePair } from "../components/StatusBadge";

export function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className="section">
      <h2>{title}</h2>
      {note ? <p className="section-note">{note}</p> : null}
      {children}
    </section>
  );
}

export function RankedTable({
  rows,
  valueHeader = "Value",
}: {
  rows: RankedItem[];
  valueHeader?: string;
}) {
  if (!rows.length) return <p className="empty">No rows for these filters.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Item</th>
            <th>{valueHeader}</th>
            <th>Source</th>
            <th>Grain</th>
            <th>Evidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                {row.label}
                {row.extra ? <div className="section-note">{row.extra}</div> : null}
                {row.sourceNativeClass || row.normalizedClass ? (
                  <div className="section-note">
                    native {row.sourceNativeClass ?? "—"} · normalized {row.normalizedClass ?? "—"}
                  </div>
                ) : null}
              </td>
              <td className="num">{row.display ?? (row.value === null ? "—" : row.value.toLocaleString("en-US"))}</td>
              <td>{row.source}</td>
              <td>{row.grain}</td>
              <td>
                <EvidencePair evidence={row.evidence_state ?? row.evidenceState} exactness={row.exactness} coverage={row.coverage} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ContentTable({ rows }: { rows: ContentRow[] }) {
  if (!rows.length) return <p className="empty">No content rows for these filters.</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Path</th>
            <th>Site</th>
            <th>Human evidence</th>
            <th>AI</th>
            <th>Search crawler</th>
            <th>Pipeline ratios</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.siteId}:${row.path}`}>
              <td className="mono">{row.path}</td>
              <td>{row.siteId}</td>
              <td className="num">{cell(row.human)}</td>
              <td className="num">{cell(row.ai)}</td>
              <td className="num">{cell(row.searchCrawler ?? row.errors ?? row.notFound ?? row.bandwidth ?? row.engagement)}</td>
              <td>
                {row.aiToHuman?.display ?? row.humanToMachine?.display ?? row.aiToHumanDisplay ?? row.humanToMachineDisplay ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cell(item?: RankedItem) {
  if (!item) return "—";
  return `${item.display ?? (item.value === null ? "—" : item.value.toLocaleString("en-US"))} (${item.evidence_state ?? item.evidenceState})`;
}

export function AnomalyList({
  items,
}: {
  items: {
    id: string;
    ts: string;
    title: string;
    detail: string;
    kind: string;
    severity: string;
    action?: string;
    sources: string[];
    evidence_state?: string;
    evidenceState?: string;
    status?: string;
  }[];
}) {
  if (!items.length) return <p className="empty">No anomalies in this window.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {items.map((item) => (
        <div key={item.id} className={`callout ${item.severity === "action" ? "action" : item.severity === "info" ? "ok" : ""}`}>
          <div className="row-between">
            <strong>
              {item.ts} · {item.title}
            </strong>
            <span className="kicker">
              {item.kind} · {item.evidence_state ?? item.evidenceState ?? item.status}
            </span>
          </div>
          <div>{item.detail}</div>
          <div className="section-note">Sources: {item.sources.join(", ")}</div>
          {item.action ? <div>{item.action}</div> : null}
        </div>
      ))}
    </div>
  );
}
