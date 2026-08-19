# Frame Motion Studio — Agent Guide

Read this before driving Motion Studio. It is the source of truth for what exists and the rules
you must not break. (Grows as phases land; today it covers the MVP, Phases 0–5.)

## What it is
Turns an **approved character** + a **target pose** into the same character in that pose, using the
shared local ComfyUI (`:8188`) and existing models. Separate from Z-Image Studio; shares model
files only.

## Hard invariants (never violate)
1. Do not modify `Z:\codex app` — no source, APIs (`/api/generate|models|loras|diagnostics`),
   `extra_model_paths.yaml`, or model folders. No moving/copying/re-downloading models.
2. A LoRA may only load on a checkpoint of the **same architecture** (`illustrious`, `z-image`,
   `krea2`, `anima`). The `/api/frames` call refuses cross-architecture LoRAs. There is no `pony`
   family — SDXL-lineage checkpoints resolve as `illustrious`.
3. Every generated frame keeps the original Character Anchor as identity reference (previous frames
   only supplement, never replace — prevents identity drift). [enforced from the sequence phases on]
4. Optional features degrade gracefully; a missing capability disables a feature, never crashes.

## HTTP API (port 3200)
| Method + path | Purpose |
|---|---|
| `GET /api/diagnostics` | studio + comfy health + capability map (pose/controlnet/interpolation/transparent/video) |
| `GET /api/models` | checkpoints (with architecture) + controlnets |
| `GET /api/loras` | loras with resolved architecture (metadata-first) |
| `GET /api/anchors` · `GET /api/anchors/:id` · `POST /api/anchors` | Character Anchor CRUD |
| `POST /api/frames` | `{anchorId, pose: <data-url>, opts?}` → generates one candidate frame |
| `POST /api/frames/:id/accept` · `POST /api/frames/:id/reject` | per-frame review (independent) |

`opts`: `{ seed?, steps?, cfg?, sampler?, scheduler?, width?, height?, controlStrength? }`.

## Character Anchor
```json
{ "id","name","architecture","checkpoint","characterLora","styleLora",
  "basePrompt","negativePrompt","identityStrength","styleStrength" }
```
Stored as JSON in `data/anchors/`. Source images are never modified.

## How a frame is built
`CheckpointLoaderSimple → [LoraLoader ×0–2] → CLIPTextEncode(pos/neg)` and
`LoadImage(pose) → OpenposePreprocessor → ControlNetLoader(openpose-sdxl) → ControlNetApplyAdvanced`
join at `KSampler → VAEDecode → SaveImage`. Identity = LoRA + prompt + seed; pose = OpenPose control.

## Capabilities present (live via `/api/diagnostics`)
`pose ✓ · controlnet ✓ · depth ✓ · transparent ✓ · interpolation ✓ · video ✓ ·
identityReference ✗`. The UI renders controls off these flags, never off node names.
`identityReference` is false: IPAdapter is not installed (PhotoMaker nodes exist but unwired), so
identity = character LoRA + prompt + seed. Missing: Z-Image ControlNet, IPAdapter. See
`docs/environment-audit.md`.

## Frontend
Stage-first animation viewer (Procreate Dreams hierarchy), NOT a generation form and NOT ComfyUI —
spec in `docs/frontend-design.md`. The current `app/frontend` (3-column form) is the throwaway M0
proof UI, replaced from M1 by the shell (AppShell/TopBar/Stage/drawers/timeline/inspector).

## Plan
`docs/roadmap.md` is the unified milestone plan (34 backend phases + 8 UI phases). M0 (single frame)
done; **M1 (the animation loop: 8-frame Idle, timeline, playback, regenerate, PNG+sprite-sheet) is
next.** Milestones M2–M6 cover consistency/repair, more motions+sources, more backends, motion
quality+export, agent+auto-motion.
