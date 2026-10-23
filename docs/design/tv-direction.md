# TV design direction (lead, Oct 20). Binding for every TV change.

Nick, after seeing the build on his TV: "messy", "looks frozen", "clarity, especially on the TV",
"let's make this a AAA experience". The mockup sets the look. These rules decide how it survives
a real TV on a 1 GB stick. When the mockup and these rules disagree, these rules win; log the
departure in the scene's review index.

## 1. Calm stage, loud moments
- The backdrop is a **quiet** surface: low contrast, nothing that reads as a shape competing with
  content. No outlines, rings or arcs drawn over the stage. A glow is a soft pre-rendered raster or
  nothing.
- Each payoff (snag lock, judge winner, knockout, show winner, finale) gets **one** celebration beat:
  a burst that lasts 1.5–2.5 s and then **fully clears**. Confetti or particles never linger, never
  freeze and never cover text. At most about 40 moving pieces, or one pre-rendered raster on one
  native-driver transform.
- **Smooth or still.** Anything that might stutter on the stick doesn't move. A still frame looks
  intentional; a frozen animation looks broken.
- At most one ambient motion per scene (a slow shimmer, the ticker). Everything else holds.

## 2. Hierarchy you can read from the couch (1080p px)
| Tier | Size | Use | Per scene |
|---|---|---|---|
| Hero | ≥ 120 | the one thing that matters now: the prompt word, the timer, the winner's name | exactly 1 |
| Primary | 64–96 | the instruction or result line ("Vote on your phone", "+129") | 1–2 |
| Secondary | 36–48 | team names, object names, the host bubble | as needed |
| Chrome | ≥ 28 | HUD scores, room code, ticker; never game-critical | fixed |
Beyond the HUD, the host bubble and the ticker, a scene shows **no more than four text blocks**. When something
doesn't fit, cut the secondary text. Never shrink below its tier, and never overlap.

## 3. Space and safety
- Title-safe margin: keep game-critical content 64 px from every edge (TVs overscan).
- Minimum 24 px clear gap between any two text-bearing elements. Zero overlaps or clipping, enforced by
  the clarity check.
- Winners stand out by **treatment** (scale about 1.08, team-color glow outline, the crown), not extra text.

## 4. Identity and color
- Every team is always its color, its two-letter badge and its full name, the same everywhere.
- Each moment has a mood tint matching the mockup: lobby blue, judge purple, finale warm gold. The tint is
  static, applied once; it lives in the backdrop raster and costs no frames.
- Text sits on ink or cream panels, never directly on busy art.

## 5. Finale (target)
Gold backdrop, calm after a 2 s confetti burst. Champion name as the hero. The podium shows the three
avatars with a full-name plate **under** each block (no collisions with the numbers). Points are inside
the blocks. 4th place sits on one line. Object of the Night is a compact card: art, name, one line.
The host bubble says the closing line. "Play again on your phone" is a Primary-tier chip, bottom right.

## 6. Acceptance
A scene passes only when the lead has seen it **on the stick** (capture or Nick's photo), at 0.5 s, 2 s and
settled, with fps measured. Web renders are for iterating, not for passing.
