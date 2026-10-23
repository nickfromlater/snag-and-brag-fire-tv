# Showcase capture

Run from the repository root with the existing Node, Chrome and ffmpeg. No browser,
SDK, AI account or audio download is needed. All actors are illustrated reference
objects. These tools cannot connect a live camera or invoke Bedrock/Polly.

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
pnpm install
pnpm --filter tvsim start -- --loopback --showcase --fast --seed 20261022
node tools/director/plan.mjs --out /tmp/snag-showcase-plan.json
```

The core option is `showcase: createShowcase(seed, script)`. Call
`game.playShowcase()` in an empty lobby to join the four actors on their cues. It
rejects external phone input and thumbnails in that session. `showcase: false` or
omitting it leaves normal games identical, including RNG consumption; the tests
compare a full game's cues, screens and final state. Nothing changes protocol v1.

`SNAG_SHOWCASE=1` and `SNAG_SHOWCASE_SEED=20261022` are the opt-in TV/relay-launch
configuration flags. `tvsim` already reads them. The TV worker can read the same
flags in its build/runtime configuration and pass `createShowcase` to its host;
no production relay flag, native bundle or toggle was changed here. Script fields
and the checked preset are in `shared/src/game/showcase.ts`.

The prompts are PINK, Something a PIRATE would steal, and The WEIRDEST thing you
can find. Names/brags are catalog entries, rather than AI substitutions. The final
Brag-Off ends ten percent from center, and Sockrates wins Showstopper with two
votes. Junk Drawer Gang leads after round two; Sock Goblins wins 429–347 in the
last round. The final cast totals are 429 / 307 / 347 / 135 in seat order. These
come from the ordinary point rules and awards, with no score override.

## Web rehearsal and gallery

```sh
TAKE="$HOME/builds/snag-and-brag/footage/web-rehearsal"
node tools/director/capture.mjs --target web --out "$TAKE" --seed 20261022
node tools/director/stills.mjs --from "$TAKE/capture.json" --out "$TAKE/gallery-export"
# Independent live still capture, without recording a movie:
node tools/director/stills.mjs --target web --out "$TAKE/gallery-live"
```

Masters, source segments, frame-accurate per-scene H.264 clips and the manifest
go outside git. By default `tools/director/previews/` gets one 1280×720 H.264
preview, the six 1920×1080 PNGs, the 1500×1000 Devpost composition, a cue log and
a receipt. Each committed file is checked against 10,000,000 bytes. A custom
`--preview-dir` is useful for additional takes. `capture.json` records the master
path and actual recorded timeline; `clip.mjs` exports storyboard pickups from it.

The web target runs the bundled mockup with guarded, in-memory script hooks.
Original fonts, SVG art, layout, timing constants and curves come from `reference/`.
The captured area is the TV canvas alone, without phone or simulator chrome.
Network requests are blocked and realtime AudioContext is disabled; Chrome also
launches with `--mute-audio`. The movie is silent. Mix the existing synthesized
game audio bank and room audio in the submission edit.

Web capture encodes at 30 fps. Its CDP timestamps determine frame repetition and
segment overlap; encoded rate is not a claim of 30 unique browser frames each
second. VVD window capture requests 60 fps. `--segment-seconds 60 --overlap-seconds 2`
exercises rollover more often. For a quick pipeline smoke, `--speed 4` compresses
the choreography; use the default `--speed 1` for review or editing footage.

At normal speed, stills are taken directly at checked live beats. The Pixel Judge
mask and beam are held for PNG encoding, then resumed, so a slow screenshot
cannot save a faded mask. The synthetic closest-20% mask comes from the real
shared judge, and is shown as a 24×24 lit-cell grid. The mockup's original random
10×10 scan squares are replaced only in this filming adapter. This is a synthetic
mask demonstration, not a result from a player photo. The 3:2 thumbnail rearranges
the existing lobby logo and stickers on the reference stage.

## VVD capture (native renderer toggle belongs to the TV worker)

`~/.snag-vvd.lock` is an exclusive mkdir lock. An occupied lock is never changed
or removed. The director releases only its own nonce-marked lock, including on
ordinary failure or Ctrl-C. If occupied, use the web commands above. A process
killed without cleanup can leave its own lock; the tool does not reclaim locks.

Native captures now use `spike/tooling/capture.py`: macOS 15+ ScreenCaptureKit
captures only the composed **Vega Virtual Device** window, without its title bar,
mouse pointer or audio. Start the existing VVD with `--gui=true --display-res
1920,1080`; headless capture is rejected. No SDK, browser or package download is
needed. The small Swift helper compiles into the system temporary directory.

The old `spike/tooling/console.py` remains for authenticated emulator controls and
explicit rejected-capture diagnostics. Its headless screenshots can show a stale
scene or an enlarged offscreen card despite live core/clock telemetry. Do not use
its pixels for acceptance. Counter evidence and the replacement's native frames
are in `docs/review/tv/visual/REPORT.md`.

The window recorder requests up to 60 fps, writes silent H.264 MP4, honors bitrate,
and validates actual dimensions, codec and recorded duration before accepting a
stop. Segments stay below 170 seconds here. Source segments are `.mp4`; final
encoding still uses CRF 28/preset slow and the 10 MB preview checks. The helper can
read legacy `.webm` output names, but writes MP4 bytes; new callers use `.mp4`.

```sh
# Terminal 1: deterministic host, initially held, loopback-only control endpoint
node tools/director/bridge.mjs --port 8790 --seed 20261022
# Terminal 2: only after the native TV worker's SHOWCASE renderer is attached
TAKE="$HOME/builds/snag-and-brag/footage/vvd-take-01"
node tools/director/capture.mjs --target vvd --bridge http://127.0.0.1:8790 --out "$TAKE" --segment-seconds 170 --overlap-seconds 2
node tools/director/stills.mjs --target vvd --bridge http://127.0.0.1:8790 --out "$TAKE/gallery-pickups"
```

The native renderer connects to `ws://127.0.0.1:8790/renderer` (or its VDA-forwarded
loopback port) only behind the showcase toggle and sends:

```json
{"t":"director-renderer","target":"vvd","width":1920,"height":1080}
```

It receives `{t:'director-frame', atMs, held, seeking, view: TvView, cues: CueEvent[]}`.
Use `atMs` as the renderer's clock, advancing it by local elapsed time between
packets while playing. Draw `view`, evaluate its existing declarative
motion stacks at their supplied elapsed times, and then consume the new cues.
On `seeking:true`, clear transient particles/audio/old scene elements, reset the
last-consumed cue sequence and paint
the complete snapshot; do not replay earlier cues. On `held:true`, retain the
pose and countdown at that clock value, without opening a pause menu. For the
judge's scan stage, render the existing `FindView.mask` bitset. This optional
transport is separate from the production phone protocol and carries no photos.

`GET /status` reports `rendererReady` only after the native renderer handshake.
Capture refuses an unattached renderer or a non-synthetic session. `GET /plan`
provides the allowlisted cue timeline. `POST /seek {atMs}` recreates and replays
the seeded host to that exact point while held; `/play`, `/hold`, `/reset` accept
empty JSON objects. Replay is fast and old transient cues are suppressed.

A single VVD recorder cannot overlap itself. Native segments reserve one second
of their 170-second limit for held preroll/recorder startup; the first timeline
segment ends at 169 seconds. For segment 2, the tool replays to 167 seconds and
records that overlapping section again. It never invents overlap
by duplicating the last two seconds of a clip. Segment files are named from the
scene cue log, and the edit removes each overlap exactly once. The web target
uses simultaneous encoders sharing the same timestamped frames for that overlap.

The native adapter is now wired behind `SNAG_SHOWCASE=1` in the TV build config.
For the nine-shot native gallery and a real fake-camera phone, use
`node tools/director/gallery.mjs` and the separate port-8791 bridge described in
`docs/gallery/GALLERY.md`. The ordinary local control server stays on port 8790.
Native seeks retain media controls, draw frozen declarative poses, clear transient
effects and keep the in-memory phone photo/thumbnail for pickups. The optional
`phoneScreen` frame member mirrors the scripted first seat into the real phone
protocol; photo bytes still travel only through the local relay and TV memory.
The core showcase cast continues to reject external input. Ordinary games omit
the build flag and use the existing relay host and clock.

`DIRECTOR_CHROME`, `DIRECTOR_FFMPEG`, `DIRECTOR_FFPROBE` override existing local
executables. `--bit-rate 8000000` sets the VVD window source bitrate. Captures are silent; this tooling makes no native compositor-FPS or device-audio claim.

## Verification

```sh
pnpm test
pnpm typecheck
```

The committed receipt in `previews/dry-run.json` lists actual duration, segment
coverage, codecs, sizes, scores and gallery beat checks. Saved-PNG verification
checks every lit mask cell against the synthetic judge mask, so a canvas behind
the art or a faded PNG cannot pass. `previews/checks.txt`
records root check summaries and the full-game simulator result. Source/master
files remain under the footage directory, with no raw WebM or large files in git.
