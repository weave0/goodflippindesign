# Sheriff Character Animation Pipeline

## Initiative 2: Character Animation Sovereignty

**Created:** March 8, 2026
**Status:** Planning → Execution
**Blocking:** Content production, brand storytelling, marketing momentum

---

## 1. Problem Statement

The current Sheriff character assets are **not fit for controlled animation production**:

| Asset                              | Problem                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------------------- |
| `sheriff.png` / `sheriff_nobg.png` | Locked to one pose (single raised paw). Detailed shading makes body-part extraction unreliable. |
| Generated mp4                      | One-off clip. Cannot be retimed, re-posed, or composed with new audio.                          |

The root issue is **pipeline fragility**: every new motion need starts from scratch, depends on external generation tools, and produces inconsistent results.

---

## 2. Core Decision: Art Style Pivot

This is the most important choice. Everything downstream depends on it.

### Option A — Keep detailed rendered style, fight the rigging problem

- **Pros:** Polished look as-is
- **Cons:** Hard to segment body parts. Every pose variation requires regeneration. Colors shift across generations. Shading inconsistency breaks illusion of same character. High failure rate per attempt.
- **Verdict:** ❌ Not fit for production pipeline

### Option B — Redesign Sheriff as a simplified 2D production character

- **Pros:** Clean layer separation by design. Arms, head, tail, body are distinct parts. Re-poseable without AI. Deterministic output. Animates smoothly in any 2D tool.
- **Cons:** Requires a one-time redesign investment. Initial result is "flatter."
- **Verdict:** ✅ **Recommended.** This is how all sustainable character animation pipelines work (from Disney to indie game studios).

### What "simplified" means in practice

Not a downgrade — a production upgrade. Examples of the target aesthetic:

- Thick outlines, limited palette, flat fills with minimal shading
- Silhouette clearly reads at small sizes (social icons, thumbnails)
- Each limb is a **separate named layer** in the source file
- No photorealistic textures — stylized cartoon shading at most

---

## 3. Recommended Pipeline Architecture

```
PHASE 1: Redesign
  → Reference sheriff_nobg.png for character personality/design language
  → Produce new Sheriff in simplified production style
  → Deliverable: Layered PSD or Illustrator file (separate parts)

PHASE 2: Rig
  → Import parts into Spine2D (or Rive for web-first)
  → Define skeleton: body, head, l-arm, r-arm, l-leg, r-leg, tail
  → Set up mesh deformation on arms for natural arc movement

PHASE 3: Animation States
  → Idle (breathing loop)
  → Wave / greeting (current state — restore + improve)
  → Both paws up (celebration / fundraising)
  → Paw down / at rest (neutral)
  → Point (call to action)
  → Walk cycle (optional — for video sequences)

PHASE 4: Export
  → Web: Lottie JSON + Rive canvas (60fps, < 200KB)
  → Video: mp4 sequences with alpha channel (for overlay compositing)
  → Social: Pre-rendered GIF + mp4 clips per pose state
```

---

## 4. Tool Selection

### Primary Rig + Animation Tool

| Tool                 | Strength                                                                                             | Weakness                                     | Recommended Use                        |
| -------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| **Spine2D**          | Industry standard. Exports to Spine JSON, mp4, sprite sheets, Unity/Unreal. Best deformation system. | Paid ($69 essential). Slight learning curve. | ✅ Best for complex rigs, video export |
| **Rive**             | Browser-native. Interactive states. Great for web embeds. Free tier available.                       | Less control for video production.           | ✅ Best for web/interactive content    |
| **Adobe Animate**    | Already in Creative Cloud ecosystem. Exports SWF, mp4, canvas.                                       | Heavier workflow. Canvas export limited.     | OK if CC already paid                  |
| **DragonBones**      | Free. Spine-like workflow.                                                                           | Smaller community. Less polish.              | Budget fallback                        |
| **Aseprite (pixel)** | Best for pixel art. Fast loops.                                                                      | Not applicable for current Sheriff style.    | Not recommended                        |

**Decision guide:** If the primary output is **video + social clips** → Spine2D. If the primary output is **interactive web content** → Rive. Both can be used together.

### Source Asset Creation

| Task                      | Tool                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Redesign Sheriff flat art | Illustrator (vector, layer-per-part) or Procreate (raster, grouped layers)             |
| Remove backgrounds        | `sheriff_nobg.png` is already done — rebuild from scratch for simplified version       |
| Color palette lock        | Use existing AI Aimate brand palette (reference `Brand Assets Development/AI Aimate/`) |
| Export parts as PNG atlas | Illustrator > Export Selection, or Photoshop > Export Layers                           |

---

## 5. Pose State Framework

Define these poses as named animation states in the rig. Each is reusable across all future scenes.

| ID        | Name           | Description                        | Use Case                                   |
| --------- | -------------- | ---------------------------------- | ------------------------------------------ |
| `idle`    | Idle breathing | Subtle body rise, tail sway, blink | Background loops, loading states           |
| `wave`    | Single wave    | Right paw up, gentle arc           | Greetings, intro sequences                 |
| `cheer`   | Both paws up   | Arms wide up, body excited         | Wins, fundraising milestones, celebrations |
| `neutral` | Rest stance    | Arms at sides, weight balanced     | Dialog frames, text-over compositions      |
| `point`   | Direct point   | Right arm extended toward camera   | Calls to action, "sign up" prompts         |
| `nod`     | Head nod       | Affirmative head motion            | Confirmations, approvals, tutorials        |
| `walk`    | Walk cycle     | 4-beat walk loop                   | Scene transitions, intro animations        |

---

## 6. Output Format Plan

| Destination                  | Format                | Spec                                   |
| ---------------------------- | --------------------- | -------------------------------------- |
| GoodFlippinVibes.com hero    | Lottie JSON / Rive    | < 200KB, 60fps, CSS-controlled trigger |
| AI Aimate marketing          | mp4 with alpha        | 1080x1080, transparent bg              |
| Social (Twitter/X, LinkedIn) | Looping GIF or mp4    | 800x800, max 5MB                       |
| Email campaigns              | Animated GIF fallback | < 500KB                                |
| YouTube / long-form          | Full mp4 sequence     | 1920x1080 composited                   |

---

## 7. Sheriff Redesign Brief (for artist / DALL-E / Illustrator)

Use this if generating the initial flat character art:

```
Character: Sheriff — a friendly cartoon dog character, law enforcement theme.
Style: Flat 2D animation production style. Thick black outlines (4px stroke weight).
Colors: Warm tan/golden fur, dark brown ears and nose, warm red/brown sheriff badge,
        tan hat with dark band. Maximum 8 colors total.
Structure: Clearly separated body parts — round body, distinct round head,
           separate arms/paws, separate legs, tail clearly separated from body.
Pose: Neutral standing pose, arms at sides, weight centered.
      (We will rig and pose separately — do NOT animate in the source image.)
Background: Transparent / none.
Output: Layered PSD or SVG. Name each layer: body, head, l-arm, r-arm,
        l-leg, r-leg, tail, hat, badge, eyes, nose.
```

---

## 8. Phases + Milestones

### Phase 1: Source Art (Week 1)

- [ ] Produce flat Sheriff reference in simplified production style
- [ ] Confirm layer structure matches rig requirements (7+ named layers)
- [ ] Color match verification against AI Aimate brand palette
- [ ] Sign-off: silhouette readable at 64px

### Phase 2: Rig (Week 2)

- [ ] Set up Spine2D or Rive project
- [ ] Import layers, place bones, test deformation
- [ ] Verify arm rotation arc looks natural (shoulder to wrist range 160°+)
- [ ] Tail physics (spring-based or manually keyed?)

### Phase 3: Core Animation States (Week 2–3)

- [ ] `idle` loop — target ≤ 2 seconds, seamless
- [ ] `wave` state — target: 1.5 second full arc
- [ ] `cheer` state — both paws raised
- [ ] `neutral` — static hold + breathing layer
- [ ] Export test: Lottie JSON plays at 60fps in browser

### Phase 4: Production Export (Week 3)

- [ ] Export all states as mp4 with transparency
- [ ] Export web-format (Lottie/Rive)
- [ ] GIF versions for social/email
- [ ] Store masters in `E:\WEAVER 4TW\Sheriff Character\` (E: drive — intentional media storage)

---

## 9. File Organization

```
E:\WEAVER 4TW\Sheriff Character\
  source/
    sheriff-flat-v1.ai          ← Layered Illustrator source
    sheriff-flat-v1.psd         ← Photoshop version
    sheriff-parts/              ← PNG export of each layer
      body.png
      head.png
      l-arm.png
      r-arm.png
      ...
  rig/
    sheriff-spine.spine         ← Spine2D project file
    sheriff-rive.riv            ← Rive project (if web-primary)
  exports/
    mp4/                        ← Per-state mp4 with alpha
      sheriff-idle.mp4
      sheriff-wave.mp4
      sheriff-cheer.mp4
      ...
    lottie/                     ← Web-embedded JSON
      sheriff-idle.json
      sheriff-wave.json
      ...
    gif/                        ← Social/email fallbacks
    sprites/                    ← Sprite sheet atlas if needed
Z:\GFD\Brand Assets Development\AI Aimate\Sheriff\
  reference/
    sheriff.png
    sheriff_nobg.png
  production/                   ← Symlink or copy of E: exports for active dev
```

---

## 10. Success Criteria

The pipeline is complete when:

- [ ] Sheriff can be posed in 6+ intentional states without AI regeneration
- [ ] Arm motion range covers 0° (rest) → 90° (raise) → 180° (full overhead)
- [ ] New character actions take < 2 hours to produce (vs current: days or never)
- [ ] Motion can be triggered programmatically in web context
- [ ] Content production can proceed without stalling on character poses
- [ ] All source files are on E: (media drive) with production copies on Z:

---

## 11. Risks

| Risk                                                   | Likelihood | Mitigation                                                              |
| ------------------------------------------------------ | ---------- | ----------------------------------------------------------------------- |
| Redesigned flat style loses brand character            | Medium     | Validate against existing `sheriff_nobg.png` personality before rigging |
| Spine2D learning curve delays production               | Low-Medium | Use existing tutorials; rig only essential bones first                  |
| AI-generated redesign still lacks clean layers         | Medium     | Use Illustrator manual redraw if DALL-E result is unusable              |
| Export compatibility issues (Lottie on older browsers) | Low        | Provide mp4 fallback always                                             |
| E: drive fills (4TB)                                   | Very low   | Monitor via storage governance snapshot                                 |

---

## Related Files

- [STORAGE_AUDIT_2026-03-08.md](STORAGE_AUDIT_2026-03-08.md) — E: drive currently 2TB used / 1.7TB free (media storage is fine)
- [Brand Assets Development/AI Aimate/](Brand%20Assets%20Development/AI%20Aimate/) — existing AI Aimate assets
- [Brand Assets Development/MASTER_PLAN.md](Brand%20Assets%20Development/MASTER_PLAN.md) — GFD brand development context
- [scripts/storage-snapshot.ps1](scripts/storage-snapshot.ps1) — run this to verify E: drive has room before exporting
