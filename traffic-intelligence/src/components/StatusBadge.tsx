import type { CoverageState, EvidenceState } from "../gold/types";
import { coverageHint, evidenceHint } from "../gold/format";

export function EvidenceBadge({ state }: { state: EvidenceState }) {
  return (
    <span className={`badge badge-${state}`} title={evidenceHint(state)}>
      {state}
    </span>
  );
}

export function CoverageBadge({ state, always = false }: { state: CoverageState; always?: boolean }) {
  if (state === "COMPLETE" && !always) return null;
  return (
    <span className={`badge badge-coverage badge-${state}`} title={coverageHint(state)}>
      {state}
    </span>
  );
}

export function EvidencePair({
  evidence,
  coverage,
}: {
  evidence: EvidenceState;
  coverage?: CoverageState;
}) {
  return (
    <span className="badge-pair">
      <EvidenceBadge state={evidence} />
      {coverage ? <CoverageBadge state={coverage} /> : null}
    </span>
  );
}

/** @deprecated Prefer EvidencePair. Accepts evidence state. */
export function StatusBadge({ status }: { status: EvidenceState | CoverageState | string }) {
  return (
    <span className={`badge badge-${status}`} title={evidenceHint(status as EvidenceState)}>
      {status}
    </span>
  );
}
