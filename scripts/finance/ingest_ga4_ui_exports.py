from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path
from typing import Any

from finance_common import INBOUND_ROOT, WORKING_ROOT, ensure_local_structure, expand_paths, resolve_local_path, utc_timestamp, write_json


def normalize_header(value: str) -> str:
    cleaned = value.replace("\ufeff", "").strip().lower()
    cleaned = re.sub(r"[^a-z0-9]+", "_", cleaned)
    return cleaned.strip("_") or "column"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Normalize GA4 CSV exports downloaded from the GA4 UI.")
    parser.add_argument(
        "--input",
        action="append",
        help="File or directory under CASHMONEY to ingest. Defaults to data/inbound/ga4-ui.",
    )
    parser.add_argument("--output", help="Optional output path for the normalized JSON payload.")
    return parser.parse_args()


def collect_inputs(raw_inputs: list[str] | None) -> list[Path]:
    if raw_inputs:
        requested = [resolve_local_path(path_value) for path_value in raw_inputs]
    else:
        requested = [INBOUND_ROOT / "ga4-ui"]
    return [path for path in expand_paths(requested) if path.suffix.lower() == ".csv"]


def ingest_csvs(csv_files: list[Path]) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    file_summaries: list[dict[str, Any]] = []

    for csv_path in csv_files:
        row_count = 0
        with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames is None:
                continue

            header_map = {field: normalize_header(field) for field in reader.fieldnames}
            for row_number, row in enumerate(reader, start=2):
                normalized = {header_map[key]: value for key, value in row.items()}
                normalized["_source_file"] = str(csv_path)
                normalized["_row_number"] = row_number
                records.append(normalized)
                row_count += 1

        file_summaries.append({
            "path": str(csv_path),
            "rowCount": row_count,
        })

    return {
        "schemaVersion": 1,
        "generatedAt": utc_timestamp(),
        "inputFiles": file_summaries,
        "rowCount": len(records),
        "records": records,
    }


def main() -> int:
    args = parse_args()
    ensure_local_structure()
    csv_files = collect_inputs(args.input)
    if not csv_files:
        print("No GA4 UI CSV files were found to ingest.")
        return 1

    payload = ingest_csvs(csv_files)
    output_path = Path(args.output) if args.output else WORKING_ROOT / f"ga4_ui_ingested_{utc_timestamp(compact=True)}.json"
    write_json(output_path, payload)
    print(f"Ingested {payload['rowCount']} rows from {len(csv_files)} files into {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
