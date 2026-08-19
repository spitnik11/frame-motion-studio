# Frame Motion Studio — Environment Audit (Phase 0)

**Date:** 2026-08-19
**Author:** Phase 0 discovery pass
**Rule for this phase:** inspect only. Nothing was installed, downloaded, moved, or modified.

This document is the source of truth for what Motion Studio may **reuse**, what is **missing**,
and what must **not be touched**. Later phases read this before acting.

---

## 1. Machine

| Item | Value |
|---|---|
| GPU | NVIDIA GeForce RTX 5070 (Blackwell, 12 GB VRAM) |
| CUDA (torch build) | 13.0 |
| PyTorch | 2.13.0+cu130 |
| Python (ComfyUI venv) | 3.13.3 |
| ComfyUI version | 0.28.0 |
| OS | Windows 11 Pro |

> The torch/CUDA build is bleeding-edge for a Blackwell card and **works**. Do not "fix",
> upgrade, or reinstall it. VRAM ceiling is 12 GB — SDXL + one ControlNet + one LoRA fits;
> stacking multiple ControlNets or video diffusion will be tight.

---

## 2. Existing systems (do NOT modify)

| System | Location | Port | Status at audit |
|---|---|---|---|
| Z-Image Studio (repo) | `Z:\codex app` | 3199 | offline during audit |
| Production ComfyUI | `Z:\codex app\ComfyUI` | 8188 | offline during audit |

Both were down when probed (connection refused). Discovery was done from the **filesystem and
compiled source**, which is authoritative and does not require the services running. Re-probe the
live APIs (`/system_stats`, `/object_info`, `/api/diagnostics`) once they are up to confirm the
node list, but the model inventory below is disk-verified.

**Isolation invariant:** deleting `Z:\frame-motion-studio` must never break anything above.
Motion Studio references models and (optionally) calls ComfyUI; it owns no part of `Z:\codex app`.

---

## 3. Model storage — shared, referenced, never copied

ComfyUI resolves models through `Z:\codex app\ComfyUI\extra_model_paths.yaml`:

```yaml
z_image_studio:
  base_path: Z:/codex app
  diffusion_models: .          # loose *.safetensors at repo root
  text_encoders: .
  vae: .
  loras: lora
  checkpoints: checkpoints
  upscale_models: upscale_models
z_image_studio_video:
  base_path: Z:/codex app/video-models
  ...
```

Two consequences:
- Root-level loose safetensors (`zImageTurbo_turbo`, `krea2Turbo...`, `anima_baseV10`, `qwen_*`
  encoders, `flux1AE`, `qwen_image_vae`) act as diffusion_models **and** text_encoders **and** vae
  simultaneously — this is the "split" loader layout for Z-Image / Krea2 / Anima.
- SDXL-family checkpoints live in `Z:/codex app/checkpoints` — single-file "checkpoint" loader.

**Motion Studio strategy:** point a generated `config/models.local.yaml` (or a second ComfyUI's own
`extra_model_paths.yaml`) at these exact directories. **Never** copy or reorganize them.

### 3.1 Checkpoints — `Z:\codex app\checkpoints` (SDXL / Illustrious family, 6.46 GB each)

| File | Note |
|---|---|
| `pixelArtDiffusionXL_spriteShaper.safetensors` | **pixel-art / sprite checkpoint — the primary MVP model** |
| `waiIllustriousSDXL_v110.safetensors` | Illustrious |
| `prefectIllustriousXL_v10.safetensors` | Illustrious |
| `illustriousnxtXLBy_v20.safetensors` | Illustrious |
| `illustriousRealismBy_v10VAE.safetensors` | Illustrious (baked VAE) |
| `autismmixSDXL_autismmixConfetti.safetensors` | SDXL/Pony-lineage |

### 3.2 Root diffusion models / encoders (split-loader families)

`zImageTurbo_turbo`, `krea2TurboINT8...`, `anima_baseV10`, `waiANIMA_v10Base10`, `hyphoria_v001`,
`galenaCAT...animaV1`, plus encoders/vae: `qwen3_4b`, `qwen3vl_4b_fp8_scaled`, `qwen_3_06b_base`,
`qwen_image_vae`, `flux1AE_v10`.

### 3.3 LoRAs — `Z:\codex app\lora`

~60 files. Names carry the architecture tag (`illustrious`/`IL`/`ixl`, `krea2`, `anima`, `Zimage`).
Pixel-relevant: `ArsMJStyleSDXL_-_Pixel_Art.safetensors`. **Do not maintain a competing catalog** —
derive metadata from the Studio's registry (§5) and each file's embedded safetensors `__metadata__`.

### 3.4 ControlNet — `Z:\codex app\ComfyUI\models\controlnet` ✅ **MVP-critical, present**

| File | Size | Use |
|---|---|---|
| `controlnet-openpose-sdxl-1.0.safetensors` | 2.39 GB | **pose conditioning for Illustrious/SDXL MVP** |
| `controlnet-canny-sdxl-1.0.safetensors` | 2.39 GB | edge conditioning (silhouette/composition lock) |

### 3.5 Upscale — `Z:\codex app\upscale_models`
`4x-UltraSharp.pth`, `RealESRGAN_x4plus_anime_6B.pth`, `remacri_original.safetensors`.

### 3.6 Finishing / detection
- Background removal: `ComfyUI\models\rmbg\model.pth` (168 MB) — for transparent sprites.
- Face detect: `ComfyUI\models\ultralytics\face_yolov8m.pt` — usable for identity/face QA.
- Aux preprocessor cache: `custom_nodes\comfyui_controlnet_aux\ckpts\` has `lllyasviel` +
  `depth-anything` already downloaded (OpenPose/DWPose/depth preprocessors will run offline).

---

## 4. Installed custom nodes (`Z:\codex app\ComfyUI\custom_nodes`)

The set is unusually well-suited to this project — most phases need **no new nodes**.

| Node pack | Enables | Phase(s) covered |
|---|---|---|
| `comfyui_controlnet_aux` | DWPose / OpenPose / depth preprocessors | 6 (pose), 19 (pose QA), 27 (depth) |
| `comfyui-krea2-controlnet` | Krea 2 pose/control | 22 |
| `comfyui-krea2edit` | Krea 2 image edit | 22 (experimental) |
| `ComfyUI-Frame-Interpolation` | RIFE / FILM interpolation | 24 |
| `ComfyUI-VideoHelperSuite` | video load/save, frame I/O | 17, 25, 31 |
| `ComfyUI_LayerStyle` + `_Advance` | alpha / background removal / matting | 16 (transparency) |
| `comfyui-impact-pack` + `subpack` | detection, segmentation, detailer | 18–20 (QA/repair) |
| `ComfyUI-GGUF` | quantized model loading | (memory headroom) |
| `ComfyUI-MultiGPU` | offload / device placement | (memory headroom) |

Native ComfyUI 0.28 already covers ControlNet apply, KSampler, VAE, LoRA loading, image save.

---

## 5. Z-Image Studio registry & rules to mirror (read-only)

Source: `Z:\codex app\server\dist\*.js` (compiled). **Do not import at runtime** — derive/copy
generatively so there is one catalog, not two hand-maintained ones.

### 5.1 Architecture families — the invariant

`model-adapters.js` defines exactly **four** image architectures (plus `unknown`):

| id | display | loader | sampler defaults | referenceModes |
|---|---|---|---|---|
| `illustrious` | Illustrious XL | `checkpoint` | 28 steps, cfg 4, dpmpp_sde/karras | pose, direct, face |
| `z-image` | Z-Image Turbo | `split` | 8 steps, cfg 1, res_multistep/simple | pose, direct, face |
| `krea2` | Krea 2 Turbo | `split` | 8 steps, cfg 1, euler/simple | pose, direct, face |
| `anima` | Anima | `split` | 30 steps, cfg 4, euler/simple | pose, direct, face |

> **Discrepancy vs. the build spec:** the spec lists 7 architectures incl. `pony`. The real system
> has **no `pony` adapter** — Pony-lineage SDXL files resolve as SDXL/`illustrious` or `unknown`.
> Motion Studio must mirror the **real four**, not invent `pony`. Every adapter already exposes a
> **`pose`** reference mode — that is the conditioning path the FrameGenerator reuses conceptually.

### 5.2 LoRA compatibility rule (must not weaken)

`lora-registry.js#inferLoraArchitecture`: classify from embedded safetensors `__metadata__` **first**,
filename **second**; accepts spelling variants (`krea2`/`krea_2`/`krea 2`, `z-image`/`zimage`,
`illustrious`/`noobai`/`ixl`, `anima`). Comment: *"Never invent architecture from vague product
marketing alone."* **A LoRA may only load on a model of the same architecture.** Motion Studio's
compatibility check enforces this before any frame is queued.

### 5.3 Reusable Studio concepts (reference, don't couple)
`comfy.js` (Comfy client), `layerstyle-postprocess.js` (alpha finishing — reimplement, don't call
the Photo API), `character-profiles.js` / `character-presets.js` (prior art for Character Anchor),
`diagnostics.js` (capability-report pattern for Motion Studio's own `/api/diagnostics`).

---

## 6. MVP readiness verdict

**The first milestone — approved character + target pose → same character, new pose — is buildable
today with ZERO downloads:**

- Model: `pixelArtDiffusionXL_spriteShaper` (or a `waiIllustrious` checkpoint) — present.
- Pose control: `controlnet-openpose-sdxl-1.0` — present.
- Pose preprocessing: DWPose/OpenPose via `comfyui_controlnet_aux` — installed, weights cached.
- Character LoRAs: several Illustrious LoRAs in `Z:\codex app\lora` — present.
- Transparency: `rmbg/model.pth` + LayerStyle — present.
- Interpolation (later): Frame-Interpolation node — present.

## 7. What is missing / to decide (do not act in Phase 0)

| Gap | Impact | When |
|---|---|---|
| No **Z-Image ControlNet / control adapter** on disk | Phase 21 (Z-Image pose backend) needs one | download only if genuinely absent when Phase 21 starts |
| `frame_interpolation` model dir empty (RIFE weights) | RIFE weights auto-download on first use | Phase 24 |
| Second **Motion ComfyUI :8189** not created | needed only if experimental nodes threaten prod | Phase 22/23, isolated instance |
| Live `/object_info` node list unconfirmed | node inventory above is disk-derived | re-probe when :8188 is up |
| No pony adapter (spec assumed one) | mirror the real 4 families | Phase 3 registry |

## 8. Must-not-touch list

- `Z:\codex app\**` source files, APIs (`/api/generate|models|loras|diagnostics`), and behavior.
- `extra_model_paths.yaml` and all existing model folders (no moving/renaming/reorg).
- Production ComfyUI at `:8188`, its venv, torch/CUDA, and installed custom nodes.
- Existing model files (no re-download of anything listed in §3).

## 9. Next step (Phase 1, on approval)

Scaffold `Z:\frame-motion-studio` as an independent repo (own git, port **3200**, own env/db/config),
generate `config/models.local.yaml` pointing at the paths in §3, and stand up the ComfyGateway
(Phase 2) against `COMFY_URL=http://127.0.0.1:8188`. No installs; reuse everything in §3–§4.
