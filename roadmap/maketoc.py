#!/usr/bin/env python3
"""Generate the contents, list of figures and list of tables from the sources.

Scans the HTML partials in build order, mirrors the CSS counters that number
the headings and captions, and rewrites the three generated blocks inside
src/01-frontmatter.html between their marker comments. Page numbers are left
as placeholders for tocmap.py to resolve from the rendered PDF.

Build sequence:  maketoc -> build -> tocmap -> build
"""
import html
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "src")
FRONT = os.path.join(SRC, "01-frontmatter.html")

# Build order, excluding the cover and the front matter itself.
PARTIALS = [
    "01b-atglance.html", "02-programme.html", "03-theory.html",
    "04a-parameters.html", "04-infrastructure.html",
    "05-workstream-a.html", "06-workstream-b.html", "07-workstream-c.html",
    "08-workstream-d.html", "09-workstream-e.html", "10-control.html",
    "11-appendices.html", "12-references.html", "12b-references.html",
]

TAG = re.compile(r"<[^>]+>")
PART_OF = {
    "01b": "At a glance", "02": "Part One", "03": "Part One",
    "04a": "Part Two", "04-": "Part Two",
    "05": "Part Three", "06": "Part Three", "07": "Part Three",
    "08": "Part Three", "09": "Part Three",
    "10": "Part Four", "11": "Appendices", "12": "Appendices",
}
PART_TITLE = {
    "At a glance": "At a glance",
    "Part One": "Part One &nbsp;&middot;&nbsp; Programme architecture",
    "Part Two": "Part Two &nbsp;&middot;&nbsp; Design and infrastructure",
    "Part Three": "Part Three &nbsp;&middot;&nbsp; The five workstreams",
    "Part Four": "Part Four &nbsp;&middot;&nbsp; Sequencing and control",
    "Appendices": "Appendices",
}


def strip(fragment: str) -> str:
    """Drop any nested <span class="sub"> then remove markup and unescape."""
    fragment = re.sub(r'<span class="sub">.*?</span>', "", fragment, flags=re.S)
    return html.unescape(TAG.sub("", fragment)).strip()


def part_key(filename: str) -> str:
    for prefix, part in PART_OF.items():
        if filename.startswith(prefix):
            return part
    return "Appendices"


entries, figures, tables = [], [], []
h1 = h2 = fig = tbl = 0
chapter_label = ""

for name in PARTIALS:
    path = os.path.join(SRC, name)
    if not os.path.exists(path):
        continue
    text = open(path, encoding="utf-8").read()
    part = part_key(name)

    for m in re.finditer(
        r'<div class="chapter-label">(.*?)</div>'
        r'|<h1([^>]*)>(.*?)</h1>'
        r'|<h2([^>]*)>(.*?)</h2>'
        r'|<span class="stage-ref">(.*?)</span>\s*<span class="stage-name">(.*?)</span>\s*'
        r'<span class="stage-meta">(.*?)</span>'
        r'|<div class="caption (fig|tbl)(?: above)?">(.*?)</div>',
        text, flags=re.S,
    ):
        if m.group(1) is not None:
            chapter_label = strip(m.group(1))
        elif m.group(3) is not None:
            attrs, title = m.group(2), strip(m.group(3))
            h2 = 0
            if "unnumbered" in attrs:
                # Appendix and front-matter chapters carry their plate as the label.
                entries.append((part, "l1", chapter_label, title,
                                f"{chapter_label}{title}"))
            else:
                h1 += 1
                entries.append((part, "l1", str(h1), title, f"{h1}  {title}"))
        elif m.group(5) is not None:
            attrs, title = m.group(4), strip(m.group(5))
            if "unnumbered" in attrs:
                continue
            h2 += 1
            ref = f"{h1}.{h2}"
            entries.append((part, "l2", ref, title, f"{ref}  {title}"))
        elif m.group(6) is not None:
            ref, title, meta = strip(m.group(6)), strip(m.group(7)), strip(m.group(8))
            entries.append((part, "l3", ref, title, f"{ref}{title}{meta[:14]}"))
        elif m.group(9) is not None:
            kind, caption = m.group(9), strip(m.group(10))
            if kind == "fig":
                fig += 1
                figures.append((fig, caption))
            else:
                tbl += 1
                tables.append((tbl, caption))


def short(caption: str, limit: int = 74) -> str:
    """First sentence of a caption, trimmed for the list entry."""
    head = re.split(r"(?<=[a-z0-9)])\. ", caption)[0].rstrip(".")
    return head if len(head) <= limit else head[: limit - 1].rsplit(" ", 1)[0] + "…"


out, current = [], None
for part, level, ref, title, target in entries:
    if part != current:
        out.append(f'    <div class="toc-part">{PART_TITLE[part]}</div>')
        current = part
    t = html.escape(target, quote=True)
    if level == "l1":
        out.append(f'    <div class="l1">{html.escape(ref)} &nbsp;{html.escape(title)}'
                   f' <span class="pg" data-t="{t}">00</span></div>')
    elif level == "l2":
        out.append(f'    <div class="l2">{html.escape(ref)} &nbsp;{html.escape(title)}'
                   f' <span class="pg" data-t="{t}">00</span></div>')
    else:
        out.append(f'    <div class="l3"><span class="sref">{html.escape(ref)}</span>'
                   f'{html.escape(title)} <span class="pg" data-t="{t}">00</span></div>')

lof = [f'    <div><span class="ref">Figure {n}</span> {html.escape(short(c))}'
       f' <span class="pg" data-t="{html.escape("Figure %d – %s" % (n, c[:46]), quote=True)}">00</span></div>'
       for n, c in figures]
lot = [f'    <div><span class="ref">Table {n}</span> {html.escape(short(c))}'
       f' <span class="pg" data-t="{html.escape("Table %d – %s" % (n, c[:46]), quote=True)}">00</span></div>'
       for n, c in tables]

front = open(FRONT, encoding="utf-8").read()
for marker, block in (("TOC", out), ("LOF", lof), ("LOT", lot)):
    front = re.sub(
        rf"(<!-- {marker}:START -->).*?(<!-- {marker}:END -->)",
        lambda m, b=block: m.group(1) + "\n" + "\n".join(b) + "\n" + m.group(2),
        front, flags=re.S,
    )
open(FRONT, "w", encoding="utf-8").write(front)

print(f"contents: {len(entries)} entries, {len(figures)} figures, {len(tables)} tables")
