# Godot verification (reproducible)

Proves a `godot-pixel` export loads, imports, renders, and plays in **Godot 4.7.2**.
Verified 2026-08-20 on an RTX 5070 (OpenGL 3.3).

## Steps
1. Export an animation: `POST /api/animations/:id/export {"format":"godot-pixel"}`.
2. Make a throwaway project: copy the export's `spritesheet.png`, `spritesheet.png.import`,
   `<anim>.tres`, `sheet.json` into a folder, add a `project.godot` with
   `rendering/textures/canvas_textures/default_texture_filter=0` and
   `rendering/2d/snap/snap_2d_transforms_to_pixel=true`, then copy `validate.gd`, `capture.gd`,
   `capture.tscn` from here.
3. Import + validate the resource (headless):
   ```
   godot --headless --path <proj> --import
   godot --headless --path <proj> --script res://validate.gd
   ```
   Expected: `animations=["idle"] frame_count=8 speed=8.0 loop=true`, every frame an
   `AtlasTexture` sized `(69,128)`, `RESULT: PASS`, exit 0.
4. Render + play (real GPU):
   ```
   godot --path <proj> --rendering-driver opengl3 res://capture.tscn
   ```
   Writes `render_out.png`: the 8 frames in a row over magenta (magenta showing through = clean
   transparency) plus a live `AnimatedSprite2D` (`is_playing()==true`). Exit 0.
