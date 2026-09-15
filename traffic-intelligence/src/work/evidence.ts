import type { InsightAction, InsightFinding, OperationalBrief } from "../insights/types";

export type EvidenceDelta = "improved" | "worsened" | "unchanged" | "unknown";

export interface EvidenceSnapshot {
  insights_generated_at: string | null;
  priority_class: string;
  severity: string;
  confidence: string | null;
  percent_delta: number | null;
  absolute_delta_requests: number | null;
  absolute_delta_pageviews: number | null;
  missing_dates_count: number | null;
  finding_ids: string[];
  headline: string | null;
}

export interface EvidenceDiff {
  before: EvidenceSnapshot | null;
  current: EvidenceSnapshot;
  delta: EvidenceDelta;
  rationale: string;
}

/**
 * Build a fail-closed evidence snapshot from current insights (no fabricated zeros).
 */
export function snapshotFromInsights(opts: {
  action: InsightAction;
  brief?: OperationalBrief | null;
  findings?: InsightFinding[];
  insightsGeneratedAt: string | null;
}): EvidenceSnapshot {
  const brief = opts.brief ?? null;
  const findings = opts.findings ?? [];
  const missing = missingDatesCount(findings, brief);
  return {
    insights_generated_at: opts.insightsGeneratedAt,
    priority_class: opts.action.priority_class,
    severity: opts.action.severity,
    confidence: brief?.confidence ?? null,
    percent_delta: brief?.materiality?.percent_delta ?? null,
    absolute_delta_requests: brief?.materiality?.absolute_delta_requests ?? null,
    absolute_delta_pageviews: brief?.materiality?.absolute_delta_pageviews ?? null,
    missing_dates_count: missing,
    finding_ids: opts.action.finding_ids?.length ? opts.action.finding_ids : [opts.action.finding_id],
    headline: brief?.headline ?? findings[0]?.title ?? null,
  };
}

/**
 * Parse a previously rendered Evidence section's "Before" or embedded JSON fence.
 * Fail-closed: returns null when absent/unparseable (never invents zeros).
 */
export function parseBeforeSnapshot(body: string): EvidenceSnapshot | null {
  const fence = /```ti-evidence-before\n([\s\S]*?)\n```/.exec(body);
  if (fence?.[1]) {
    try {
      const parsed = JSON.parse(fence[1]) as EvidenceSnapshot;
      if (parsed && typeof parsed === "object" && typeof parsed.priority_class === "string") {
        return parsed;
      }
    } catch {
      // fall through
    }
  }
  return null;
}

export function diffEvidence(before: EvidenceSnapshot | null, current: EvidenceSnapshot): EvidenceDiff {
  if (!before) {
    return {
      before: null,
      current,
      delta: "unknown",
      rationale: "No prior evidence snapshot — first detection or migration; delta unknown (fail-closed).",
    };
  }

  // Prefer missing_dates_count when both known (measurement gaps).
  if (before.missing_dates_count != null && current.missing_dates_count != null) {
    if (current.missing_dates_count < before.missing_dates_count) {
      return {
        before,
        current,
        delta: "improved",
        rationale: `missing_dates ${before.missing_dates_count} → ${current.missing_dates_count}`,
      };
    }
    if (current.missing_dates_count > before.missing_dates_count) {
      return {
        before,
        current,
        delta: "worsened",
        rationale: `missing_dates ${before.missing_dates_count} → ${current.missing_dates_count}`,
      };
    }
  }

  // Materiality: for negative traffic issues, closer-to-zero percent_delta is improvement.
  if (before.percent_delta != null && current.percent_delta != null) {
    const b = before.percent_delta;
    const c = current.percent_delta;
    // If both negative (drops), higher (less negative) is improved.
    if (b < 0 && c < 0) {
      if (c > b) {
        return { before, current, delta: "improved", rationale: `percent_delta ${b} → ${c}` };
      }
      if (c < b) {
        return { before, current, delta: "worsened", rationale: `percent_delta ${b} → ${c}` };
      }
    }
    // Magnitude comparison when signs align for opportunities/issues.
    if (Math.abs(c) < Math.abs(b) - 1e-9 && Math.sign(c) === Math.sign(b)) {
      return { before, current, delta: "improved", rationale: `|percent_delta| shrunk ${b} → ${c}` };
    }
    if (Math.abs(c) > Math.abs(b) + 1e-9 && Math.sign(c) === Math.sign(b)) {
      return { before, current, delta: "worsened", rationale: `|percent_delta| grew ${b} → ${c}` };
    }
    if (c === b) {
      return { before, current, delta: "unchanged", rationale: `percent_delta unchanged at ${c}` };
    }
  }

  if (before.severity !== current.severity) {
    const rank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    const br = rank[before.severity] ?? 99;
    const cr = rank[current.severity] ?? 99;
    if (cr < br) {
      return { before, current, delta: "worsened", rationale: `severity ${before.severity} → ${current.severity}` };
    }
    if (cr > br) {
      return { before, current, delta: "improved", rationale: `severity ${before.severity} → ${current.severity}` };
    }
  }

  const same =
    before.priority_class === current.priority_class &&
    before.severity === current.severity &&
    before.confidence === current.confidence &&
    before.missing_dates_count === current.missing_dates_count &&
    before.percent_delta === current.percent_delta;

  if (same) {
    return { before, current, delta: "unchanged", rationale: "Key evidence fields unchanged." };
  }

  return {
    before,
    current,
    delta: "unknown",
    rationale: "Evidence fields changed but direction not determinable without fabricating assumptions.",
  };
}

/** Render / refresh the Evidence section (Before / Current / Delta). Preserves first-detection before. */
export function renderEvidenceSection(diff: EvidenceDiff): string {
  const before = diff.before ?? diff.current;
  const lines = [
    `### Evidence (closed-loop)`,
    ``,
    `| | Before (first detection / prior sync) | Current |`,
    `| --- | --- | --- |`,
    `| Insights generated | ${fmt(before.insights_generated_at)} | ${fmt(diff.current.insights_generated_at)} |`,
    `| Priority | ${before.priority_class} | ${diff.current.priority_class} |`,
    `| Severity | ${before.severity} | ${diff.current.severity} |`,
    `| Confidence | ${fmt(before.confidence)} | ${fmt(diff.current.confidence)} |`,
    `| percent_delta | ${fmtNum(before.percent_delta)} | ${fmtNum(diff.current.percent_delta)} |`,
    `| Δ requests | ${fmtNum(before.absolute_delta_requests)} | ${fmtNum(diff.current.absolute_delta_requests)} |`,
    `| Δ pageviews | ${fmtNum(before.absolute_delta_pageviews)} | ${fmtNum(diff.current.absolute_delta_pageviews)} |`,
    `| missing_dates count | ${fmtNum(before.missing_dates_count)} | ${fmtNum(diff.current.missing_dates_count)} |`,
    `| Headline | ${esc(before.headline)} | ${esc(diff.current.headline)} |`,
    ``,
    `**Delta:** \`${diff.delta}\` — ${diff.rationale}`,
    ``,
    `\`\`\`ti-evidence-before`,
    JSON.stringify(diff.before ?? diff.current),
    `\`\`\``,
    `\`\`\`ti-evidence-current`,
    JSON.stringify(diff.current),
    `\`\`\``,
  ];
  return lines.join("\n");
}

/**
 * Replace or append the closed-loop Evidence section in an issue body.
 * Keeps the first-detection before snapshot when already present.
 */
export function upsertEvidenceSection(body: string, current: EvidenceSnapshot): string {
  const priorBefore = parseBeforeSnapshot(body);
  const diff = diffEvidence(priorBefore, current);
  // On first write, lock before = current; on later writes, keep prior before.
  const locked: EvidenceDiff = priorBefore
    ? { ...diff, before: priorBefore }
    : { before: current, current, delta: "unknown", rationale: diff.rationale };
  const section = renderEvidenceSection(locked);

  const startMarker = "### Evidence (closed-loop)";
  const legacyMarker = "### Evidence\n";
  const start = body.indexOf(startMarker);
  if (start >= 0) {
    const afterStart = start + startMarker.length;
    // End at next ### heading or machine block.
    const nextHeading = body.indexOf("\n### ", afterStart);
    const machine = body.indexOf("<!-- ti-work-machine", afterStart);
    let end = body.length;
    if (nextHeading >= 0) end = Math.min(end, nextHeading);
    if (machine >= 0) end = Math.min(end, machine);
    return body.slice(0, start) + section + "\n" + body.slice(end).replace(/^\n+/, "\n");
  }

  // Replace legacy ### Evidence list if present (non closed-loop).
  const legacy = body.indexOf(legacyMarker);
  if (legacy >= 0) {
    const after = legacy + legacyMarker.length;
    const nextHeading = body.indexOf("\n### ", after);
    const machine = body.indexOf("<!-- ti-work-machine", after);
    let end = body.length;
    if (nextHeading >= 0) end = Math.min(end, nextHeading);
    if (machine >= 0) end = Math.min(end, machine);
    return body.slice(0, legacy) + section + "\n" + body.slice(end).replace(/^\n+/, "\n");
  }

  const machine = body.indexOf("<!-- ti-work-machine");
  if (machine >= 0) {
    return `${body.slice(0, machine).trimEnd()}\n\n${section}\n\n${body.slice(machine)}`;
  }
  return `${body.trimEnd()}\n\n${section}\n`;
}

function missingDatesCount(
  findings: InsightFinding[],
  brief: OperationalBrief | null,
): number | null {
  // Prefer explicit comparison absence; parse from explanation only when clearly enumerated.
  void brief;
  for (const f of findings) {
    if (f.kind !== "data_gap") continue;
    const fromLimits = f.limitations?.find((l) => /missing_dates_count=(\d+)/.test(l));
    if (fromLimits) {
      const m = /missing_dates_count=(\d+)/.exec(fromLimits);
      if (m) return Number(m[1]);
    }
    // Count ISO dates in explanation — only if we find at least one; else null (fail-closed).
    const dates = f.explanation?.match(/\b20\d{2}-\d{2}-\d{2}\b/g);
    if (dates?.length) return dates.length;
  }
  return null;
}

function fmt(value: string | null | undefined): string {
  return value == null || value === "" ? "—" : value;
}

function fmtNum(value: number | null | undefined): string {
  return value == null ? "—" : String(value);
}

function esc(value: string | null | undefined): string {
  if (value == null || value === "") return "—";
  return value.replace(/\|/g, "/").slice(0, 120);
}
