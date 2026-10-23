# Spike friction log

Observed 2026-10-12. Only reproduced issues are listed as findings; inherited September notes are background.

### 2026-10-12 · Vega CLI 1.4.2 / SDK 0.24.12112 · minor
- Task attempted: scaffold the spike in `spike/vega-app/`.
- Steps taken (commands): `vega project generate --template helloWorld --name vega-app --packageId com.snagbrag.spike --outputDir spike`.
- Expected: an app identifier derived from the project name, or a clear naming example before generation.
- Actual (exact error text): `Vega operation FAILED due to an irrecoverable error: vega-app is not a valid project name` followed by `Allowed characters: [a-zA-Z0-9]` and `Max length: 100 characters`.
- Workaround: use the alphanumeric name `VegaSpike` and set the output directory separately.
- Actionable suggestion for Amazon: describe the restricted name syntax in `generate --help`; keep folder names independent of app identifiers.

### 2026-10-12 · Vega environment / CLI 1.4.2 · minor
- Task attempted: use VDA after the documented `source ~/vega/env`.
- Steps taken (commands): `source ~/vega/env`; `vda devices`.
- Expected: the device adaptor to be on PATH.
- Actual (exact error text): `zsh:5: command not found: vda`.
- Workaround: `vega exec vda devices`, or resolve its absolute path with `vega which vda`.
- Actionable suggestion for Amazon: consistently show `vega exec vda` in examples for component-aware SDKs.

### 2026-10-12 · Vega expo-font documentation (SDK 0.24) · minor
- Task attempted: install the dependencies listed in `expo-font.html` for the native font test.
- Steps taken (commands): copied `@amazon-devices/keplerscript-turbomodule-api: ~1.0.0` from the dependency example, then ran `npm install --cache ../.cache/npm --legacy-peer-deps`.
- Expected: the example resolves to a published package.
- Actual (exact error text): `npm error notarget No matching version found for @amazon-devices/keplerscript-turbomodule-api@~1.0.0.`
- Workaround: `npm view @amazon-devices/keplerscript-turbomodule-api versions --json` showed `1.2.5`; pinned that version. Install succeeded.
- Actionable suggestion for Amazon: validate the entire dependency example against the public registry in docs CI; use a valid compatible range.

### 2026-10-12 · Vega CLI 1.4.2 / VVD · minor
- Task attempted: start the existing VVD from a noninteractive command runner.
- Steps taken (commands): `vega virtual-device start --display-res 1920,1080`; queried status after the command finished.
- Expected: `Virtual device ready` implies the device remains available.
- Actual (exact output): startup returned `Virtual device ready.` but the following status was `{"running":false,"process_ids":{"qemu":-1}}` and `vega exec vda devices` returned no devices.
- Workaround: started `vega virtual-device start --no-gui` in a persistent PTY, leaving its parent shell alive. `emulator-5554 device` appeared and the authenticated console reported `virtual device is running`. The cause (GUI vs command-runner process lifetime) is not isolated.
- Actionable suggestion for Amazon: provide a documented detached/headless start mode with persistent logs and readiness checked after parent command exit.

### 2026-10-12 · Builder Tools MCP 1.0.17 · major
- Task attempted: read AudioPlayer and AudioPlaybackStream API docs through the MCP.
- Steps taken (commands): MCP `read_document` for `https://developer.amazon.com/docs/vega-api/0.24/classes.AudioPlayer.amazon-devices_react-native-w3cmedia.html` and the AudioPlaybackStream page.
- Expected: the class description, members and examples.
- Actual: each response was exactly 100,020 characters; the enormous navigation tree consumed the cap before the API body. Searching the returned text for the class heading/method definitions failed. No tool error indicated the loss of the useful content.
- Workaround: fetch the primary URL directly and inspect the page's actual content; use MCP search snippets to locate the relevant API or working sample.
- Actionable suggestion for Amazon: extract the main article before converting/truncating, and return an explicit truncation flag with section retrieval support.

### 2026-10-12 · Vega Perf CLI 0.24.0 · minor
- Task attempted: run UI fluidity KPI on the already connected native app.
- Steps taken (commands): `vega exec perf kpi-visualizer --app-name com.snagbrag.spike --device-serial-number emulator-5554 --kpi ui-fluidity --iterations 1 --disable-telemetry --output-dir <worktree>/spike/.cache/kpi`.
- Expected: a preflight listing prerequisites, followed by a KPI report if ready.
- Actual (exact error text): `Error: Appium server is not found in the platform. Please follow instruction in https://developer.amazon.com/docs/vega/latest/appium-install.html to install Appium server.` This appeared after installing KSPTService twice and waiting for trace daemons.
- Workaround: native workload HUD and repeated measurements; try the standalone recording tool. No UI-fluidity certification score is claimed.
- Actionable suggestion for Amazon: check Appium before modifying the device or waiting for trace daemons; state all prerequisites in `--help`.

### 2026-10-12 · React Native for Vega 2 / SDK 0.24.12112 · major
- Task attempted: drive particles and time frames with the requestAnimationFrame callback's timestamp.
- Steps taken (commands): Release build of the native test app; `requestAnimationFrame(timestamp => send({timestamp}))` through the local WebSocket telemetry.
- Expected: a numeric DOMHighResTimeStamp as on other React Native platforms.
- Actual: callback ran but its timestamp was `undefined` (omitted by JSON serialization). Using it in frame math left particles absent and FPS at zero, while image decoding and input continued.
- Workaround: take `performance.now()` at handler entry. An explicit timestamp-type probe is included in the corrected source.
- Actionable suggestion for Amazon: pass a monotonic timestamp consistently, document the exception until fixed, and add a release-runtime timer conformance test.

### 2026-10-12 · Amazon react-native-svg 2.0.9000000001 / VVD OS 1.2 · major
- Task attempted: render runtime-loaded Lilita One display text with a 12 px stroke under its fill.
- Steps taken: loaded converted TTFs with expo-font; drew two SVG Text elements with `fontFamily="Lilita One"`, one with `strokeWidth={12}`, one with the yellow fill.
- Expected: the approved Lilita letterforms with a visible ink outline.
- Actual: native RN Text used Lilita, but SVG Text appeared as a plain sans-serif title without the visible stroke. [First screenshot](shots/Screenshot_1791852595.png).
- Workaround: derive SVG Path outlines from the actual font's glyphs with fontTools; render stroke and fill on native Path elements. [Working screenshot](shots/full20.png). Runtime UI text still uses the bundled TTF.
- Actionable suggestion for Amazon: provide a tested stroked custom-font SVG Text example and document cross-renderer font registration/invalidation limitations.

### 2026-10-12 · W3C AudioPlayer 2.3.2 / VVD OS 1.2 · minor
- Task attempted: play local audio through an asset URI returned by `Image.resolveAssetSource(require(...wav))`.
- Steps taken: initialized four players and assigned `file:///pkg/bundle/assets/src/assets/audio/music.wav` (and three effect URIs); set loop/play; then explicitly tried load().
- Expected: asset resolution consistent with RN Image, with player state advancing.
- Actual: error events occurred; every player's `readyState` remained 0 and `currentTime` stayed 0 even though `paused` became false. Initial telemetry stringified the error object as `[object Object]`, so no exact native error code is claimed.
- Workaround: package MP3 files under root `assets/raw/` and use `/pkg/assets/raw/music.mp3` as recommended by [Amazon's local URI guidance](https://community.amazondeveloper.com/t/proper-uri-handling-for-local-assets-in-kepler-toastkepler-and-w3c-media-video/27642). Four concurrent players and looping pass. Format and URI were changed together, so the failure's individual cause is not isolated.
- Actionable suggestion for Amazon: include a minimal bundled audio example and make play() failures explicit; `paused=false` alone must not look like playback success.

### 2026-10-12 · Amazon expo-gl 2.0.9000000001+13.4.0 / VVD OS 1.2 · major
- Task attempted: replace the SVG background/particles with a native GLView while retaining native PNG sprites, text, photos and controls on the scaled 1280×720 stage.
- Steps taken: build the committed GLStage.tsx; run `node spike/vega-app/control.cjs case gl20`. GLView has explicit 1280×720 dimensions inside a stage scaled 1.5× at 1080p; a fragment shader draws rays/grid/glow and one points batch draws 300 particles.
- Expected: the GL surface composes behind the native interface at the declared bounds.
- Actual (exact native log): `[KeplerScript-Native] [ExpoGL] runAsync glGetError: 1282`. The GL content appeared in a small bottom-left rectangle while the rest of the screen became black and native overlays disappeared. [Screenshot](shots/gl-composition-failure.png). Shader drawing itself occurred; usable composition did not.
- Workaround: return to `case full20`, which immediately restores the native SVG scene. No blanket claim is made that every unscaled/standalone GL use fails.
- Actionable suggestion for Amazon: publish a tested scaled GLView + RN overlay example, report actual drawable dimensions, and clarify surface/transform/composition restrictions in the SDK 0.24 docs.

### 2026-10-12 · Vega Perf CLI 0.24.0 · minor
- Task attempted: capture a standalone native performance trace from an automated command runner.
- Steps taken: `vega exec perf record --app-name com.snagbrag.spike --device-serial-number emulator-5554 --recording-timeout 8 --disable-telemetry --output-dir <worktree>/spike/.cache/perf-record` with piped stdin/stdout.
- Expected: either a noninteractive recording or a clear terminal prerequisite.
- Actual (exact error text): after `Press s to start recording, q to quit:`, `An Error Occurred: (19, 'Operation not supported by device')`.
- Workaround: allocate a real PTY, wait for the prompt, send s, then q after timeout to post-process. Native trace and MCP SQL analysis succeeded.
- Actionable suggestion for Amazon: add a noninteractive start/stop mode; detect lack of TTY up front and describe it plainly instead of reporting an apparent device error.

### 2026-10-12 · Vega project doctor / SDK 0.24.12112 · minor
- Task attempted: validate the final native project, including the expo-font companion dependencies recommended in Amazon docs.
- Steps taken: `vega project doctor` after successful Release builds and runtime tests.
- Expected: distinguish valid companion dependencies from unknown/typo packages.
- Actual (exact warning): `Scoped deps in profile: @amazon-devices/expo-asset, @amazon-devices/keplerscript-turbomodule-api not a managed OS-version package (typo, or a package the SDK does not track)`; suggested `Remove unknown scoped packages or check OS version`. All critical checks passed.
- Workaround: retained the documented companion packages. The separate warning recommending runtime 2.1.0 instead of our tested 2.0 pin is legitimate version guidance, not a tool defect.
- Actionable suggestion for Amazon: label known required companion packages separately from suspected typos, and avoid suggesting removal of dependencies from official installation examples.

## What worked
- Reused the installed SDK; no SDK download or developer login was required to inspect CLI commands.
- Builder Tools 1.0.17 installed locally in 8 seconds; MCP initialize, tools/list, project context and curated documentation reads worked.
- Muted Mac output before starting the simulator; OS reports `true` for output muted.
- Native SVG Paths, gradients, alpha PNGs and a pure JS QR encoded and rendered on the first build.
- TTFs converted from the approved WOFF2 fonts loaded through Amazon's expo-font port.
- Local VDA reverse forwarding, text echo, binary ArrayBuffer echo and 12 unique JPEG decodes/second worked without a developer login.
- All requested remote events, including Menu, reached native TVEventHandler. BackHandler intercepted Back.
- Four AudioPlayer instances played local MP3s concurrently. Music loop wrap was confirmed using timestamps with Mac output muted.
- The emulator console recorded a real 1920×1080 WebM at a declared 60 fps; ffprobe verified resolution and encoding cadence.
- The standalone Perf CLI captured a trace; Builder Tools MCP successfully queried native Toolkit render timings from it.
