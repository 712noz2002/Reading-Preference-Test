#!/usr/bin/env python3
"""Generate css/icons.css from assets/icons/*.svg.

Browsers refuse to load a CSS mask-image from a separate file:// document, so
each exported Figma icon is inlined as a data: URI. The .svg files on disk stay
the source of truth -- re-run this script after replacing any of them.
"""
import pathlib, urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "icons"
OUT = ROOT / "css" / "icons.css"

lines = [
    "/* ==========================================================================",
    "   안심ON — Icon registry (GENERATED — edit assets/icons/*.svg instead)",
    "   Run: python3 tools/build-icons.py",
    "   ========================================================================== */",
    "",
]

for svg in sorted(SRC.glob("*.svg")):
    raw = svg.read_text().strip()
    uri = "data:image/svg+xml," + urllib.parse.quote(raw, safe="")
    lines.append('.i-%s { --icon-url: url("%s"); }' % (svg.stem, uri))

OUT.write_text("\n".join(lines) + "\n")
print(f"{OUT.relative_to(ROOT)} — {len(list(SRC.glob('*.svg')))} icons")
