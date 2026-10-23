# render-art

`pnpm --filter render-art build` regenerates `assets/` and `docs/review/art-*`, font
samples, photo comparisons and host pose evidence. Requirements: Node 24, pnpm,
`uv`, and `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (override
with `CHROME_PATH`). `uv` caches the small, pinned FontTools/Brotli dependencies.
No browser or SDK is downloaded. All Chrome instances use `--mute-audio` and are
closed in `finally`; the local HTTP server also closes. Synthetic photos are created
in memory; the generator never reads real camera images.

The generator evaluates `art.js`, the **unchanged** DEFS block and host assembly
from `game.js`, and the original stylesheet in Chrome. Artwork is captured per
element with `omitBackground: true` and the required `deviceScaleFactor`. Software
rasterization (`--disable-gpu`) and two settled frames on either side of a DOM
change keep filter working regions stable across scale changes. Every
sticker's filter bounds are measured; a shared padded coordinate space encloses
their union. Output compression is PNG DEFLATE, never palette quantization.

The build fails if sticker composites differ visibly on dark/light backgrounds,
if a font differs by any pixel, or if assets exceed 15 MiB. Photo decomposition is
tested at both scales against the actual filtered photo path. Detailed metrics,
source hashes and Chrome version are written to `docs/review/art-validation.json`.
The package tests also check hashes/dimensions, transparent margins, animation
atlases and reference eye/color metadata. `pnpm test` / `pnpm typecheck` cover this
package through the root scripts.

`pnpm --filter render-art check-reference` plays the bundled mockup through all
three rounds using Join, the hold button and built-in Skip, with audio muted and
external requests blocked. It checks that the mockup embeds the same `art.js` and
writes a scene/error receipt and finale screenshot to `docs/review/`.

PNG assets are deterministic for the same reference inputs, Chrome version and
FontTools version. `assets/manifest.json` contains a hash for each output; compare
manifests after a second build to check regeneration. Review evidence is separate
from the runtime asset budget.
