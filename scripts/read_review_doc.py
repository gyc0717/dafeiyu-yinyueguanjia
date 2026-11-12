"""Dump the review docx as readable text (headings + body + tables)."""
import sys

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph

path = r"C:\Users\gyc20\Desktop\体验走查与优化建议-2026-11-12.docx"
doc = Document(path)


def iter_blocks(document):
    body = document.element.body
    for child in body.iterchildren():
        tag = child.tag.split("}")[-1]
        if tag == "p":
            yield Paragraph(child, document)
        elif tag == "tbl":
            yield Table(child, document)


count = 0
for block in iter_blocks(doc):
    if isinstance(block, Paragraph):
        text = block.text.strip()
        if not text:
            continue
        style = (block.style.name or "").lower()
        prefix = ""
        if "heading" in style or "标题" in style:
            prefix = "## "
        print(prefix + text)
        count += 1
    else:
        rows = len(block.rows)
        cols = len(block.columns)
        print(f"[TABLE {rows}x{cols}]")
        for row in block.rows:
            cells = [c.text.strip().replace("\n", " / ") for c in row.cells]
            print("  | " + " | ".join(cells))
        count += 1

print(f"\n--- blocks: {count} ---")
print("images:", len(doc.inline_shapes))
