The first native acceptance captures failed review on 2026-10-13. `tv-scene-a/title.png`, `reel.png`, `count-1.png`, and `snag.png` all show the app bootstrap copy, “Getting the studio ready…”. They do not show the named scene states and must be replaced before acceptance.

The accompanying control log contains `hermes:false`, `utf8:TextEncoder`, and intro/hunt cues despite these bootstrap captures. This is consistent with web traffic reaching the shared observer while the native app is not ready. A complete cue sequence alone is insufficient evidence of the VVD rendering that sequence.

The foundation branch now has fixes to inspect and integrate:

- `aab5db3`: routes web and Hermes clients separately, adds native readiness/font/relay fields to snapshots, and waits for native reset acknowledgements.
- `343314d`: initializes the control router before accepting clients.
- `a0cd001`: shares pending native audio pool initialization and releases disposed players.

Native acceptance must use an observer filtered to native clients, wait for `ready`, `loaded`, `connected`, and `hermes` before starting, and confirm the captured pixels show title/reel/count/standings. Keep the VVD lock throughout device operations; stop and relaunch the installed app when its public control configuration changes.

Independent web review after `f7a56fa` passed: 14 scene states, a complete seeded three-bot game, exact lime 250px SNAG glyphs, all six badge hops, 198 of 198 scheduled score-roll sound calls, and zero exceptions. `pnpm test`, `pnpm typecheck`, and `pnpm lint` passed. The Mac and Chrome remained muted; no player photo was used or recorded.

This note is a failed-capture diagnosis, not a native acceptance receipt. Native comparison sheets and both 60fps clips remain outstanding until the bootstrap captures are replaced.

After integrating the three foundation fixes as `6016fbf`, `5ba93c7`, and `823bc8f`, a native snapshot reported `ready:true`, `loaded:true`, `connected:true`, and `hermes:true`. The subsequent `probe-lobby.png` still showed bootstrap artwork (one version also showed the parade). The foundation worktree's `native-finale.png` showed the same bootstrap artwork despite its complete native game receipt. This establishes an additional rendering/capture failure beyond control routing; readiness flags alone cannot close the visual gate.

The recorded `intro.webm` is 1920×1080 VP9 at a reported 60 fps, 16.15 seconds long. An extracted frame at 10 seconds also shows bootstrap artwork. Its Vorbis stream must be omitted from the delivered MP4, as required by the muted capture workflow. No real photo appears in that material.
