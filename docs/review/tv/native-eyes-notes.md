# Native eyes worker handoff · 2026-10-13

The preferred approach ships: pure 30 Hz reference pendulum trajectories, one RN
core Animated.Value per sticker, sampled x/y interpolation, native-driver timing,
JS elapsed-time restart state, and independent gentle 3.6 s idle loops. Web uses
the JS driver. Eyes have no Reanimated shared values/worklets, frame subscriptions,
per-frame JS physics or imperative prop loops. Native and web both use reference
pupil PNGs; white PNGs replay the actual .gg CSS at displayed radii with its 3 px
ring and shade. The unused 15 Hz React-state trial is removed.

## Run / reproduce

Use Node 24 / pnpm and source ~/vega/env. Build the VVD package with:

    pnpm --filter @snag/tv build:release --target aarch64 --use-system-js-bundles true --max-workers 2

Start the local relay and `node tv/tooling/control.mjs`; reverse ports 8787 and
8790 using `vega device start-port-forwarding --port PORT --forward false`.
Hold `mkdir ~/.snag-vvd.lock` for device operations; trap rmdir on exit. Install
`tv/build/aarch64-release/tv_aarch64.vpkg` using `vega device install-app
--packagePath PATH`, then launch `com.snagbrag.tv.main`. Mac output remains muted.

    node tv/tooling/verify-native.mjs eyes-lobby
    node tv/tooling/verify-native.mjs game
    TV_COMPARE_NATIVE=docs/review/tv/native-eyes-lobby.png node tv/tooling/compare-lobby.mjs

The armv7 package is `tv/build/armv7-release/tv_armv7.vpkg` (24,525,572 bytes).
`native-eyes-armv7-build.json` records its command, target and SHA-256. The existing
F-TV-06 workaround omits the extra pnpm separator so only armv7 is built. No build
packages or node_modules are committed.

## Verification

- `native-eyes-lobby.png`, `native-eyes-lobby.mp4`: full native lobby, 1920×1080,
  exactly 8 seconds / 480 frames at 60 fps from VVD console screenrecord, silent.
- `native-eyes-motion-frames.png`: sampled clip contact sheet for visual inspection.
- `native-verification.json`, `native-fast-game.jsonl`, `native-finale.png`: aarch64
  Release / Hermes / binary protocol; all eight scenes, 897 contiguous cues,
  completed all-bot game and zero native exceptions.
- `../tv-lobby-compare.png`: device lobby next to reference/screens/tv-01-lobby.png.
- `native-eyes-tests.txt`, `native-eyes-typecheck.txt`: root pnpm test/typecheck pass.
  Physics tests compare every sample against the actual mockup integrator and
  cover interruption continuity and closed independent idle loops.
- `web-verification.json`: full web game, all scenes, no exceptions.
- `web-eyes-motion.json`: all 16 web pupils move independently after settling.
- `native-eyes-probe.json`, `native-eyes-single-*.png`: single native-driver ready
  card measurements; fixed loop and sampler/idle transition presented normally.
  `native-eyes-compose-enabled-*.png` retain the earlier failed painted geometry.

## Deviations and limits

- The unchanged reference damping has a roughly 4–6 s tail, rather than the brief's
  estimated 1–1.5 s. Preserve the exact physics; sample until below 0.035 normalized
  displacement / 0.15 velocity, with a 10 s bound (DECISIONS.md).
- Pupil Views carry reference PNGs instead of painting rounded eye geometry at
  runtime. Both the native driver and React-state trial with painted circles
  retained stale/partial composed frames; bitmaps restored presentation. The
  isolated native-driver measurements passed. Do not infer a general native-driver
  failure or a proven internal cause (FRICTION.md F-TV-08).
- Native attachment of all existing diagnostic layers at once stalled on cold
  launch. They now attach automatically 150 ms apart after fonts/relay readiness,
  reaching all seven in 1.05 s; web mounts the complete stage immediately. Cold
  native launch and the complete game passed (FRICTION.md F-TV-09).
- Current TV sticker sizes are covered by exact white sprites. New unlisted sizes
  use the base sprite until the sizes list in tools/tv-foundation/generate.mjs is
  extended; its border would scale in that fallback.
- Scene files and the shared protocol are untouched. The comparison still shows
  inherited scene layout/type differences (title/tagline/join card and roster),
  plus the intended real room/URL and two-to-four-team adaptations. Scene polish
  remains with the scene workers; this worker did not alter it.
- armv7 is built, not device-tested; native verification ran on aarch64 VVD.
- No eye-scope work is unfinished. No paid API call, account, purchase, publish or
  push was made. Only bot/synthetic media was captured; no player media was stored.
