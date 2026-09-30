"""Host-owned half of the MC-CONFLUENCE-001 specimen: an ISOLATED FWOMPS home.

Uses only FWOMPS's published host-config and key-store classes (the same ones the published
``fwomps`` CLI and its own acceptance suite use). Writes a throwaway ``FWOMPS_HOME``; it never reads
or modifies the operator's real ``~/.fwomps``.

usage:  FWOMPS_REPO=<fwomps checkout> python fwomps_host_setup.py <spec.json>

spec.json keys: home, workspace_root, repository, property_id, workspace_name, profile_name,
    python_exe, contract_key_id, contract_key_hex, worker_id, worker_key_id, worker_key_hex,
    result_base_url, bearer_env
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, os.environ["FWOMPS_REPO"])

from fwomps.host.config import (  # noqa: E402
    HostConfig,
    HostConfigStore,
    InvestigationProfile,
    MCDeliveryConfig,
    MCPropertyBinding,
    MissionControlConfig,
    WorkspaceConfig,
)
from fwomps.mission_control.keys import ContractKeyStore, WorkerKeyStore  # noqa: E402

# Host-registered, fixed-argv, read-only. Reproduces (exit 1) when the repository at the pinned
# revision does NOT declare the gfd-property-health machine contract for aiaimate.com in its health
# route: a deterministic, source-level, profile-relative check. No network, no writes.
CONTRACT_CHECK = (
    "import sys, pathlib;"
    "p = pathlib.Path(sys.argv[1]) / 'portal' / 'app' / 'api' / 'health' / 'route.ts';"
    "t = p.read_text(encoding='utf-8');"
    "ok = \"contract: 'gfd-property-health'\" in t and \"propertyId: 'aiaimate.com'\" in t;"
    "sys.exit(0 if ok else 1)"
)


def main() -> None:
    spec = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    home = Path(spec["home"])
    home.mkdir(parents=True, exist_ok=True)

    profile = InvestigationProfile(
        name=spec["profile_name"],
        commands=((spec["python_exe"], "-B", "-c", CONTRACT_CHECK, "{repository_root}"),),
        description="read-only: the repository's health route declares the gfd-property-health contract",
        predicate="exit_nonzero_reproduces",
    )
    mc = MissionControlConfig(
        enabled=True,
        worker_id=spec["worker_id"],
        worker_key_id=spec["worker_key_id"],
        delivery=MCDeliveryConfig(
            result_base_url=spec["result_base_url"],
            bearer_env=spec["bearer_env"],
            timeout_seconds=10.0,
            max_attempts=2,
            backoff_seconds=0.0,
        ),
        properties={
            spec["property_id"]: MCPropertyBinding(
                workspace=spec["workspace_name"],
                repository=spec["repository"],
                investigation_profile=spec["profile_name"],
            )
        },
        investigation_profiles={spec["profile_name"]: profile},
    )
    host = HostConfig(
        mission_control=mc,
        workspaces={spec["workspace_name"]: WorkspaceConfig(name=spec["workspace_name"], root=spec["workspace_root"])},
    )
    HostConfigStore(home).save(host)

    store_root = home / "mission-control"
    ContractKeyStore(store_root).enrol(
        key_id=spec["contract_key_id"], secret=bytes.fromhex(spec["contract_key_hex"])
    )
    WorkerKeyStore(store_root).enrol(
        worker_id=spec["worker_id"],
        key_id=spec["worker_key_id"],
        secret=bytes.fromhex(spec["worker_key_hex"]),
    )
    print(json.dumps({"home": str(home), "profile": spec["profile_name"], "property": spec["property_id"]}))


if __name__ == "__main__":
    main()
