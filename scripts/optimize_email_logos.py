#!/usr/bin/env python3
"""Optimize DGC logo assets for email use (web-hosted, small, crisp)."""
import os
from PIL import Image

SRC = "/home/ubuntu/dgc-arcade-v2/artifacts/dgc-arcade/public/email-assets"

# wordmarks: target width 600 (retina-ish for ~280-300 display). icons: target 240.
WORDMARK_W = 600
ICON_W = 240

wordmarks = [f for f in os.listdir(SRC) if "Wordmark" in f]
icons = [f for f in os.listdir(SRC) if "Wordmark" not in f and f.endswith(".png")]

def optimize(fname, target_w):
    path = os.path.join(SRC, fname)
    im = Image.open(path).convert("RGBA")
    w, h = im.size
    if w > target_w:
        new_h = int(h * target_w / w)
        im = im.resize((target_w, new_h), Image.LANCZOS)
    # Composite onto black background (logos are on black) then save as optimized PNG
    bg = Image.new("RGBA", im.size, (0, 0, 0, 255))
    bg.alpha_composite(im)
    out = bg.convert("RGB")
    out.save(path, "PNG", optimize=True)
    size_kb = round(os.path.getsize(path) / 1024)
    print(f"{fname}: {im.size} -> {size_kb}KB")

print("=== WORDMARKS ===")
for f in sorted(wordmarks):
    optimize(f, WORDMARK_W)
print("=== ICONS ===")
for f in sorted(icons):
    optimize(f, ICON_W)
