# Native presentation comparison · 2026-10-14

`b52720d` (G2) and integrated TV code at `2e50c75` both present all eight scenes in the windowed VVD. No post-Intro renderer freeze occurred in either normal-speed comparison. Integrated TV code is identical on the worker base (`62e9f2f`) and main (`b3fb29f`); the differences there are worker/status documentation. Both runs add only frame-clock diagnostics. The clean G2 armv7 fallback is rebuilt separately without instrumentation.

All captures use SDK 0.24.12112, CLI 1.4.2, VVD OS 1.2, aarch64 Release/Hermes, system JS bundles, seed 1, speed 1, three ordinary bots, a local mock AI/Polly relay, and a muted Mac. No player photos, AWS requests or paid APIs. `reference/mockup/snag-and-brag.html` was exercised end to end in muted system Chrome before editing, reaching all eight scenes without errors.

The counter counts callbacks of the existing shared stage clock. The media value reads the active speech player's existing clock, without driving it. Diagnostic text refreshes at 4 Hz; a commit or counter does not certify compositor FPS. PNG pixels were read with macOS Vision and visually inspected. Core time is wall time relative to the capture harness launch. Independent window captures follow console captures by up to a few clock samples.

| Build | Capture time | Visible counter | Scene shown | Core scene | Window counter |
|---|---:|---:|---|---|---:|
| g2 | 2.355s | 1688 | lobby | lobby | — |
| g2 | 7.778s | 1740 | intro | intro | — |
| g2 | 16.376s | 1856 | hunt | hunt | — |
| g2 | 46.956s | 2346 | judge | judge | — |
| g2 | 59.622s | 2376 | stand | stand | — |
| g2 | 114.741s | 3086 | brag | brag | — |
| g2 | 184.176s | 3889 | show | show | — |
| g2 | 215.824s | 4118 | champ | champ | — |
| integrated | 2.366s | 603 | lobby | lobby | 609 |
| integrated | 9.418s | 730 | intro | intro | 735 |
| integrated | 19.954s | 914 | hunt | hunt | 914 |
| integrated | 49.762s | 1493 | judge | judge | 1493 |
| integrated | 65.776s | 1577 | stand | stand | 1579 |
| integrated | 134.063s | 1983 | brag | brag | 1983 |
| integrated | 224.347s | 2430 | show | show | 2430 |
| integrated | 263.844s | 2523 | champ | champ | 2524 |

Receipts and original pixels: `g2/presentation.json`, `g2/pixels.jsonl`, `integrated/presentation.json`, `integrated/pixels.jsonl`. `g2-integrated-comparison.jpg` places G2 at left, integrated at right, with Judge, Brag, Showstopper and Champion from top to bottom. Both `intro-hunt-60fps.mp4` files are 1920×1080 H.264, 60 fps, CRF 28/preset slow, below 10 MB. They capture normal-speed Intro→Hunt; encoded FPS is not a claim of 60 unique app frames per second.

`frame-menu.json` and `frame-menu.png` verify the debug-build default and remote menu enable/disable behavior in the actual TV web target. The menu's display title is an SVG path, so verification targets the accessible menu labels instead of DOM title text. The media diagnostic's non-mutating behavior is covered by the added speech test.

The earlier failed console receipts remain failed evidence. The headless/no-overlay follow-up and final build selection are recorded below when complete. The instrumented comparison is a visual gate; it is not the strict audio release gate. The integrated comparison recorded 26/27 Polly route selections and 25 full clips, so final validation runs with the debug overlay disabled.

## Headless counter evidence and resolution

The same integrated package, on the same VVD instance restarted with `--gui=false`, completed its core game with zero exceptions. Its console captures became stale/incomplete:

| Core capture time | Committed counter | Visible counter | Scene shown | Core scene |
|---:|---:|---:|---|---|
| 2.415s | 1121 | 1115 | lobby | lobby |
| 11.396s | 1159 | 1159 | intro | intro |
| 26.405s | 1188 | 1188 | hunt | hunt |
| 56.904s | 1752 | 1752 | judge | judge |
| 73.163s | 1859 | 1793 | judge | stand |
| 127.098s | 2564 | absent | partial judge card | brag |
| 215.432s | 3644 | 1793 | judge | show |
| 251.411s | 3995 | 1793 | judge | champ |

`integrated-headless/presentation.json` is explicitly `visualPass:false`. The late images hold Judge counter 1793; the Brag image contains an enlarged Judge card without the HUD/counter. The clock continued committing up to 3995. Choosing an offscreen/intermediate GL surface is a plausible explanation for the partial card, but the emulator implementation cause was not proved. No application renderer change or voice-commit bisect was justified: the identical package's actual window presented all eight scenes, and an overlay-disabled game also presented its real finale. Headless console pixels are unsuitable for acceptance; no hardware defect is inferred from them.

The first headless cold launch failed the control handshake; `headless-startup/` retains that failure. Its native log had repeated KCP provider callback timeouts. Reverse mappings were present and the local relay was reachable. Terminating/relaunching the app restored native telemetry without changing the package. This is a separate intermittent startup observation, not evidence of a post-Intro renderer freeze.

`spike/tooling/capture.py` replaces acceptance calls to the raw console in TV verifiers, the spike benchmark, and `tools/director/vvd.mjs`. It builds the small `vvd-window.swift` helper using the installed Swift toolchain, selects only the exact VVD window, crops the title bar to a 1920×1080 stage and captures through macOS ScreenCaptureKit. It never captures the desktop, pointer or audio. It requires the existing VVD lock and one windowed VVD, validates screenshot destinations, refuses overlapping recording, and checks actual H.264 dimensions/duration on stop. Raw console access remains available explicitly for controls and diagnostics. macOS 15+ and an existing screen-capture permission are required; there was no permission prompt or download in this run.

The eight-second `window-proof-60fps.mp4` has 481 encoded frames, CRF 28/preset slow, and is 1,514,610 bytes. Its independently read first/last images show counters 7000→7134 and stage time 333.855→340.331 seconds. The source receipt reports 460 captured samples; 60 fps encoding does not claim 60 unique game frames per second. A separate 30 fps / 2 Mbps / three-second smoke verifies the final helper configuration and duration gate. Its short VFR source is an implementation check, not review footage.

## Final release gate and builds

With the debug overlay disabled, `release-gate/native-voice-game.json` passes all eight native scenes, 28/28 complete mock Polly clips, zero fallback, zero exceptions and zero audio errors (maximum start latency 887 ms). `window-release/` contains fresh, complete Showstopper, final standings and champion frames from that same run. The observer attached late, so it does not claim to contain every scene. `window-late-observer/` retains an earlier failed harness attachment after Intro; its misleading filename was not accepted as a lobby pass.

Root `pnpm test` passes **448 tests**, including TV lint, the media-diagnostic non-mutation check, and four Python capture-evidence/ownership guards driven by Vitest. Root `pnpm typecheck` passes. Receipts: `root-test.txt`, `root-typecheck.txt`, `frame-menu.json`, `window-proof-source.json`, and `builds.json`. All committed artifacts are below 10 MB; no raw source video or VPKG is committed.

- `~/builds/snag-and-brag/tv_armv7-g2.vpkg`: clean `b52720d` pre-voice Release, known-good code fallback.
- `~/builds/snag-and-brag/tv_armv7-integrated.vpkg`: integrated TV plus the debug-only frame HUD, disabled in Release. This is the new `TV_PKG` default in `tools/device/session.sh`.

`builds.json` records both byte counts and SHA-256 hashes. The native presentation/audio gate ran on the aarch64 VVD; the armv7 packages build successfully but were not tested on a retail stick. Physical device presentation, spoken Alexa, and hardware performance remain device-gate work.

No mockup art, palette, scene layout, game timing, scoring or shared wire shape was changed. The requested diagnostic overlay is the only temporary visual addition. Capture switched to a windowed native compositor source because the headless console failed. The runs use three all-bot teams rather than human media, preserving the project's privacy rule. No AWS/paid API calls, account changes, pushes or main-branch edits were made.

## Run it

For the stick, run `bash tools/device/session.sh`; override `TV_PKG` with the G2 path if needed. For repeatable native screenshots, use separate persistent terminals for the existing windowed VVD, the local mock relay and control server:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
source ~/vega/env
pnpm install --frozen-lockfile
# Build/generate before running root tests, never concurrently with them.
pnpm --filter @snag/tv assets
pnpm --filter @snag/tv exec react-native build-vega --build-type Release --target aarch64 --use-system-js-bundles true --max-workers 2
# Hold your own ~/.snag-vvd.lock while using the VVD.
vega virtual-device start --gui=true --display-res 1920,1080
HOST=127.0.0.1 PORT=8789 PUBLIC_URL=http://localhost:8789 AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
TV_CONTROL_OUTPUT_DIR=/tmp/snag-tv-control node tv/tooling/control.mjs
vega device install-app --dir tv -b Release
vega exec vda reverse tcp:8787 tcp:8789
vega exec vda reverse tcp:8790 tcp:8790
vega device launch-app --appName com.snagbrag.tv.main
node tv/tooling/verify-presentation.mjs --out /tmp/snag-presentation --revision YOUR_COMMIT
```

The app defaults the frame HUD on in Debug builds. In Release, enable it with the remote's Studio tools → Frame clock or `node tv/tooling/control.mjs send '{"command":"frame-debug","on":true}'`. `--backend console` is reserved for reproducing rejected raw captures. All game comparisons stay at speed 1. Director use and ownership rules remain in `tools/director/GUIDE.md`.
