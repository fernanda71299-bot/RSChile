from PIL import Image, ImageDraw
import math

def rounded_bg(size, radius_ratio=0.22):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    radius = int(size * radius_ratio)
    # dark base
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=(10, 10, 10, 255))
    # gold->orange diagonal-ish glow using concentric arcs (simple radial approximation)
    cx, cy = size * 0.5, size * 0.42
    max_r = size * 0.75
    steps = 60
    for i in range(steps, 0, -1):
        t = i / steps
        r = max_r * t
        # interpolate gold (255,215,0) -> orange (255,140,0) -> transparent at edge
        gold = (255, 215, 0)
        orange = (255, 120, 0)
        mix = 1 - t
        col = tuple(int(gold[j] * (1 - mix) + orange[j] * mix) for j in range(3))
        alpha = int(70 * t)
        overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay)
        od.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col + (alpha,))
        img = Image.alpha_composite(img, overlay)
    # re-apply rounded mask so glow doesn't spill past rounded corners
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

def draw_bolt(img, size):
    draw = ImageDraw.Draw(img)
    s = size
    # lightning bolt polygon, centered, proportionate
    pts = [
        (0.58 * s, 0.10 * s),
        (0.30 * s, 0.56 * s),
        (0.46 * s, 0.56 * s),
        (0.40 * s, 0.90 * s),
        (0.72 * s, 0.42 * s),
        (0.54 * s, 0.42 * s),
    ]
    draw.polygon(pts, fill=(255, 255, 255, 255))
    return img

def make(size, path, safe_pad=0.0):
    img = rounded_bg(size)
    if safe_pad:
        # draw bolt smaller, centered, for maskable safe zone
        inner = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        inner = draw_bolt(inner, size)
        pad = int(size * safe_pad)
        inner = inner.resize((size - 2 * pad, size - 2 * pad))
        img.paste(inner, (pad, pad), inner)
    else:
        img = draw_bolt(img, size)
    img.save(path)

if __name__ == "__main__":
    import os
    os.makedirs("public/icons", exist_ok=True)
    make(192, "public/icons/icon-192.png")
    make(512, "public/icons/icon-512.png")
    make(512, "public/icons/icon-maskable-512.png", safe_pad=0.14)
    make(180, "public/icons/apple-touch-icon.png")
    print("icons done")
