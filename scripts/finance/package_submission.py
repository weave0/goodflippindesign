from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Any

from finance_common import INBOUND_ROOT, LOCAL_CONFIG_PATH, LOCAL_ROOT, SUBMISSIONS_ROOT, WORKING_ROOT, ensure_local_structure, expand_paths, file_record, format_size, iter_files, load_finance_config, resolve_local_path, slugify, to_posix, utc_timestamp, write_json

ROOT_OPTIONS = {
    "inbound": INBOUND_ROOT,
    "working": WORKING_ROOT,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Package local finance files into a submission bundle.")
    parser.add_argument("--label", help="Bundle label used in the output folder name.")
    parser.add_argument(
        "--source-root",
        choices=("inbound", "working"),
        action="append",
        help="Root to include when no explicit include paths are provided. Defaults to both.",
    )
    parser.add_argument(
        "--include-path",
        action="append",
        help="Specific local file or directory under CASHMONEY to include.",
    )
    parser.add_argument("--notes", help="Short note to capture in the bundle manifest.")
    parser.add_argument("--notes-file", help="Path to a markdown or text note file to embed in the bundle.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be packaged without writing files.")
    return parser.parse_args()


def collect_files(args: argparse.Namespace) -> list[Path]:
    if args.include_path:
        selected_paths = [resolve_local_path(path_value) for path_value in args.include_path]
        missing = [path for path in selected_paths if not path.exists()]
        if missing:
            missing_display = ", ".join(str(path) for path in missing)
            raise FileNotFoundError(f"Included paths not found: {missing_display}")
        return expand_paths(selected_paths)

    selected_roots = args.source_root or ["inbound", "working"]
    collected: list[Path] = []
    seen: set[Path] = set()
    for root_name in selected_roots:
        root = ROOT_OPTIONS[root_name]
        for file_path in iter_files(root):
            if file_path not in seen:
                collected.append(file_path)
                seen.add(file_path)
    return sorted(collected)


def next_bundle_root(base_label: str) -> Path:
    timestamp = utc_timestamp(compact=True)
    stem = f"{timestamp}_{slugify(base_label)}"
    candidate = SUBMISSIONS_ROOT / stem
    counter = 1
    while candidate.exists():
        candidate = SUBMISSIONS_ROOT / f"{stem}_{counter:02d}"
        counter += 1
    return candidate


def build_manifest(bundle_root: Path, label: str, files: list[Path], notes: str, source_roots: list[str]) -> dict[str, Any]:
    records = [file_record(path) for path in files]
    total_bytes = sum(int(record["sizeBytes"]) for record in records)
    return {
        "schemaVersion": 1,
        "generatedAt": utc_timestamp(),
        "label": label,
        "bundleRoot": str(bundle_root),
        "localConfigPath": str(LOCAL_CONFIG_PATH),
        "sourceRoots": source_roots,
        "notes": notes,
        "fileCount": len(records),
        "totalBytes": total_bytes,
        "files": records,
    }


def render_readme(manifest: dict[str, Any]) -> str:
    lines = [
        f"Submission Label: {manifest['label']}",
        f"Generated At: {manifest['generatedAt']}",
        f"Bundle Root: {manifest['bundleRoot']}",
        f"File Count: {manifest['fileCount']}",
        f"Total Size: {format_size(int(manifest['totalBytes']))}",
        f"Source Roots: {', '.join(manifest['sourceRoots'])}",
        "",
    ]

    if manifest["notes"]:
        lines.extend([
            "Notes:",
            manifest["notes"].strip(),
            "",
        ])

    lines.append("Files:")
    for entry in manifest["files"]:
        lines.append(f"- {entry['relativePath']} ({format_size(int(entry['sizeBytes']))})")

    return "\n".join(lines) + "\n"


def main() -> int:
    args = parse_args()
    ensure_local_structure()
    config = load_finance_config()

    default_label = (
        config.get("organization", {}).get("submissionPrefix")
        or config.get("submission", {}).get("defaultLabel")
        or "finance-submission"
    )
    label = args.label or default_label

    notes = ""
    if args.notes_file:
        notes = Path(args.notes_file).read_text(encoding="utf-8").strip()
    elif args.notes:
        notes = args.notes.strip()

    files = collect_files(args)
    if not files:
        print("No files matched the requested selection. Nothing was packaged.")
        return 1

    source_roots = args.source_root or ["inbound", "working"]
    bundle_root = next_bundle_root(label)
    manifest = build_manifest(bundle_root, label, files, notes, source_roots)

    if args.dry_run:
        print(f"Dry run bundle target: {bundle_root}")
        print(f"Files selected: {manifest['fileCount']}")
        print(f"Total size: {format_size(int(manifest['totalBytes']))}")
        for entry in manifest["files"]:
            print(f"- {entry['relativePath']}")
        return 0

    bundle_root.mkdir(parents=True, exist_ok=False)
    for path in files:
        relative_path = path.relative_to(LOCAL_ROOT)
        destination = bundle_root / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, destination)

    manifest_path = bundle_root / "submission-manifest.json"
    readme_path = bundle_root / "README.txt"
    write_json(manifest_path, manifest)
    readme_path.write_text(render_readme(manifest), encoding="utf-8")

    print(f"Created submission bundle: {bundle_root}")
    print(f"Files packaged: {manifest['fileCount']}")
    print(f"Total size: {format_size(int(manifest['totalBytes']))}")
    print(f"Manifest: {manifest_path}")
    print(f"Readme: {readme_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
