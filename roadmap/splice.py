#!/usr/bin/env python3
"""Take page 1 from the first PDF and pages 2..n from the second.

Both inputs are renders of the same HTML with identical pagination, differing
only in whether the running foot is drawn. The result is a document whose cover
carries no page number while every other page does.

Usage:  python3 splice.py cover.pdf body.pdf out.pdf
"""
import sys
import pypdfium2 as pdfium

cover_path, body_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]

cover = pdfium.PdfDocument(cover_path)
body = pdfium.PdfDocument(body_path)

out = pdfium.PdfDocument.new()
out.import_pages(cover, [0])
if len(body) > 1:
    out.import_pages(body, list(range(1, len(body))))

out.save(out_path)
print(f"spliced {len(out)} pages -> {out_path}")
