"""Pack directional (turnaround) frames into a Godot overworld character sheet.

Input : a JSON spec {"dirs": {"down":[png...], "up":[...], "left":[...], "right":[...]}, "fps": 6}
Output: <out>/
    spritesheet.png            one uniform-cell sheet, shared 8-bit palette across ALL directions
    character.tres             Godot 4 SpriteFrames with one animation per direction (down/up/left/right)
    spritesheet.png.import     Nearest / no mipmaps / fix_alpha_border
    sheet.json                 metadata

Reuses the hardening from pixel_export (feet-center uniform cells, 1-bit alpha, shared quantised
palette) so every direction shares one palette -> the character's colours match across facings.
This is the Pokemon-style "character set": Godot picks the animation by movement direction, and
left/right can be mirrored with AnimatedSprite2D.flip_h if only one side exists.

Run:  python motion/overworld_export.py <spec.json> <out_dir> <cell_h> <cols> <colors>
"""
import json
import os
import sys
import numpy as np
from PIL import Image
import pixel_export as px


def main():
    spec = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    cell_h = int(sys.argv[3]) if len(sys.argv) > 3 else 48
    cols = int(sys.argv[4]) if len(sys.argv) > 4 else 4
    colors = int(sys.argv[5]) if len(sys.argv) > 5 else 16
    fps = float(spec.get("fps", 6))
    os.makedirs(out, exist_ok=True)

    order, groups = [], {}
    for d, files in spec["dirs"].items():
        groups[d] = []
        for f in files:
            groups[d].append(len(order)); order.append(f)

    frames = [np.array(Image.open(f).convert("RGBA")) for f in order]
    px.PALETTE = colors  # 8-bit / Gen-3-style limited palette (porypal-equivalent)
    hardened, sheet, tw, th, c, rows = px.harden(frames, cell_h, cols)

    for i, arr in enumerate(hardened):
        Image.fromarray(arr, "RGBA").save(os.path.join(out, f"frame_{i:03d}.png"))
    Image.fromarray(sheet, "RGBA").save(os.path.join(out, "spritesheet.png"))

    atlas = []
    for i in range(len(hardened)):
        r, cc = divmod(i, c)
        atlas.append(f'[sub_resource type="AtlasTexture" id="A{i}"]\natlas = ExtResource("1")\n'
                     f'region = Rect2({cc*tw}, {r*th}, {tw}, {th})\n')
    anims = []
    for d, idxs in groups.items():
        fl = ", ".join('{\n"duration": 1.0,\n"texture": SubResource("A%d")\n}' % i for i in idxs)
        anims.append('{\n"frames": [%s],\n"loop": true,\n"name": &"%s",\n"speed": %s\n}' % (fl, d, fps))
    tres = (f'[gd_resource type="SpriteFrames" load_steps={len(hardened)+2} format=3]\n\n'
            f'[ext_resource type="Texture2D" path="res://spritesheet.png" id="1"]\n\n'
            + "\n".join(atlas) + "\n[resource]\nanimations = [" + ", ".join(anims) + "]\n")
    open(os.path.join(out, "character.tres"), "w").write(tres)
    open(os.path.join(out, "spritesheet.png.import"), "w").write(
        '[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n\n'
        '[params]\n\ncompress/mode=0\nmipmaps/generate=false\nprocess/fix_alpha_border=true\n')

    partial = sum(int(((a[:, :, 3] != 0) & (a[:, :, 3] != 255)).sum()) for a in hardened)
    union = set()
    for a in hardened:
        for pxl in a[a[:, :, 3] == 255][:, :3]:
            union.add(tuple(pxl))
    meta = {"directions": list(groups), "frames": len(hardened), "cell": [tw, th],
            "grid": [c, rows], "fps": fps, "colors_target": colors, "colors_actual": len(union),
            "partial_alpha_px": partial}
    json.dump(meta, open(os.path.join(out, "sheet.json"), "w"), indent=2)
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
