# Lead-review source notes — 2026-10-14

These are provenance/command-contract notes, **Our evidence**, not runnable
reproductions. The independent probes are embedded in FRICTION.md.
No fresh-template runtime, native audio, performance or account session was run.

## Native Back control

The 2026-10-12 native spike's metadata includes key:back followed by
back-intercepted; BackHandler returns true. The current native game subscribes
to both the TV event hook and BackHandler, with a 100 ms Back deduplication guard.
Sources: [runtime](../../spike/evidence/runtime.jsonl),
[handler](../../../tv/src/stage/remote.tsx),
[spike control source](../../../spike/vega-app/src/App.tsx).
These prove our native control path, not every default-exit/hold behavior.

## Inherited WebView observations

The private provenance capture referenced by
[the spike brief](../../spike/BRIEF-spike.md) was read without accessing or
modifying that other application's checkout. Its observation date is
2026-09-24, with CLI 1.4.2 / SDK 0.24.12112, VVD OS 1.2 / TV Ship 102282480.
The original WebView package version was not recorded in that summary.

- It reports repeated DOM keydowns during a hold with repeat=false; first repeat
  approximately 530–550 ms, subsequent repeats approximately 200–250 ms, then keyup.
- With allowSystemKeyEvents, its page consumed Back even with no page action.
  Its exit path required a bridge message and shell BackHandler.exitApp.
- It measured run-app/launch-app returns after approximately 122–129 s, although
  app/page readiness was approximately 1.2 s. This is earlier **WebView** evidence,
  not a measured native hello-world result.

Source-content SHA-256: 138ab97642fa0f06c10f5ff8d03d75e7cb56d2b91510f490aa014ef7a717685b.
The private capture is background evidence, not a public transcript or a
dependency of any Minimal repro. The snippet reductions remain unverified.
The repo's [spike guide](../../../spike/vega-app/README.md) also warns about launch
blocking after the screen appears; native repeat-field telemetry was not retained.

## CLI/schema checks performed in this review

Read-only CLI calls from a non-package directory returned:

- `vega project list-templates`: helloWorld targets RN 0.83;
  helloWorld-rn72 targets RN 0.72; vegaWebview is available.
- `vega project generate --help`: --template, --name, --packageId, --outputDir.
- `vega project update-manifest --help`: --os-min and --os-version.
- `vega run-app --help`: packageFile plus interactive appId.
- `vega devmode --help` and `enable-device --help`: login, enable-device,
  --code and optional --vendor. No login or enable command was executed.

**New friction F-A43:** inside the repository package directory, even
`vega project generate --help` invoked Dependencies setup before help and attempted
an SDK workspace symlink. Restricted-filesystem output:
`PermissionError: [Errno 1] Operation not permitted`.
The target was `~/vega/sdk/vega-sdk/main/0.24.12112/workspace/App/friction`.
The installed config.py's find_workspace/setup_packagelink_in_workspace confirms
the package-directory condition. Repeating help in /private/tmp returned help
but still warned `Warning: Failed to update last used time`.
No permission override, SDK mutation, account or simulator operation was needed.

Curated Builder Tools references were read after setting project context:
react_native_for_vega_app_build_and_install.md, vega_cli_commands.md,
vega_cli_commands_exec_perf.md, vega_app_manifest.md,
vega_developer_mode_enablement_workflow.md and react_native_for_vega_webview.md.
The WebView guide documents the 3.3 package family, packaged HTML source URI
and renderer/input-method services. Direct URL reads for two CLI/media page
addresses returned Invalid URL; they are not evidence of a runtime SDK failure.

## API/static scope

Installed Reanimated declarations export useSharedValue/useAnimatedProps/
useFrameCallback; W3C media 2.3.2 exposes AudioPlayer.initialize/deinitialize
and MediaSource.addSourceBuffer/endOfStream. The app's successful source lifecycle
keeps bytes alive and uses the blob-URL setter before cleanup.

The repro fragments use these patterns but omit the full app's animation graphs,
auth/range HTTP layer, fonts, relay and media queue. Their compactness is not a
claim of independently isolated causality. The WebView repeat/back probe is a
diagnostic only; no WebView was added to the shipped native game.

## Validation performed

All seven TSX fragments parse; the six using installed packages pass strict
TypeScript checks against our installed RN/Vega declarations. The WebView port
is absent, so that fragment receives syntax checks only; its documented ^3.3.0
range is resolved/pinned by the reviewer, not claimed installed here. Eleven
shell blocks pass bash -n; embedded Python and keyboard-page JavaScript parse;
service-table TOML parses. Installed FFmpeg/ffprobe 7.1.1 generate and decode all five silence/
red-pixel fixtures in a temporary directory, removed afterward. These checks do
not verify any native symptom, manifest merge or fresh-template build.

Root [tests](root-tests.txt) pass 448 tests (including TV lint);
[typecheck](root-typecheck.txt) passes. Initial mock-relay listens were denied by
the sandbox (listen EPERM); the required rerun with local listener access passes.
No native/account/performance/live-AWS execution was added.
