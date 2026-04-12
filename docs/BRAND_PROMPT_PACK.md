# Good Flippin Design — Brand + Web Artwork Prompt Pack

This repo already contains a canonical asset library under:

- Logos: [assets/brand/logo/](assets/brand/logo/)
- Favicons: [assets/brand/favicon/](assets/brand/favicon/)
- OG/Twitter: [assets/brand/og/](assets/brand/og/)
- Social: [assets/brand/social/](assets/brand/social/)
- Hero backgrounds: [assets/brand/web/hero/](assets/brand/web/hero/)

Use this doc to regenerate missing/helpful/stylistic artwork **without drifting from the established brand**.

---

## Reference images (attach to _every_ generation)

Attach these three files as image references whenever the generator supports it:

- [assets/brand/logo/gfd-logo-master.png](assets/brand/logo/gfd-logo-master.png)
- [assets/brand/logo/gfd-logo-mark.png](assets/brand/logo/gfd-logo-mark.png)
- [assets/brand/web/hero/hero-gradient.png](assets/brand/web/hero/hero-gradient.png)

If you are generating a social cover or OG card, optionally also attach:

- [assets/brand/og/og-image.png](assets/brand/og/og-image.png) (layout vibe)
- [assets/brand/social/cover-linkedin.png](assets/brand/social/cover-linkedin.png) (banner composition)

### Consistency clause (paste into every prompt)

> Match the exact style, geometry language, and color palette of the attached reference images. Do not introduce new brand colors. Keep the design minimal, clean, and high-contrast for a dark UI. Avoid photorealism.

### Universal negative constraints (paste into every prompt)

> No extra logos, no misspelled text, no watermarks, no mockup devices, no bevel/emboss, no heavy grunge, no random icons, no illegible micro-text.

---

## ChatGPT Images (how to run these prompts)

### Step-by-step (recommended)

1. In ChatGPT, start an image generation message.
2. Attach the reference images listed in **Reference images** above.
3. Paste one of the prompts below.
4. When you download the result, save it to the **Save as** path shown for that asset.

### Master template (copy/paste)

Replace the placeholders, then paste as one message.

> I am attaching these reference images:
> References: `gfd-logo-master.png` (full lockup); `gfd-logo-mark.png` (mark); `hero-gradient.png` (background style).
>
> Generate **one** PNG image with these requirements:
> Canvas: {WIDTH}×{HEIGHT}. Background: {TRANSPARENT or SOLID}.
> Use the attached references as ground truth for palette + geometry.
> Keep it minimal with crisp, vector-clean edges. No extra icons, no watermarks, no mockups.
> If text is required, it must match exactly: {EXACT_TEXT}.
>
> Output: PNG.

### Notes specific to ChatGPT image generation

- **Text is fragile:** if you see misspellings or letterform drift, regenerate with: “Use the exact wordmark from the reference; do not redesign the typography.”
- **Transparency:** if transparent backgrounds aren’t honored, generate on solid black and we’ll background-remove/convert afterward.
- **Variations:** if you want options, add: “Give me 3 variations that all stay on-brand; keep layout and palette consistent.”

---

## A) Logos (web-ready variants)

### A1) Clean white-on-transparent logo (for dark UI)

- Save as: [assets/brand/logo/gfd-logo-white.png](assets/brand/logo/)
- Target size: 2400×1200 PNG (transparent)
- Prompt:
  > Using the attached GFD master logo as the ground truth, recreate the full logo (icon + “Good Flippin Design” wordmark) in a **single-color white** version on a **transparent background**. Preserve proportions and spacing. Crisp edges, vector-clean look, no glow, no shadow, no gradients. Output 2400×1200.

### A2) Clean black-on-transparent logo (for light UI or print)

- Save as: [assets/brand/logo/gfd-logo-black.png](assets/brand/logo/)
- Target size: 2400×1200 PNG (transparent)
- Prompt:
  > Using the attached GFD master logo as the ground truth, recreate the full logo (icon + wordmark) in a **single-color black** version on a **transparent background**. Preserve proportions and spacing. Crisp edges, no shadow, no gradients. Output 2400×1200.

### A3) Square app icon (mark only, transparent)

- Save as: [assets/brand/logo/gfd-mark-1024.png](assets/brand/logo/)
- Target size: 1024×1024 PNG (transparent)
- Prompt:
  > Using the attached GFD logo mark as the ground truth, output the **icon mark only** (no text) centered in a 1024×1024 canvas on a transparent background. Preserve exact shape language and colors from the reference. Add generous safe padding (icon occupies ~70% of width). Crisp edges, no shadow.

### A4) Square app icon (mark only, dark background)

- Save as: [assets/brand/logo/gfd-mark-dark-1024.png](assets/brand/logo/)
- Target size: 1024×1024 PNG
- Prompt:
  > Using the attached GFD logo mark as the ground truth, place the mark centered on a solid near-black background matching the site background (very dark). Preserve colors exactly. Add safe padding. Output 1024×1024.

### A5) Wordmark-only (no icon)

- Save as: [assets/brand/logo/gfd-wordmark-white.png](assets/brand/logo/)
- Target size: 2400×600 PNG (transparent)
- Prompt:
  > Create a **wordmark-only** asset reading “Good Flippin Design” that matches the attached brand style. White text, transparent background. Clean, modern, tech-studio feel. No icon. No shadow. Output 2400×600 with generous left/right padding.

---

## B) True vector (SVG) — what to do

Image generators rarely produce valid, clean SVG. For a **real SVG**, use a vectorization workflow:

- Best starting point: [assets/brand/logo/gfd-logo-master.png](assets/brand/logo/gfd-logo-master.png)
- Goal outputs:
  - `assets/brand/logo/gfd-logo-master.svg`
  - `assets/brand/logo/gfd-logo-mark.svg`

If you use an AI “vectorize” tool, the prompt to paste is:

> Vectorize the attached logo into clean SVG paths. Preserve shapes and colors exactly. Remove raster artifacts. No gradients unless present in the original. Ensure text is converted to outlines. Output a single SVG sized to the logo bounds.

---

## C) OG / Social Cards (correct dimensions + lighter weight)

### C1) Open Graph image (website share preview)

- Save as: [assets/brand/og/og-image-1200x630.png](assets/brand/og/)
- Target size: 1200×630 PNG
- Prompt:
  > Create an Open Graph image for Good Flippin Design at 1200×630. Dark background matching the attached hero gradient vibe, subtle texture, minimal. Place the GFD logo (from reference) left-of-center. Include a short tagline beneath in muted light gray: “Data-driven web experiences”. Keep text large and highly legible. Maintain safe margins (no text within 80px of edges). No extra icons. No mockups.

### C2) Twitter/X large card

- Save as: [assets/brand/og/twitter-card-1200x675.png](assets/brand/og/)
- Target size: 1200×675 PNG
- Prompt:
  > Create a Twitter/X summary large image at 1200×675 matching the OG design: dark background, subtle gradient glow, minimal texture. Use the attached GFD logo. Add a single-line tagline: “Flippin’ good design. Real results.” Keep it clean, high-contrast, and readable. Safe margins.

### C3) GitHub repo social card (optional but useful)

- Save as: [assets/brand/og/github-social-1280x640.png](assets/brand/og/)
- Target size: 1280×640 PNG
- Prompt:
  > Create a GitHub social preview card at 1280×640 for Good Flippin Design. Dark background, subtle grid texture, minimal. Left: GFD mark + wordmark. Right: small bullets in muted gray: “Web Dev”, “Data Viz”, “BI Dashboards”. Match reference palette exactly.

---

## D) Social banners (covers)

### D1) LinkedIn cover

- Save as: [assets/brand/social/cover-linkedin-1584x396.png](assets/brand/social/)
- Target size: 1584×396 PNG
- Prompt:
  > Create a LinkedIn banner at 1584×396 for Good Flippin Design. Dark background with subtle horizontal gradient and faint data-grid texture. Place the GFD logo on the left. Add a clean services line in muted gray: “Web Development · Data Visualization · Business Intelligence”. Keep critical content centered vertically and away from edges.

### D2) X/Twitter header

- Save as: [assets/brand/social/cover-x-1500x500.png](assets/brand/social/)
- Target size: 1500×500 PNG
- Prompt:
  > Create an X/Twitter header at 1500×500 matching the reference brand style. Dark background, subtle glow accents. Place GFD mark left. Add tagline: “Good Flippin Design” with a secondary line “Fast, accessible, data-driven”. Minimal, no clutter.

---

## E) Web backgrounds (for page experience)

These are **stylistic** assets you can use as optional background images without changing layout.

### E1) Ultra-wide hero background

- Save as: [assets/brand/web/hero/hero-ultrawide-2560x1440.png](assets/brand/web/hero/)
- Target size: 2560×1440 PNG
- Prompt:
  > Create a 2560×1440 hero background image for the Good Flippin Design site. Match the attached hero gradient reference. Add very subtle abstract geometry (grid, nodes, or layered rectangles) that suggests data + design iteration. Keep contrast low so foreground text remains readable. No text, no logos, no hard edges.

### E2) Subtle section texture (tileable)

- Save as: [assets/brand/web/texture/tile-1024.png](assets/brand/web/)
- Target size: 1024×1024 PNG (tileable)
- Prompt:
  > Create a seamless, tileable 1024×1024 texture that fits the Good Flippin Design dark theme. Very subtle micro-grid + noise, extremely low contrast. No visible seams. No text.

### E3) Soft ambient gradient (for cards/sections)

- Save as: [assets/brand/web/background/ambient-1920x1080.png](assets/brand/web/)
- Target size: 1920×1080 PNG
- Prompt:
  > Create a 1920×1080 dark ambient gradient background consistent with the brand: near-black base, subtle colored glow that matches the logo palette. Smooth, minimal, no distinct shapes, no text.

---

## F) Small icon set (only if you actually plan to use icons)

If you later add/replace icons, generate a cohesive pack:

### F1) 6 minimalist service icons (SVG-style look)

- Save as: [assets/brand/web/icons/services-6.png](assets/brand/web/)
- Target size: 2048×2048 PNG sprite (transparent)
- Prompt:
  > Create a set of 6 minimalist line icons in a consistent style (thin stroke, rounded joins) for: Web Development, Accessibility, Performance, Data Visualization, Analytics/BI, Maintenance. White strokes on transparent background. Clean, modern, no fills, no shadows. Arrange as a neat 3×2 grid with equal spacing. Output 2048×2048.

---

## Output rules (so assets work on the site)

- Prefer transparent backgrounds for logos and icons.
- For OG/social, use a solid/gradient background (not transparent).
- Keep text large and legible; avoid tiny copy.
- Keep safe margins; don’t put text near edges.

---

## Quick “generate everything” checklist

Core must-haves:

- A1, A2, A3
- C1, C2
- D1
- E1

Nice-to-haves:

- C3, D2, E2, E3
