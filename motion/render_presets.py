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
    # points may omit keypoints (None / absent) to encode facing (back = no face, side = one side).
    px = {k: (int(x * W), int(y * H)) for k, (x, y) in points.items() if x is not None}
    for idx, (a, b) in enumerate(LIMBS):
        if a in px and b in px:
            d.line([px[a], px[b]], fill=COLORS[idx % len(COLORS)], width=8)
    for k, (x, y) in px.items():
        r = 5
        d.ellipse([x - r, y - r, x + r, y + r], fill=COLORS[k % len(COLORS)])
    return img


DIRS = ["down", "up", "left", "right"]


def facing(direction):
    """Encode facing through OpenPose face keypoints (down=full face, up=no face/back,
    left/right=profile with one eye+ear and a horizontally-compressed body)."""
    b = dict(BASE)
    if direction == "up":
        for k in (NOSE, REYE, LEYE, REAR, LEAR):
            b.pop(k, None)
    elif direction in ("left", "right"):
        for k in list(b):  # compress body to ~half width -> reads side-on
            x, y = b[k]; b[k] = (0.5 + (x - 0.5) * 0.5, y)
        if direction == "left":
            b.pop(REYE, None); b.pop(REAR, None)
            b[NOSE] = (0.485, 0.30); b[LEYE] = (0.47, 0.28); b[LEAR] = (0.515, 0.30)
        else:
            b.pop(LEYE, None); b.pop(LEAR, None)
            b[NOSE] = (0.515, 0.30); b[REYE] = (0.53, 0.28); b[REAR] = (0.485, 0.30)
    return b


def overworld_pose(direction, i):
    """3-frame walk per direction: i in {0:contact-A, 1:neutral, 2:contact-B}."""
    step = (-1, 0, 1)[i]
    amp = 0.022
    p = facing(direction)
    if direction in ("down", "up"):
        for k, s in ((RANK, -1), (LANK, 1), (RKNE, -0.5), (LKNE, 0.5)):
            if k in p:
                p[k] = (p[k][0], p[k][1] - amp * s * step)
    else:  # side: swing legs fore/aft in x
        for k, s in ((RANK, 1), (LANK, -1), (RKNE, 0.5), (LKNE, -0.5)):
            if k in p:
                p[k] = (p[k][0] + amp * s * step, p[k][1])
    return p


def side_walk_frame(i, _n):
    """Six-pose right-facing walk: contact, recoil, passing, then opposite leg.

    Ankles alternate fore/aft, the passing foot lifts, arms counter-swing, and contact
    feet share one ground line. This prevents the common generated "both legs together"
    shuffle while keeping a compact chibi silhouette.
    """
    p = facing("right")
    # right ankle x/y, left ankle x/y, right knee x/y, left knee x/y, body down, arm swing
    poses = [
        (.620, .84, .380, .84, .555, .70, .445, .72, .000, -1.0),  # R contact
        (.565, .84, .435, .84, .535, .76, .465, .76, .020, -0.5),  # recoil
        (.455, .84, .555, .76, .475, .72, .535, .67, -.010, 0.0),  # L passes
        (.380, .84, .620, .84, .445, .72, .555, .70, .000, 1.0),   # L contact
        (.435, .84, .565, .84, .465, .76, .535, .76, .020, 0.5),   # recoil
        (.555, .76, .455, .84, .535, .67, .475, .72, -.010, 0.0),  # R passes
    ]
    rx, ry, lx, ly, rkx, rky, lkx, lky, down, swing = poses[i]
    p[RANK], p[LANK], p[RKNE], p[LKNE] = (rx, ry), (lx, ly), (rkx, rky), (lkx, lky)
    for k in (NOSE, NECK, RSHO, RELB, RWRI, LSHO, LELB, LWRI, RHIP, LHIP,
              REYE, REAR):
        if k in p:
            x, y = p[k]
            p[k] = (x, y + down)
    # Opposite arm swing: forward leg pairs with backward arm.
    p[RELB] = (p[RELB][0] - .018 * swing, p[RELB][1])
    p[RWRI] = (p[RWRI][0] - .038 * swing, p[RWRI][1])
    p[LELB] = (p[LELB][0] + .018 * swing, p[LELB][1])
    p[LWRI] = (p[LWRI][0] + .038 * swing, p[LWRI][1])
    return p


PRESETS = {
    "idle": {"fps": 8, "loop": True, "frames": 8, "gen": idle_frame},
    "walk_side": {"fps": 8, "loop": True, "frames": 6, "gen": side_walk_frame},
}


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

    # Overworld: directional turnaround (4 dirs x 3 walk frames), Pokemon-style.
    ow = os.path.join(here, "presets", "overworld")
    os.makedirs(ow, exist_ok=True)
    per_dir = 3
    poses = {}
    for d in DIRS:
        names = []
        for i in range(per_dir):
            fn = f"pose_{d}_{i}.png"
            render(overworld_pose(d, i)).save(os.path.join(ow, fn))
            names.append(fn)
        poses[d] = names
    json.dump({"id": "overworld", "fps": 6, "loop": True, "directions": DIRS,
               "framesPerDir": per_dir, "poses": poses},
              open(os.path.join(ow, "manifest.json"), "w"), indent=2)
    print(f"overworld: {len(DIRS)}x{per_dir} directional pose maps -> {ow}")


if __name__ == "__main__":
    main()
