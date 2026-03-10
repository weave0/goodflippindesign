from __future__ import annotations

import copy
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

SCRIPT_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_ROOT.parent.parent
LOCAL_ROOT = REPO_ROOT / "CASHMONEY"
DATA_ROOT = LOCAL_ROOT / "data"
INBOUND_ROOT = DATA_ROOT / "inbound"
WORKING_ROOT = DATA_ROOT / "working"
OUT_ROOT = LOCAL_ROOT / "out"
SUBMISSIONS_ROOT = OUT_ROOT / "submissions"
LOGS_ROOT = LOCAL_ROOT / "logs"
TEMPLATES_ROOT = SCRIPT_ROOT / "templates"
LOCAL_CONFIG_PATH = LOCAL_ROOT / "finance-config.json"
CONFIG_TEMPLATE_PATH = TEMPLATES_ROOT / "finance-config.example.json"


def ensure_local_structure() -> None:
    for path in (LOCAL_ROOT, DATA_ROOT, INBOUND_ROOT, WORKING_ROOT, OUT_ROOT, SUBMISSIONS_ROOT, LOGS_ROOT):
        path.mkdir(parents=True, exist_ok=True)


def utc_timestamp(*, compact: bool = False) -> str:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    if compact:
        return now.strftime("%Y%m%dT%H%M%SZ")
    return now.isoformat().replace("+00:00", "Z")


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", value.strip().lower())
    return slug.strip("-") or "submission"


def format_size(num_bytes: int) -> str:
    if num_bytes < 1024:
        return f"{num_bytes} B"

    units = ["KB", "MB", "GB", "TB"]
    size = float(num_bytes)
    for unit in units:
        size /= 1024.0
        if size < 1024.0:
            return f"{size:.2f} {unit}"
    return f"{size:.2f} PB"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def deep_merge(base: Any, override: Any) -> Any:
    if isinstance(base, dict) and isinstance(override, dict):
        merged = copy.deepcopy(base)
        for key, value in override.items():
            if key in merged:
                merged[key] = deep_merge(merged[key], value)
            else:
                merged[key] = copy.deepcopy(value)
        return merged

    return copy.deepcopy(override)


def load_finance_config() -> dict[str, Any]:
    config: dict[str, Any] = {}
    if CONFIG_TEMPLATE_PATH.exists():
        config = read_json(CONFIG_TEMPLATE_PATH)

    if LOCAL_CONFIG_PATH.exists():
        config = deep_merge(config, read_json(LOCAL_CONFIG_PATH))

    return config


def to_posix(path: Path) -> str:
    return str(path).replace("\\", "/")


def sha256_for_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def iter_files(root: Path) -> list[Path]:
    if not root.exists():
        return []
    return sorted(candidate for candidate in root.rglob("*") if candidate.is_file())


def file_record(path: Path, *, base_root: Path = LOCAL_ROOT) -> dict[str, Any]:
    stat = path.stat()
    relative_path = path.relative_to(base_root)
    return {
        "relativePath": to_posix(relative_path),
        "absolutePath": str(path),
        "sizeBytes": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat().replace("+00:00", "Z"),
        "sha256": sha256_for_file(path),
    }


def resolve_local_path(path_value: str) -> Path:
    candidate = Path(path_value)
    if candidate.is_absolute():
        return candidate
    return (LOCAL_ROOT / candidate).resolve()


def expand_paths(paths: Iterable[Path]) -> list[Path]:
    expanded: list[Path] = []
    seen: set[Path] = set()

    for path in paths:
        if path.is_file() and path not in seen:
            expanded.append(path)
            seen.add(path)
            continue

        if path.is_dir():
            for child in iter_files(path):
                if child not in seen:
                    expanded.append(child)
                    seen.add(child)

    return sorted(expanded)
