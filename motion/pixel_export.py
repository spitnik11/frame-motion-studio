"""Harden AI frames into Godot-ready pixel-art sprites + a tested animation sheet.

Input : the RGBA frames of an animation (data/animations/<id>/frames/*.png).
Output: <exportdir>/
    frame_000.png ...        hardened per-frame sprites (uniform cell, 1-bit alpha, shared palette)
    spritesheet.png          uniform-grid sheet (cols x rows), transparent
    <anim>.tres              Godot 4 SpriteFrames resource (AtlasTexture regions into the sheet)
    spritesheet.png.import   Godot import file forcing Nearest filter, no mipmaps, fix-alpha-border
    sheet.json               machine-readable metadata (cell w/h, cols/rows, fps, anchor)

Hardening = the four things that make AI output safe as a game sprite:
  1. feet-center alignment onto a uniform cell (no per-frame jitter),
  2. nearest/lanczos downscale to a real pixel size,
  3. edge de-halo (bleed opaque colour under transparent px) + 1-bit alpha (no semi-transparent fringe),
  4. a SHARED quantised palette across every frame (no colour shimmer between frames).

Run (needs Pillow + numpy):  python motion/pixel_export.py <frames_dir> <out_dir> <anim> <fps> [cell_h] [cols]
"""
import json
import os
import sys
import glob
import numpy as np
from PIL import Image

ALPHA_CUT = 128       # >= is opaque
BLEED_PX = 3          # de-halo distance
PALETTE = 32          # shared palette size


def load(frames_dir):
    files = sorted(glob.glob(os.path.join(frames_dir, "*.png")))
    return [np.array(Image.open(f).convert("RGBA")) for f in files]


def bbox(mask):
    ys, xs = np.where(mask)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1  # x0,y0,x1,y1


def align_uniform(frames):
    """Crop each frame to content, paste feet-bottom / horizontal-centroid onto a common cell."""
    masks = [f[:, :, 3] >= ALPHA_CUT for f in frames]
    boxes = [bbox(m) for m in masks]
    cw = max(b[2] - b[0] for b in boxes)
    ch = max(b[3] - b[1] for b in boxes)
    pad = 4
    cw += pad * 2; ch += pad * 2
    out = []
    for f, m, (x0, y0, x1, y1) in zip(frames, masks, boxes):
        crop = f[y0:y1, x0:x1]
        cm = m[y0:y1, x0:x1]
        bw, bh = x1 - x0, y1 - y0
        # horizontal centroid of the mask -> centre it; feet (bottom) -> cell bottom - pad.
        cx = cm.sum(axis=0).astype(float)
        centroid = int((np.arange(bw) * cx).sum() / max(1, cx.sum()))
        canvas = np.zeros((ch, cw, 4), np.uint8)
        ox = cw // 2 - centroid
        oy = ch - pad - bh
        ox = max(0, min(cw - bw, ox)); oy = max(0, min(ch - bh, oy))
        canvas[oy:oy + bh, ox:ox + bw] = crop
        out.append(canvas)
    return out, cw, ch


def de_halo(rgba):
    """Bleed opaque colour into transparent pixels so downscaling/filtering can't pull dark fringe."""
    rgb = rgba[:, :, :3].copy()
    a = rgba[:, :, 3] >= ALPHA_CUT
    known = a.copy()
    for _ in range(BLEED_PX):
        # for each unknown pixel adjacent to a known one, copy a known neighbour's colour
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            shifted = np.roll(known, (dy, dx), (0, 1))
            src = np.roll(rgb, (dy, dx), (0, 1))
            take = shifted & (~known)
            rgb[take] = src[take]
            known = known | shifted
    out = rgba.copy(); out[:, :, :3] = rgb
    return out


def shared_palette(frames):
    """One adaptive palette from all frames' opaque pixels -> consistent colours across the anim."""
    montage = np.concatenate([f.reshape(-1, 4) for f in frames], 0)
    opaque = montage[montage[:, 3] >= ALPHA_CUT][:, :3]
    ref = Image.fromarray(opaque.reshape(-1, 1, 3).astype(np.uint8), "RGB")
    return ref.quantize(colors=PALETTE, method=Image.MEDIANCUT, dither=Image.Dither.NONE)


def harden(frames, cell_h, cols):
    frames, cw, ch = align_uniform(frames)
    scale = cell_h / ch
    tw, th = max(1, round(cw * scale)), cell_h
    small = []
    for f in frames:
        f = de_halo(f)
        im = Image.fromarray(f, "RGBA").resize((tw, th), Image.LANCZOS)
        arr = np.array(im)
        arr[:, :, 3] = np.where(arr[:, :, 3] >= ALPHA_CUT, 255, 0)  # 1-bit alpha
        small.append(arr)
    pal = shared_palette(small)
    hardened = []
    for arr in small:
        rgb = Image.fromarray(arr[:, :, :3], "RGB").quantize(palette=pal, dither=Image.Dither.NONE).convert("RGB")
        out = np.dstack([np.array(rgb), arr[:, :, 3]]).astype(np.uint8)
        hardened.append(out)
    rows = (len(hardened) + cols - 1) // cols
    sheet = np.zeros((rows * th, cols * tw, 4), np.uint8)
    for i, arr in enumerate(hardened):
        r, c = divmod(i, cols)
        sheet[r * th:(r + 1) * th, c * tw:(c + 1) * tw] = arr
    return hardened, sheet, tw, th, cols, rows


def write_godot(out_dir, anim, sheet_name, tw, th, cols, rows, n, fps):
    atlas, frames_list = [], []
    for i in range(n):
        r, c = divmod(i, cols)
        atlas.append(
            f'[sub_resource type="AtlasTexture" id="A{i}"]\n'
            f'atlas = ExtResource("1")\nregion = Rect2({c*tw}, {r*th}, {tw}, {th})\n')
        frames_list.append(f'{{\n"duration": 1.0,\n"texture": SubResource("A{i}")\n}}')
    tres = (
        f'[gd_resource type="SpriteFrames" load_steps={n+2} format=3]\n\n'
        f'[ext_resource type="Texture2D" path="res://{sheet_name}" id="1"]\n\n'
        + "\n".join(atlas) +
        '\n[resource]\nanimations = [{\n'
        f'"frames": [{", ".join(frames_list)}],\n'
        f'"loop": true,\n"name": &"{anim}",\n"speed": {float(fps)}\n}}]\n')
    with open(os.path.join(out_dir, f"{anim}.tres"), "w") as f:
        f.write(tres)
    # Import file: Nearest filter (0), no mipmaps, fix alpha border on -> crisp pixels, no halos.
    imp = (
        '[remap]\n\nimporter="texture"\ntype="CompressedTexture2D"\n\n'
        '[params]\n\ncompress/mode=0\ncompress/lossy_quality=0.7\n'
        'mipmaps/generate=false\nprocess/fix_alpha_border=true\n'
        'process/premult_alpha=false\ndetect_3d/compress_to=0\n'
        'roughness/mode=0\ncompress/normal_map=0\n')
    with open(os.path.join(out_dir, f"{sheet_name}.import"), "w") as f:
        f.write(imp)


def main():
    frames_dir, out_dir, anim, fps = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    cell_h = int(sys.argv[5]) if len(sys.argv) > 5 else 128
    cols = int(sys.argv[6]) if len(sys.argv) > 6 else 4
    global PALETTE
    if len(sys.argv) > 7:
        PALETTE = int(sys.argv[7])  # 8-bit palette size (e.g. 16 for Gen-3 look)
    os.makedirs(out_dir, exist_ok=True)
    frames = load(frames_dir)
    hardened, sheet, tw, th, cols, rows, = *harden(frames, cell_h, cols),
    for i, arr in enumerate(hardened):
        Image.fromarray(arr, "RGBA").save(os.path.join(out_dir, f"frame_{i:03d}.png"))
    Image.fromarray(sheet, "RGBA").save(os.path.join(out_dir, "spritesheet.png"))
    write_godot(out_dir, anim, "spritesheet.png", tw, th, cols, rows, len(hardened), fps)
    meta = {"anim": anim, "cell_w": tw, "cell_h": th, "cols": cols, "rows": rows,
            "frames": len(hardened), "fps": fps, "anchor": "feet-center", "palette": PALETTE}
    json.dump(meta, open(os.path.join(out_dir, "sheet.json"), "w"), indent=2)

    # ---- self-verify the hardened output ----
    partial = 0
    palettes = []
    for arr in hardened:
        a = arr[:, :, 3]
        partial += int(((a != 0) & (a != 255)).sum())
        cols_set = {tuple(px) for px in arr[a == 255][:, :3]}
        palettes.append(cols_set)
    union = set().union(*palettes)
    print(json.dumps({
        "cells_uniform": all(a.shape == hardened[0].shape for a in hardened),
        "partial_alpha_px": partial,                 # must be 0 -> hardened 1-bit alpha
        "distinct_colors_total": len(union),         # <= PALETTE -> shared palette held
        "cell": [tw, th], "grid": [cols, rows], "sheet": list(sheet.shape),
    }))


if __name__ == "__main__":
    main()
