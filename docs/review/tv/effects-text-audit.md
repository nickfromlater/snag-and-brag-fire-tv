# Effects and text audit — 2026-10-14

The TV stage now gives backdrops, effects, scene content, HUD, host/ticker and
menus explicit container paint order on both targets. Native particle worklets attach after
the bounded audio bank finishes initialization to avoid a reproduced cold-start
stall; all effects remain enabled during gameplay. Particles, rings, trails, flash and
the stripe wipe sit beneath titles, banners, names and scores. Brag's opaque
panels/dots remain below the effect field, so celebratory particles can be seen
around its foreground text. Flying score badges render after the particle field
but remain below the scene/HUD. Old particles clear when a new scene starts.
Native particle planning yields after four sampled frames so speech/network
callbacks can run during large bursts. Animation starts at the elapsed position
in the same 30 Hz plan; particle geometry, recipes and lifetime remain unchanged.

| Scene/layer | Audited effects and protected copy | Result |
| --- | --- | --- |
| Lobby | Parade, join confetti; logo, join card, room code, chips | Foreground cards/logo and HUD are above effects. |
| Intro | Title/count slam rings, reel bulbs, reveal confetti, wipe/flash; kicker, title, prompt, count | The foreground scene container is above the global effects. Bulbs remain around the measured reel frame. |
| Hunt/glow-up | Snag bursts, camera flash, timer texture; prompt, team labels, CAM/caption, speed/ready/time chips | Flash moved inside each camera's image frame below its CAM/caption labels; team names stay above the card. Burst lettering is above its own starburst. |
| Pixel Judge | Scan beam/mask/shimmer, flip/ring/confetti; team names, find names, match/speed scores, winner banner | Scan treatment remains clipped to the image region; cards/banner and their text paint above global effects. |
| Brag-Off | Panel sweep/dots/seam, mash sparks, knockout confetti/rings; fighter/team names, bubbles, combo, BRAGGED!, scores | Backdrop at the bottom, then effects, then fighters/bubbles/labels. Host/HUD are above all scene effects. |
| Showstopper | Spotlights, pedestal rings, holography, vote flights/confetti; find/team/brag/voter labels, ribbon | Holographic sticker is an isolated surface beneath the pedestal's text. Global particles/flight trails are below ribbon/labels. |
| Standings | Bar stripes, racing/reorder confetti and score flights; rank/team/score/delta/overtake labels | Row/text foreground is above global particles; stripes stay inside their bar. |
| Champion | Fireworks, confetti, crown/object rings, surface sheen/holography; champion/kicker/podium scores/object labels | Burst origins move beside the actual Lilita name width. Cards/name and their copy paint above all global effects; sheen stays beneath card text. |
| Host/HUD/ticker/menu | Reactions and every global effect; host speech/name, chips, room code, ticker, focus/menu copy | Separate foreground layers; reaction bounds avoid the host bubble and fade out before reaching the HUD. |

The reaction lane uses the reference bubble's right edge (226 + 720 = 946) and
the 96-pixel HUD. It reserves space for the original ±30 px/s drift, 40–60 px
icons, rotation, 1.2× pop and 16 px wobble. Only the initial horizontal location
and visible lifetime change; vertical velocity, gravity, colors, icon geometry,
pop and wobble remain the reference recipe. Fireworks retain their original
vertical coordinate, burst count/speed/life, sound, rocket timing and horizontal
launch offset except for an 8-pixel viewport-edge clamp.

These are intentional departures from the mockup's full-width reactions,
centered fireworks and effects painted over content, required by the polish
brief's text-legibility rule. No palette, fonts, copy, scoring, phase timing,
shared cue/protocol shape or bot behavior changed by the effects audit. Native
release testing also required a separate bounded audio preparation window and
longer mandatory speech/read holds; that timing departure is recorded in the
release review.

The requested [five-moment before/after sheet](effects-text-before-after.png)
compares title slam, Pixel Judge banner, Brag knockout, Showstopper holography
and champion fireworks. All captures use the real web stage at normal speed,
seed 1, three bots, mock Polly and muted system Chrome. The columns come from
separate live runs, so particle randomness, speech progress and generated room
codes can differ. The Brag capture is taken after the BRAGGED! slam begins;
its separate capture receipts record that later payoff beat.

Raw synthetic screenshots and full-game receipts are under
[polish1/effects](polish1/effects/before.json). Reproduce with:

```sh
TV_WEB_URL=http://127.0.0.1:5187 node tv/tooling/verify-effects-text.mjs before
TV_WEB_URL=http://127.0.0.1:5187 node tv/tooling/verify-effects-text.mjs after
```

The before command requires the pre-change TV build; the after command uses the
current source. `TV_EFFECTS_CASE=brag-knockout` captures only that later beat.
The geometry tests sweep all reference reaction speed/drift endpoints and
largest icon bounds at 60 samples/second, and check firework origins beside
short/long names without changing their burst recipe or timing.
