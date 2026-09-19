# CultureSherpa LinkedIn social ops — audit (2026-09-03)

Nothing was published. No live LinkedIn calls were made.

## Current state

| Piece | Status |
| --- | --- |
| GFD `workers/social-publisher.js` (`gfv-social-publisher`) | **Live / keep.** LinkedIn Posts + Images APIs (`Linkedin-Version: 202401`, `/rest/posts`, `/rest/images`). Cron `*/15`. D1 `gfd_community`. R2 `gfv-media`. |
| Variant states | `pending` → `publishing` → `published` / `failed`. Retries reset to `pending` with backoff. No `scheduled` status distinct from `pending`. No content-hash idempotency. |
| HTTP | `/health`, authenticated `POST /run-now`. **No dry-run.** `/run-now` publishes. |
| GFD OAuth (`workers/oauth.js`) | LinkedIn scopes `openid profile w_member_social`. Posts as **person URN**, not a Company Page. |
| GFD admin Daily Culture Calendar | **Exists, manual.** AM/PM two-a-day kit (copy caption / open LinkedIn). Does not enqueue `cms_post_variants`. CultureSherpa is already a CMS brand (`culturesherpa.org`). |
| CS `scripts/culture_drip.py` + `social_poster.py` | **Dormant / obsolete for production.** Legacy UGC Posts (`/v2/ugcPosts`), local `drip_state.db`, OpenAI captions, missing `data/cultures_index.json`. Do not rebuild. |
| Canonical facts | `website-astro/public/data/cultures_index.json` (549 cultures, generated 2026-04-15). `images_index.json` (1427 alias keys, claims 594 cards). |

## Image coverage (git + live explore CDN)

Live cards: `https://www.culturesherpa.org/explore/cultural_images/{slug}_card.webp`

R2 `gfv-media` was **not** listed (no Cloudflare access from this environment).

| Status | Count | Notes |
| --- | --- | --- |
| ready | 378 | Git `_card.webp` present; all 378 have approved overview → LinkedIn-eligible |
| probable-match | 168 | `images_index` path, 404 on git and live CDN (includes `maori`→`mori`, `south_sudan`→`s_sudan`, `western_sahara`→`w_sahara`) |
| ambiguous | 2 | `cote_d_ivoire`, `kadazan_dusun` — two names, neither file found |
| genuinely-missing | 1 | `mundari` (json/svg profile, no card) |
| **Eligible for unattended LinkedIn** | **378** | ~189 days at two posts/day |

Sámi: duplicate git files `sami_card.webp` and `sámi_card.webp`. Prefer `sami`.

See `image-coverage.csv` / `image-coverage.json` for every culture.

## Defects (fix, don’t rewrite)

1. Daily calendar does not insert `cms_social_posts` / `cms_post_variants`.
2. Retries have no content hash → duplicate LinkedIn posts possible.
3. Publisher has no dry-run; `/run-now` is live.
4. Python drip uses AI captions and UGC Posts.
5. Ineligible cultures must skip as exceptions, never generic fallback.
6. Two posts must be **separate slots**, not one simultaneous blast.

## Production path (reuse GFD publisher)

Deterministic copy only, from canonical fields:

```
{culture_name} — {region}

{display_overview or teaser}

https://www.culturesherpa.org/explore/culture/{slug}
```

1. Cron (America/Chicago AM + PM) selects the next two **eligible** cultures (status `ready`, unused in current rotation). Skip others into an exceptions table/view.
2. Insert one `cms_social_posts` + one `cms_post_variants` row per slot (`brand=culturesherpa`, `platform=linkedin`, `status=pending`, `scheduled_at` = slot time). Store culture slug, asset path, content hash.
3. Existing `gfv-social-publisher` 15-minute cron drains due `pending` rows via current LinkedIn Posts + Images APIs.
4. Idempotency: unique (culture_id, content_hash, platform) — if `published` or `publishing` exists, do not insert or post again.
5. Admin Daily Culture Calendar becomes optional ops: upcoming, last successes, failed/retry, rotation remaining, coverage, pause/resume. No daily human step.

## Dry-run (required before any live post)

Add `POST /dry-run` (same `INTERNAL_SECRET` auth) that:

- selects next two eligible cultures
- builds deterministic copy + image URL
- writes D1 receipts with `status=dry_run` (or `pending` + `dry_run=1`)
- **does not** call LinkedIn, R2 upload, or `/rest/posts`

Prove: two receipts, two distinct slugs, image URLs 200, no LinkedIn post IDs.

## Remaining human-only requirements

Cannot be done from this audit:

1. **Cursor on-demand** — declined. Code landing here is docs/coverage on a branch via GitHub, not a tested worker deploy.
2. **LinkedIn developer app** — Sign In with LinkedIn (OpenID) + Share on LinkedIn (`w_member_social`). Confirm the app is approved for those products.
3. **OAuth once** — connect CultureSherpa LinkedIn via GFD admin Connections so `cms_platform_tokens` has an active `culturesherpa` / `linkedin` row with `person_urn` + refreshable token.
4. **Company Page (optional)** — current code posts as a **member**, not `urn:li:organization:`. Page posting needs `w_organization_social` and a Page role. Do not assume Page until that is added.
5. **Cloudflare secrets** on `gfv-social-publisher`: `TOKEN_ENCRYPTION_KEY`, `INTERNAL_SECRET`, `LINKEDIN_CLIENT_SECRET` (refresh). Confirm they exist; do not rotate blindly.
6. **R2 inventory** — `wrangler r2 object list gfv-media` (or Cloudflare dashboard) for the 168 probable-match keys. If objects exist, promote to ready; if not, they stay skipped exceptions. No replacement artwork.

## Activation (after dry-run is green)

1. Human confirms items 2–5 above.
2. **Exactly one** authorized live LinkedIn proof (one eligible culture, dry-run receipt reused or new hash).
3. Verify `external_id` / `external_url` on the variant row and the LinkedIn post.
4. Only then enable the twice-daily enqueue cron. Leave publisher cron as-is.

Do not merge until that live proof is explicitly authorized.
