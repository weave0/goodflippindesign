from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from finance_common import INBOUND_ROOT, LOCAL_CONFIG_PATH, LOGS_ROOT, WORKING_ROOT, ensure_local_structure, file_record, format_size, iter_files, utc_timestamp, write_json


def summarize_root(name: str, root: Path) -> dict[str, Any]:
    files = iter_files(root)
    extensions: dict[str, dict[str, int]] = {}
    total_bytes = 0

    for file_path in files:
        record = file_record(file_path)
        total_bytes += int(record["sizeBytes"])
        extension = file_path.suffix.lower() or "<no-extension>"
        bucket = extensions.setdefault(extension, {"count": 0, "sizeBytes": 0})
        bucket["count"] += 1
        bucket["sizeBytes"] += int(record["sizeBytes"])

    recent_files = sorted(files, key=lambda candidate: candidate.stat().st_mtime, reverse=True)[:10]

    return {
        "name": name,
        "path": str(root),
        "exists": root.exists(),
        "fileCount": len(files),
        "totalBytes": total_bytes,
        "extensions": [
            {
                "extension": extension,
                "count": stats["count"],
                "sizeBytes": stats["sizeBytes"],
            }
            for extension, stats in sorted(extensions.items())
        ],
        "recentFiles": [file_record(path) for path in recent_files],
    }


def build_inventory() -> dict[str, Any]:
    roots = [
        summarize_root("inbound", INBOUND_ROOT),
        summarize_root("working", WORKING_ROOT),
    ]

    total_files = sum(int(root["fileCount"]) for root in roots)
    total_bytes = sum(int(root["totalBytes"]) for root in roots)

    return {
        "schemaVersion": 1,
        "generatedAt": utc_timestamp(),
        "localConfigPresent": LOCAL_CONFIG_PATH.exists(),
        "totals": {
            "fileCount": total_files,
            "sizeBytes": total_bytes,
        },
        "roots": roots,
    }


def render_text(payload: dict[str, Any]) -> str:
    lines = [
        "Finance Input Inventory",
        f"Generated: {payload['generatedAt']}",
        f"Local config: {'present' if payload['localConfigPresent'] else 'missing'}",
        f"Total files: {payload['totals']['fileCount']}",
        f"Total size: {format_size(int(payload['totals']['sizeBytes']))}",
        "",
    ]

    for root in payload["roots"]:
        lines.append(f"{root['name']} :: {root['path']}")
        lines.append(f"  Exists: {root['exists']}")
        lines.append(f"  Files: {root['fileCount']}")
        lines.append(f"  Size: {format_size(int(root['totalBytes']))}")
        if root["extensions"]:
            lines.append("  Extensions:")
            for entry in root["extensions"]:
                lines.append(
                    f"    {entry['extension']}: {entry['count']} files, {format_size(int(entry['sizeBytes']))}"
                )
        if root["recentFiles"]:
            lines.append("  Recent files:")
            for file_entry in root["recentFiles"][:5]:
                lines.append(
                    f"    {file_entry['relativePath']} ({format_size(int(file_entry['sizeBytes']))})"
                )
        lines.append("")

    return "\n".join(lines).rstrip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Summarize inbound and working finance files.")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--output", help="Write JSON output to a specific path.")
    parser.add_argument(
        "--no-log",
        action="store_true",
        help="Do not write an inventory snapshot to CASHMONEY/logs.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    ensure_local_structure()

    payload = build_inventory()
    log_path = LOGS_ROOT / f"inventory_{utc_timestamp(compact=True)}.json"

    if not args.no_log:
        write_json(log_path, payload)

    if args.output:
        write_json(Path(args.output), payload)

    if args.format == "json":
        print(json.dumps(payload, indent=2))
    else:
        print(render_text(payload))
        if not args.no_log:
            print(f"\nInventory log written to {log_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
