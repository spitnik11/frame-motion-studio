# Frame Motion Studio — Asset Catalog

Reference assets produced by the studio, for reuse in future art. Committed showcase copies live in
`assets/showcase/` (permanent); regenerable working assets live under `data/` (gitignored, local).

## Characters (Anchors)
| Asset | Path | Notes |
|---|---|---|
| **Aqua Witch** | `assets/showcase/anchors/character_mt0h7u97.json` | Reference chibi. Checkpoint `pixelArtDiffusionXL_spriteShaper.safetensors` (illustrious). Prompt: *pixel art, chibi anime girl, blue twintail hair, yellow sailor dress, cat ears, full body, standing, simple background, sprite*. Reuse this anchor for consistent new art. |

Live anchor store: `data/anchors/*.json`. Create more via `POST /api/anchors` or the UI.

## Finished animations
| Asset | Path | Notes |
|---|---|---|
| Idle loop (preview) | `assets/showcase/idle.gif` | 8-frame idle @8fps, consistent identity (keyframe img2img). |
| Idle sprite sheet | `assets/showcase/idle_spritesheet.png` | 4×2 RGBA transparent sheet (pre-hardening). |
| Idle — Godot pixel | `assets/showcase/godot-idle/` | Hardened: `spritesheet.png` (256×276, 1-bit alpha, shared palette), `idle.tres` (Godot 4 SpriteFrames, 8×69×128), `.import`, `sheet.json`. **Verified in Godot 4.7.2.** |

Working copies + all runs: `data/animations/<id>/` (frames, exports). Canonical idle project:
`idle_mt1sg206` (the consistent one).

## Overworld / Pokémon
| Asset | Path | Notes |
|---|---|---|
| 4-direction generation | `assets/showcase/overworld_directions_reference.png` | down✓ up✓ (real back view) left/right still front-facing — reference for the open side-profile problem. |
| Godot character set | `assets/showcase/godot-overworld/` | `spritesheet.png` (4×37×48), `character.tres` (4 animations down/up/left/right), 16-color palette. **Verified in Godot 4.7.2.** |

## Pose-map assets (committed, author-time)
| Asset | Path | Notes |
|---|---|---|
| Idle skeletons | `motion/presets/idle/pose_000..007.png` | OpenPose maps, chibi proportions, feet-fixed breathing. |
| Overworld skeletons | `motion/presets/overworld/pose_<dir>_<0..2>.png` | 4 directions × 3 walk frames; facing encoded via face keypoints. |
| Regenerate | `motion/.venv/Scripts/python motion/render_presets.py` | rewrites all preset skeletons. |

## Source model assets (shared, read-only — never copy)
Checkpoints in `Z:\codex app\checkpoints` (pixelArt + Illustrious SDXL), LoRAs in `Z:\codex app\lora`,
OpenPose ControlNet in `Z:\codex app\ComfyUI\models\controlnet`. Full inventory:
`docs/environment-audit.md`.

## External references
- **Motion videos** (pixel girls, simple loops) provided by the user → `C:\Users\losth\Downloads`
  (`*.mp4`/`*.webm`). Use as driving-video / preset-design references (roadmap M3).
- **porypal** (Gen-3 palette tool) — the concept our 8-bit `colors` option mirrors; for exact ROM
  palettes, index to its `.pal` (roadmap item).

## How to make new art (repeatable)
1. Define/reuse an anchor (checkpoint + prompt + optional compatible LoRA).
2. Pick a pose source: a preset skeleton (`motion/presets/*`) or a pose image.
3. `POST /api/frames` (single) or `POST /api/animations` + `/generate` (sequence).
4. Export: `POST /api/animations/:id/export {format:"godot-pixel", colors:16}` for game sprites.
5. New finished pieces worth keeping → copy into `assets/showcase/` and add a row here.
