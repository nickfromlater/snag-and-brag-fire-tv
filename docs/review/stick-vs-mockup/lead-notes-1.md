# Lead notes, round 1: Nick's photo of the finale on his TV (Oct 20)

`nick-finale-tv-photo-20261020.jpg` is Nick's phone photo of the current build's finale on the stick.
His words: "this looks very messy and like it's frozen." **This is now your top priority, above
everything else in the brief except not bricking the device session.**

What's wrong:
1. **Large white circles and arcs** cover the whole stage (around the trophy, podium and title). That is a
   broken render: probably spotlight/burst/glow shapes whose gradient or fill doesn't survive on Vega
   SVG, so they draw as bare white strokes. Find which primitive draws them, and fix or remove it on
   native. Then check every other scene for the same artifact (judge burst, show winner, knockout).
2. **Confetti is frozen** mid-air, hundreds of pieces covering the scene. That's the Vega rule again:
   too many independently animated nodes make frames stop. Replace it with a short celebratory burst:
   at most about 40 pieces, or a single pre-rendered confetti raster moved by one native-driver
   transform, that falls through and **clears within about 2.5 s**, then the scene goes calm. If it can't
   animate smoothly, show no confetti rather than frozen confetti.
3. **Too busy.** After the burst, the champion name, podium and points must sit on a calm backdrop.
   The host speech bubble is missing in this photo, so check that host lines render on the finale.
   (Name plates, 4th place and Object of the Night layout come from the clarity worker's branch; don't
   redo those.)

Verify on the stick: capture the finale at t=0.5 s, 2 s, 4 s and 8 s, plus the fps across the finale,
and add them to `docs/review/stick-vs-mockup/` and index.md. Apply the same capture to every other
celebration moment. Then continue the brief.
