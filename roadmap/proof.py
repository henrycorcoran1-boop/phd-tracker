#!/usr/bin/env python3
"""Rasterise the built PDF so each page can be inspected visually.

Usage:  python3 proof.py [first] [last]      (1-indexed, inclusive)
Writes build/proof/page-NN.png and prints the page count.
"""
import sys, os, glob
import pypdfium2 as pdfium

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, "build", "Corcoran_PhD_Roadmap_RevB.pdf")
OUT = os.path.join(HERE, "build", "proof")

doc = pdfium.PdfDocument(PDF)
n = len(doc)
first = int(sys.argv[1]) if len(sys.argv) > 1 else 1
last = int(sys.argv[2]) if len(sys.argv) > 2 else n
first, last = max(1, first), min(n, last)

os.makedirs(OUT, exist_ok=True)
for f in glob.glob(os.path.join(OUT, "page-*.png")):
    os.remove(f)

for i in range(first - 1, last):
    page = doc[i]
    bmp = page.render(scale=1.55)
    bmp.to_pil().save(os.path.join(OUT, f"page-{i+1:02d}.png"))

print(f"pages={n} rendered={first}..{last} -> {OUT}")
