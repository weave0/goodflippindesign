from __future__ import annotations

import argparse
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Callable

from finance_common import WORKING_ROOT, ensure_local_structure, load_finance_config, utc_timestamp, write_json

EXPORTERS: dict[str, Callable[..., Any]] = {}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export Stripe objects to JSON for finance analysis or submission packaging.")
    parser.add_argument(
        "--object",
        action="append",
        choices=("payment_intents", "charges", "balance_transactions", "customers", "payouts"),
        help="Stripe object type to export. Repeat to include more than one.",
    )
    parser.add_argument("--api-key-env", help="Environment variable containing the Stripe secret key.")
    parser.add_argument("--since-days", type=int, help="Look back this many days. Defaults to config or 30.")
    parser.add_argument("--since-unix", type=int, help="Unix timestamp lower bound for created-at filtering.")
    parser.add_argument("--limit", type=int, default=250, help="Maximum records per object type.")
    parser.add_argument("--output", help="Optional JSON output path.")
    return parser.parse_args()


def resolve_since_timestamp(args: argparse.Namespace, config: dict[str, Any]) -> int:
    if args.since_unix:
        return int(args.since_unix)

    lookback_days = args.since_days
    if lookback_days is None:
        lookback_days = int(config.get("stripe", {}).get("defaultLookbackDays") or 30)

    return int((datetime.now(timezone.utc) - timedelta(days=lookback_days)).timestamp())


def get_exporters(stripe_module: Any) -> dict[str, Callable[..., Any]]:
    return {
        "payment_intents": stripe_module.PaymentIntent.list,
        "charges": stripe_module.Charge.list,
        "balance_transactions": stripe_module.BalanceTransaction.list,
        "customers": stripe_module.Customer.list,
        "payouts": stripe_module.Payout.list,
    }


def export_object(fetcher: Callable[..., Any], *, created_gte: int, limit: int) -> list[dict[str, Any]]:
    page = fetcher(limit=min(limit, 100), created={"gte": created_gte})
    items: list[dict[str, Any]] = []
    for item in page.auto_paging_iter():
        items.append(item.to_dict_recursive())
        if len(items) >= limit:
            break
    return items


def main() -> int:
    args = parse_args()
    ensure_local_structure()
    config = load_finance_config()

    try:
        import stripe
    except ImportError as exc:
        raise RuntimeError(
            "stripe is not installed. Install scripts/finance/requirements.txt into your finance venv."
        ) from exc

    api_key_env = args.api_key_env or config.get("stripe", {}).get("apiKeyEnvVar") or "STRIPE_SECRET_KEY"
    api_key = os.getenv(api_key_env)
    if not api_key:
        print(f"Stripe API key env var is missing: {api_key_env}")
        return 1

    stripe.api_key = api_key
    object_names = args.object or config.get("stripe", {}).get("defaultObjects") or ["payment_intents"]
    created_gte = resolve_since_timestamp(args, config)
    exporters = get_exporters(stripe)

    exported: dict[str, Any] = {}
    for object_name in object_names:
        exported[object_name] = export_object(exporters[object_name], created_gte=created_gte, limit=args.limit)

    payload = {
        "schemaVersion": 1,
        "generatedAt": utc_timestamp(),
        "apiKeyEnvVar": api_key_env,
        "createdGte": created_gte,
        "objects": exported,
    }

    output_path = Path(args.output) if args.output else WORKING_ROOT / f"stripe_export_{utc_timestamp(compact=True)}.json"
    write_json(output_path, payload)
    total_records = sum(len(entries) for entries in exported.values())
    print(f"Exported {total_records} Stripe records across {len(exported)} object types to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
