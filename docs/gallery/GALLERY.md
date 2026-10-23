# Native showcase gallery · 2026-10-14

Nine fresh, held VVD frames from the React Native for Vega build. The 1920×1080
PNG masters and their single-window capture receipts live in
`~/builds/snag-and-brag/footage/stills/`. The JPEGs here are 1280×720, each below
400,000 bytes. `thumbnail.png` is 1500×1000, below 1,500,000 bytes.

| Preview | Held moment |
|---|---|
| [01 lobby](01-lobby.jpg) | Real local relay QR; Sock Goblins and three bots joined |
| [02 prompt reel](02-prompt-reel.jpg) | PINK landed; host line complete |
| [03 hunt feeds](03-hunt-feeds.jpg) | Actual fake-camera phone thumbnail and three bot feeds |
| [04 Pixel Judge](04-pixel-judge.jpg) | Phone photo, actual mask, four scored cards and settled meters |
| [05 Brag-Off](05-brag-off-mash.jpg) | Final mash; tug off center; combo effect cleared of the title |
| [06 Showstopper](06-showstopper-win.jpg) | Sockrates wins two votes and turns holographic |
| [07 standings](07-standings-overtake.jpg) | Sock Goblins overtakes Junk Drawer Gang |
| [08 finale](08-finale.jpg) | Settled name, crown, all three points lines and Object of the Night |
| [09 pause](09-pause-menu.jpg) | Actual remote pause menu; yellow Resume focus ring |

[Color Rush](color-rush.mp4) runs at normal game speed from the reel through the
phone hunt, glow-up, all four judge reveals and the win. It is silent H.264;
encoded frame rate is not a claim of native compositor FPS. [Capture receipt](capture.json)
records dimensions, sizes, timeline positions, scores, master paths and numeric
phone evidence. [Checks](checks.txt) records root verification and visual QA.

The phone is the real web controller joined to the real local relay. Chrome uses
a temporary fake-camera Y4M made only from the project's pink glove bitmap. The
controller runs MediaPipe redaction and the shared closest-20% Pixel Judge before
uploading its JPEG and 72-byte mask. Photos and thumbnails remain in relay/TV/browser
memory; saved footage contains only this synthetic fixture. No AWS/paid calls,
real people, browser audio, simulator chrome or console screenshots.

## Reproduce

Use the existing Node 24, Vega SDK, system Chrome and ffmpeg. Build before tests:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
source ~/vega/env
pnpm install --frozen-lockfile
SNAG_SHOWCASE=1 node tv/tooling/configure.mjs
pnpm --filter @snag/tv assets
pnpm --filter @snag/tv exec react-native build-vega --build-type Release --target aarch64 --use-system-js-bundles true --max-workers 2
```

Use separate persistent terminals for the windowed VVD and the local services:

```sh
# Own ~/.snag-vvd.lock while preparing/installing the VVD. Never reclaim another
# worker's lock. Keep the terminal alive after the CLI reports ready.
vega virtual-device start --gui=true --display-res 1920,1080

HOST=127.0.0.1 PORT=8789 PUBLIC_URL=http://localhost:5175 AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
PHONE_RELAY_URL=http://localhost:8789 pnpm --filter phone dev --port 5175 --host 127.0.0.1
TV_CONTROL_OUTPUT_DIR=/tmp/snag-gallery-control node tv/tooling/control.mjs
node tools/director/bridge.mjs --port 8791 --seed 20261022
```

Install under the preparation lock, then release only your own lock before the
gallery command acquires its own capture lease:

```sh
vega device install-app --dir tv -b Release
vega exec vda reverse tcp:8787 tcp:8789
vega exec vda reverse tcp:8790 tcp:8790
vega exec vda reverse tcp:8791 tcp:8791
vega device launch-app --appName com.snagbrag.tv.main
node tools/director/gallery.mjs
node tools/director/thumbnail.mjs
node tv/tooling/configure.mjs # Restore the ordinary, showcase-off build config.
pnpm test
pnpm typecheck
```

An already attached native session can repeat the stills with
`node tools/director/gallery.mjs --stills-only`; its synthetic phone media must
still be in memory. The gallery tool records the movie before taking any stills,
so a second ScreenCaptureKit capture does not interrupt the recorder. If a cold
native launch stops responding to the control/phone sockets, terminate/relaunch
the same package before filming.

## Deliberate adaptations

- The requested third-place points override the reference CSS's hidden span.
  Its block remains 74 px tall; rank 3 uses 28 px Lilita and points use 16 px Rubik.
- The explicit build flag connects the native scenes to the director clock.
  Held poses use the existing animation-stack math without opening a pause menu;
  seeks clear transient effects while retaining the media-control registration.
  Normal games and protocol v1 are unchanged.
- The all-scored judge pickup retains the phone's real mask at its full-meter
  hold and colors it lime, as the director's web mask demo does. This filming pose
  is opt-in. The hunt pickup retains the actual tiny phone thumbnail in memory.
- The clip plays the complete native round at speed 1, then ends with a two-second
  hold of that session's native judge pickup. This makes the completed host line,
  mask and HUD points readable. Live native host text and point flights can lag
  the director's core winner beat; switching motion drivers while recording also
  caused blank art. The end hold uses captured pixels, without altering the image.
- Native object holograms add the reference's 2.2-second hue cycle using four
  pre-rendered hue keyframes from the original art, beneath the existing rainbow
  sheen. The Showstopper pickup holds the half-cycle pose after awards settle.
  Crossfades approximate continuous CSS hue rotation; geometry and eyes
  remain the project's. Run `node tools/director/bake-holograms.mjs` then TV assets
  generation to recreate them. Photo holograms retain the existing rendering path.
- Thumbnail v2 keeps the director logo/stickers, moves the lower sock to leave
  room for the added phone, and assembles the host's glee pose from `assets/host/parts.json`.
  The phone silhouette is an unbranded ink/paper/yolk SVG.

All requested gallery work is complete. This is VVD evidence; no retail-stick
performance or native audio gate is claimed. Amazon-tool observations are appended
to `FRICTION.md` under the gallery heading dated 2026-10-14.
