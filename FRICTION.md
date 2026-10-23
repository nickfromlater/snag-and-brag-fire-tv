# Snag & Brag — Amazon product feedback and friction

## Summary

61 Amazon-facing findings (23 Major, 38 Minor) across 14 Amazon tools, plus 5 on non-Amazon
tools and 11 feature requests. Each entry gives the date, product and version, what we
did, expected vs actual, our workaround and a suggestion Amazon could ship. Entries that
name the **retail Fire TV Stick 4K Select** (Vega OS 2.0) were measured on it, from
2026-10-17 onward. The rest come from the Vega Virtual Device, AWS or the docs, as each
entry states.

**Top 5 by impact**

1. [F-A48](#f-a48) · Every on-screen `react-native-svg` `<Svg>` is re-rasterized every frame, at a
   cost that tracks its area: 42 ms per frame in our busiest scene, 14 ms of it a 236 px dial.
2. [F-A44](#f-a44) · The W3C media `src` setter loads synchronously on the JS thread: 32.6 s
   blocked over one game, and one call hung until the watchdog killed the app.
3. [F-A49](#f-a49) · Five ordinary RN styles (dashed borders, rotated rounded clips, a video
   backdrop, large SVG, idle loops) each cost 5–20 fps while the compositor reports
   `droppedFrames:0`.
4. [F-A52](#f-a52) · The screensaver takes over a phone-controlled game after about five minutes,
   and there is no engagement API for network-driven play.
5. [F-A47](#f-a47) · Audio streams run out (`code 3`) across killed app instances, whether OGG, AAC/MSE or PCM;
   every player fails until a reboot.

Also high impact, on the virtual device: stale headless captures ([F-A01](#f-a01)), silent
cold-start and composed-animation stalls (F-A02–04), and misleading media sink errors
(F-A05, F-A16). Account gates that surfaced as generic 401/403 errors are in
[F-A51](#f-a51) and [F-A58](#f-a58).

| Product or tool | Findings | Major | Entries |
|---|---:|---:|---|
| Vega SDK, CLI, VDA and Virtual Device | 17 | 1 | F-A01, F-A24–30, F-A36, F-A38, F-A41, F-A43, F-A50, F-A54–57 |
| React Native for Vega (UI, input, sockets) | 7 | 4 | F-A02, F-A09, F-A14, F-A39–40, F-A49, F-A53 |
| Amazon W3C media port | 7 | 5 | F-A05–06, F-A16–18, F-A44, F-A47 |
| Amazon react-native-svg port | 4 | 4 | F-A04, F-A10, F-A12, F-A48 |
| Vega Performance CLI | 4 | 0 | F-A19–20, F-A45–46 |
| Builder Tools MCP and Agent Skills | 4 | 1 | F-A15, F-A21–23 |
| Amazon Bedrock (Mantle) | 4 | 1 | F-A33–34, F-A58–59 |
| Vega Media Controls | 3 | 2 | F-A07–08, F-A37 |
| Fire TV device and Developer Mode | 3 | 2 | F-A42, F-A51–52 |
| Amazon Reanimated port / RN Animated | 2 | 2 | F-A03, F-A11 |
| Amazon expo-font port | 2 | 0 | F-A31–32 |
| EC2 / IAM / Amazon Linux 2023 | 2 | 0 | F-A60–61 |
| Amazon expo-gl port | 1 | 1 | F-A13 |
| Amazon Polly | 1 | 0 | F-A35 |
| Non-Amazon tools (appendix) | 5 | 0 | N-A01–05 |

Current state (last recorded 2026-10-22): full hosted games pass on the retail stick with live Polly.
The relay runs on EC2 behind CloudFront. Bedrock vision is blocked by an account
agreement (F-A58), so naming uses fallbacks. Stick frame rate is still being worked on
through F-A48's raster workaround.

## Scope and evidence

Reviewed **2026-10-14**, covering our app observations from **2026-10-12–14**
at repository baseline `d9a6701`, plus explicitly dated **2026-09-24** inherited
WebView notes in F-A39–41. This document answers the five product-feedback questions and
the optional friction/feature-request fields in the
[official rules](https://amazonappdev2026.devpost.com/rules).

**Updated 2026-10-23:** F-A44–F-A61 and N-A05 fold in the dated raw entries from
2026-10-14 to 2026-10-22, including the retail-stick and AWS deployment sessions. Raw entries that
repeat an existing finding are merged into it as dated re-observations (F-A02, F-A15,
F-A23, F-A39, F-A42, F-A44, F-A47). One raw entry (a browser `AppState` gap) was our
own app bug and is not listed.

The [original worker log](docs/friction-raw.md) is preserved byte-for-byte.
The [spike log](docs/spike/friction-entries.md) remains unchanged.
[Source audit and alias map](docs/friction-audit.md) explain merges, corrections
and evidence limits. Repeated symptoms are grouped without asserting a shared
internal cause. Historical failures remain failures even when later candidates pass.

Native results mean **aarch64 Release/Hermes on VVD OS 1.2, TV Ship 102282480**,
using SDK **0.24.12112**, CLI **1.4.2**, RN **0.72.0**, React **18.2.0** and Amazon
runtime **2.0.9000000000**, unless specified. Retail armv7 packages build. Physical-stick results
(from 2026-10-17) are labeled in each entry. Runtime AI/voice receipts before 2026-10-17 use local
mocks; later entries say when a live service was used. Media verification uses advancing clocks/events with the Mac muted;
it does not measure acoustic quality or output latency. Capture encoding at
60 fps does not establish 60 unique presented frames/s. Source:
[platform spike](docs/spike/PLATFORM.md),
[package pins](tv/package.json),
[final visual/media report](docs/review/tv/visual/REPORT.md).

All committed game captures use bot art or synthetic media. No household photo,
thumbnail, credential or local username is included here. Paths use `~/` or
checkout-relative names.

## Product feedback

### Vega SDK, CLI, VDA and Vega Virtual Device

**Versions:** SDK 0.24.12112; CLI 1.4.2; VDA 2.6+3d072013 as recorded by the scene
worker; VVD OS 1.2 / TV Ship 102282480; emulator 34.1.15 in the visual comparison.

- **Use:** scaffold, package a native TV game for aarch64/armv7, install/run it, forward local relay/control ports and capture review footage.
- **Worked well:** the already-installed SDK built both architectures without a developer login; VDA reverse forwarding enabled binary JPEG traffic and remote input. The final windowed VVD shows every scene.
- **Needs work:** launcher lifetime, device-selector consistency, workspace asset paths and fresh capture/connectivity diagnostics (F-A01, F-A09, F-A24–30, F-A38). The final capture workaround needs macOS 15+ and existing screen-capture permission.
- **Onboarding:** this was reuse of an existing SDK, **not a measured clean SDK install**. The helloWorld scaffold rejected a hyphenated project name; an alphanumeric name then built and launched. Component-aware `vega exec vda` was required.
- **Build again:** **Yes, conditionally**: the account-free native development loop is useful, but we would budget an early retail-device and performance gate.

Evidence: [build receipts](docs/spike/evidence/build-receipt.json),
[spike run guide](spike/vega-app/README.md),
[windowed release evidence](docs/review/tv/visual/REPORT.md).

### Vega Performance CLI

**Versions:** CLI reports 0.24.0; installed package is KeplerPerfCLI 2.0.345.0.
These are different version labels for the same tested toolchain.

- **Use:** record native traces and inspect render costs/memory under the game workload.
- **Worked well:** recording in a PTY produced traces; the installed trace processor and, in the spike, MCP SQL queries produced useful native render summaries.
- **Needs work:** check Appium before installing services; provide noninteractive recording/monitoring; distinguish terminal errors from device capability failures (F-A19–22).
- **Onboarding:** the advertised KPI route stopped at a missing-Appium prerequisite after device setup. The ordinary trace route worked after allocating a PTY and entering `s`, then `q`.
- **Build again:** **Yes** for diagnostics; we would not call these results a UI-fluidity certification or a retail 60 fps pass.

Evidence: [trace receipts](docs/spike/evidence/trace-file-receipts.json),
[SQL summary](docs/spike/evidence/final-trace-summary.jsonl),
[memory diagnostic](docs/review/tv/polish1/native-memory-diagnostic.txt).

### React Native for Vega

**Versions:** RN 0.72.0; React 18.2.0; `@amazon-devices/react-native-kepler`
2.0.9000000000; Hermes; SDK 0.24.12112/system JS bundles. Doctor recommends a
newer runtime; we did not test that upgrade.

- **Use:** native show/HUD, remote controls, shared TypeScript game state, binary WebSockets and memory-only phone photos.
- **Worked well:** text/binary sockets, distinct JPEG decoding, TVEventHandler and BackHandler worked in the spike. The integrated windowed release completes the show.
- **Needs work:** actionable diagnostics for cold-start and composed-scene waits; normalize workspace asset URLs; supply the rAF timestamp (F-A02–04, F-A09, F-A14).
- **Retail stick (2026-10-17–22):** ordinary styles (dashed borders, rotated rounded clips, a video backdrop, idle loops) cost 5–20 fps with no profiler signal ([F-A49](#f-a49)). Non-ASCII WebSocket text arrives mangled ([F-A53](#f-a53)). Both Back hooks fire 171 ms apart (F-A39).
- **Onboarding:** a small native stage was straightforward; the complete scaled show required asset staging, staged mounts and reduced animation-graph complexity.
- **Build again:** **Yes, conditionally** for shared JS/native TV development, with release-mode mixed-scene stress tests before committing to a schedule.

Evidence: [native spike telemetry](docs/spike/evidence/runtime.jsonl),
[full phone/native pass](docs/review/tv/g2-native-e2e.json),
[latest native release gate](docs/review/tv/visual/release-gate/native-voice-game.json).

### Amazon react-native-svg port

**Version:** Amazon 2.0.9000000001, upstream 13.14.0 as recorded in the spike.

- **Use:** reference glyph paths, QR code, stage geometry, gradients, particles and judge masks.
- **Worked well:** native Paths/gradients and alpha PNG art rendered; the QR screenshot decoded independently. Path-based display titles preserve the actual font outlines.
- **Needs work:** JSX-equivalent imperative prop conversion, custom-font stroked Text, and documented photo/mask composition limits (F-A04, F-A10, F-A12).
- **Retail stick (2026-10-22):** every visible `<Svg>` is re-rasterized each frame at a cost that tracks its area, so static art has to ship as PNG ([F-A48](#f-a48)).
- **Onboarding:** simple static SVG worked early; imperative animation and custom-font Text required alternative implementations.
- **Build again:** **Yes** for tested Path/static uses; we would avoid assuming parity for Text, imperative props or complex image masks without a native probe.

Evidence: [QR decode](docs/spike/evidence/qr-decoded.txt),
[before font workaround](docs/spike/shots/Screenshot_1791852595.png),
[after workaround](docs/spike/shots/full20.png),
[photo comparison](docs/review/tv-judge-compare.png).

### Amazon Reanimated port and RN core Animated

**Versions:** Amazon Reanimated 2.0.9000000001, upstream 3.5.4; core Animated in
RN 0.72.0.

- **Use:** sampled reference springs, sticker/camera transforms, pendulum eyes and stage effects.
- **Worked well:** simple springs and native-driver bitmap pupils work; sampled worklets and cached native graphs support the complete show.
- **Needs work:** release samples for nested/scaled SVG, many transforms, attachment order and audio coexistence; silent waits are expensive to isolate (F-A02–03, F-A11). Native flips use an orthographic scale projection; true perspective remains unverified in this composition.
- **Onboarding:** the single-clock spike was successful; porting the exact composed show took repeated isolation runs. The isolated eye driver passed even when the full painted-eye composition did not.
- **Build again:** **Yes**, with measured graph budgets and cold-start tests; these observations do not establish a general Animated/Reanimated failure.

Evidence: [eye handoff and controls](docs/review/tv/native-eyes-notes.md),
[photo isolation](docs/review/tv/photo-bisect-isolated/receipt.json),
[final presentation comparison](docs/review/tv/visual/REPORT.md).

### Amazon expo-font port

**Versions:** expo-font 2.0.1758683737; turbomodule companion 1.2.5; expo-asset
range ~2.0.0 in the app.

- **Use:** bundle the mockup's Lilita One/Rubik fonts, converted from WOFF2 to TTF, for native UI.
- **Worked well:** native RN Text uses the approved fonts; bundled loading works without a network font dependency.
- **Needs work:** an installation example used an unpublished companion range; Doctor mislabels the working companion packages (F-A31–32). SVG font registration is a separate F-A10 issue.
- **Onboarding:** the dependency example failed, then pinning the published companion 1.2.5 allowed installation and font loading.
- **Build again:** **Yes** for bundled RN fonts; dependable offline typography is essential to our sticker treatment.

Evidence: [spike font finding](docs/spike/friction-entries.md),
[Doctor output](docs/spike/evidence/project-doctor.txt),
[font/remote screenshot](docs/spike/shots/back-remote-audio.png).

### Amazon expo-gl port — evaluated, not shipped

**Version:** Amazon 2.0.9000000001, upstream 13.4.0.

- **Use:** test a shader/300-particle alternative behind the scaled 1280×720 native stage.
- **Worked well:** the shader did draw.
- **Needs work:** the tested scaled surface occupied a small corner, hid native overlays and logged GL error 1282; actual drawable bounds/composition restrictions were unclear (F-A13).
- **Onboarding:** adding GLView was possible, but the composed result was unusable.
- **Build again:** **No** for this tested game composition until a supported scaled GLView/RN-overlay example passes. Standalone/unscaled behavior remains unknown.

Evidence: [GL source](spike/vega-app/src/GLStage.tsx),
[failure screenshot](docs/spike/shots/gl-composition-failure.png).

### Amazon W3C media port

**Version:** `@amazon-devices/react-native-w3cmedia` 2.3.2.

- **Use:** concurrent music/effects and memory-only host speech with word/viseme marks.
- **Worked well:** local MP3 overlap/looping worked; a reusable bank verified 112 SFX IDs twice, and native fragmented AAC/MP4 completed 28/28 mock speech clips.
- **Needs work:** propagate sink-allocation reasons instead of misleading decoder codes; document local/remote/MSE format differences, reusable-player lifecycles and callback deadlines (F-A05–06, F-A16–18).
- **Onboarding:** playback-state verification worked after using packaged raw assets. Remote speech required AAC/MP4 MediaSource and warmed bounded players; remote WAV and MP3 probes failed on this VVD.
- **Build again:** **Yes, conditionally**, with explicit resource limits and per-source advancement/completion checks. We cannot assess acoustic quality from muted tests.

Evidence: [224 successful effect plays](docs/review/tv/native-audio-effects.json),
[voice repair](docs/workers/voice-native-fix-report.md),
[latest complete-clip gate](docs/review/tv/visual/release-gate/native-voice-game.json).

### Vega Media Controls

**Version:** `@amazon-devices/kepler-media-controls` 1.0.25; RN 0.72/system bundles;
VVD OS 1.2. Early entries only recorded “1.0”.

- **Use:** register one whole-game pause/play/Next provider independently of individual audio players.
- **Worked well:** a complete idle session restored startup; ten native direct-handler checks prove the same registered handler's game actions.
- **Needs work:** empty-session updates aborted; the documented endpoint locator failed before dispatch. The constructor example also leaves its server field unassigned (F-A37). A non-video game example and unsigned-VVD service test would help (F-A07–08).
- **Onboarding:** docs/sample setup needed explicit idle state and careful lifecycle handling. Direct handler injection passed; SDK endpoint discovery did not.
- **Build again:** **Yes, conditionally** for game transport. Spoken Alexa/focus selection is **pending device session**, so no voice-command success is claimed.

Evidence: [transport report](docs/review/tv/alexa-transport.md),
[crash stack](docs/review/tv/polish1/alexa-empty-session-crash.txt),
[handler pass](docs/review/tv/polish1/alexa-native-handler.json),
[SDK failure](docs/review/tv/polish1/alexa-native-sdk.json).

### Amazon Devices Builder Tools MCP and Agent Skills

**Versions:** locally installed MCP 1.0.17 in the spike; Amazon skills 1.1.0
copied into this project's `.agents/skills`. Later connected MCP sessions did
not expose their server version; we do not assume they were also 1.0.17.

- **Use:** discover build/manifest/media/performance guidance, read primary docs, identify the native app and analyze spike traces.
- **Worked well:** local installation took eight seconds without an account; initialize, schemas, project context, curated documents, app detection and spike SQL analysis worked.
- **Needs work:** retrieve API articles before truncating navigation; state context requirements; discover SDK paths; disclose analysis destination/locality (F-A15, F-A21–23). Broad spike searches also returned older SDK pages; version-specific retrieval helped.
- **Onboarding:** manual project MCP configuration/local skills worked. The 1.0.17 initializer's documented targets lacked Codex and an explicit project-local skills mode. New sessions needed context before documentation discovery.
- **Build again:** **Yes**: version-specific guidance saved implementation work, provided retrieved content and execution locality are verified.

Evidence: [setup report](docs/spike/builder-tools.md),
[schemas](docs/spike/evidence/builder-tools-schema.json),
[call hashes/lengths](docs/spike/evidence/builder-call-receipts.json),
[app detector](docs/spike/evidence/app-type.txt).

### Fire TV device and Developer Mode

**Update 2026-10-23:** the device session happened on 2026-10-17. Developer Mode is enabled on a retail Fire TV Stick 4K Select (`callie`, armv7l, Vega OS 2.0 TV Ship/515), and full hosted games run on it. Stick findings: registration error ([F-A51](#f-a51)), screensaver during phone play ([F-A52](#f-a52)), media ANR and audio streams (F-A44, F-A47), frame cost ([F-A48](#f-a48)–[F-A50](#f-a50)), WebSocket text ([F-A53](#f-a53)) and screenshots (F-A57). The text below is the 2026-10-14 pre-device review, kept for the record.

**Target:** Fire TV Stick 4K Select (2025); retail OS/firmware **not observed**.
The built app targets Vega OS 1.2; armv7 package metadata is available.

- **Use:** planned household play, physical remote/Alexa and memory/frame-rate validation.
- **Worked well:** account-free VVD tests and armv7 packaging provided preparation; these are not physical-device results.
- **Needs work:** no reproduced physical-stick finding yet. Firmware update, Developer Mode authentication, reconnect behavior and capture remain **pending device session**.
- **Onboarding:** documentation was researched; the owner has not completed an evidenced zero-to-hello-world device session. The documented path involves on-TV Developer Options and owner-controlled `vega devmode login`/enable-device.
- **Build again:** **Yes, provisionally**, for a shared living-room screen; a final device recommendation awaits installation, remote, performance and household tests.

Evidence: [documented device/account path](docs/spike/PLATFORM.md#accounts-sideloading-and-capture),
[armv7 build receipts](docs/review/tv/visual/builds.json),
[physical transport checklist](docs/review/tv/alexa-transport.md#exact-retail-stick-session).

### Amazon Bedrock

**Update 2026-10-23:** live since 2026-10-17 in us-east-1 with a zero-retention workspace, but every vision call has returned 403, the agreement shows `NOT_AVAILABLE`, and an AWS access case is open ([F-A58](#f-a58)). The game runs on its fallback suggestions. Request-option mismatch: F-A59. As of the last recorded check (2026-10-17), no live model quality or latency has been measured. The text below is the 2026-10-14 pre-deploy review, kept for the record.

**Client:** Anthropic's `@anthropic-ai/bedrock-sdk` 0.34.4, Mantle Messages API.
`BEDROCK_MODEL_ID` selects the eventual model; **no live model was tested**.

- **Use:** planned photo/object naming, three stage names, two brags, fit score and host quip within the four-second game budget.
- **Worked well:** the real client can use an injected fetch for offline request/response tests; structured JSON and fallback validation fit the relay contract.
- **Needs work:** put Mantle IAM/workspace/retention setup together; typed project administration would remove generic HTTP glue (F-A33–34). The SDK README is Anthropic-owned, not an Amazon-authored SDK defect.
- **Onboarding:** installation and mocked Messages/project calls passed; credentials, enabled model, effective retention and live latency are **pending deploy**.
- **Build again:** **Yes, provisionally**, for one-call creative reads with deterministic fallback; model quality, latency and cost have not been measured.

Evidence: [SDK-stub tests](relay/test/services.test.ts),
[workspace setup](relay/scripts/mantle-project.ts),
[mock-only evaluation](docs/review/eval/bedrock-mock.json).
AWS documents separate Mantle inference permissions and project/model scoping:
[inference guide](https://docs.aws.amazon.com/bedrock/latest/userguide/inference.html),
[authorization reference](https://docs.aws.amazon.com/service-authorization/latest/reference/list_bedrock-mantle.html).

### Amazon Polly

**Update 2026-10-23:** live since 2026-10-17 (Arthur, neural en-GB) in the hosted relay; a full stick game on 2026-10-21 spoke 27/27 host lines. No new Polly defect was observed. The text below is the 2026-10-14 pre-deploy review, kept for the record.

**Version:** AWS SDK JS `@aws-sdk/client-polly` 3.1150.0; SynthesizeSpeech;
configured Arthur→Brian neural/en-GB. Voice availability/delivery is not live-tested.

- **Use:** planned Sir Socksworth narration with matching word/viseme marks; relay currently prepares PCM/WAV for web and memory-only AAC/MP4 for native.
- **Worked well:** two clear request shapes use identical escaped SSML; local stubs verify PCM, marks and voice fallback. Native mock clips drive advancing marked playback and complete the show.
- **Needs work:** neural `<emphasis>` is unavailable; our prosody substitute needs live delivery review (F-A35). Native transport/timing findings belong to Vega media, not Polly service reliability.
- **Onboarding:** SDK/mock smoke and local playback passed; live synthesis, regional voices, pronunciation, acoustic quality and service latency are **pending deploy**.
- **Build again:** **Yes, provisionally**: speech marks fit the puppet host well, subject to live voice/timing verification.

Evidence: [relay implementation](relay/src/polly.ts),
[offline smoke](docs/review/voice-native-fix/smoke.txt),
[mark/clock receipt](docs/review/voice-native-fix/native-lobby-voice.json).
The engine-specific limitation is documented in
[Polly's SSML table](https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html).

### AWS hosting: EC2

**Update 2026-10-23:** deployed 2026-10-17: one t4g.small (Amazon Linux 2023 arm64, AWS CLI 2.38.1) runs the relay. Setup findings: F-A60 (instance-profile propagation), F-A61 (`curl-minimal`) and N-A05 (our pnpm recipe). [Deployment record](docs/release/live.md). The text below is the 2026-10-14 pre-deploy review, kept for the record.

**Prepared target:** Amazon Linux 2023/arm64, t4g.small; Node 24.20.0,
pnpm 12.10.1, FFmpeg 7.0.2-static. AWS CLI version and actual AMI are **not recorded**.

- **Use:** planned long-lived Node/WebSocket relay and transient image/speech processing.
- **Worked well:** local relay tests and setup/checksum tests pass; the exact static encoder ran on Linux/VVD. No EC2 uptime or provisioning success is claimed.
- **Needs work:** **pending deploy**: instance/profile propagation, cold start, memory and network limits have no service receipts.
- **Onboarding:** user-data/systemd/nginx templates and manual deployment steps exist; zero-to-live-hello-world has not been run.
- **Build again:** **Yes, provisionally**, because a persistent process fits room sockets; operating cost/reliability awaits deployment.

Evidence: [setup](relay/deploy/setup.sh),
[setup tests](relay/test/deploy.test.ts),
[encoder receipt](docs/review/voice-native-fix/static-encoder.json),
[deployment guide](relay/deploy/README.md).

### AWS hosting: CloudFront

**Update 2026-10-23:** deployed 2026-10-17: phone HTTPS and game WSS go through CloudFront, with logging disabled and private routes uncached. No CloudFront defect was observed. [Deployment record](docs/release/live.md). The text below is the 2026-10-14 pre-deploy review, kept for the record.

**Version:** managed service; AWS CLI/distribution version **not recorded**.
Configuration templates are reviewed at the baseline above.

- **Use:** planned phone HTTPS, WSS relay access and hashed static asset delivery.
- **Worked well:** configuration separates immutable static assets from no-store photo/speech/WebSocket paths; this is a design/source result, not a deployed cache test.
- **Needs work:** **pending deploy**: TLS, forwarded handshake/read-key parameters, idle socket behavior and no-store enforcement need live checks.
- **Onboarding:** distribution/cache-policy templates exist; no distribution was created and no CloudFront hello-world request was observed.
- **Build again:** **Yes, provisionally**, for HTTPS camera access and static delivery after the WSS/privacy configuration passes.

Evidence: [configuration renderer](relay/deploy/render-config.py),
[origin configuration](relay/deploy/nginx.conf),
[deployment steps](relay/deploy/README.md#3-cloudfront-https-and-websockets).

### AWS IAM

**Update 2026-10-23:** the runtime role and instance profile were created on 2026-10-17. A just-created profile was rejected by EC2 until it propagated (F-A60). The text below is the 2026-10-14 pre-deploy review, kept for the record.

**Version:** policy document language `2012-10-17` (not an SDK release);
Anthropic Bedrock SDK 0.34.4 and Polly client 3.1150.0.

- **Use:** planned EC2 instance-role authorization for one vision model/workspace and regional speech synthesis.
- **Worked well:** templates isolate runtime from project administration and scope Mantle by project/model. These are source-level checks, not live authorization proof.
- **Needs work:** align endpoint-specific permissions with client examples (F-A33). No live AccessDenied or permission-propagation failure was observed.
- **Onboarding:** policy/trust templates and workspace-stub tests exist; live role/profile creation and authorization are **pending deploy**.
- **Build again:** **Yes, provisionally**, for role-based credentials without shipping keys, after effective permissions are verified.

Evidence: [runtime policy](relay/deploy/iam-policy.json),
[EC2 trust](relay/deploy/ec2-trust.json),
[workspace test](relay/test/services.test.ts).

### AWS Budgets

**Update 2026-10-23:** the $50/month budget (80% actual and 100% forecast notifications to the owner) was created on 2026-10-17, before any infrastructure. No alert has fired, so delivery is untested. The text below is the 2026-10-14 pre-deploy review, kept for the record.

**Version:** managed service; AWS CLI version **not recorded**.

- **Use:** planned $50/month account budget, notifying at 80% actual spend and 100% forecast.
- **Worked well:** the renderer prepares budget/subscriber documents; no delivered alert is evidenced.
- **Needs work:** **pending deploy**: budget creation, email delivery and reporting delay are untested; there is no observed AWS Budgets defect.
- **Onboarding:** manual CLI steps exist; no live budget/hello-world notification has been run.
- **Build again:** **Yes, provisionally**, for cost visibility. The prepared budget sends notifications; it is not an automatic resource cutoff.

Evidence: [budget templates](relay/deploy/render-config.py),
[budget/deployment guide](relay/deploy/README.md).

## Friction log

**Severity:** Major = blocked acceptance, caused a crash or forced substantive
implementation changes; Minor = setup/diagnostic friction or a supported limitation
with a practical workaround. Former “Blocking G2” labels describe historical
acceptance failures; no current universal platform blocker is claimed.

Entries are ordered by severity and usefulness. Each suggests one specific change Amazon could ship.
**Historical** means the tested failing candidate/condition, not a claim that
the corrected current source still fails. Exact errors are quoted only when
preserved; silent failures and missing raw transcripts are stated explicitly.
Aliases retain original IDs; unnamed reports are mapped by heading/line in the audit.

### Fresh-template setup for the ten minimal repros

Added 2026-10-14 after lead review. The ten blocks are F-A01/02/03/05/16/19
and F-A39–42. Run their commands in an isolated **fresh app**, not this repository.
**None of these reductions has been run on a device here.** Each is labeled
**expected to reproduce; derived from our app**. Native passing controls,
inherited WebView observations and pending retail onboarding are distinguished.

Use SDK 0.24.12112 / CLI 1.4.2 and OS 1.2. CLI inspection shows that the current
`helloWorld` targets RN 0.83; select **helloWorld-rn72** to match our RN 0.72/
runtime 2.0 evidence. Start one reviewer-owned VVD in a persistent terminal with
`vega virtual-device start --gui=true --display-res 1920,1080`. Keep Mac output
muted: `osascript -e 'set volume output muted true'`.

```sh
source ~/vega/env
SNAG_REPRO_ROOT=$(mktemp -d /tmp/vega-friction.XXXXXX)
vega project generate --template helloWorld-rn72 --name VegaRepro --packageId com.example.frictionrepro --outputDir "$SNAG_REPRO_ROOT"
cd "$(dirname "$(find "$SNAG_REPRO_ROOT" -maxdepth 3 -name app.json -print -quit)")"
npm install --legacy-peer-deps
```

Pin the tested ports and set the entry/Babel configuration:

```sh
npm install --save-exact --legacy-peer-deps @amazon-devices/react-native-kepler@2.0.9000000000 @amazon-devices/react-native-reanimated@2.0.9000000001 @amazon-devices/react-native-svg@2.0.9000000001 @amazon-devices/react-native-w3cmedia@2.3.2
mkdir -p src/assets assets/raw
printf '%s\n' "import {AppRegistry} from 'react-native'; import {App} from './src/App'; import {name} from './app.json'; AppRegistry.registerComponent(name, () => App);" > index.js
printf '%s\n' "module.exports={presets:['module:metro-react-native-babel-preset'],plugins:['@amazon-devices/react-native-reanimated/plugin']};" > babel.config.js
vega project update-manifest --os-min 1.2 --os-version 1.2
```

Paste one block's TSX into **src/App.tsx**. For the stock control use
`import React from 'react'; import {Text} from 'react-native'; export const App=()=> <Text>HELLO</Text>;`.
Keep package/component IDs `com.example.frictionrepro`/`com.example.frictionrepro.main`.
Set the interactive component's runtime-module to
`/com.amazon.kepler.keplerscript.runtime.loader_2@IKeplerScript_2_0` if the
template emits a different runtime. The build generates dependency modules;
append each service table below only if that ID is not already declared:

```toml
[[wants.service]]
id = "com.amazon.gipc.uuid.*"
[[offers.service]]
id = "com.amazon.gipc.uuid.*"
[[wants.service]]
id = "com.amazon.media.server"
[[wants.service]]
id = "com.amazon.media.playersession.service"
[[wants.service]]
id = "com.amazon.mediametrics.service"
[[wants.service]]
id = "com.amazon.audio.stream"
[[wants.service]]
id = "com.amazon.audio.control"
[[wants.service]]
id = "com.amazon.audio.system"
[[wants.service]]
id = "com.amazon.mediabuffer.service"
[[wants.service]]
id = "com.amazon.mediatransform.service"
```

Generate only synthetic silence/red pixels with an existing FFmpeg installation
(7.0.2 was used for our encoder evidence); no photos, AWS calls or asset downloads:

```sh
ffmpeg -hide_banner -loglevel error -f lavfi -i anullsrc=r=16000:cl=mono -t 1 -c:a pcm_s16le assets/raw/repro.wav
ffmpeg -hide_banner -loglevel error -i assets/raw/repro.wav -c:a libmp3lame assets/raw/repro.mp3
ffmpeg -hide_banner -loglevel error -i assets/raw/repro.wav -c:a aac -movflags empty_moov+default_base_moof+frag_keyframe assets/raw/repro.mp4
ffmpeg -hide_banner -loglevel error -i assets/raw/repro.wav -ar 48000 -ac 2 -c:a libvorbis assets/raw/repro.ogg
ffmpeg -hide_banner -loglevel error -f lavfi -i color=c=red:s=320x320 -frames:v 1 src/assets/repro.png
```

These four commands are the **Release run** referenced by the RN blocks:

```sh
npm run build:release -- --target aarch64 --use-system-js-bundles true --max-workers 2
vega device install-app --dir . -b Release
vega device launch-app --appName com.example.frictionrepro.main
vega exec vda shell 'loggingctl log -f -v com.example.frictionrepro'
```

The last command streams logs; stop with Ctrl-C before the next probe.
This needs no Snag code, relay, telemetry server or capture helper.
Source-level checks do not certify a fresh-template runtime failure.
**Our evidence** links preserve the full-app observations and their limits.

### Our app evidence conventions

Commands below run from the checkout root unless noted. Native experiments require
the existing SDK, a worker-owned `~/.snag-vvd.lock`, a muted Mac and synthetic/bot
media. Keep launcher, mock relay and control server in separate persistent terminals.
Do not take another worker's lock. The standard recorded setup was:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
source ~/vega/env
# Terminal 1, while holding the existing worker lock:
vega virtual-device start --gui=true --display-res 1920,1080
# Terminal 2:
HOST=127.0.0.1 PORT=8789 PUBLIC_URL=http://localhost:8789 AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
# Terminal 3:
TV_CONTROL_OUTPUT_DIR=/tmp/snag-friction-control node tv/tooling/control.mjs
# Device terminal; generate/build before root tests, never concurrently with them:
pnpm --filter @snag/tv build:release --target aarch64 --use-system-js-bundles true --max-workers 2
vega device install-app --packagePath tv/build/aarch64-release/tv_aarch64.vpkg
vega exec vda reverse tcp:8787 tcp:8789
vega exec vda reverse tcp:8790 tcp:8790
vega device launch-app --appName com.snagbrag.tv.main
```

Spike/MCP commands also require the separate local installs in the
[spike run guide](spike/vega-app/README.md) and
[Builder Tools setup](docs/spike/builder-tools.md); root pnpm does not install them.
Tests below use offline mocks unless marked documentation inspection. Code snippets
are native-app actions, not Node/browser substitutes. Where the pre-fix source or
exact command is not retained, the historical account identifies that gap.
Minimal repro blocks are independent probes; receipt inspection is only Our
evidence, never a reproduction of the issue. Do not overwrite historical receipts.

<a id="f-a01"></a>
### F-A01 · Stale/partial headless capture surfaces · Major

**Date / tool:** 2026-10-13–14; SDK 0.24.12112 / CLI 1.4.2 / VVD OS 1.2,
emulator 34.1.15. **Aliases:** F-TV-A-01; F-TV-08 (visual-review entry);
F-TV-INTEGRATE-02 (capture symptom); F-POLISH1-09; F-VISUAL-01; unnamed
A/B/C and voice capture reports in the audit.

**Task:** prove that the displayed native scene follows the game's current state.


**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — this smaller
counter/composition probe is unverified; it may not select the stale surface.

1. Apply the fresh-template setup and paste this component into src/App.tsx.
2. Run the commands/controls described after the component.

```tsx
import React,{useEffect,useState} from 'react';
import {Image,Text,View} from 'react-native';
import Svg,{Rect} from '@amazon-devices/react-native-svg';
export const App=()=>{
  const [tick,setTick]=useState(0);
  useEffect(()=>{
    let n=0;const id=setInterval(()=>{
      console.log('COMMIT_REQUEST',++n);setTick(n);
    },500);return()=>clearInterval(id);
  },[]);
  return <View style={{width:1280,height:720,transform:[{scale:1.5}]}}>
    <Svg width={1280} height={720}>
      <Rect width={1280} height={720} fill={tick%2?'blue':'gold'}/>
    </Svg>
    <View style={{position:'absolute',top:100,left:(tick%4)*180,
      width:240,height:240,borderRadius:40,overflow:'hidden'}}>
      <Image source={require('./assets/repro.png')} style={{width:240,height:240}}/>
    </View>
    <Text style={{position:'absolute',top:400,fontSize:80,color:'white'}}>
      FRAME {tick}
    </Text>
  </View>;
};
```

Build with the common Release command. In the VVD terminal, stop/restart with
`vega virtual-device stop` then
`vega virtual-device start --gui=false --display-res 1920,1080`, keeping that
terminal alive. In the app terminal run these five lines:

```sh
vega device install-app --dir . -b Release
vega device launch-app --appName com.example.frictionrepro.main
SNAG_SHOT=$(mktemp -d /tmp/vega-frame.XXXXXX)
python3 -c 'import socket,pathlib,sys; d=pathlib.Path(sys.argv[1]); s=socket.create_connection(("127.0.0.1",5554),10); s.recv(4096); t=(pathlib.Path.home()/".emulator_console_auth_token").read_text().strip(); s.sendall(("auth "+t+"\nscreenrecord screenshot "+str(d)+"\nquit\n").encode()); r=s.makefile("rb").read().decode(); print(r); assert "KO:" not in r and list(d.glob("*.png"))' "$SNAG_SHOT"
open "$SNAG_SHOT"/*.png
```

Repeat the last three lines after several logged ticks. Compare FRAME/color/
card position with COMMIT_REQUEST; a mismatch is the sought symptom, not proof
of its cause. Restart with `--gui=true` and compare the identical package's live
window. The Python command reads the existing emulator token privately and
requires a fresh PNG; it uses no repository capture helper.

**Expected:** complete, current scenes in each screenshot/recording.
**Actual:** headless Standings/Show/Champion retained Judge counter **1793**
against committed **1859/3644/3995**; Brag contained a partial enlarged Judge
card. No capture error reported staleness. The identical windowed package
presented all eight scenes; offscreen-surface selection is an **inference**.
Early bootstrap captures also had local observer/filename problems and cannot
all be attributed to this finding.

**Workaround:** capture the actual window through the lock-guarded
`spike/tooling/capture.py`/ScreenCaptureKit path; reject console pixels for
headless acceptance. The overlay-disabled windowed release has fresh final frames.
**Suggestion:** ship a composed-display capture API returning surface identity
and presented-frame timestamp, and fail when the source is stale or incomplete.
**Our evidence:** [paired report/counters](docs/review/tv/visual/REPORT.md),
[rejected pixels](docs/review/tv/visual/integrated-headless/presentation.json),
[accepted champion](docs/review/tv/visual/window-release/champ.png).

### F-A02 · Cold startup stops answering without a JS exception · Major

**Date / tool:** 2026-10-13–14; SDK 0.24.12112 / RN 2.0.9000000000 /
SVG/Reanimated 2.0.9000000001 / W3C media 2.3.2 / Media Controls 1.0.25.
**Aliases:** F-TV-09; F-POLISH1-06; F-VISUAL-02; F-TV-FINISH-04;
F-TV-PHOTO-03 (lobby stall); F-TV-04 (early registration/stall report).

**Task:** attach the complete show on a cold Release launch.

**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — concurrent
audio initialization plus 32 SVG/shared-value worklets is an unverified reduction.

1. Apply the fresh-template setup and paste this component into src/App.tsx.
2. Run the commands/controls described after the component.

```tsx
import React,{useEffect,useState} from 'react';
import {Text,View} from 'react-native';
import Svg,{Circle} from '@amazon-devices/react-native-svg';
import Animated,{useSharedValue,useAnimatedProps,useFrameCallback} from '@amazon-devices/react-native-reanimated';
import {AudioPlayer} from '@amazon-devices/react-native-w3cmedia';
const Dot=Animated.createAnimatedComponent(Circle), DEFER=false;
function Particle({i}:{i:number}) {
  const x=useSharedValue(i*30);
  useFrameCallback(()=>{x.value=(x.value+3)%1280;});
  const props=useAnimatedProps(()=>({cx:x.value}));
  return <Dot animatedProps={props} cy={200+i*8} r={10} fill="gold"/>;
}
export const App=()=>{
  const [ready,setReady]=useState(false),[beat,setBeat]=useState(0);
  useEffect(()=>{
    const players=Array.from({length:8},()=>new AudioPlayer());let live=true;
    void Promise.all(players.map(async p=>{
      await p.initialize();p.volume=0;p.src='/pkg/assets/raw/repro.ogg';p.load();
    })).then(()=>{if(live)setReady(true);}).catch(e=>console.log('INIT',String(e)));
    const id=setInterval(()=>{console.log('HEARTBEAT');setBeat(n=>n+1);},500);
    return()=>{live=false;clearInterval(id);players.forEach(p=>{p.pause();void p.deinitialize();});};
  },[]);
  return <View style={{width:1280,height:720,transform:[{scale:1.5}]}}>
    {(!DEFER||ready)&&<Svg width={1280} height={720}>
      {Array.from({length:32},(_,i)=><Particle key={i} i={i}/>)}
    </Svg>}<Text style={{fontSize:60}}>BEAT {beat}; audio {String(ready)}</Text>
  </View>;
};
```

Use the exact **Release run** above. For cold repeats use
`vega device terminate-app --appName com.example.frictionrepro.main` then
`vega device launch-app --appName com.example.frictionrepro.main`.
Look for stopped heartbeat/readiness without a JS error; repeat with **DEFER=true**
as the audio-before-particles control. Our failure had more layers/services;
a successful small probe does not refute it.

**Expected:** responsive connected/loaded native snapshots and a presented lobby.
**Actual:** all-at-once mounting intermittently stopped after bootstrap; the
private-bundle package installed but timed out with `Native app timed out at undefined`.
A later effects candidate stopped at lobby cue 9. The headless relaunch report
records `Invoke listener callback timed out`; its receipt says
`Native readiness timed out at undefined`. No single internal cause is isolated;
initial Media Controls registration was only correlated with an early stall.

**Workaround:** staged seven-layer mounting at 150 ms intervals, then defer
native particle attachment until shared audio preload resolves. Terminate/relaunch
restored the later headless startup without changing the package. The final
windowed gate passes; intermittent cold-headless readiness remains a limitation.
**Suggestion:** expose bounded initialization/callback/UI-commit wait diagnostics
that identify the pending component before declaring app readiness.
**Our evidence:** [layer controls](docs/review/tv/polish1/native-startup-layer4.json),
[private-bundle failure](docs/review/tv/g2-private-bundles-diagnostic.json),
[latest startup comparison](docs/review/tv/visual/REPORT.md).
**Re-observed 2026-10-14 (gallery capture, same VVD/SDK):** some cold launches reached the
native lobby but stopped answering the control and phone sockets. One readiness verifier
and two phone joins timed out, and the same package then completed a full game with zero
JS exceptions after a relaunch. This suggests a further diagnostic: tell an attached
native WebSocket apart from a responsive JS message callback.
[Gallery capture record](docs/gallery/capture.json).

### F-A03 · Mixed native animation/photo games silently stall · Major

**Date / tool:** 2026-10-12–13; SDK 0.24.12112 / RN 2.0.9000000000 /
Reanimated 2.0.9000000001+3.5.4 / SVG 2.0.9000000001.
**Aliases:** F-TV-03; F-TV-02 (composed-update stall); F-TV-INTEGRATE-01/02;
F-TV-FINISH-02 (runtime portion); F-TV-PHOTO-01; A/C runtime follow-ups.

**Task:** preserve reference motion while completing all three native rounds.


**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — N independent
Reanimated shared values updated per frame inside SVG, detach/remount and a
rounded Image clip preserve workload patterns, not a proven minimal trigger.

1. Apply the fresh-template setup and paste this component into src/App.tsx.
2. Run the commands/controls described after the component.

```tsx
import React,{useEffect,useState} from 'react';
import {Image,Text,View} from 'react-native';
import Svg,{Circle} from '@amazon-devices/react-native-svg';
import Animated,{useSharedValue,useAnimatedProps,useFrameCallback} from '@amazon-devices/react-native-reanimated';
const Dot=Animated.createAnimatedComponent(Circle), N=128;
function Particle({i}:{i:number}) {
  const x=useSharedValue(i*9),y=useSharedValue(i%32*20);
  useFrameCallback(()=>{x.value=(x.value+4)%1280;y.value=(y.value+2)%720;});
  const props=useAnimatedProps(()=>({cx:x.value,cy:y.value}));
  return <Dot animatedProps={props} r={12} fill="gold"/>;
}
export const App=()=>{
  const [scene,setScene]=useState(0);
  useEffect(()=>{
    let n=0;const id=setInterval(()=>{console.log('SCENE',++n);setScene(n);},1000);
    return()=>clearInterval(id);
  },[]);
  return <View style={{width:1280,height:720,transform:[{scale:1.5}]}}>
    <Svg key={scene} width={1280} height={720}>
      {Array.from({length:N},(_,i)=><Particle key={i} i={i}/>)}
    </Svg>
    <View style={{position:'absolute',top:100,left:150,width:300,height:300,
      overflow:'hidden',borderRadius:60,transform:[{rotate:(scene%2?8:-8)+'deg'}]}}>
      <Image source={require('./assets/repro.png')} style={{width:300,height:300}}/>
    </View><Text style={{fontSize:70}}>SCENE {scene}</Text>
  </View>;
};
```

Use the exact **Release run** above and watch SCENE logs/pixels for several minutes.
Compare **N=8** and replacing the Image with a plain red View. A missing image,
stopped scene log and stale capture are distinct observations; record each
separately. Our isolated photo/clip cases passed, so the clip alone is not claimed
to freeze this probe.

**Expected:** game, snapshots and visible scene beats advance to the finale.
**Actual:** title/hunt/Brag trials stopped at different beats without a JS
exception. The original phone run stopped at Judge cue **222** after **78.025 s**,
with zero native exceptions/media errors. A mask-only repair later stopped at
Showstopper tally; all five isolated photo cases passed. Disabling eyes/audio
and changing bundles did not establish a universal fix. These are related
workload observations, **not proof of a single library defect**.

**Workaround:** sampled worklets/cached transforms, fixed clipped watch arcs,
flattened matrix transforms, 150 ms outgoing-scene detachment, merged mask paths,
memory-composed photo art, batched view updates and motion after native attachment.
Normal-speed current G2 completes in **249.317 s**, all eight TV/phone screens,
zero recorded native/phone/audio errors. The old 290-second prose refers to an
earlier pass; the current JSON is the timing source.
**Suggestion:** publish a release-mode mixed animation/SVG/photo stress sample
with UI-commit/attachment wait telemetry and presented-frame acknowledgements.
**Our evidence:** [historical failure provenance](docs/friction-audit.md),
[component controls](docs/review/tv/photo-bisect-isolated/findings.md),
[current G2](docs/review/tv/g2-native-e2e.json).

### F-A04 · SVG imperative props reach native with incompatible types · Major

**Date / tool:** 2026-10-12; Amazon SVG 2.0.9000000001+13.14.0.
**Alias:** F-TV-02 (type-assertion portion).

**Task:** animate batched native SVG without per-frame React state.

1. In a native Path-ref test, update at 30 Hz with
   `pathRef.current?.setNativeProps({ stroke: '#0E0B2B', strokeWidth: 4 })`.
2. Build/launch using the standard Release commands; compare Shape's imperative
   conversion with JSX and the corrected [native stage](tv/src/stage).

**Expected:** the same color/numeric props accepted in JSX are converted safely.
**Actual:** the worker records native JSI assertions and process aborts; exact
assertion text was **not preserved**. Source inspection found fill conversion
but stroke requiring a brush object and strokeWidth requiring a string.
**Workaround:** use compatible string widths/static geometry and drive view
transforms/texture opacity with a capped shared clock.
**Suggestion:** route setNativeProps through the JSX converters and reject
invalid types with a named JS error before native dispatch.
**Our evidence:** [original F-TV-02 report](docs/friction-raw.md#f-tv-02--2026-10-12-edt--vega-svg-20900000000113140--major);
this is a worker-reported reproduction, not a retained crash transcript.

### F-A05 · Audio sink exhaustion reported as decoder/source errors · Major

**Date / tool:** 2026-10-13; W3C media 2.3.2 / VVD OS 1.2.
**Aliases:** F-TV-INTEGRATE-04; F-TV-FINISH-01.

**Task:** play the exact reference effects while keeping the eight-voice policy.


**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — one new
AudioPlayer per SFX trigger, with prior players paused but retained.
The deliberately incorrect resource policy is the probe; misleading error
codes are the product finding. A 64-player failure threshold is not known.

1. Apply the fresh-template setup and paste this component into src/App.tsx.
2. Run the commands/controls described after the component.

```tsx
import React,{useEffect,useState} from 'react';
import {Text} from 'react-native';
import {AudioPlayer} from '@amazon-devices/react-native-w3cmedia';
const N=64;
export const App=()=>{
  const [count,setCount]=useState(0);
  useEffect(()=>{
    let live=true;const bank:AudioPlayer[]=[];
    void (async()=>{
      for(let i=0;i<N&&live;i++){
        bank.at(-1)?.pause();const p=new AudioPlayer();bank.push(p);
        await p.initialize();if(!live)break;p.volume=0;
        p.addEventListener('error',()=>console.log('MEDIA_ERROR',bank.length,p.error?.code,p.error?.message));
        p.src='/pkg/assets/raw/repro.ogg';p.load();p.play();setCount(bank.length);
        console.log('RETAINED',bank.length,p.readyState,p.currentTime);
        await new Promise(r=>setTimeout(r,200));
      }
    })().catch(e=>console.log('INIT_ERROR',String(e)));
    return()=>{live=false;bank.forEach(p=>{p.pause();void p.deinitialize();});};
  },[]);
  return <Text style={{fontSize:60}}>Retained paused/current players: {count}</Text>;
};
```

Use the exact **Release run** above; collect MEDIA_ERROR codes/messages and native
allocation messages. Compare **N=8** and fresh-process playback of the same Ogg
after `vega device terminate-app --appName com.example.frictionrepro.main`.
Fixtures are silence/volume zero; flags do not establish audibility.

**Expected:** valid effects advance/end; inactive voices do not multiply sinks.
**Actual:** baseline passed **90/112** IDs, with **33** media error records
(codes 3/4). The diagnosis retains `shared memory allocation failed, err=Unknown error -12`,
`failed to open playback, err: Cannot allocate memory`,
`Failed to create streamhelper object`, then `The stream is in the wrong format.`
The same failed files played after a fresh launch. Limiting active voices alone
did not bound retained native instances.

**Workaround:** reuse eight SFX players plus two music players; **224/224**
first/replay checks pass with ten players and no media errors, without re-encoding
assets. Resource management was our app fix; misleading diagnostics are the
product finding.
**Suggestion:** propagate sink-allocation cause and resource usage through
AudioPlayer.error instead of an empty or decoder-only error.
**Our evidence:** [diagnosis](docs/review/tv/native-audio-diagnosis.md),
[baseline](docs/review/tv/native-audio-ogg-baseline.json),
[fresh subset](docs/review/tv/native-audio-ogg-fresh-subset.json),
[pool pass](docs/review/tv/native-audio-effects.json).

### F-A06 · Speech reuse/preparation and JS deadlines under native load · Major

**Date / tool:** 2026-10-13–14; W3C media 2.3.2 / RN 0.72 /
SVG-Reanimated 2.0.9000000001 / VVD OS 1.2.
**Aliases:** F-VOICE-VEGA-03; F-POLISH1-08; recording contention in the voice reports.

**Task:** start marked host speech within 600 ms and let mandatory clips finish.

1. Historical completed-source reuse and prepared-slot trials used
   `node tv/tooling/verify-voice.mjs native` with mock relay and the standard setup.
2. Inspect chronology:
   `cat docs/review/voice/native-voice-game.json`,
   `cat docs/review/tv/polish1/native-fifth/release-gate.json`.
3. Current strict completion check:
   `TV_VOICE_REQUIRE_POLLY=true TV_VOICE_CAPTURE=false TV_VOICE_OUTPUT_DIR=/tmp/snag-friction-voice node tv/tooling/verify-voice.mjs native`.

**Expected:** timely playback/fallback and completed mandatory host lines.
**Actual:** source reuse could stop startup without an exception. Earlier native
route decisions exceeded 600 ms; a 28-route candidate still cut one Brag clip at
665 ms. Removing recording did not solve the later Brag delays. A separate
record-before-greeting attempt measured a **2,039 ms** fallback. These are
decision/start timings, not acoustic latency.

**Workaround:** bounded active/prepared slots, asynchronous retirement, zero-volume
warmup, reuse initialized idle players, yield particle planning and reserve the
speech/read hold before typing finishes. Native now allows **2,000 ms**;
web stays **600 ms**. Latest gate completes **28/28** mock clips, no fallbacks/errors,
maximum start latency **887 ms**. The original hard native 600 ms target is **unmet**.
**Suggestion:** add a native decoder-ready/cancellable scheduled-play primitive
with callback-queue timing, so a game can enforce start deadlines under load.
**Our evidence:** [historical voice report](docs/workers/voice-report.md),
[completion/timing chronology](docs/review/tv/polish1/release-review.md),
[latest gate](docs/review/tv/visual/release-gate/native-voice-game.json).

### F-A07 · Empty Media Controls session update aborts app · Major

**Date / tool:** 2026-10-14; Media Controls 1.0.25 / RN 0.72/system bundles /
SDK 0.24.12112 / VVD OS 1.2. **Alias:** F-POLISH1-03.

**Task:** withdraw the idle game's active media session.

1. Register the game provider using getOrMakeServer/setHandlerForComponent.
2. In the historical native handler, call `server.updateMediaSessionStates([])`;
   build/install/launch using the standard Release commands. The worker repeated
   this on three launches.
3. Inspect `cat docs/review/tv/polish1/alexa-empty-session-crash.txt`.

**Expected:** deactivation or an actionable validation error.
**Actual:** Error followed by **SIGABRT**; the retained stack names
`at updateMediaSessionStates (native)`. No spoken Alexa command was involved.
**Workaround:** publish one complete `NOT_PLAYING` session with no actions,
media info and playlist state; startup/direct-handler checks pass.
**Suggestion:** accept empty session lists or reject them safely with explicit
idle/deactivation requirements.
**Our evidence:** [crash stack](docs/review/tv/polish1/alexa-empty-session-crash.txt),
[working handler](docs/review/tv/polish1/alexa-native-handler.json).

### F-A08 · Media Controls endpoint discovery fails before dispatch · Major

**Date / tool:** 2026-10-14; Media Controls 1.0.25 / RN 0.72/system bundles /
VVD OS 1.2. **Alias:** F-POLISH1-04.

**Task:** test provider transport on an unsigned VVD through the documented SDK client.

1. With the registered game in `PLAYING`, run
   `node tv/tooling/verify-media-transport.mjs`.
   Its native path calls
   `MediaControlComponentAsync.makeMediaControlEndpointLocator().getMediaControlEndpoints()`.
2. Compare direct injection:
   `TV_MEDIA_ROUTE=handler node tv/tooling/verify-media-transport.mjs`.

**Expected:** discover a focused endpoint and reach its transport handler.
**Actual:** `TypeError: undefined is not a function`; factory/locator methods
were functions, but no endpoint or callback was obtained. App remained running.
**Workaround:** ten direct checks against the registered handler plus normal
remote controls; service dispatch/focus/spoken Alexa remain **pending device session**.
**Suggestion:** ship an unsigned-VVD endpoint round-trip test and a diagnostic
that names a missing native/system-bundle API.
**Our evidence:** [SDK failure](docs/review/tv/polish1/alexa-native-sdk.json),
[direct-handler pass](docs/review/tv/polish1/alexa-native-handler.json).

### F-A09 · Workspace asset URLs fail despite packaging · Major

**Date / tool:** 2026-10-12; SDK 0.24.12112 / RN 2.0.9000000000.
**Alias:** F-TV-01.

**Task:** load reference PNGs/TTFs imported from outside `tv/`.

1. Historical source imported assets through parent directories; build/install/launch
   using the standard commands and inspect the native lobby.
2. Compare staging through
   `pnpm --filter @snag/tv assets` and
   `cat docs/review/tv/asset-generation.json`.

**Expected:** packaged Metro-resolved workspace assets load.
**Actual:** `/assets/../assets/...` resource locations failed; textures/fonts
were absent despite bundling. No exact native load-error transcript is retained.
**Workaround:** stage unchanged files under `tv/src/stage/generated/native-assets/`
and generate imports from there.
**Suggestion:** normalize parent segments in packaged asset URLs or fail the
build with the unresolved URL.
**Our evidence:** [worker report](docs/friction-raw.md#f-tv-01--2026-10-12-edt--vega-sdk-02412112--rn-209000000000--major),
[staging generator](tools/tv-foundation/generate.mjs).

### F-A10 · SVG Text misses runtime custom font/stroke · Major

**Date / tool:** 2026-10-12; SVG 2.0.9000000001+13.14.0 / expo-font
2.0.1758683737 / VVD OS 1.2. **Alias:** spike “runtime-loaded Lilita One” entry.

**Task:** draw the reference display title with actual Lilita letterforms and a 12 px ink outline.

1. Load converted TTFs through expo-font; draw two native SVG Text elements
   with `fontFamily="Lilita One"`, a `strokeWidth={12}` underlay and yellow fill.
2. Build the spike from `spike/vega-app` using
   `npm run build:release -- --target aarch64 --use-system-js-bundles true`;
   compare the before/after screenshots linked below.

**Expected:** SVG shares the loaded font and visible stroke.
**Actual:** RN Text used Lilita, while SVG Text appeared as plain sans-serif
without the visible stroke. **Visual failure; no exact error text emitted.**
**Workaround:** generate actual glyph Path outlines with fontTools; render
native stroke/fill Paths. Runtime UI remains bundled TTF.
**Suggestion:** provide a tested stroked custom-font SVG Text example and specify
cross-renderer font registration/invalidation behavior.
**Our evidence:** [before](docs/spike/shots/Screenshot_1791852595.png),
[after](docs/spike/shots/full20.png),
[spike report](docs/spike/friction-entries.md).

### F-A11 · Painted googly-eye composition retains stale/partial frames · Major

**Date / tool:** 2026-10-13; RN 2.0.9000000000 / Reanimated
2.0.9000000001+3.5.4 / SDK 0.24.12112 / VVD OS 1.2.
**Alias:** F-TV-08 (googly-eye entry).

**Task:** keep independent reference pupil motion in the full native lobby.

1. Historical `f816d1c` used one core Animated.Value per sticker, interpolated
   x/y pupils and rounded painted whites/shades/highlights; build with
   `pnpm --filter @snag/tv build:release --target aarch64 --use-system-js-bundles true --max-workers 2`.
2. Compare the single-eye and composed native cases in
   `cat docs/review/tv/native-eyes-probe.json`.
3. With the corrected bitmap geometry, run
   `node tv/tooling/verify-native.mjs eyes-lobby`.

**Expected:** full lobby presents while pupils move.
**Actual:** composed painted variants retained startup art or only background/
eye shapes; the single-eye fixed-loop and idle sampler passed. A 15 Hz React-state
painted trial also failed composition. Some telemetry remained live; some full
compositions stopped snapshots. No internal rendering cause or general driver
failure was proved; exact error text was not emitted.
**Workaround:** keep the preferred native driver but use reference pupil PNGs
and whites baked from `.gg` CSS at the displayed sizes.
**Suggestion:** add a scaled multi-eye/native-transform sample comparing painted
and bitmap geometry with presented-frame failure diagnostics.
**Our evidence:** [controls/workaround](docs/review/tv/native-eyes-notes.md),
[working lobby clip](docs/review/tv/native-eyes-lobby.mp4).

### F-A12 · Native SVG photo/mask attachment needs a simpler composition · Major

**Date / tool:** 2026-10-13; SDK 0.24.12112 / RN 2.0.9000000000 /
SVG/Reanimated 2.0.9000000001 / VVD OS 1.2.
**Alias:** F-TV-FINISH-02 (photo portion), related F-TV-PHOTO-01.

**Task:** reveal the synthetic phone photo with the Pixel Judge mask.

1. Historical SVG Image+Mask candidate used
   `TV_JOIN_ORIGIN=http://localhost:8789 node tv/tooling/capture-native.mjs g2`.
2. Inspect the crop/attachment repair and fresh pixels:
   `git show 16fb5d6 -- tv/src/stage` and
   `cat docs/review/tv/g2-native-e2e.json`.

**Expected:** the photo/mask present in the reference inset and remain responsive.
**Actual:** the original native composition did not show the actual photo;
a rounded native Image crop produced it. A redundant mask-wrapper scale also
misaligned the overlay; that scale was **our implementation error**, not an SDK
claim. Exact native attachment error text is not retained.
**Workaround:** once-per-find memory composition, one merged mask Path/Rect clip,
and the calibrated 100/120 photo crop; current full G2 passes. Isolated old
photo/mask cases also passed, so the mask alone is not a proved stall cause.
**Suggestion:** publish a release-tested rounded in-memory photo + animated-mask
example on a scaled stage, including supported attachment/composition rules.
**Our evidence:** [historical repair handoff](docs/review/tv/finish-handoff.md),
[isolation controls](docs/review/tv/photo-bisect-isolated/findings.md),
[current comparison](docs/review/tv-judge-compare.png).

### F-A13 · Scaled GLView draws but hides the RN overlay · Major

**Date / tool:** 2026-10-12; expo-gl 2.0.9000000001+13.4.0 / VVD OS 1.2.
**Alias:** spike GLStage entry.

**Task:** draw rays/grid/glow and 300 particles behind native art/controls.

1. Build/install the spike with `GLStage.tsx` and a 1280×720 GLView inside the
   stage scaled 1.5× at 1080p.
2. Run `node spike/vega-app/control.cjs case gl20`, then compare
   `node spike/vega-app/control.cjs case full20`.

**Expected:** declared GL bounds compose behind RN overlays.
**Actual:** `[KeplerScript-Native] [ExpoGL] runAsync glGetError: 1282`;
GL appeared in a small bottom-left rectangle, the rest was black and native
overlays disappeared. Shader drawing occurred; usable composition did not.
Standalone/unscaled GL was not tested.
**Workaround:** return to native SVG/bitmap composition, which restored the scene.
**Suggestion:** supply a tested scaled GLView/RN-overlay example that reports
actual drawable dimensions and surface/transform restrictions.
**Our evidence:** [GL source](spike/vega-app/src/GLStage.tsx),
[failure pixels](docs/spike/shots/gl-composition-failure.png).

### F-A14 · rAF callback timestamp is undefined · Major

**Date / tool:** 2026-10-12; RN runtime 2.0.9000000000 / SDK 0.24.12112.
**Alias:** spike requestAnimationFrame entry.

**Task:** drive particles and frame measurements from the callback timestamp.

1. In the native Release spike, probe
   `requestAnimationFrame(timestamp => send({ timestamp }))` over local telemetry.
2. Compare `typeof timestamp` with taking `performance.now()` at handler entry.

**Expected:** a numeric monotonic callback timestamp.
**Actual:** callback ran with `undefined` (the timestamp key disappeared during
JSON serialization); timestamp math left particles absent and FPS at zero while
images/input still worked. There is no native error text.
**Workaround:** use `performance.now()` at entry and retain an explicit type probe.
**Suggestion:** pass a monotonic timestamp and add a release-runtime timer
conformance test.
**Our evidence:** [spike finding](docs/spike/friction-entries.md),
[retained timestampType:undefined probes](docs/spike/evidence/runtime.jsonl),
[corrected probe/clock source](spike/vega-app/src/App.tsx).

### F-A15 · MCP API reads truncate navigation before the API body · Major

**Date / tool:** 2026-10-12; Builder Tools MCP 1.0.17.
**Alias:** spike AudioPlayer/AudioPlaybackStream documentation entry.

**Task:** obtain the class members/examples needed for native audio.

1. With project context established, call:
   `python3 spike/tooling/mcp_call.py '[{"name":"read_document","arguments":{"document_uri":"https://developer.amazon.com/docs/vega-api/0.24/classes.AudioPlayer.amazon-devices_react-native-w3cmedia.html"}}]'`.
2. Repeat for
   `https://developer.amazon.com/docs/vega-api/0.24/classes.AudioPlaybackStream.amazon-devices_keplerscript-audio-lib.html`.
3. Inspect recorded response metadata:
   `cat docs/spike/evidence/builder-call-receipts.json`.

**Expected:** class description, methods and examples.
**Actual:** each response was **100,020 characters**, consumed by navigation
before the useful API body; `isError:false`, with no explicit truncation error.
Metadata hashes/lengths are retained; full fetched pages were intentionally not committed.
**Workaround:** fetch the primary page directly or use search snippets/curated
examples to locate the API.
**Suggestion:** extract the main article before limiting output and expose
section retrieval plus an explicit truncation flag.
**Re-observed 2026-10-20** (connected MCP, Vega API 0.24): `read_document` on the
AudioPlaybackStream and AudioPlaybackStreamBuilder pages again stopped at 100,020
characters inside the global navigation, with no class heading or method body, while
search returned relevant method snippets. We read the installed 2.0.18 TypeScript
declarations instead.
**Our evidence:** [response receipts](docs/spike/evidence/builder-call-receipts.json),
[worker observation](docs/spike/friction-entries.md).

### F-A16 · Remote MP3/WAV and MP3 MSE fail; AAC/MP4 works · Major

**Date / tool:** 2026-10-13; W3C media 2.3.2 / SDK 0.24.12112 /
VVD OS 1.2 / aarch64 Release/Hermes.
**Aliases:** F-VOICE-VEGA-02; remote-WAV and 48 kHz WAV follow-ups.

**Task:** play relay speech from authenticated memory-only endpoints.


**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — the same synthetic
clip in WAV URL, MP3 URL and fetched AAC/MP4 MSE modes. The anonymous static
server reduces our authenticated/range-capable relay; equivalence is unverified.

1. Apply the fresh-template setup and paste this component into src/App.tsx.
2. Run the commands/controls described after the component.

```tsx
import React,{useEffect,useState} from 'react';
import {Text} from 'react-native';
import {AudioPlayer,MediaSource} from '@amazon-devices/react-native-w3cmedia';
const MODE=String('wav'),ORIGIN='http://127.0.0.1:8877';
export const App=()=>{
  const [status,setStatus]=useState('loading');
  useEffect(()=>{
    const p=new AudioPlayer();let live=true,blob='',bytes:ArrayBuffer|undefined;
    p.addEventListener('error',()=>console.log('MEDIA_ERROR',MODE,p.error?.code,p.error?.message));
    void (async()=>{
      await p.initialize();if(!live)return;p.volume=0;
      if(MODE==='aac'){
        bytes=await fetch(ORIGIN+'/repro.mp4').then(r=>r.arrayBuffer());if(!live)return;
        const m=new MediaSource();
        m.addEventListener('sourceopen',()=>{
          const b=m.addSourceBuffer('audio/mp4; codecs="mp4a.40.2"');
          b.addEventListener('updateend',()=>{m.endOfStream();p.play();});
          b.appendBuffer(bytes!);
        });
        blob=URL.createObjectURL(m as unknown as Blob);p.src=blob;
      }else{p.src=ORIGIN+'/repro.'+MODE;p.load();p.play();}
    })().catch(e=>console.log('SOURCE_ERROR',String(e)));
    const id=setInterval(()=>{const v=MODE+' ready='+p.readyState+' time='+p.currentTime;
      console.log(v);setStatus(v);},250);
    return()=>{live=false;clearInterval(id);p.pause();void p.deinitialize();
      if(blob)URL.revokeObjectURL(blob);if(bytes)new Uint8Array(bytes).fill(0);};
  },[]);
  return <Text style={{fontSize:40}}>{status}</Text>;
};
```

Serve the generated fixtures from a persistent app-directory terminal:

```sh
python3 -c 'import os,http.server; os.chdir("assets/raw"); H=http.server.SimpleHTTPRequestHandler; H.extensions_map.update({".wav":"audio/wav",".mp3":"audio/mpeg",".mp4":"audio/mp4",".ogg":"audio/ogg"}); http.server.ThreadingHTTPServer(("127.0.0.1",8877),H).serve_forever()'
```

For each MODE (**wav**, **mp3**, **aac**) run these five lines:

```sh
vega exec vda reverse tcp:8877 tcp:8877
npm run build:release -- --target aarch64 --use-system-js-bundles true --max-workers 2
vega device install-app --dir . -b Release
vega device launch-app --appName com.example.frictionrepro.main
vega exec vda shell 'loggingctl log -f -v com.example.frictionrepro'
```

Seek code 4/no clock advancement for URLs versus advancing AAC MSE. Successful
WAV/MP3 would narrow the original conditions; do not relabel it a failure.
AAC **URL mode** is not claimed to pass: our successful path is MediaSource.

**Expected:** remote flat audio or a clear unsupported-format reason.
**Actual:** HTTP MP3 and 16 kHz mono/48 kHz stereo remote WAV reported
`MEDIA_ERR_SRC_NOT_SUPPORTED` (4), empty message; MP3 SourceBuffer reported
`MEDIA_ERR_DECODE` (3). Packaged WAV and Chrome's relay WAV advanced. Suffix/
single-load controls did not establish a fix. This does not prove all remote
audio is unsupported.
**Workaround:** fragmented AAC/MP4 MediaSource, prefetched/retained bytes and
bounded player lifecycle; web keeps PCM/WAV. The pinned FFmpeg pipe is memory-only,
needs no extra Polly call and passes the latest full-clip native gate.
**Suggestion:** document a tested URL/MSE/local audio-format matrix with a minimal
raw AAC/MP4 audio example and actionable codec/source errors.
**Our evidence:** [transport failures](docs/review/voice/native-transport-probes.json),
[WAV failure](docs/review/voice-wav/native-voice-game.json),
[repair report](docs/workers/voice-native-fix-report.md),
[latest gate](docs/review/tv/visual/release-gate/native-voice-game.json).

### F-A17 · Image-resolved local audio URI never advances · Minor

**Date / tool:** 2026-10-12; W3C AudioPlayer 2.3.2 / VVD OS 1.2.
**Alias:** spike local asset URI entry.

**Task:** play one music loop and three overlapping local effects.

1. Historical spike set src from `Image.resolveAssetSource(require(...wav))`,
   yielding `file:///pkg/bundle/assets/src/assets/audio/music.wav`; try play/loop
   and explicit `load()`.
2. Inspect `cat docs/spike/evidence/runtime.jsonl`; compare packaged MP3s under
   root `assets/raw/` with `/pkg/assets/raw/music.mp3`.

**Expected:** asset resolution is consistent with RN Image and time advances.
**Actual:** error events, `readyState:0`/`currentTime:0` despite `paused:false`.
The initial error was stringified as `[object Object]`; no exact native code is claimed.
**Workaround:** raw packaged MP3s; four players advance concurrently and loop.
URI and format changed together, so their individual effects are **not isolated**.
**Suggestion:** add a minimal bundled-audio example with a resolvable raw-asset
URI and explicit playback-failure reporting.
**Our evidence:** [state telemetry](docs/spike/evidence/runtime.jsonl),
[spike account of failure/control](docs/spike/friction-entries.md).

### F-A18 · Post-game fanfare completion event is ambiguous · Minor

**Date / tool:** 2026-10-13; W3C media 2.3.2 / production ten-player pool /
VVD OS 1.2. **Alias:** F-TV-PHOTO-02.

**Task:** verify exact cold/warm fanfare completion without listening.

1. After a phone run, execute
   `node tv/tooling/verify-audio-native.mjs ogg native-photo-fanfare`.
2. Terminate/relaunch the unchanged package, then repeat in the fresh lobby.
3. Compare
   `cat docs/review/tv/native-photo-fanfare-timeout.json`
   with `cat docs/review/tv/native-photo-fanfare.json`.

**Expected:** each play advances and completes within its own probe budget.
**Actual:** the post-game first play advanced but did not complete in **3,349 ms**;
the second reported completion in **86.5 ms**, with no audio error.
This does not prove a delayed-event origin or measure acoustic latency.
**Workaround:** fresh-process cold/warm checks passed in **2,171/1,600 ms**.
Keep the earlier probe failed; no production behavior was changed.
**Suggestion:** tag load/play/completion events with a source generation and
expose pending playback state.
**Our evidence:** [failed probe](docs/review/tv/native-photo-fanfare-timeout.json),
[fresh control](docs/review/tv/native-photo-fanfare.json).

### F-A19 · KPI prerequisites checked after device setup · Minor

**Date / tool:** 2026-10-12–14; Perf CLI 0.24.0 / package 2.0.345.0 /
SDK 0.24.12112. **Aliases:** spike UI-fluidity KPI; F-POLISH1-07 (KPI portion).

**Task:** get UI-fluidity or foreground-memory metrics for a connected app.


**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — connected VVD,
fresh Release app built above, **no Appium executable/server**. Use a clean
environment; do not uninstall services to force the condition.

1. Prepare the common fresh Release control in an environment without Appium.
2. Run the five commands below and distinguish KPI preflight from record/TTY errors.

```sh
vega device install-app --dir . -b Release
command -v appium || true
curl --fail --silent http://127.0.0.1:4723/status >/dev/null || true
vega exec perf kpi-visualizer --app-name com.example.frictionrepro --device-serial-number emulator-5554 --kpi ui-fluidity --iterations 1 --disable-telemetry --output-dir /tmp/vega-repro-kpi
vega exec perf record --app-name com.example.frictionrepro --device-serial-number emulator-5554 --recording-timeout 8 --disable-telemetry --output-dir /tmp/vega-repro-record </dev/null
```

The fourth command probes late Appium preflight; the fifth separately probes
TTY/start prerequisites (F-A20). Retry record in a PTY and enter **s**, then
**q**/Enter. No UI-fluidity certification or unsupported profiling flag is
inferred. Our app's error was recorded; the fresh-template sequence is unrun.

**Expected:** a prerequisite preflight before device modification/waits.
**Actual:** after installing KSPTService and waiting for trace daemons:
`Error: Appium server is not found in the platform. Please follow instruction in https://developer.amazon.com/docs/vega/latest/appium-install.html to install Appium server.`
Missing Appium is a valid dependency; the late discovery is the finding.
**Workaround:** ordinary native traces and numeric activity-monitor rows; no
Appium was installed and no UI-fluidity score is claimed.
**Suggestion:** check all prerequisites up front and allow memory-only measurement
without Appium where the metric permits it.
**Our evidence:** [spike finding](docs/spike/friction-entries.md),
[later worker report](docs/friction-raw.md),
[numeric memory rows](docs/review/tv/polish1/native-memory-diagnostic.txt).
The original KPI terminal transcript is not retained.

### F-A20 · Perf recording/monitoring needs a real terminal · Minor

**Date / tool:** 2026-10-12–14; Perf CLI 0.24.0 / package 2.0.345.0.
**Aliases:** spike perf-record; F-TV-07; F-POLISH1-07 (terminal UI portion).

**Task:** capture an automated short trace or numeric monitor output.

1. From a piped command runner, use
   `vega exec perf record --app-name com.snagbrag.spike --device-serial-number emulator-5554 --recording-timeout 8 --disable-telemetry --output-dir /tmp/snag-friction-record`.
2. A later trial added `--record-cpu-profiling --enable-cpu-sched` for the TV.
   Retry the ordinary command in a real PTY, send `s` at the prompt, then `q`
   and Enter after the recording.
3. Inspect numeric-monitor evidence with
   `cat docs/review/tv/polish1/native-memory-diagnostic.txt`;
   its exact invocation is not preserved.

**Expected:** duration-bounded automation or an explicit TTY requirement.
**Actual:** `Press s to start recording, q to quit:` then
`An Error Occurred: (19, 'Operation not supported by device')`.
Recording timeout did not start recording. Activity Monitor reported the same
terminal error while still printing rows (572.3 MiB for this diagnostic app).
The flagged trial does not prove either profiling flag individually unsupported.
**Workaround:** PTY, ordinary trace flags, explicit start/exit; trace/SQL succeeds.
**Suggestion:** add numeric-only/noninteractive recording and monitoring with
explicit start/stop/duration and an up-front terminal check.
**Our evidence:** [retained trace metadata](docs/spike/evidence/trace-file-receipts.json),
[SQL success](docs/spike/evidence/final-trace-summary.jsonl),
[original reports](docs/friction-raw.md).

### F-A21 · MCP cannot discover the working performance toolchain · Minor

**Date / tool:** 2026-10-12; Builder Tools MCP session version unrecorded /
KeplerPerfCLI 2.0.345.0. **Alias:** F-TV-05.

**Task:** analyze a locally recorded TV Perfetto trace through MCP.

1. Record with `vega exec perf record` in the sourced SDK/PTY environment
   described in F-A20.
2. Call `analyze_perfetto_traces` with `traceFilePath`, `appProcessName` and
   a custom query; schema can be inspected with
   `cat docs/spike/evidence/builder-tools-schema.json`.

**Expected:** discover the same installed trace processor that the CLI uses.
**Actual:** the worker reports the analyzer could not locate the trace
processor/Performance CLI path although CLI recording worked. Exact analyzer
error text/path is **not retained**. Successful spike analysis is a separate
session, not proof that discovery always failed.
**Workaround:** use the installed offline `trace_processor_shell` directly.
**Suggestion:** add an explicit SDK-path setting and installed-tool discovery
diagnostic independent of the server's inherited shell.
**Our evidence:** [F-TV-05 report](docs/friction-raw.md),
[successful spike queries](docs/spike/evidence/final-trace-summary.jsonl).

### F-A22 · Trace-analysis locality is unclear to approval review · Minor

**Date / tool:** 2026-10-13; Builder Tools MCP version unexposed /
KeplerPerfCLI 2.0.345.0. **Alias:** F-TV-FINISH-03.

**Task:** analyze blocked-thread traces without exporting diagnostic metadata.

1. Record a short local trace through F-A20.
2. The historical worker requested `analyze_perfetto_traces` for that path;
   inspect the account with `sed -n '399,417p' docs/friction-raw.md`.

**Expected:** a clearly identified local analysis path.
**Actual:** the agent's automatic approval reviewer rejected the request because
it could submit process/thread metadata externally. **No trace was exported.**
This is an approval/locality finding, not evidence that the MCP actually uploaded
data or that Amazon's analyzer failed; exact reviewer text is not retained.
**Workaround:** installed offline trace processor; thread/scheduling counts alone
did not isolate the native stall.
**Suggestion:** expose a documented offline analysis mode and declare any
external destination/data flow before a trace-analysis request.
**Our evidence:** [worker's refusal/workaround report](docs/review/tv/finish-handoff.md),
[original entry](docs/friction-raw.md).

### F-A23 · Read-only documentation discovery needs unstated context · Minor

**Date / tool:** 2026-10-13–14; later Builder Tools MCP versions unexposed.
**Aliases:** Worker C documentation-discovery report; F-POLISH1-01.

**Task:** discover build/media workflows in a fresh MCP connection.

1. Before setting context, issue this MCP tools/call:
   `{"name":"list_documents","arguments":{"documentType":"WORKFLOW","target_platform":{"device_os":["vega_os"]}}}`.
2. Read `cat .adbt-config.json`; call `set_project_context` with that JSON as
   `config`, then repeat step 1 in the **same connection**.

**Expected:** the discovery tool lists workflows or its description states the prerequisite.
**Actual:** `PROJECT_CONTEXT_REQUIRED`:
`You must call set_project_context before using any other tool, prompt, or resource.`
The spike schema's list description did not state this requirement.
**Workaround:** set context first; build/manifest/media guides then load.
Our stdio bridge does this automatically, so it will not reproduce the missing-context error.
**Suggestion:** put context initialization in each discovery tool's description
and the first workflow example.
**Re-observed 2026-10-14 (release prep, F-RELEASE-01):** following Amazon's build-and-run
skill 1.1.0 from the top, the first `list_documents` call was again rejected until
`set_project_context` ran. The skill's startup sequence omits that step. The returned
recovery instruction was actionable. Add `set_project_context`, with an empty-config
fallback, to the skill's prerequisites.
**Our evidence:** [schema](docs/spike/evidence/builder-tools-schema.json),
[context setup guide](docs/spike/builder-tools.md),
[dated worker reports](docs/friction-raw.md).

### F-A24 · “Virtual device ready” does not survive parent-shell exit · Minor

**Date / tool:** 2026-10-12–14; CLI 1.4.2 / SDK 0.24.12112 / VVD OS 1.2.
**Aliases:** spike launcher entry; F-TV-INTEGRATE-03; F-POLISH1-02.

**Task:** keep the VVD available from a noninteractive launcher.

1. In a transient command cell:
   `vega virtual-device start --display-res 1920,1080`
   (later trials also used `--no-gui`).
2. After that shell exits, run `vega virtual-device status`,
   `vega device list` and `vega exec vda devices`.
3. Retry startup in a persistent PTY and leave its parent shell alive.

**Expected:** readiness means a still-discoverable emulator.
**Actual:** `Virtual device ready.` followed by
`{"running":false,"process_ids":{"qemu":-1}}`; later commands reported
`No devices found` / `no devices/emulators found`.
Parent-process lifetime is inferred from the comparison; GUI/lifetime factors
were not fully isolated in the first trial.
**Workaround:** persistent launcher PTY (later kept open with `tail -f /dev/null`);
device discovery/install and reverse forwarding then work.
**Suggestion:** provide a persistent headless service/detached mode with readiness
checked after the launcher command exits.
**Our evidence:** [spike finding](docs/spike/friction-entries.md),
[later reproductions](docs/friction-raw.md).

### F-A25 · Screenshot destination can acknowledge without a usable file · Minor

**Date / tool:** 2026-10-13–14; CLI 1.4.2 / SDK 0.24.12112 /
authenticated VVD console `screenrecord`. **Alias:** F-POLISH1-10;
Worker C screenshot-directory follow-up.

**Task:** save one fresh synthetic native screenshot.

1. Use a nonexistent destination:
   `python3 spike/tooling/console.py 'screenrecord screenshot /tmp/snag-friction-missing/shot'`.
   This must be a new path, not an existing directory.
2. Compare:
   ```sh
   snag_shot_dir=$(mktemp -d /tmp/snag-friction-shot.XXXXXX)
   python3 spike/tooling/console.py "screenrecord screenshot $snag_shot_dir"
   ```
3. Require one freshly created PNG; clean up the temporary directory afterwards.

**Expected:** a file or actionable invalid-destination failure.
**Actual:** the worker's first command returned `OK` but no usable PNG;
an existing directory produced `Screenshot_<timestamp>.png`.
Earlier local wrappers also reused filenames after console KOs; that wrapper
mistake is not evidence that every console failure returned OK.
**Workaround:** create a private directory, check response/fresh-file count;
current capture.py rejects an invalid directory.
**Suggestion:** validate destination existence and return failure unless a fresh
file was written, documenting the existing-directory contract.
**Our evidence:** [dated observation](docs/friction-raw.md),
[fixed verifier](tv/tooling/verify-scene-a-native.mjs),
[destination guard](spike/tooling/capture.py).

### F-A26 · Console capture is limited for editing/long recordings · Minor

**Date / tool:** 2026-10-13; CLI 1.4.2 / SDK 0.24.12112 / VVD OS 1.2.
**Alias:** DIR-01.

**Task:** prepare repeatable showcase segments, overlaps and named stills.

1. Inspect the recorded console interface with
   `sed -n '95,110p' docs/spike/PLATFORM.md` and
   `cat docs/spike/evidence/capture-probe.json`.
2. The recorded short capture command was
   `python3 spike/tooling/console.py 'screenrecord start --size 1920x1080 --fps 60 --bit-rate 4000000 --time-limit 8 /tmp/snag-friction-demo.webm'`,
   followed by `python3 spike/tooling/console.py 'screenrecord stop'`.

**Expected:** a supported capture workflow with start/frame timestamps and rollover.
**Actual:** underlying emulator recorder has a **180-second cap** and one recording
at a time. The director did not take an occupied worker's device or exercise its
new native adapter; these are interface/workflow limits, **not a reproduced
180-second recording failure**. No exact error is claimed.
**Workaround:** web rehearsal with overlapping encoders; ≤170-second native
segments, timestamped cut points and bounded H.264 previews. Native capture
later switched to the actual window (F-A01).
**Suggestion:** expose a supported capture API with frame/start acknowledgements,
bookmarks, ownership and long-recording rollover.
**Our evidence:** [director guide](tools/director/GUIDE.md),
[original DIR-01 account](docs/friction-raw.md),
[short-capture receipt](docs/spike/evidence/capture-probe.json).

### F-A27 · Device list prints an unusable explicit selector · Minor

**Date / tool:** 2026-10-14; CLI 1.4.2 / SDK 0.24.12112.
**Alias:** F-VISUAL-03.

**Task:** install/launch on the one worker-owned VVD.

1. Run `vega device list`; copy its printed `amazon-…` identifier into a
   task-specific variable such as `SNAG_DEVICE_ID`.
2. Use `vega device install-app -d "$SNAG_DEVICE_ID" --packagePath tv/build/aarch64-release/tv_aarch64.vpkg`
   and `vega device launch-app -d "$SNAG_DEVICE_ID" --appName com.snagbrag.tv.main`.
3. After confirming only the VVD is connected, repeat without `-d`.

**Expected:** the identifier printed by the list selects that device.
**Actual:** explicit install/launch returned `Device not found`; default single-
device selection worked. Full original CLI transcript is not preserved.
**Workaround:** isolated default selection; verified VDA serial `emulator-5554`
for adaptor commands.
**Suggestion:** print the directly accepted CLI selector beside each listed device.
**Our evidence:** [visual worker report](docs/friction-raw.md),
[successful build/presentation provenance](docs/review/tv/visual/REPORT.md).

### F-A28 · Extra pnpm separator loses target flags · Minor

**Date / tool:** 2026-10-12; CLI 1.4.2 / RN build-vega /
pnpm 12.10.1. **Alias:** F-TV-06.

**Task:** build only the requested architecture.

1. Historical attempt:
   `pnpm --filter @snag/tv build:release -- --target armv7 --use-system-js-bundles true --max-workers 2`.
2. Working invocation:
   `pnpm --filter @snag/tv build:release --target armv7 --use-system-js-bundles true --max-workers 2`.

**Expected:** target flags reach build-vega through the package script.
**Actual:** extra separator made them ineffective, building multiple configured
targets; no argument error was emitted. Exact failed build log is not retained.
This is a pnpm/script convention mismatch, not a device failure.
**Workaround:** omit the extra separator, as the scene guide records.
**Suggestion:** reject ignored/trailing build arguments and print the effective
target set before building.
**Our evidence:** [worker observation](docs/friction-raw.md),
[working eye-build guide](docs/review/tv/native-eyes-notes.md),
[current build script](tv/package.json).

### F-A29 · Scaffold rejects ordinary hyphenated folder-style names · Minor

**Date / tool:** 2026-10-12; CLI 1.4.2 / SDK 0.24.12112.
**Alias:** spike project-generate entry.

**Task:** generate a spike in `spike/vega-app/`.

1. Run
   `vega project generate --template helloWorld --name vega-app --packageId com.snagbrag.spike --outputDir spike`.
2. Compare using `--name VegaSpike` and a separately chosen output directory.

**Expected:** accept a common project name or state the restriction before generation.
**Actual:** `Vega operation FAILED due to an irrecoverable error: vega-app is not a valid project name`,
then `Allowed characters: [a-zA-Z0-9]` and `Max length: 100 characters`.
This is valid input validation with harsh/late wording, not a failed SDK install.
**Workaround:** alphanumeric app name, independently named directory.
**Suggestion:** state the name grammar/examples in `generate --help` and keep
folder naming independent of identifiers.
**Our evidence:** [spike record](docs/spike/friction-entries.md),
[generated app](spike/vega-app/package.json).

### F-A30 · Sourcing SDK environment does not expose bare vda · Minor

**Date / tool:** 2026-10-12; CLI 1.4.2 / SDK 0.24.12112.
**Alias:** spike VDA PATH entry.

**Task:** list devices after environment setup.

1. Run `source ~/vega/env`, then `vda devices`.
2. Compare `vega exec vda devices` or inspect `vega which vda`.

**Expected:** bare adaptor command is available as in the copied setup sequence.
**Actual:** `zsh:5: command not found: vda`.
**Workaround:** component-aware `vega exec vda`.
**Suggestion:** consistently use `vega exec vda` in component-aware SDK examples.
**Our evidence:** [spike finding](docs/spike/friction-entries.md),
[working forwarding/run guide](spike/vega-app/README.md).

### F-A31 · Font docs specify an unpublished companion dependency · Minor

**Date / tool:** 2026-10-12; SDK 0.24 expo-font documentation /
expo-font 2.0.1758683737. **Alias:** spike expo-font install entry.

**Task:** install the native font example's dependencies.

1. Historical dependency example:
   `@amazon-devices/keplerscript-turbomodule-api: ~1.0.0`;
   in the spike app run `npm install --cache ../.cache/npm --legacy-peer-deps`.
2. Inspect available versions with
   `npm view @amazon-devices/keplerscript-turbomodule-api versions --json`;
   the worker pinned `1.2.5` and repeated installation.

**Expected:** the documented range resolves to a published package.
**Actual:** `npm error notarget No matching version found for @amazon-devices/keplerscript-turbomodule-api@~1.0.0.`
This reports the historical docs/registry observation, not a fresh registry check.
**Workaround:** companion 1.2.5; font loading passes.
**Suggestion:** validate complete dependency snippets against the public registry
in documentation CI.
**Our evidence:** [spike finding](docs/spike/friction-entries.md),
[pinned lockfile](spike/vega-app/package-lock.json),
[document retrieval hash](docs/spike/evidence/builder-call-receipts.json).

### F-A32 · Doctor flags documented companion packages as possible typos · Minor

**Date / tool:** 2026-10-12; project doctor / SDK 0.24.12112.
**Alias:** spike Doctor entry.

**Task:** validate a successfully built native font project.

1. In `spike/vega-app`, run `vega project doctor`.
2. Inspect `cat docs/spike/evidence/project-doctor.txt`.

**Expected:** distinguish required companion packages from likely typos.
**Actual:** `Scoped deps in profile: @amazon-devices/expo-asset, @amazon-devices/keplerscript-turbomodule-api not a managed OS-version package (typo, or a package the SDK does not track)`,
plus `Remove unknown scoped packages or check OS version`.
All critical checks passed. The separate recommendation to upgrade runtime
2.0 to 2.1 is legitimate version advice, not included as a defect.
**Workaround:** retain tested companion dependencies.
**Suggestion:** classify known required companion packages separately from unknown
packages and avoid recommending their removal.
**Our evidence:** [exact Doctor output](docs/spike/evidence/project-doctor.txt).

### F-A33 · Mantle client setup differs from the assumed IAM quickstart · Minor

**Date / tool:** 2026-10-12; Bedrock Mantle / Anthropic Bedrock SDK 0.34.4 /
IAM policy language 2012-10-17. **Alias:** F-RELAY-01.
**Evidence class:** offline configuration/documentation finding.

**Task:** authorize one model/workspace through AnthropicBedrockMantle.

1. Inspect the pinned SDK's Mantle declaration/README and endpoint-specific
   AWS permissions; application usage is in `sed -n '85,120p' relay/src/ai.ts`.
2. Inspect `cat relay/deploy/iam-policy.json`.
3. Exercise the real SDK through injected fetch, without credentials:
   `pnpm --filter relay exec vitest run test/services.test.ts`.

**Expected:** the brief's one-model `bedrock:InvokeModel` grant covers the chosen
client and its quickstart shows that client.
**Actual:** the pinned README's main example uses AnthropicBedrock; Mantle uses
`bedrock-mantle.<region>.api.aws`. AWS documents `bedrock-mantle:CreateInference`
with project/model scoping. **No AWS request or AccessDenied error was observed.**
The differing permissions are expected endpoint semantics; the friction is
assembling them across references.
**Workaround:** prepare dedicated-project/model CreateInference permission and
workspace header; retain the requested InvokeModel grant. Live authorization
is **pending deploy**.
**Suggestion:** publish one Mantle Messages quickstart containing import, endpoint,
workspace header and least-privilege project/model IAM together.
**Our evidence:** [local SDK-stub tests](relay/test/services.test.ts),
[runtime policy](relay/deploy/iam-policy.json),
[AWS inference permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference.html),
[project/model authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_bedrock-mantle.html).

### F-A34 · Zero retention requires explicit workspace administration · Minor

**Date / tool:** 2026-10-12; Bedrock Mantle data-retention API /
Anthropic Bedrock SDK 0.34.4. **Alias:** F-RELAY-02.
**Evidence class:** offline configuration/documentation finding.

**Task:** prepare the no-durable-photo-storage rule for vision inference.

1. Review the AWS retention/workspace guides and
   `cat relay/scripts/mantle-project.ts`.
2. Run only the local workspace-stub tests:
   `pnpm --filter relay exec vitest run test/services.test.ts`.
   This does **not** run the live `setup:mantle` command.

**Expected:** effective retention is clear during model/client setup.
**Actual:** new scopes default to `inherit`; the guide says no console UI at
launch and model compatibility varies. The inference client lacks typed project
administration used by our setup script. **No live setting was read/changed and
no retention violation was observed.**
**Workaround:** deploy-only generic signed HTTP setup creates/reuses a dedicated
project, sets `data_retention.mode: none` and verifies it. The runtime cannot
change that setting; incompatible-model requests are intended to fall back.
Effective deployed retention is **pending deploy**.
**Suggestion:** expose typed project/retention resources and an effective-mode/
allowed-model check in a zero-retention onboarding example.
**Our evidence:** [setup and verification source](relay/scripts/mantle-project.ts),
[offline tests](relay/test/services.test.ts),
[AWS retention guide](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html),
[workspace guide](https://docs.aws.amazon.com/bedrock/latest/userguide/workspaces.html).

### F-A35 · Neural Polly does not support the requested emphasis tag · Minor

**Date / tool:** 2026-10-13; Polly SynthesizeSpeech / client-polly 3.1150.0;
configured Arthur/Brian neural/en-GB. **Alias:** F-VOICE-POLLY-01.
**Evidence class:** documented capability limit, not a live failure.

**Task:** preserve bold-word emphasis in the host's posh delivery.

1. Read the engine-specific SSML support/prosody table; the requested mapping
   would put `<emphasis>` around `**bold**` copy.
2. Inspect `sed -n '1,45p' relay/src/polly.ts` and run
   `pnpm --filter relay exec vitest run test/services.test.ts`.

**Expected:** the requested emphasis is usable on the configured neural voice.
**Actual:** the support table marks neural `<emphasis>` **not available**.
No unsupported live request was sent; **no exact service error is claimed**.
**Workaround:** escaped SSML with 90% overall rate; 85% rate/+2 dB on bold words.
Audio and marks use identical SSML; live delivery remains pending.
**Suggestion:** publish a recommended neural prosody equivalent beside the
unsupported emphasis tag.
**Our evidence:** [SSML mapper/tests](relay/src/polly.ts),
[official support table](https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html).

### F-A36 · Stop-app assumption fails; terminate-app works · Minor

**Date / tool:** 2026-10-14; CLI 1.4.2 / SDK 0.24.12112.
**Alias:** F-POLISH1-05. **Evidence class:** onboarding/incorrect command assumption.

**Task:** stop the worker-owned TV before releasing the device.

1. Historical attempted command:
   `vega device stop-app --appName com.snagbrag.tv.main`.
2. Inspect `vega device terminate-app --help`, then use
   `vega device terminate-app --appName com.snagbrag.tv.main`.

**Expected:** the guessed stop verb is supported or the launch guide supplies its counterpart.
**Actual:** `Vega CLI argument error: Unknown arguments: appName, stop-app`.
This was our incorrect command assumption, **not an app/device failure**.
**Workaround:** terminate-app succeeded.
**Suggestion:** show terminate-app directly beside launch-app in the quickstart.
**Our evidence:** [dated worker report](docs/friction-raw.md).

### F-A37 · Media Controls constructor example leaves server field unset · Minor

**Date / tool:** observed 2026-10-12; primary guide rechecked 2026-10-14;
SDK 0.24 Media Controls guide / early package label 1.0.
**Alias:** F-TV-04 (documentation portion).
**Evidence class:** source inspection, not a separately executed runtime failure.

**Task:** initialize the documented custom provider handler.

1. Fetch the primary guide for inspection:
   `curl --fail --silent --location https://developer.amazon.com/docs/vega/0.24/media-controls-get-started -o /tmp/snag-friction-media-guide.html`.
2. Inspect its MediaControlHandlerAsync constructor: it calls
   `MediaControlServerComponentAsync.getOrMakeServer();`, then
   `this.mediaControlServer.setHandlerForComponent(this, componentInstance);`
   without assigning the returned server to that field.
3. Compare `sed -n '1,150p' tv/src/stage/media-transport.native.tsx`;
   remove the temporary fetched guide after inspection.

**Expected:** the copyable constructor initializes the server it uses.
**Actual:** the published snippet leaves that field unassigned. No isolated
compile/runtime error text is claimed, and this does not establish the cause
of the early native registration stall.
**Workaround:** retain the factory result explicitly in our native integration.
**Suggestion:** fix the assignment and typecheck the complete provider example
in documentation CI.
**Our evidence:** [original report](docs/friction-raw.md),
[primary constructor example](https://developer.amazon.com/docs/vega/0.24/media-controls-get-started),
[working integration](tv/src/stage/media-transport.native.tsx).

### F-A38 · Readiness obscures missing reverse forwarding · Minor

**Date / tool:** 2026-10-13; CLI 1.4.2 / SDK 0.24.12112 / VVD OS 1.2.
**Alias:** F-TV-PHOTO-03 (network/reverse-port portion).
**Evidence class:** local setup/readiness diagnostic; no promised port-persistence
contract or device defect is asserted.

**Task:** connect the fresh installed app to its local relay/control before G2.

1. Restart/install/launch the worker-owned VVD using the standard setup,
   initially omitting the reverse mappings; run
   `TV_JOIN_ORIGIN=http://localhost:8789 node tv/tooling/capture-native.mjs g2`.
2. Inspect `cat docs/review/tv/g2-final-reverse-port-diagnostic.json`.
3. Reapply
   `vega exec vda reverse tcp:8787 tcp:8789` and
   `vega exec vda reverse tcp:8790 tcp:8790`, then require fresh ready/loaded/
   connected snapshots before starting the synthetic phone.

**Expected:** readiness distinguishes network waiting from a native command stall.
**Actual:** `Native app timed out at undefined`, no snapshot, while the native
screen showed network waiting. Reapplying both mappings restored a responsive
connected lobby. This is separate from the post-install lobby stall in F-A02.
**Workaround:** reapply forwarding after a fresh device start/install and check
the connected native handshake; keep failed diagnostics separate from the pass.
**Suggestion:** include effective reverse mappings and relay/control reachability
in install/launch readiness output.
**Our evidence:** [network failure/control](docs/review/tv/g2-final-reverse-port-diagnostic.json),
[photo handoff](docs/review/tv/photo-worker-review.md).

### F-A39 · Back routing and BackHandler interception · Minor

**Date / tool:** 2026-10-14 review of 2026-10-12 native/2026-09-24 WebView
observations; CLI 1.4.2 / SDK 0.24.12112 / RN 0.72 / VVD OS 1.2.
**Evidence class:** native passing control plus inherited WebView behavior;
no failed native BackHandler claim.

**Task:** handle one Back as a confirmation without accidental exit/double action.

**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — standalone native
control unrun. It logs both hooks, consumes Back and explicitly exits on Select.

```tsx
import React,{useEffect,useState} from 'react';
import {BackHandler,Pressable,Text,View} from 'react-native';
import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
export const App=()=>{
  const [backs,setBacks]=useState(0);
  useTVEventHandler((e:any)=>{
    if(e.eventType==='back')console.log('TV_BACK',Date.now(),e.eventKeyAction);
  });
  useEffect(()=>{
    const s=BackHandler.addEventListener('hardwareBackPress',()=>{
      console.log('HANDLER_BACK',Date.now());setBacks(n=>n+1);return true;
    });
    return()=>s.remove();
  },[]);
  return <View><Text style={{fontSize:60}}>Intercepted Back: {backs}</Text>
    <Pressable hasTVPreferredFocus onPress={()=>BackHandler.exitApp()}>
      <Text style={{fontSize:50}}>Select: explicitly exit</Text>
    </Pressable>
  </View>;
};
```

1. Paste into the fresh RN template; use the exact **Release run** above.
2. From another terminal use
   `vega exec vda shell 'inputd-cli button_press KEY_BACK'`;
   compare TV_BACK/HANDLER_BACK timestamps and check the app stays visible.
3. Use `vega exec vda shell 'inputd-cli button_press KEY_ENTER'` for explicit exit.
   For the inherited WebView branch, use F-A40's component/page: with
   allowSystemKeyEvents, Back may be consumed even when the page does nothing.
   That is a different primary UI surface.

**Expected:** consumed native Back confirms once; explicit exit works.
**Actual:** our native logs contain both key:back and back-intercepted;
BackHandler returned true and the app stayed active. The game deduplicates
Back within 100 ms. The prior WebView needed a page message plus
BackHandler.exitApp for exit. No new runtime error is claimed.
**Workaround:** centralize/deduplicate Back dispatch; explicitly bridge WebView
exit when that surface is used.
**Suggestion:** provide native/WebView Back examples explaining hook overlap,
consumption and explicit exit.
**Our evidence:** [native logs](docs/spike/evidence/runtime.jsonl),
[dispatch/guard](tv/src/stage/remote.tsx),
[inherited notes](docs/review/friction/lead-review-evidence.md).
**Retail stick, 2026-10-17 (OS 2.0, SDK 0.24 / RN 0.72):** one injected `KEY_BACK` reached
`TVEventHandler` and `hardwareBackPress` 171 ms apart, so the 100 ms deduplication above
failed: one press paused and immediately resumed the game. We now handle native Back only
through `BackHandler`, keep `TVEventHandler` for other buttons, and declare
`com.amazon.inputd.service`. This was our integration bug, but the docs should say that
both hooks fire for Back and how far apart.

### F-A40 · Held WebView keys repeat with repeat=false · Minor

**Date / tool:** observed 2026-09-24, reviewed 2026-10-14; SDK 0.24.12112 /
CLI 1.4.2 / VVD OS 1.2 / Vega WebView (original port version unrecorded).
Fresh probe uses the documented `@amazon-devices/webview` ^3.3.0 range; record
the installed version from package-lock.json (no WebView port installed here).
**Evidence class:** inherited DOM observation; no native RN repeat proof.

**Task:** distinguish holds from separate presses without trusting repeat.

**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — unrun standalone.
The original symptom was DOM event.repeat=false, not an inspected RN packet.

```tsx
import React from 'react';
import {View} from 'react-native';
import {WebView} from '@amazon-devices/webview';
export const App=()=> <View style={{flex:1}}>
  <WebView hasTVPreferredFocus javaScriptEnabled allowSystemKeyEvents
    source={{uri:'file:///pkg/assets/keys.html'}}
    onMessage={e=>console.log('WEB_KEY',e.nativeEvent.data)}
    onError={()=>console.log('WEB_LOAD_ERROR')}/>
</View>;
```

1. In the fresh app install
   `npm install --save-exact --legacy-peer-deps '@amazon-devices/webview@^3.3.0'`.
2. Append these extra services only if absent, preserving the common manifest:

```toml
[[wants.service]]
id = "com.amazon.webview.renderer_service"
[[wants.service]]
id = "com.amazon.inputmethod.service"
```

3. Create the keyboard-only page and run these five lines:

```sh
printf '%s\n' '<!doctype html><body tabindex="0">Hold Select; Back does not request exit.<pre id="out"></pre><script>for(const type of ["keydown","keyup"])document.addEventListener(type,e=>{const r={type,key:e.key,code:e.code,repeat:e.repeat,at:performance.now()};document.getElementById("out").textContent+=JSON.stringify(r)+"\n";window.ReactNativeWebView.postMessage(JSON.stringify(r));});document.body.focus();</script>' > assets/keys.html
npm run build:release -- --target aarch64 --use-system-js-bundles true --max-workers 2
vega device install-app --dir . -b Release
vega device launch-app --appName com.example.frictionrepro.main
vega exec vda shell 'inputd-cli button_press KEY_ENTER --holdDuration 1600'
```

Read page/log metadata; repeat with KEY_BACK for F-A39's WebView branch.
Do not substitute native eventKeyAction for DOM repeat without testing that backend.

**Expected:** repeat metadata identifies repeated keydowns during a hold.
**Actual:** the inherited DOM report records the first repeat at 530–550 ms,
then 200–250 ms repeats with `event.repeat === false` and a final keyup.
Our native game filters eventKeyAction but retains no repeat-field transcript.
**Workaround:** DOM keydown/keyup held-state tracking; native action-field
filtering and an explicit per-action repeat policy.
**Suggestion:** expose accurate repeat metadata and document DOM/native hold
semantics with a real held-key test.
**Our evidence:** [inherited observation](docs/review/friction/lead-review-evidence.md),
[native handler pattern, not repeat proof](tv/src/stage/remote.tsx).
This diagnostic WebView is not part of the shipped native game.

### F-A41 · run-app returns long after the first visible frame · Minor

**Date / tool:** observed 2026-09-24, reviewed 2026-10-14; CLI 1.4.2 /
SDK 0.24.12112 / VVD OS 1.2.
**Evidence class:** inherited WebView timing, not a new native measurement.

**Task:** get bounded launch completion for an automated development loop.

**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — fresh-template
timing unmeasured. Use the stock HELLO component from setup.

1. Generate/pin the fresh RN template above with HELLO; keep a windowed VVD ready.
2. Run these five lines:

```sh
npm run build:release -- --target aarch64 --use-system-js-bundles true --max-workers 2
SNAG_VPKG=$(find build -path '*aarch64*' -name '*.vpkg' -print -quit)
date -u '+invoke %FT%TZ'
/usr/bin/time -p vega run-app "$SNAG_VPKG" com.example.frictionrepro.main
date -u '+returned %FT%TZ'
```

Observe the first HELLO frame; in another terminal stream
`vega exec vda shell 'loggingctl log -f -v com.example.frictionrepro'`.
Compare app/first-frame timing with shell elapsed time.

**Expected:** prompt launch acknowledgement or an identified readiness wait.
**Actual:** the inherited WebView report measured 122–129 s in run-app/launch-app
while first load was about 1.2 s. Our spike guide separately warns that launch
can remain blocking after the screen appears. No fresh-template time/error is asserted.
**Workaround:** dedicated/background launch terminal plus independent readiness.
**Suggestion:** separate launch acknowledgement from bounded readiness waits,
exposing the pending condition and a timeout flag.
**Our evidence:** [spike guide](spike/vega-app/README.md),
[inherited timing/provenance](docs/review/friction/lead-review-evidence.md),
[lead's background note](docs/spike/BRIEF-spike.md).

### F-A42 · Developer Mode and registration are separate gates · Minor

**Date / tool:** 2026-10-14 documentation review; CLI 1.4.2 / SDK 0.24.12112;
retail firmware unknown. **Evidence class:** pending device session; no
observed login/registration failure.

**Task:** distinguish signed-out VVD development, retail development access and
consumer-service registration when taking hello-world to hardware.

**Minimal repro**

**Status:** **expected to reproduce; derived from our app** — pending onboarding
probe, not a verified failing login. The reviewer controls the retail device/browser.

1. Install the common hello-world Release on a signed-out VVD using the ordinary
   Release run: that local path needs no developer/consumer login.
2. For retail, complete owner-controlled consumer setup. On TV: About →
   device name → Select seven times → Developer Options → Developer Mode.
   Obtain the current code. In the owner's local terminal run these five lines;
   complete browser/vendor interaction and await reboot before the last line:

```sh
vega devmode --help
vega devmode login
read -r -s SNAG_DEVICE_CODE
vega devmode enable-device --code "$SNAG_DEVICE_CODE"
vega device list
```

3. Build for the architecture printed for that device:
   `npm run build:release -- --target armv7 --use-system-js-bundles true --max-workers 2`
   for our planned stick, then use the common install/launch commands.
   Consumer registration/Alexa dispatch is separate from Developer Mode success.
   Do not capture codes/tokens.

**Expected:** prerequisites distinguish SDK/VVD, retail authorization and
consumer-service registration.
**Actual:** our local VVD works without account registration. Retail enablement,
registration and spoken Alexa remain pending. The documented code lasts five
minutes; no expired-code/AccessDenied failure was observed by this worker.
**Workaround:** account-free VVD validation, then separate owner-controlled
retail/account-service gates.
**Suggestion:** publish a prerequisite matrix and hello-world paths for VVD
sideload, retail Developer Mode and consumer-service registration.
**Our evidence:** [spike/pending account path](docs/spike/PLATFORM.md),
[retail transport gate](docs/review/tv/alexa-transport.md),
[CLI/guide checks](docs/review/friction/lead-review-evidence.md).
**Update 2026-10-17:** the device session happened. The registration gate surfaced as an
`invalid_token` error after a successful browser login; see [F-A51](#f-a51).

### F-A43 · CLI help writes SDK state inside a package directory · Minor

**Date / tool:** 2026-10-14; CLI 1.4.2 / SDK 0.24.12112; restricted filesystem.
**Task:** inspect template/run-app flags without modifying the SDK.
1. From a package directory use `source ~/vega/env` then `vega project generate --help`.
2. Repeat generate/update-manifest/run-app help from a non-package directory
   such as `/private/tmp`.
**Expected:** help does not require a writable SDK workspace.
**Actual:** `PermissionError: [Errno 1] Operation not permitted` while creating
`~/vega/sdk/vega-sdk/main/0.24.12112/workspace/App/friction` before help.
Outside the package, help succeeds with `Warning: Failed to update last used time`.
This is a sandbox/write-permission interaction, not an app build failure.
**Workaround:** inspect help outside the package and use installed-source/curated
references; no SDK permission or account was changed.
**Suggestion:** skip workspace links and last-used writes on help/version paths.
**Our evidence:** [sanitized CLI/source check](docs/review/friction/lead-review-evidence.md).

<a id="f-a44"></a>
### F-A44 · W3C media `src` setter runs a synchronous native load on the JS thread · Major

**Date / tool:** 2026-10-20; retail Fire TV Stick (callie, Vega OS 2.0 TV Ship/515),
SDK 0.24.12112, `@amazon-devices/react-native-w3cmedia` 2.3.2, RN 0.72, Hermes.
**Task:** play short sound effects during a party game through a pool of eight `AudioPlayer`s.
1. Create eight `AudioPlayer`s, `initialize()`, and set each `src` to a packaged OGG.
2. On each effect, set `player.src = '/pkg/assets/raw/<other>.ogg'`, then `play()`.
3. Time the setter on the JS thread (we wrapped it with `performance.now()`).
**Expected:** `src` assignment returns at once and loads asynchronously (HTML media semantics).
**Actual:** the setter runs the native load before returning. Over one game: 205 swaps,
32.6 s of blocked JS, p50 119 ms, max 835 ms. One call never returned, and the Thread
Monitor killed the app (`AppNotResponding`, `JSReactThread`). The same setter on the
Vega Virtual Device: p50 67 ms, max 605 ms.
**Workaround:** one sound-effects atlas per player, loaded once at startup. Each effect
seeks and plays, and a timer pauses the player at the clip's end. Seeks return in 0–1 ms.
**Suggestion:** make the `src` setter asynchronous as HTML specifies, or document the
blocking cost and recommend a sprite/atlas pattern in the media guide.
**Our evidence:** [whole-game stick trace](docs/review/stick-vs-mockup/perf.md),
[VVD before/after](docs/review/stick-vs-mockup/perf/vvd-after-d6ca822.json).
**Earlier sighting (2026-10-17):** the first real-phone game on the stick ended in the same
`AppNotResponding` / `JSReactThread` kill. A symbol-bearing build showed a music crossfade
blocked in W3C media `load()`; we had called `load()` after setting `src`, which already
loads. We removed it. The broader stalls that day were **our own bug**: React siblings
sharing a key kept stacking scene and particle layers (regression test
`tv/test/stage-lifecycle.test.tsx`). Only the blocking load is attributed to the SDK.
[Triage](docs/review/device/20261017-start-anr/triage.json).

### F-A45 · `perf record` leaves finished traces in the device's RAM-backed `/tmp` · Minor

**Date / tool:** 2026-10-20; retail stick and VVD, KeplerPerfCLI 2.0.345.0.
1. Run `vega exec perf record --app-name <app> --trace-categories="['graphics']" ...`.
2. Press `s` to stop and `q` to quit; the trace is pulled to the Mac.
3. Run `df -k /tmp; ls /tmp/vs_trace*` on the device.
**Expected:** the device copy is deleted after the pull.
**Actual:** `vs_trace1-<uuid>temp` stays behind: 56 MB after one game on the stick (476 MB
tmpfs on a 1 GB device) and 110 MB on the VVD. The leftover memory skews later
measurements.
**Workaround:** `rm -f /tmp/vs_trace1-*temp /tmp/vs_trace_log-*temp` after each pull.
**Suggestion:** delete the device-side trace after a successful pull.

### F-A46 · The default `ui` trace category cannot cover a whole game · Minor

**Date / tool:** 2026-10-20; retail stick, KeplerPerfCLI 2.0.345.0.
**Task:** measure frame presentation per scene across a 7-minute game.
**Actual:** with `ui`, about 2,500 slices per second fill a 96 MB buffer in about 100 s.
`--trace-categories="['graphics']"` alone carries one `gwsi_surfacePresented` event per
presented frame for the app process. It covers a 428 s game in 56 MB.
**Suggestion:** document `gwsi_surfacePresented` as the per-frame presentation signal
and suggest the `graphics` category for long sessions. Its `renderTime` field sometimes
reads about 1.5e6 ms (apparently uptime), which also needs documenting or fixing.

<a id="f-a47"></a>
### F-A47 · Audio streams run out across killed app instances (`code 3`) · Major

**Date / tool:** 2026-10-20; retail stick, OS 2.0. Many `vega device launch-app` relaunches
(terminate + start) of a diagnostic build during a day of testing.
**Actual:** every `AudioPlayer` in a fresh app session failed with `MediaError` code 3,
`Failed to initialize audio stream` (novaaudiosink.c:835). That covered packaged OGG music
and MSE AAC voice alike, from the first second of the session. Every session failed until
the stick rebooted. After the reboot, two full games had 0 audio errors with the same
build. The cause is inferred from that timing; we have not yet repeated it with a
controlled number of relaunches.
**Expected:** a terminated app's audio streams are released by the audio server.
**Workaround:** reboot the stick, and keep the number of live players low (8 effects + 2
music + 1 voice).
**Suggestion:** release audio streams on process exit, and add stream counts to a
diagnostic command.
**Related observation (2026-10-20, same stick and SDK):** while we tried an immutable
sound-effects bank to avoid per-cue `src` changes (F-A44), a 47.352 s bank played through
eight PCM voices, then through two PCM voices, and then a fresh two-voice Ogg bank all
returned the same `code 3` stream-initialization error; games completed visually with
speech falling back to blips. Changing the codec did not clear the error, which points at
a stream or sink allocation limit rather than the file format. The exact allocation that
fails is not isolated. That diagnostic build was never promoted.

<a id="f-a48"></a>
### F-A48 · Every on-screen `react-native-svg` `<Svg>` is re-rasterized each frame; cost tracks area · Major

**Date / tool:** 2026-10-22; retail Fire TV Stick 4K Select (`callie`, armv7, 1 GB,
Vega OS 2.0 TV Ship/515), SDK 0.24.12112, Amazon `react-native-svg` 2.0.9000000001
(upstream 13.14.0), RN 0.72, Hermes. Measured with
`vega exec perf record --trace-categories="['graphics']"`, reading the per-frame
`renderTime` of each `gwsi_surfacePresented` event for the app's UI surface.
**Task:** reach 60 fps in the photo hunt, our busiest scene.

1. Show a held hunt screen (the game does not advance): a 236×236 countdown dial built
   from three `<Svg>`s (a face and two half-arcs with fixed paths, which rotate only through
   a parent view's native-driver transform), plus four 264×148 camera-feed tiles. Each tile
   has a two-`<Svg>` overlay (a frame and a dense scanline path) above a bitmap panorama
   that pans with a native-driver transform. The panning and rotation keep frames
   presenting; the `<Svg>` contents never change.
2. Record `graphics` for about a minute and read `renderTime` per presented frame.
3. Repeat with one layer switched off at a time over a debug control channel.

**Expected:** static vector art that has not changed is drawn once and reused, so its
per-frame cost is near zero; path complexity, not on-screen size, drives the cost.
**Actual:** the held hunt screen cost **42 ms per frame**. Removing the dial cut
**14 ms**; removing the four feed overlays cut **28 ms**. Removing only the dense scanline
path inside the overlay (keeping its `<Svg>`) saved **nothing**, and replacing a rounded
clip with a square one also saved nothing. Every visible `<Svg>` is re-rasterized on
every presented frame, and the cost scales with the `<Svg>`'s area, not with how many
paths it holds. Nothing in the docs, the profiler UI or `droppedFrames` points at this.
**Workaround:** pre-rasterize static vector art to PNG at build time and keep `<Svg>` only
for art that truly changes. We did this first for the Brag-Off dot field, which
had run at 16 fps (F-A49 item 4) and stopped costing anything measurable as one PNG.
**Suggestion:** cache static `<Svg>` subtrees as textures and redraw only when their
props change (the equivalent of Android's hardware layer type or iOS `shouldRasterize`).
Failing that, document the per-frame cost and expose an opt-in such as
`renderToHardwareTextureAndroid`. Also: presents per second is a misleading fps
metric on Vega once nothing animates, because a still screen stops presenting. The profiler
UI could show `renderTime` per frame and per surface. F-A46 notes that this field sometimes reads
about 1.5e6 ms.
**Our evidence:** [probe and per-layer switches, commit `1496b45`](tv/src/stage/photo-probe.tsx)
(mode `hunt`),
[per-frame renderTime tooling, commit `c7e88b3`](tools/device/game-frames.py),
[build-time raster stage](tools/tv-foundation/stage-rasters.mjs).

<a id="f-a49"></a>
### F-A49 · Five ordinary RN styles each cost 5–20 fps on the stick, invisible to the profiler · Major

**Date / tool:** 2026-10-21; retail Fire TV Stick 4K Select (`callie`, armv7, 1 GB,
Vega OS 2.0), SDK 0.24.12112, native RN 0.72. `vega exec perf record
--trace-categories="['graphics']"`, counting `gwsi_surfacePresented` per surface while
toggling one layer at a time over a debug control channel.
**Task:** find why a 1280×720 stage scaled to 1080p ran at 24 fps.

1. Build a 1280×720 stage scaled to 1080p. Add four `View`s with
   `borderRadius: 18, borderWidth: 4, borderStyle: 'dashed'` and one `Animated.loop`
   translate with the native driver.
2. Record `graphics` and compare presents per second against `borderStyle: 'solid'`.

**Expected:** the compositor or profiler names the expensive view, or common styles cost
little.
**Actual:** the compositor reported `droppedFrames:0` and 60 Hz vsync while the app
submitted only 24 frames a second (`gwsi_3dStats clientPresentRequestsPerSec`). Per-layer
ablation in a static lobby found:
1. `borderStyle: 'dashed'` on rounded views (4 HUD slots, badge rings): 60 → 47 fps.
   Solid borders: 60.
2. `overflow: 'hidden'` + `borderRadius` + `transform: rotate(-3deg)` around a child with
   a native-driver loop: −9 fps. An axis-aligned clip with no radius cost almost nothing.
3. `KeplerVideoSurfaceView` as a full-screen backdrop under the RN UI: the UI surface
   fell to 25–46 fps by scene, and a still raster in its place ran faster. The 47 fps
   figure we first recorded for the raster run was later found inflated (F-A50), so the
   video surface's cost is observed but its size is unconfirmed. The video surface also
   presents on its own surface ID, which doubles naive frame counts.
4. A `react-native-svg` field of 3,600 dots: Brag-Off at 16 fps; the same dots as one
   PNG cost nothing measurable. **2026-10-22 follow-up:** F-A48 shows the cost tracks the
   `<Svg>`'s area, not its subpath count, so read this item through F-A48.
5. Any continuously looping native-driver animation (a ticker, an idle sway) forces a
   full-surface redraw every vsync; three small loops together took the lobby from 60
   to 47–51 fps.

These deltas are presents per second, measured before we found the leftover-instance
pitfall in F-A50. Absolute fps values may include a second instance's frames. F-A48's
per-frame `renderTime` numbers were taken after that fix.
**Workaround:** solid borders, scissor-only clips, still mood rasters instead of a video
backdrop, pre-rendered rasters for vector art, and no idle loops on native.
**Suggestion:** add a "frame cost by view" overlay or trace category (draw calls,
stencil/offscreen passes, tessellation time per native view). Publish a performance guide that
lists these styles with their measured cost on the Select, and offer a cached-layer option
(like `shouldRasterizeIOS`/`renderToHardwareTextureAndroid`) so a static subtree is not
redrawn when a sibling animates.
**Our evidence:** [dated stick log entry, commit `7cf4db6`](docs/friction-raw.md).
The per-layer traces themselves stayed on the measuring machine and are not committed.
[Whole-game stick method and baselines](docs/review/stick-vs-mockup/perf.md).

<a id="f-a50"></a>
### F-A50 · A leftover app instance keeps presenting beside a relaunched one and inflates fps · Minor

**Date / tool:** 2026-10-21 (fix `9931c76`; reported 2026-10-22); retail Fire TV Stick 4K Select
(`callie`, Vega OS 2.0), CLI 1.4.2, KeplerPerfCLI 2.0.345.0.
**Task:** measure frame rate across full games with a fresh app launch per run.

1. With the app already running, run our earlier measurement sequence:
   `vega device install-app -d <device> -p <package>`, press Home
   (`inputd-cli button_press KEY_HOMEPAGE`), then
   `vega device launch-app -d <device> --appName <app>`.
2. Record `graphics` and count `gwsi_surfacePresented` events for the app.

**Expected:** `launch-app` leaves exactly one instance of the app running, or warns that
one is already running.
**Actual:** an instance from the previous launch kept running in the lobby and presenting
frames beside the measured game. Its frames were counted with the game's and inflated
the measured fps. A "47 fps in every scene" result we had reported internally was wrong
for this reason. `launch-app` gave no warning. We did not isolate whether the install,
the Home press or `launch-app` let the earlier instance survive.
**Workaround:** always `vega device terminate-app -d <device> --appName <app>` before
`launch-app`; our device scripts now do this. Prefer per-frame `renderTime` (F-A48) to
presents per second.
**Suggestion:** add a `launch-app` flag that replaces any running instance. Warn,
or tag trace events with a process ID, when two instances of the same app present at once.
Related: F-A36 (terminate-app is the stop verb) and F-A47 (resources outliving killed
instances).
**Our evidence:** [device script change, commit `9931c76`](tools/device/stick-production.sh).

<a id="f-a51"></a>
### F-A51 · Unfinished developer registration surfaces as `invalid_token` after a successful login · Major

**Date / tool:** 2026-10-17; Vega CLI 1.4.2, SDK 0.24.12112; Amazon Developer portal;
new retail Fire TV Stick 4K Select. Updates F-A42, which predicted this gate before any
device session.
**Task:** enable Developer Mode on the physical stick.

1. Run `vega devmode login` and finish Amazon's browser authorization.
2. Read the CLI result; open the developer dashboard with the same signed-in account.

**Expected:** authenticated vendor access, or an actionable registration prerequisite.
**Actual:** browser authorization succeeded, but the CLI reported
`Failed to verify vendor registration: http 401` with `invalid_token` /
`Authentication failed`. The dashboard redirected to the unfinished Amazon Developer
Registration form. `vega device list` showed no devices. Amazon's community answer to an
identical report names incomplete vendor registration as the cause.
**Workaround:** the owner completed developer registration and identity verification; a
fresh `vega devmode login` then printed `Login successful!`, `vega devmode enable-device
--json` returned `status: success`, and after USB connection the stick was discovered
(`armv7l`, OS 2.0 TV Ship/515, Developer Mode on) and the armv7 package installed and ran.
**Suggestion:** report "Developer registration incomplete" with a direct registration
link instead of a token error, and check vendor registration before prompting for the
expiring on-TV code.
**Our evidence:** [Amazon community thread](https://community.amazondeveloper.com/t/authenticate-developer-mode-on-vega-fire-tv-displays-an-error-message/29094),
[dated worker log](docs/friction-raw.md).

<a id="f-a52"></a>
### F-A52 · The screensaver ends a phone-controlled game after about five minutes · Major

**Date / tool:** 2026-10-17; retail Fire TV Stick 4K Select (`callie`, OS 2.0 TV Ship/515),
SDK 0.24.12112.
**Task:** play a full game driven only by phones over the network, without touching the
TV remote.

1. Launch the native game, join with a synthetic phone, play at normal speed.
2. Poll the app's lifecycle state every 20 seconds.

**Expected:** an actively played foreground game stays visible through the finale.
**Actual:** after about five minutes with no remote input, the system screensaver takes
the foreground, and the backgrounded game can then be terminated for its resource
quota. The component inactivity timeout of 1,800 s does not change this display policy.
Our latest run reached the final round's countdown after 309 s (six native photo decodes,
live Polly) before the takeover.
**Workaround:** on background, pause at once, request every native audio release before
awaiting any of them (JS can be suspended between awaits), and unmount scene layers.
Lobby Home/warm return and a two-minute Settings recovery pass; full-game background
recovery is not verified. Lengthening the TV's own timeout is a household setting we did
not change.
**Suggestion:** a documented engagement or keep-awake API for foreground apps receiving
authenticated controller activity over the network, released automatically on
pause/background. Amazon confirms the current limitation in its
[developer response](https://community.amazondeveloper.com/t/vega-os-no-api-or-device-setting-to-keep-the-display-awake-for-non-media-signage-kiosk-apps-screensaver-engages-despite-foreground-app/28610).
**Our evidence:** [idle/background kill receipts](docs/review/device/20261017-fixed/full-game-idle-kill.json),
[background kill](docs/review/device/20261017-fixed/idle-background-kill.json).

<a id="f-a53"></a>
### F-A53 · WebSocket text frames from the stick arrive with non-ASCII characters mangled · Minor

**Date / tool:** 2026-10-20; retail Fire TV Stick 4K Select (Vega OS 2.0), RN 0.72
global `WebSocket`, `ws.send(string)`.
**Task:** relay a status string from the TV to the players' phones.

1. From a Vega app: `new WebSocket(url).send(JSON.stringify({ msg: 'a…b' }))` to any
   Node `ws` echo server.
2. Compare the received bytes for `…` (U+2026) with `E2 80 A6`.

**Expected:** text frames are UTF-8 once, per RFC 6455.
**Actual:** "…" composed on the stick showed on the browser phone as "scanningâ€¦",
which is UTF-8 bytes read as Windows-1252. The phone page and assets are served as
UTF-8 and the relay decodes frames as UTF-8. The stick is the only non-browser hop, but
we have **not yet verified with a byte capture** which layer double-encodes.
**Workaround:** escape every non-ASCII character as `\uXXXX` before sending, in both
directions, so frames stay ASCII.
**Suggestion:** encode text frames once as UTF-8 and add a non-ASCII case to the
WebSocket conformance tests.
**Our evidence:** [dated worker log](docs/friction-raw.md).

### F-A54 · Release Hermes bytecode embeds the build machine's absolute paths · Minor

**Date / tool:** 2026-10-14; SDK 0.24.12112 / CLI 1.4.2; React Native for Vega
2.0.9000000000 (RN 0.72); kepler-cli-platform 0.22.14.
**Task:** produce armv7, aarch64 and x86_64 packages fit for public distribution.

1. Build all three Release targets with system JS bundles.
2. Open each VPKG (Zstandard/tar) and scan the Hermes bundle for home-directory paths.
3. Rebuild with `--hermes-flags=-O,-w,-g0` and repeat the scan.

**Expected:** public Release packages contain no local account name or checkout path.
**Actual:** every initial Hermes bundle contained the absolute path of the hashed Metro
input bundle under the local checkout. Plain JS and package build-info had no such path.
The compiler supports `-g0`, which omits it.
**Workaround:** our release script adds `-g0` (keeping `-O` and `-w`) and scans every archive;
rich debug info stays in private development builds.
**Suggestion:** make Release debug paths relative by default, or ship a documented
privacy-safe release preset and an archive check for local paths.
**Our evidence:** [package scan](docs/release/packages.json).

### F-A55 · `vega path hermes` at a workspace root fails with a legacy package name · Minor

**Date / tool:** 2026-10-14; CLI 1.4.2 / SDK 0.24.12112; pnpm workspace.
**Task:** find the installed Hermes compiler to inspect its options (F-A54).

1. Run `vega path hermes` at the workspace root.
2. Run it again from the native app package (`tv/`).

**Expected:** an error naming the missing native-app directory, or a directory option.
**Actual:** at the root, an empty npm-list result and an error expecting the legacy
`@amzn/react-native-kepler` package name. From `tv/` it returned the compiler. Running
from the root was our working-directory mistake, but the message pointed elsewhere.
**Workaround:** run from the native app package.
**Suggestion:** print the current directory and the recognized native package names,
suggest the app directory, and accept a project-directory argument.

### F-A56 · Incremental packaging keeps raw assets that were deleted from the source · Minor

**Date / tool:** 2026-10-20; SDK 0.24.12112 / CLI 1.4.2, armv7 Release.
**Task:** replace a diagnostic WAV with an Ogg.

1. Build once with `tv/assets/raw/native-sfx.wav` present.
2. Delete that file and build again without cleaning.
3. List the new archive.

**Expected:** the package mirrors the current `assets/raw`.
**Actual:** the staged copy under `build/private/vega/armv7/Release/assets/raw/` remained,
and the next archive shipped an unused 9,091,596-byte WAV.
**Workaround:** inspect archive contents before every production package and remove the
stale staged file.
**Suggestion:** sync deletions when staging raw assets, or document an asset-only clean.

### F-A57 · Physical-device screenshots take 3–6 s and carry no acquisition timestamp · Minor

**Date / tool:** 2026-10-20; retail Fire TV Stick 4K Select (OS 2.0 TV Ship/515),
SDK 0.24.12112, CLI 1.4.2; `gwsi-tool-screenshooter` through VDA.
**Task:** capture timed frames (0.5/2/4/8 s) of celebration scenes on the stick.

1. `vda shell 'gwsi-tool-screenshooter /tmp/shot.png'` at a scheduled moment.
2. Record device time before and after the call.

**Expected:** a timed capture, or a capture that reports when its frame was acquired.
**Actual:** a composed 4K screenshot took roughly 3–6 s to return, plus about 0.2–0.5 s
of CLI startup. The image does not say when its frame was taken, so we could not certify
which moment within that window it shows. There is no supported physical-device video
or window stream; our windowed capture tool works only for the VVD.
**Workaround:** keep before/after device timestamps per capture and treat them as a
bracket.
**Suggestion:** stamp screenshots with their frame's presentation time and offer a
supported physical-device video stream.

<a id="f-a58"></a>
### F-A58 · Bedrock returns 403 for enabled Claude models while the catalog says available · Major

**Date / tool:** 2026-10-17; AWS CLI 2.38.1; `@anthropic-ai/bedrock-sdk` 0.34.4; Mantle
Messages and catalog APIs; Bedrock `GetFoundationModelAvailability`; us-east-1.
**Task:** enable live photo naming and select the fastest model under 3.5 s p95 from five
successful calls.

1. Create and read back a zero-retention Mantle workspace.
2. Every ten minutes from 15:05:21 to 17:05:21 UTC, send a synthetic image to
   `anthropic.claude-opus-5`, `anthropic.claude-sonnet-5` and `anthropic.claude-haiku-4-5`.
3. Read the model catalog and `GetFoundationModelAvailability` for each.

**Expected:** an enabled model returns JSON, or the error names the missing prerequisite.
**Actual:** all 39 probes across 13 cycles returned HTTP 403. Opus and Sonnet report
authorization, entitlement and region AVAILABLE/AUTHORIZED but agreement
`NOT_AVAILABLE`, and the error directs the owner to AWS Sales. Later the catalog listed Opus 5.5
(image input, no-retention support) as available. Owner-console and deployment-identity calls to
Opus 5.5, Opus 5, Sonnet 5, Opus 4.8 and Opus 4.7 still returned 403, and both
identities use the same account. Haiku's Mantle ID is rejected by the
foundation-model availability API. Account-catalog reads reject the Anthropic workspace
header that Messages requires. No player photo, request body or credential was logged.
**Workaround:** the game uses its four-second fallback suggestions (hosted smoke: fallback
in 96–159 ms) with live Polly. An AWS access case is open. As of the last recorded check
(2026-10-17), no live vision inference has succeeded.
**Suggestion:** surface the agreement prerequisite in the SDK error and console, offer
one availability diagnostic with consistent model IDs across Mantle and the
foundation-model API, and document which headers each endpoint accepts.
**Our evidence:** [probe result](docs/release/live-bedrock-result.json),
[Opus 5.5 access check](docs/release/opus55-access.json),
[deployment record](docs/release/live.md).

### F-A59 · Mantle accepts SDK request options the service does not support · Minor

**Date / tool:** 2026-10-17 (docs checked that day); `@anthropic-ai/bedrock-sdk` 0.34.4;
Mantle Messages API; Opus 5, Sonnet 5, Haiku 4.5.
**Task:** make three model candidates ready for the live access and latency test.

1. Compare our request's `output_config.format` and `effort: low` with the Claude in
   Amazon Bedrock feature table and the effort compatibility table.

**Expected:** the client makes unsupported options for this endpoint and model
discoverable before a live call.
**Actual:** the Bedrock docs exclude structured outputs, and the effort list excludes
Haiku 4.5, yet the SDK types accept both. Stubbed tests would pass a request the service
rejects. Because the account returns 403 first (F-A58), this is documentation-backed, not
an observed live 400.
**Workaround:** omit `format` on Mantle and request JSON in the prompt with strict local
validation. Send `effort: low` only to Opus and Sonnet. Transport tests check all three payloads.
**Suggestion:** publish endpoint/model feature metadata the SDK can validate locally,
before account activation or billable inference.
**Our evidence:** [feature table](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock#features-not-supported),
[effort compatibility](https://platform.claude.com/docs/en/build-with-claude/effort#compatibility).

### F-A60 · EC2 rejects a just-created IAM instance profile · Minor

**Date / tool:** 2026-10-17; AWS CLI 2.38.1; IAM and EC2, us-east-1.
**Task:** launch the relay instance with its scoped runtime role.

1. Create a role and instance profile, add the role to the profile.
2. Immediately call `aws ec2 run-instances` with that profile name.

**Expected:** completed IAM calls make the profile usable by EC2.
**Actual:** `InvalidParameterValue`: invalid IAM Instance Profile name. No instance was
created by that request.
**Workaround:** read the profile back, wait for propagation and retry; one t4g.small then
launched.
**Suggestion:** an EC2-side waiter for instance-profile readiness and a propagation-specific,
retryable error code.
**Our evidence:** [deployment guide, propagation step](relay/deploy/README.md).

### F-A61 · Amazon Linux 2023: installing `curl` conflicts with preinstalled `curl-minimal` · Minor

**Date / tool:** 2026-10-17; current Amazon Linux 2023 arm64 AMI (SSM public parameter); dnf.
**Task:** bootstrap nginx, FFmpeg, Node and pnpm from EC2 user-data.

1. In user-data: `dnf install -y nginx tar gzip xz curl`.

**Expected:** base utilities install and bootstrap continues.
**Actual:** `curl` conflicts with the image's `curl-minimal`; cloud-init aborted before
installing the encoder and Node.
**Workaround:** keep the HTTPS-capable `curl-minimal` and drop `curl` from the list; the
corrected script and systemd service then ran.
**Suggestion:** mention `curl-minimal` in AL2023 bootstrap examples and say when replacing
it is needed.
**Our evidence:** [setup script](relay/deploy/setup.sh).

## Feature requests

| ID / priority | Description Amazon could ship | Why it matters to this game | Supporting findings |
|---|---|---|---|
| FR-01 · **Critical** | Composed-display capture/readiness API with surface/frame timestamps, stale-source rejection and scene bookmarks/rollover. | A completed game must yield footage of the actual current show, including a finale after several minutes. | F-A01, F-A25–26 |
| FR-02 · **Critical** | Release-mode mixed-scene sample/conformance suite covering scaled SVG, nested transforms, rounded photos, particle bursts and concurrent media, with bounded initialization/UI-commit diagnostics. | A lively party game combines these workloads; an isolated component pass did not predict full-game success. | F-A02–04, F-A09–14 |
| FR-03 · **Important** | Game-audio guide with reusable bounded SFX pools, per-source/sink allocation diagnostics and a tested local/URL/MSE codec matrix. | Fast overlapping effects and an in-memory puppet voice need predictable resources and actionable failures. | F-A05, F-A16–17 |
| FR-04 · **Important** | Decoder-ready and cancellable native scheduled playback with load-generation completion and callback queue timings. | Host lines must begin promptly, synchronize the mouth and finish before mandatory scene changes. | F-A06, F-A18 |
| FR-05 · **Important** | Whole-game Media Controls example with safe idle/deactivation state and an unsigned-VVD provider/client round-trip test. | Pause/Next must control the entire game even when no individual music/speech player is active. | F-A07–08, F-A37 |
| FR-06 · **Important** | Noninteractive performance capture/monitoring with early prerequisite/capability checks and a memory-only path where possible. | Automated release checks should measure the busy show without terminal handling or late Appium setup. | F-A19–21 |
| FR-07 · **Important** | MCP main-article/section retrieval, explicit truncation/context/version metadata and documented offline trace analysis. | Agents need the actual current API body and a clear data flow to implement/debug native scenes reliably. | F-A15, F-A21–23 |
| FR-08 · **Important** | Unified Mantle onboarding for model access, project/model IAM, workspace headers and effective zero-retention compatibility. | Household-photo inference needs both correct authorization and a verified no-retention path before live play. | F-A33–34 |
| FR-09 · **Critical** | Cached raster layers for static `react-native-svg` and RN subtrees (redraw only on prop change), plus a per-view frame-cost trace category and `renderTime` in the profiler UI. | Our busiest scene spent 42 ms a frame redrawing art that never changed; ordinary styles cost 5–20 fps with no signal in the profiler. | F-A48–50 |
| FR-10 · **Important** | Engagement/keep-awake API for foreground apps driven by authenticated network controllers, auto-released on background. | A party game is played on phones; the screensaver ends it after about five minutes. | F-A52 |
| FR-11 · **Important** | Actionable access errors: name incomplete developer registration and missing Bedrock model agreements directly, with one consistent availability diagnostic. | Both surfaced as generic 401/403 errors that pointed away from the missing prerequisite. | F-A51, F-A58 |

## Non-Amazon tools appendix

These findings are excluded from Amazon platform defect counts. Versions are
from package pins/receipts at the review baseline.

| Tool / version | Use and what worked | Needs work / onboarding | Build again? |
|---|---|---|---|
| MediaPipe Tasks Vision 0.10.14; 1.1.0 evaluated; short-range model v1 | Local phone face redaction; served assets/hash checks and synthetic desktop Chrome detection pass. | Shared WASM dominates download; informative stderr appears at error level (N-A01–02). Lazy self-hosted setup needed careful size measurement; physical iOS Safari remains untested. | **Yes, conditionally**, after the physical-phone/download gate. |
| Node 24.20.0 / pnpm 12.10.1 / esbuild 0.28.2 | Workspace installation/build/test tooling; explicit esbuild build approval works. | pnpm's older allowlist syntax did not satisfy the observed install policy (N-A03). Serial generation avoids our local read/write race (N-A04). | **Yes**; deterministic installs and fast local verification are useful. |
| Chrome 155.0.8059.40 in face report / puppeteer-core 24.43.1 at current lock / Vite 7.3.7 | Muted browser rehearsal and in-memory synthetic-camera tests. | Camera needs HTTPS; basic-ssl trust is documented setup. Browser tests do not prove native/stick or physical Safari behavior. | **Yes** for browser evidence with explicit runtime identity. |
| Anthropic Bedrock SDK 0.34.4 / Anthropic SDK 0.133.0 | Real-client offline fetch stubs and structured response validation. | README/client/endpoint setup friction is shared with the Bedrock integration, F-A33–34; no live model quality was measured. | **Yes, provisionally**, pending live service verification. |
| FFmpeg 7.0.2-static arm64 / macOS 15.1 ScreenCaptureKit + installed Swift toolchain | Memory-pipe native speech encoding and actual-window synthetic capture. | Encoder deployment is unrun; window capture needs macOS 15+ and existing permission. Onboarding reused installed tools rather than measuring clean installs. | **Yes**, for the demonstrated bounded paths. |
| fontTools / librsvg / other art converters (versions not recorded here) | Convert approved glyphs/art into paths/bitmaps; preserve reference shapes and bundled fonts. | Extra build-time staging is necessary; no measured tool defect in this assignment. | **Yes**, because results retain the approved art. |

### N-A01 · MediaPipe download exceeds the face-detector budget · Minor

**Date / tool:** 2026-10-13; Tasks Vision 1.1.0/0.10.14.
**Alias:** FACE-01. **Task:** keep added gzip download ≤3 MB.

1. Measure package WASM with Node gzip; compare pinned 1.1.0/0.10.14.
2. Inspect `cat docs/review/face-blur-size.json` for the actual served variant,
   loader/model/JS transfers and decoded-byte/hash checks.

**Expected:** the small face model permits the complete budget.
**Actual:** 1.1.0 selected WASM alone was 3,861,652 gzip bytes; final 0.10.14
SIMD added download was **3,168,058 bytes**, 168,058 over budget. No tool error:
the 229,746-byte model alone was a misleading budget proxy.
**Workaround:** pinned compatible version, lazy self-hosted assets, gzip serving.
**Suggestion:** publish a face-only runtime or report whole-task transfer size.
**Our evidence:** [served-size receipt](docs/review/face-blur-size.json),
[worker report](docs/workers/face-blur-report.md).

### N-A02 · Successful WASM initialization uses console.error · Minor

**Date / tool:** 2026-10-13; Tasks Vision 0.10.14 / desktop Chrome.
**Alias:** FACE-02. **Task:** verify a full phone game has no browser errors.

1. With a mock relay and TV, set `SNAG_PHONE_URL` to their local room join URL;
   run `node phone/dev/e2e-play.mjs "$SNAG_PHONE_URL"` using its built-in
   synthetic camera and collect browser errors. Omit the screenshot-directory argument.
2. Inspect `cat docs/review/face-blur-e2e.txt`.

**Expected:** successful initialization logs at informational severity.
**Actual:** `INFO: Created TensorFlow Lite XNNPACK delegate for CPU.`
arrives through console.error, while detection/snags/full game pass.
**Workaround:** exclude only that exact informational line; still fail on every
other console/page error.
**Suggestion:** route INFO-prefixed WASM output to console.info.
**Our evidence:** [e2e output](docs/review/face-blur-e2e.txt),
[checker](phone/dev/e2e-play.mjs).

### N-A03 · pnpm/esbuild build approval syntax · Minor

**Date / tool:** 2026-10-12; pnpm 12.10.1 / esbuild 0.28.2.
**Alias:** Phone-P01. **Task:** install phone build/browser dependencies.

1. Historical workspace used `onlyBuiltDependencies: [esbuild]`;
   run `corepack pnpm install`.
2. Use `corepack pnpm approve-builds esbuild --yes`, then install again.

**Expected:** the approved setup script runs.
**Actual:** `ERR_PNPM_IGNORED_BUILDS` / `Ignored build scripts: esbuild@0.28.2`.
**Workaround:** current `allowBuilds: { esbuild: true }` configuration; install,
build/tests/typecheck pass.
**Suggestion:** show the applicable workspace approval syntax in the error.
**Our evidence:** [phone notes](docs/review/phone-notes.md),
[current allowBuilds](pnpm-workspace.yaml),
[unchanged original report](docs/friction-raw.md).

### N-A04 · Overlapping generation/tests reads an incomplete module · Minor

**Date / tool:** 2026-10-14; Node 24.20.0 / pnpm 12.10.1 /
local `tools/tv-foundation` generator. **Alias:** F-POLISH1-11.
**Task:** verify the final native candidate.

1. Historical worker overlapped `pnpm test` with the build's asset generation.
2. Inspect `cat docs/review/tv/polish1/root-build-race.txt`;
   serialize `pnpm --filter @snag/tv assets`, then `pnpm test`.

**Expected:** readers see a complete generated module.
**Actual:** three TV suites saw undefined `PHOTO_MASK_RLE`; the root run aborted
before all suites completed. Race attribution is inferred from overlap and a
clean sequential rerun. This is **our scheduling mistake**, not an Amazon failure.
**Workaround:** serialize generation and checks; the later worker passed 446 tests.
This docs-only review separately passes 448 tests and root typecheck.
**Suggestion:** make generated-file replacement atomic or document reader exclusion.
**Our evidence:** [historical failure](docs/review/tv/polish1/root-build-race.txt),
[this review's tests](docs/review/friction/root-tests.txt),
[typecheck](docs/review/friction/root-typecheck.txt).

### N-A05 · Partial pnpm workspace deploy fails the frozen install · Minor

**Date / tool:** 2026-10-17; EC2 Amazon Linux 2023; Node 24.20.0; pnpm 12.10.1.
**Task:** install only the relay's runtime dependencies on the server from a small
source archive.

1. Ship relay/shared source and the built phone bundle with the root lockfile.
2. Run `pnpm install --prod --frozen-lockfile`.

**Expected:** install the relay and shared runtime from the existing lockfile.
**Actual:** pnpm rejects lockfile importers whose manifests were omitted (starting with
`phone/package.json`). Our systemd unit also loaded `tsx` from the workspace root, where a
production install does not expose it. This is **our deployment recipe**, not an Amazon failure.
**Workaround:** ship every workspace manifest, keep the frozen lockfile, filter with
`relay...`, and run the service from the relay package; 100 runtime packages installed.
**Suggestion:** pnpm could name the missing importers and offer a filtered frozen install.
**Our evidence:** [deployment guide](relay/deploy/README.md).
