# Frame Motion Studio — 2D Studio Design & Agent Handoff

**The one doc to read before working on this project.** It states what the 2D studio is, what is
built and verified, what is left, the invariants you must not break, and where everything lives.
Newer detail always wins over older; per-topic deep-dives are linked. Last updated 2026-08-20.

- **Repo:** `Z:\frame-motion-studio` (own git, own env, port **3200**)
- **Shared inference:** production ComfyUI `:8188` (never modified) via one ComfyGateway
- **Vault:** `C:\Users\losth\Documents\ClaudeBrain\02 Projects\Frame Motion Studio\` +
  curated `00-Claude-Global-Memory\PROJECT-FrameMotionStudio.md`
- **Related:** 3D Motion Studio (`Z:\3d-motion-studio`) feeds PoseBundles in (see §10);
  Z-Image Studio (`Z:\codex app`) shares the models (never touch it).

---

## 0. Agent quick-start (read this first)
1. **Isolation is sacred** (§2). Never modify `Z:\codex app`. Deleting `Z:\frame-motion-studio`
   must break nothing.
2. **Verify services** before generating: ComfyUI `:8188` up, FMS `:8188`… run `npm start` for FMS
   (`:3200`). ComfyUI is started from `Z:\codex app\ComfyUI` (`.venv\Scripts\python.exe main.py`).
3. **Work in phases/milestones** (§5, §8): smallest working unit → test (`npm test`) → verify the
   thing renders/plays → document → commit. Don't break a working phase to reach a future one.
4. **Commit style:** author = Gabriel Pina, **no Claude co-author**, repo stays local/private.
5. **Prove visually.** Every generation claim is backed by an image or a Godot render, not a hope.
6. When you finish something durable, update the vault (§9) and this doc's status lines.

## 1. What the 2D studio is
A local, isolated app that turns an **approved character** + a **motion/pose** into **consistent,
animation-ready 2D sprites** using the shared local ComfyUI + models — then exports them
game-ready (transparent sprite sheets, Godot `SpriteFrames`, 8-bit palettes). Pixel/chibi girls
now; built to scale to more motions, more model backends, and eventually 3D-assisted and video.
UI is **Stage-first** (Procreate-Dreams hierarchy), never a ComfyUI node graph.

## 2. Isolation invariants (never violate)
- No edits to `Z:\codex app` source, APIs, `extra_model_paths.yaml`, or model folders.
- Models are **shared read-only** via `config/models.local.json`; copy/move/re-download nothing.
- Own port (3200), git, env, data. Only footprint in codex-app: generated frames land in
  `ComfyUI/output/fms/` (Comfy's normal SaveImage dir, namespaced), then copied to `data/`.
- Optional features **degrade gracefully** (a missing capability disables a control, never crashes).

## 3. Architecture
```
Stage-first React UI (app/frontend, :3200)
        │  /api/*
Motion API (server/src/index.ts)
        │
 ┌──────┼───────────────┬───────────────┬──────────────┐
 anchors  registry    animations       frames        (posebundle-importer)
 (Anchor  (4 arch,    (project/seq,     (single       (3D → pose maps)
  store)   LoRA gate)  keyframe-img2img) frame)
        │
 workflow.ts  (SDXL + OpenPose ControlNet graph builder)
        │
 comfy.ts  ComfyGateway  ──►  ComfyUI :8188  ──►  shared models
        │
 motion/  (Python venv):  render_presets.py · pixel_export.py · overworld_export.py
        │
 Export:  PNG seq · sprite sheet (ffmpeg) · godot-pixel · godot-overworld
```
The **4 real architectures** are `illustrious`, `z-image`, `krea2`, `anima` (+unknown). There is
**no `pony`**. **IPAdapter is not installed** → identity = character LoRA + prompt + locked seed
(capability `identityReference:false`).

## 4. What's built & VERIFIED
| Area | Status | Key files | How verified |
|---|---|---|---|
| Env audit (Phase 0) | ✅ | `docs/environment-audit.md` | disk-verified model/node inventory |
| Single-frame pose studio (M0) | ✅ | `frames.ts`, `workflow.ts` | anchor+pose→same character, live |
| Transparency (RGBA cutout) | ✅ | `workflow.ts` (RemBg→**InvertMask**→JoinAlpha) | 0 partial-alpha, magenta test |
| Animation loop (M1) | ✅ | `animations.ts`, `render_presets.py` | consistent 8-frame idle, GIF |
| Identity consistency | ✅ | keyframe img2img (`initImageName`/`denoise`) | all 8 frames same character |
| Stage-first UI | ✅ | `app/frontend/src/App.tsx` | hydrated against live API |
| Godot pixel-art export | ✅ | `pixel_export.py`, `docs/godot-pixel-art.md` | **rendered+played in Godot 4.7.2** |
| Godot verify harness | ✅ | `motion/godot-verify/` | headless import + GPU render |
| Overworld direction (partial) | 🟡 | `overworld_export.py`, `docs/pokemon-overworld.md` | 4-dir SpriteFrames plays; **front+back gen real, sides front-facing** |
| 8-bit / Gen-3 palette-lock | ✅ | `pixel_export.py`/`overworld_export.py` `colors` | exact 16 colors |
| 3D PoseBundle import | ✅ | `posebundle-importer.ts` (parallel session) | its own tests |

**Verified generation facts:** front + back turnarounds are reliable (back via `promptSuffix`);
**true side profiles are the open problem** (fix: mirror one side via Godot `flip_h`, a side/
turnaround LoRA, or a reference charset via ControlNet).

## 5. File map
```
config/            app.json (ports, comfy url, controlnet, pythonPath) · models.local.json (shared paths)
server/src/
  index.ts         Express app + all routes (§6)
  config.ts        loads config, resolves paths, ensures data dirs
  comfy.ts         ComfyGateway (health, objectInfo/capabilities, upload, queue, wait, fetch)
  registry.ts      4-arch inference (metadata-first LoRA), compatibility gate
  anchors.ts       Character Anchor CRUD (data/anchors/*.json)
  workflow.ts      SDXL+OpenPose graph: LoRA, controlnet, transparency, img2img keyframe, promptSuffix
  frames.ts        single frame gen + accept/reject
  animations.ts    project/sequence gen, keyframe-init consistency, export (png/sheet/godot-pixel)
  posebundle-importer.ts   import 3D Motion Studio PoseBundles as pose maps
  *.test.ts        node:test units (npm test)
motion/            (Python; isolated venv motion/.venv = Pillow+numpy)
  render_presets.py   author-time OpenPose skeleton assets (idle 8f; overworld 4dir×3f)
  pixel_export.py     harden frames → 1-bit alpha, shared palette, uniform cells; Godot .tres/.import
  overworld_export.py pack directional frames → Godot 4-anim SpriteFrames + 8-bit palette
  presets/            committed pose-map assets (idle/, overworld/)
  godot-verify/       reproducible Godot import+render test scripts
app/frontend/      React (Vite) Stage-first UI
data/              (gitignored) anchors/ · animations/<id>/{manifest,frames,exports} · outputs/
assets/showcase/   (committed) finished reference assets for future art (§7, docs/ASSET-CATALOG.md)
docs/              this file + environment-audit, roadmap, frontend-design, godot-pixel-art, pokemon-overworld
```

## 6. API reference (port 3200)
| Method + path | Purpose |
|---|---|
| `GET /api/diagnostics` | studio + comfy health + capability map (pose/controlnet/depth/identityReference/transparent/interpolation/video) |
| `GET /api/models` · `GET /api/loras` | checkpoints+controlnets · loras (resolved architecture) |
| `GET/POST /api/anchors` · `GET /api/anchors/:id` | Character Anchor CRUD |
| `POST /api/frames` | `{anchorId, pose:<dataurl>, opts}` → one frame. opts: `seed,steps,cfg,sampler,scheduler,width,height,controlStrength,transparent,poseIsMap,initImageName,denoise,promptSuffix` |
| `POST /api/frames/:id/accept|reject` | per-frame review |
| `GET /api/presets` · `GET/POST /api/animations` · `GET /api/animations/:id` | presets · animation projects |
| `POST /api/animations/:id/generate` | fire-and-forget generate-all (poll GET :id) |
| `POST /api/animations/:id/frames/:index/generate` | regen one frame `{seed?,denoise?}` |
| `POST /api/animations/:id/frames/:index/accept` | accept |
| `POST /api/animations/:id/export` | `{format: "png-sequence"|"sprite-sheet"|"godot-pixel", cols?, cellHeight?, colors?}` |

## 7. Asset catalog (for future art)
Full catalog: **`docs/ASSET-CATALOG.md`**. Committed showcase assets under `assets/showcase/`:
- `anchors/character_mt0h7u97.json` — "Aqua Witch" (pixelArtDiffusionXL_spriteShaper, illustrious):
  the reference character — reuse its prompt for consistent art.
- `idle.gif`, `idle_spritesheet.png` — the consistent 8-frame idle (M1 result).
- `godot-idle/` — Godot-ready hardened idle sheet + `idle.tres` (verified in Godot).
- `godot-overworld/` — Godot 4-direction character set + `character.tres` (16-color).
- `overworld_directions_reference.png` — the 4-direction generation (down✓ up✓ sides front-facing).

Live (regenerable) assets stay under `data/` (gitignored): anchors, `animations/<id>/frames`,
`exports/`. Pose-map source assets are committed under `motion/presets/`. Reference **motion
videos** the user provided (pixel girls, simple loops) live in `C:\Users\losth\Downloads` — use as
driving-video / preset design references (roadmap M3).

## 8. What's LEFT (roadmap)
Milestone plan lives in `docs/roadmap.md` (M0–M6). Open items right now, highest-value first:
1. **Overworld sides + walk** — solve side profiles (mirror `flip_h` / side LoRA / reference), then
   generate the authored 3-frame walk per direction (12 frames) → a fully walking 4-dir character.
   Add a one-click `POST /api/overworld` endpoint (runs directional gen + `overworld_export`).
2. **Exact Gen-3 palette** — index to a supplied porypal `.pal` (fixed palette) in `shared_palette()`.
3. **Staging demo (Godot)** — sample scene: `TileMap` grass field + `ParallaxBackground` mountains +
   the character walking (proves the whole picture; ref images map in `docs/pokemon-overworld.md §1`).
4. **M2 — consistency QA + auto-repair** — DWPose the result vs requested skeleton → pose score;
   identity/continuity scores; bounded auto-retry (max 3, never touch neighbors); Frame Inspector UI.
5. **M3 — more motion/sources** — cheer/wave presets; driving-video → pose (ffmpeg→DWPose).
6. **Stage tools (UI)** — zoom/pan/onion-skin/Character-Compare/pose-overlay (laid out, not wired).
7. **M4+** — Z-Image/Krea backends (capability-gated), interpolation (pixel: off by default),
   richer export (GIF/WebP/MP4), Blender/Krita/Godot-preview, isometric (8-dir) & side-scroll modes.

## 9. Vault (kept in sync)
- Formal: `02 Projects\Frame Motion Studio\PROJECT.md` (overview + decisions), `STATUS.md`
  (resume-here), and this handoff is the canonical technical source.
- Curated memory: `00-Claude-Global-Memory\PROJECT-FrameMotionStudio.md`, `PROJECT-INDEX.md` row,
  `MEMORY.md` line. Update these when something durable changes.

## 10. Gotchas & durable lessons (don't relearn the hard way)
- **RemBgUltra mask is inverted** (bg-white/subject-black) → without `InvertMask` the *character*
  goes transparent. (transparency)
- **Realistic-proportioned skeletons fight the chibi prompt** → identity drift even at fixed seed.
  Author **chibi-proportioned** pose skeletons.
- **Consistency = fixed seed + img2img keyframe init** (frame 0 → latent for all others, denoise
  ~0.55). Non-recursive, no drift. Do NOT chain frame→frame (that drifts).
- **Turnarounds need directional PROMPTS** (`promptSuffix`), not just pose facing — and even then
  **sides resist**; back works.
- **4 architectures, no pony. No IPAdapter** (identity = LoRA+prompt+seed).
- **Motion presets are static pre-rendered assets** (no runtime Python for poses); the `motion/.venv`
  is only for export hardening (Pillow+numpy).
- **Godot pixel-art:** default_texture_filter=Nearest, snap_2d_transforms_to_pixel, integer stretch;
  our `.import` sets fix_alpha_border. Godot at `C:\Users\losth\Desktop\godot\Godot_v4.7.2-stable_win64_console.exe`.

## 11. Related docs
`environment-audit.md` · `roadmap.md` · `frontend-design.md` · `godot-pixel-art.md` ·
`pokemon-overworld.md` · `ASSET-CATALOG.md` · `FRAME-MOTION-AGENT.md` (short agent brief).
