# Worker B review — 2026-10-13

Branch: `w/scene-b`. Hunt and Pixel Judge are implemented and web-verified. Native
acceptance is pending the shared foundation/device work; no native scene comparison
or clip is claimed as passing.

## Built

- Hunt: reference prompt card, color swatch/prompt art, stopwatch arc, four camera
  slots, 96×64 memory-only phone thumbnails, and native-driver house pans for bots.
  Source tracking integration and edge reticles are ported. Core-driven flash,
  mystery card slam, order medals, elapsed snag time, SNAGGED burst, first-snag
  ribbon, TIME toast, glow labels, READY stamps and existing sticker flights render
  on their semantic targets.
- Pixel Judge: centered header pills, snag-order mystery cards, eased flip face
  selection, photo/object stickers, scan beam and packed 10×10 shimmer, match bars,
  cubic percentage roll and cue-owned meter ticks, speed notes, point flights,
  winner banner and crown. The shell owns particles, host, HUD and sound playback.
- Generic stage additions are isolated in separate commits: `CameraFeed`,
  `CountdownDial`, `DotTexture`, `MotionNumber`, `PixelShimmer`, `FlipFaces`, SVG
  exports and cue timing helpers. Native thumbnail nearest-neighbour PNG generation
  stays entirely in memory. Reduced motion preserves bar proportions and readable
  card fronts. Scan callbacks stop at the end of the scan.
- Shared wire types and game rules are unchanged. Foundation audio/control fixes
  and the shared native world-effects fix are included. Local control receipts
  identify the runtime; native observers reject web peers.

## Run

Use Node 24, `pnpm install`, a mock relay and `pnpm --filter @snag/tv dev` as described
in `tv/SCENES.md`. Enter opens the lobby menu; select Play with bots and Start.

The isolated web review used:

```sh
AI_MODE=mock POLLY_MODE=mock PORT=8789 PUBLIC_URL=http://127.0.0.1:8789 pnpm --filter relay start
pnpm --filter @snag/tv exec vite --host 127.0.0.1 --port 5182 --strictPort
node tv/tooling/review-scene-b-web.mjs
node tv/tooling/compare-scene-b.mjs web
```

The review browser is muted and protected from parallel-worker hot reloads. Its
only images are synthetic rectangles generated in memory and sent through the
production relay thumbnail and photo paths.

## Verification and evidence

- Root `pnpm test`, `pnpm typecheck` and `pnpm lint` pass. The TV suite has 33 tests.
- The aarch64 Release builds successfully with SDK 0.24.12112 / CLI 1.4.2, the
  retained RN 0.72 runtime, system JS bundles and three workers. Build output is
  ignored and not committed.
- `web-worker-b.json` records completion, nine captures and zero exceptions. The
  review runs a full synthetic-photo game, a missing-snag case and a full all-bot
  game. It checks that a paused dial freezes and captures reduced motion.
- `../tv-hunt-web-compare.png` and `../tv-judge-web-compare.png` are explicitly
  labelled web comparisons. Individual `web-*.png` captures are in this directory.
- `worker-b-native-attempt.json` and `native-foundation-blocked.png` record the
  earlier pre-scene startup failure. The boot frame remained and the app later
  returned to the launcher. Browser traffic was excluded as native evidence.

## Design calls and adaptations

- Mockup labels below 16 px are enlarged to comply with the TV requirement. Long
  team captions may ellipsize; object/speed captions can use two lines.
- A missing snag uses the original sock bitmap, tilted with a small ink frown,
  on the same team-colored, dotted, ink-outlined card back. Its judge face says
  “Better luck next snag” and stays at zero. No object or photo is fabricated.
- Native flips use the permitted cosine scaleX squash with an unmirrored front;
  the face swaps at the core bezier's actual 90-degree crossing.
- Pixel shimmer is 100 cells packed into 15 SVG paths, rather than a browser
  canvas. Phone pixelation uses bounded in-memory decode/upscale because the Vega
  Image API has no nearest-neighbour sampling selector.
- Stopwatch readings follow the core deadline, including its shortened
  all-snags grace. Scenes do not reproduce the mockup's separate hunt clock.
- Comparisons use the seeded RED prompt and a synthetic rectangle; the supplied
  reference shots use PINK and cartoon finds. This is a fixture/content difference.

## Native work remaining

After the foundation is ready and the VVD lock is free: install this branch's
Release, capture hunt and judge states, record each full beat sequence at 60 fps,
generate native comparison sheets, and complete an isolated native all-bot game
with zero exceptions. Native photo-mask, pixelation and camera-motion visual QA
remain unaccepted.

The capture scripts are ready. For isolated acceptance, configure and build with
`TV_RELAY_URL=ws://127.0.0.1:8789/ws` and
`TV_CONTROL_URL=ws://127.0.0.1:8794`; the committed development config stays on the
normal endpoints. Start `tv/tooling/control.mjs` with `TV_CONTROL_PORT=8794` and
`TV_CONTROL_OUTPUT_DIR=docs/review/scene-b/control`. Acquire `~/.snag-vvd.lock`, write
the ownership marker `scene-b-codex` inside it, mute the Mac, then reverse 8789/8794
and install/launch according to `tv/SCENES.md`. Run
`node tv/tooling/review-scene-b-native.mjs`, then
`node tv/tooling/compare-scene-b.mjs native`. The script checks the lock marker and
waits for native relay/font readiness. It must not run while another worker holds
the lock. Leave the VVD running and release only your own lock when finished.

Amazon friction is recorded in `FRICTION.md` under the dated Worker B native
acceptance entry and F-TV-07; the original entries are preserved.
