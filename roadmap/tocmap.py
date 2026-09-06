#!/usr/bin/env python3
"""Resolve contents-page numbers from the rendered PDF.

Reads the data-t targets out of src/01-frontmatter.html, finds the first page
of the built PDF (after the front matter) whose text contains each target, and
writes build/toc-pages.json. build.mjs substitutes those numbers on the next
run, so the sequence is: build, tocmap, build.

Matching strips all whitespace on both sides, so a target may be written to
span adjacent inline elements, for example "B3Fieldwork".
"""
import json
import os
import re
import sys

import pypdfium2 as pdfium

HERE = os.path.dirname(os.path.abspath(__file__))
PDF = os.path.join(HERE, "build", "Corcoran_PhD_Roadmap_RevB.pdf")
FRONT = os.path.join(HERE, "src", "01-frontmatter.html")
OUT = os.path.join(HERE, "build", "toc-pages.json")

# Last line of the front matter; content pages start after the page holding it.
FRONT_MATTER_SENTINEL = "whicharetheethicsapplicationandtheaccessnegotiation"


def squash(s: str) -> str:
    return re.sub(r"\s+", "", s).casefold()


targets = re.findall(r'data-t="([^"]+)"', open(FRONT, encoding="utf-8").read())
if not targets:
    sys.exit("no data-t targets found in the front matter")

doc = pdfium.PdfDocument(PDF)
pages = [squash(p.get_textpage().get_text_range()) for p in doc]

start = 0
for i, text in enumerate(pages):
    if FRONT_MATTER_SENTINEL in text:
        start = i + 1
if start == 0:
    print("! front-matter sentinel not found; searching from page 2")
    start = 1

mapping, missing = {}, []
for t in targets:
    needle = squash(t)
    hit = next((i + 1 for i in range(start, len(pages)) if needle in pages[i]), None)
    if hit is None:
        missing.append(t)
    else:
        mapping[t] = hit

os.makedirs(os.path.dirname(OUT), exist_ok=True)
json.dump(mapping, open(OUT, "w"), indent=1, sort_keys=True)

print(f"resolved {len(mapping)}/{len(targets)} contents targets (content starts p{start + 1})")
for t in missing:
    print(f"  ! unresolved: {t}")

# Targets appear in document order, so a resolved page that goes backwards is
# almost always a collision with an earlier mention of the same phrase.
prev_t, prev_p = None, 0
for t in targets:
    p = mapping.get(t)
    if p is None:
        continue
    if p < prev_p:
        print(f"  ! out of order: '{t}' -> p{p}, after '{prev_t}' -> p{prev_p}")
    prev_t, prev_p = t, p
