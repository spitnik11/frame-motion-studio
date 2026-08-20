"""Author-time tool: render motion-preset OpenPose skeleton maps as static assets.

Presets describe POSE only (no model, no prompt). Each preset is a folder of OpenPose
skeleton PNGs + manifest.json. These are committed assets — runtime never re-renders them,
so the app needs no Python at runtime. Re-run with any Python + Pillow to regenerate:

    python motion/render_presets.py

OpenPose COCO-18 layout + the standard ControlNet color palette so the SDXL openpose
ControlNet reads them without a preprocessor.
"""
import json
import math
import os
from PIL import Image, ImageDraw

W = H = 768

# COCO-18 keypoint order.
NOSE, NECK, RSHO, RELB, RWRI, LSHO, LELB, LWRI, RHIP, RKNE, RANK, LHIP, LKNE, LANK, REYE, LEYE, REAR, LEAR = range(18)

# Standard OpenPose limb connections (keypoint index pairs) and 18-colour palette.
LIMBS = [
    (NECK, RSHO), (NECK, LSHO), (RSHO, RELB), (RELB, RWRI), (LSHO, LELB), (LELB, LWRI),
    (NECK, RHIP), (RHIP, RKNE), (RKNE, RANK), (NECK, LHIP), (LHIP, LKNE), (LKNE, LANK),
    (NECK, NOSE), (NOSE, REYE), (REYE, REAR), (NOSE, LEYE), (LEYE, LEAR),
]
COLORS = [
    (255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0), (170, 255, 0), (85, 255, 0),
    (0, 255, 0), (0, 255, 85), (0, 255, 170), (0, 255, 255), (0, 170, 255), (0, 85, 255),
    (0, 0, 255), (85, 0, 255), (170, 0, 255), (255, 0, 255), (255, 0, 170), (255, 0, 85),
]

# Canonical front-facing CHIBI standing pose, normalised [0,1]. Chibi ~2.5-3 heads tall:
# large head (big nose->neck gap), short compact limbs, feet close together. Matches the
# "chibi" prompt so the OpenPose ControlNet doesn't fight it (realistic proportions cause
# per-frame identity drift even at a fixed seed).
BASE = {
    NOSE: (0.50, 0.30), NECK: (0.50, 0.42),
    RSHO: (0.445, 0.45), RELB: (0.42, 0.54), RWRI: (0.425, 0.63),
    LSHO: (0.555, 0.45), LELB: (0.58, 0.54), LWRI: (0.575, 0.63),
    RHIP: (0.47, 0.60), RKNE: (0.465, 0.72), RANK: (0.475, 0.84),
    LHIP: (0.53, 0.60), LKNE: (0.535, 0.72), LANK: (0.525, 0.84),
    REYE: (0.47, 0.28), LEYE: (0.53, 0.28), REAR: (0.435, 0.30), LEAR: (0.565, 0.30),
}
# Feet stay planted; everything above the knees breathes.
FIXED = {RKNE, RANK, LKNE, LANK}
UPPER = {NOSE, NECK, RSHO, RELB, RWRI, LSHO, LELB, LWRI, REYE, LEYE, REAR, LEAR}
HIPS = {RHIP, LHIP}


def idle_frame(i, n):
    """Gentle breathing idle: upper body bobs, hips half, feet fixed, tiny arm sway."""
    ph = 2 * math.pi * i / n
    bob = 0.012 * math.sin(ph)      # up when sin>0
    sway = 0.005 * math.sin(ph)
    pts = {}
    for k, (x, y) in BASE.items():
        if k in FIXED:
            pts[k] = (x, y)
        elif k in HIPS:
            pts[k] = (x, y - bob * 0.4)
        else:
            dy = bob
            dx = sway if k in (RWRI, RELB, LWRI, LELB) else 0.0
            pts[k] = (x + dx, y - dy)
    return pts


def render(points):
    img = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    px = {k: (int(x * W), int(y * H)) for k, (x, y) in points.items()}
    for idx, (a, b) in enumerate(LIMBS):
        d.line([px[a], px[b]], fill=COLORS[idx % len(COLORS)], width=8)
    for k, (x, y) in px.items():
        r = 5
        d.ellipse([x - r, y - r, x + r, y + r], fill=COLORS[k % len(COLORS)])
    return img


PRESETS = {"idle": {"fps": 8, "loop": True, "frames": 8, "gen": idle_frame}}


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    for name, cfg in PRESETS.items():
        out = os.path.join(here, "presets", name)
        os.makedirs(out, exist_ok=True)
        n = cfg["frames"]
        for i in range(n):
            render(cfg["gen"](i, n)).save(os.path.join(out, f"pose_{i:03d}.png"))
        manifest = {"id": name, "fps": cfg["fps"], "loop": cfg["loop"], "frames": n,
                    "poses": [f"pose_{i:03d}.png" for i in range(n)]}
        with open(os.path.join(out, "manifest.json"), "w") as f:
            json.dump(manifest, f, indent=2)
        print(f"{name}: {n} pose maps -> {out}")


if __name__ == "__main__":
    main()
