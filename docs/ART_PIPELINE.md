# Art & Media Pipeline (MVP)

This repo is a single-file website (`index.html`) backed by a growing asset library. This document standardizes **where media lives** and **how it should be prepared** so performance + accessibility stay consistent.

## Canonical folders

- `assets/portfolio/`
  - Portfolio thumbnails used in the Work section.
  - Preferred format: `.webp`.
- `assets/videos/`
  - Short publishable clips that should be playable **on-site** (no external bounce).
  - Preferred format: `.mp4` (H.264) for broad compatibility.

## Naming rules

- Use lowercase + hyphens.
- Avoid spaces, parentheses, and special characters in filenames.
- Examples:
  - ✅ `ai-aimate.webp`
  - ✅ `cat-strutting-and-dancing.mp4`
  - ❌ `GFV 29.mp4`

## Image preparation

- Prefer `.webp` for portfolio and site imagery.
- Keep dimensions reasonable (avoid multi-megabyte images when a smaller export works).
- Use existing tooling when appropriate:
  - `convert-to-webp.js` (root) can be used to convert source images.

## Video preparation (MVP)

- Keep clips short.
- Use `.mp4` with H.264 video + AAC audio.
- Ensure the embed lives on the site (HTML5 `<video>`), with a text fallback.

## Publishing workflow

1. Place new portfolio thumbnails in `assets/portfolio/` (WebP).
2. Place new clips in `assets/videos/` (MP4), using URL-safe naming.
3. If you add/rename library docs, regenerate the Library index:
   - `npm run library:index`
4. Run tests:
   - `npm run test:quick`

## Notes

- This is the MVP standardization step (directory + naming). Automated validation can be added later once we’re sure the conventions won’t churn.
