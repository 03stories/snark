#!/usr/bin/env python3
"""Render Snark's icons (16/32/48/128 px) and a contact sheet, from one design.

The mark: a rounded tile with an indigo→coral gradient; a white side panel with stacked
tabs on the left; a raised eyebrow and a lopsided smirk on the right. A sidebar that
looks back at you, a little sarcastically.

Run:  python3 tools/make-icons.py        (needs Pillow + numpy)
"""
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
SS = 8  # supersampling factor for smooth edges

TOP_LEFT = (109, 93, 246)     # indigo  #6D5DF6
BOTTOM_RIGHT = (242, 97, 122) # coral   #F2617A
INK = (255, 255, 255)
TAB_ON = TOP_LEFT
TAB_DIM = (217, 212, 253)     # opaque lilac, so tabs don't go grey on dark backgrounds


def bezier(p0, c, p2, n=200):
    t = np.linspace(0, 1, n)[:, None]
    return ((1 - t) ** 2) * np.array(p0) + 2 * (1 - t) * t * np.array(c) + (t ** 2) * np.array(p2)


def render(size, padded):
    N = size * SS
    img = Image.new("RGBA", (N, N), (0, 0, 0, 0))

    # Tile box. Store/128 icon: artwork ~96/128 with transparent padding. Small toolbar sizes fill more.
    if padded:
        x0 = y0 = 16 / 128 * N
        x1 = y1 = 112 / 128 * N
    else:
        m = (1 / 16 if size <= 16 else 3 / 48) * N
        x0 = y0 = m
        x1 = y1 = N - m
    W = x1 - x0
    U = lambda u, v: (x0 + u * W, y0 + v * W)  # tile-relative → pixels

    # Gradient tile
    yy, xx = np.mgrid[0:N, 0:N]
    t = np.clip(((xx - x0) + (yy - y0)) / (2 * W), 0, 1)[..., None]
    grad = (np.array(TOP_LEFT) * (1 - t) + np.array(BOTTOM_RIGHT) * t).astype(np.uint8)
    tile = Image.fromarray(np.dstack([grad, np.full((N, N), 255, np.uint8)]), "RGBA")
    mask = Image.new("L", (N, N), 0)
    ImageDraw.Draw(mask).rounded_rectangle([x0, y0, x1, y1], radius=0.23 * W, fill=255)
    img.paste(tile, (0, 0), mask)

    d = ImageDraw.Draw(img)

    # Side panel
    px0, py0 = U(0.13, 0.15)
    px1, py1 = U(0.44, 0.85)
    d.rounded_rectangle([px0, py0, px1, py1], radius=0.085 * W, fill=INK + (255,))

    # Stacked tabs in the panel (skipped at 16 px, where they'd turn to mush)
    if size > 16:
        for i, v in enumerate([0.24, 0.38, 0.52]):
            tx0, ty0 = U(0.185, v)
            tx1, ty1 = U(0.385, v + 0.085)
            d.rounded_rectangle([tx0, ty0, tx1, ty1], radius=0.04 * W, fill=(TAB_ON if i == 0 else TAB_DIM) + (255,))

    # Face: raised eyebrow + lopsided smirk
    stroke = (0.085 if size <= 16 else 0.07) * W

    def poly(points, width):
        # A smooth round-capped stroke: stamp discs densely along the path (no jagged joints).
        pts = np.array(points, dtype=float)
        seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
        dist = np.concatenate([[0], np.cumsum(seg)])
        samples = np.linspace(0, dist[-1], max(2, int(dist[-1] / 2)))
        xs = np.interp(samples, dist, pts[:, 0])
        ys = np.interp(samples, dist, pts[:, 1])
        r = width / 2
        for x, y in zip(xs, ys):
            d.ellipse([x - r, y - r, x + r, y + r], fill=INK + (255,))

    if size > 16:
        # One raised eyebrow (curving up at the outer end) and one eye below it.
        poly(bezier(U(0.60, 0.33), U(0.72, 0.30), U(0.85, 0.22)), stroke * 0.8)
        ex, ey = U(0.72, 0.43)
        er = 0.05 * W
        d.ellipse([ex - er, ey - er, ex + er, ey + er], fill=INK + (255,))
    # Lopsided smirk: nearly flat on the left, curling up on the right.
    smirk = bezier(U(0.54, 0.64), U(0.80, 0.72), U(0.87, 0.52))
    poly(smirk, stroke)

    return img.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    for size in (16, 32, 48, 128):
        render(size, padded=(size == 128)).save(OUT / f"icon{size}.png")
    # Contact sheet for review (not shipped): every size, scaled up and shown 1:1.
    sheet = Image.new("RGBA", (760, 300), (245, 245, 247, 255))
    big = render(256, padded=True)
    sheet.paste(big, (20, 22), big)
    x = 300
    for size in (128, 48, 32, 16):
        im = Image.open(OUT / f"icon{size}.png")
        sheet.paste(im, (x, 150 - size // 2), im)
        x += size + 40
    dark = Image.new("RGBA", (760, 300), (32, 33, 36, 255))
    dark.paste(sheet.crop((0, 0, 0, 0)) if False else big, (20, 22), big)
    x = 300
    for size in (128, 48, 32, 16):
        im = Image.open(OUT / f"icon{size}.png")
        dark.paste(im, (x, 150 - size // 2), im)
        x += size + 40
    both = Image.new("RGBA", (760, 600))
    both.paste(sheet, (0, 0))
    both.paste(dark, (0, 300))
    both.save(OUT.parent / "docs" / "icon-sheet.png")
    print("wrote", ", ".join(f"icon{s}.png" for s in (16, 32, 48, 128)), "+ docs/icon-sheet.png")


if __name__ == "__main__":
    main()
