# TV photo worker — 2026-10-13

The photo path uses one merged SVG Path, one animated Rect clip and once-per-find room-memory art composition. Judge and Showstopper groups center for two/three teams, and the HUD shows joined teams during play. The mask is held through the meter. Source JPEGs and transparent composed PNGs are in memory only; all committed captures use generated synthetic media.

## Native verification

- `photo-bisect-isolated/receipt.json` and `findings.md`: the original isolated photo, rounded clipping, eyes, 576-cell mask and four-judge cases all presented changing frames, with responsive snapshots and zero exceptions. The bisect completed within 45 minutes. Isolated success did not establish the cause of the full-game stall.
- `g2-native-e2e.json`: the full normal-speed headless phone plus bots acceptance receipt. All eight TV scenes, all eight phone screens including the finale, unchanged redaction assertions in all three rounds, no native/phone/audio errors. Audio enabled and reduced motion off. Local relay uses mock AI/voice, with Chrome's built-in fake camera.
- `../tv-g2-color-rush-reveal.mp4`: native 1920×1080 H.264 at encoded 60 fps, CRF 28 / slow, below 10 MB. Encoded rate is not a claim of unique rendered frames. The full Color Rush reveal includes mask lighting, banner/crown entrance, winner wobble, party palette and confetti.
- `../tv-judge-compare.png`: fresh native scan and scored frames next to the binding Pixel Judge reference. If console screenshot timing misses the short winner beat, the scored frame is extracted from the same native G2 video; the receipt records its exact timestamp.
- `photo-layout-two/receipt.json` and `photo-layout-three/receipt.json`: fresh native judge/Showstopper synthetic fixtures, normal speed, visible counters advance, snapshots responsive, zero exceptions. Early/late PNGs show centered groups and joined-only HUD chips.
- `native-photo-fanfare.json`: exact Ogg fanfare played cold and warm through the native production pool, advancing and completed, zero errors; Mac muted. The previous post-game completion timeout remains in `native-photo-fanfare-timeout.json`.
- `photo-root-tests.txt` / `photo-root-typecheck.txt`: root test and strict typecheck output. 396 tests pass across nine packages, including 66 TV tests. Native builds validate the manifest with zero errors.

Failed intermediate runs remain diagnostics. The first photo/path repair reached Showstopper tally before stalling; subsequent effect/attachment candidates reached more scenes but did not pass the full gate. A post-install final-candidate startup timeout is separate from the successful full-game receipt. A fresh VVD initially lost its reverse mappings after installation; reapplying them restored the native lobby. See the explicitly failing diagnostic JSONs and FRICTION.md.

## Reproduction

From the workspace root, use Node 24 and the installed SDK:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
source "$HOME/vega/env"
pnpm install
pnpm test
pnpm typecheck
```

Hold `~/.snag-vvd.lock` exclusively while using the VVD; this tooling requires an owner beginning `TV photo worker`. Keep the Mac muted. In separate terminals, run a mock relay and the local native control:

```sh
PORT=8789 PUBLIC_URL=http://localhost:8789 AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
TV_CONTROL_OUTPUT_DIR=/tmp/snag-tv-photo-control node tv/tooling/control.mjs
```

Start a 1920×1080 VVD and keep its parent terminal alive. Build and install the aarch64 Release app, then reapply both reverse ports after installation/launch:

```sh
vega virtual-device start --display-res 1920,1080
pnpm --filter @snag/tv exec react-native build-vega --build-type Release --target aarch64 --use-system-js-bundles true --max-workers 2
vega device install-app --dir tv -b Release
vega device launch-app --appName com.snagbrag.tv.main
vega exec vda reverse tcp:8787 tcp:8789
vega exec vda reverse tcp:8790 tcp:8790
TV_JOIN_ORIGIN=http://localhost:8789 node tv/tooling/capture-native.mjs g2
```

Use `TV_CAPTURE_REVIEW_ROOT=/tmp/...` for diagnostic runs so a failure cannot overwrite accepted evidence. Review the actual native video and stills. `node tv/tooling/compare-photo-judge.mjs [scored-frame-seconds]` creates the required comparison; the optional time selects a native video frame and records its provenance. `TV_PHOTO_BISECT_CASES=judge,show TV_PHOTO_BISECT_COUNT=2 TV_PHOTO_BISECT_OUT=/tmp/... node tv/tooling/bisect-photo-native.mjs` repeats the two-team fixtures; use count 3 for three teams.

The delivered app has `photoProbe: false`. The cold photo-only variant is a diagnostic build, not a delivered setting.

## Native adaptations and limits

The 24×24 wire mask and game scoring are unchanged. Native photo clipping applies the calibrated art alpha once to a 320×320 transparent PNG in room memory; web retains its SVG compositor. Particle physics is projected at 30 Hz and background interpolation at 20 Hz, keeping reference seeds, geometry, palettes, rates and counts. A single reactive TV view and batched frame/subscriber updates avoid repeated native commits. Newly mounted banner/crown slams start after layout attachment, preserving their reference curves and durations so a delayed commit cannot skip the entrance. Other motion follows the game clock.

Chrome GPU remains enabled because MediaPipe's CPU pipeline uses WebGL for input preparation; the unchanged three-round redaction assertion passes. The native reveal is silent for review; fanfare verification uses native player state and existing deterministic audio analysis, never listening aloud. Runtime evidence is from the aarch64 VVD. Armv7 delivery is built after all acceptance gates and is not a physical-device playback claim.

Final G2: 249.317 seconds, accepted scored frame at 21.2 seconds of the 25.333333-second / 3,822,270-byte native reveal. `native-judge-entrance-frames.png` preserves consecutive frames of the banner/crown slams and card wobble.

Amazon friction entries: F-TV-PHOTO-01, F-TV-PHOTO-02 and F-TV-PHOTO-03 in FRICTION.md. No paid APIs, accounts, purchases, publishing or external messages were used.

## Armv7 delivery

Rebuilt after steps 1–4 passed and atomically replaced `~/builds/snag-and-brag/tv_armv7-integrated.vpkg`. Size: 24,740,214 bytes. SHA-256: `f0ceac46b89cc9fea80154f0aa4c69bf83f5408e8ecb10cb189fa06c2c1cddb7`. The complete package archive reads successfully and the build reports zero manifest errors. See `photo-armv7-build.json` and `photo-armv7-build.txt`. No requested work remains unfinished; physical-device execution is outside this worker brief.
