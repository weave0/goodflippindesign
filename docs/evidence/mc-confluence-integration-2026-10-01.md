# Mission Control integration evidence — 2026-10-01 (America/Chicago)

## Fresh Confluence-2 acceptance from merged revisions

GFD `4f98eb537488e16bf96a5a00218333a225f19198` (merged #387, including #379/#386), clean checkout.
FWOMPS `96832d1d01cf755107e489efd816b2037d21e7a0`, clean merged revision, published CLI and attested sandbox.

| Mode | Checks | Evidence | AIAIMate revision |
| --- | --- | --- | --- |
| isolated host | 58/58 | [isolated specimen](mc-confluence-2-isolated-host-4f98eb5-2026-10-01.json) | `b2b89c7d651104886ee8c18363d28b5fa03450ba` |
| registered real host | 61/61 | [real-host specimen](mc-confluence-2-real-host-4f98eb5-2026-10-01.json) | `257210036bff85961a1b9c96c0572aabcaaa9cd4` |

Both runs exercise the same-item lifecycle through `DIAGNOSED → RESOLVED → RECURRENT`, all 24 hostile cases,
idempotent delivery, and recurrent-cycle operator visibility. Their observation timelines are monotonic;
`finishedAt` follows recurrence, and projection observation ages are nonnegative. Published artifacts include the
unmodified comparable summary, checks and lifecycle projections, plus a digest of the complete source trace.
Raw signed wire envelopes remain local; the publications were scanned against enrolled host secret values and
credential patterns before being committed, and both audits were clean.

Limits: observations are synthetic, Clerk identity is stubbed, and GFD uses a local worker over real D1. In the
real-host mode, delivery to local GFD substitutes for the registered production origin, explicitly recorded in
the artifact. The host's older AIAIMate checkout remains pinned and unchanged; the isolated run clones current
AIAIMate main. Neither run proves a naturally occurring production incident or grants repair/deploy authority.

These fresh specimens supersede the three earlier Confluence-2 artifacts as acceptance proof. The earlier
files remain unchanged as historical debugging evidence.

## Production readiness remains a separate gate

[Live preflight](mc-preflight-4f98eb5-2026-10-01.json) confirms the successful canonical Pages deployment
`044893ec-f144-4eab-8ac3-0a4ba5958e9a` serves the expected merged commit according to Cloudflare's control plane.
The real host binding passes C1-C10; only AIAIMate is dispatch-ready (the other 24 remain blocked).

P3 fails because no current GFD admin session bearer is available. P4-P6 and P9-P11 remain blocked, so
`canStartInvestigation` is false. A separate read-only Cloudflare project query found no declared production
`MISSION_CONTROL_*` bindings. Provisioning, runtime stamp/D1 verification, and the controlled production canary
therefore remain unproven. The read-only Cloudflare credential was used in memory and is absent from evidence.

## Historical baseline retained separately

[Original canonical-main baseline](mc-canonical-main-baseline-2026-10-01.json) records MC-CONFLUENCE-001 at
`015e06e` (43/43 isolated specimen). Its bytes are unchanged. Its title describes the baseline at the recorded
revision, not today's acceptance or production status.
