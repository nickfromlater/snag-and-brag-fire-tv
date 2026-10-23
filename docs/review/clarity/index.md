# TV clarity · lead review 2 · October 20, 2026

**READY FOR LEAD REVIEW 2.** Implements [lead notes 1](lead-notes-1.md) and the binding [TV direction](../../design/tv-direction.md). The direction was committed unchanged in `77ffa03`. Nick's TV photo was inspected at `../../snag-and-brag/docs/review/stick-vs-mockup/nick-finale-tv-photo-20261020.jpg`; no copy of that photo or any player photo was added here.

**Web evidence, not stick acceptance.** All twenty states render at 1920 × 1080. The layout audit runs each state with four teams, two teams, and both counts with maximum-length synthetic names: **80 checks, 0 overflows, 0 clipping, 0 text/crown/avatar/HUD/host intersections, 0 gap, title-safe, hierarchy or block-limit failures.** [Full geometry](after/geometry.json) · [console receipt](geometry-check.txt) · [capture receipt](after/receipt.json). The audit also proves it rejects injected overflow, text intersections and crown intersections.

The audit measures each visible text label separately, including SVG glyph bounds and number-input ink. It enforces 64 px title-safe and 24 px text gaps with 1 px rounding tolerance. Wholly offscreen reel cards are excluded; a partly clipped visible label fails. Text blocks mean coherent panels or boards: the wordmark is one Hero, and a team board is one block containing individually checked identities/results. Every state has one Hero group, one or two Primary groups and at most four scene text blocks. HUD/host/ticker are outside that quota; HUD text, the host, crowns and team avatars remain collision obstacles. An avatar's own initials may sit inside that avatar. Global HUD/ticker typography is outside this scene-layout audit.

The Mac is muted. All captures use the existing deterministic synthetic showcase and reference object art. The [unchanged baseline](before/receipt.json) remains archived. Root comparisons put **approved mockup / original baseline / review 2** side by side. Every `*-10ft.png` is 480 × 270; `*-compare-10ft.png` is the comparison at 25%. [Exact reference mapping](images.json).

| State | Review 2 change | Evidence |
| --- | --- | --- |
| Lobby | Active QR is **342 px**, with a **30 px white quiet zone**; raw URL is one Chrome line. SCAN TO JOIN and the four-character code are Primary. Wordmark and tagline have separate space. | [Comparison](01-lobby-compare.png) · [10 ft](01-lobby-10ft.png) |
| Color Rush title | One Hero title; the rule is Primary on an ink panel. Larger vertical gaps contain the full outlined lettering. | [Comparison](02-round-title-compare.png) · [10 ft](02-round-title-10ft.png) |
| Prompt reel | One Hero prompt word, Primary upper instruction and Secondary final line, spaced inside the existing reel. | [Comparison](03-prompt-reel-compare.png) · [10 ft](03-prompt-reel-10ft.png) |
| Countdown | One Hero numeral; Primary GET READY / GO FIND IT below it. Existing countdown timing remains. | [Comparison](04-countdown-compare.png) · [10 ft](04-countdown-10ft.png) |
| Hunt | Hero prompt, Primary timer, full-size wrapping team names. CAM labels are removed from the enlarged view; HUNTING is a separate Chrome chip. Flavor captions such as “Eyeing the spatula?” are restored at Secondary size, with complete copy capped at 22 characters. Two-team feeds are centered. | [Comparison](05-hunt-compare.png) · [10 ft](05-hunt-10ft.png) |
| Snag lock | SNAGGED remains a separate status; the human caption keeps its personality. Full team identity remains clear above it. | [Comparison](06-snagged-compare.png) · [10 ft](06-snagged-10ft.png) |
| Glow-up | ADD TWO EYES is the Hero; phone action and timer stay clear. Placeholder question marks, READY, medals and the first-snag bonus occupy separate space. | [Comparison](07-glow-up-compare.png) · [10 ft](07-glow-up-10ft.png) |
| Pixel Judge scan | Purple static base raster. Original scan/photo coordinates are retained in a static scale. Active match percentage is the Hero; each card has art, stage name, a concise object line when space allows, one small points chip and a contained bar. | [Comparison](08-pixel-judge-compare.png) · [10 ft](08-pixel-judge-10ft.png) |
| Pixel Judge winner | MOST PINK sits above the cards. Winner lifts, scales about 1.08, carries the team-color outline and crown. Full team name stays on its card; the banner no longer repeats or clips it. Speed detail is removed here. | [Comparison](09-judge-winner-compare.png) · [10 ft](09-judge-winner-10ft.png) |
| Standings | Hero heading, Primary next-round action, Secondary names/ranks/totals. Full names wrap without squeezing. Tracks reserve a separate delta column. | [Comparison](10-standings-compare.png) · [10 ft](10-standings-10ft.png) |
| Brag lines | Host and object brag copy retained. Two Primary object names sit on ink panels above full team identities; VS is the single Hero. | [Comparison](11-brag-lines-compare.png) · [10 ft](11-brag-lines-10ft.png) |
| Brag mash | MASH is the Hero; TAP YOUR SIDE / ON YOUR PHONE is Primary. Object names become Secondary while action matters. VS clears during mash. Combo and identities leave the instruction and host clear. | [Comparison](12-brag-mash-compare.png) · [10 ft](12-brag-mash-10ft.png) |
| Knockout | Point award is the Hero. Winning team, object identity and numerical mash advantage occupy separate regions. Crown/identity and host collisions are checked. | [Comparison](13-brag-knockout-compare.png) · [10 ft](13-brag-knockout-10ft.png) |
| Showstopper vote | Hero timer, Primary phone instruction, calm board of art, full team identities and Secondary vote totals. Secondary stage-name/brag lines leave the board during voting. | [Comparison](14-show-vote-compare.png) · [10 ft](14-show-vote-10ft.png) |
| Showstopper winner | Hero point award with Primary full winner name. Result panel holds still; winner pedestal keeps its existing scale treatment and crown. Each team has vote count and award on one line, with correct singular “vote.” | [Comparison](15-show-winner-compare.png) · [10 ft](15-show-winner-10ft.png) |
| Finale | Static gold base. Hero champion name, full-name plates **under** blocks, points **inside**, three colored two-letter avatars plus crown, one-line fourth place. Compact Object of the Night and Primary bottom-right Play again on your phone. Margin pill stays clear of the trophy. Closing host line retained. | [Comparison](16-finale-compare.png) · [10 ft](16-finale-10ft.png) |
| Brag-Off title | Same Hero / Primary hierarchy, using the real round-two rule. | [Comparison](17-round-2-title-compare.png) · [10 ft](17-round-2-title-10ft.png) |
| Showstopper title | Same hierarchy and safe spacing, using the real final-round rule. | [Comparison](18-round-3-title-compare.png) · [10 ft](18-round-3-title-10ft.png) |
| Brag-Off hunt | Full PIRATE prompt; same readable identity/caption/status separation. | [Comparison](19-round-2-hunt-compare.png) · [10 ft](19-round-2-hunt-10ft.png) |
| Showstopper hunt | Full WEIRDEST prompt; same layout. | [Comparison](20-round-3-hunt-compare.png) · [10 ft](20-round-3-hunt-10ft.png) |

## Long-name and team-count evidence

All sixty additional variant couch views are in [after/variants](after/variants). Key frames: [four-team long finale](after/variants/long-four-16-finale-10ft.png), [two-team long judge](after/variants/long-two-09-judge-winner-10ft.png), [long mash](after/variants/long-four-12-brag-mash-10ft.png), [long knockout](after/variants/long-four-13-brag-knockout-10ft.png). Team fixtures include twenty W/M characters; object fixtures use eighteen W characters. Full scene names wrap at their declared tier without ellipses or horizontal compression.

## Departures and integration

The binding direction overrides the denser mockup. The finale removes the redundant HUD strip: the podium/4th-place row already shows every team's full identity and score, and the champion can now remain Hero size even at twenty wide characters. Its hero and fourth-place row hold still. The Showstopper result panel also holds still so its long top-right award cannot rotate into the HUD. Standings ranks/totals are Secondary, reserving Primary for the next action. Brag objects are smaller to leave room for full names. Voting/results omit secondary object-name/brag lines; those remain on the phone and in host copy. The judge omits its object line for long names and all speed subcopy. The compact Object of the Night drops its extra object line for an unusually long stage name. No extra winner-label stack is added.

Small additive stage APIs: `StrokedText.contain` includes the existing glyph/shadow extent in its box without moving or scaling glyphs; `QR.quietZone`; `CountdownDial.numberSize`; `Reel.spacious`; `Background.palette`; and accessibility/test metadata for the geometry audit. `Background.palette` selects the **existing** purple/gold base raster directly, with no animated child or frame subscription in those scenes. Default animated/video backdrop machinery and particle choreography remain the stick worker's integration area. [Motion budget](motion-budget.json): seven fewer scene Motion tags and one fewer Sheen; no added animated values, subscriptions or timers.

## Validation and remaining acceptance

- `pnpm test`: **517 passed**, including TV lint. [Output](tests.txt).
- `pnpm typecheck`: **pass**, full workspace. [Output](typecheck.txt).
- 80 held 1080p states: **0 audit issues / 0 browser exceptions**; injected-fault guard passes.
- Normal-speed synthetic web playthrough: [receipt](live/receipt.json). A prior development run was interrupted by local hot refresh during source work; [interruption record](live/interrupted.json). Only the clean final run is acceptance evidence for web flow.
- Approved HTML mockup was played end to end at normal speed, muted, through all rounds and the phone end card: [receipt](mockup-playthrough.json).
- **Still pending the lead/stick worker:** physical 0.5 s / 2 s / settled captures and measured FPS; transient particle clearing, backdrop artifacts, native lifecycle and rematch acceptance. Web layout checks and couch proxies do not pass section 6 of the TV direction.

Reproduce with `pnpm --filter tv dev`, then `node tv/tooling/review-clarity.mjs after` and `node tv/tooling/compose-clarity.mjs`. Run `node tv/tooling/review-clarity-live.mjs` against unchanged source for the normal-speed web flow. Preserve `before/`.
