# BrettLeeWeaver.com Port Brief

## Purpose

This folder contains a transfer-ready concept for converting brettleeweaver.com into a unified professional and artist hybrid homepage.

The design direction follows the Lowertown visual canon:

- dark cinematic background
- neon-accented display type
- clear section rhythm
- GPU-safe motion and reveal behavior
- artist-forward atmosphere with client-readable structure

## Source File

- Primary concept: `scratch/brettleeweaver-artist-hybrid/index.html`

## Positioning Goal

The homepage should read as one practice with two modes:

- professional work: strategy, systems, narrative UX, AI-enabled operating layers
- artist work: music, worlds, characters, language, visual direction, canon-building

The core argument is that each side improves the other.

## Sections To Port

1. Hero
Professional authority plus artist signal.

2. Positioning Summary
Fast scan for visitors deciding whether this is client work, artist work, or both.

3. About
Frames Brett as a builder with an artist's nervous system.

4. Professional Work
Offer language, best-fit conditions, and working style.

5. Artist Work
Creative practice, active canon, and why the artist side matters.

6. Hybrid Practice
Explicit thesis for why the split should disappear.

7. Project Constellation
Good Flippin Vibes, client systems, music/canon, and BrettLeeWeaver.com as synthesis layer.

8. Contact
Separate client path from studio/canon path.

## Content To Replace In Real Repo

- Replace provisional `mailto:brett@brettleeweaver.com` if a different inbox is preferred.
- Replace any placeholder LinkedIn or social links if those are restored.
- Decide whether Good Flippin Vibes should be referenced as the primary artist/studio bridge or whether Brett site should surface direct subpages instead.
- Decide whether the footer should remain concept-oriented or become production brand language.

## Asset Dependencies

Current concept references Lowertown scratch assets by relative path:

- `../lowertownstpaul/assets/images/Neon digital network landscape.png`
- `../lowertownstpaul/assets/images/Neon light river in cosmic night.png`
- `../lowertownstpaul/assets/images/Neon cat guardian over cyber city.png`
- `../lowertownstpaul/assets/images/Cosmic river of light and particles.png`

When porting into the real Brett repo, either:

- copy these assets into that repo, or
- replace them with Brett-specific visual assets that preserve the same tonal system

## Recommended Port Order

1. Move HTML structure and CSS tokens first.
2. Rewire all image paths to local production assets.
3. Replace placeholder links and inbox routes.
4. Tighten final copy to Brett's production voice.
5. Validate accessibility, mobile layout, and motion behavior.

## Constraint

The actual `weave0/brettleeweaver` source is not present in this workspace, so this concept could not be ported directly during this session.
