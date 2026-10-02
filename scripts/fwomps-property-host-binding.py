#!/usr/bin/env python3
"""Register (or verify) the FWOMPS host binding for ANY governed property. Host-owner action.

    <property>  ->  workspace  ->  <owner/repo>  ->  read-only investigation profile (fixed argv)

Generalisation of scripts/fwomps-aiaimate-host-binding.py (same classes, same guarantees): READ-ONLY by default
(`plan`, `--verify`), `--apply` backs up config.json and writes atomically, refuses conflicting workspace/binding/profile/
Mission Control blocks, and takes the shared keys from environment variables only (never printed). The profile is host
policy, one fixed read-only argv: it reproduces (exit 1) when the repository's health route does not declare the
gfd-property-health machine contract for the property. With the AIAIMate arguments it produces the byte-identical profile
the AIAIMate script registers (`--property aiaimate.com --repository weave0/aiaimate --workspace aiaimate
--route-path portal/app/api/health/route.ts --profile web-health-readonly-v1`).

usage:
  FWOMPS_REPO=<fwomps checkout> python scripts/fwomps-property-host-binding.py --property <id> --repository <owner/repo>       --workspace <name> --profile <profile name> --route-path <repo-relative health route file>       --workspace-root <clean clone> --result-origin https://<gfd origin> --worker-id <id> [--apply | --verify]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

if os.environ.get("FWOMPS_REPO"):
    sys.path.insert(0, os.environ["FWOMPS_REPO"])

from fwomps.host.config import (  # noqa: E402
    HostConfig,
    HostConfigError,
    HostConfigStore,
    InvestigationProfile,
    MCDeliveryConfig,
    MCPropertyBinding,
    MissionControlConfig,
    WorkspaceConfig,
    fwomps_home,
)
from fwomps.mission_control.keys import ContractKeyStore, WorkerKeyStore  # noqa: E402

PROPERTY_ID = ""
WORKSPACE_NAME = ""
REPOSITORY = ""
PROFILE_NAME = ""
CONTRACT_CHECK = ""


def contract_check(route_path: str, property_id: str) -> str:
    """The one read-only check. For portal/app/api/health/route.ts + aiaimate.com it is byte-identical to the AIAIMate script's."""
    parts = " / ".join(repr(part) for part in route_path.split("/"))
    return (
        "import sys, pathlib;"
        f"p = pathlib.Path(sys.argv[1]) / {parts};"
        "t = p.read_text(encoding='utf-8');"
        f"ok = \"contract: 'gfd-property-health'\" in t and \"propertyId: '{property_id}'\" in t;"
        "sys.exit(0 if ok else 1)"
    )
HEX64 = re.compile(r"^[0-9a-fA-F]{64}$")
KEY_ENVS = ("FWOMPS_MC_CONTRACT_KEY_ID", "FWOMPS_MC_CONTRACT_KEY_HEX", "FWOMPS_MC_WORKER_KEY_ID", "FWOMPS_MC_WORKER_KEY_HEX")


def argv_digest(command: tuple[str, ...]) -> str | None:
    # Only the current host Python may occupy the template's interpreter slot.
    if not command or command[0] != sys.executable:
        return None
    canonical = ["{python_executable}", *command[1:]]
    encoded = json.dumps(canonical, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()


def git(root: Path, *args: str) -> str:
    done = subprocess.run(["git", "-C", str(root), *args], capture_output=True, text=True, encoding="utf-8")
    return done.stdout.strip() if done.returncode == 0 else ""


def desired(args: argparse.Namespace) -> dict:
    profile = InvestigationProfile(
        name=PROFILE_NAME,
        commands=((sys.executable, "-B", "-c", CONTRACT_CHECK, "{repository_root}"),),
        description="read-only: the repository's health route declares the gfd-property-health contract",
        predicate="exit_nonzero_reproduces",
    )
    return {
        "workspace": WorkspaceConfig(name=WORKSPACE_NAME, root=str(Path(args.workspace_root).resolve())),
        "binding": MCPropertyBinding(workspace=WORKSPACE_NAME, repository=REPOSITORY, investigation_profile=PROFILE_NAME),
        "profile": profile,
        "delivery": MCDeliveryConfig(result_base_url=args.result_origin, bearer_env=args.bearer_env, timeout_seconds=10.0, max_attempts=3, backoff_seconds=1.0),
    }


def conflicts(host: HostConfig, want: dict, args: argparse.Namespace) -> list[str]:
    problems: list[str] = []
    have_ws = host.workspaces.get(WORKSPACE_NAME)
    if have_ws and Path(have_ws.root).resolve() != Path(want["workspace"].root):
        problems.append(f"workspace {WORKSPACE_NAME!r} is already registered at a different root: {have_ws.root}")
    mc = host.mission_control
    requested_key = os.environ.get("FWOMPS_MC_WORKER_KEY_ID")
    if mc.worker_key_id and requested_key and mc.worker_key_id != requested_key:
        problems.append("mission_control.worker_key_id differs from the requested key; property registration cannot rotate shared credentials")
    binding = mc.properties.get(PROPERTY_ID)
    if binding and binding != want["binding"]:
        problems.append(f"{PROPERTY_ID} already has a different binding: {binding.to_dict()}")
    existing_profile = mc.investigation_profiles.get(PROFILE_NAME)
    if existing_profile and existing_profile != want["profile"]:
        problems.append(f"profile {PROFILE_NAME!r} already exists with different commands/predicate")
    if mc.enabled and mc.worker_id and mc.worker_id != args.worker_id:
        problems.append(f"mission_control.worker_id is already {mc.worker_id!r}, not {args.worker_id!r}")
    if mc.delivery.configured and (mc.delivery.result_base_url != args.result_origin or mc.delivery.bearer_env != args.bearer_env):
        problems.append("mission_control.delivery is already configured for a different origin/credential env")
    return problems


def plan_lines(host: HostConfig, want: dict, args: argparse.Namespace) -> list[str]:
    mc = host.mission_control
    out = []
    out.append(("= " if WORKSPACE_NAME in host.workspaces else "+ ") + f"workspace {WORKSPACE_NAME!r} -> {want['workspace'].root}")
    out.append(("= " if mc.investigation_profiles.get(PROFILE_NAME) else "+ ") + f"investigation profile {PROFILE_NAME!r} (fixed read-only argv, predicate exit_nonzero_reproduces)")
    out.append(("= " if mc.properties.get(PROPERTY_ID) else "+ ") + f"property binding {PROPERTY_ID} -> workspace {WORKSPACE_NAME} -> {REPOSITORY} -> {PROFILE_NAME}")
    out.append(("= " if mc.enabled else "+ ") + f"mission_control.enabled, worker_id={args.worker_id!r}")
    out.append(("= " if mc.delivery.configured else "+ ") + f"delivery origin {args.result_origin} with bearer read from ${args.bearer_env} (value never stored)")
    return out


def key_state(home: Path) -> dict:
    store_root = home / "mission-control"
    def listed(folder: str) -> list[str]:
        d = store_root / folder
        return sorted(p.stem for p in d.glob("*.json")) if d.is_dir() else []
    return {"contract_key_ids": listed("contract-keys"), "worker_key_ids": listed("worker-keys")}


def cmd_plan(args: argparse.Namespace, store: HostConfigStore) -> int:
    host = store.load()
    want = desired(args)
    print(f"FWOMPS home: {store.home}  (READ-ONLY plan; nothing is written)")
    for line in plan_lines(host, want, args):
        print("  " + line)
    state = key_state(store.home)
    print(f"  keys enrolled now: contract={state['contract_key_ids'] or 'none'} worker={state['worker_key_ids'] or 'none'}")
    present = {name: bool(os.environ.get(name)) for name in KEY_ENVS}
    print("  key env vars present: " + ", ".join(f"{name}={'yes' if ok else 'NO'}" for name, ok in present.items()))
    problems = conflicts(host, want, args)
    for problem in problems:
        print(f"  CONFLICT: {problem}")
    print("  next: re-run with --apply to write; then with --verify.")
    return 2 if problems else 0


def cmd_apply(args: argparse.Namespace, store: HostConfigStore) -> int:
    if not args.expected_argv_digest or args.expected_argv_digest != argv_digest(desired(args)["profile"].commands[0]):
        print("refusing: --expected-argv-digest must match the reviewed canonical command argv")
        return 2
    missing = [name for name in KEY_ENVS if not os.environ.get(name)]
    if missing:
        print(f"refusing: set {', '.join(missing)} (values are never printed)")
        return 2
    for name in ("FWOMPS_MC_CONTRACT_KEY_HEX", "FWOMPS_MC_WORKER_KEY_HEX"):
        if not HEX64.fullmatch(os.environ[name]):
            print(f"refusing: {name} must be 64 hex characters (the same value GFD holds)")
            return 2
    host = store.load()
    want = desired(args)
    problems = conflicts(host, want, args)
    if problems:
        for problem in problems:
            print(f"refusing (conflict): {problem}")
        return 2
    root = Path(want["workspace"].root)
    if not (root / ".git").exists():
        print(f"refusing: {root} is not a git checkout")
        return 2

    mc = host.mission_control
    new_mc = MissionControlConfig(
        enabled=True,
        worker_id=args.worker_id,
        worker_key_id=os.environ["FWOMPS_MC_WORKER_KEY_ID"],
        delivery=want["delivery"],
        max_attempts_cap=mc.max_attempts_cap,
        max_contract_lifetime_seconds=mc.max_contract_lifetime_seconds,
        max_runtime_seconds_cap=mc.max_runtime_seconds_cap,
        properties={**mc.properties, PROPERTY_ID: want["binding"]},
        investigation_profiles={**mc.investigation_profiles, PROFILE_NAME: want["profile"]},
    )
    new_host = HostConfig(
        model=host.model, base_url=host.base_url, trust=host.trust, sandbox_backend=host.sandbox_backend,
        max_replans=host.max_replans, console_port=host.console_port, console_device_id=host.console_device_id,
        workspaces={**host.workspaces, WORKSPACE_NAME: want["workspace"]},
        mission_control=new_mc,
    )
    new_host.mission_control.delivery.validate()

    if store.path.is_file():
        backup = store.path.with_name(f"config.json.bak-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(store.path, backup)
        print(f"backup: {backup}")
    store_root = store.home / "mission-control"
    state = key_state(store.home)
    try:
        if os.environ["FWOMPS_MC_CONTRACT_KEY_ID"] not in state["contract_key_ids"]:
            ContractKeyStore(store_root).enrol(key_id=os.environ["FWOMPS_MC_CONTRACT_KEY_ID"], secret=bytes.fromhex(os.environ["FWOMPS_MC_CONTRACT_KEY_HEX"]))
            print(f"enrolled contract key id {os.environ['FWOMPS_MC_CONTRACT_KEY_ID']}")
        else:
            print(f"contract key id {os.environ['FWOMPS_MC_CONTRACT_KEY_ID']} already enrolled (left as is; confirm it equals GFD's key)")
        if os.environ["FWOMPS_MC_WORKER_KEY_ID"] not in state["worker_key_ids"]:
            WorkerKeyStore(store_root).enrol(worker_id=args.worker_id, key_id=os.environ["FWOMPS_MC_WORKER_KEY_ID"], secret=bytes.fromhex(os.environ["FWOMPS_MC_WORKER_KEY_HEX"]))
            print(f"enrolled worker key id {os.environ['FWOMPS_MC_WORKER_KEY_ID']}")
        else:
            print(f"worker key id {os.environ['FWOMPS_MC_WORKER_KEY_ID']} already enrolled (left as is; confirm it equals GFD's key)")
    except Exception as error:  # noqa: BLE001 - report class only, never key material
        print(f"refusing: key enrolment failed ({type(error).__name__}); config was not written")
        return 2
    path = store.save(new_host)
    print(f"wrote {path}")
    print("next: run with --verify, then export the delivery bearer in the shell that runs FWOMPS.")
    return 0


def cmd_verify(args: argparse.Namespace, store: HostConfigStore) -> int:
    checks: list[tuple[str, bool, str]] = []
    try:
        host = store.load()
    except HostConfigError as error:
        print(f"FAIL host config unreadable: {error}")
        return 1
    want = desired(args)
    mc = host.mission_control
    ws = host.workspaces.get(WORKSPACE_NAME)
    root = Path(ws.root) if ws else None
    checks.append(("workspace registered", bool(ws), str(root) if root else "missing"))
    checks.append(("workspace is a git checkout", bool(root and (root / ".git").exists()), ""))
    origin = git(root, "remote", "get-url", "origin") if root else ""
    checks.append((f"origin is {REPOSITORY}", bool(re.search(r"github\.com[:/]" + re.escape(REPOSITORY) + r"(\.git)?$", origin, re.I)), origin))
    checks.append(("working tree is clean", bool(root) and git(root, "status", "--porcelain") == "", ""))
    head = git(root, "rev-parse", "HEAD") if root else ""
    checks.append(("HEAD revision (pin this as the contract evidenceRevision)", bool(re.fullmatch(r"[0-9a-f]{40}", head)), head))
    if args.revision:
        checks.append(("HEAD equals --revision", head == args.revision, f"{head} vs {args.revision}"))
    checks.append(("mission_control enabled with worker id", mc.enabled and mc.worker_id == args.worker_id, mc.worker_id))
    checks.append((f"{PROPERTY_ID} binding", mc.properties.get(PROPERTY_ID) == want["binding"], json.dumps(mc.properties[PROPERTY_ID].to_dict()) if PROPERTY_ID in mc.properties else "missing"))
    profile = mc.investigation_profiles.get(PROFILE_NAME)
    checks.append((f"profile {PROFILE_NAME} is the expected read-only argv", bool(profile) and profile.commands == want["profile"].commands and profile.predicate == "exit_nonzero_reproduces", ""))
    checks.append(("reviewed argv digest matches installed command", bool(profile) and len(profile.commands) == 1 and bool(args.expected_argv_digest) and argv_digest(profile.commands[0]) == args.expected_argv_digest, ""))
    checks.append(("profile interpreter exists", bool(profile) and Path(profile.commands[0][0]).is_file(), profile.commands[0][0] if profile else ""))
    checks.append(("delivery origin + bearer env name", mc.delivery.configured and mc.delivery.result_base_url == args.result_origin and mc.delivery.bearer_env == args.bearer_env, f"{mc.delivery.result_base_url} ${mc.delivery.bearer_env}"))
    checks.append(("delivery bearer is present in THIS shell (value not shown)", bool(os.environ.get(args.bearer_env)), f"${args.bearer_env}"))
    state = key_state(store.home)
    checks.append(("worker key enrolled for the configured key id", mc.worker_key_id in state["worker_key_ids"], mc.worker_key_id))
    checks.append(("a contract key is enrolled", bool(state["contract_key_ids"]), ",".join(state["contract_key_ids"])))
    attest = store.home / "sandbox-attestations"
    checks.append(("a sandbox attestation exists (run `fwomps doctor --sandbox` if not)", attest.is_dir() and any(attest.glob("*.json")), ",".join(p.name for p in attest.glob("*.json")) if attest.is_dir() else "missing"))
    failed = 0
    for name, ok, detail in checks:
        failed += 0 if ok else 1
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  [{detail}]" if detail else ""))
    print(f"\n{len(checks) - failed}/{len(checks)} checks passed")
    return 0 if failed == 0 else 1


def main() -> int:
    parser = argparse.ArgumentParser(description="Plan, apply or verify a governed property FWOMPS host binding (read-only unless --apply)")
    parser.add_argument("--home", help="FWOMPS home (default $FWOMPS_HOME or ~/.fwomps)")
    parser.add_argument("--property", required=True, help="canonical property id, e.g. citizenapproved.org")
    parser.add_argument("--repository", required=True, help="canonical owner/repo")
    parser.add_argument("--workspace", required=True, help="FWOMPS workspace name to register")
    parser.add_argument("--profile", required=True, help="investigation profile name to register")
    parser.add_argument("--route-path", required=True, help="repo-relative file that must declare the gfd-property-health contract")
    parser.add_argument("--expected-argv-digest", help="reviewed sha256 digest of canonical argv (required for apply/verify)")
    parser.add_argument("--workspace-root", required=True, help="a CLEAN clone of the repository on this machine")
    parser.add_argument("--result-origin", required=True, help="GFD origin that receives results, e.g. https://goodflippindesign.com (origin only)")
    parser.add_argument("--worker-id", required=True, help="must equal GFD MISSION_CONTROL_RESULT_WORKER_ID")
    parser.add_argument("--bearer-env", default="GFD_MC_WORKER_TOKEN", help="NAME of the env var holding the GFD worker bearer (value never stored)")
    parser.add_argument("--revision", help="with --verify: require the workspace HEAD to equal this revision")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true", help="write the binding (backs up config.json first)")
    mode.add_argument("--verify", action="store_true", help="read-only checks of the current host state")
    args = parser.parse_args()
    global PROPERTY_ID, WORKSPACE_NAME, REPOSITORY, PROFILE_NAME, CONTRACT_CHECK
    PROPERTY_ID, WORKSPACE_NAME, REPOSITORY, PROFILE_NAME = args.property, args.workspace, args.repository, args.profile
    if not re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", PROPERTY_ID) or not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", REPOSITORY):
        parser.error("--property/--repository are malformed")
    if args.route_path.startswith("/") or ".." in args.route_path.split("/") or not re.fullmatch(r"[A-Za-z0-9_./\[\]()-]+", args.route_path):
        parser.error("--route-path must be a relative path inside the repository")
    CONTRACT_CHECK = contract_check(args.route_path, PROPERTY_ID)
    store = HostConfigStore(Path(args.home) if args.home else fwomps_home())
    if args.apply:
        return cmd_apply(args, store)
    if args.verify:
        return cmd_verify(args, store)
    return cmd_plan(args, store)


if __name__ == "__main__":
    sys.exit(main())
