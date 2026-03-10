from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

from finance_common import WORKING_ROOT, ensure_local_structure, load_finance_config, utc_timestamp, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Discover GA4 accounts and properties available to a service account.")
    parser.add_argument("--credentials", help="Path to the Google service-account JSON file.")
    parser.add_argument("--json", action="store_true", help="Emit JSON to stdout.")
    parser.add_argument("--output", help="Optional JSON output path.")
    return parser.parse_args()


def resolve_credentials(cli_value: str | None, config: dict[str, Any]) -> str | None:
    if cli_value:
        return cli_value

    config_path = config.get("ga4", {}).get("credentialsPath")
    if config_path:
        return str(config_path)

    return os.getenv("GOOGLE_APPLICATION_CREDENTIALS")


def fetch_summaries(credentials_path: str) -> list[dict[str, Any]]:
    try:
        from google.analytics.admin_v1beta import AnalyticsAdminServiceClient
    except ImportError as exc:
        raise RuntimeError(
            "google-analytics-admin is not installed. Install scripts/finance/requirements.txt into your finance venv."
        ) from exc

    client = AnalyticsAdminServiceClient.from_service_account_json(credentials_path)
    summaries: list[dict[str, Any]] = []

    for account_summary in client.list_account_summaries():
        properties: list[dict[str, Any]] = []
        for property_summary in account_summary.property_summaries:
            property_type = getattr(property_summary.property_type, "name", str(property_summary.property_type))
            properties.append(
                {
                    "propertyId": property_summary.property.split("/")[-1],
                    "displayName": property_summary.display_name,
                    "propertyType": property_type,
                }
            )

        summaries.append(
            {
                "accountId": account_summary.account.split("/")[-1],
                "displayName": account_summary.display_name,
                "properties": properties,
            }
        )

    return summaries


def render_text(payload: dict[str, Any]) -> str:
    lines = [
        "GA4 Property Discovery",
        f"Generated: {payload['generatedAt']}",
        f"Accounts: {len(payload['accounts'])}",
        "",
    ]

    for account in payload["accounts"]:
        lines.append(f"{account['displayName']} ({account['accountId']})")
        if not account["properties"]:
            lines.append("  No properties found")
            continue
        for property_entry in account["properties"]:
            lines.append(
                f"  - {property_entry['displayName']} ({property_entry['propertyId']}) [{property_entry['propertyType']}]"
            )
        lines.append("")

    return "\n".join(lines).rstrip()


def main() -> int:
    args = parse_args()
    ensure_local_structure()
    config = load_finance_config()
    credentials_path = resolve_credentials(args.credentials, config)
    if not credentials_path:
        print("No GA4 credentials path provided. Use --credentials, local finance-config.json, or GOOGLE_APPLICATION_CREDENTIALS.")
        return 1

    payload = {
        "schemaVersion": 1,
        "generatedAt": utc_timestamp(),
        "credentialsPath": credentials_path,
        "accounts": fetch_summaries(credentials_path),
    }

    output_path = Path(args.output) if args.output else WORKING_ROOT / f"ga4_properties_{utc_timestamp(compact=True)}.json"
    if args.output:
        write_json(output_path, payload)
    elif not args.json:
        write_json(output_path, payload)

    if args.json:
        print(json.dumps(payload, indent=2))
    else:
        print(render_text(payload))
        print(f"\nSaved JSON snapshot to {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
