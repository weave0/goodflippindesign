# Media Generation Pipeline Audit

**Workstream D — Charter §10.4**
**Created**: 2026-03-17
**Owner**: Brett Weaver / GFV LLC
**Governing charter**: `gfd_master_charter.md` §Workstream D

> Objective: Diagnose failure points and establish a controllable art and motion pipeline.

---

## 1. Pipeline Inventory

| Pipeline                        | Location                                                                     | Entry Points                                                     | Status                                      |
| ------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------- |
| AI Video Generation (T2V/I2V)   | `ThyOwn/`                                                                    | `video_studio.py`, `studio.py`, `studio_fast.py`, `video_cli.py` | ⚠️ Functional but fragmented                |
| Character Animation             | `ThyOwn/animate_character.py` + Sheriff scripts                              | Multiple one-off scripts                                         | ❌ Fragile — see §4                         |
| Audio / Music Generation        | `ThyOwn/audio_studio.py`, `desktop_audio_studio.py`, `generate_gfv_track.py` | `START_AUDIO_STUDIO.ps1`                                         | ✅ Live (last run: 2026-03-16)              |
| Documentary Production          | `SummitView/`                                                                | `docs/QUICKSTART.md`                                             | ✅ Production-ready                         |
| GFV Art Generation              | `ThyOwn/generate.py`, DALL-E 3                                               | `batch_generate.py` or similar                                   | ✅ Working — 216 assets in gallery manifest |
| Image → WebP / Asset Processing | `GFD/convert-to-webp.js`                                                     | `node convert-to-webp.js`                                        | ✅ Working                                  |

---

## 2. Production-Ready vs Experimental

### ✅ Production-Ready

#### SummitView Documentary Pipeline

- **What it does**: Script → DALL-E 3 images → OpenAI TTS narration → moviepy assembly → complete episode MP4
- **Cost**: $1.39/episode (verified pilot: Marshallese episode)
- **Time**: ~55 minutes/episode (30 min human + 25 min generation)
- **Pipeline entry**: `docs/QUICKSTART.md` → well-documented, stable
- **Output**: 1 pilot complete; 16 episodes ready for production totaling $23.63
- **Dependencies**: DALL-E 3 (cloud), OpenAI TTS (cloud), moviepy (local), ffmpeg
- **Risk**: API rate limits on DALL-E batch runs; mitigation: stagger requests

#### GFV Art Generation (DALL-E 3 Batch)

- **What it does**: Prompt → DALL-E 3 → WebP → gallery-assets.json manifest
- **Output**: 216 assets currently; emotion taxonomy, category tagging
- **Pipeline entry**: `generate.py` (ThyOwn) or batch script
- **Dependencies**: DALL-E 3 API key (`OPENAI_API_KEY`); no local GPU required
- **Risk**: Gallery manifest sync (manual step; see Asset Intake SOP in DEVELOPER_GUIDE.md)

#### Audio Studio

- **What it does**: Music generation, GFV track composition, desktop studio UI
- **Entry**: `START_AUDIO_STUDIO.ps1` → Gradio web UI at localhost
- **Last verified**: 2026-03-16 (recent activity)
- **Output**: `ThyOwn/output/` and `ThyOwn/audio/`
- **Dependencies**: `.venv` (5.77 GB ThyOwn/.venv), local models

---

### ⚠️ Functional But Fragmented

#### AI Video Generation (T2V / I2V)

**Entry points (too many):**
| File | Role | Verdict |
| ---- | ---- | ------- |
| `studio.py` | Primary Gradio UI | Main entry — keep |
| `studio_fast.py` | Reduced-feature fast mode | Keep for draft generation |
| `video_cli.py` | Command-line interface | Keep for scripted batch jobs |
| `video_studio.py` | Original prototype | ⛔ Superseded — retire |
| `demo_video_generation.py` | Demo script | ⛔ Retire |
| `complete_self_sufficient_demo.py` | One-off demo | ⛔ Retire |

**Models loaded:**
| Model | Size | Use |
| ----- | ---- | --- |
| `svd_xt.safetensors` | 8.90 GB | Stable Video Diffusion XT (I2V) |
| `svd_xt_image_decoder.safetensors` | 8.85 GB | SVD decoder |
| `unet/diffusion_pytorch_model.safetensors` | 5.68 GB | CogVideoX or LTX base |

**Performance**: Verified functional. Phase 2 UX Polish complete (modern design system, 10 templates, glassmorphism UI). GPU required for generation (CUDA — hence `.venv_cuda` at 5.13 GB).

---

### ❌ Fragile / Blocked

#### Character Animation (Sheriff / GFV Characters)

- **Current state**: Multiple one-off scripts (`animate_character.py`, `sheriff_animate.py`, `sheriff_animate_layers.py`, `zebra_animate.py`, etc.). Each is a separate experiment.
- **Root problem**: Source character assets are single flat PNGs — not rigged, not layered. Impossible to maintain consistency across clips.
- **Per `ANIMATION_PIPELINE.md`**: Option A (keep detailed render style) rated ❌ Not fit for production. Option B (redesign as simplified 2D production character) rated ✅ Recommended.
- **Status**: Planning phase only — redesign not started.

---

## 3. Failure Points Diagnosed

| Failure                                             | Pipeline             | Root Cause                                                          | Severity |
| --------------------------------------------------- | -------------------- | ------------------------------------------------------------------- | -------- |
| **No multi-image character consistency**            | T2V/I2V              | SVD only constrains first frame; no IP-Adapter integration          | Critical |
| **No undo/save/load/checkpointing in video studio** | T2V/I2V              | Gradio stateless; no session persistence layer                      | High     |
| **No preview-before-generate workflow**             | T2V/I2V              | Users commit to 5-min waits without seeing thumbnail                | High     |
| **Fragmented entry points**                         | T2V/I2V              | 6+ scripts; unclear canonical entry                                 | Medium   |
| **Character animation requires AI per-clip**        | Character            | Source assets are flat PNGs; no rig                                 | Critical |
| **Gallery manifest sync is manual**                 | Art gen              | No automation hook from generation → JSON update                    | Medium   |
| **OPENAI_API_KEY not in CF Pages env**              | Art gen / SummitView | Blocks DALL-E generation from admin Content Studio                  | High     |
| **venv_cuda may be redundant**                      | All                  | Two venvs (5.62 GB + 5.13 GB) for same project; unclear distinction | Low      |

---

## 4. Character Animation Strategy

> Per `ANIMATION_PIPELINE.md` — Sheriff character design decision.

### Decision: Simplified 2D Production Character (Option B)

**Rationale**: Detailed rendered PNG assets cannot be consistently animated without regenerating each frame. A production character must be:

- Layered (separate body parts as distinct layers)
- Stylized (thick outlines, flat fills, limited palette)
- Rigged (Spine2D for games/video; Rive for web embeds)

### Redesign Steps (one-time investment)

1. **Concept pass**: Redraw Sheriff in simplified production style — thick outline, flat fills, distinct limb silhouettes
   - Reference: `sheriff_nobg.png` for personality/identity
   - Target tool: Procreate, Illustrator, or Krita (free)
   - Deliverable: layered `.psd` or `.ai` with named parts: `body`, `head`, `left_arm`, `right_arm`, `tail`, `hat`

2. **Rig**: Import into **Rive** (free, web-native) for GFD/GFV web embeds
   - Rive → exports to `.riv` file → embed in HTML via Rive runtime JS (< 50KB)
   - Alternative: **Spine2D** (paid) for full 2D game-quality animation

3. **Animation library** (start minimal):
   - `idle` — subtle breathing loop
   - `talk` — mouth/hat bob for audio sync
   - `wave` — greeting animation for community portal
   - `celebrate` — badge/level-up reward animation

4. **Integration targets**:
   - Community portal: `wave` on profile card; `celebrate` on badge earn
   - GFV site: Hero section animated mascot
   - Video generation: Use rigged export as reference image for I2V consistency

### Timeline

This is a **design-first task** — no code until the redesigned art exists. Estimated 2–4 hours of design work for a production-viable simplified character.

---

## 5. Minimal Reliable Generation Path

For each content type, the recommended minimum-friction path:

| Content Need                      | Tool                                    | Steps                                           | Cost                |
| --------------------------------- | --------------------------------------- | ----------------------------------------------- | ------------------- |
| Static art (social, gallery)      | DALL-E 3 via `generate.py`              | Prompt → generate → convert-to-webp → R2 upload | ~$0.04/image        |
| Documentary episode               | SummitView pipeline                     | `docs/QUICKSTART.md` → 55 min                   | $1.39/episode       |
| Background music / GFV tracks     | Audio Studio (`START_AUDIO_STUDIO.ps1`) | Prompt → generate → `output/`                   | Local (no API cost) |
| Short video clip (social content) | `studio_fast.py`                        | Template → generate (5 min) → `output/`         | Local (GPU)         |
| GFD character animation (web)     | Rive (after redesign)                   | `.riv` → `<canvas>` embed                       | $0                  |

**What to avoid**: Running `video_studio.py` or `demo_video_generation.py` — use `studio.py` (full UI) or `studio_fast.py` (drafts) instead.

---

## 6. Asset Simplification Rules

1. **Output format**: Always WebP for images (lossless for UI; 85% quality lossy for art/portfolio)
2. **Video output**: MP4 (H.264, 1080p max for web) — no ProRes or lossless for web publishing
3. **Model weights**: Keep only `svd_xt.safetensors` active; all others archive to E: drive unless in active use
4. **Venv discipline**: Consolidate `SummitView/.venv` and `SummitView/.venv_cuda` — verify if GPU venv is required or if the main venv uses CUDA automatically
5. **Gallery manifest**: Automate sync — hook `generate.py` completion to call `node scripts/update-gallery-manifest.js` (to be written)
6. **Retire legacy scripts**: `video_studio.py`, `demo_video_generation.py`, `complete_self_sufficient_demo.py` → move to `archive/` subfolder

---

## 7. Timing & Sync-Ready Production Outputs

For video clips intended for use with audio (SummitView narration, GFV tracks):

| Parameter         | Recommended                         | Why                                    |
| ----------------- | ----------------------------------- | -------------------------------------- |
| FPS               | 24                                  | Standard narrative; matches TTS pacing |
| Duration per clip | 4–8 seconds                         | Matches one sentence of narration      |
| Resolution        | 1280×720                            | Balance quality vs generation time     |
| Aspect ratio      | 16:9                                | Social + web compatible                |
| Audio sync method | moviepy `VideoFileClip.set_audio()` | Tried in SummitView; proven reliable   |
| Transition        | `crossfadein(0.5)`                  | Smooth between AI-generated frames     |

**Known sync issue**: SVD-XT generates 25 frames regardless of duration setting — crop or pad to target duration after generation, not before.

---

## 8. Recommended Next Actions

| Priority    | Action                                             | Effort         | Blocks                                  |
| ----------- | -------------------------------------------------- | -------------- | --------------------------------------- |
| 🔴 Critical | Redesign Sheriff as simplified 2D character        | 2–4 hrs design | Character animation sovereignty         |
| 🔴 Critical | Set `OPENAI_API_KEY` in CF Pages env vars          | 5 min          | Admin Content Studio DALL-E gen         |
| 🟠 High     | Retire/archive legacy video scripts                | 30 min         | Cognitive overhead / wrong entry points |
| 🟠 High     | Add preview-before-generate to `studio.py`         | 2–4 hrs dev    | Reduces wasted generation runs          |
| 🟡 Medium   | Consolidate `.venv` and `.venv_cuda` in SummitView | 1 hr           | Reclaims 5.13 GB                        |
| 🟡 Medium   | Archive SVD-XT models to E: drive                  | 30 min         | Reclaims 17.75 GB on Z:                 |
| 🟢 Low      | Automate gallery manifest sync post-generation     | 2 hrs dev      | Reduces manual steps                    |

---

_Last updated: 2026-03-17 · Phase 1 execution_
