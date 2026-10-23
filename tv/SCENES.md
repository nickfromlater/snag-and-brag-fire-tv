# Building a TV scene

The production app is native React Native on Vega OS, with a 1280 × 720 logical stage.
Chrome is an iteration target. Native screenshots and recordings decide acceptance.
The shared core owns all game rules, deadlines, scores, host copy and choreography.

Start with one file in `src/scenes/`. Import React and all UI through `../stage`, and
types/data through `@snag/shared`. These are the only two allowed imports. Add the scene
to the registry in `src/scenes.tsx`. Do not implement a second game state machine.
Narrow `view.content.k` before reading the scene's data. The foundation lobby is finished;
intro, hunt, judge, brag, show, stand and champ are intentionally data-driven scaffolds.

## Primitive APIs

- `Stage`: centered 1280 × 720, scaled to the display (1.5 at 1080p).
- `Box`: absolute logical `x,y,width,height`; optional `rotate,opacity,style,target`.
- `Motion`: Box plus a required semantic `target`. Evaluates the core's animation stack,
  including a late mount, frozen pause, spring curves and keyframes. Keep the target's
  base bounds stable. Width/top/left choreography uses transforms to avoid frame layout.
- `StrokedText`: `text,size,color,stroke,shadow,spacing,width,align`. Runtime strings
  use the bounded Lilita glyph outline cache. Defaults: 88 px, 10 px ink, 8 px hard shadow.
- `Label`: Rubik, `size,color,weight,lines,style`. Sizes clamp to 16 logical pixels.
- `Card`: Box plus `fill,border,radius,shadow`; defaults paper/5/28/10.
- `Pill`: Box plus `text,fill,color,size,spacing`, or children; defaults uppercase
  20 px, 3 px letter spacing, 4 px border and 6 px shadow.
- `Badge`: `team:{color,mono},size`. `Chip` adds name, rolling score and leader crown.
- `Sticker`: `obj,size,eyes,target,parentMotion`. Original manifest bitmap and eye physics.
  Eye coordinates use the 120-unit sticker box. `eyes:false` suppresses eyes.
- `PhotoSticker`: `photoId,size,eyes,target`; memory-only relay fetch and die-cut overlay.
  `FindSticker` chooses the photo or object art from an authoritative `FindView`.
- `Bitmap`: manifest `id,x,y,scale,width,height`. Placement respects source overflow/anchors.
- `GooglyEyes`: `eyes,size,target,parentMotion`; exact damped pendulum and bounded pupil.
- `Reel`: prompt cards, landed state and authoritative beat time. `Timer`: core deadline.
- `FeedImage`: one of four persistent decode slots; `index,width,height,label`.
- `Spring`: native Reanimated spring presets. Prefer core `Motion` for scripted beats.
- `MarqueeLights`: perimeter lights with fast chase and an 800ms landing flash, using two animated drawing layers.
- `ScrollingStripes`: a clipped 115-degree texture, with optional `horizontalScale` compensation for a transformed fill.
- `RollingText`: Lilita digit outlines driven by an authoritative `MotionState` timeline, without per-frame React state.
- `displayLines/displayWidth`: cached Lilita measurements for bounded runtime names.
- `Background, Hud, Host, Ticker, ParticleField, CuePlayer, Remote`: owned by the shell.
  Scenes never duplicate these layers.

Semantic targets are listed in `docs/game-core.md`. Register bounds through Box/Motion
for anchor-based confetti, rings, votes, point arcs and sticker flights. Physical phones
have no on-stage DOM coordinates; their flight origin is below the stage. Draw from
`TvView` first. Transient cues provide effects, not the authoritative state.

## Local iteration

From the repo root:

```sh
export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
pnpm install
pnpm --filter @snag/tv assets
AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
pnpm --filter @snag/tv dev
```

Open http://127.0.0.1:5174. Enter is Select, Escape is Back, Space is Play/Pause,
F skips the phase, arrows move menu focus, F1 opens debug. The same native scene files
run through react-native-web and the SVG web adapter. Web cannot use Polygon, Polyline
or Pattern: lint enforces the Vega port's limits. `pnpm --filter @snag/tv verify:web`
captures a muted 1080p lobby/menu and runs all three rounds with bots.

`tooling/configure.mjs` reads `TV_RELAY_URL` (include `/ws`), `TV_DEBUG` and
`TV_OFFLINE`. It writes only public configuration. Production credentials remain in
relay memory. A native local relay uses VDA reverse forwarding on 8787.

## VVD build and acceptance

Acquire the shared device lock before starting, installing, launching, injecting keys
or recording. Keep the VVD process alive, and remove the lock when finished.

```sh
mkdir ~/.snag-vvd.lock
osascript -e 'set volume output muted true'
source ~/vega/env
vega virtual-device start --no-gui
pnpm --filter @snag/tv build:release --target aarch64 --use-system-js-bundles true --max-workers 3
vega exec vda reverse tcp:8787 tcp:8787
vega exec vda reverse tcp:8790 tcp:8790
node tv/tooling/control.mjs
vega device install-app --packagePath tv/build/private/kepler/tv/undefined/vega/aarch64/Release/tv_aarch64.vpkg
vega device launch-app --appName com.snagbrag.tv.main
```

For the physical-device package substitute `--target armv7`. Do not put a literal
`--` before these flags when using pnpm; it makes the RN CLI ignore the target.
SDK 0.24 and the tested RN 0.72 runtime are retained. No SDK/browser download is needed.
The asset script stages unchanged native assets inside the app because Vega's resource
loader cannot resolve Metro's workspace-relative `/assets/../assets` URLs.

Use the console tool for clean 1920 × 1080 captures:

```sh
python3 spike/tooling/capture.py 'screenrecord screenshot /existing/output/directory'
python3 spike/tooling/capture.py 'screenrecord start --size 1920x1080 --bit-rate 8M --fps 60 /absolute/path/scene.mp4'
python3 spike/tooling/capture.py 'screenrecord stop'
```

Compare the native capture beside the matching `reference/screens/tv-*.png`, scaled
to the same size. Preserve the palette, bounds, stroke, shadows and motion beats.
The native capture may contain synthetic fixtures or bot art only. Never capture,
serialize, log or write a real player's photo/thumbnail. Audio stays muted; validate
codec latency and player state through control receipts.

The local control service accepts `reset` (seed/speed), `join` (index 0..3), `start`,
`bots`, `remote` (key), `snapshot`, `benchmark`, `perf`, `reduced` and `audio-probe`.
For example:

```sh
node tv/tooling/control.mjs send '{"command":"reset","speed":10,"seed":1}'
node tv/tooling/control.mjs send '{"command":"bots","start":true}'
```

All receipt fields are explicitly filtered; no snapshots, URLs, keys or image bytes
are written. The remote debug menu retains the spike workload benchmark in release.
The perf HUD distinguishes JS callback cadence from native presented frames; measure
actual native fluidity with the Vega performance tools on the retail stick.

## Sir Socksworth's voice

Every host cue requests relay TTS, including team names, find names and AI quips.
The host samples one precomputed word/jaw track from the voice player's media
`currentTime` on the existing 30 Hz host clock. Each word appears at its speech
mark; the jaw retains the mockup's `min(1, dt * 18)` talking / `dt * 10` idle smoothing.
There are no viseme timers or per-frame Reanimated shared values. Native speech
uses one current and at most one prepared AudioPlayer beside the effect/music
pools (12 live players maximum). Completed native speech players retire
asynchronously before replacement; the next scripted clip buffers and warms its
decoder at zero volume before its cue.
Music ducks 6 dB during Polly and returns to its prior crossfade gain afterward.

Web plays the authenticated `audio/wav` endpoint: Polly's 16 kHz mono 16-bit LE
PCM wrapped in a 44-byte RIFF header in JavaScript. Speech marks still come from
the matching JSON synthesis. Native Vega requests `&format=mp4`, prefetches the
bounded AAC/MP4 bytes into room memory and attaches them through MediaSource.
The relay uses a memory-only FFmpeg pipe; EC2 setup installs a checksum-pinned
static arm64 encoder. No audio file or extra Polly call is needed. Both variants
support authenticated HTTP byte ranges with exact Content-Length.

The native AAC path is restored because remote WAV still returned error 4 after
testing 48 kHz stereo 16-bit WAV with a 3x linear-interpolation upsample and
duplicated channels. Packaged WAV effects continue to work. Native preparation
borrows an initialized idle voice element, avoids warming an unused replacement
when a prepared clip exists, and plans glow-up speech during its preceding hold.
The current receipts are in
[voice-native-fix-report.md](../docs/workers/voice-native-fix-report.md).

Playback must advance within 600 ms of the host cue. Missing marks, relay failure,
network/decoder error or a stalled player select the existing 2 characters/34 ms
typing and voice blips for that line. A late clip warms the room cache for its next
use; it never replaces a line that has already selected blips. Pause freezes the
voice and captions. The pause menu and lobby Settings both offer **Voice** next to
Sound/Music: Voice OFF selects blips; Sound OFF mutes both forms of speech.

The 600 ms decision is covered by deterministic tests. VVD media setup and JS
callbacks can arrive late under load; the normal-speed native receipt records
those actual latencies, including fallback decisions beyond 600 ms. Late clips
are rejected rather than starting over the fallback. This is a remaining native
scheduling limit, not a certified hard real-time deadline.

Known upcoming lines use the core's optional `prefetchHost` callback. Polly can
extend a speech/read hold when a started clip is longer than reference blip typing;
hunt, mash and vote deadlines retain their original durations. Very short host
jobs reserve the 600 ms selection window when the voice adapter is present.
The callback and Voice state are additive; the phone/relay wire protocol is unchanged.

The local relay defaults to `POLLY_MODE=mock` (a silent WAV with synthetic marks).
Once credentials exist, load `~/secrets/snag-aws.env`, set `AWS_REGION`, and restart
the relay with `AI_MODE=mock POLLY_MODE=aws pnpm --filter relay start`. No TV rebuild
is required. Arthur neural/en-GB falls back to Brian; `POLLY_VOICE=Brian` selects
Brian explicitly. Run `AI_MODE=mock POLLY_MODE=mock pnpm --filter relay smoke:polly`
for offline smoke, or `AI_MODE=mock POLLY_MODE=aws pnpm --filter relay smoke:polly`
in a credential-loaded shell for the two billable live synthesis requests.
The smoke never writes or plays audio. Exact credential/switch steps and the
neural `<emphasis>` limitation are in [relay/README.md](../relay/README.md#sir-socksworth-switch-mock-to-live-polly).

Run the voice-specific normal-speed acceptance with the relay, control server
and web/native target already running:

```sh
node tv/tooling/verify-voice.mjs web
# Hold ~/.snag-vvd.lock for the entire native build/install/launch/capture run.
node tv/tooling/verify-voice.mjs native
```

Set `TV_WEB_URL`, `TV_CONTROL_PORT` and `TV_VOICE_OUTPUT_DIR` for isolated worker
ports/output. Both runs require a muted Mac and use only bot art. They save lobby
speech/rest and finale PNGs, a per-line route/latency receipt, and complete game
telemetry under `docs/review/voice`. The native run also exports an H.264 lobby clip
under 10 MB and deletes the raw WebM. `voice-line` identifies Polly or fallback for
every host cue; `voice-sample` records only media time/word count/jaw target, and
`voice-complete` records elapsed speech time. No text, URL, key or image payload
is included in those records.


Native capture uses macOS ScreenCaptureKit and requires the windowed VVD
(`vega virtual-device start --gui=true --display-res 1920,1080`). It captures only
the composed stage, without desktop, title bar, cursor or audio. Raw headless
console captures are rejected review evidence; see `docs/review/tv/visual/REPORT.md`.
