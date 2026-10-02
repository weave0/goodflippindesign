"""Exercise binder refusal paths without requiring FWOMPS or touching host configuration."""
import contextlib
import importlib.util
import io
import os
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
from unittest.mock import patch


class Value:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


# Refusal paths must work before any persistence/key-store call; these doubles fail if used.
def forbidden(*args, **kwargs):
    raise AssertionError("refusal path touched persistence")


config = ModuleType("fwomps.host.config")
for name in ("HostConfig", "InvestigationProfile", "MCDeliveryConfig", "MCPropertyBinding", "MissionControlConfig", "WorkspaceConfig"):
    setattr(config, name, Value)
config.HostConfigError = RuntimeError
config.HostConfigStore = forbidden
config.fwomps_home = forbidden
keys = ModuleType("fwomps.mission_control.keys")
keys.ContractKeyStore = forbidden
keys.WorkerKeyStore = forbidden
sys.modules[config.__name__] = config
sys.modules[keys.__name__] = keys
spec = importlib.util.spec_from_file_location("binder", Path(__file__).parents[1] / "scripts/fwomps-property-host-binding.py")
binder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(binder)
route, property_id, expected_digest = sys.argv[1:]
binder.PROPERTY_ID = property_id
binder.WORKSPACE_NAME = "aiaimate"
binder.REPOSITORY = "weave0/aiaimate"
binder.PROFILE_NAME = "web-health-readonly-v1"
binder.CONTRACT_CHECK = binder.contract_check(route, property_id)
args = SimpleNamespace(workspace_root=str(Path(__file__).parent), result_origin="https://goodflippindesign.com", bearer_env="GFD_MC_WORKER_TOKEN", worker_id="worker-test", expected_argv_digest=expected_digest)
want = binder.desired(args)
command = want["profile"].commands[0]
assert binder.argv_digest(command) == expected_digest, "Python and generator must hash the same command argv"
assert binder.argv_digest(("unexpected-interpreter", *command[1:])) is None
assert binder.argv_digest((*command[:-1], "other-root")) != expected_digest
assert binder.argv_digest((command[0], "-c", "print('changed')", command[-1])) != expected_digest
mc = SimpleNamespace(worker_key_id="existing-key", worker_id="worker-test", enabled=True, properties={}, investigation_profiles={}, delivery=SimpleNamespace(configured=False))
host = SimpleNamespace(workspaces={}, mission_control=mc)
store = SimpleNamespace(load=lambda: host, save=forbidden)
key_env = {"FWOMPS_MC_CONTRACT_KEY_ID": "test-contract", "FWOMPS_MC_CONTRACT_KEY_HEX": "1" * 64, "FWOMPS_MC_WORKER_KEY_ID": "replacement-key", "FWOMPS_MC_WORKER_KEY_HEX": "2" * 64}
with patch.dict(os.environ, key_env):
    assert any("worker_key_id" in problem for problem in binder.conflicts(host, want, args))
    with contextlib.redirect_stdout(io.StringIO()):
        assert binder.cmd_apply(args, store) == 2, "different worker key must fail before writes"
    os.environ["FWOMPS_MC_WORKER_KEY_ID"] = "existing-key"
    assert binder.conflicts(host, want, args) == []
    args.expected_argv_digest = "sha256:" + "0" * 64
    with contextlib.redirect_stdout(io.StringIO()):
        assert binder.cmd_apply(args, store) == 2, "changed argv must fail before writes"
    args.expected_argv_digest = None
    with contextlib.redirect_stdout(io.StringIO()):
        assert binder.cmd_apply(args, store) == 2, "unreviewed argv must fail before writes"
print("binder command integrity and credential conflict checks passed")
