# Lead notes, round 3: freezes are now priority one (Oct 20, Nick watching the TV)

Nick, watching the stick: "we need that kind of fps across it and it doesn't seem like that... Lots of
freezes still." The 59.9 fps lobby sample doesn't represent the game. **Goal: smooth across a whole
game, with no visible freeze anywhere.** Everything else waits, including captures for design review.

1. **Measure the whole game, per scene.** Run a full three-round hosted game on the stick with frame
   telemetry. For each scene and phase record fps, p95 frame time, max gap, every gap over 100 ms with
   its timestamp, and what happened at that moment (scene mount, image decode, audio load or decode,
   Polly fetch, relay message, GC, a JS timer). Put a table in `docs/review/stick-vs-mockup/index.md`.
2. **Attribute and fix, biggest freeze first.** Likely suspects: scene transitions that mount large trees
   in one frame (pre-mount or stage them), image decodes on the UI thread at reveal (preload or decode
   ahead of time), audio player creation or decoding (see 3), Polly network work on the JS thread, and
   remaining per-frame React state (anything calling setState on a frame clock: the MotionNumber,
   PixelShimmer, particle field and timers). Apply the Vega rule: one clock, few nodes, native-driver
   animation, nothing re-rendering React per frame.
3. **Audio errors:** the last game trace (`/tmp/snag-calm-fps-game-20261020.json`) shows `code: 3` errors
   for every Polly AAC line and every OGG music track (music-lobby, music-hunt, music-tension, music-urgent,
   music-brag). Find out why. A failing player that retries or blocks can cause stalls, and a silent host
   is a product bug either way.
4. Merge `w/clarity` at `314553b` or later before building. It includes my `CelebrationBurst` (two
   pre-rendered confetti layers, one native-driver translate each). Measure the payoff moments with
   it on, and if it costs frames, tell me the numbers; don't redesign it.
5. Report after each fix: before/after fps and max gap per scene. A freeze is fixed only when the
   stick's numbers say so. Commit at each verified gain. Then resume the capture set.

## Lead's code read: prime suspects (verify with numbers, then fix)
- **Host speech bubble, `tv/src/stage/host.tsx:57-75`.** While Sir Socksworth talks (most of the game), a
  frame-clock callback calls `setCharacters` every two characters (about every 34 ms). That re-renders the
  bubble, and possibly the whole Host, about 30 times a second. Native also pushes jaw/lid/mouth to `face` on
  nearly every frame. Fix: reveal the text with a native-driver mask or clip (one Animated value timed to the
  line's duration, or Polly marks sampled at most about 8 Hz), and drive the mouth with precomputed viseme
  keyframes on one native-driver timeline per line instead of per-frame JS writes.
- **HUD `RollingNumber`, `tv/src/stage/hud.tsx:20`.** `setScore` runs at 16 ms intervals during score rolls,
  times four chips, right at standings and payoff moments. Fix: step it at most about 10 times a second, or
  swap to the final number with a native-driver pop.
- **`MotionNumber` (`instruments.tsx:156`, 16 ms setState) and `RollingText` (`rolling-text.tsx:67`, 16 ms),**
  plus `PixelShimmer` and `parade.native.tsx` writing a shared value every 30 ms. Same treatment.
- **Audio polling, `audio.ts:277` (a 5 ms setInterval) and `:298` (20 ms).** Confirm these never run in
  production play; if they do, they're a CPU hog, worse while players fail with code 3.

## Split (update): the lead fixes the host and HUD personally
Nick asked the lead to fix freezes hands-on too. **The lead owns `tv/src/stage/host.tsx` and `hud.tsx`
(RollingNumber)** on `w/clarity`. Don't edit those two files; merge `w/clarity` to get the fixes, and
measure them. You own measurement, `instruments.tsx` (MotionNumber, PixelShimmer), `rolling-text.tsx`,
`parade.native.tsx`, audio (code 3 and polling), scene-mount and decode stalls, and everything else.
If you already changed host/hud, keep those changes off your branch and tell me what you found.
