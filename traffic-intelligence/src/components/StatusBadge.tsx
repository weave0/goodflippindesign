import type { CoverageState, EvidenceState, Exactness } from "../gold/types";
import { coverageHint, evidenceHint, exactnessHint } from "../gold/format";

export function EvidenceBadge({ state }: { state: EvidenceState }) {
  return (
    <span className={`badge badge-${state}`} title={evidenceHint(state)}>
      {state}
    </span>
  );
}

export function ExactnessBadge({ state }: { state: Exactness }) {
  return (
    <span className={`badge badge-${state}`} title={exactnessHint(state)}>
      {state}
    </span>
  );
}

export function CoverageBadge({ state, always = false }: { state: CoverageState; always?: boolean }) {
  if (state === "full_coverage" && !always) return null;
  return (
    <span className={`badge badge-coverage badge-${state}`} title={coverageHint(state)}>
      {state}
    </span>
  );
}

export function EvidencePair({
  evidence,
  exactness,
  coverage,
}: {
  evidence: EvidenceState;
  exactness?: Exactness;
  coverage?: CoverageState;
}) {
  return (
    <span className="badge-pair">
      <EvidenceBadge state={evidence} />
      {exactness ? <ExactnessBadge state={exactness} /> : null}
      {coverage ? <CoverageBadge state={coverage} /> : null}
    </span>
  );
}

export function StatusBadge({ status }: { status: EvidenceState | CoverageState | Exactness | string }) {
  return (
    <span className={`badge badge-${status}`} title={String(status)}>
      {status}
    </span>
  );
}
