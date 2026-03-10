from __future__ import annotations

import argparse
import csv
import json
import os
from pathlib import Path
from typing import Any

from finance_common import WORKING_ROOT, ensure_local_structure, load_finance_config, utc_timestamp, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a GA4 report via the Analytics Data API.")
    parser.add_argument("--credentials", help="Path to the Google service-account JSON file.")
    parser.add_argument("--property-id", help="GA4 property ID, without the 'properties/' prefix.")
    parser.add_argument("--start-date", help="GA4 start date, such as 30daysAgo or 2026-01-01.")
    parser.add_argument("--end-date", help="GA4 end date, such as yesterday or 2026-01-31.")
    parser.add_argument("--dimension", action="append", help="Dimension name. Repeat for more than one.")
    parser.add_argument("--metric", action="append", help="Metric name. Repeat for more than one.")
    parser.add_argument("--limit", type=int, help="Maximum rows to request.")
    parser.add_argument("--format", choices=("json", "csv"), default="json")
    parser.add_argument("--output", help="Optional output path.")
    return parser.parse_args()


def resolve_credentials(cli_value: str | None, config: dict[str, Any]) -> str | None:
    if cli_value:
        return cli_value

    config_path = config.get("ga4", {}).get("credentialsPath")
    if config_path:
        return str(config_path)

    return os.getenv("GOOGLE_APPLICATION_CREDENTIALS")


def export_report(credentials_path: str, property_id: str, start_date: str, end_date: str, dimensions: list[str], metrics: list[str], limit: int | None) -> list[dict[str, str]]:
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import DateRange, Dimension, Metric, RunReportRequest
    except ImportError as exc:
        raise RuntimeError(
            "google-analytics-data is not installed. Install scripts/finance/requirements.txt into your finance venv."
        ) from exc

    client = BetaAnalyticsDataClient.from_service_account_json(credentials_path)
    request_kwargs: dict[str, Any] = {
        "property": f"properties/{property_id}",
        "dimensions": [Dimension(name=name) for name in dimensions],
        "metrics": [Metric(name=name) for name in metrics],
        "date_ranges": [DateRange(start_date=start_date, end_date=end_date)],
    }
    if limit:
        request_kwargs["limit"] = limit

    response = client.run_report(RunReportRequest(**request_kwargs))
    rows: list[dict[str, str]] = []

    for row in response.rows:
        record = {
            dimension_name: dimension_value.value
            for dimension_name, dimension_value in zip(dimensions, row.dimension_values)
        }
        record.update(
            {
                metric_name: metric_value.value
                for metric_name, metric_value in zip(metrics, row.metric_values)
            }
        )
        rows.append(record)

    return rows


def write_csv(output_path: Path, rows: list[dict[str, str]], fieldnames: list[str]) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main() -> int:
    args = parse_args()
    ensure_local_structure()
    config = load_finance_config()
    credentials_path = resolve_credentials(args.credentials, config)
    property_id = args.property_id or config.get("ga4", {}).get("propertyId")
    default_range = config.get("ga4", {}).get("defaultDateRange", {})
    default_report = config.get("ga4", {}).get("defaultReport", {})
    start_date = args.start_date or default_range.get("startDate") or "30daysAgo"
    end_date = args.end_date or default_range.get("endDate") or "yesterday"
    dimensions = args.dimension or default_report.get("dimensions") or ["date"]
    metrics = args.metric or default_report.get("metrics") or ["sessions"]

    if not credentials_path:
        print("No GA4 credentials path provided. Use --credentials, local finance-config.json, or GOOGLE_APPLICATION_CREDENTIALS.")
        return 1

    if not property_id:
        print("No GA4 property ID provided. Use --property-id or set ga4.propertyId in CASHMONEY/finance-config.json.")
        return 1

    rows = export_report(credentials_path, str(property_id), start_date, end_date, list(dimensions), list(metrics), args.limit)
    timestamp = utc_timestamp(compact=True)
    suffix = "json" if args.format == "json" else "csv"
    output_path = Path(args.output) if args.output else WORKING_ROOT / f"ga4_report_{property_id}_{timestamp}.{suffix}"

    if args.format == "json":
        payload = {
            "schemaVersion": 1,
            "generatedAt": utc_timestamp(),
            "propertyId": str(property_id),
            "dateRange": {
                "startDate": start_date,
                "endDate": end_date,
            },
            "dimensions": list(dimensions),
            "metrics": list(metrics),
            "rowCount": len(rows),
            "rows": rows,
        }
        write_json(output_path, payload)
    else:
        fieldnames = list(dimensions) + list(metrics)
        write_csv(output_path, rows, fieldnames)

    print(f"Exported {len(rows)} GA4 rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
