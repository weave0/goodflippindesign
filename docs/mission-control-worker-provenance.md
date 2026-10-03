# Mission Control production provenance and preflight

**Question this answers: which Cloudflare Pages deployment serves production Mission Control, does the running
code agree with Cloudflare's own record of it, what authority and bindings does it have, and may the real-host
investigation start?**

## Canonical topology (pinned by `tests/mc-topology.test.mjs`)

```
https://goodflippindesign.com/api/mission-control
  -> Cloudflare Pages project `goodflippindesign`   (GitHub weave0/goodflippindesign, production branch main,
                                                     build command `npm run build`, advanced mode)
  -> _worker.js  -> workers/auth.js  -> handleMissionControlRequest
```

`gfd-auth.weave0.workers.dev` is a **legacy standalone Worker** (last deployed 2026-05-02, no Mission Control
handler, empty Clerk binding). It is **not** the Mission Control origin, it receives no Mission Control secrets and
it must not be deployed for Mission Control. `workers/wrangler.toml` carries a banner saying so and the topology
test fails if a workflow deploys it or an operator doc tells anyone to put Mission Control secrets on it.
Its future is a separate cleanup issue. (An earlier draft of this PR built a release path for it; that was the
wrong runtime and has been removed.)

## Release identity: three sources that must agree

| Source | What it is | Where |
| --- | --- | --- |
| Operator expected SHA | a merged commit on `origin/main` | `--expected-sha` |
| **Cloudflare control plane** (authoritative) | the Pages project's **canonical production deployment**: id, branch, `deployment_trigger.metadata.commit_hash`, stage `deploy:success`, custom domain | `GET /accounts/:id/pages/projects/goodflippindesign` |
| Runtime build stamp | what the running build says about itself | `GET /api/mission-control/provenance` |

Production is never inferred from GitHub `main` alone.

### The runtime stamp

Cloudflare Pages injects `CF_PAGES`, `CF_PAGES_COMMIT_SHA`, `CF_PAGES_BRANCH` and `CF_PAGES_URL` into the existing
build. `npm run build` now ends with `scripts/stamp-pages-release.mjs`, which writes `release-stamp.json`
(**build output, gitignored, never committed**; no commit can contain its own SHA). The Pages Worker reads it
through the `env.ASSETS` binding; the public edge already refuses root-level JSON, so it is not web-readable.
No Pages project setting changes.

| stamp state | meaning |
| --- | --- |
| `stamped` | a Cloudflare Pages build with a well-formed 40-char lowercase SHA |
| `invalid` | a Pages build whose SHA was absent/malformed, or the stamp is unreadable/forged. Never current. (The build still succeeds; the gate refuses it.) |
| `local` | built outside Pages (developer machine, CI, tests). Never production, even if a SHA is in the environment |
| `unstamped` | no stamp file / no asset binding in this runtime |

### The runtime probe

`GET /api/mission-control/provenance` - operator-only. Clerk session verified, role `admin`; the FWOMPS machine
bearer is refused (it reaches only `POST .../lease` and `.../result`). It reports: schema
`gfd-mc-runtime-provenance-1`; runtime kind `cloudflare-pages-advanced-worker` and the host that answered; the
release stamp above; protocol versions (`gfd-mission-control-1`, `mc-fw-investigation-request-1`,
`mc-fw-lease-grant-1`, `mc-fw-investigation-result-1` and purposes); the read-only capability contract; state
(`present`/`missing`/`invalid`) for exactly the seven `MISSION_CONTROL_*` bindings (the six worker bindings plus `MISSION_CONTROL_CANARY_RUNNER_TOKEN`); D1 reachability and presence of
the work-item table (read-only `sqlite_master` query). **No value is returned.** The two key ids and the worker id
carry a 16-hex-char SHA-256 fingerprint so the gate can compare them with the FWOMPS host; keys and the token
carry nothing.

## The preflight gate (`npm run mc:preflight`)

```bash
CLOUDFLARE_API_TOKEN=<read-only Pages token> GFD_OPERATOR_TOKEN=<operator Clerk bearer> \
node --no-warnings scripts/mc-production-preflight.mjs --expected-sha <40-hex merged sha> \
  --expected-worker-id <id> --fwomps-home ~/.fwomps --json preflight.json
```

| | check | passes when |
| --- | --- | --- |
| P0 | `local_checkout_is_expected` | checkout == expected SHA and reachable from `origin/main` |
| P1 | `cloudflare_deployment_healthy` | project `goodflippindesign`, source `weave0/goodflippindesign`, production branch `main`, domain `goodflippindesign.com`; canonical deployment is production, branch `main`, stage `deploy:success` |
| P2 | `cloudflare_commit_matches` | canonical deployment commit == expected SHA |
| P3 | `runtime_endpoint_reachable` | answered through `https://goodflippindesign.com` (any other origin, including the legacy Worker, is refused) as the Pages runtime |
| P4 | `runtime_stamp_matches` | runtime stamp is `stamped`/`cloudflare-pages`, == Cloudflare canonical commit == expected, **and built for the canonical deployment's own URL** (`CF_PAGES_URL`), because a retry deployment rebuilds the same commit under a new deployment id |
| P5 | `mission_control_bindings` | all seven bindings present+valid at runtime **and** declared in the Pages production environment, with the three credentials (`..._CONTRACT_KEY`, `..._RESULT_KEY`, `..._WORKER_TOKEN`) typed `secret_text` (an empty or populated `plain_text` credential fails) |
| P6 | `worker_identity_matches` | worker id and key ids agree (fingerprints), the host has valid enrolled worker and contract keys, **and the host holds the same key material** as the runtime (one-way key check values) **and** the delivery bearer in the FWOMPS shell equals `MISSION_CONTROL_WORKER_TOKEN` |
| P7 | `fwomps_host_verified` | the real `~/.fwomps` passes C1-C10 for `aiaimate.com` |
| P8 | `sole_dispatch_ready` | `aiaimate.com` is the only dispatch-ready **and** promotable property |
| P9 | `protocol_versions_match` | runtime schemas/purposes equal this revision's |
| P10 | `read_only_authority` | repair=false, deploy=false, repository write=false, max attempts 1 |
| P11 | `canonical_d1` | Pages production `DB` binding == the canonical D1 id in `wrangler.toml`, and reachable at runtime with the work-item schema |

Checks that depend on an earlier one are `BLOCKED`, never silently passed. The gate is read-only: Cloudflare Pages
API `GET`, one authenticated runtime `GET`, read-only reads of the FWOMPS home and this checkout. Both tokens come
from the environment only. Environment-variable **values** are never read (the project API returns names/types
for secrets, and only those are kept).

Not checked, so nobody assumes otherwise: that the host profile commands have no write behavior beyond what C3/C4
already verify; that FWOMPS wire bytes still match (covered by the #368 conformance vectors and the tier-2
specimen).

## Host signing proof (P6/P7)

`~/.fwomps/config.json` naming a `worker_key_id` is only a claim. P6 and P7 fail closed unless the real host holds
the key material it would use: `<home>/mission-control/worker-keys/<worker_key_id>.json` must exist as a regular
file (not a symlink), parse as JSON, carry `key_id` equal to the configured id, `worker_id` equal to the expected
worker, a well-formed 32-byte `secret_hex`, a parseable `created_at` and `revoked: false` (the shape
`fwomps.mission_control.keys.WorkerKeyStore` writes). The contract key whose id fingerprint matches the runtime's
`MISSION_CONTROL_CONTRACT_KEY_ID` gets the same checks under `contract-keys/`. Key ids outside `[A-Za-z0-9_-]{1,64}`
are never turned into paths. The reader returns only booleans, non-secret ids and problem codes (`file_absent`,
`key_id_mismatch`, `secret_malformed`, ...): never key material. Evidence records `workerKeyEnrolled`,
`contractKeyEnrolled` and fingerprints of the ids.

## Key interoperability (key check values)

Equal key *ids* do not prove equal key *material*; a mismatch would only surface as a rejected signature during the
canary. The runtime publishes, for each strong credential, a **key check value**
`kcv:` + the first 8 bytes of `HMAC-SHA256(key, "gfd-mc-kcv-v1:<role>")`, with the roles `contract`, `result` and
`bearer` kept separate. The label is public, the key is a random 256-bit secret and the output is truncated, so the
value commits to the key without revealing it. The preflight computes the same value from the host's enrolled
`secret_hex` files and from the delivery bearer in the operator's shell (the env var named by the host config's
`delivery.bearer_env`) and requires equality. Only strong keys (64-hex keys, bearers of 32+ characters) get a value,
so a weak human-chosen string can never be offered for offline guessing, and also can never pass this check. The
evidence records booleans (`contractKeyMaterialMatches`, `workerKeyMaterialMatches`, `deliveryBearerMatches`),
never the values. Run the preflight in the same shell that holds the FWOMPS delivery bearer.

## Evidence artifacts (`scripts/mc-evidence.mjs`)

* **Lifecycle** must be one connected, time-ordered, legal path starting at `OBSERVED` (`OBSERVED > QUALIFIED > INVESTIGATION_READY > INVESTIGATING > DIAGNOSED`); skipped, duplicated, disconnected or backwards transitions fail.
* **Classes never blend:** `ci-proven`, `tier2-isolated-specimen`, `controlled-production-canary`,
  `naturally-occurring-production-incident`. A synthetic observation can never be labelled natural.
* **Derived data is not authoritative.** `assertions`, `valid`, `failedAssertions` and the audit are pure functions of
  the body facts. `--verify` recomputes all of them from the facts and compares, then checks the digest, so a
  hand-edited `valid: true` or altered assertions fail even if the digest is recomputed.
* **The digest is a content / self-consistency digest. It is not a cryptographic signature or an independently
  anchored attestation:** it does not prove who produced the artifact. Committing the file to Git adds a separate
  integrity record; the JSON alone does not.
* **The secret-leak fence is unconditional.** The writer re-audits the exact bytes it is about to write (it does not
  trust a flag stored in the artifact). A finding throws `SecretLeakError` and nothing is written, regardless of
  `--record-failure`. With `--record-failure` only a sanitized receipt is written: classification, timestamp and
  finding kinds/counts, no field names, no values, no body. `--record-failure` can record a *logical* failure only
  (file marked `-INVALID`, `valid: false`).
* **Known secrets** are read in memory from the shell (`CLOUDFLARE_API_TOKEN`, `GFD_OPERATOR_TOKEN`,
  `FWOMPS_MC_CONTRACT_KEY_HEX`, `FWOMPS_MC_WORKER_KEY_HEX`, `GFD_MC_WORKER_TOKEN`, `MISSION_CONTROL_*`, Clerk and
  internal secrets; `--also-env NAME` adds a name) and scanned for verbatim, trimmed, other-case-hex and
  JSON-escaped forms, on build, write and verify. Values are never accepted on argv, printed or stored. Pattern
  scanning (bearer, JWT, GitHub/Stripe prefixes, private-key blocks, bare 64-hex) remains as defense in depth.
* Files are revision-bound (`mc-evidence-<class>-<gfd sha12>-<deployment id 8>-<time>.json`) and never overwritten.

## Operator runbook (Pages secrets) - values come from you, never from this repo

**Do not start until #379 is reviewed and merged and the resulting production Pages deployment is healthy**
(run the preflight without secrets first; it should fail only P5/P6/P7 and nothing about the revision).

Syntax verified against Wrangler 4.105.0: `wrangler pages secret put <KEY> --project-name <project>` reads the
value from stdin when not a TTY (hidden prompt otherwise) and writes the project's **production** environment;
`wrangler pages secret list --project-name <project>` prints names only. There is no `--env` flag.

**Pages secrets only take effect on a NEW deployment.** After adding them you must redeploy (Cloudflare dashboard
-> Deployments -> *Retry deployment* on the current production deployment rebuilds the same commit with the new
environment), then re-run the preflight. The new deployment gets a new deployment id; the commit stays the same.

### 0. Snapshot and rollback (before any mutation)

```powershell
npx wrangler pages secret list --project-name goodflippindesign                     # names now (expect none of the six)
npx wrangler pages deployment list --project-name goodflippindesign --environment production   # note the current deployment id
Copy-Item "$HOME\.fwomps\config.json" "$HOME\.fwomps\config.json.pre-mc-$(Get-Date -f yyyyMMdd-HHmmss)"
```

Rollback: remove only what you added with `npx wrangler pages secret delete <NAME> --project-name goodflippindesign`
and redeploy; restore the host `config.json` from the backup the binding tool wrote (or your copy) and delete only
the key files it reported enrolling under `~/.fwomps/mission-control/`. Cloudflare's dashboard can also roll the site
back to the previous production deployment.

### 1. Create the six secrets (prechecked set; sequential writes with rollback)

The block aborts BEFORE generating or setting anything if the listing fails or if ANY of the six already exists.
The six Cloudflare writes are sequential, not transactional: if a write fails after earlier writes succeeded, STOP and
run the rollback below before retrying. The precheck prevents mixing newly generated credentials with an existing set.

```powershell
$required = 'MISSION_CONTROL_CONTRACT_KEY','MISSION_CONTROL_CONTRACT_KEY_ID','MISSION_CONTROL_RESULT_KEY','MISSION_CONTROL_RESULT_KEY_ID','MISSION_CONTROL_RESULT_WORKER_ID','MISSION_CONTROL_WORKER_TOKEN'
$listing = npx wrangler pages secret list --project-name goodflippindesign
if ($LASTEXITCODE -ne 0) { throw 'could not list Pages secrets; nothing was changed' }
$existing = $required | Where-Object { ($listing -join "`n") -match "(?m)\b$_\b" }
if ($existing) { throw "already present: $($existing -join ', '). Decide on rotation first; nothing was changed." }

function New-Hex32 { [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower() }
$env:FWOMPS_MC_CONTRACT_KEY_HEX = New-Hex32      # == MISSION_CONTROL_CONTRACT_KEY
$env:FWOMPS_MC_WORKER_KEY_HEX   = New-Hex32      # == MISSION_CONTROL_RESULT_KEY
$env:GFD_MC_WORKER_TOKEN        = (New-Hex32) + (New-Hex32)   # == MISSION_CONTROL_WORKER_TOKEN (the FWOMPS delivery bearer; 128 hex chars)
$env:FWOMPS_MC_CONTRACT_KEY_ID  = 'gfd-contract-1'
$env:FWOMPS_MC_WORKER_KEY_ID    = 'gfd-result-1'
$workerId = 'fwomps-operator-1'                  # your production worker id
$plan = [ordered]@{
  MISSION_CONTROL_CONTRACT_KEY     = $env:FWOMPS_MC_CONTRACT_KEY_HEX
  MISSION_CONTROL_CONTRACT_KEY_ID  = $env:FWOMPS_MC_CONTRACT_KEY_ID
  MISSION_CONTROL_RESULT_KEY       = $env:FWOMPS_MC_WORKER_KEY_HEX
  MISSION_CONTROL_RESULT_KEY_ID    = $env:FWOMPS_MC_WORKER_KEY_ID
  MISSION_CONTROL_RESULT_WORKER_ID = $workerId
  MISSION_CONTROL_WORKER_TOKEN     = $env:GFD_MC_WORKER_TOKEN
}
foreach ($name in $plan.Keys) {
  $plan[$name] | npx wrangler pages secret put $name --project-name goodflippindesign   # via stdin, never echoed
  if ($LASTEXITCODE -ne 0) { throw "failed setting $name; STOP, list the secrets and roll back what was added (see rollback above)" }
}
```

If anything fails midway, stop: list the secrets, delete only the ones this block added (rollback above), and start
again. Then redeploy (above). The preflight (P5) additionally refuses a credential that is not typed `secret_text`.

`MISSION_CONTROL_GITHUB_TOKEN` (evidence source, Contents: Read on `weave0/globaldeets`) is a separate Mission
Control prerequisite for the evidence dashboard and is not part of this tranche.

### 2. Real FWOMPS host binding, then verify immediately

`<aiaimate clone>` is a **clean** clone of `weave0/aiaimate`; `<fwomps checkout>` is your FWOMPS repo.

```powershell
$common = @('--workspace-root','<aiaimate clone>','--result-origin','https://goodflippindesign.com','--worker-id',$workerId)
$env:FWOMPS_REPO = '<fwomps checkout>'
python scripts/fwomps-aiaimate-host-binding.py @common            # plan (read-only); expect no CONFLICT lines
python scripts/fwomps-aiaimate-host-binding.py @common --apply     # writes, after backing up config.json
python scripts/fwomps-aiaimate-host-binding.py @common --verify    # must be all PASS
```

### 3. Preflight (read-only)

Create a read-only Cloudflare API token (Account -> Cloudflare Pages -> Read), then get a short-lived operator
session token from an admin-signed-in GFD page (`await Clerk.session.getToken()`), straight into the environment:

```powershell
$env:CLOUDFLARE_API_TOKEN = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
$env:GFD_OPERATOR_TOKEN   = Read-Host -AsSecureString | ConvertFrom-SecureString -AsPlainText
node --no-warnings scripts/mc-production-preflight.mjs --expected-sha <merged sha> `
  --expected-worker-id $workerId --fwomps-home "$HOME\.fwomps" --json preflight.json
```

The canary does not start unless this prints **GREEN**.

## Hostile coverage

`tests/workers/worker-provenance.test.js` (in `npm run test:workers:mission-control`): unauthenticated, machine
bearer, non-admin and unverifiable-session requests refused; no stamp / local stamp / forged, malformed or
SPA-fallback stamp never reported as a release identity; each of the six bindings missing reported with no value
leaked; invalid credentials flagged without echo; D1 states without leaking driver errors.
`tests/pages-release-stamp.test.mjs`: Pages build with absent/malformed SHA is `invalid`; a SHA in a non-Pages
environment never becomes `stamped`; the stamp file is gitignored and untracked. `tests/mc-production-preflight.test.mjs`:
every P0-P11 failure mode, the legacy Worker and preview hosts refused as origins, three-way SHA disagreement,
control-plane client keeps names not values and never echoes its token. `tests/mc-topology.test.mjs`: the
architecture above.
