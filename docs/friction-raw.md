# Friction log and product feedback

Everything we hit with Amazon's tools, APIs and SDKs, logged as it happens. At submission
this becomes (1) the required product feedback, one entry per tool, and (2) the optional
friction log, which earns up to a 10% judging bonus.

Entry format (Amazon's): task attempted, steps taken, expected vs actual, severity,
workaround, actionable suggestion. Be specific, dated and reproducible, with versions and
exact error text. Positive findings count too.

Severity: **Blocker** (no way forward without a workaround) · **Major** (cost hours or forced
a design change) · **Minor** (cost minutes, papercut).

## Friction log

<!-- Newest last. Template:
### F-NN · YYYY-MM-DD · <tool + version> · <Severity>
- **Task:** what we were trying to do
- **Steps:** exact commands or clicks
- **Expected:**
- **Actual:** (exact error text)
- **Workaround:**
- **Suggestion:** one concrete change Amazon could make
-->

### F-RELAY-01 · 2026-10-12 · Anthropic Bedrock SDK 0.34.4 / Bedrock Mantle IAM · Minor

- **Task:** implement the relay's `AnthropicBedrockMantle.messages.create` vision call
  and its least-privilege EC2 runtime policy.
- **Steps:** installed `@anthropic-ai/bedrock-sdk@0.34.4`; inspected
  `mantle-client.d.mts`; exercised the real SDK with an in-memory fetch stub; read
  AWS's [inference permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference.html)
  and [Mantle authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_bedrock-mantle.html).
- **Expected:** the brief's one-model `bedrock:InvokeModel` grant would authorize
  the requested client. The package README would show the Mantle setup.
- **Actual:** Mantle uses `bedrock-mantle.<region>.api.aws` and AWS documents
  `bedrock-mantle:CreateInference` on a project with a `bedrock-mantle:Model`
  condition. The package README's main example still uses `AnthropicBedrock`.
  This is a documentation/configuration mismatch found locally; no AWS request
  or live AccessDenied error was observed.
- **Workaround:** kept the requested one-model `InvokeModel` permission and added
  only `CreateInference` on the dedicated workspace with the exact model condition.
  Runtime has no project mutation/discovery permissions. Deploy setup returns the
  workspace's real ARN and the relay sends its workspace header.
- **Suggestion:** include the Mantle import, SigV4 endpoint, model/project-scoped
  IAM example and workspace header together in the SDK README/quickstart.

### F-RELAY-02 · 2026-10-12 · Amazon Bedrock Mantle data retention API / SDK 0.34.4 · Minor

- **Task:** preserve the brief's rule that household photos are never written to
  durable storage, including the vision service.
- **Steps:** reviewed AWS's [data retention controls](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html)
  and [Anthropic-compatible workspaces](https://docs.aws.amazon.com/bedrock/latest/userguide/workspaces.html);
  implemented and tested the project setup requests through a local SDK fetch stub.
- **Expected:** a model chosen by the lead could inherit a safe retention default
  without a separate control-plane step.
- **Actual:** new account/projects default to `inherit`; model requirements vary.
  AWS's guide says the retention setting currently has no console UI. Inference
  SDK resources do not expose project administration directly. No live retention
  setting has been read or changed by this worker.
- **Workaround:** a deploy-only script uses the same SDK's signed generic HTTP
  methods to create/reuse a dedicated project, set `data_retention.mode: none`,
  and verify it. Deployment config scopes IAM to that project and supplies its
  workspace header. Models incompatible with `none` fail into the game fallback.
- **Suggestion:** add typed workspace/data-retention resources and a zero-retention
  example to the SDK, with the effective retention mode visible in model setup.

## Product feedback (one per tool; filled in as we go, finalized Oct 22)

For each: what we used it for · what worked well · what needs work · onboarding (zero to
hello world) · would we build with it again, and why.

- Vega SDK, CLI and Vega Virtual Device
- Amazon Devices Builder Tools (MCP server and Agent Skills)
- React Native for Vega (and any Vega-ported libraries)
- Fire TV device and developer mode
- Amazon Bedrock (Claude vision)
- Amazon Polly (voice and speech marks)
- AWS hosting (EC2, CloudFront), IAM, Budgets

Relay worker findings (offline, 2026-10-12): Mantle Messages API and plain JSON-schema
structured output fit the existing Anthropic request shape; an injected fetch
permits complete request/response testing without credentials. IAM and retention
instructions need the improvements above. Polly SDK v3 (`@aws-sdk/client-polly`
3.1150.0) provides MP3 and word/viseme streams through two clear requests; both,
Arthur-to-Brian fallback and bold removal are verified with local stubs. Live
onboarding, service latency and EC2/CloudFront operation await the lead's scoped
key; this worker has made no paid or account-mutating calls.

## Feature requests

<!-- Description · why it matters to Snag & Brag · priority: Critical / Important / Nice-to-have -->

## Development tooling (separate from Amazon feedback)

### Phone-P01 · 2026-10-12 · pnpm 12.10.1 / esbuild 0.28.2 · Minor

- **Task:** Install the phone's Vite, browser-test and HTTPS dependencies.
- **Steps:** Add `phone/package.json`, then run `corepack pnpm install` on Node
  24.20.0. Try the older `onlyBuiltDependencies: [esbuild]` workspace setting.
- **Expected:** Installation completes with esbuild's required setup script.
- **Actual:** `ERR_PNPM_IGNORED_BUILDS` / `Ignored build scripts: esbuild@0.28.2`.
  The older allowlist did not resolve the pnpm 12 error.
- **Workaround:** `corepack pnpm approve-builds esbuild --yes` wrote the current
  `allowBuilds: { esbuild: true }` workspace setting and ran the setup. Install,
  root tests/typecheck and Vite build then passed.
- **Suggestion:** Include the applicable workspace configuration syntax in this
  error so a noninteractive worker can approve only the named dependency.

The phone worker used no Amazon/AWS SDK or paid API, so this is not an Amazon
friction claim. The basic-ssl untrusted-certificate behavior is documented, not
an Amazon tool issue.


### F-TV-01 · 2026-10-12 EDT · Vega SDK 0.24.12112 / RN 2.0.9000000000 · Major

- **Task:** load the shared workspace's PNGs and TTFs in the native TV package.
- **Steps:** import assets outside `tv/`, build aarch64 Release using system bundles,
  install and launch on VVD OS 1.2 / TV Ship 102282480.
- **Expected:** Metro's resolved workspace assets load from the package.
- **Actual:** workspace-relative `/assets/../assets/...` locations did not resolve;
  the background textures and fonts were missing although the assets were bundled.
- **Workaround:** `tools/tv-foundation/generate.mjs` stages unchanged assets inside
  `tv/src/stage/generated/native-assets/` and generates native imports there.
- **Suggestion:** normalize parent paths in resource URLs, or fail the build with the
  unresolved asset location. Document pnpm workspace asset staging alongside Metro setup.

### F-TV-02 · 2026-10-12 EDT · Vega SVG 2.0.9000000001+13.14.0 · Major

- **Task:** animate the native background and batched particles without React frame state.
- **Steps:** call `Path.setNativeProps` at 30 Hz with ordinary SVG props including a
  color string for stroke and numeric strokeWidth; launch the native Release app.
- **Expected:** the imperative API converts the same props accepted by JSX.
- **Actual:** native JSI type assertions aborted the app. Inspection showed Shape's
  imperative method converts fill only; stroke expects a brush object and strokeWidth
  expects a string. Further repeated background prop updates during scene composition
  left the native event loop and UI stalled without a JS exception; the cause of that
  second symptom is not isolated to one property.
- **Workaround:** use string strokeWidth, static SVG geometry, and a single capped
  30 Hz shared value driving Reanimated view transforms and texture opacity. Native
  background/title motion then ran while the core, WebSockets and audio remained responsive.
- **Suggestion:** apply the JSX attribute converters in setNativeProps, validate invalid
  types before native dispatch, and publish a composed SVG/native-animation example.

### F-TV-03 · 2026-10-12 EDT · RN native Animated / Reanimated 2.0.9000000001+3.5.4 · Major

- **Task:** render the core's arbitrary keyframe stacks and exact sampled spring curves.
- **Steps:** use 121-point native Animated interpolations for translation, nonuniform
  scale, opacity and rotation around nested SVG titles in the scaled 1280×720 stage.
- **Expected:** the supported native-driver properties compose and remain responsive.
- **Actual:** this composed workload stalled after the first title cue. The spike's
  simpler single-clock transforms still work; this does not establish a general Animated failure.
- **Workaround:** sampled poses evaluated by Reanimated worklets with the library's
  worklet Easing.linear. Native Y flips currently use an orthographic scale projection;
  true perspective remains unverified in this composition.
- **Suggestion:** document supported composition limits and include pause/resume,
  sampled curves, nested SVG and multiple simultaneous transform animations in a sample.

### F-TV-04 · 2026-10-12 EDT · Vega Media Controls 1.0 / RN 0.72 · Major

- **Task:** optionally route Alexa pause/next to game pause/skip, within the one-hour budget.
- **Steps:** read the Builder Tools guide and official media-controls setup page; register
  a custom handler using getOrMakeServer and the component instance; publish play/pause/next
  capabilities and game state on the VVD.
- **Expected:** registration and state publication coexist with the W3C audio pool and UI.
- **Actual:** registration reported success, followed by the tested shell stalling before
  the first lobby cue. Removing this integration restored the running parade, core and audio.
  The precise cause in the attempted integration is unconfirmed; no spoken Alexa test was run.
- **Workaround:** retain remote Play/Pause, Back confirmation and Fast-forward through
  the core; leave custom Media Controls unregistered. No account or paid API was used.
- **Suggestion:** provide a complete minimal non-video interactive-app example with
  a custom handler, audio coexistence and explicit handler cleanup. The published constructor
  sample also calls getOrMakeServer without assigning the returned server to its field.

### F-TV-05 · 2026-10-12 EDT · Builder Tools MCP / Vega Performance CLI 2.0.345.0 · Minor

- **Task:** analyze a native Perfetto trace with Builder Tools.
- **Steps:** record the native app with the already installed SDK, then call the MCP
  Perfetto analyzer using the resulting trace path.
- **Expected:** the server discovers the same installed SDK and trace processor.
- **Actual:** the MCP analyzer could not locate the trace processor / Vega Performance
  CLI path, although CLI recording worked after sourcing `~/vega/env`.
- **Workaround:** use the installed SDK's trace_processor_shell directly and retain the
  SQL/summary receipt. No SDK or browser was downloaded.
- **Suggestion:** discover installed SDKs independently of the MCP process's inherited
  shell environment, or expose a clear SDK-path setting and diagnostics.

### F-TV-06 · 2026-10-12 EDT · Vega CLI 1.4.2 / RN build-vega / pnpm 12.10.1 · Minor

- **Task:** build only the requested release architecture.
- **Steps:** run a pnpm script with `-- --target armv7` using the common CLI convention.
- **Expected:** the flag reaches build-vega and selects armv7.
- **Actual:** the extra separator made the target flags ineffective and built multiple
  configured targets, consuming avoidable time and disk.
- **Workaround:** `pnpm --filter @snag/tv build:release --target armv7 ...`, without the
  extra separator. The scene guide records the working command.
- **Suggestion:** reject unknown trailing arguments instead of silently applying default targets.

## 2026-10-13 — Worker B: native scene acceptance

- **Tool/version:** Vega SDK 0.24, React Native for Vega 0.72, VDA 2.6+3d072013.
- **Task/steps:** Build the aarch64 release, acquire the shared VVD lock, reverse 8787/8790, install and launch, then capture with the authenticated console. AI and Polly were mock; the Mac was muted.
- **Expected:** A visible lobby followed by hunt and Pixel Judge states, with an isolated native fast-game receipt.
- **Actual:** The boot frame remained despite ready telemetry, and the app later returned to the launcher. The shared control observer also included web traffic, so its scene events were rejected as native evidence. Screenshot: `docs/review/scene-b/native-foundation-blocked.png`. The foundation worker is already diagnosing this pre-scene failure.
- **Workaround:** Complete web checks and the release build; release the VVD lock for the foundation worker. Native acceptance and raster visual verification remain pending.
- **Suggestion/severity:** Keep renderer readiness and runtime identity explicit in native control receipts, and document startup failures before scene verification. Blocks native acceptance.

### F-TV-07 · 2026-10-13 EDT · Vega SDK 0.24.12112 / Performance CLI 0.24.0 (package 2.0.345.0) · Minor

- **Task:** diagnose a Release-app stall on VVD OS 1.2, TV Ship 102282480.
- **Steps:** run `vega exec perf record --app-name com.snagbrag.tv --recording-timeout 5 --record-cpu-profiling --enable-cpu-sched --output-dir /tmp/snag-tv-native-trace --disable-telemetry` from an agent shell.
- **Expected:** either a five-second trace or a preflight message identifying unsupported capture options.
- **Actual:** the tool installed KSPTService, waited ten times for trace daemons, prompted for `s`, then reported `An Error Occurred: (19, 'Operation not supported by device')`. The capture still required interactive input despite the recording timeout. This does not establish that either individual profiling flag fails on every device.
- **Workaround:** use a PTY, remove CPU profiling and scheduler flags, send `s` to begin the ordinary trace, and `q` followed by Enter to exit. A five-second 4.7 MiB trace was captured and queried with the installed trace processor; no SDK download was needed.
- **Suggestion:** add a noninteractive start option, distinguish duration from start timeout, and report the unsupported requested capability before installing tracing services.

### F-TV-08 · 2026-10-13 EDT · Vega SDK 0.24.12112 / RN 2.0.9000000000 / Reanimated 2.0.9000000001+3.5.4 · Major

- **Task:** render the reference googly eyes without stopping Release-stage presentation on VVD OS 1.2 / TV Ship 102282480.
- **Steps:** at worker commit `f816d1c`, build aarch64 Release with `pnpm --filter @snag/tv build:release --target aarch64 --use-system-js-bundles true --max-workers 2`; install/launch on the locked VVD. Each sticker has one core `Animated.Value`, two x/y interpolated pupil Views, and rounded white/shade/highlight Views. Capture the composed lobby with the VVD console. Measure one native-driver eye on a plain ready card; also try a single 15 Hz React-state clock for all pupils with the same painted geometry.
- **Expected:** the full lobby presents while each pupil follows its sampled trajectory.
- **Actual:** the composed workload retained startup art or presented only the background and eye shapes; some variants kept native JS telemetry alive with zero exceptions, while full initial composition stopped answering snapshots. The isolated single-eye fixed loop and settling-to-idle sampler presented and their heartbeat advanced. The React-state variant with painted circles also failed to present the composed lobby. These findings do not establish a general native-driver failure or identify the internal rendering cause.
- **Workaround:** use the reference-rendered pupil PNGs inside plain core Animated Views, and bake the whites from the actual `.gg` CSS at their displayed radii, retaining the unscaled 3 px ring and inset shade. The preferred native driver now works; no React-state fallback ships. `docs/review/tv/native-eyes-lobby.mp4` shows 8 s at 60 fps; `native-verification.json` records all eight scenes, 897 contiguous native cues and zero exceptions.
- **Suggestion:** add a composed, scaled-stage sample with several independently translated pupils, nested native transforms, rounded eye geometry and bitmap equivalents; report renderer failures through an actionable exception rather than retaining stale or partial frames.

### F-TV-09 · 2026-10-13 EDT · Vega SDK 0.24.12112 / RN 2.0.9000000000 · Major

- **Task:** launch the complete native show after the eye fix.
- **Steps:** initialize the existing diagnostic stage at layer 7 (HUD, host, ticker, world effects, particles, vignette and remote) immediately when relay/fonts become ready; build/install/launch aarch64 Release and request native snapshots. Compare with mounting those existing layers successively from the checkpoint's initial layer 0.
- **Expected:** the full subtree mounts and remains responsive on a cold launch.
- **Actual:** all-at-once mounting intermittently stopped after the ready bootstrap and did not answer subsequent snapshots; rebooting the VVD did not remove the finding. Successive attachment presented every layer and kept snapshots responsive. The responsible subtree or SDK interaction is not isolated.
- **Workaround:** mount the existing seven native layers at 150 ms intervals after fonts/relay readiness (1.05 s total); web mounts the complete show immediately. The cold-launch lobby clip and the complete native bot-game receipt verify this path. Diagnostic layer commands cancel pending startup attachments.
- **Suggestion:** document subtree attachment and animation initialization ordering, and provide a release-mode TV sample covering simultaneous SVG, core Animated, Reanimated and media initialization.
## Other tools · 2026-10-13 · Phone face redaction

### FACE-01 · MediaPipe Tasks Vision 1.1.0 / 0.10.14 · Download budget

- **Task:** add local face detection with a target of ≤3 MB total gzip download.
- **Steps:** install 1.1.0, measure the package's WASM using Node gzip, compare
  pinned 0.10.14 and vendor only the SIMD/non-SIMD assets and short-range model.
- **Expected:** the lightweight 229,746-byte face model would imply a small
  detector download.
- **Actual:** 1.1.0's selected WASM is 12,997,248 bytes raw / 3,861,652 gzip;
  0.10.14's SIMD WASM is 9,423,986 raw / 2,876,020 at gzip level 9, before model,
  loader and JavaScript. The shared vision runtime dominates the budget.
- **Workaround:** pin compatible 0.10.14, lazy-load after joining, keep it warm,
  self-host every asset and gzip the relay's static inference/JS responses. Final
  browser timing and served-download receipts accompany the worker's report.
- **Suggestion:** publish a face-detector-only WASM fileset or document the total
  task download budget separately from model size.

### FACE-02 · 2026-10-13 · MediaPipe Tasks Vision 0.10.14 / Chrome · Informational log level

- **Task:** assert a full three-round phone/relay/TV game has no browser errors.
- **Steps:** collect Chrome `console.error` entries while initializing the
  self-hosted CPU detector and taking three synthetic-camera snags.
- **Expected:** successful initialization emits informational messages at info
  level, leaving the error stream clear.
- **Actual:** WASM stderr emits `INFO: Created TensorFlow Lite XNNPACK delegate
  for CPU.` as a browser console error. All three snags report `mediapipe` and
  the game reaches the finale; no inference failure accompanies this line.
- **Workaround:** the e2e checker excludes only that exact informational line;
  it still fails on page errors and every other console error. Runtime code
  neither suppresses diagnostic failures nor logs photos or face positions.
- **Suggestion:** route severity-prefixed WASM info messages to `console.info`.

FACE-01 final measurement: the actual relay-served SIMD inference assets total
3,166,321 bytes gzip; measured added initial JS contributes 1,737 bytes, for
3,168,058 bytes added (168,058 over the 3 MB target). Non-SIMD adds 3,164,777 bytes.
Runtime asset hashes, encoded transfer sizes and decoded-byte verification are
in `docs/review/face-blur-size.json`. Desktop Chrome 155.0.8059.40 found a face in
an original in-memory drawing, with a 3.5 ms median warm detection pass. Physical
iOS Safari was not exercised, so no iOS compatibility claim or observed iOS
friction is made. No Amazon/AWS tooling snag occurred in this worker task.
### F-TV-A-01 · 2026-10-13 EDT · Vega SDK 0.24.12112 / RN 0.72 / Reanimated 2.0.9000000001 / SVG 2.0.9000000001 · Major

- **Task:** accept Worker A's intro and standings on the VVD at 1920×1080.
- **Steps:** build aarch64 Release with system JS bundles and three workers, install and launch `com.snagbrag.tv.main`, connect an isolated control port, obtain `ready:true`, `loaded:true`, `connected:true`, `hermes:true` snapshots, and capture the bot-only sequence with the emulator console at 60 fps.
- **Expected:** the rendered title, reel, countdown and standings advance with the native cue stream.
- **Actual:** several screenshots and a frame extracted from the recording retained bootstrap artwork even after the native readiness snapshot. Native JavaScript reported zero exceptions. The foundation's finale capture showed the same problem; cue completion alone did not prove rendered completion. Early observer traffic also included web events, and a short-lived lock-owner PID permitted a later lock handoff, so those early captures are rejected as acceptance evidence.
- **Workaround:** integrate native/web control isolation, readiness/reset acknowledgements and audio initialization fixes; use a persistent lock holder and native-only observer; visually reject bootstrap captures. Native world effects now use UI-thread animations. A single native transform matrix and stage remount at readiness are being evaluated; they are not yet a verified workaround.
- **Suggestion:** provide a supported SVG/Reanimated scene-composition example with a bootstrap-to-show transition, an active-frame/render-surface probe, and a capture readiness check that confirms presented content as well as JavaScript state.


### F-TV-08 · 2026-10-13 EDT · Vega SDK 0.24.12112 / VVD OS 1.2 · Native visual acceptance unresolved

- **Task:** verify Worker A intro and standings pixels on the shared VVD.
- **Steps:** inspect coordinated VVD console captures (`docs/review/tv-scene-a/title.png`, `reel.png`, `snag.png`, `probe-lobby.png`) and the recorded 60fps VP9 intro; cross-check privacy-filtered native readiness receipts. No device command was run by the independent reviewer while another worker held the lock.
- **Expected:** the named show states appear in the captured pixels after the native client reports ready, fonts loaded, relay connected, and Hermes enabled.
- **Actual:** the first named captures and the 10-second intro video frame show bootstrap artwork. A later native receipt reports all four readiness flags true, but the probe still shows bootstrap artwork. The precise cause (presentation, retained content, or capture target) remains unconfirmed.
- **Workaround:** reject those captures as acceptance evidence, separate native and web control traffic, and require fresh screenshots plus visible full beat sequences. The rendering/capture fix and accepted clips are still outstanding.
- **Suggestion:** correlate device identity, presentation surface, bundle revision, and readiness in capture receipts; make screenshot failures return a failing process status.


### 2026-10-13 · Worker A follow-up to F-TV-A-01 · Vega SDK 0.24.12112 / VVD OS 1.2

- **Task/steps:** repeat intro and standings acceptance with the latest foundation container anchors, a live persistent lock holder, isolated native observer on 8801, readiness/reset acknowledgments, and new temporary screenshot directories.
- **Expected/actual:** title, reel, SNAG and standings should appear. All four freshly captured states still contain the bootstrap title despite native ready/loaded/connected/Hermes telemetry; a subsequent 10x game stopped at hunt cue 73 and did not complete. This run rules out stale screenshot filenames and web observer traffic as sufficient explanations for these frames.
- **Workaround:** no verified native rendering workaround. A fixed-size, noncollapsible Stage without readiness remount was tested and reverted when it also failed. Rejected video metadata, frames and filtered telemetry are in `docs/review/tv-scene-a/failed-native/final-attempt.json`; raw rejected clips were removed. The app was stopped and the shared lock released.
- **Suggestion:** add presentation-surface and bundle-identity diagnostics to correlate the native cue stream with the displayed frame.

### 2026-10-13 · Worker C · Amazon Devices Builder Tools MCP (server version not exposed) · Minor

- **Task:** discover the Vega build-and-install workflow for final scene acceptance.
- **Steps:** read the Vega build-and-run skill, then call `list_documents` with
  `documentType: WORKFLOW` and `device_os: [vega_os]`.
- **Expected:** the first documentation-discovery call lists the available workflows.
- **Actual:** the call returned `PROJECT_CONTEXT_REQUIRED`; the list tool description
  did not state this prerequisite.
- **Workaround:** read the local `.adbt-config.json`, call `set_project_context` with
  its parsed contents, and repeat the discovery call. Build documentation then loaded.
- **Suggestion:** state the project-context prerequisite in the documentation tools'
  descriptions, or automatically load a local context for read-only documentation.

### 2026-10-13 · Worker C · Vega SDK 0.24.12112 / VVD OS 1.2 / RN 0.72 · Blocking native acceptance

- **Task:** accept Brag-Off, Showstopper, and champion scenes on the VVD with native screenshots and 60 fps clips.
- **Steps:** acquired the shared VVD lock with a live keeper, built and installed the aarch64 release with system JS bundles, reversed relay/control ports, and ran the isolated native all-bot verifier. Repeated with reduced motion, and with Sound/Music disabled through the core’s remote menu.
- **Expected:** the native UI presents each core beat, the fast all-bot game completes, and the six scene captures and three clips can be recorded.
- **Actual:** bootstrap reports ready/loaded and Hermes; the filtered core cue stream advances, then stops without a reported JS exception. Stops occurred after roughly 3.5–23 seconds at different phases, including before C scenes. The console screenshot retains ‘Getting the studio ready…’. Native mounting telemetry later repeats identical transaction/mutation totals. Device logs also contain repeated W3C media time-update warnings; causality is unconfirmed.
- **Workaround:** none established. Web acceptance, native release build, root tests/lint/typecheck pass. Preserved filtered native receipts and a synthetic-only native diagnostic screenshot in docs/review/tv-worker-c; left the VVD running for the foundation worker and restored the standard control reverse. Native scene comparison sheets, clips, and the full native zero-exception acceptance remain outstanding.
- **Suggestion:** expose a bounded diagnostic for JS-thread/UI-commit stalls and native animation/media callback waits; surface readiness only once a frame containing the ready UI has actually been presented.


### 2026-10-13 · Worker C native follow-up · Vega CLI 1.4.2 / SDK 0.24.12112

- **Task:** finish native scene acceptance after the renderer stall.
- **Steps:** rebuilt the generic Follow/Loop helpers with native worklets, installed the fresh aarch64 release, restored relay/control forwarding, and ran the normal-effects all-bot game at speed 3 under the Worker C lock.
- **Expected:** game completion and a visibly rendered champion scene.
- **Actual:** the core completed all eight scenes with 951 contiguous cues and zero exceptions, but the console screenshot still displayed the startup ‘Getting the studio ready…’ frame. This is an engine pass, not a visual acceptance pass. The native rendering cause remains unconfirmed.
- **Workaround:** none established for the displayed frame. Retained native-all-bots.json, native-runtime.jsonl and native-all-bots-finale.png; the latter is failed render evidence. Web rendering and all three synthetic relay photos pass.
- **Suggestion:** report native presented-frame progress separately from core/bootstrap readiness, and expose UI-commit stall diagnostics for a scene transition.


### 2026-10-13 · Worker C fresh capture retry · Vega CLI 1.4.2 / SDK 0.24.12112

- **Task:** recheck native acceptance using the latest foundation container/world-effect correction and a guaranteed fresh screenshot.
- **Steps:** integrated the generic stage correction from foundation commit e0baa56, retained C’s absolute anchors, rebuilt the aarch64 release with system bundles, installed under the Worker C VVD lock, and ran normal-effects all bots at speed 3 with isolated control port 8796. Queried console help and corrected the screenshot helper to use a fresh temporary directory and fail on console KO responses.
- **Expected:** a complete native run and fresh scene frames.
- **Actual:** the final retry stopped after 275 contiguous cues in round 1’s reel, before the C scenes, without a reported JS exception, and timed out. A fresh 1920 × 1080 screenshot still displays ‘Getting the studio ready…’. Earlier screenshot filenames could be reused after console errors, so they are insufficient acceptance evidence. The earlier 951-cue engine pass remains a receipt for the preceding candidate, not acceptance of this final native candidate.
- **Workaround:** none established for the native presentation/runtime stall. Web completed all eight scenes, all six C captures, and three synthetic photo uploads after the foundation correction. Root tests/lint/typecheck and the native release build pass. Preserved native-foundation-retry.json, native-runtime.jsonl, and native-foundation-diagnostic.png. Native scene screenshots, comparison sheets and clips remain incomplete.
- **Suggestion:** fail console wrapper calls on KO responses, document the screenshot directory contract, and expose native presented-frame/UI-commit progress independently of bootstrap and core readiness.

### F-TV-INTEGRATE-01 · 2026-10-13 EDT · Vega SDK 0.24.12112 / RN 2.0.9000000000 / Reanimated 2.0.9000000001 · Major

- **Task:** integrate the three finished scene branches into the native TV foundation and complete an all-bot VVD game.
- **Steps:** build an aarch64 Release with system JS bundles, install on VVD OS 1.2, reverse ports 8787/8790, and run `node tv/tooling/verify-native.mjs game` while holding the VVD lock.
- **Expected:** every scene remains responsive and the game reaches the finale with zero exceptions.
- **Actual:** the initial integration stopped answering at the hunt; fixing the cameras in place did not clear it. Replacing the live SVG/TextInput countdown implementation cleared the hunt and completed a static-camera game. Restored cameras and new effects exposed later Brag-Off stalls. No JS exception was reported. These observations do not isolate an internal SDK cause.
- **Workaround:** two fixed clipped watch arcs animated with the native driver; sampled camera tracking, clamps and jitter on one driver per tile; native integer text updates on the existing shared frame clock; precomputed bot shimmer layers; single matrix transforms and flattened base styles for native Follow/Loop. The integrated moving-feed game then completed all eight scenes with 908 contiguous cues and zero exceptions (`docs/review/tv/native-verification.json`).
- **Suggestion:** provide a release-mode sample combining animated SVG, camera-style derived animation graphs and nested transforms, with diagnostics for a native presentation stall that produces no JS exception.

### F-TV-INTEGRATE-02 · 2026-10-13 EDT · Vega SDK 0.24.12112 / VVD OS 1.2 / RN 2.0.9000000000 · Major

- **Task:** native acceptance after integrating full scene art, typography and effects.
- **Steps:** build/install the reviewed aarch64 Release, run the all-bot harness at 10× and inspect VVD screenshots and native-only telemetry.
- **Expected:** completed flow and fresh native frames for every scene.
- **Actual:** rapid runs stalled at differing scenes with zero JS exceptions; one final-standings telemetry state retained an earlier Brag-Off frame. The newer audio retry was removed during isolation. Its removal alone did not clear the accelerated stall.
- **Workaround:** cache native interpolation nodes; keep effects ordered before foreground text without extra full-stage attachment containers; give outgoing native scenes 150 ms to detach; verify at normal speed. The normal-speed game completed all eight scenes, 883 contiguous cues and zero exceptions, with a visibly correct finale (`docs/review/tv/native-verification.json`, `native-finale.png`). Internal SDK cause remains unisolated.
- **Suggestion:** ship a multi-scene release-mode animation sample and a diagnostic that distinguishes a renderer stall from a healthy JS state machine.

### F-TV-INTEGRATE-03 · 2026-10-13 EDT · Vega SDK 0.24.12112 / VVD launcher · Minor

- **Task:** restart the VVD after native diagnostics.
- **Steps:** `vega virtual-device stop` and `vega virtual-device start` in a transient command session.
- **Expected:** a ready device remains available to `vega device list`.
- **Actual:** the launcher reported ready, then status reported `running:false` and install failed with no connected devices.
- **Workaround:** keep the launcher in a live PTY session, then restore reverse ports 8787/8790. The device remained connected and the normal native run passed.
- **Suggestion:** document launcher process ownership and provide an explicit detached mode with a persistent readiness check.

### F-TV-INTEGRATE-04 · 2026-10-13 EDT · Vega W3CMedia 2.3.2 / VVD OS 1.2 · Moderate

- **Task:** review native audio during the integrated show while the Mac remains muted.
- **Steps:** inspect media-player telemetry during the all-bot native game and the existing WAV/Ogg advancement probes.
- **Expected:** the bundled short cues decode, as the background music and tick probes do.
- **Actual:** some short effects (including boom, thump, riser and knockout) report media errors 3/4 on the VVD; background music has no such error in the run. Existing probes advance in both WAV and Ogg. A per-asset WAV retry did not establish a reliable correction and was removed.
- **Workaround:** retain the previously verified audio engine and uninterrupted game flow; record this decoder limitation for audio/device follow-up. Mac output stays muted and evidence clips are silent. No claim that every short effect played is made.
- **Suggestion:** expose per-source decoder diagnostics and provide a supported low-latency mixed-effects sample rather than an empty error message.

### F-TV-FINISH-01 · 2026-10-13 EDT · Vega SDK 0.24.12112 / W3CMedia 2.3.2 / VVD OS 1.2 · Major

- **Task:** identify and fix the integrated TV's short-effect media errors without changing the reference sound palette.
- **Steps:** hold the VVD lock; build/install aarch64 Release with system JS bundles; run the exact 112 SFX asset ids through the production pool using `node tv/tooling/verify-audio-native.mjs ogg native-audio-ogg-baseline`; query `vega exec vda shell loggingctl log -v com.snagbrag.tv`; restart and retest five failed ids.
- **Expected:** valid bundled 48 kHz stereo Vorbis effects decode and finish; the eight-voice policy bounds native audio resources.
- **Actual:** 90/112 ids passed, 22 failed, and the pool emitted 33 errors (codes 3/4). Native logs at 19:30:26 UTC say `shared memory allocation failed, err=Unknown error -12`, `failed to open playback, err: Cannot allocate memory`, `Failed to create streamhelper object`, then `The stream is in the wrong format.` The active-voice policy bounded playback but retained a separate native bank per effect, including paused players. The same mtick, riser, thump, scan and reveal files passed after a fresh launch. Duration/sample rate/codec corruption did not explain this reproduction.
- **Workaround:** reuse eight native SFX players across every effect/variant and share initialization, with two separately bounded music players. Preserve all rendered WAV/Ogg bytes, gain, durations and music seams. `docs/review/tv/native-audio-effects.json` verifies every id on first selection and immediate replay, using ten native players and no media errors; `native-audio-ogg-baseline.json` and `native-audio-ogg-fresh-subset.json` retain the diagnosis controls.
- **Suggestion:** propagate the native sink allocation reason and resource usage through `AudioPlayer.error`; a resource failure should not appear as an unsupported-source/decoder error with an empty message. Provide an example with a bounded reusable SFX player pool.


### F-TV-FINISH-02 · 2026-10-13 EDT · Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2 TV Ship 102282480 / RN 2.0.9000000000 / Reanimated 2.0.9000000001 · Blocking G2

- **Task:** finish the native human-phone game at normal speed, with the local mock AI/voice relay, three bots, all three rounds and the finale.
- **Steps:** hold the VVD lock; build/install aarch64 Release with system JS bundles; reverse device 8787 to local mock relay 8789 and 8790 to native control; foreground the windowed 1920×1080 VVD; run `TV_JOIN_ORIGIN=http://localhost:8789 node tv/tooling/capture-native.mjs g2`. The harness invokes the requested `phone/dev/e2e-play.mjs` with system Chrome, muted output and its in-memory fake camera. Repeat with fresh app launches, an eye-disabled diagnostic, Sound/Music disabled through the remote menu, and continuous recording rather than stopping the recorder between scenes. A separate normal-speed all-bot check also stalled in the first judge without phone media.
- **Expected:** the native scene and phone progress remain responsive through the finale, with three locally redacted snags and a visibly aligned Color Rush mask.
- **Actual:** the native photo originally used SVG Image+Mask. Replacing that native-only composition with an Image clipped to the reference rectangle produced the actual photo and mask in fresh VVD pixels. The final standard-effects run still stopped answering snapshots at round 0 judge, cue 222, with two scored cards, one flipping card and one back. It reached TV lobby/intro/hunt/judge and phone lobby/ready/camera/glow/wait in 78.025 seconds; it reported zero native exceptions and zero media errors. Other runs reached round 1 hunt before stopping. Disabling eyes or audio did not establish a workaround. The SDK/internal cause is not isolated.
- **Workaround:** none verified for full-game G2. Preserve the explicitly failing `docs/review/tv/g2-native-e2e.json`, metadata-only phone progress, the fresh synthetic mask screenshot and the 20-second 1080p60 silent H.264 reveal clip. The harness now saves partial receipts/clips and closes its fake-camera browser on interruption. Correct the native mask wrapper's redundant scale so the 24×24 mask covers the same 100/120 photo crop; the original shadow, border, eyes and web SVG implementation remain. Do not treat this reveal evidence as a full-game pass.
- **Suggestion:** expose native JS/UI commit wait diagnostics and presented-frame progress independently of ready/loaded/Hermes state. Supply a release-mode multi-scene example combining Reanimated, core Animated, rounded in-memory photos and a reusable media pool; a presentation/runtime wait must surface a useful diagnostic instead of silently stopping.

### F-TV-FINISH-03 · 2026-10-13 EDT · Amazon Devices Builder Tools MCP (server version not exposed) / KeplerPerfCLI 2.0.345.0 · Minor

- **Task:** inspect the native stall with Perfetto scheduling traces.
- **Steps:** record short local traces with the installed Vega performance CLI and request `analyze_perfetto_traces` for the local trace path.
- **Expected:** a supported local analysis path identifies the blocked JS/UI threads without exporting diagnostic metadata.
- **Actual:** automatic approval review rejected the MCP analysis because it could submit process/thread metadata to an external analysis service. No trace was exported. The CLI's installed offline `trace_processor_shell` successfully analyzed the recordings locally; scheduling/thread counts alone did not establish the internal cause.
- **Workaround:** use the already-installed offline trace processor, keep raw traces outside git, and preserve only this observation. No additional SDK, browser or paid service was installed or called.
- **Suggestion:** document whether analysis is local or remote, identify the destination before submission, and offer an explicit offline analysis tool for device traces.


### F-TV-FINISH-04 · 2026-10-13 EDT · Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2 · G2 bundle-isolation follow-up

- **Task:** check whether the native stall depends on using shared system JavaScript bundles.
- **Steps:** build the unchanged app for aarch64 Release with `--use-system-js-bundles false --max-workers 2`; restart the windowed VVD; install/launch; run the G2 harness with an isolated temporary review root and the same mock relay/reverse ports.
- **Expected:** a responsive native readiness handshake and a full phone game, or a diagnostic identifying a bundle-loading incompatibility.
- **Actual:** the alternative package built and installed successfully; build metadata reported 50.74 MB. Native engine/Hermes and ready/loaded bootstrap telemetry arrived, then no snapshot; the app handshake timed out after about 30 seconds. The phone was never launched and its assertions were not reached. No exception count can be confirmed without the snapshot. `docs/review/tv/g2-private-bundles-diagnostic.json` retains the exact result.
- **Workaround:** no verified bundle-configuration workaround. Restore the standard system-bundle aarch64 package; retain the separately copied standard armv7 build. The primary G2 receipt and reveal artifacts continue to describe the standard-effects candidate, explicitly failing full-game acceptance. Stop the worker-owned device/services and release the lock.
- **Suggestion:** surface dependency/runtime/UI-commit waits during startup as actionable diagnostics; distinguish successful JS bootstrap from an app that can actually service commands and present its ready scene.

## 2026-10-13 · DIR-01 · VVD console recording and exclusive capture access

- **Tool + version:** Vega Virtual Device console recorder; Vega SDK
  main@0.24.12112 / CLI 1.4.2, VVD OS 1.2 / TV Ship 102282480, as verified in the
  existing platform-spike receipt. These versions were not re-queried from the
  occupied simulator during this task.
- **Task:** repeatable 1920×1080 showcase footage longer than one recorder clip,
  overlapping segments, named gallery stills and an editing-ready H.264 export.
- **Steps:** read `docs/spike/PLATFORM.md` and `spike/tooling/console.py`, check
  `~/.snag-vvd.lock`, implement an authenticated console adapter and synthetic
  seek/hold/play bridge, then run the complete capture/edit pipeline on Chrome.
- **Expected:** first-class Vega recording tools with recorded start timestamps,
  documented rollover/overlap controls and clean screenshots.
- **Actual:** the verified recorder is the underlying emulator console interface
  and has a 180-second cap; the VVD already had another worker's lock. The
  director did not connect to, query or take over the emulator, so its new native
  adapter remains unexercised. A single console recorder cannot overlap itself.
- **Workaround:** timestamped web rehearsal with overlapping encoders and six
  checked still beats; native recordings are ready to replay the same seeded
  host at overlapping cut points after the TV worker adds its renderer toggle.
  Use ≤170-second source limits with a one-second startup reserve, keep masters
  outside git, trim overlap once and commit only bounded previews.
- **Suggestion:** expose a supported Vega capture API with recorder-ready and
  frame/start-time acknowledgements, scene bookmarks, long-recording rollover,
  explicit ownership and screenshots without simulator chrome.
- **Severity:** filming workflow workaround; no AWS service failure observed and
  no paid AI calls made. Native capture/transport integration still needs the
  TV owner's toggle and an available simulator.


## F-TV-PHOTO-01 · 2026-10-13 EDT · native photo game presentation

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2; VVD OS 1.2, aarch64 Release / Hermes; React Native Kepler 2.0.9000000000, Reanimated 2.0.9000000001.
- **Task:** complete G2 with a headless phone's synthetic camera plus three bots, normal speed, audio enabled, reduced motion off.
- **Steps:** reproduce the prior 78-second judge stall; isolate photo → clipping → eyes → 576-cell mask → four judge cards; replace row masks with one merged Path/one clip and compose the art die cut in room memory; rerun the full game; replace per-frame shared-object effects with projected native clocks, publish one batched TV view, and start new motion after native layout attachment; rerun G2.
- **Expected:** native frame presentation and command processing continue through all three rounds and the finale, with no exceptions.
- **Actual:** all five isolated photo cases advanced normally with zero exceptions, so the component bisect alone did not identify the whole-show cause. The photo/mask-only repair progressed to Showstopper tally, then stopped responding after 267 seconds with zero exceptions. A later candidate stopped during round-two hunt. JavaScript bootstrap and logical cue summaries alone were insufficient evidence of presented frames. These failed receipts remain explicitly marked as failures.
- **Workaround:** one merged mask Path/Rect clip; once-per-find memory composition; projected background/particle clocks; one reactive TV view with batched subscriber/frame updates; native-layout attachment before motion. The integrated G2 completed in 290 seconds, reached all eight native scenes and all eight phone screens, with zero native/phone/audio errors. See docs/review/tv/g2-native-e2e.json and the bounded native reveal clip. No player media was persisted and no paid service was called.
- **Suggestion:** expose native UI-commit, animation attachment and presented-frame acknowledgements with queue/wait diagnostics, and provide a stress example for mixed core Animated/Reanimated/SVG/photo scenes. A successful Hermes bootstrap or cue dispatch should be distinguishable from a responsive, presenting app.


## F-TV-PHOTO-02 · 2026-10-13 EDT · native fanfare completion probe

- **Tool + version:** Vega SDK 0.24.12112 / VVD OS 1.2; @amazon-devices/react-native-w3cmedia ~2.3.2, production ten-player pool.
- **Task:** verify the exact sfx-fanfare Ogg in the native player with the Mac muted.
- **Steps:** probe cold and warm playback immediately after a captured phone judge run; retain the result; terminate/relaunch the same native package and repeat the exact asset probe in the fresh lobby.
- **Expected:** advancing playback and an ended event in both passes, with zero decoder exceptions.
- **Actual:** after the phone run, the first pass advanced but did not report completion within its 3.3-second budget; the second completed in 86 ms. No audio error occurred. This is not accepted as a cold/warm success or an acoustic-latency measurement. The fresh native process passed both: 2171 ms cold and 1600 ms warm, advancing and completed, zero errors.
- **Workaround:** isolate decoder evidence in a fresh process; preserve the unsuccessful probe as docs/review/tv/native-photo-fanfare-timeout.json and the verified probe as native-photo-fanfare.json. Full G2 separately records the real game fanfare cue and zero audio errors. No production audio behavior was changed.
- **Suggestion:** associate native media events with a load/play generation and expose pending/completion state to distinguish an earlier player's delayed ended event from the current playback.


## F-TV-PHOTO-03 · 2026-10-13 EDT · post-install readiness and reverse ports

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2, installed aarch64 Release package.
- **Task:** rerun G2 after the final native judge-entrance build.
- **Steps:** install/launch the final package in the occupied worker-owned VVD; run the guarded native handshake; retain failure; restart that VVD, install/launch and connect the local relay/control; inspect the fresh native screen and reapply both vda reverse mappings.
- **Expected:** a responsive, connected native lobby before starting the fake-camera phone.
- **Actual:** the post-install attempt stopped snapshots in the lobby with zero reported exceptions, before a round or photo. The fresh VVD then timed out readiness with no native snapshot; a native screenshot showed the network waiting screen. Reapplying device 8787→host 8789 and 8790→8790 produced a responsive connected lobby. These two failed receipts are explicitly separate from full-game acceptance.
- **Workaround:** preserve the accepted receipt when testing via an isolated review root; restart the worker-owned VVD, reapply reverse mappings after installation/launch, and require fresh connected/ready/loaded snapshots before G2. Do not infer a render pass from package installation alone.
- **Suggestion:** include effective reverse mappings, relay/control reachability and a presented-frame acknowledgement in install/launch readiness diagnostics, so network waiting and native presentation stalls can be distinguished promptly.

## F-VOICE-POLLY-01 · 2026-10-13 EDT · neural emphasis support

- **Tool + version:** Amazon Polly SynthesizeSpeech / AWS SDK client-polly 3.1150.0; Arthur/Brian neural, en-GB.
- **Task:** preserve the host's bold-word emphasis while adding a slower, posh SSML delivery.
- **Steps:** read the official Polly supported-tags and prosody documentation; build matching audio/speech-mark SSML requests; verify with local SDK stubs and mock speech. No AWS request was made.
- **Expected:** `<emphasis>` around `**bold**` copy on the required neural voice.
- **Actual:** [Polly's support table](https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html) declares `<emphasis>` unavailable for neural voices, while rate/volume prosody is available. Sending the requested tag would make the live path fail.
- **Workaround:** XML-escape runtime text; use overall 90% rate and 85% rate/+2 dB prosody on bold words for neural synthesis. Retain a standard-engine SSML mapper using literal `<emphasis>`. Audio and marks always use identical SSML.
- **Suggestion:** support neural `<emphasis>`, or publish a recommended neural equivalent beside the unsupported tag. Severity: moderate; live delivery still requires credential-backed verification.

## F-VOICE-VEGA-02 · 2026-10-13 EDT · native speech transport

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2; react-native-w3cmedia 2.3.2, RN 0.72.
- **Task:** play the relay's silent MP3 and drive the host with its marks.
- **Steps:** test authenticated HTTP MP3, an MP3 URL suffix, and memory-backed `audio/mpeg` SourceBuffer; then convert the same bytes in memory to fragmented AAC/MP4 and append them to `audio/mp4; codecs="mp4a.40.2"`.
- **Expected:** the documented flat-file MP3 / MP3 SourceBuffer path advances on the native player.
- **Actual:** HTTP MP3 returned MEDIA_ERR_SRC_NOT_SUPPORTED (4); MP3 SourceBuffer returned MEDIA_ERR_DECODE (3). Fragmented AAC/MP4 advances with word/jaw telemetry. A recording plus a same-player reset exposed a separate slow restart that is still under verification at this checkpoint.
- **Workaround:** retain the original MP3 endpoint and add a memory-only `format=mp4` variant, prefetch native bytes, retain playback bytes until cleanup, and use the SDK's blob URL attachment to release its source registry entry. No download, audio file or extra AWS call.
- **Suggestion:** document the tested audio SourceBuffer formats and source-restart lifecycle; include a small raw AudioPlayer/MediaSource example and actionable error text instead of a numeric code with an empty message. Severity: major during native integration.


## F-VOICE-VEGA-03 · 2026-10-13 EDT · speech restart and callback deadline

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2; react-native-w3cmedia 2.3.2, aarch64 Release / Hermes / RN 0.72.
- **Task:** make every host cue select Polly or blips within 600 ms during a normal-speed all-bot game.
- **Steps:** hold the shared VVD lock; run muted mock speech; reuse a completed MediaSource player; isolate recording contention; retain encoded bytes until cleanup; replace source reload with asynchronous deinitialization; prebuffer one upcoming scripted clip and warm its decoder at volume zero; rebuild and run the full game.
- **Expected:** source restarts advance promptly, and the single 600 ms fallback timer executes by its deadline.
- **Actual:** source reuse could stall startup without an exception. The replacement/preparation lifecycle completes every scene with advancing marked speech and zero codec/runtime exceptions, but JS deadline callbacks still arrive late under native load. A preceding full-game run observed fallback latency up to 1,555 ms; the final accepted receipt records its own per-line measured values. The deterministic 600 ms tests pass; the native hard deadline remains unmet. Starting console recording before playback also delayed startup; recording after advancement produces a valid lobby clip.
- **Workaround:** one active and at most one prepared voice player, bounded memory copies, asynchronous retirement, zero-volume decoder warmup and a single deadline timer. Reject late speech for that line; never wait for synthesis or switch back from blips. Start capture after confirmed advancement. Full native receipts and the bounded mouth-motion clip are in docs/review/voice. No paid call, extra SDK or persisted player media.
- **Suggestion:** provide an audio-focused MediaSource example with supported reset/reuse semantics and decoder-ready events; expose media command/JS callback queue latency and a native deadline or cancellable scheduled-play primitive. Severity: major for the strict latency acceptance requirement.


**Final voice verification update (2026-10-13 EDT):** warm Color Rush/Showstopper winner speech during the existing scan/tally intervals, warm Brag winners during the existing 560 ms knockout, and avoid a second seek on an already-warmed native slot. The final source at bcdfe1b completes all eight native scenes with 27/27 routed lines, 25 Polly and two blips, zero runtime/audio exceptions. Its maximum measured route latency is 907 ms; the strict 600 ms native callback deadline remains unmet. The original MP3/SourceBuffer failures are resolved by fragmented AAC/MP4, but the scheduler limit is not resolved. Final receipts, explicitly superseded timing runs and the bounded lobby clip are in docs/review/voice; no paid call or player media was persisted.


## 2026-10-13 EDT · remote WAV URL playback on VVD

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2; react-native-w3cmedia 2.3.2, aarch64 Release / Hermes / RN 0.72.
- **Task:** replace the relay's encoder runtime with Polly 16 kHz PCM wrapped as WAV, and verify every native host line at normal speed.
- **Steps:** hold ~/.snag-vvd.lock; mute the Mac; build/install/launch against an isolated mock relay; set AudioPlayer.src to the authenticated audio/wav endpoint; also test a single src assignment without a second load() and an authenticated .wav suffix; run the full all-bot host-line check.
- **Expected:** the WAV source advances like packaged WAV effects, with synchronized word/viseme marks and safe fallback for unavailable lines.
- **Actual:** remote WAV returns MEDIA_ERR_SRC_NOT_SUPPORTED (4) with an empty error message; both the single-load and suffix probes fail. Packaged WAV effects work and the same relay WAV advances in Chrome. The native lobby selects blips in 2 ms. Native marked WAV speech is not verified.
- **Workaround:** keep the requested PCM/WAV relay with no encoder dependency and use the existing per-line blip fallback on this VVD. The verifier saves full host-line receipts and exits nonzero for the failed native speech checks. No audio file, paid API call or player photo is persisted. No native WAV playback workaround is proven.
- **Suggestion:** document URL-mode support for remote PCM WAV versus packaged WAV, supply a minimal authenticated WAV example, and include an actionable reason with error 4. Severity: major for native Polly playback. A related URL-mode failure is reported in the [Amazon Developer Community](https://community.amazondeveloper.com/t/audioplayer-url-mode-fails-with-media-err-src-not-supported-on-vvd-app-never-connects-to-com-amazon-media-server-both-official-media-samples-also-fail/29117); this entry records our own environment and results.

**Full native WAV receipt:** all eight scenes complete, 27/27 host lines use blips, zero runtime exceptions, 33 audio-error records (26 code-4 events and seven loader callbacks). Maximum fallback decision latency is 650 ms, so the strict 600 ms native callback limit is also unmet. The native check exits 1 and its receipt is explicitly pass:false. See docs/review/voice-wav/native-voice-game.json.


## 2026-10-13 EDT · 48 kHz stereo remote WAV still rejected; AAC repair verified

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2; react-native-w3cmedia 2.3.2, aarch64 Release / Hermes / RN 0.72. Static fallback encoder: John Van Sickle FFmpeg 7.0.2 arm64.
- **Task:** fix the merged native voice regression; first match bundled SFX's 48 kHz stereo 16-bit WAV, then use the prior AAC/MP4 path if WAV still fails.
- **Steps:** hold ~/.snag-vvd.lock, mute the Mac, linearly upsample Polly PCM by 3 and duplicate channels, verify WAV headers/duration/Content-Length and authenticated byte ranges, build/install/run on VVD; after WAV fails, restore AAC/MP4 prefetch and MediaSource, reduce idle-player initialization work, and rerun normal-speed all-bot native/web games.
- **Expected:** the remote WAV works like packaged WAV SFX; otherwise the prior AAC path produces marked native speech with a deployable encoder dependency.
- **Actual:** valid 48 kHz stereo WAV still returns error 4 and uses blips in 12 ms. The restored AAC path has no codec errors; its first run exposes late preparation fallbacks. After reusing the initialized idle voice bank, avoiding an unused replacement, planning glow-up speech and allowing greetings to finish, final native verification plays 28/28 lines through Polly, zero blips and zero runtime/audio exceptions, maximum start latency 582 ms. Web also plays 28/28 through Polly, maximum 107 ms.
- **Workaround:** ship memory-only fragmented AAC/MP4 on native, with PCM/WAV retained for web. EC2 setup verifies the pinned arm64 archive SHA-256 before extraction, checks FFmpeg 7.0.2-static and installs it on the service PATH. The exact static binary's Linux/VVD version and silent AAC encode were verified; a corrupt-checksum test proves it cannot extract or replace an installed binary. Receipts/clip are in docs/review/voice-native-fix. No live AWS call, persisted speech file or player image.
- **Suggestion:** document remote WAV URL-mode support separately from packaged WAV and provide actionable error-4 diagnostics. Include a supported raw AAC/MP4 MediaSource audio example and the cost of native player initialization/retirement. Severity: major, resolved here through the AAC path.


## 2026-10-13 EDT · console capture does not match native core scene

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2, authenticated emulator console screenrecord/screenshot, aarch64 Release/Hermes.
- **Task:** capture visible marked greeting after verifying the native audio regression repair.
- **Steps:** complete the normal-speed 28-line all-bot audio check, inspect its console finale screenshot, and try settled recording around a paused/reset greeting and a fresh app launch.
- **Expected:** console output shows the current lobby/finale and visible marked mouth movement.
- **Actual:** the purported finale and later paused greeting recording retain Intro imagery while core/speech telemetry reports different current scenes. Recording before a fresh greeting also produces a 2,039 ms startup fallback. The independently completed normal-speed audio check has 28/28 actual Polly routes, maximum 582 ms, no blips/audio errors; it was finished before these extra capture attempts.
- **Workaround:** retain the completed media-clock/word/jaw receipts as audio evidence, label mismatched console captures as failed visual evidence, and make no claim that the new footage proves visual acceptance. Existing original AAC greeting footage remains historical in docs/review/voice. No conclusion about the cause (renderer versus console capture) is established.
- **Suggestion:** attach current component/surface and frame timestamps to console captures, and diagnose mismatches between rendered scene and core snapshot. Severity: major for visual acceptance; separate from the repaired audio codec path.

### F-POLISH1-01 · 2026-10-14 · Amazon Devices Builder Tools MCP (server version not exposed) · Minor

- **Task:** discover the Vega build/media-control workflow for the Oct 14 feasibility gate.
- **Steps:** called `list_documents(documentType="WORKFLOW", device_os=["vega_os"])` before initializing this connection's project context.
- **Expected:** a workflow list, following the build skill's first discovery step.
- **Actual:** `PROJECT_CONTEXT_REQUIRED`: "You must call set_project_context before using any other tool, prompt, or resource."
- **Workaround:** read the existing `.adbt-config.json`, called `set_project_context`, then repeated workflow discovery and read the build, manifest and Media Controls guides successfully.
- **Suggestion:** put the context initialization prerequisite in the build/manifest skill workflows and the discovery tool's usage examples.

### F-POLISH1-02 · 2026-10-14 · Vega CLI 1.4.2 / SDK 0.24.12112 / VVD OS 1.2 · Minor

- **Task:** keep the shared headless VVD available for native transport verification.
- **Steps:** under `~/.snag-vvd.lock`, ran `vega virtual-device start --no-gui` from a short-lived command cell, then ran `vega device list` and VDA reverse forwarding.
- **Expected:** the reported "Virtual device ready" would leave a discoverable device.
- **Actual:** after the launch shell ended, `vega virtual-device status` reported `running:false`, `vega device list` returned "No devices found", and VDA returned "no devices/emulators found".
- **Workaround:** keep the owning PTY shell open with `tail -f /dev/null` after startup. The same VVD then stayed discoverable and installation/launch succeeded. The process-lifetime cause is inferred from this comparison.
- **Suggestion:** document the launch shell's lifetime requirement for automation or expose a persistent headless service option.

### F-POLISH1-03 · 2026-10-14 · Vega Media Controls 1.0.25 / RN 0.72 / SDK 0.24.12112 / VVD OS 1.2 · Major

- **Task:** register whole-game pause/play/next independently of the short-lived W3C audio players.
- **Steps:** added the media provider category and interface/Next opt-in; called `getOrMakeServer`, `setHandlerForComponent`, then `updateMediaSessionStates([])` for an idle lobby; built and installed an aarch64 Release using system JS bundles. Reproduced on three launches.
- **Expected:** an empty session list would withdraw the idle app's active playback session.
- **Actual:** the app reported an Error and then aborted (SIGABRT); the native crash stack names `updateMediaSessionStates`. A filtered stack is retained in `docs/review/tv/polish1/alexa-empty-session-crash.txt`. No spoken Alexa command was involved.
- **Workaround:** publish a complete single session with `NOT_PLAYING`, an empty action list, media info and playlist state while idle; publish `PLAYING`/`PAUSED` with transport actions during the game. Startup then completed with zero exceptions. This does not claim empty lists fail on every SDK/runtime.
- **Suggestion:** accept an empty session list or reject it without terminating the app, and show an explicit idle/deactivation example with all native-required state fields.

### F-POLISH1-04 · 2026-10-14 · Vega Media Controls 1.0.25 / RN 0.72 system JS bundles / VVD OS 1.2 · Major

- **Task:** inject pause/play/next through the documented Media Controls SDK client without signing the VVD into an Amazon account.
- **Steps:** after native provider registration and a `PLAYING` session succeeded, called `MediaControlComponentAsync.makeMediaControlEndpointLocator().getMediaControlEndpoints()` in the native release. Verified the factory and locator methods are functions before the call. Repeated after clean package installs.
- **Expected:** the focused game endpoint would be returned and accept transport requests; the official guide recommends these client methods for testing.
- **Actual:** endpoint discovery rejected with `TypeError: undefined is not a function`, before any endpoints or handler callback were obtained. The app remained running with zero runtime exceptions. The filtered failed attempt is `docs/review/tv/polish1/alexa-native-sdk.json`; no platform callback or spoken Alexa success is claimed.
- **Workaround:** exercise the same registered handler directly on the VVD and in unit tests, retain normal remote controls, and document the provider/Alexa route and retail-device test steps. Ship recommendation stays unverified until the signed-in stick supplies an actual command.
- **Suggestion:** make the SDK client's native/system-bundle API versions agree, return an actionable discovery error, and include an unsigned-VVD transport test in the sample.

### F-POLISH1-05 · 2026-10-14 · Vega CLI 1.4.2 / SDK 0.24.12112 · Minor

- **Task:** stop the worker's TV app before releasing the shared VVD lock.
- **Steps:** attempted `vega device stop-app --appName com.snagbrag.tv.main`, then inspected the CLI's device commands and `terminate-app --help`.
- **Expected:** a stop-app verb analogous to launch-app.
- **Actual:** "Vega CLI argument error: Unknown arguments: appName, stop-app"; this was an incorrect command assumption, not an app/device failure.
- **Workaround:** `vega device terminate-app --appName com.snagbrag.tv.main` succeeded, then the worker released the lock.
- **Suggestion:** mention `terminate-app` beside `launch-app` in the quick start, or provide a stop-app alias.

### F-POLISH1-06 · 2026-10-14 · Vega SVG/Reanimated 2.0.9000000001 / W3C Media 2.3.2 / RN 0.72 / VVD OS 1.2 · Major

- **Task:** cold-launch the polished native show and run a normal-speed all-bot game before replacing the armv7 package.
- **Steps:** built/installed the effects candidate (`aad4a02`) as aarch64 Release with SDK 0.24.12112/system JS bundles; launched with the ordinary staged native startup. Then held the diagnostic stage at layer 4 (audio/scene/HUD/host), waited for media initialization, and attached layers 5 and 7.
- **Expected:** the particle worklets and bounded audio bank would initialize concurrently and the control/host timelines would keep advancing.
- **Actual:** the initial candidate stopped at lobby cue 9 and the 30-second native handshake timed out with `latest=undefined`; no exception was reported. At layer 4 the diagnostic run returned 61 snapshots and a host cue with zero exceptions; attaching the particle layer after warm-up returned 34 more snapshots, and the full layer 7 stayed responsive. This isolates a startup/composition interaction; it does not establish a general SVG or audio failure.
- **Workaround:** native particle worklets now attach after `AudioEngine.preload()` resolves, through a React readiness context. Effects remain active during gameplay; no game/phase timing, recipe, media-player limit or wire contract changes. A fresh, uninjected launch then reached normal gameplay with Polly and zero exceptions; final acceptance is recorded separately under `docs/review/tv/polish1/native-final`.
- **Suggestion:** include a cold-start sample/test combining a bounded W3C audio pool, SVG/Reanimated particle worklets and multiple z-index layers, and provide diagnostics when this composition blocks the JS/control timeline.

### F-POLISH1-07 · 2026-10-14 · Vega Performance CLI 0.24.0 / SDK 0.24.12112 · Minor

- **Task:** measure native memory/UI performance while investigating stale native presentation.
- **Steps:** generated the stock test template, then ran `vega exec perf kpi-visualizer --app-name com.snagbrag.tv --kpi foreground-memory --iterations 1 --output-dir /tmp/snag-polish-kpi --disable-telemetry`. Also ran the existing activity monitor without recording.
- **Expected:** a memory measurement, with no browser or SDK download.
- **Actual:** KPI Visualizer installed KSPTService, waited for trace daemons and reported "Appium server is not found in the platform". Activity Monitor reported `(19, 'Operation not supported by device')` for its terminal UI but still printed CPU/memory rows; the measured app memory was approximately 572.3 MiB. This does not certify UI fluidity.
- **Workaround:** used the existing monitor's numeric rows and targeted native-layer/visual probes. No Appium server or extra SDK was downloaded. Consolidated paint order at the stage containers to avoid a nonzero z-index on every nested primitive.
- **Suggestion:** permit a foreground-memory-only KPI without an Appium server, and make noninteractive activity monitoring honor the requested timeout or provide a numeric-only mode.

### F-POLISH1-08 · 2026-10-14 · Vega W3C Media 2.3.2 / SVG-Reanimated 2.0.9000000001 / SDK 0.24.12112 / VVD OS 1.2 · Major

- **Task:** pass the integrated normal-speed all-bot release gate with every host line playing through mock Polly.
- **Steps:** cold-launch aarch64 Release/Hermes; run the full show with all effects; retain all route/completion events; repeat without console recording; inspect the Brag payoff and champion preparation paths. Compare the 600 ms and 1,200 ms candidates, then yield particle sampling in four-frame batches and reserve the native preparation hold before core typing expires.
- **Expected:** prepared native speech starts promptly and finishes before the next mandatory phase line replaces it.
- **Actual:** earlier full games completed all eight core scenes with zero runtime/audio errors but selected 23–26 Polly routes out of 28. Native decisions reached JS as late as 1,719 ms; removing recording did not solve the Brag delays. One later run reached 28/28 Polly routes but cut a Brag clip at a scene change after 665 ms. A late clip could not extend a typing job that had already finished. These historical receipts are retained under native-first through native-sixth in docs/review/tv/polish1.
- **Workaround:** the current native permission window is bounded at 2,000 ms, with web unchanged at 600 ms. Reserve mandatory preparation/read time in a microtask after the core installs its typing/phase wait, then include the clip duration. Yield sampled particle planning without changing its paths or recipes. Forced skips remain immediate; timed hunt/mash/vote deadlines and optional quips retain their existing limits. The release verifier now rejects any non-Polly route, post-route fallback or incomplete clip. This intentionally lengthens native mandatory speech/read pacing; it does not claim a hard native callback deadline. Final acceptance is recorded separately under native-final.
- **Suggestion:** provide an audio-focused native ready event, cancellable scheduled playback, callback queue latency diagnostics and a sample combining media preparation with large SVG/Reanimated bursts. Include full-clip completion in voice acceptance, rather than counting route selection alone.

### F-POLISH1-09 · 2026-10-14 · VVD OS 1.2 / SDK 0.24.12112 / Vega CLI 1.4.2 emulator console · Major

- **Task:** visually confirm the native game's finale after its core/audio run.
- **Steps:** capture the console surface after completed all-bot games; compare it with filtered current-scene snapshots; try a held/later particle layer, a paused frame, removal of the field and an ordinary Home key. This repeats the previously documented voice-worker capture mismatch.
- **Expected:** a completed champion/core state appears as the champion screen on the console surface.
- **Actual:** the historical native finale captures retained Intro/reel imagery and early HUD scores while core telemetry reported champion/completed. Additional layer/key probes did not establish whether the renderer or console capture caused the mismatch. The native-third/native-finale.png and native-first/native-stale-finale.png are failed visual evidence, not screenshots of a verified finale.
- **Workaround:** retain actual core/media-clock receipts separately from visual evidence and certify the requested effects/text audit on the real web target. Native visual acceptance remains unverified; no renderer-versus-console cause is asserted.
- **Suggestion:** include active component/surface/frame timestamps in console captures and diagnostics for stale surfaces. Provide a supported way to compare console output with the current app frame without account setup or an additional SDK.

### F-POLISH1-10 · 2026-10-14 · SDK 0.24.12112 / VVD OS 1.2 authenticated emulator console screenrecord · Minor

- **Task:** save a synthetic native verification screenshot.
- **Steps:** issued screenrecord screenshot with a destination directory that did not exist, then looked for a fresh PNG; repeated using a directory created with mkdtemp.
- **Expected:** a screenshot file or an actionable invalid-destination error.
- **Actual:** the first command reported OK but produced no usable PNG at the requested destination. An existing directory produced Screenshot_<timestamp>.png.
- **Workaround:** create a private temporary directory first, require exactly one fresh PNG, copy the synthetic capture into the review folder, and remove the temporary directory. The verifier already follows that pattern.
- **Suggestion:** validate destination existence, return a failing result when no file is written, and document that the argument is an existing output directory.

### F-POLISH1-11 · 2026-10-14 · local pnpm workspace / Node 24.20.0 / tools/tv-foundation generator · Minor (local verification ordering)

- **Task:** run root tests while preparing the final native candidate.
- **Steps:** overlapped pnpm test with the build script's asset generation, which rewrites the generated photo-mask module.
- **Expected:** all suites read complete generated assets.
- **Actual:** three TV suites loaded an undefined PHOTO_MASK_RLE export and failed; the failing root run aborted the relay suite. The incomplete-module race is inferred from the overlap, the undefined export and the clean sequential rerun. This is a worker scheduling mistake, not an Amazon service failure.
- **Workaround:** serialize asset generation and root verification. The sequential rerun passed all 446 tests and root typecheck; retain the earlier failure as docs/review/tv/polish1/root-build-race.txt.
- **Suggestion:** make generated-file replacement atomic or document that generation must not overlap readers.

**F-POLISH1-09 final capture update · 2026-10-14:** after the strict 28/28 complete-clip native core/audio gate passed, the separate console screenshot still retained Intro/reel imagery and zero HUD scores. The failed visual receipt/image are docs/review/tv/polish1/native-final/native-console-capture.json and native-postgame-console.png. Native visual acceptance remains unverified. The armv7 package was copied only after the requested core/audio gate and final root checks passed; spoken Alexa and armv7 hardware behavior still require the retail stick.

**F-POLISH1-11 tool version update · 2026-10-14:** the sequential final checks used pnpm 12.10.1 with Node 24.20.0.

## 2026-10-14 EDT · TV visual worker

### F-VISUAL-01 · VVD headless console captures stale or partial GL surfaces · Major

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2, emulator 34.1.15, aarch64 Release/Hermes; authenticated console `screenrecord`. Comparison capture: macOS 15.1 ScreenCaptureKit.
- **Task:** settle F-POLISH1-09, where a completed native game retained Intro imagery and zero HUD scores in console captures.
- **Steps:** add a debug-only shared-clock counter and read-only speech media time; build G2 `b52720d` and integrated `2e50c75` TV code; run each at normal speed with local mock services and a muted Mac; save eight PNGs and a 1080p60 Intro→Hunt clip per build. Compare integrated console pixels with independent Mac VVD-window pixels. Restart the same VVD/package headless and repeat; then run the complete native release gate with the overlay disabled and capture its actual window.
- **Expected:** every captured frame identifies the current complete TV stage and its advancing counter.
- **Actual:** both windowed builds presented all eight scenes. Headless core/clock commits progressed normally, but Standings showed Judge counter 1793 rather than committed counter 1859; Show and Champion still showed Judge counter 1793 when commits were 3644 and 3995. Brag showed an enlarged Judge card without HUD or counter. The overlay-disabled windowed release then completed all scenes and 28/28 whole mock Polly clips with zero exceptions/audio errors; its actual champion frame was current. These results reject the headless captures. Offscreen GL-surface selection is an inference, not a proved internal cause. Evidence/table: docs/review/tv/visual/REPORT.md and integrated-headless/presentation.json.
- **Workaround:** switch TV capture callers, the spike benchmark and tools/director to spike/tooling/capture.py, using a single-window ScreenCaptureKit source on a windowed VVD. Crop the title bar, exclude desktop/pointer/audio, require the existing lock, reject missing windows/invalid destinations, and verify actual encoded duration/codec/dimensions. The replacement's eight-second clip shows counter 7000→7134; root tests/typecheck and the strict native gate pass. Raw console access is retained explicitly for controls and diagnostics.
- **Suggestion:** report the composed display surface id, current presented-frame timestamp and capture-source id with each console image; reject stale/incomplete headless surfaces. Supply a supported fresh capture API that distinguishes app commits, offscreen surfaces and final display composition.

### F-VISUAL-02 · First cold headless launch loses the native control timeline · Major, intermittent

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2 / Media Controls 1.0.25.
- **Task:** repeat the presentation comparison after restarting the VVD headless.
- **Steps:** restart with `--gui=false`, restore reverse mappings 8787→8789 and 8790→8790, launch the unchanged integrated package, wait 30 seconds for fresh ready/loaded/Hermes control snapshots, inspect app logs and the local relay, then terminate/relaunch.
- **Expected:** native readiness/control telemetry before any game starts.
- **Actual:** the first launch showed a connected lobby but returned no control snapshot; its KCP provider logged repeated `Invoke listener callback timed out`. Reverse mappings were present and the relay was reachable. This failure is retained in docs/review/tv/visual/headless-startup. It does not establish a general Media Controls cause.
- **Workaround:** terminating/relaunching restored control and the normal-speed game completed without a package change. Keep this separate from the stale presentation captures; do not certify startup from an installation or lobby image alone.
- **Suggestion:** expose callback-wait and JS/UI-commit diagnostics alongside bootstrap readiness, and make provider registration failures return a bounded actionable error.

### F-VISUAL-03 · Printed VVD identifier rejected by device selection · Minor

- **Tool + version:** Vega CLI 1.4.2 / SDK 0.24.12112.
- **Task:** install and launch the G2 comparison package on the one worker-owned VVD.
- **Steps:** use the `amazon-…` identifier printed by `vega device list` with `device install-app -d` and `launch-app -d`; repeat with default selection after confirming only the virtual device is connected.
- **Expected:** the printed identifier selects that device, or help identifies the accepted name/serial.
- **Actual:** both explicit selections reported `Device not found`; default single-device selection installed and launched successfully.
- **Workaround:** use default selection for the isolated single VVD; VDA commands use the verified `emulator-5554` serial. No physical device was selected.
- **Suggestion:** print a directly usable selector beside each device, and include it in install/launch examples.

## Gallery worker additions (Oct 14)


## 2026-10-14 · Gallery capture: intermittent native control startup

- **Tool/version:** Vega SDK 0.24.12112, CLI 1.4.2, VVD OS 1.2; aarch64 Release/Hermes.
- **Task:** Prepare the native showcase gallery and join the local fake-camera phone.
- **Steps:** Start the windowed 1920×1080 VVD in a persistent terminal; install the Release package; reverse ports 8787 and 8790; launch `com.snagbrag.tv.main`; request the native control snapshot and join the local relay room from the fake-camera phone.
- **Expected:** The installed app answers control snapshots and phone joins after its ready/loaded telemetry.
- **Actual:** Some cold launches reached the native lobby/bootstrap but stopped answering the control and phone sockets. One normal-speed verifier timed out waiting for readiness; two phone joins timed out while the director held the lobby. The same package subsequently ran a complete normal-speed game with zero JS exceptions after relaunch. These observations do not isolate an SDK root cause.
- **Workaround:** Terminate/relaunch the app before filming, keep director heartbeat frames flowing while held, and preserve the native media-control component across capture seeks. The gallery adapter uses static held poses instead of registering a new set of native animations for every pickup.
- **Suggestion:** Expose diagnostics that distinguish an attached native WebSocket from a responsive JS message callback, and publish a reliable cold-launch/control readiness check for VVD automation.
- **Evidence:** `docs/gallery/capture.json`, `docs/gallery/checks.txt`; failed normal verifier and subsequent native podium pixels under `~/builds/snag-and-brag/footage/gallery-podium/`. The previously documented KCP startup issue is in `docs/review/tv/visual/REPORT.md`; no additional cause is claimed here.
- **Capture follow-up:** Port 8791 carries the native director renderer. Switching live native motion to a held pose during recording sometimes left artwork blank; a long static hold could also trip the ScreenCaptureKit wrapper's duration check because unchanged windows stop delivering frames. The final movie stops the continuous recorder before holds/seeks and adds a two-second hold of a separately captured native winner from the same session. Native live host typing/HUD point flights can lag the core winner beat; the held pickup is complete. Final native runtime telemetry reports zero exceptions. These are observed capture/composition behaviors, not an isolated SDK cause.


## 2026-10-14 · Release-prep worker

### F-RELEASE-01 · Builder Tools context gate is absent from the build skill's startup sequence · Minor

- **Tool + version:** connected Amazon Devices Builder Tools MCP (server version not exposed by available tools); repository build-and-run skill 1.1.0; associated Vega SDK 0.24.12112 / CLI 1.4.2.
- **Task:** discover the applicable build workflow before validating release packaging.
- **Steps:** read the repository build-and-run skill; call list_documents with WORKFLOW and vega_os; receive PROJECT_CONTEXT_REQUIRED; read the root .adbt-config.json and call set_project_context; repeat list_documents and read the build/install document.
- **Expected:** the skill's prerequisites/startup sequence includes the mandatory context initialization, or read-only discovery provides that initialization instruction before rejection.
- **Actual:** the first discovery call was rejected until context was set. Its returned recovery instruction was actionable, and subsequent documentation calls worked.
- **Workaround:** initialize project context from the root config before discovery/documentation calls. No installation, account or paid call was needed.
- **Suggestion:** add set_project_context to the skill's prerequisite workflow and the tool discovery entry point, including the empty-config fallback.

### F-RELEASE-02 · Release Hermes bytecode includes the build machine's home path by default · Moderate

- **Tool + version:** Vega SDK 0.24.12112 / CLI 1.4.2; React Native for Vega 2.0.9000000000 (RN 0.72); kepler-cli-platform 0.22.14.
- **Task:** produce armv7, aarch64 and x86_64 packages suitable for public distribution.
- **Steps:** build all three Release targets with system JS bundles; open each Zstandard/tar VPKG without extracting media; scan its Hermes bundle for home-path signatures; inspect the installed compiler's debug-info options; rebuild with --hermes-flags=-O,-w,-g0 and repeat the archive scan.
- **Expected:** public Release packages contain no local account or absolute checkout path.
- **Actual:** every initial Hermes bundle contained the absolute path of the hashed Metro input bundle under the local checkout. Plain JS and package build-info metadata had no such local path. The compiler supports -g0 to omit debug information.
- **Workaround:** the release script adds -g0 while retaining -O and -w. Scan the rebuilt archives; keep rich source-level debugging in private development builds. Root checks cover unchanged game/protocol source; the packager restores the original source config.
- **Suggestion:** make Release source/debug paths relative by default, or provide a documented privacy-safe release preset and an archive check for local paths. Keep source-map/debug artifacts outside the public package unless explicitly opted in.
- **Evidence:** docs/release/packages.json and docs/release/package-run.txt; packages remain gitignored in dist/release.

### F-RELEASE-03 · Compiler-path discovery needs the native app package, with a misleading legacy-name error at the workspace root · Minor

- **Tool + version:** Vega CLI 1.4.2 / SDK 0.24.12112; pnpm 12.10.1 workspace, Node 24.20.0.
- **Task:** inspect the installed Hermes compiler options while removing release debug paths.
- **Steps:** run vega path hermes at the workspace root, then repeat from tv/ and run the returned compiler with --help.
- **Expected:** an actionable message identifying the missing native-app working directory, or an explicit directory option.
- **Actual:** the root query failed with an empty npm-list result and an error expecting the legacy @amzn/react-native-kepler package name. The same query from tv/ returned the compiler successfully. This is a working-directory mistake during tool discovery, not a build failure.
- **Workaround:** use the native app package as the command's working directory. The packager already does so through pnpm --filter @snag/tv.
- **Suggestion:** report the current directory and recognized native package names, suggest running from the app directory, and support a project directory argument for workspace users.


## 2026-10-17 · Live AWS family-test deployment

### F-DEPLOY-01 · EC2 does not immediately accept a newly created IAM instance profile · Minor

- **Tool + version:** AWS CLI 2.38.1; IAM and EC2 in us-east-1.
- **Task:** launch the single Graviton relay with its scoped runtime role.
- **Steps:** create the snag-relay role/profile, add the role, immediately call EC2 RunInstances with that profile name.
- **Expected:** the completed IAM API operations make the profile usable by EC2.
- **Actual:** the first launch returned InvalidParameterValue / invalid IAM Instance Profile name. No instance was created by that failed request.
- **Workaround:** read the profile/role back, allow propagation, then retry; one t4g.small launched successfully. Private IDs are in ~/secrets/snag-deploy/context.sh.
- **Suggestion:** provide a waiter that verifies EC2 can use the profile and a retryable propagation-specific error. Deployment scripts should assign CLI output before exporting it so a failed command cannot be masked by export's exit status.

### F-DEPLOY-02 · Amazon Linux 2023 curl package conflicts with its preinstalled curl-minimal · Moderate

- **Tool + version:** current Amazon Linux 2023 arm64 AMI from the SSM public parameter; dnf; AWS CLI 2.38.1.
- **Task:** bootstrap nginx, the pinned FFmpeg 7.0.2 encoder, Node 24.20.0 and pnpm 12.10.1.
- **Steps:** run relay/deploy/setup.sh as EC2 user-data with dnf install nginx tar gzip xz curl.
- **Expected:** the requested base utilities install and bootstrap continues.
- **Actual:** curl and the image's curl-minimal provider conflict; cloud-init aborted before installing the encoder/Node.
- **Workaround:** retain the existing HTTPS-capable curl-minimal, remove curl from the dnf install list, and rerun the corrected script on the same instance. Both pinned archive checksums and executable versions passed. The historical cloud-init error remains; the corrected manual bootstrap and systemd service are verified separately.
- **Suggestion:** show the preinstalled minimal curl package in AL2023 bootstrap examples and explain whether replacing it is necessary.

### F-DEPLOY-03 · Partial workspace deployment fails the frozen pnpm install · Moderate

- **Tool + version:** EC2 Amazon Linux 2023; Node 24.20.0; pnpm 12.10.1.
- **Task:** install only relay runtime dependencies from the documented small source archive.
- **Steps:** ship relay/shared source and phone/dist with the root workspace lockfile, then pnpm install --prod --frozen-lockfile.
- **Expected:** install the relay and shared runtime from the existing lockfile.
- **Actual:** pnpm rejects lockfile importers whose package manifests were omitted, starting with phone/package.json. The original systemd unit also tried loading tsx from the workspace root, where a production install does not expose it.
- **Workaround:** include all workspace package manifests, retain the frozen lockfile, filter the install with relay..., and run the service from /opt/snag/app/relay. Only 100 runtime packages installed; no TV SDK/toolchain was installed on EC2. Strip macOS extended attributes from the archive. Corrected recipes are in relay/deploy/README.md.
- **Suggestion:** deployment examples for pnpm monorepos should include a tested manifest inventory, filtered install and package-local loader working directory.


### F-DEPLOY-04 · Mantle's Anthropic-compatible SDK shape includes unsupported model options · Moderate

- **Tool + version:** @anthropic-ai/bedrock-sdk 0.34.4; Mantle Messages API; Opus 5, Sonnet 5, Haiku 4.5; docs checked October 17.
- **Task:** make the three release candidates ready for the live account-access/latency test.
- **Steps:** compare the existing SDK request's output_config.format and effort=low with the current primary feature/platform and per-model compatibility tables.
- **Expected:** an Anthropic-compatible Messages client makes supported request options discoverable for its Bedrock endpoint and chosen model.
- **Actual:** current Claude in Amazon Bedrock documentation excludes structured outputs, and the effort model list excludes Haiku 4.5, although the SDK types accept both fields. Existing stub tests could accept an API request the service does not support. The account returns 403 before a live unsupported-parameter error can be observed; this finding is documentation-backed, not a claimed live 400.
- **Workaround:** omit format on Mantle, request JSON in the unchanged canonical prompt, preserve local strict validation/clamping, use low effort only for the Opus/Sonnet candidates. SDK transport tests now check all three candidate payloads. The four-second fallback and wire shape do not change.
- **Suggestion:** publish endpoint/model feature metadata usable by the SDK and validate unsupported options locally, before account activation or billable inference.
- **Sources:** https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock#features-not-supported and https://platform.claude.com/docs/en/build-with-claude/effort#compatibility.


### F-DEPLOY-05 · Requested Claude models remain unavailable after the full two-hour access window · Blocking for live vision

- **Date:** 2026-10-17.
- **Tool + version:** AWS CLI 2.38.1; @anthropic-ai/bedrock-sdk 0.34.4; Mantle Messages/catalog APIs and Bedrock GetFoundationModelAvailability, us-east-1.
- **Task:** enable live photo naming for the family test; benchmark five successful calls and select Opus 5 below 3.5 s p95, otherwise the fastest eligible Sonnet 5/Haiku 4.5.
- **Steps:** create/read back a dedicated zero-retention Mantle workspace; invoke each of anthropic.claude-opus-5, anthropic.claude-sonnet-5 and anthropic.claude-haiku-4-5 on a synthetic image every ten minutes from 15:05:21 through 17:05:21 UTC; inspect the model catalog and availability signals. No player photo, request body or credential was logged or saved.
- **Expected:** an enabled candidate returns validated JSON, allowing five successful latency samples and a runtime model choice.
- **Actual:** all 39 scheduled probes across 13 cycles returned HTTP 403; zero successful inferences, so no successful-call p95 or latency-selected model exists. The final catalog marks all three unavailable while allowing retention mode none. Opus/Sonnet report AUTHORIZED, entitlement AVAILABLE and region AVAILABLE, but agreement NOT_AVAILABLE. The catalog directs the owner to AWS Sales for access options. Haiku's Mantle ID is rejected by the foundation-model availability API, so its catalog status is the access evidence. Account-catalog reads also reject the Anthropic workspace header; omit that header on this diagnostic endpoint while retaining it on Messages.
- **Workaround:** keep the requested Opus 5 configuration with the existing four-second fallback; the corrected hosted smoke returned that fallback in 159 ms. Live Arthur voice and the full hosted game pass. Owner/AWS action is required for agreement/access; repeat the five-success latency test when enabled, update policy and environment together if selecting another model, and restart between games. The project remains at retention none.
- **Suggestion:** expose an actionable agreement/access prerequisite in the SDK error and console; provide one availability diagnostic with consistent model identifiers across Mantle and the foundation-model API, and document which project headers each endpoint accepts.
- **Evidence:** docs/release/live-bedrock-result.json, live-bedrock-probes.jsonl, live-bedrock-catalog.json, live-hosted-smoke.json and live.md. The timed retry process exited after 7,200.317 seconds; no further automatic probes remain.

### F-DEPLOY-05 follow-up · Owner-console test and accepted model alternatives · October 17

The owner requested Opus 5.5, then accepted Opus 5 or Sonnet 5+ as alternatives.
The catalog now lists these models as available, including image input and
no-retention support for Opus 5.5. The game workspace still verifies retention
none. However, the owner-console Opus 5.5 text request and deployment-identity
image calls to Opus 5.5, Opus 5, Sonnet 5, Opus 4.8 and Opus 4.7 all return
403: the model is not available for this account, with a link to AWS Sales.
The deployment and console accounts match. Opus 5.5 agreement availability is
NOT_AVAILABLE; authorization, entitlement and region are AVAILABLE/AUTHORIZED.
Catalog availability alone does not establish usable account access. Evidence:
`docs/release/opus55-access.json`. An unsubmitted AWS access-request draft is
`docs/release/claude-access-request.txt`; no further retry loop was started.

### F-DEVICE-REG-01 · Unfinished developer registration appears as an invalid-token error · Blocking

- **Date:** 2026-10-17.
- **Tool + version:** Vega CLI 1.4.2, active SDK 0.24.12112; Amazon Developer portal.
- **Task:** enable Developer Mode on the new physical Fire TV Stick 4K Select.
- **Steps:** run `vega devmode login`; finish Amazon's browser authorization; inspect the CLI result; open the developer dashboard with the same signed-in account.
- **Expected:** either authenticated vendor access or an actionable registration prerequisite.
- **Actual:** browser authorization succeeds, but the CLI reports `Failed to verify vendor registration: http 401` with `invalid_token` / `Authentication failed`. The developer dashboard redirects to the unfinished Amazon Developer Registration form. `vega device list` reports no devices before enablement.
- **Workaround:** the owner completes developer registration, or signs in with an already registered developer account, before repeating CLI login and device activation. The registration form has been opened for the owner; account creation and agreement submission were not performed by the agent. A retry was stopped while registration remains unfinished.
- **Suggestion:** report `Developer registration incomplete` with a direct registration link instead of an invalid-token error after successful browser authorization. Preflight vendor registration before prompting for the expiring device code.
- **Primary support reference:** https://community.amazondeveloper.com/t/authenticate-developer-mode-on-vega-fire-tv-displays-an-error-message/29094 (Amazon response identifies incomplete vendor registration and the reporter confirms the fix).

**October 17, 17:06 Eastern update:** the owner authorized submission of the
Claude access request. AWS Basic Support confirmed the new account-access case
with Web/email replies. Its identifiers remain in the private deployment
directory. The owner requested the existing fallback meanwhile; a fresh hosted
smoke returned fallback in 96 ms with live Polly and room-media cleanup passing.
The developer portal's My Apps link still redirects the current signed-in
account to registration after browser Allow; the account used for completed
registration remains to be clarified.

**October 17 registration resolution:** the owner completed developer
registration and reports identity verification complete. A fresh CLI login
exited successfully with `Login successful! You are now authenticated with
Amazon Developer Services.` Vendor enumeration returned one vendor. The earlier
401 is resolved; the physical device is still absent from `vega device list`
while its on-TV Developer Mode activation code is pending. No identity documents
or private profile details were copied into the repository.

**October 17 activation progress:** the owner obtained the on-TV code after
unlocking Developer Options. `vega devmode enable-device --json` exited 0 with
`status: success`. Post-reboot device discovery and USB connection remain
pending; successful CLI activation is not yet a native installation receipt.

**October 17 USB verification:** after the owner connected the stick to the Mac,
device discovery succeeded. The physical `callie` device reports `armv7l`,
OS 2.0 (TV Ship/515), and Developer Mode enabled. The exact hosted armv7 package
installed successfully and its app process was confirmed running after launch.
This completes the developer-access setup; real-phone play and native
performance remain separate acceptance checks.

### F-DEVICE-ANR-01 · Retail-stick start/play freezes missed by simulator acceptance · Blocking

- **Date:** 2026-10-17.
- **Target:** Fire TV Stick 4K Select, product `callie`, armv7l, OS 2.0 (TV Ship/515); SDK 0.24.12112 / CLI 1.4.2.
- **Trigger:** first real-phone “Hold to go live” test terminated the TV app. An autonomous native run also froze; both later stalls were reproduced without player media.
- **Observed:** LCM killed the app for `AppNotResponding`, `Thread Monitor`, `JSReactThread` (8-second watchdog). The original stripped release stack stopped in React `useMemo`; its exact operation is not established from that stack. A symbol-bearing diagnostic reproduced a music crossfade blocked in W3CMedia `load()`. After removing the redundant load, the synthetic-phone run exposed another ANR in thumbnail `pixelatedPng()`.
- **Corrections under verification:** Vega's URL setter already invokes its load algorithm, so packaged native audio no longer calls `load()` a second time. PNG scaling precomputes source columns; Adler-32 uses numeric 5552-byte blocks instead of per-byte iterator/modulo work. Base64 joins bounded chunks instead of growing one large string. Pixel colors, output geometry and memory-only media handling are preserved.
- **Evidence:** `docs/review/device/20261017-start-anr/triage.json`; all 470 root tests and typechecking passed after the audio change, and all 109 TV tests pass after the raster changes. The revised full real-device game is still running; no user-ready or frame-rate pass is claimed.
- **Suggestion:** make `src`'s implicit native load behavior prominent, and include a 1 GB retail-device image/audio reference workload. Keep system-bundle and app stack source locations available in release diagnostics.

**October 17 evening root-cause correction:** App.Show used the same React sibling
key for the scene, particles and host. A negative control mounts six scene layers
and four particle fields after startup and one update; unique keys keep one of
each and clean them all on unmount. This is our application bug and explains the
stale title plus accumulating workload. The earlier native graph/CPU observations
must not be presented as an isolated SDK defect. The actual React composition is
now covered by `tv/test/stage-lifecycle.test.tsx`. Additional native media/particle
and heartbeat fixes pass 492 tests and typechecking; device acceptance is still
separate and in progress.

**Native Back callback observation:** on SDK 0.24 / RN 0.72 the same injected
KEY_BACK reached TVEventHandler and hardwareBackPress 171 ms apart. A 100 ms
deduplication window did not help: one press paused and immediately resumed the
game. Use only BackHandler for native Back, retain TVEventHandler for browser
Escape and other buttons, and declare `com.amazon.inputd.service`. Regression
tests exercise both callback orders. This is a corrected application integration
issue; no platform crash is attributed to duplicate input delivery.


### F-TV-IDLE-01 · 2026-10-17 · Retail callie OS 2.0 / SDK 0.24.12112 · Major

- **Task:** complete a phone-controlled game without touching the TV remote.
- **Steps:** launch the native game, join with an owned synthetic phone, play at normal speed, and inspect LCM state every 20 seconds.
- **Expected:** active phone play keeps the shared TV show visible through the finale.
- **Actual:** the system screensaver takes foreground after about five minutes of no remote input. The background game can then be terminated for its resource quota. The component inactivity timeout of 1,800 seconds does not change this display policy. The latest run reached the final round countdown after 309 seconds, with six native photo decodes and live Polly, before takeover.
- **Workaround:** pause immediately, synchronously release all native audio decoders, and unmount scene/effect layers on both supported lifecycle channels. Lobby Home/warm return and a two-minute Settings recovery pass, but full-game background recovery remains unverified. Extending the TV timeout requires an owner preference change; no setting has been changed.
- **Suggestion:** provide a documented engagement API for foreground games receiving authenticated controller activity over the network, with automatic release on pause/background. Amazon confirms the current limitation and available timeout path in its [developer response](https://community.amazondeveloper.com/t/vega-os-no-api-or-device-setting-to-keep-the-display-awake-for-non-media-signage-kiosk-apps-screensaver-engages-despite-foreground-app/28610).

**Application cleanup correction:** awaiting the first decoder release before requesting the next one was unsafe because backgrounding can suspend JavaScript between awaits. Request every native pause/deinitialize before awaiting their completion. That sequencing bug was ours; the regression covers immediate release of the entire pool.

## 2026-10-20 · Browser review blocked by native-only AppState event

- **Tool + version:** React Native Web 0.19.13, Vite 7.3.7; existing Vega RN 0.72 application lifecycle integration.
- **Task / steps:** Install the workspace, run `pnpm --filter tv dev`, open the local TV page in muted system Chrome.
- **Expected:** Browser adapter mounts the TV renderer for scene review.
- **Actual:** App startup throws `Trying to subscribe to unknown event: moduleChange` before the debug session is available. App.tsx subscribes to Vega's moduleChange event through the web re-export of React Native AppState. This is an application compatibility gap, not a finding about the native Vega event.
- **Workaround:** Add an explicit browser AppState export to stage/web/remote.ts. Standard events forward to React Native Web; the Vega-only subscription returns a removable no-op. Native AppState handling is untouched. Twenty synthetic held states render with zero page exceptions; full root tests/typechecking pass.
- **Suggestion / severity:** Keep platform-specific lifecycle events behind the platform adapter. Severity: blocked web visual review until fixed; no new hardware behavior claimed.


## 2026-10-20 · Physical stick celebration / capture acceptance

- **Tools:** retail callie OS 2.0 (TV Ship/515), Vega SDK 0.24.12112, CLI 1.4.2; official `gwsi-tool-screenshooter` through VDA.
- **Task:** reproduce Nick’s frozen/messy finale and capture snag, judge winner, knockout, Showstopper winner and finale at 0.5/2/4/8 seconds.
- **Actual:** live native SVG particle batches produced the large white slam/ring arcs; finale cues also keep emitting fireworks/crowd indefinitely. A first bounded-raster pickup also retained the preceding wipe’s SVG SNAG/BRAG lettering behind knockout content. The native raster wipe pickup clears that artifact. A composed 4K screenshot takes roughly 3–6 seconds to return; separate CLI startup adds about 0.2–0.5 seconds. This cannot certify an exact sub-frame acquisition time.
- **Workaround:** one native-driver confetti sheet (40 baked pieces), native fade to zero at 2.068 seconds and JS retirement at 2.2 seconds; suppress native rings/fireworks/automatic particle simulation; bake the scene wipe lettering too. Retain device before/after timestamps for each requested capture. Physical screenshots use GWSI, never the stale headless console or a VVD image. The available windowed ScreenCaptureKit tool targets VVD; no physical HDMI capture window is present. Native render FPS is recorded separately without captures or extra input.
- **Suggestion:** expose frame acquisition timestamps and a supported physical-device video/window stream so timed device review does not rely on wide readback/encoding brackets.

## 2026-10-20 · Immutable SFX atlas is not a shipping audio fix

- **Tools:** same retail stick/SDK; native W3C AudioPlayer, native Thread Monitor report, hosted synthetic verifier.
- **Task:** remove the repeated native URL load implicated by the baseline watchdog.
- **Actual:** baseline stopped after 275.255 seconds in round-two knockout. Owned ACR246 identifies AppNotResponding / Thread Monitor / JSReactThread; last synchronous trace entered `AudioPlayer.load` through effect player audio-1’s source setter without returning. An immutable 47.352-second bank avoids those per-cue source changes, but eight PCM voices and then two PCM voices return audio stream initialization error 3; games complete visually with speech falling back to blips. A fresh two-voice Ogg bank also returns error 3. Compression alone is not a fix; the exact native allocation failure remains to be isolated.
- **Workaround/status:** all atlas artifacts remain diagnostic and blocked from promotion. Public failure summaries are in `docs/review/stick-vs-mockup/`; native reports, raw telemetry and packages stay outside git. Next experiment is a bounded PCM playback stream with short queued buffers and unchanged approved effect samples, avoiding decoder source teardown and long retained effect streams.
- **Suggestion:** document retained sink/buffer costs, supported concurrency on 1 GB callie, and a nonblocking effect playback example.

## 2026-10-20 · Incremental Vega packaging retains removed raw assets

- **Task:** replace the diagnostic WAV atlas with Ogg.
- **Actual:** deleting `tv/assets/raw/native-sfx.wav` does not remove the existing staged `tv/build/private/vega/armv7/Release/assets/raw/native-sfx.wav`; the next archive retains an unused 9,091,596-byte WAV.
- **Workaround:** inspect archive contents, mark this package diagnostic only, and remove that exact owned obsolete staged asset before the next package. A production package must be inspected again.
- **Suggestion:** synchronize deletions when staging raw assets, or provide a documented asset-only clean option.


**Scope correction, Oct 20 / lead-notes-2:** the worker visual/raster changes described in the preceding capture experiment have been backed out. Subsequent current-design evidence uses the lead branch plus a flagged native-finale particle cutoff. Earlier calm-stage screenshots and FPS are not acceptance evidence for that design. The audio-atlas source is also reverted; its failed receipts are retained only as diagnosis history.


## 2026-10-20 — Builder Tools API-page navigation consumes the document limit

- **Tool/version:** Amazon Devices Builder Tools MCP `read_document`, Vega API 0.24.
- **Task/steps:** Read the official AudioPlaybackStream and AudioPlaybackStreamBuilder API pages returned by documentation search.
- **Expected:** The class methods, status values and examples are available for implementation.
- **Actual:** Each result stops at 100,020 characters inside the global API navigation. No main class heading or method body survives, although search returns relevant method snippets.
- **Workaround:** Read the exact installed/published 2.0.18 TypeScript declarations locally; keep search snippets as the online cross-check.
- **Suggestion:** Strip global navigation before applying the result limit, or offer section/method retrieval.

## Oct 20 · Vega WebSocket text frames corrupt non-ASCII characters
- **Where:** Vega OS 2.0 on the Fire TV Stick 4K Select, RN 0.72 global `WebSocket`, `ws.send(string)`.
- **What:** a status string containing "…" (U+2026), composed on the stick and relayed through a Node `ws` server, appeared on
  the browser phone as "scanningâ€¦" (UTF-8 bytes read as Windows-1252). The phone page and its assets are served as UTF-8,
  and the relay decodes frames as UTF-8. The stick is the only non-browser hop, but the exact layer that double-encodes
  is not yet verified with a byte capture (to do on the next device session).
- **Repro:** from a Vega app, `new WebSocket(url).send(JSON.stringify({ msg: 'a…b' }))` to any `ws` echo server;
  compare received bytes with `E2 80 A6`.
- **Workaround:** escape every non-ASCII character as `\uXXXX` before sending (both directions), so frames stay ASCII.
- **Ask:** encode text frames once as UTF-8 per RFC 6455, and add a non-ASCII case to the WebSocket conformance tests.

## Oct 21 · Vega UI frame cost: five ordinary RN styles that each cost 5-20 fps on the stick
- **Where:** Vega OS 2.0, Fire TV Stick 4K Select (armv7, 1 GB), native RN 0.72, SDK 0.24. Measured with
  `vega exec perf record --trace-categories="['graphics']"`, counting `gwsi_surfacePresented` per surface, while
  toggling one layer at a time over a debug control channel (receipts: `docs/review/stick-vs-mockup/perf.md`).
- **What:** the compositor showed `droppedFrames:0` and 60 Hz vsync while the app submitted only 24 frames a second
  (`gwsi_3dStats clientPresentRequestsPerSec`). Nothing in the docs or the profiler UI points at which style costs the
  frame. Per-layer ablation in a static lobby found:
  1. `borderStyle: 'dashed'` on rounded views (4 HUD slots, badge rings): 60 → 47 fps. Solid borders: 60.
  2. `overflow: 'hidden'` + `borderRadius` + `transform: rotate(-3deg)` around a child with a native-driver loop: −9 fps.
     An axis-aligned clip with no radius costs almost nothing.
  3. `KeplerVideoSurfaceView` as a full-screen backdrop under the RN UI: the UI surface fell to 25-46 fps by scene;
     a still raster in its place held 47 fps in every scene. The video surface also presents on its own surface ID,
     which doubles naive frame counts.
  4. `react-native-svg` paths with thousands of subpaths (a 3,600-dot field) are re-tessellated every frame the screen
     redraws: Brag-Off 16 fps. The same dots as one PNG: no measurable cost.
  5. Any continuously looping native-driver animation (a ticker, an idle sway) forces a full-surface redraw every vsync;
     three small loops together took the lobby from 60 to 47-51 fps.
- **Repro:** a 1280×720 stage scaled to 1080p; add four `View`s with `borderRadius: 18, borderWidth: 4,
  borderStyle: 'dashed'` and one `Animated.loop` translate; record `graphics` and compare presents per second with
  `borderStyle: 'solid'`.
- **Workaround:** solid borders, scissor-only clips, still mood rasters instead of a video backdrop, pre-rendered
  rasters for dense vector art, and no idle loops on native.
- **Ask:** a "frame cost by view" overlay or trace category (draw calls, stencil/offscreen passes, tessellation time
  per native view), a performance guide listing these styles with their measured cost on the Select, and a cached
  layer option (like `shouldRasterizeIOS`/`renderToHardwareTextureAndroid`) so a static subtree is not redrawn when a
  sibling animates.
