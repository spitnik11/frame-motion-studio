# Frame Motion Studio → Godot: Pixel-Art Game Assets

Design + implementation for turning Frame Motion Studio animations into **Godot 4** pixel-art
game sprites. Covers a **verified hardened transparent method** and a **tested animation-sheet
method**, plus the exact Godot import recipe. Isolation unchanged — nothing here touches Z-Image
Studio; the image utilities run in a Frame-Motion-local Python venv (`motion/.venv`).

---

## 1. Why AI frames aren't game-ready as-is

Frame Motion generates 768×768 pixel-art-*style* frames with soft, anti-aliased alpha. Dropped into
a game engine these fail in four specific ways:

| Raw AI frame | Symptom in-engine |
|---|---|
| Semi-transparent (anti-aliased) edges | ugly translucent fringe / dark halo at integer scale |
| Different character position per frame | sprite jitters during playback |
| Per-frame colour variation | palette "shimmer" between frames |
| 768px "big pixels", not a real pixel grid | blurry when the engine scales it |

"Hardening" fixes exactly these four, in this order.

## 2. The hardened transparent pixel-art method  ✅ verified

`motion/pixel_export.py` (Pillow + numpy). Pipeline per animation:

1. **Feet-center align → uniform cell.** Crop each frame to its opaque bbox; paste onto a common
   cell with the horizontal *centroid* centered and the feet (bbox bottom) on the cell floor. Kills
   per-frame jitter. (This is the design-doc §12 feet-center anchor, done at export.)
2. **Downscale to a real pixel size.** LANCZOS resize to a target cell height (default 128px) → an
   actual small sprite instead of 768px faux-pixels.
3. **Edge de-halo + 1-bit alpha.** Bleed opaque colour a few px into transparent pixels (so no dark
   colour hides under the alpha), then threshold alpha at 128 → **strictly {0, 255}**. No
   semi-transparent fringe. Godot's own *Fix Alpha Border* (set in our `.import`) is the belt-and-braces.
4. **Shared quantised palette.** Build ONE adaptive palette (default 32 colours) from all frames'
   opaque pixels, map every frame to it with no dither → identical colours across the whole
   animation, no shimmer.

### Verification (run on the real M1 idle, 8 frames)
The script self-checks and the export API returns it:
```json
{ "cells_uniform": true, "partial_alpha_px": 0, "distinct_colors_total": 32,
  "cell": [69,128], "grid": [4,2], "sheet": [256,276,4] }
```
- `partial_alpha_px: 0` → **hard 1-bit alpha** (the hardening guarantee).
- `distinct_colors_total: 32` → shared palette held (≤ palette size across ALL frames).
- `cells_uniform: true` → every cell identical (128×69) → no jitter.
Visually confirmed: crisp transparent sprites, consistent character, feet aligned.

> Known cosmetic: the model sometimes bakes a soft ground shadow that hardens into a solid blob.
> Mitigate with a "no shadow, plain background" anchor prompt, or add a shadow-strip pass later.

## 3. The tested animation-sheet method  ✅ structurally verified

From the hardened frames the exporter writes a **uniform-grid** sheet plus a ready Godot resource:

```
exports/godot/
  frame_000.png … frame_007.png   hardened per-frame sprites
  spritesheet.png                 uniform cols×rows grid, transparent (256×276 here, 4×2 × 69×128)
  idle.tres                       Godot 4 SpriteFrames (AtlasTexture region per frame)
  spritesheet.png.import          forces Nearest filter, no mipmaps, fix_alpha_border
  sheet.json                      {cell_w,cell_h,cols,rows,frames,fps,anchor:"feet-center"}
```

`idle.tres` is emitted in Godot 4 `.tres` format and validated by construction — correct
`load_steps`, one `AtlasTexture` sub-resource per frame with `region = Rect2(col*cw, row*ch, cw, ch)`
tiling the sheet exactly, and an `animations` array with `loop`, `name`, `speed = fps`:

```gdresource
[gd_resource type="SpriteFrames" load_steps=10 format=3]
[ext_resource type="Texture2D" path="res://spritesheet.png" id="1"]
[sub_resource type="AtlasTexture" id="A0"]
atlas = ExtResource("1")
region = Rect2(0, 0, 69, 128)
… A1…A7 …
[resource]
animations = [{ "frames":[{"duration":1.0,"texture":SubResource("A0")}, …],
  "loop": true, "name": &"idle", "speed": 8.0 }]
```

**Test scope (honest):** the sheet's structural invariants are machine-verified (uniform cells,
region math tiles exactly, valid resource types, correct `load_steps`) and the `.tres`/`.import`
conform to Godot 4's documented format. A **live Godot runtime import was not executed** — Godot is
not installed on this machine. To close that gap (≈2 min): install Godot 4, drop the `godot/` folder
into a project, run `godot --headless --import`, and load the scene below. See §6.

## 4. Godot 4 import recipe (do this once per project)

Sourced from Godot docs (`tutorials/2d/2d_sprite_animation`, `class_animatedsprite2d`,
`assets_pipeline/importing_images`):

1. **Pixel-perfect project settings:**
   - Rendering → Textures → Canvas Textures → **Default Texture Filter = Nearest** (sharp pixels).
   - Rendering → 2D → Snap → **snap_2d_transforms_to_pixel = On** (the docs warn a *centered*
     sprite deforms pixel art unless positions snap to pixels).
   - Display → Window → Stretch → **Mode = canvas_items**, **Scale Mode = integer** for crisp
     integer scaling.
2. **Texture import** is handled by the generated `spritesheet.png.import`: `mipmaps=false`,
   `fix_alpha_border=true`, lossless. (If you re-import manually, match those.)
3. **Use it** — assign the SpriteFrames to an `AnimatedSprite2D`:
   ```gdscript
   extends AnimatedSprite2D
   func _ready() -> void:
       sprite_frames = load("res://idle.tres")
       centered = false          # or keep centered AND rely on snap_2d_transforms_to_pixel
       texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
       play("idle")
   ```
   Alternatively, ignore the `.tres` and use the SpriteFrames editor → "Add frames from a sprite
   sheet", set Horizontal = `cols`, Vertical = `rows` from `sheet.json`.

## 5. Engine integration (the export is a first-class feature)

`POST /api/animations/:id/export  { "format": "godot-pixel", "cols": 4, "cellHeight": 128 }`
→ runs `motion/pixel_export.py` via the FM-local venv (`config.pythonPath`, default
`motion/.venv/Scripts/python.exe`) and returns the paths + the self-verification block.

Setup (once): `python -m venv motion/.venv && motion/.venv/Scripts/pip install pillow numpy`.
Override the interpreter with `FMS_PYTHON` env or `config/app.json → pythonPath`. If the venv is
absent the other exports (png-sequence, sprite-sheet via ffmpeg) still work — graceful degradation.

## 6. Closing the last gap + roadmap fit

- **Live Godot test (optional):** install Godot 4 (portable exe, no installer), then a headless
  import + a one-frame render of an `AnimatedSprite2D` scene confirms runtime playback. This is the
  design-doc's **Phase 33 (Godot preview)** — optional, never in the core generation path.
- **Improvements:** per-direction sheets (down/side/up) for top-down games; shadow-strip pass;
  power-of-two sheet padding option; `.res` binary SpriteFrames; multi-animation sheets (idle+walk
  in one resource). All additive to `pixel_export.py`; none affect isolation.

## 7. Guarantees this method makes to a Godot dev
- Transparent sprites with **no translucent fringe** (1-bit alpha, verified 0 partial pixels).
- **Stable identity + palette** across frames (shared 32-colour palette, keyframe-locked identity).
- **No jitter** (feet-center uniform cells).
- A **drop-in `SpriteFrames`** so it's `load()` + `play()`, not manual slicing.
