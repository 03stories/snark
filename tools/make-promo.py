#!/usr/bin/env python3
"""Render the Chrome Web Store small promo tile (440x280): store/promo-440x280.png.

Run:  python3 tools/make-promo.py   (needs Pillow + numpy; uses tools/make-icons.py for the mark)
"""
import importlib.util
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("icons", HERE / "make-icons.py")
icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(icons)

W, H, SS = 440, 280, 2
OUT = HERE.parent / "store" / "promo-440x280.png"


def font(names, size):
    for n in names:
        for d in ("/usr/share/fonts/truetype/google-fonts", "/Library/Fonts", "/System/Library/Fonts/Supplemental",
                  "/usr/share/fonts/truetype/dejavu"):
            p = Path(d) / n
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default(size)


def main():
    N, M = W * SS, H * SS
    yy, xx = np.mgrid[0:M, 0:N]
    t = np.clip((xx / N) * 0.7 + (yy / M) * 0.3, 0, 1)[..., None]
    a, b = np.array((27, 24, 48)), np.array((48, 25, 52))  # deep indigo → plum
    bg = (a * (1 - t) + b * t).astype(np.uint8)
    img = Image.fromarray(np.dstack([bg, np.full((M, N), 255, np.uint8)]), "RGBA")

    # soft glow behind the mark
    glow = Image.new("RGBA", (N, M), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy, r = int(118 * SS), int(140 * SS), int(110 * SS)
    for i in range(30, 0, -1):
        gd.ellipse([cx - r * i / 30, cy - r * i / 30, cx + r * i / 30, cy + r * i / 30], fill=(242, 97, 122, int(5 + i * 0.4)))
    img = Image.alpha_composite(img, glow)

    mark = icons.render(150 * SS, padded=False)
    img.alpha_composite(mark, (int(43 * SS), int(65 * SS)))

    d = ImageDraw.Draw(img)
    title = font(["Poppins-Bold.ttf", "DejaVuSans-Bold.ttf"], 62 * SS)
    sub = font(["Poppins-Medium.ttf", "DejaVuSans.ttf"], 16 * SS)
    small = font(["Poppins-Italic.ttf", "DejaVuSans-Oblique.ttf"], 12 * SS)
    x = 218 * SS
    d.text((x, 78 * SS), "Snark", font=title, fill=(255, 255, 255, 255))
    d.text((x + 3 * SS, 158 * SS), "Spaces & pinned tabs", font=sub, fill=(217, 212, 253, 255))
    d.text((x + 3 * SS, 180 * SS), "in your side panel", font=sub, fill=(217, 212, 253, 255))
    d.text((x + 3 * SS, 214 * SS), "No account. No servers.", font=small, fill=(242, 160, 175, 255))

    OUT.parent.mkdir(exist_ok=True)
    img.resize((W, H), Image.LANCZOS).convert("RGB").save(OUT)
    print("wrote", OUT.relative_to(HERE.parent))


if __name__ == "__main__":
    main()
