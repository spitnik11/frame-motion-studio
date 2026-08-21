# Frame Motion Studio → Pokémon-style Overworld Sprites for Godot

Design + implementation for turning Frame Motion Studio into a **Pokémon/RPG-Maker-style
overworld** asset source: 4-direction character sets, 8-bit / Gen-3 limited palette, and the
Godot integration — plus how the staging (backgrounds, tilesets, maps) fits. Top-down 4-direction
first; true isometric / side-scroll later. Isolation unchanged (own repo, shared models only).

## 0. What this is (and isn't)
Pokémon overworld characters are **top-down, 4-directional** (down/up/left/right), tiny (RPG Maker
XP charsets are ~32×32–32×48 per frame), with a **limited palette**. That's what we target here —
not true isometric (that's 8-direction, a later step) and not side-scroll (later). The user's
reference map + tileset are top-down RMXP/Pokémon-Essentials style.

## 1. Staging (the reference images → Godot)
| Reference | Godot equivalent |
|---|---|
| Mountain / sunset **backgrounds** | `ParallaxBackground` + `ParallaxLayer` (scroll at different speeds) |
| RMXP **tileset** sheet | `TileSet` resource → `TileMap` node (paint the ground/houses/trees) |
| Grassy-field **map** with houses | a Godot scene: `TileMap` ground + `AnimatedSprite2D` character on top |
| Anime-girl **turnaround** sheet | the character set we generate (this doc) |
| RPG-Maker-XP / Essentials editor | the *other* toolchain; we export Godot-native instead, but a 4×N charset PNG also drops into RMXP |

We standardise on **Godot-native**: character = a `SpriteFrames` with one animation per direction;
the world = `TileMap` + `ParallaxBackground`. (A classic 4-row×N-col charset PNG for RMXP/Essentials
is a trivial repack of the same frames if that pipeline is ever wanted.)

## 2. Character-set method (verified in Godot 4.7.2)
`motion/overworld_export.py` packs directional frames into a Godot **directional SpriteFrames**:
- one `AtlasTexture` per frame in a uniform-cell sheet,
- **one animation per direction** (`down`, `up`, `left`, `right`), `loop=true`, `speed=fps`,
- shares the same hardening as the pixel export (feet-center uniform cells, 1-bit alpha, **shared
  palette across all directions** so colours match facing-to-facing).

Godot usage — pick the animation by movement direction (mirror one side if you only have one):
```gdscript
extends AnimatedSprite2D
func _physics_process(_dt):
    var v := Input.get_vector("left","right","up","down")
    if v == Vector2.ZERO: return
    if abs(v.x) > abs(v.y):
        play("left" if sprite_frames.has_animation("left") else "right")
        flip_h = v.x > 0 and not sprite_frames.has_animation("right")  # mirror trick
    else:
        play("down" if v.y > 0 else "up")
```
**Verified:** `character.tres` imports and loads as `SpriteFrames` with animations
`[down, up, left, right]`, each a 37×48 `AtlasTexture`, renders crisp over magenta (clean
transparency), and plays — Godot 4.7.2, RTX 5070. Repro like `motion/godot-verify/` (a directional
`validate.gd`/`capture.gd` variant).

## 3. 8-bit / Gen-3 palette method (verified)
The reference tool **porypal** indexes an image to a Gen-3 ROM's 16-colour palette. Our equivalent
is the shared-palette hardening with a small colour count:
`overworld_export.py … <colors>` (default **16**) → verified `colors_actual: 16`, `partial_alpha_px: 0`.
The idle/`godot-pixel` export also accepts `colors` now (`POST …/export {"format":"godot-pixel",
"colors":16}`), default 32.

To match a **specific** Gen-3 palette (drop-in for a ROM hack via porypal), index to a supplied
`.pal`/palette PNG instead of an adaptive one — a small addition to `shared_palette()` (load the
fixed palette rather than MEDIANCUT). Documented as the next option; adaptive 16 is what's verified.

## 4. Generation results — honest
4-direction turnaround via 4 directional OpenPose presets (facing encoded through face keypoints:
down=full face, up=no face/back, left/right=one-side profile + compressed body) **plus a directional
prompt suffix** (`opts.promptSuffix`, e.g. "back view, seen from behind"):

| Direction | Result |
|---|---|
| **down** (front) | ✅ clean chibi, consistent identity |
| **up** (back) | ✅ genuine back view — back of head, no face, dress/hair from behind |
| **left / right** (side) | ⚠️ still front/¾-facing — the model resists true profiles |

Root cause: pose-map facing cues + a text suffix flip front↔back well, but **true side profiles**
need stronger help. Options (next):
- a **side-profile reference** per side (IPAdapter — not installed — or a small reference charset
  fed through ControlNet),
- a **profile/turnaround LoRA**,
- the **mirror trick**: generate ONE good side, use it for both (Godot `flip_h`),
- or hand-touch the side frames (Krita, design-doc Phase 32).

So today the pipeline reliably yields **front + back**; sides are an open R&D item, not a pipeline bug.

## 5. Pipeline end-to-end (reproduce)
```
# 1. directional pose presets (author-time, static assets)
motion/.venv/Scripts/python motion/render_presets.py       # writes presets/overworld/pose_<dir>_<i>.png

# 2. generate the 4 directions (per-direction pose map + prompt suffix), transparent, poseIsMap
POST /api/frames { anchorId, pose:<dataurl of pose_<dir>_1.png>,
                   opts:{ poseIsMap:true, transparent:true, seed, controlStrength:0.85,
                          promptSuffix:"back view, seen from behind" } }

# 3. pack a Godot 8-bit directional sheet
motion/.venv/Scripts/python motion/overworld_export.py spec.json out 48 4 16
#   spec.json = {"fps":6,"dirs":{"down":[png],"up":[png],"left":[png],"right":[png]}}

# 4. drop out/ into a Godot project -> AnimatedSprite2D.sprite_frames = load("res://character.tres")
```

## 6. Roadmap fit / next
- **Walk cycles:** presets already emit 3 frames/direction (`pose_<dir>_0/1/2`); generate all 12 for
  animated walking (currently we ship the neutral frame per direction).
- **Sides:** side reference/LoRA or mirror; then a one-click `POST /api/overworld` endpoint that
  runs steps 2–3 for an anchor.
- **Exact Gen-3 palette:** fixed-palette indexing (porypal `.pal`) for ROM-hack drop-in.
- **Staging demo:** a Godot sample scene — `TileMap` grass field + `ParallaxBackground` mountains +
  the character walking — to prove the whole picture.
- **Frame size:** target 32×32 / 32×48 to match RMXP charsets exactly (currently 37×48; set
  `cellHeight`/cell width to taste).
- Isometric (8-dir) and side-scroll are separate later modes (design-doc §31 Auto-Motion is unrelated).
