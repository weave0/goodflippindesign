import type { MeasurementStatus } from "../gold/types";
import { statusHint } from "../gold/format";

export function StatusBadge({ status }: { status: MeasurementStatus }) {
  return (
    <span className={`badge badge-${status}`} title={statusHint(status)}>
      {status}
    </span>
  );
}
