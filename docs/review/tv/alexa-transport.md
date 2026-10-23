# Alexa transport feasibility — 2026-10-14

**Recommendation: ship-unverified.** The registered native game handler works for
pause, play/resume, toggle, Stop-as-pause and Next/Fast-forward. Spoken Alexa and
automatic media-focus selection still require the signed-in retail stick. Do not
advertise spoken voice as verified based on the VVD receipts.

## Implemented and proved

The native stage registers `GameMediaControlHandler` with
`MediaControlServerComponentAsync.getOrMakeServer().setHandlerForComponent` using
the app's component instance. One session (ID 1) represents the whole show. It
publishes `PLAYING` or `PAUSED` while the game runs, including when music/voice
are disabled; idle, ended and completed games publish `NOT_PLAYING` with no actions.
This avoids a reproduced native abort from an empty session-state update. Music,
effects and Polly players never take over the game's media-control handler.

Pause and play are idempotent: each uses the existing Play/Pause path only when
the game's paused state needs to change. That path freezes/resumes the core,
host typing and speech, bots, clocks, audio and renderer cues. Next uses the
existing Fast-forward path, which resumes and skips the current phase while
retaining scoring/defaults. Stop pauses; it cannot end a game without confirmation.
The manifest advertises the media provider, opts into `Next`, and enables
`VariableSpeed` for the existing Fast-forward behavior. Seeking, Previous and
speed changes are unsupported and are not advertised.

- [Handler tests](polish1/alexa-handler-tests.txt): six passing tests exercise the
  real game core, including a 40-second paused hunt, idempotence, skip from pause,
  default/unrelated session IDs, unsupported controls and session deactivation.
- [Native handler receipt](polish1/alexa-native-handler.json): normal-speed
  aarch64 Release/Hermes, ten checks, zero exceptions. Direct injection into the
  **same registered handler** proves pause/play/toggle/next/Fast-forward, no new
  timeline cues during a two-second pause, and idle deactivation after reset.
- [SDK client attempt](polish1/alexa-native-sdk.json): **failed**. The documented
  locator's endpoint-discovery call rejected with
  `TypeError: undefined is not a function`; factory and locator methods existed.
  No service round trip, focused endpoint or Alexa callback was proved by that attempt.
- [Empty-state crash stack](polish1/alexa-empty-session-crash.txt): historical
  failed implementation, fixed by explicit idle state. This is not release acceptance.

Tested tools: SDK 0.24.12112, Vega CLI 1.4.2, VVD OS 1.2, RN 0.72,
Media Controls 1.0.25, W3C Media 2.3.2, Node 24.20.0. Local services use
AI/Polly mock and synthetic bot artwork; the Mac remains muted.

## Documented route and VVD reproduction

Amazon documents Alexa/remote transport arriving through the registered media
provider and `IMediaControlHandlerAsync`. Its client API can discover focused
endpoints and send commands for testing. We used the
[Media Controls setup guide](https://developer.amazon.com/docs/vega/0.24/media-controls-get-started.html)
and the
[audio sample's override handler](https://github.com/AmazonAppDev/vega-audio-sample/blob/main/src/utils/AppOverrideMediaControlHandler.ts).
The sample controls one player; this implementation controls the game and owns
its state independently of player lifetimes.

With this TV app installed/running, a mock relay connected and the shared VVD
lock held, run:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$HOME/vega/bin:$PATH"
TV_CONTROL_PORT=8869 TV_MEDIA_ROUTE=handler node tv/tooling/verify-media-transport.mjs
TV_CONTROL_PORT=8869 node tv/tooling/verify-media-transport.mjs
```

The first command runs the passing native-handler checks. The second retries
the SDK service route and reports failure honestly on the tested VVD.
`tv/tooling/control.mjs` accepts a local debug command
`{"command":"media-control","route":"handler","action":"pause"}`;
`route:"sdk"` uses endpoint discovery and platform transport instead. Debug
injection is not speech recognition. The verifier retains only filtered state
and event metadata, never image-bearing game state or player media.

## Exact retail-stick session

1. The device owner signs the retail Fire TV into their Amazon account and pairs
   its Alexa remote. Account setup is outside this worker's session. Confirm
   Developer Mode/VDA connectivity and record OS/firmware and `vega device list`.
2. On the Mac, keep output muted, start `AI_MODE=mock POLLY_MODE=mock PORT=8867
   pnpm --filter relay start`, and start `TV_CONTROL_PORT=8869 node
   tv/tooling/control.mjs` in another terminal. Ensure FFmpeg is on PATH for native
   mock speech. No paid AWS calls are needed for transport verification.
3. Install `~/builds/snag-and-brag/tv_armv7-integrated.vpkg` using
   `vega device install-app --packagePath` (select the physical device when more
   than one is connected). The final package uses the repository's usual local
   device ports: forward **device 8787 to Mac 8867** and **device 8790 to Mac 8869**
   with `vega exec vda reverse tcp:8787 tcp:8867` and
   `vega exec vda reverse tcp:8790 tcp:8869`. Launch
   `vega device launch-app --appName com.snagbrag.tv.main`.
4. Use Select → Play with bots → Start the show. During a hunt say **“Alexa,
   pause.”** Confirm the pause menu, frozen countdown/host/bots and a
   `media-handler` pause event followed by `media-session` `PAUSED`.
5. Wait five seconds and say **“Alexa, resume”**, then repeat with **“Alexa,
   play.”** Confirm the whole show resumes with its remaining time and a play
   callback/`PLAYING` state. Repeated pause or play must not toggle the show.
6. Say **“Alexa, next”** during the hunt and again while paused. Confirm one phase
   skip, no scoring loss/crash, and a Next callback. Literal “Alexa, skip” is not
   a supported or verified phrase.
7. Exercise the physical remote's Play/Pause and Fast-forward once each; each
   must cause one action. Verify a complete game, then End game → confirmation →
   lobby, and confirm `NOT_PLAYING` with no actions. Repeat with Sound, Music and
   Voice off to verify session lifetime does not depend on audible playback.
8. Retain filtered callback/session receipts and the OS/device versions. Do not
   persist household photos or thumbnails. If speech goes to another app, no
   callback arrives, or remote keys double-trigger, mark voice failed and cut the
   voice claim while retaining the existing remote controls.

The unresolved checks are Alexa phrase recognition, signed-in device focus and
dispatch, physical remote/service coexistence and armv7 runtime behavior. The
VVD has no account and cannot settle those. Friction entries F-POLISH1-01 through
F-POLISH1-04 record the discovery prerequisite, process lifetime, empty-state
abort and SDK client failure. No wire protocol or shared core shape changed.
