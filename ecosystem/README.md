# Ecosystem Operations Pack

This folder is the lightweight execution layer for scaling the GFD/GFV site constellation without replacing the VS Code + agent workflow.

## Source Of Truth

- `brands.json` is the canonical registry for public brands, incubations, internal engines, and paused projects.
- `ecosystem/site-briefs/*.md` captures creative intent, audience, CTA, first MVP, and guardrails for each site that needs more context than a registry row.
- `SKY_MONEY_ROADMAP_2026-06.md` is the human-readable revenue and adoption roadmap.
- `local-sweep.json` is the operational snapshot for repo health and workspace reality.

## Agent Workflow

1. Read `brands.json`.
2. Read the relevant site brief.
3. Read `SKY_MONEY_ROADMAP_2026-06.md` when the work touches revenue, adoption, sponsorship, or ecosystem priority.
4. Run `npm run ecosystem:status`.
5. Pick one small execution batch.
6. Validate with `npm run ecosystem:validate` and any page-specific tests.
7. Update `ops.nextAction` and `ops.lastReviewed` in `brands.json` when the batch changes what should happen next.

## Principle

Automate validation and status reporting. Keep creative decisions, prioritization, and strategic judgment inside the VS Code + agent loop.
