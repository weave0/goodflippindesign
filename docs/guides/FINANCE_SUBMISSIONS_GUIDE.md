# Finance Submissions Workflow

## Purpose

Finance and reporting automation should be managed from the GFD repo root, not from ad hoc code living only under `CASHMONEY/`.

`Z:\GFD` is the real Git root and already contains the shared conventions for scripts, docs, deployment, analytics, and Stripe operations. This workflow keeps durable logic in tracked repo paths and keeps raw exports plus generated bundles local-only.

## Ownership Model

- Tracked source of truth: `scripts/finance/`
- Tracked process documentation: `docs/guides/FINANCE_SUBMISSIONS_GUIDE.md`
- Local staging, exports, secrets, and generated bundles: `CASHMONEY/`

`CASHMONEY/` is intentionally ignored so the repo does not accumulate raw financial exports, private credentials, or generated submission packages.

The finance bootstrap also seeds a local-only `CASHMONEY/finance-config.json` from the tracked template in `scripts/finance/templates/finance-config.example.json` when it does not already exist.

## Local Staging Layout

The root finance bootstrap command creates this layout under `Z:\GFD\CASHMONEY`:

```txt
CASHMONEY/
├── data/
│   ├── inbound/        # Raw GA4, Stripe, banking, or partner exports
│   └── working/        # Cleaned or transformed intermediate files
├── logs/               # Local run logs
└── out/
    └── submissions/   # Final assembled submission bundles
```

## Commands

From `Z:\GFD`:

```powershell
npm run finance:bootstrap
npm run finance:init
npm run finance:status
npm run finance:list
npm run finance:help
npm run finance:inventory
npm run finance:package
npm run finance:ga4:discover
npm run finance:ga4:ingest
npm run finance:stripe:export
```

For finance tools that need custom flags, call the direct Node runner instead of `npm run`. `npm` treats many dashed arguments as npm config rather than script arguments.

```powershell
node scripts/finance/run-finance-tool.js package_submission --label q1-audit --dry-run
node scripts/finance/run-finance-tool.js export_ga4 --property-id 123456789 --start-date 2026-01-01 --end-date 2026-01-31
node scripts/finance/run-finance-tool.js export_stripe --since-days 30
```

Direct PowerShell execution is available when you want to run a specific tracked Python tool:

```powershell
pwsh -File scripts/finance/finance-workspace.ps1 -Action run -Tool export_ga4 -ToolArgs '--property-id','123456789','--start-date','2026-01-01','--end-date','2026-01-31'
```

## Python Runtime Resolution

The finance bootstrap script checks Python in this order:

1. `Z:\GFD\CASHMONEY\.venv\Scripts\python.exe`
2. `Z:\GFD\.venv\Scripts\python.exe`
3. `py -3`
4. `python` on `PATH`

That keeps existing local finance environments usable while moving orchestration to the repo root.

If the finance venv does not already contain the external API libraries, install the tracked requirements into the active finance environment:

```powershell
Z:\GFD\CASHMONEY\.venv\Scripts\python.exe -m pip install -r Z:\GFD\scripts\finance\requirements.txt
```

## Tracked Tooling

- `inventory_finance_inputs.py`: Summarizes inbound and working files and writes a log snapshot.
- `package_submission.py`: Copies selected local files into a timestamped submission bundle and writes a manifest plus readme.
- `discover_ga4_properties.py`: Lists GA4 accounts and properties visible to a Google service account.
- `export_ga4.py`: Exports a configurable GA4 report to JSON or CSV.
- `ingest_ga4_ui_exports.py`: Normalizes manually downloaded GA4 CSV exports into structured JSON.
- `export_stripe.py`: Exports selected Stripe object types to JSON for downstream packaging or analysis.

## Local Config

`CASHMONEY/finance-config.json` is intentionally local-only and ignored by Git. Use it to store machine-specific paths and defaults without leaking credentials into the repo.

Recommended fields:

- `ga4.credentialsPath`: service-account JSON path used by GA4 scripts
- `ga4.propertyId`: default GA4 property for exports
- `stripe.apiKeyEnvVar`: environment variable name containing the Stripe secret key
- `organization.submissionPrefix`: default submission label prefix

## Migrating Existing Finance Logic

If you recover old scripts from backups, local copies, or another machine, move the durable source files into `scripts/finance/`.

Good candidates include the missing tools inferred from local caches, such as:

- `discover_ga4_properties.py`
- `export_ga4.py`
- `ingest_ga4_ui_exports.py`
- `export_stripe.py`

Do not promote `__pycache__`, `.mypy_cache`, generated CSVs, or submission bundles into tracked source.

## Recommended Operating Pattern

1. Open the repo root at `Z:\GFD`.
2. Run `npm run finance:bootstrap` once on a machine.
3. Fill in `CASHMONEY/finance-config.json` with any local GA4 defaults or credential paths.
4. Drop raw exports into `CASHMONEY/data/inbound/`.
5. Run `npm run finance:inventory` to confirm what is staged.
6. Use the GA4 and Stripe tools to export or normalize additional data into `CASHMONEY/data/working/`.
7. Run `node scripts/finance/run-finance-tool.js package_submission --label your-bundle-name` when you are ready to assemble a deliverable.
8. Keep tracked automation in `scripts/finance/`.
9. Document any durable workflow changes in this guide.

## Current State

At the time this workflow was added, the existing `CASHMONEY/` folder contained local caches and virtual environment artifacts but no tracked finance source files. The workspace is now structured so recovered or new automation can be managed from the repo root cleanly.
