# /// script
# requires-python = ">=3.11"
# dependencies = ["fonttools[woff]==4.61.1", "brotli==1.2.0"]
# ///
"""Decode the supplied WOFF2 containers; keep outlines, names and timestamps intact."""
import json
import sys
from pathlib import Path
import fontTools
from fontTools.ttLib import TTFont

root = Path(sys.argv[1])
out = root / "assets/fonts"
out.mkdir(parents=True, exist_ok=True)
report = []
for source in sorted((root / "reference/fonts").glob("*.woff2")):
    font = TTFont(source, recalcTimestamp=False)
    if font.sfntVersion != "\x00\x01\x00\x00":
        raise ValueError(f"{source.name} is not a TrueType outline font")
    if "fvar" in font:
        raise ValueError(f"{source.name} is variable; do not silently change its outlines")
    original_glyphs = font.getGlyphOrder()
    original_metrics = dict(font["hmtx"].metrics)
    font.flavor = None
    dest = out / source.with_suffix(".ttf").name
    font.save(dest, reorderTables=False)
    decoded = TTFont(dest, recalcTimestamp=False)
    assert decoded.getGlyphOrder() == original_glyphs
    assert decoded["hmtx"].metrics == original_metrics
    report.append({"file": str(dest.relative_to(root)), "source": str(source.relative_to(root)),
                   "glyphCount": len(original_glyphs), "weight": decoded["OS/2"].usWeightClass,
                   "postScriptName": decoded["name"].getDebugName(6), "fontTools": fontTools.__version__})
print(json.dumps(report))
