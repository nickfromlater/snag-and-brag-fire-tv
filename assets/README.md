# Mockup art

Regenerate with `pnpm install` then `pnpm --filter render-art build` (Node 24, `uv`,
system Chrome). Chrome is headless, muted and restricted to localhost. Conversion
dependencies are pinned; no browser/SDK downloads or paid APIs are used.

`manifest.json` records every PNG's physical size, pixels per reference unit
(`scale`), padded logical bounds and pixel location of reference `(0,0)` (`anchor`).
For a desired 120-unit sticker-box width `W`, draw the image at
`pixelSize * W/(120*scale)`, with top-left
`boxOrigin - anchor * W/(120*scale)`. The `192`/`384` suffix describes the box;
the padded files are 320×360 / 640×720, with anchors (64,72) / (128,144).
PNG compression is lossless. Files use straight RGBA with zero hidden RGB at zero
alpha; let the renderer premultiply them. Do not crop their padding.

**Object stickers:** art, paper border, ink edge and six-unit .42-ink shadow are
already baked in. Eyes are separate. `objects` preserves `OBJ` eye centers/radius
in box units and `col`. Apply the recorded holographic color effect to the art only.

**Photo stickers:** center-crop an opaque photo into `(10,10,100,100)`, radius 20.
Draw `shadow`, the photo through `mask` (`destination-in` on an offscreen surface),
then `overlay` above it. All three share the sticker's padded coordinates. Add eyes
last. `geometric-mask` is the ordinary rounded-rect coverage; the runtime `mask`
corrects edge coverage for this layer order. Calibration uses black/white synthetic
images through the unchanged full filter. Never persist player photos.

**Googly eyes:** draw `white-r*`, then `pupil-r*`, using native logical radii recorded
in `eyes.sprites`. Their ink ring and bottom inset shade stay three logical pixels;
do not scale the entire white sprite with the sticker. Other radii can use native
circles with those CSS parameters. Pupils scale freely: diameter `.54*2r`, inset
`.23*2r`; translate `(x*42%,y*42%)` of the pupil's own size. Sprites are rendered at 4×.

**Host:** `host/parts.json` contains raw SVG nodes/attributes, all brow paths,
original animation functions, formulas and pivots. PNGs are 2× of the 200×240
coordinate space, padded to preserve the hat/body. Draw in `drawOrder`; face parts
and monocle inherit the upper translation. Rotate the puppet around `(100,240)`.
Draw mouth/tongue/lids as the documented ellipses for continuous motion, or select
their constant-stroke atlas frame with `round(amount*32)` and its frame anchor.
Place the puppet in the unrotated host frame using `[.82,0,0,.82,13,11.1]`: frame
back, then puppet through frame-mask. `frame-front` is a standalone border export
for alternative background compositors. Rotate the frame -3° around `(90,84)`;
draw the Rubik 900 name tag as text. Frame stage origin is `(30,520)`; outer hop
pivot is `(100,200)`. Fractional PNG transforms resample edges; raw vectors preserve
the original continuous rendering. Atlas frames discretize ellipse motion to 1/32.

**Other art/fonts:** `props/vectors.json` inventories reactions, all crowns, trophy,
magnifier, stopwatch/arc, Brag-Off seam, controls, both dice and look-up TV; `house/`
contains background/furniture layers, a separate unframed object layer, and a full
1200×600 demo-feed panorama matching `houseURL`; object placements are in the manifest.
Reel arrows remain CSS border triangles (exact CSS
included). CSS boxes/text and procedural stage/particle drawing remain runtime work.
TTFs retain original names/outlines: `LilitaOne`, `RubikLight-Medium`,
`RubikLight-Bold`, `RubikLight-ExtraBold`, `RubikLight-Black` (400/500/700/800/900).
The OFL licenses are beside them.

Review [art-sheet.png](../docs/review/art-sheet.png), [validation metrics](../docs/review/art-validation.json)
and [font samples](../docs/review/fonts.png). Synthetic photo pairs show live SVG
left/layers right. Photo error is ≤1/255 per channel at both scales; fonts and sticker
composites are pixel-identical. Run `pnpm test` and `pnpm typecheck` at the repo root.
