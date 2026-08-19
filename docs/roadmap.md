# Frame Motion Studio — Unified Roadmap

Merges the backend build spec (34 phases) with the frontend design (`frontend-design.md`, 8 UI
phases) into one **milestone-driven** plan. Milestones are vertical slices — each pairs the backend
pieces with the UI that surfaces them, so every milestone is demoable. Discipline unchanged: inspect
→ smallest working unit → test → verify Z-Image Studio (:3199) + ComfyUI (:8188) still work →
document → commit → next. Never break a working phase to reach a future one.

## Two reconciliations baked into every milestone

**A · Four architectures, no `pony`.** Z-Image Studio's `model-adapters.js` defines exactly
`illustrious`, `z-image`, `krea2`, `anima` (+ `unknown`). The UI "Model: Auto" (§24) and the adapter
layer (§22, §55) expose only these. `anima` is the 4th family (split-loader, non-trainable) —
available where it works; the design doc's adapter diagram omits it, we include it.

**B · No IPAdapter → identity is not reference-image-based (yet).** Identity = character LoRA +
prompt + locked seed. Pose = OpenPose ControlNet. `/api/diagnostics` reports
`identityReference: false`, so the capability-driven UI (§23) **hides/disables** any "use reference
image for identity" control, and **Character Compare (§16) compares the stored anchor image**, not an
identity injection. Upgrade path when desired: install IPAdapter (best for stylized/chibi identity)
or wire the already-present PhotoMaker nodes + model (SDXL, better for realistic faces). Until then,
the anchor's `references[]` are display/compare only.

## Capability map (live, drives the UI)
`pose ✓ · controlnet ✓ · depth ✓ · transparent ✓ · interpolation ✓ · video ✓ ·
identityReference ✗ (no IPAdapter)`. Frontend renders controls off these flags only.

---

## M0 — Single frame ✅ DONE (2026-08-19)
Backend Phases 0–5. Anchor + pose → same character, SDXL + OpenPose ControlNet, LoRA compatibility
gate, per-frame accept/reject. Current `App.tsx` is a throwaway 3-column proof UI — **replaced from
M1 onward** by the Stage-first shell.

## M1 — The Animation Loop  ⟵ NEXT (the real first milestone)
The design doc's First Acceptance Test (§50) = the backend spec's first production milestone. One
anchor · Idle · 8 frames · 8 FPS → generate, play, regenerate one frame, export.

| Backend | Frontend (UI phase) |
|---|---|
| **B8** Animation project format (`animations/<char>/<anim>/manifest.json`, frames dir) | **U1** Static shell: TopBar, Stage, Character/Motion drawers, PlaybackBar, FrameTimeline (mock) |
| **B13** Idle motion preset (8 pose maps, feet-fixed) | **U2** Project state: selection, playhead, play/pause, FPS, loop (frontend playback on accepted frames) |
| **B9** Frame-sequence generation (independent frames, identity-anchor rule) | **U3** Frame ops: add/remove/duplicate/reorder/accept/status |
| **B29** Animation job system (per-frame states, resume, failed frame ≠ dead job) | **U6** Wire Generate/Regenerate/job progress/failure through Motion API |
| **B14** PNG-sequence export · **B15** sprite sheet | **U8** Export dialog (PNG seq + sprite sheet first) |
| **B12** Frame alignment (feet-center) | **U4** Stage tools: zoom/pan/fit/checkerboard/**onion**/**Character Compare** |

**Identity-anchor rule (B9, hard invariant):** every frame keeps the ORIGINAL Character Anchor as
identity reference; the previous frame only supplements continuity, never replaces identity →
prevents recursive drift. State keeps `selectedFrameId`/`playheadFrameId`/`generatingFrameId`
separate. Onion skin + playback are pure frontend (never call Comfy).

**M1 done when** the §48 journey runs end to end: Choose Character → Idle → Generate 8 → play → fix
frame 4 → regenerate → accept → loop → export sprite sheet, UI responsive throughout.

## M2 — Consistency & repair
Backend **B18** frame metrics → **B19** pose verification (DWPose on the result vs requested) →
**B20** limited auto-repair (raise pose/identity/continuity conditioning, max 3 attempts → NEEDS
REVIEW, never touch neighbors). Frontend **U7** Frame Inspector: Identity/Pose-Match/Continuity
scores, attempt history, pose overlay (§17), advanced controls behind `Advanced ▾`.

## M3 — More motion, more sources
Backend **B6** PoseProvider (DWPose, deterministic pose maps in `data/poses/`) · **B13** Cheer +
Wave presets · **B25** driving-video → pose (ffmpeg extract → DWPose → sequence; identity/background
discarded — the 9 reference clips in `Downloads` are the test set). Frontend: Motion drawer preset
skeleton-preview on hover (§9, no Comfy), pose library + import image/video sources (§8).

## M4 — More backends (capability-gated)
Backend **B7** architecture-independent FrameGenerator (locks: identity/style/pose/composition) ·
**B21** Z-Image pose backend (reuse existing zImageTurbo/encoder/VAE; download a Z-Image control
adapter ONLY if genuinely absent) · **B22** Krea backend (reuse `comfyui-krea2-controlnet`) ·
**B23** second **Motion ComfyUI :8189** if experimental nodes accumulate (own venv/nodes, shared
model paths, never copy models). Frontend: "Model: Auto" resolves per anchor architecture (4
families); expert model select; controls for a backend appear only when its capability is true.

## M5 — Motion quality & richer export
Backend **B24** interpolation (RIFE present; **disabled by default for pixel art** — nearest-neighbor
/ held frames preserve deliberate frames) · **B16** transparent pipeline (frame → bg-removal via
LayerStyle/rmbg → alpha stability → alignment → export; reimplement finishing through Comfy, do NOT
call the Z-Image Photo API) · **B17** FFmpeg MediaExporter (PNG↔GIF/WebP/MP4, fps convert, scale,
loop) · **B27** pose+depth (depth is available) to cut structural drift. Frontend **U8** full export
(GIF/WebP/MP4), Smooth-Output control gated on `interpolation`.

## M6 — Agent + auto motion (later)
Backend **B28** agent API (`POST /api/animations`) · **B30** `/api/diagnostics` full capability list
· **B26** Blender pose/depth provider (optional, script/file first) · **B31** SCAIL/Wan Auto-Motion
as a SEPARATE UI mode (never merge pipelines) · **B32** Krita repair / **B33** Godot preview
(optional, never core). Frontend: agent-readable state; Auto Motion mode toggle.

---

## UI ↔ backend phase index
U1 Static Shell → M1 · U2 Project State → M1 · U3 Frame Ops → M1 · U4 Stage Tools → M1 (compare) /
M2 (pose overlay) · U5 Motion API → spans M1–M3 · U6 Comfy Generation → M1 · U7 Frame Inspector →
M2 · U8 Export → M1 (PNG/sheet) / M5 (GIF/WebP/MP4).
Backend B0–B5 ✓ · B6→M3 · B7→M4 · B8/B9→M1 · B10–B12→M1 · B13→M1(Idle)/M3(Cheer,Wave) · B14/B15→M1 ·
B16/B17→M5 · B18–B20→M2 · B21/B22/B23→M4 · B24→M5 · B25→M3 · B26/B27→M5–M6 · B28–B31→M6 ·
B32/B33→M6.

## Frontend engineering notes
Add to `app/frontend` as components under `src/` (AppShell/TopBar/Stage/StageOverlay/PlaybackBar/
CharacterDrawer/MotionDrawer/FrameTimeline/FrameInspector/ExportDialog + reusable `AssetGallery`).
DOM/CSS Stage first; Canvas only if profiling demands. Server data (AnimationProject/Anchor/Preset/
Frame/Attempt) separate from UI state (selection/playhead/zoom/pan/drawers). Dark neutral per §44 —
artwork provides the color. New Motion API routes to add alongside existing `/api/{anchors,frames,
models,loras,diagnostics}`: `/api/projects`, `/api/motions`, and a job/progress channel (poll or
SSE) for U6.

## Isolation (unchanged, all milestones)
Never modify `Z:\codex app`. Share models read-only. Own port/git/env/data. Deleting
`Z:\frame-motion-studio` must break nothing. Frames land in Comfy's `output/fms/` (namespaced) and
are copied into `data/outputs/`.
