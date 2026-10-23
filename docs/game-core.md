# Game core and headless TV

The TV owns the game. `shared/src/game/core.ts` contains `GameHost`, a pure TypeScript
host driven by one injected clock and RNG. It consumes protocol version 1, including
the optional Pixel Judge mask. The relay only transports messages, keeps memory photos, and
brokers AI. `tvsim` is a Node adapter using the same host that the native TV will use.

## Run

Use Node 24 and pnpm 10+ (verified here with Node 24.20.0 / pnpm 12.10.1).
`pnpm-workspace.yaml` approves only esbuild's dependency build script.

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
pnpm install
pnpm --filter tvsim start -- --relay ws://localhost:8787/ws --bots
```

The real relay must be running for phones to join. The CLI connects with
`hello {role:'tv', proto:1}`, prints its actual join URL and room code, and addresses
each phone by client id. `--bots` fills the room after the first phone joins. Use
`--fast` for a 10x smoke run and `--seed <integer>` for seeded bot choices. The adapter
maps fast-mode deadlines, durations and incoming relay stamps between the simulation
axis and actual relay time, so phone countdowns still agree with the accelerated host.
Converted wire deadlines are rounded to integer milliseconds: clock-sync averages and
fast-mode conversion can produce fractions, which the relay's strict schema rejects.
The simulation clock and game phase timings retain their original precision.

The core's normal clock is always relay time. The fast adapter's internal accelerated
axis is only for simulator smoke tests. The virtual-clock tests remain fully
deterministic; a real-clock CLI transcript has ordinary scheduling jitter.

For a standalone run before the relay and phone packages are merged:

```sh
pnpm --filter tvsim start -- --loopback --demo --bots --fast
```

`--demo` implies bots and drives one synthetic phone over protocol envelopes. It
generates a 720px JPEG in memory at each shutter, sends binary frames, glows, mashes,
votes and reacts. The loopback is a test relay, with no network listener or production
authentication. Its `loopback://LOOP` URL is diagnostic, not a phone join page. It
releases photos and pending AI work when the demo closes the room.

TTY remote: Enter = Select, Escape = Back, Space = Play/Pause, `f` = Fast-forward,
arrows = focus, Ctrl-C = close room and release memory. A TV socket disconnect pauses
the game; reconnect uses the TV key held in memory. An existing user pause survives a
socket reconnect. Nothing logs photo bytes, thumbnail bytes, photo URLs or room keys.
Encoded masks are never logged either; the transcript prints only their dimensions,
byte length and on-cell count when a real Color Rush find reaches the TV.

For the real relay/phone/mask e2e (AWS modes are explicitly mocked):

```sh
pnpm --filter phone build
AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
pnpm --filter tvsim start -- --relay ws://localhost:8787/ws
# Copy the join URL printed by tvsim; the phone script enables bots and starts.
node phone/dev/e2e-play.mjs "http://localhost:8787/?r=<ROOM>"
```

The e2e asserts a complete three-round game, a valid 72-byte Color Rush mask on a
TV-originated find screen, and absent masks in the other rounds. It prints only numeric
mask receipts. Screenshots are off by default; an optional output directory captures
screens with camera pixels and photo stickers redacted. Photos remain in memory.

## Native adapter

Import from `@snag/shared`:

```ts
import { GameHost, seededRng } from '@snag/shared';
import type { Clock, CueEvent, TvView } from '@snag/shared';

const game = new GameHost({
  clock, // Clock.now() = synced relay milliseconds; timers belong to this adapter
  rng: seededRng(roomSeed),
  room: { code, joinUrl },
  send: (cid, m) => relay.send({ t: 'to', to: [cid], m }),
  cue: (event: CueEvent) => renderer.cue(event),
  view: (snapshot: TvView) => renderer.draw(snapshot),
});
// Text relay input: peer / from / ai
game.handle(message);
// Binary thumb header supplies cid; bytes stay in memory.
game.thumbnail(cid, jpeg);
game.remote('select'); // also back, playpause, ff, up/down/left/right
game.dispose(); // cancel all injected tasks and release memory images
```

The constructor emits the lobby immediately. Install output callbacks before creating
it. `receive(cid, PhoneToTv | SnagArrived, relayAt?)`, `peer(cid, up)` and
`ai(cid, photoId, AiRead)` are also available independently. `getView()` and
`getScreen(cid)` return copies; consumers cannot mutate the host's state. The core
contains no global timers, wall-clock APIs, DOM, Node APIs or `Math.random()` calls.

Every phone screen is a complete `ScreenMsg` with a monotonically increasing sequence.
The first phone is the host, taken colors are sent to waiting join screens, and
reconnects get a fresh current screen. Scores roll only when point flights land.
Pausing freezes phase timers, bot actions, host typing, AI fallback and pending awards;
resume shifts deadlines. A disconnected phone remains a team and follows the same
timer defaults. AI labels/tie scores may arrive late; sent stage names/brags are retained.

TV host copy names the leader, last team and champion. Standings choose distinct copy
by round, while phone screens retain personal "you" wording. Trait prompt speech includes
the complete condition, excluding editorial asides. An opening greeting is skipped if a
team has already joined, and identical adjacent host lines are suppressed.

AI arrival does not itself trigger speech. Color Rush considers a quip after that
find's score lands. Brag-Off considers only the winner's quip after the knockout line
finishes typing, inside its existing 900ms read hold. Showstopper considers at most the
first two real-photo finds in runway order, at landing. Quip typing and hold must fit
before the next phase/scripted host line, or the quip is dropped. Phase changes cancel
optional speech. Quips never run over brag bubbles or during votes, and never extend
phase timing. See the core review entry in `DECISIONS.md` for the museum tagline exception.

`TvView` contains scene/phase, teams, current prompt, deadline/total, feed states,
history, per-scene content, host state, settings, menu and hype. The `motion` map
contains declarative animation stacks with elapsed time, start time, duration and
frames. A renderer attaching late draws content and evaluates these stacks directly,
without replaying cue events. Paused elapsed time remains fixed. Active scene wipes
carry swap/end times. Cached thumbnails in `feeds[].jpeg` are memory-only: never
serialize a view to a log, file, screenshot fixture or network store.

### Team slots

In the lobby (`round === -1`), `TvView.teams` has four entries in seat order: joined
teams followed by neutral slots. A slot has `joined: false`, name `Waiting…`, an empty
monogram, paper color, zero score, and `bot: false` / `connected: false`. Do not derive
initials for empty slots. `TeamView.joined` is optional; absence means a joined team,
preserving existing version-1 consumers. Bot names and monograms appear only after
bots are enabled, and disappear again if bots are disabled in the lobby.

From the first title through the finale, `TvView.teams` contains only joined teams.
Render these entries directly; never pad a live HUD back to four. A disconnected
joined team still occupies its seat. Feeds, standings, brackets and rankings also
refer only to joined teams. Phone `ScreenMsg.teams` always contains joined teams,
including in the lobby; neutral slots are TV presentation data. Ending the game
restores the lobby's four slots; a rematch keeps only its existing joined teams.

### Pixel Judge mask

`BinaryHeader` (`t: 'snag'`), `SnagArrived`, and `FindView` have an optional `mask`
string. It is present only for real Color Rush photos; bots, missed finds, other
rounds and older clients omit it. `PROTO` remains 1. The mask survives AI/glow updates,
feed snapshots, find cues, judge cards, history and end-card finds.

The phone center-crops to a 720px square JPEG and judges its 480px downscale. Both
`judgePhoto`'s result and `judgeMask(rgba, size, targetHex, cells = 24)` identify the
same closest 20% of samples: every fourth pixel in the flattened center-60% region,
ranked by CIELAB distance, with equal distances ordered by row-major pixel index.
Scoring and the reported color are unchanged. `judgePhoto` computes the default mask
in the same sampling/sort pass; no target means no mask.

The 24×24 grid covers the **whole square photo**. A cell is on if it contains at least
one selected sample. Cells disjoint from the center sample stay off; the boundary
cells may overlap the sample edge. For cell `(x,y)`, bit index is `y * 24 + x`, byte is
`index >>> 3`, and bit is `1 << (index & 7)` (least significant bit first). There are
72 bytes, encoded as exactly 96 standard-base64 characters without padding. Alternate
`cells` values are available for local use; the wire format is always 24×24.

The relay accepts only that exact length and base64 alphabet. It drops an invalid
optional mask while accepting an otherwise valid snag, and removes masks from other
rounds. The core also ignores malformed/non-Color-Rush masks. During a real photo's
scan, the renderer can decode `card.find.mask` and light its on-cells over the photo;
an absent mask retains the existing scan effect. TV rendering is a separate worker.

## Rendering contract

`CueEvent` wraps the `TvCue` union with `seq`, absolute `at`, and protocol round
(-1 lobby, 0..2 rounds, 3 finale). Draw a snapshot first, then consume later cue
events once in sequence order. Keep native animation/audio playback on the renderer;
the core schedules game decisions and beats, not render frames. Pause/resume must
freeze/resume native animations and audio together with the core's pause cue.

All positions use the 1280x720 stage. An anchor `{target, dx, dy}` resolves the center
of a semantic element, then offsets it. Optional `x`/`y` override an axis (for example
a winner's card x with confetti at y=300). An anchor `{x,y}` is absolute. Use the
reference CSS/body for static placement; it is not an alternative layout proposal.

`slam` carries its exact squash/stretch frames plus a half-duration impact beat.
At that beat, honor the `sound`, shake, ring and eyes fields. These integrated effects
must not be played twice. The same applies to reel ticks, host voice cadence, meter
ticks, score rolls and firework boom fields. Explicit `sfx` cues are separate sounds.
Native reduced motion can reduce particles and suppress shake/zoom while preserving
phase timing and score decisions.

`SPRING_CURVES` exports the mockup's 240Hz spring integrator, 72 samples and settling
durations for pop/wobble/soft/drop/snap. `PARTICLES` and `POINT_FLIGHT` export the exact
particle and point-arc recipes, also carried on their cues. `BRAG_SEAM` exports the
zigzag path. `PODIUMS` exports the original rank positions, block sizes and badge sizes.
For the champion name, use `round(clamp(1300/max(8,name.length),58,104))` as in game.js.
For standings, lane height is 78; bar percentages are clamped to 5..95 using
`max(1,leaderScore)*1.04` as the denominator.

Target vocabulary (ids after `:` are team ids, except `vote-badge` also names its voter):

| Targets | Native element |
|---|---|
| `lobby.snag/ampersand/brag/tagline/join-card` | Logo parts and join card |
| `intro.kicker/title/sub/reel/arrow-left/arrow-right/bulbs/count` | Intro and reel elements |
| `chip:<team>`, `host`, `wipe` | Persistent HUD, puppet and stripe wipe |
| `feed-flash:<team>`, `slot:<team>`, `slot-card:<team>` | Hunt feed flash, tile and card back |
| `snag-burst:<team>`, `first-snag:<team>`, `ready:<team>`, `hunt.time` | Hunt stamps, ribbons and TIME toast |
| `phone:<team>` | Renderer-defined offstage phone origin for a sticker flight |
| `judge-card[-inner]:<team>`, `judge-beam/bar/swatch:<team>` | Pixel Judge card, scan and result elements |
| `judge.banner/crown` | Color winner banner and crown |
| `brag.panel-left/panel-right/seam/fighter-left/fighter-right/vs` | Bracket panels, seam and fighters |
| `brag.line-left/line-right/tug/count/combo/knob/sweep/ko/bye` | Brag bubbles, mash UI, knockout or bye |
| `brag.combo:<team>` | Per-phone tap-combo burst on its side |
| `show-spot:<team>`, `show-find:<team>`, `pedestal:<team>` | Spotlight, sticker and pedestal |
| `vote-badge:<find team>:<voter team>` | A voter's landing badge under a find |
| `show.vote-timer/crown/ribbon` | Vote timer and Showstopper win elements |
| `stand.title/kicker`, `lane[-fill/-rider/-score/-badge/-delta]:<team>` | Standings rows and score races |
| `overtake:<team>` | Overtake sticker on the advancing row |
| `podium:<rank>`, `podium-badge:<team>` | Finale block and badge |
| `champ.crown/name/kicker/trophy/object/fourth` | Finale crowns, text, trophy, find and fourth-place plate |

Delayed scene effects should be cancelled when their target scene leaves. Global HUD
point awards remain authoritative even if their animation is skipped. The core settles
any outstanding awards before standings when a reveal is fast-forwarded. For a sticker
flight, resolve the source and slot geometries, cap its source size to 70..160 as in the
mockup, and derive end scale from the slot's smaller dimension ×.8 / source size, with
a minimum of .3. Use an offstage bottom origin for a native TV, since physical phones
have no DOM coordinates in the TV stage.

## TvCue union

The full TypeScript fields are in `shared/src/game/types.ts`.

| Discriminant | Meaning |
|---|---|
| `scene` | Stripe wipe, content swap at 470ms, finish at 1000ms |
| `phase` | Current game phase and authoritative timer |
| `music` | Switch the synthesized music mood |
| `background` | Switch the stage palette/mood |
| `sfx` | Play a named effect, arguments and optional delay |
| `host` | Type the exact host line with brows, hold and voice cadence |
| `host-finish` | Complete the host's current typed line |
| `host-hide` | Fade the speech bubble |
| `host-brow` | Set the puppet's brow pose |
| `host-react` | Puppet glee/shock with hop or shake motion |
| `slam` | Squash/stretch entrance with timed impact effects |
| `pop` | Small sticker entrance using the pop spring |
| `animate` | Explicit keyframes, spring/easing, delay, fill and repetitions |
| `shake` | Shake the TV stage |
| `flash` | Camera/show flash overlay |
| `punch` | Brief zoom of the world |
| `eyes` | Kick the sticker eyes' damped pendulums |
| `confetti` | Confetti burst with the original particle recipe |
| `stars` | Radial star burst |
| `ring` | Expanding dust/celebration ring |
| `firework` | Rocket launch and delayed spark explosion/boom |
| `reel` | Sixteen prompt cards, quartic spin and reel tick/bulb beats |
| `count` | 3/2/1, SNAG or MASH display motion |
| `feed` | Feed state/label and thumbnail presence, never bytes |
| `find` | Snag or zero-point missed-find card and snag order |
| `card-flip` | Pixel Judge card's 620ms three-dimensional flip |
| `scan` | Scan beam and jittering 10x10 pixel overlay |
| `meter` | Judge percentage roll, speed bonus and scan ticks |
| `fly-points` | Point arc/trail into the scoreboard chip |
| `sticker-flight` | Phone-to-slot sticker toss with rotation, arc and eyes |
| `parade` | Lobby object parade and staggered animation offsets |
| `score` | Landed award, total roll and HUD leaders |
| `roll` | Standings row's numeric score roll |
| `match` | Bracket fighters, stakes, final/semi or bye |
| `mash` | Tug position, tap counts, seam and fighter scales |
| `mash-tap` | One batched tap/combo feedback event |
| `mash-spark` | Repeated star spray at the tug knob |
| `vote` | Voter badge flies from its chip to a pedestal |
| `hologram` | Winning Showstopper find becomes holographic |
| `reaction` | Floating star/heart/flame/tomato and hype value |
| `hype` | Hype meter decay/update |
| `menu` | Remote menu, options, focus and yellow focus color |
| `pause` | Freeze/resume presentation with moved timer deadline |
| `settings` | Sound/music enabled flags |
| `game-ended` | Confirmed end; return to lobby and clear finds |
| `complete` | All three rounds and finale host lines finished |

## Verification and decisions

`pnpm test` and `pnpm typecheck` run at the root. Tests cover 4-team scripted-phone+
bot games, seeded reproducibility, 2/3-team brackets, misses/byes, disconnected timer
defaults, pause (including point flights and motion), skip of every phase, confirmed
end, rematch, AI before/after sending or absent, color reservations, host authority,
Showstopper ties, score accounting, byte privacy and real `ws` handshake/routing.
Host regressions cover shared-TV naming, all six spoken trait prompts, greeting order,
round-selected variety, winner-only quips, score-landing placement, runway limits,
late AI during brag/vote, bounded speech queues, delayed callbacks and unchanged phase
timings with short/overlong quips.
The simulator test runs the full protocol-driven JPEG demo under virtual timers.
Mask tests verify exact red-patch cells, no cells outside the sample, deterministic
ties, the 480px phone path, malformed-field dropping, replay after TV disconnect,
find-screen relay validation, core propagation and mask-free bots/other rounds.
Roster tests inspect every live phase for 2/3-team games and lobby bot toggles.

Mash uses 0.036 per signed tap. Across 100 seeds, independent noisy 6..8 taps/s players
stay within ±.3 for at least 90% of six seconds. Noisy 13..15 vs 6..8 taps/s reaches an
edge in 3.7..4.4 seconds, with a 3.9..4.2 second mean bound. The match stays open for
six seconds for comebacks; final sign wins, an even result uses fit.

Evidence:

- `docs/samples/tvsim-transcript.txt`: actual full real-clock 10x CLI run.
- `docs/samples/core-test-output.txt`: root vitest output.
- `docs/samples/core-typecheck-output.txt`: root TypeScript output and environment.
- `docs/samples/reference-play.txt`: muted Chrome reference play receipt.
- `docs/samples/pixel-mask-tests.txt`: root tests including mask/roster regressions.
- `docs/samples/pixel-mask-typecheck.txt`: root TypeScript checks.
- `docs/samples/pixel-mask-phone-build.txt`: production phone build check.
- `docs/samples/pixel-mask-e2e.txt`: real relay/phone game and numeric TV mask receipts.
- `docs/samples/pixel-mask-tvsim.txt`: e2e TV transcript with on-cell/HUD summaries.

Behavior changes required by the brief, and the chosen bye/default semantics, are
logged in `DECISIONS.md`. One extra adaptation is the native sticker-flight offstage
origin described above. There are no artwork/layout substitutions: this worker emits
instructions for the native renderer rather than implementing TV visuals. Native TV
rendering, device camera verification and AWS deployment belong to the lead and other
workers. The pixel-mask e2e exercises the real local relay and phone with a synthetic
camera. No Amazon/AWS tool was used or blocked in this work.
