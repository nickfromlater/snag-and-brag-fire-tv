# Native Vega platform probe

This is a throwaway capability/performance probe, not the game. It runs as native
React Native (RN 0.72 / Amazon runtime 2) and never embeds a WebView. See
[PLATFORM.md](../../docs/spike/PLATFORM.md) for results and known limits.

## Reproduce on the installed SDK

From the repository root, mute the Mac before any audio test:

```sh
osascript -e 'set volume output muted true'
source ~/vega/env
cd spike/vega-app
npm ci --legacy-peer-deps --cache ../.cache/npm --no-audit --no-fund
# If npm 11 blocks the package's postinstall script, run this official script:
bash node_modules/@amazon-devices/react-native-kepler/scripts/kepler/postinstall.sh
npm run typecheck
npm run build:release -- --target aarch64 --use-system-js-bundles true --max-workers 3
# Physical 4K Select package (OS 1.2, armv7; do not install before owner enables dev mode):
npm run build:release -- --target armv7 --use-system-js-bundles true --max-workers 3
```

`vega build` alone packages native artifacts and does not create this app's JS
bundle. Use the RN build command above. CLI-generated VPKG paths vary; in this
SDK the simulator file is:

```
build/private/kepler/@amazon-devices/vegaspike/undefined/vega/aarch64/Release/@amazon-devices/vegaspike_aarch64.vpkg
```

Start VVD in a terminal you keep open (`--no-gui` works with clean console captures):

```sh
source ~/vega/env
vega virtual-device start --no-gui
```

In another terminal, from this app directory:

```sh
node relay.cjs
```

Then connect the local fixture service and launch:

```sh
source ~/vega/env
vega exec vda reverse tcp:7071 tcp:7071
vega run-app 'build/private/kepler/@amazon-devices/vegaspike/undefined/vega/aarch64/Release/@amazon-devices/vegaspike_aarch64.vpkg' com.snagbrag.spike.main
```

Launch can block after the screen is already up; run it in a dedicated/background
terminal. If VVD exits when its command runner exits, keep the parent terminal
session alive. No account registration is required for these local tests.

## Controls and evidence

From the repository root:

```sh
node spike/vega-app/control.cjs case full20
node spike/vega-app/control.cjs case full40
node spike/vega-app/control.cjs audio
node spike/vega-app/control.cjs spring
node spike/vega-app/control.cjs snapshot
vega exec vda shell 'inputd-cli button_press KEY_ENTER'
vega exec vda shell 'inputd-cli button_press KEY_BACK'
vega exec vda shell 'inputd-cli button_press KEY_PLAYPAUSE'
vega exec vda shell 'inputd-cli button_press KEY_FASTFORWARD'
vega exec vda shell 'inputd-cli button_press KEY_MENU'
```

Arrow keys are KEY_UP/DOWN/LEFT/RIGHT. Native events use `skip_forward` for FF.
Select triggers the native spring on the focused control. Back displays a confirm
and returns true; Select on Resume closes it. Play/Pause toggles the test confirm.
FF advances to another workload. `gl20`/`gl40` are **known failing composition
experiments**; switch back to `full20` to restore RN UI. They are preserved to make
the GL friction report reproducible, not presented as a production renderer.

The localhost relay sends four distinct 96×64 JPEGs at 3 Hz and echoes binary
frames. A legal unique JPEG COM segment forces a fresh data URI/native decode.
It only uses generated calibration pictures, never phone photographs. It writes
small numeric/boolean telemetry to `docs/spike/evidence/runtime.jsonl`; no JPEG
bytes, audio contents, tokens or credentials enter logs. Its control socket is
bound to 127.0.0.1, not an externally exposed service. WSS/TLS is not tested.

The FPS label is deliberately **JS updates/s**, not native presentation FPS.
Vega's rAF callback provided no timestamp in this runtime, so the app takes
performance.now at handler entry. The comparison suite is:

```sh
python3 spike/tooling/benchmark.py
```

It takes about five minutes and captures six native screenshots. Run without
other capture/profiler work for the cleanest relative readings. Do not infer
retail GPU performance from VVD. The report contains native Perfetto results
alongside JS cadence. Summarize the recorded blocks with
`python3 spike/tooling/analyze-results.py`. For native traces, use a real terminal:

```sh
vega exec perf record --app-name com.snagbrag.spike \
  --device-serial-number emulator-5554 --recording-timeout 10 \
  --disable-telemetry --output-dir <absolute-worktree-cache-directory>
# After the prompt: s to start, then q after recording ends to post-process.
```

Clean screenshot/recording commands are in PLATFORM.md and `console.py`.
The emulator authentication token stays outside the repository and is never printed.

## Assets and scope

- 26 original SVG stickers from `reference/src/art.js` are pre-rendered at 2×;
  40-sprite cases repeat some sources. No art was redrawn.
- Lilita One and Rubik come from the reference WOFF2 bundle, converted to TTF.
  Their OFL licenses are included. The display title uses actual Lilita glyph
  paths for a 12 px stroke workaround; other text loads fonts at runtime.
- WAVs/MP3s are deterministic calibration tones/chords for overlap and timing.
  **They are not the final game audio.** Production SFX/music must be rendered
  from the approved mockup's synthesizer.
- The QR encodes `https://snagbrag.example/spike/K7QF`, a fixture, not a deployed
  phone-pairing service. Apple Vision independently decoded its native screenshot.
- `GLStage.tsx` probes a documented native port; failure is reported honestly.

Optional regeneration uses already installed `rsvg-convert` and ffmpeg, plus
fontTools/Brotli/Pillow in a local virtualenv:

```sh
node spike/tooling/generate-assets.cjs
spike/.cache/pyenv/bin/python spike/tooling/generate-fixtures.py
for name in music sfx1 sfx2 sfx3; do
  ffmpeg -v error -y -i "spike/vega-app/src/assets/audio/$name.wav" \
    -codec:a libmp3lame -b:a 128k "spike/vega-app/assets/raw/$name.mp3"
done
```

The font generator preserves original family names. AudioPlayer uses root
`assets/raw` paths (`/pkg/assets/raw/music.mp3`), rather than Image asset URIs.
See the friction log for the failed URI/format trial.

Stop the app with `vega device terminate-app --appName com.snagbrag.spike.main`;
stop the relay with Ctrl-C. The installed SDK/VVD remains available. Never publish
this probe to the Appstore.
