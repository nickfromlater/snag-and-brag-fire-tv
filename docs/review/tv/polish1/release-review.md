# TV polish handoff — 2026-10-14

Delivered a fresh armv7 Release to
`~/builds/snag-and-brag/tv_armv7-integrated.vpkg`, replacing the initial package
only after the strict normal-speed native core/audio gate passed. Source commit:
`f9b41924fb835d06043a9117eaeb882948508b6e` on `w/polish1`.

The package is **16,695,253 bytes**, SHA-256
`a69245b5651f14614c18572036f0e9346f3e23e5be475702a2172b294015313a`.
[Delivery receipt](armv7-delivery.json) records the old/new fingerprints,
build command, SDK/runtime, acceptance evidence and limitations.
The VPKG remains outside git.

## Built and verified

- Whole-game Vega Media Controls: pause/play/resume, toggle and Next/Fast-forward
  use the existing remote paths. A running game owns one active media session;
  idle/completed state withdraws its actions. Six core/handler tests and ten
  native direct-handler checks passed. Recommendation: **ship-unverified**.
  [Alexa report and exact retail-stick steps](../alexa-transport.md).
- Effects/text paint order covers all eight scenes, HUD, host and ticker.
  Reactions avoid the speech bubble/chips; fireworks start beside the measured
  champion name. Camera flash, holography and scene effects stay below copy.
  [Audit](../effects-text-audit.md),
  [five-moment before/after sheet](../effects-text-before-after.png),
  [full web receipt](effects/after.json): all eight scenes, 28 Polly routes,
  zero fallbacks/errors, normal speed, three bots, muted Chrome.
- Native aarch64 Release/Hermes: **28/28 Polly clips completed**, zero blips,
  zero runtime/audio errors, all eight core scenes, normal speed. Maximum measured
  start latency: **1,193 ms**. [Full receipt](native-final/native-voice-game.json),
  [filtered events](native-final/native-voice-game.jsonl),
  [release gate](native-final/release-gate.json).
- Final root checks: **446 tests passed**, including 103 TV tests; root typecheck
  passed. [Tests](root-tests.txt), [typecheck](root-typecheck.txt),
  [native preparation tests](native-preparation-tests.txt).
- Fresh armv7 Release build passed with SDK 0.24.12112 / CLI 1.4.2 / Node 24.20.0,
  using system JS bundles. [Build output](armv7-build.txt).

## Run and reproduce

For the web stage, use an available local mock relay on the repository's usual
8787 port and `pnpm --filter @snag/tv dev`; choose Play with bots and Start the
show. The web verification uses system Chrome with `--mute-audio`.

For the stick, follow the Alexa report: start the mock relay on Mac 8867 and
control server on 8869; forward device 8787→Mac 8867 and device 8790→Mac 8869;
install the delivered package, then launch `com.snagbrag.tv.main`. FFmpeg must be
on the relay's PATH for native mock AAC/MP4. Keep the Mac muted.

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$HOME/vega/bin:$PATH"
pnpm --filter @snag/tv build:release --target armv7 --use-system-js-bundles true --max-workers 2
```

The native gate runs on an aarch64 package installed on the VVD, while holding
`~/.snag-vvd.lock`, with the mock services/port forwarding above:

```sh
TV_CONTROL_PORT=8869 TV_VOICE_REQUIRE_POLLY=true TV_VOICE_CAPTURE=false \
  TV_VOICE_OUTPUT_DIR=docs/review/tv/polish1/native-final \
  node tv/tooling/verify-voice.mjs native
```

The strict flag requires every route to be Polly and every clip to finish on its
actual media clock, without a subsequent fallback. Capture is disabled during
this gate to avoid recorder contention. The post-game image is separate evidence.
Serialize asset generation and `pnpm test` / `pnpm typecheck`.

## Departures and unresolved checks

The text-legibility brief overrides the reference's effects painted over copy:
container paint order changes, reactions move into a narrow lane beside the
bubble and fade before the HUD, and firework origins move beside the actual name.
Camera flash is confined to its image area; old particles clear on scene changes.
Art, palette, type, copy and effect recipes retain the reference.

Native particle worklets attach after audio initialization. Sampling yields in
four-frame batches and begins animation at its elapsed position, preserving the
same 30 Hz paths. The native speech permission window is **2,000 ms**, compared
with the web's unchanged **600 ms**. Mandatory native speech/read holds can be
longer so a late clip finishes; hunt/mash/vote deadlines and optional quips retain
their existing limits. This is an intentional timing departure, and the original
600 ms native target is not certified. No shared cue/protocol/core shape changed.

Idle Media Controls uses a complete `NOT_PLAYING` state instead of an empty
session list because the empty update aborted the tested runtime. Stop pauses
the show. The documented SDK discovery route still fails; direct injection and
unit tests prove the registered handler, while spoken Alexa, device focus,
physical remote/service coexistence and armv7 runtime await the retail stick.

**Native visual acceptance is unverified.** The latest post-game console image
still retains Intro/reel imagery and zero scores while the core reports champion
completion. [Failed visual receipt](native-final/native-console-capture.json),
[console image](native-final/native-postgame-console.png). Renderer versus console
cause remains unresolved, as previously reported by the voice worker. Package
delivery passed the requested core/audio gate; it does not certify native visuals.

All tests/captures use mock services and bot/synthetic art. No player images,
speech files, account setup, paid API calls, publishing or extra SDK/browser
downloads occurred. The worker stopped its VVD/app, released the shared lock and
kept the Mac muted.

## Historical attempts and friction

These runs are retained for diagnosis and are superseded by `native-final`:

| Attempt | Polly / 28 | Full-clip release gate |
| --- | ---: | --- |
| [native-first](native-first/release-gate.json), 600 ms | 23 | Failed; blips allowed by the older verifier |
| [native-second](native-second/native-voice-game.json), 1,200 ms | 25 | Failed |
| [native-third](native-third/native-voice-game.json), typing-finish guard | 26 | Failed |
| [native-fourth](native-fourth/native-voice-game.json), recording disabled | 23 | Failed |
| [native-fifth](native-fifth/release-gate.json), yielded sampling | 28 | Failed; one clip cut at 665 ms |
| [native-sixth](native-sixth/native-voice-game.json), early hold / 1,200 ms | 26 | Failed |

One root test run overlapped asset generation and failed on an incomplete mask
module; the final sequential run passed. [Historical failure](root-build-race.txt).

[FRICTION.md](../../../../FRICTION.md) contains the full Amazon-format entries:
F-POLISH1-01 context initialization, 02 VVD shell lifetime, 03 empty-state abort,
04 SDK discovery failure, 05 CLI terminate verb, 06 cold particle/audio stall,
07 performance-tool prerequisites, 08 native preparation/completion delays,
09 stale console presentation, 10 screenshot destination validation and
11 the local build/test ordering mistake. Each entry records date, tool/version,
task, steps, expected/actual results, workaround and suggestion.

Implementation commits: `f96854d`, `aad4a02`, `f8a59f0`, `85ee683`, `f9b4192`.
No main/push/rebase or lead-owned status/spec file edits.
