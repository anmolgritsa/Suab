# analyze-image.py - structural + color analysis of the reference image
from PIL import Image
from collections import Counter

im = Image.open(r"C:\Users\Anmol Bajpai\.jiva\uploads\image.png").convert("RGB")
W, H = im.size
px = im.load()
print(f"size: {W}x{H}")

# Dominant colors (quantized)
q = im.quantize(colors=12).convert("RGB")
cnt = Counter(q.getdata())
total = W * H
print("\n-- dominant colors (quantized) --")
for (r, g, b), n in cnt.most_common(12):
    print(f"  #{r:02x}{g:02x}{b:02x}  {100*n/total:5.1f}%")

# Row profile: average color + uniformity per row band (every 4px)
print("\n-- row bands (y, avg color, stddev) --")
import statistics
for y0 in range(0, H, 8):
    y1 = min(y0 + 8, H)
    rs, gs, bs = [], [], []
    for y in range(y0, y1):
        for x in range(0, W, 2):
            r, g, b = px[x, y]
            rs.append(r); gs.append(g); bs.append(b)
    ar, ag, ab = sum(rs)/len(rs), sum(gs)/len(gs), sum(bs)/len(bs)
    sd = statistics.pstdev(rs)  # red channel spread as uniformity proxy
    print(f"  y {y0:3d}-{y1:3d}: avg #{int(ar):02x}{int(ag):02x}{int(ab):02x}  sd {sd:5.1f}")

# Column profile for a middle band to detect card edges
print("\n-- column edges (color changes along x at several y positions) --")
for yy in (10, 40, 80, 140, 220, 300, 380, 440):
    edges = []
    prev = px[0, yy]
    for x in range(1, W):
        cur = px[x, yy]
        if sum(abs(a-b) for a, b in zip(cur, prev)) > 60:
            edges.append(x)
        prev = cur
    print(f"  y={yy:3d}: edges at x = {edges[:20]}")
