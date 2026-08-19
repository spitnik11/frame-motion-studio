# Frame Motion Studio

Local, frame-by-frame character animation studio. Takes an approved character (a **Character
Anchor**) and a **target pose**, and generates the same character in that pose using the existing
local ComfyUI + models. **Fully isolated** from Z-Image Studio — it shares model *files* only.
Deleting this folder breaks nothing in `Z:\codex app`.

## Status: MVP (Phases 0–5) ✅

Approved character + target pose → same character in a new pose, via SDXL/Illustrious + OpenPose
ControlNet. Identity = character LoRA + prompt + locked seed (IPAdapter not installed, so raw
reference-image identity is a documented later gap). Proven end-to-end: pixel-art chibi generated
from a reference pose in ~23s, zero downloads.

## Run

Prereqs: production ComfyUI on `:8188` (start it from `Z:\codex app\ComfyUI`), Node 18+.

```bash
# 1. deps (once)
npm install
cd app/frontend && npm install && npm run build && cd ../..

# 2. start the studio (serves API + built UI on :3200)
npm start
```

Open http://127.0.0.1:3200 → pick a checkpoint, save a Character Anchor, upload a pose image,
Generate, then Accept/Reject.

Dev UI with hot reload: `cd app/frontend && npm run dev` (proxies API to :3200).
Tests: `npm test`.

## Layout

```
config/         app.json (ports/comfy url) + models.local.json (generated pointer to shared stores)
server/src/     comfy.ts (ComfyGateway) · registry.ts · anchors.ts · workflow.ts · frames.ts · index.ts
app/frontend/   React (Vite) single-page UI
data/           anchors/ + outputs/{candidates,accepted}/ + poses/   (git-ignored outputs)
docs/           environment-audit.md (Phase 0)
```

## Isolation invariants

- Never modifies `Z:\codex app` source, APIs, `extra_model_paths.yaml`, or model folders.
- Shares models read-only via `config/models.local.json`; copies/moves nothing.
- Own port (3200), git repo, env, data. See `docs/environment-audit.md` §8.

## Ports

| Service | Port |
|---|---|
| Frame Motion Studio | 3200 |
| Production ComfyUI (shared) | 8188 |
| Z-Image Studio (untouched) | 3199 |
| Motion ComfyUI (future, experimental nodes) | 8189 |
