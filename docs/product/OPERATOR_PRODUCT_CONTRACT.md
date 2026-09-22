# GFD Operator Product Contract — Traffic + Admin

**Status:** product acceptance authority  
**Date:** 2026-09-22

Engineering correctness is necessary but is not product acceptance.

## Primary operator question

A person opening GFD Traffic Intelligence should be able to answer:

> What happened across my web estate, why does it matter, what is missing, and what should I look at next?

The Admin home should answer:

> What needs my attention across GFD right now, and where do I go to act on it?

## Thirty-second Traffic test

Without knowing Cloudflare, GA4, schema names, evidence-state terminology, or repository architecture, the operator must be able to determine:

1. the exact reporting period;
2. how much measured traffic occurred in that period;
3. whether comparable traffic rose or fell versus the prior period;
4. which properties contributed the most traffic;
5. which properties changed materially;
6. which pages/content attracted attention;
7. where traffic came from where evidence supports attribution;
8. what can responsibly be said about human vs machine activity;
9. which properties or sources are missing or degraded; and
10. the few items that deserve attention now.

A hidden eleventh requirement is mandatory: **every governed property is accounted for even when its data is unavailable.**

## Product laws

- Never equate brand, domain, Cloudflare zone, deployment, analytics property, or logical site without an explicit relationship.
- Never omit an estate property because its measurement source is absent.
- Never render unknown/unclassified/unavailable as zero or healthy.
- Every headline metric displays its period and comparison basis.
- Human-facing labels lead; implementation/provenance terminology is progressive disclosure.
- The first screen must provide useful interpretation without requiring navigation.
- Findings are ranked by operator consequence, not by producer internals.
- Raw evidence and methodology remain accessible but do not dominate the primary reading path.
- Traffic Intelligence must be directly reachable from Admin.
- Admin is an operator home, not an inventory of every backend capability.

## Acceptance gate

A release is not accepted merely because CI, deployment, contracts, or provenance pass. Before promotion:

- all governed estate properties are represented;
- missing measurement is visible and explained;
- the reporting period is obvious;
- comparison periods are explicit;
- the first screen answers the thirty-second test;
- Admin links to Traffic Intelligence;
- no fixture/test state is presented as live production;
- no primary user task requires knowledge of internal schema or source architecture.

## Immediate implementation order

1. Canonical estate registry and drift validation.
2. Admin navigation entry to Traffic Intelligence.
3. Human-first Traffic overview built from the ten questions above.
4. Estate coverage panel: reporting / degraded / unavailable / unclassified.
5. Admin home reset around attention, publishing, audience/traffic, sites, and operations.
6. Progressive drill-down for provenance and measurement laboratory details.

Existing acquisition, provenance, fail-closed, and work-queue infrastructure should be preserved unless it prevents this contract.
