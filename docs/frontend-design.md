# Frame Motion Studio — Frontend Study & Implementation Design

> Source of truth for the UI. The interface is a **Stage-first animation viewer** (Procreate
> Dreams hierarchy), NOT an AI generation form and NOT ComfyUI. Reconciled with the two build
> realities in `docs/roadmap.md`: (A) only 4 architectures exist — no `pony`; (B) IPAdapter is
> absent, so identity = character LoRA + prompt + seed and `identityReference` is capability-false.

## 1. Design decision
Custom desktop-first React interface inspired primarily by **Procreate Dreams**. No node graphs in
normal use. Primary hierarchy: **Large Stage/Preview → Playback controls → Visual frame timeline.**
Secondary functionality lives in collapsible galleries and inspectors. References: Procreate Dreams
(primary visual — Stage-first, bottom timeline), Callipeg (frame thumbnails, scrubbing, onion skin),
Wick Editor (browser-editor architecture, timeline/selection/playhead state, serialization — study
patterns only; GPL-3.0, do not copy source). Do not clone any of them.

## 2–3. Why Procreate Dreams / philosophy
Most screen space belongs to the image. Feel like "an animation viewer that happens to have
powerful AI generation," not "a generation form that happens to produce animation."
Hierarchy: **IMAGE FIRST → ANIMATION SECOND → GENERATION THIRD → TECHNICAL SETTINGS LAST.**
The normal interface never shows Comfy nodes, ControlNet/sampler/LoRA names, model paths, workflow
JSON, or logs — those live behind **Advanced / Diagnostics / Frame Inspector**. Use creative terms:
Character, Motion, Pose, Identity, Style, Frames, Loop, Generate, Repair, Export.

## 4. Main workspace
```
┌ TopBar: Frame Motion  ·  Witch 01  ·  Idle ▾  ·  ● Ready  ·  Export ┐
│ CHARACTER │              MAIN STAGE               │   MOTION   │
│ [cards]   │        (65–80% of workspace)          │  [presets] │
├───────────┴───────────────────────────────────────┴────────────┤
│  ⏮  ▶  ⏭    8 FPS   Loop ✓   Onion ✓                          │
├─────────────────────────────────────────────────────────────────┤
│ [+] [01✓][02✓][03✓][04!][05✓][06⟳][07✓][08✓]  FRAME TIMELINE  │
└─────────────────────────────────────────────────────────────────┘
```
Both side galleries collapse to a 48–56px icon rail. Collapsed = focused animation mode
(Stage / Playback / Timeline only).

## 5–6. Stage
Main surface: display selected frame, play, zoom, pan, fit, transparency, onion skin, pose overlay,
compare with anchor, show generation progress. Interactions: wheel=zoom, Space+drag=pan,
dbl-click=fit, `F`=focus mode, hold `C`=compare anchor, hold `P`=pose overlay, `O`=onion toggle,
Space=play/pause. No permanent toolbars — small floating control strip only when needed.
Backgrounds: dark neutral / light neutral / checkerboard (auto-useful for transparent). App chrome
stays dark/neutral so artwork dominates. No gradients/glass/neon/dashboard widgets.

## 7. Character gallery (left drawer = Character Anchors)
Visual thumbnail cards, not a `<select>`. Selecting a card loads its anchor (reference images,
architecture, checkpoint, character LoRA, style/identity settings, base prompt) — but those values
appear only in the Character Inspector, not on the card. `+ New` card to create.

## 8–9. Motion gallery (right drawer)
Sections: **Motion Presets** (Idle/Cheer/Wave), **Poses** (saved/imported), **Sources** (import
image, import driving video, future Blender). Preset cards eventually preview their **pose skeleton
sequence** as lightweight frontend animation on hover — never invoke ComfyUI to preview a preset.

## 10–11. Bottom timeline
Thumbnail frames with number + status + optional pose marker. AI-specific statuses (symbols, not
color alone, with tooltips): `✓` accepted · `!` review · `⟳` generating · `×` failed · `•` selected
· `○` not generated.

## 12–14. Timeline interaction, playhead, playback
Click=select, dbl-click=inspector, drag=reorder, right-click=frame menu (Generate, Regenerate,
Accept, Reject, Duplicate, Replace Pose, Open Inspector, Delete — Delete needs Undo or confirm),
shift-click=range. Visible playhead. **Keep `selectedFrameId`, `playheadFrameId`,
`generatingFrameId` independent in state.** Playback bar: `|< < ▶/❚❚ > >|  FPS  Loop  Onion`.
Default 8 FPS, Loop ON. **Playback runs entirely in the frontend on accepted frame images — never
contacts ComfyUI.**

## 15–17. Onion skin / Character Compare / Pose overlay
Onion (MVP): previous 25%, current 100%, next 15%, single frame each direction, ON/OFF (advanced
opacities/counts later). **Character Compare** (hold `C` or button): Stage swaps current frame →
Character Anchor image → back on release; the single most useful AI-specific inspection. **Pose
overlay** (hold `P`): overlay requested pose map; modes Pose / Frame / Blend. Both make identity
drift and pose adherence inspectable without opening ComfyUI.

## 18–19. Frame Inspector (drawer, not permanent)
Opens on dbl-click / button / shortcut. Shows: status, pose (preset+frame), Identity/Pose-Match/
Continuity scores, attempt count; actions Accept / Regenerate / Change Pose. **Advanced ▾** reveals
architecture, checkpoint, references, provider, identity/pose/style/composition strengths, seed,
prompt, negative, LoRAs, generation history — for debugging/expert use only.

## 20–21. Generation action & progress
One context-aware **GENERATE** button: no frames → "Generate Animation"; empty frame → "Generate
Frame"; generated frame → "Regenerate". Backend decides the workflow. Progress shows **on the
frame** (e.g. `05  63% ⟳`) plus a top-bar "Generating 5/8" — never a modal that covers the Stage.
Rest of the app stays usable.

## 22–24. Comfy integration philosophy / capability-driven UI / model abstraction
Flow: Frontend → Motion API → FrameGenerator → Architecture Adapter → Workflow Builder →
ComfyGateway → ComfyUI. **Frontend never contains Comfy node IDs** — gate on capabilities:
`if (capabilities.transparent)`, never `if (node310)`. Diagnostics returns a capability map
(`pose`, `controlnet`, `depth`, `identityReference`, `transparent`, `interpolation`, `video`);
render only supported controls, hide/disable the rest. Model selector defaults to **Auto** — the
anchor's architecture picks a compatible model; expert mode may expose selection. **Never present
incompatible models/LoRAs.**

## 25–32. Component & state architecture
```
<AppShell>
  <TopBar/>
  <Workspace>
    <CharacterDrawer/>
    <StageArea> <Stage/> <StageOverlay/> <PlaybackBar/> </StageArea>
    <MotionDrawer/>
  </Workspace>
  <FrameTimeline/> <FrameInspector/> <ExportDialog/>
</AppShell>
```
Stage knows nothing about workflows. FrameTimeline knows nothing about generation. Reusable
`<AssetGallery type items selected thumbnail search filter />` for Character/Motion/Pose/Style.
Server-backed data: AnimationProject, CharacterAnchor, MotionPreset, Frame, FrameAttempt. Frontend
UI state: selectedFrameId, playheadFrameId, isPlaying, zoom, pan, drawer/inspector open flags,
onionSkinEnabled, poseOverlayEnabled, compareAnchor. Do not persist zoom/pan in the project manifest.

### Frame object
```ts
interface AnimationFrame {
  id: string; index: number; poseId?: string; image?: string; thumbnail?: string;
  status: "empty"|"queued"|"generating"|"review"|"accepted"|"failed";
  scores?: { identity?: number; pose?: number; continuity?: number };
  attemptCount: number;
}
```

## 29–34. Rendering & density
Start with DOM/CSS `<img>` for the Stage (image/zoom/pan/opacity overlays); adopt Canvas/PixiJS/
Konva only if profiling demands. Normal React timeline for 8–30 frames; virtualize only if projects
reach hundreds of frames. Desktop allocation: TopBar 48–56px, side galleries 180–240px (collapsed
48–56px), PlaybackBar 40–48px, Timeline 110–160px, Stage = everything else. Timeline thumbs
80–120px; selected = strong outline; accepted = small check; don't cover thumbs with labels.

## 35–36. Focus mode & keyboard
`F` hides galleries + secondary top controls + inspector, keeps Stage/Playback/Timeline. Keys:
Space play/pause · ←/→ prev/next frame · hold `C` compare anchor · hold `P` pose overlay · `O` onion
· `F` focus · `G` generate · `R` regenerate · Enter accept · Delete delete/reject (context). Show
shortcuts in tooltips.

## 37–38. Export (top-right, on demand)
Formats: PNG Sequence, Sprite Sheet, GIF, WebP, MP4 — options depend on chosen format. Sprite sheet:
layout (auto grid), columns, padding, anchor (Feet Center), background (transparent). Kept outside
the main timeline UI.

## 39. Small windows
Desktop-first. Narrow: galleries → drawers, inspector → overlay, timeline horizontally scrollable,
Stage stays central. Do not compromise desktop layout for mobile editing.

## 40. Explicitly NOT in MVP
No paint engine, brushes, vector tools, audio tracks, curve editor, node graph, 3D editor, layer
stack, dope sheet, lip-sync, effects timeline, text animation, video compositing, complex
transitions. Frame Motion exists to **generate, review, sequence, repair, preview, export**
character animation frames.

## 41–43. What to study (patterns only)
Procreate Dreams: Stage, Timeline, Flipbook, Playhead, content-over-interface (not Perform mode,
multitrack, painting, gestures, keyframe engine). Callipeg: timeline sheets, thumbnail visibility,
scrubbing, onion skin, prev/next relationships (not its layer-heavy traditional UI). Wick: browser
editor state, timeline/selection/playhead/serialization/undo concepts — **do not copy GPL source**,
implement equivalents independently.

## 44. Visual direction
Dark neutral interface, large uncluttered canvas, medium-radius controls, subtle panel borders,
clear typography, image-driven galleries, minimal accent color. Avoid AI-purple gradients, glowing
cards, huge dashboard headers, analytics cards, excessive pills, glassmorphism, constant animated UI.
**The artwork provides the color; the application recedes behind it.**

## 45–47. Navigation, status, empty state
Shallow top nav: Project · Character · Motion · View; right side: Comfy status · Export. Status
`● Ready` opens a small panel (Motion Studio / ComfyUI connected, architecture, queue) — hide raw
URLs unless Diagnostics is open. Empty state teaches the path: **Add a Character → Choose a Motion →
Ready to Generate (8 frames · 8 FPS)**.

## 48. MVP user journey
Open → Choose Character → Choose Idle → Generate → frames populate timeline → Play → Frame 4 wrong →
select 4 → Regenerate → Accept → Play again → Export Sprite Sheet. If this feels good, the frontend
is successful.

## 49. Implementation sequence (UI phases)
1. **Static Shell** — TopBar, Stage, CharacterDrawer, MotionDrawer, PlaybackBar, FrameTimeline (mock
   data, no Comfy).
2. **Project State** — selection, playhead, play/pause, FPS, loop, gallery selection (mock images);
   prove playback.
3. **Frame Operations** — add/remove/duplicate/reorder/accept/status (no Comfy).
4. **Stage Tools** — zoom/pan/fit/checkerboard/onion/Character Compare/pose overlay.
5. **Motion API** — connect projects/characters/motions/frames to the backend.
6. **Comfy Generation** — wire Generate/Regenerate/job state/progress/failure through the Motion API
   (frontend never submits raw workflow JSON).
7. **Frame Inspector** — quality scores, attempt history, pose info, advanced controls.
8. **Export** — PNG / sprite sheet / GIF / WebP / MP4.

## 50–52. Acceptance, performance, failure UX
First acceptance test: 1 anchor · Idle · 8 frames · 8 FPS → thumbnail appears, preset appears,
Generate creates 8 jobs, timeline fills as jobs complete, frames selectable while others generate,
preview loops, one frame regenerates independently, onion + Anchor Compare work, PNG sequence
exports. UI stays responsive during generation (selection/browsing/scrolling/playback/inspectors
never block) — treat generation as async state. Failure shows `×` on the frame → "Generation
failed [Retry] Details ▾"; never a raw stack trace by default.

## 53–56. Isolation & final architecture
This frontend belongs entirely to Frame Motion Studio; it must not require changes to the Z-Image
Studio frontend, and consumes shared inference/models through **its own backend** (Motion API →
FrameGenerator → adapters → ComfyGateway → ComfyUI). Every future feature must answer: *does it
improve generating, inspecting, repairing, sequencing, or exporting character frames?* If not, it
stays out of the main interface (Blender=Motion Source, Krita=Repair, Wan/SCAIL=Auto Motion mode,
RIFE/FILM=Export/Smooth, Godot=External Preview — none get permanent primary panels).
**Final decision:** build it ourselves, simpler than all three references, because AI generation
removes most traditional drawing/editing needs. The defining interface is *a huge image, a row of
frames, two visual galleries, and almost nothing between the user and the animation.*
