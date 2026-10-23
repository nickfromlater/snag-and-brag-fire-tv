# Submission shot checklist · 2026-10-13

Use `docs/VIDEO.md` for the 2:50 edit and captions. This checklist maps all eleven
storyboard rows to pickup commands, beats and delivery names. Automated captures
use the four synthetic showcase actors; film the room and phone inserts separately
on Oct 22. The web preview proves tooling, not the Fire TV submission requirement.

Prepare a native take using `tools/director/GUIDE.md` after the TV worker attaches
its showcase renderer. For rehearsal while VVD is occupied, change `--target vvd`
to `--target web`. Run from the repository root:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
TAKE="$HOME/builds/snag-and-brag/footage/vvd-take-01"
ROOM="$HOME/builds/snag-and-brag/footage/room"
PHONE="$HOME/builds/snag-and-brag/footage/phone"
GRAPHICS="$HOME/builds/snag-and-brag/footage/graphics"
node tools/director/capture.mjs --target vvd --out "$TAKE" --seed 20261022
```

`capture.json` holds actual beat times; do not hard-code the web take's wall-clock
seconds into a native edit. Every `clip.mjs` command exports H.264 outside git and
never extends beyond its named scene. The room/phone/graphics commands below
normalize explicitly named external inputs; those inputs come from filming/the
editor and are not generated or claimed as complete by this capture worker.

| Edit time | Storyboard shot | Pickup command (after capture, or supplied filmed input) | Beat to watch | Output filename |
|---|---|---|---|---|
| 0:00–0:06 | Dark room, TV wakes, lobby logo, Sir Socksworth | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene lobby --seconds 6 --out "$TAKE/shots/01-lobby-open.mp4"` | Logo's SNAG / & / BRAG slams; open first on the room camera's real TV | `01-lobby-open.mp4`; room input `01-tv-wakes.mp4` |
| 0:06–0:12 | Four people hold up phones | `ffmpeg -i "$ROOM/02-four-phones.mp4" -t 6 -an -c:v libx264 -crf 17 -preset slow "$TAKE/shots/02-four-phones.mp4"` | All four phones raised, no brand logos; hook caption | `02-four-phones.mp4` |
| 0:12–0:25 | Scan QR, team chips join, phone team-name dice | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene lobby --seconds 9 --out "$TAKE/shots/03-join-chips.mp4"` | Four staggered joins at 2 / 3.2 / 4.4 / 5.6 game seconds; cut with phone input `03-qr-dice.mp4` | `03-join-chips.mp4`; phone input `03-qr-dice.mp4` |
| 0:25–0:35 | Hold start, Color Rush slam, PINK reel, countdown | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene color-rush-intro --seconds 14 --out "$TAKE/shots/04-color-intro.mp4"` | Title, landed PINK prompt, 3–2–1 SNAG; phone input `04-hold-start.mp4` | `04-color-intro.mp4` |
| 0:35–0:52 | People hunt; four feed tiles; flash and SNAGGED! | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene color-rush-hunt --seconds 24 --out "$TAKE/shots/05-hunt-feeds-snag.mp4"` | `hunt-feeds`, then Glove Actually's shutter at 7s; cut with room/phone `05-hunt.mp4` | `05-hunt-feeds-snag.mp4` |
| 0:52–1:10 | Eyes/name glow-up; Pixel Judge scans; points fly | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene pixel-judge --seconds 20 --out "$TAKE/shots/06-pixel-judge.mp4"` | `pixel-judge-mask`; first flip, lit grid, 99%, +30 speed and points flight; phone input `06-glow-up.mp4` | `06-pixel-judge.mp4` |
| 1:10–1:40 | Face-off, couch/phone mashing, seam swings, KO | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene brag-final --seconds 28 --out "$TAKE/shots/07-brag-final.mp4"` | Her Royal Shininess versus Great Uncle Mort; `brag-final-mash`; narrow final, BRAGGED! | `07-brag-final.mp4`; room/phone inputs `07-mash-wide.mp4` / `07-thumbs.mp4` |
| 1:40–2:05 | Pedestals, votes from chips, holographic crown | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene showstopper-vote-win --seconds 25 --out "$TAKE/shots/08-showstopper.mp4"` | Vote pattern 0→3, 1→0, 2→0, 3→1; `showstopper-win`, Sockrates with two votes | `08-showstopper.mp4`; room input `08-reaction.mp4` |
| 2:05–2:25 | Podium, fireworks, champion; phone trading card | `node tools/director/clip.mjs --from "$TAKE/capture.json" --scene finale --seconds 20 --out "$TAKE/shots/09-finale.mp4"` | `finale`; Sock Goblins overtakes round-two leader, Sockrates Object of the Night; phone input `09-trading-card.mp4` | `09-finale.mp4` |
| 2:25–2:45 | Animated architecture card; category stickers | `ffmpeg -i "$GRAPHICS/10-architecture-edit.mov" -t 20 -an -c:v libx264 -crf 17 -preset slow "$TAKE/shots/10-architecture.mp4"` | Editor's Vega TV ↔ AWS relay ↔ phones, Bedrock / Polly / on-phone judge; Family entertainment · Multi-modal UX · Computer vision | `10-architecture.mp4` |
| 2:45–2:50 | Logo, solo-mode line, actual repo URL | `ffmpeg -i "$GRAPHICS/11-end-card-edit.mov" -t 5 -an -c:v libx264 -crf 17 -preset slow "$TAKE/shots/11-end-card.mp4"` | Editor uses the lobby logo, “Play it with one phone: solo mode with bots” and supplied repo URL | `11-end-card.mp4` |

The storyboard has eleven rows (0:00–0:06 through 2:45–2:50), and each is mapped
above. The two phone-only actions in the TV rows are separate filmed inputs, so
their real phone UX is still visible. Preserve room laughter and game audio in
the final mix; the normalization commands intentionally make silent insert files.
Use the game's Lilita One/Rubik and paper-pill caption treatment from `reference/`.

Gallery and thumbnail command:

```sh
node tools/director/stills.mjs --from "$TAKE/capture.json" --out "$TAKE/gallery-delivery"
```

| Beat | Clean frame | Delivery |
|---|---|---|
| Lobby after the last team chip settles | Logo, join card, four chips and sticker parade | `01-lobby.png` · 1920×1080 |
| `hunt-feeds` | PINK prompt, clock and four live illustrated feeds | `02-hunt-feeds.png` · 1920×1080 |
| `pixel-judge-mask` | First card flipped, closest-20% mask lit | `03-pixel-judge-mask.png` · 1920×1080 |
| `brag-final-mash` | THE FINAL, fighters, central seam and mash bar | `04-brag-final-mash.png` · 1920×1080 |
| `showstopper-win` | Sockrates holographic, two vote chips and crown | `05-showstopper-win.png` · 1920×1080 |
| `finale` | Champion name, podium, trophy, Object of the Night and fireworks | `06-finale.png` · 1920×1080 |
| Devpost composition | Original lobby logo and catalog stickers, stage only | `07-devpost-thumbnail.png` · 1500×1000 (3:2) |

Before the Oct 21 rehearsal: fix exposure/glare on the locked room camera, cover
brand logos, prepare the hero-object basket, confirm everyone agrees to appear,
and check phone recording orientation. On Oct 22: two full takes, then pickups
from the checklist. The native toggle/physical filming and editor's two graphics
remain with their owners; this tooling neither touches `tv/` nor publishes media.

For inserts matching this preset, the host's hero props are a **pink rubber glove**
(Glove Actually), a rubber duck (Admiral Squeak), then a weird/lone sock (Sockrates).
The rival art is donut / lava lamp / robot in Color Rush, crown / portrait / pan
in Brag-Off, and lava lamp / whisk / toy dinosaur in Showstopper. These are
existing OBJ entries; no branded or paid props are needed by the capture tools.
