"""Crop a captured artboard out of a screenshot (it sits on magenta), resize to the exact store
size and save as a 24-bit PNG (no alpha), as the Chrome Web Store asks.
   python3 tools/store/crop.py <capture.png> <out.png> <width> <height> [left|right stitch partner]"""
import sys
from PIL import Image

def is_mag(p): return p[0] > 225 and p[1] < 50 and p[2] > 225

def crop(path):
    im = Image.open(path).convert('RGB')
    W, H = im.size
    px = im.load()
    mid = H // 2
    right = next(x for x in range(W) if is_mag(px[x, mid]))
    top = next(y for y in range(H) if is_mag(px[min(W - 1, right + 6), y]))
    bottom = next(y for y in range(top + 10, H) if is_mag(px[6, y]))
    left = 0
    # 2px in from the magenta, so no pink fringe survives the resize
    return im.crop((left, top + 1, right - 2, bottom - 2))

if __name__ == '__main__':
    src, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    parts = src.split('+')
    if len(parts) == 2:  # left + right halves
        a, b = crop(parts[0]), crop(parts[1])
        hh = min(a.height, b.height)
        a = a.resize((round(a.width * hh / a.height), hh), Image.LANCZOS)
        b = b.resize((round(b.width * hh / b.height), hh), Image.LANCZOS)
        im = Image.new('RGB', (a.width + b.width, hh)); im.paste(a, (0, 0)); im.paste(b, (a.width, 0))
    else:
        im = crop(src)
    print(f'{src.split("/")[-1]}: artboard {im.size} -> {w}x{h} (scale {w / im.width:.3f}, aspect {im.width / im.height:.4f} vs {w / h:.4f})')
    im.resize((w, h), Image.LANCZOS).save(out, optimize=True)
