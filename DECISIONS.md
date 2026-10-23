# Decisions

Each judgment call or departure from the mockup or the brief: date, choice, reason.
The mockup decides the look, the brief decides behavior, the official Devpost rules
win on rules and requirements.

## 2026-10-12

**Official rules reconciled with BRIEF.md.** Read amazonappdev2026.devpost.com (overview,
resources, rules) in a real browser on Oct 12. Where they differ from the brief, the
official pages win:
- **Mini challenges.** The brief does not mention them. A project can win one track prize
  plus one mini challenge prize. We enter **AWS Builder** (Bedrock + Polly + the relay on
  AWS). The rules call "a single Bedrock call" obvious and a multi-service pipeline
  creative, so the AWS side is built and documented as a pipeline: vision read on
  Bedrock, host voice and visemes on Polly, the room service on AWS, with a health check
  and budget alarm. **Open Source** is a candidate: the rules' own creative example is
  "adding Vega support to a popular React Native library". If we patch a library for
  Vega during the build, we send that upstream as a PR and enter it. Decided by Oct 19.
- **Product feedback is required,** per tool: what we used it for, what worked, what
  needs work, onboarding, would we build again. The friction log is optional and earns
  up to +10%; each entry needs task, **steps taken**, expected vs actual, severity,
  workaround and an **actionable suggestion** (the brief's format lacked steps and
  suggestion). Feature requests are a separate optional field (priority:
  Critical / Important / Nice-to-have). FRICTION.md follows this shape.
- **Repo.** Public with an OSI license (MIT, visible in the GitHub About box), made public
  at submission. Until then it stays private and holds nothing private (no keys, no
  personal details, no fleet notes; `notes/` is gitignored). Repo, video and project
  stay public until judging ends.
- **Dates.** Submission closes Fri Oct 23 12:00 PT. Judging runs Nov 9 to Nov 20 12:00 PT.
  Winners about Dec 3. The backend stays up through **Dec 3**, not just Nov 20, since
  judges may test until the end of judging and the sponsor may verify later.
- **Tie-break order** is the criteria order: Tech Implementation first.
- **Judges may not play it.** They may judge on the text, images and video alone, and
  judging may use automated AI analysis. The write-up maps every claim to a criterion in
  plain words, and the gallery images show the real product.
- **Video.** Under 3:00, public on YouTube or Vimeo, English. No third-party trademarks or
  copyrighted music: our music is synthesized in-house; branded objects stay out of shot;
  the Bedrock prompt tells the model never to use brand names.
- **Simulator footage is allowed** ("actual Fire TV device or the Fire TV/Vega
  simulator"), which matters if no HDMI capture card arrives.
- **Voice.** The rules list "multi-modal UX combining voice + D-pad + visual in a single
  flow" as creative and "remote-controlled game" as obvious. The brief cuts Alexa voice
  first. Not reordering the cut list on my own: the spike prices voice by Oct 14, then
  the priority goes to Nick with a recommendation.
- **Judges.** The official overview page (read Oct 12) lists 18 judges, including Fire TV
  VPs, the Fire TV Voice & AI lead and a founding partner of Vega OS at Callstack. Win
  intel said a judge list seen online was fabricated; this one is on the official page, so
  it counts, but we do not tailor anything to an individual.

**Platform default: Vega OS on the Fire TV Stick 4K Select,** unless today's spike finds a
blocker. Amazon recommends that device and is pushing Vega, and a Vega founder judges.
Nick has no device yet, so we build in the Vega Virtual Device until it arrives. The
simulator's frame rate varies more than 2x between runs, so all frame-rate gates wait for
the device.

**Native React Native, not a WebView.** The brief scores "a native TV app (not a web page in
a wrapper)" under Tech. The September Hush Hollow spike proved a Vega WebView works; we do
not take that shortcut unless native 2D drawing fails the spike.

**Monorepo with pnpm workspaces:** `shared/` (protocol, constants, Pixel Judge, game core),
`relay/`, `phone/`, `tools/` (renderers), `assets/`, `tv/`. pnpm's store shares packages
across worktrees, which matters on a 24 GB disk. The game core is pure TypeScript with an
injected clock and a seeded random source, so the same code runs on the TV, in tests and
in a headless stand-in TV.

**Photos travel as binary frames and are served from relay memory.** A snag is sent once
over the phone's WebSocket. The relay keeps it in memory for the life of the room and
serves it at `/p/<room>/<id>?k=<room key>` with `Cache-Control: no-store`, so the TV and
the vote and end screens load it like any image. Nothing is written to disk or logs. The
room's photos are dropped when the room closes.

**Hosting: one small EC2 instance behind CloudFront.** The relay and the phone page share
one origin. CloudFront gives a free HTTPS `*.cloudfront.net` name, which the camera
needs, and carries WebSockets. API Gateway WebSockets cap frames at 32 KB, too small for a
720 px snag, and App Runner has no WebSockets. A real domain can be bought near
submission.

**Pixel Judge follows the mockup code, not the brief's prose.** The match uses the ΔE of
the 20th-percentile closest pixel, and the reported color is the average of the closest
20%. The brief describes ΔE of the averaged color. The code is what was approved, and the
difference is small.

**Six music moods, not five.** The mockup's music has six (lobby 102, hunt 124, urgent 140,
tension 90, brag 116, win 122 bpm). The brief says five. All six are rendered.

**Join card copy** reads "Two to four teams" (v1 supports 2 to 4), replacing the mockup's
"Two to eight teams", as the brief directs.

**Relay transport stays on protocol v1.** The worker added no shared fields or game
logic. Disconnected-TV snag/AI notifications are a bounded transport replay tied
to the retained photos; the TV still owns screen/state replay. Extra operational
bounds are 60 messages/s/socket, 40 clips/room, four pending voice jobs, a 1 MiB
clip maximum and a 16 KiB marks reply. Very oversized WebSocket frames close with
1009 before parsing; smaller invalid frames receive `BAD_MSG`. These protect the
small instance without changing valid game messages.

**Mantle deployment needs model-scoped Mantle IAM and a zero-retention workspace.**
The requested SDK 0.34.4 uses `bedrock-mantle:CreateInference`, whereas the brief's
`bedrock:InvokeModel` grant targets the runtime endpoint. Added the exact model
condition on one project alongside the brief's grant. Deploy-only project setup
sets/verifies `data_retention.mode: none`; the relay supplies its workspace id so
household photos cannot inherit a retaining model policy. Runtime cannot change
that policy. These are setup adaptations, not protocol changes. No AWS calls or
deployment were run; details are F-RELAY-01/02 in `FRICTION.md`.

**Mock Polly uses an in-memory 1.056-second silent MP3.** Fake word/viseme marks
are distributed across that clip for offline mouth/HTTP plumbing tests. This is
the brief's silent development stand-in; it does not approximate the real voice
or timing. No audio was played.

**Device: Fire TV Stick 4K Select (2025, Vega OS, $49.99), not the new 2026 Fire TV Stick 4K.**
On Oct 12 the 4K Select's product page pointed to a newer model: the 2026 Fire TV Stick 4K
(Vega OS, $59.99, launched this month). That page says it "prevents sideloading or
installing apps from unknown sources", and early reviews report it slow. The 4K Select is the
Vega device in Amazon's developer device specs (AFTCA002: 1 GB RAM, Mali G310v2), so the
SDK and docs cover it. Installing a dev build on any Vega stick takes a registered developer
account, the stick registered as a dev device, and a USB link to the computer (no network
install). One press report (aftvnews) says sideloaded Vega apps stop working after a while.
The spike checks this against Amazon's docs, because it decides how judges install the
app and whether a filming build survives.

## 2026-10-12 · Offline audio files and runtime integration

**Execute the audio block verbatim.** The renderer serves `game.js` lines 60–154 unchanged.
A small adapter gives the original `ac()` initializer an OfflineAudioContext constructor,
reports `running` during initialization to avoid its realtime `resume()` path, and
temporarily suppresses `MUS.start`. It seeds every random draw, then schedules all 192
music steps directly. Selecting `off` before each requested mood makes lobby use the
specified 102 bpm rather than the source's initial 104 bpm placeholder. No shared contract
or synthesis function was changed.

**Stabilize only floating-point summation order.** Seeded composite renders still varied
by one PCM16 count between offline contexts. The adapter records connection order and
routes sums of more than two inputs through balanced unity-gain binary sums, preserving
the source synthesis nodes, gain/compressor/reverb parameters and timing. This is an
offline execution adaptation needed for byte-identical output, not a replacement synth.
Chromium's pointer-hash summing connections are consistent with the observed variation;
the renderer README links the source and the review handoff records the repeated probes.

**The requested catalog bounds continuous/random sounds.** The files cover all 112 effect
variants and six moods in the audio worker brief. TV selection quantizes `mtick` to
eighths and the mash crowd to five volumes. `mash(n)` wraps its pitch at 13 but keeps
raising its noise filter for larger tap counts; reusing the requested 0–12 bank above 12
restarts that noise rise. Three tomato variants are intentionally identical because that
source branch has no randomness. These limits are documented rather than changing the
approved sound palette.

**Original mix gains are baked into the files.** Each render uses SFX .8, music .22,
master .9, reverb .18 wet and the original -12 dB / 4:1 compressor. Unity playback
preserves those baked levels, as confirmed in the lead's correction below.
Isolated mastered files cannot reproduce the original compressor's nonlinear response to overlaps.
Fractional musical boundaries are rounded to 48 kHz samples, with exact bar offsets in
the manifest. No loop crossfades, extra fades, normalization or sound redesign were used.

## 2026-10-12 · Lead review: uniform TV makeup gain

**Boost the entire bank by one factor.** The lead requested a louder TV/demo mix while
preserving the relative file levels. Every effect/music sample now receives
**+10.935341367192734 dB (3.521819293883432×)** after the source render/trim/cut and before
PCM16 quantization. The greatest source float sample belongs to `sfx-snagged` at
-13.935341367192734 dBFS; the boosted PCM16 bank peaks at -2.99998782 dBFS, the -3.0 dBFS
target within 16-bit rounding. No individual file normalization, added compression,
limiting, fade or timing change was applied. The original mockup compressor is retained.

**Restate playback gains on the boosted assets.** Per the lead's correction, every file
plays at **unity gain (1.0)**, summed at unity, then through the TV's soft limiter.
Original SFX .8, music .22, master .9, compressor and makeup are already baked into the
files; applying those gains again would double-attenuate (the music bus by about 13 dB).
`runtimeBusLevels` and `filePlaybackLevels` are all 1.0. `sourceRenderLevels` and `graph`
record baked provenance; `makeupGainDb` is the baked uniform export boost. Runtime gain
changes are limited to Sound/Music on-off toggles and optional user volume if added.

**Measure the requested synchronous overlap.** `music-win`, `sfx-fanfare`, `sfx-ko` and
`sfx-crowd-2-18` all play at unity from sample zero and are summed as signed decoded PCM
in float64. Peak is **-1.28862966 dBFS** before the limiter, at sample 828 (0.01725 s),
with **0 channel samples / 0 stereo frames** above full scale. The standalone crowd is intentionally included in
addition to fanfare's embedded crowd. Actual soft-limiter reduction depends on its knee
and threshold. `docs/review/audio/runtime-overlap.json` and `mix.runtimeOverlap` retain
the detailed measurement.

**Art worker: original art and overflow coordinates preserved.** `render-art` executes
the original ART/OBJ, DEFS and HOST setup with system Chrome; no art is redrawn.
The worker brief's 1.6× and 3.2× sticker scales override the general brief's 2× note.
The measured union of filter regions fits reference bounds `(-40,-45,200,225)`,
so the 192/384 box variants are 320×360 / 640×720 PNGs with anchors (64,72) /
(128,144). Host parts retain the 200×240 coordinates at 2×, padded to
`(-20,-25,240,290)` (480×580 PNGs) to preserve the hat and lower-body overflow.
Reel arrows are CSS border triangles and remain runtime CSS/native primitives;
their exact source rules are included in the prop vector inventory. Extra props
include all crown variants, controls, stopwatch/arc, Brag-Off seam and house layers.
The camera panorama uses unframed object art, so a separate bare-object layer at
0.5×/1× and a complete 1200×600 `houseURL` panorama are also exported. Every object's
house zone, center and size are preserved in the manifest.

**Photo frame uses calibrated coverage for the required layer order.** The original
filter paints the photo over its frame, while the TV needs shadow → masked photo →
overlay. The exported runtime mask compensates edge coverage; a separate geometric
rounded-rect mask is also supplied. Calibration runs opaque black/white synthetic
images through the complete original filter, since removing merge inputs can alter
Chrome's blur working region. The final synthetic-photo comparison differs by at
most 1/255 per channel at both scales on ink and paper (mean absolute channel error
0.00168620 / 0.00193305 out of 255). This is 8-bit compositing quantization, not a
geometry or palette change. Photos are never used as generator inputs; all test
patterns originate in memory.

**Bitmap host motion has an optional approximation; vectors stay exact.** All paths,
attributes, animation functions, pivots and brow poses are in `assets/host/parts.json`.
Mouth/tongue/lid ellipse parameters support continuous drawing. Bitmap-only renderers
also get 33-frame constant-stroke atlases (1/32 steps), avoiding distorted strokes
from scaling a closed lid. Fractional PNG transforms resample edges; in the three
review poses, mean channel error against the live host on cobalt is at most 0.514
out of 255. Path-capable renderers can use the raw vectors. The full frame-back PNG
is drawn before the puppet clipped through the inner mask; frame-front is an
alternative standalone border export. The native renderer chooses its supported
path after the lead's spike.

**Art verification and repeatability.** Chrome 155.0.8059.40 runs muted with sRGB
software rasterization and two settled frames around DOM changes; this avoids
GPU filter-cache variation across device-scale changes. Lossless PNG encoding clears
RGB only where alpha is zero. All 104 sticker/background comparisons and all ten
WOFF2→TTF glyph comparisons are pixel-identical. FontTools 4.61.1 / Brotli 1.2.0
decode the five bundled fonts with original names/outlines/timestamps and OFL files.
Two full builds produced identical manifests and all 169 file hashes (3.87 MiB of
runtime assets). Root tests (12) and typechecking pass. Evidence is in `docs/review/`.
No Amazon/AWS tool was needed or invoked by the art worker; no friction entry applies.

## 2026-10-12 · Platform: Vega OS native, from the spike (docs/spike/PLATFORM.md)

**Build the TV app as native React Native on Vega OS** (SDK 0.24, RN 0.72 runtime). In the Vega
simulator: native SVG Paths draw the sunburst, gradients, grid and 300 particles (batched
into a few Paths, not one node per particle); pre-rendered alpha PNGs carry the stickers;
Reanimated springs run on the native driver; Lilita One and Rubik load as TTF, with the
display stroke drawn from the glyphs' own outlines; binary WebSocket and JPEG feed tiles
work; and four overlapping audio players run. Remote keys, Back interception and a QR
code drawn from a pure-TS encoder all pass. **No Skia** (no official Vega port), and **no
GL**: the native GL view broke composition with the RN UI. We won't spend the deadline on
either.

**The frame-rate risk is open, with a hard gate.** On the simulator the full scene renders
at about 32–38 native frames/s. The stick has 1 GB of RAM and a small GPU. Production rules
from day one: bake the static background, run background and particle updates at 30 Hz,
keep sticker transforms at 60 Hz, bound feed-image memory, and include a Reduced motion
setting. **Gate:** profile the full workload on the stick by Oct 15. If one focused
optimization day can't hold 30 fps, switch to native Fire OS on a Fire TV Stick 4K Max
(react-native-tvos with Skia v2). The game core is pure TypeScript and the renderer sits
behind an interface, so the switch costs the renderer only.

**Video capture without a card:** the Vega simulator records clean 1920×1080 at 60 fps
through the emulator console (180 s per clip). The rules and FAQ allow simulator footage,
and say hardware isn't required for judging. Room-camera footage of the real stick proves
it runs on the device.

**Installing on the stick needs a USB data cable to the Mac,** plus developer mode and a
browser login to Nick's developer account (`vega devmode login`, then `enable-device` with
a code shown on the TV within 5 minutes). The stick ships with OS 1.1, and SDK 0.24 needs
1.2, so update it first.

**Phone controller adaptations.** The controller ports the reference phone markup,
CSS, springs, eyes and SVGs directly. Real camera/file capture replaces the house,
zones and drag hint. The join tutorial says "Fastest snag earns a bonus" because
real finds cannot be locked by rival teams. The requested bots toggle, host menu,
pause overlay, lobby badge/score and privacy line are added; end-screen gap is 8 px
so the privacy line and Run it back fit. The gallery normalizes the mockup's
372×820 logical layout to 390×844, while live mobile uses safe areas and scrolling.
Simple JPEG previews are not padded to 2 KB; previews stay 96×64 and at most 4 KB.

**Host identity on reload without a protocol change.** `ScreenMsg` only includes
`isHost` in lobby/end. The phone stores a host identity tag tied to its existing
128-bit per-room client token, never game state or media. This restores the menu
after mid-game reload; the TV still authorizes controls. Default relay endpoint:
same-origin `/ws`. `ScreenMsg.total` is in milliseconds. Keyboard start requires
the same 850 ms hold as touch. Full phone decisions and evidence:
`docs/review/phone-notes.md`.

**Core worker: real-phone rules and timing.** The pure shared host keeps the existing
wire protocol unchanged. Missing phones get a zero-point "Didn't snag" card rather than
the mockup's invented panic find; they give a bracket bye and receive no Showstopper
pedestal. A bye earns the match's normal win points for an actual find; two missed finds
advance a deterministic seat without points. Two teams play only a final; three play a
seeded random semi and a final. Every uncast vote defaults at expiry to a legal rival
(random for a phone, trait-ranked with jitter for a bot), and cannot vote for a missed
find. With no eligible finds, the reveal awards nothing. These make dropouts complete a
game without inventing photos.

**Core worker: mash and brag lines.** Per-tap push is 0.036, replacing the prototype's
0.065: a 14 vs 7 taps/s advantage reaches the edge in about four seconds. The full
six-second match remains open for comebacks and its final sign decides the win; an exact
tie uses AI fit (object traits for bots). Both brag lines wait 1500 ms as the worker
brief specifies, replacing the mockup's second-line 1600 ms wait. Bot fighter rates
(.04-.17 units/s), spectator push (.025/s), trait jitter and visual response are ported.

**Core worker: host controls and clocks.** End game opens a confirmation menu; a second
host-phone `control:end` confirms, as do the remote's explicit confirmation options.
It returns to the same room's lobby and clears scores/finds. Run it back starts round
one immediately with the same teams and reset scores. All timing, including host typing,
AI fallback, bots and delayed point landings, uses one injected pausable timeline. Hunt
time starts when the camera becomes live, excluding the prototype's pre-hunt wipe from
the find's shutter time. Host copy initially followed the prototype; the shared-TV
corrections below supersede its single-player wording. Shared has a local four-second fallback as well as
the relay's fallback, and never waits for AI to advance.

**Core worker: native sticker flight.** The prototype can animate between its side-by-side
phone DOM and TV DOM. A native TV has no phone DOM coordinates. Cues preserve the 780 ms
flight, .45 distance fraction, 140 px arc, 1.25 midpoint scale and -200/-360 degree
rotations, with a semantic offstage phone origin for the renderer to resolve. Human
ready stamps follow the flight; bot ready stamps retain 300 + index*350 ms staggering.
Snapshots carry current content and declarative motion stacks, including frozen elapsed
time, so a late native renderer can draw the current beat without replaying past cues.

**Core review: shared-TV host copy and bounded quips.** Per the lead's Oct 12 review,
standings and champion lines always name teams, including the last team. Standings use
three distinct existing-copy variants in round order (lead the pack / anyone's game /
named last place), avoiding a repeat even when one team leads all three rounds. Brag
winner variants use round plus match index, and the host rejects identical adjacent
queued/played lines. Welcome names the team instead of saying "Very you"; the host-phone
ready instruction drops its singular "you". Room-wide instructions and thanks retain
audience "your/you", and phone screens keep all personal copy.

Trait introductions now speak a + lowercased b + c, omitting parenthetical asides. The
lead's explicit museum example also omits "priceless, obviously", treating it as an
editorial aside despite the card's missing parentheses; prompt card copy is unchanged.
The opening greeting is suppressed once any team has joined, including a fast join.

AI reads update labels/options/fit without initiating speech. Color Rush quips are
considered only when that find's score lands, and must finish before the winner line.
Brag-Off considers only the winner's quip after the knockout line finishes typing,
using the existing 900 ms read hold; typing plus the quip's 400 ms hold must fit, so no
new wait is added. Showstopper considers only the first two real-photo finds in runway
order, at their landing beats, and only if the whole speech queue fits before voting.
Optional speech is dropped if too long or duplicate, consumed rather than retried, and
cancelled on phase changes/skip. This prevents speech over brag bubbles or during votes
without changing animation parameters or extending any phase.

## 2026-10-12 · Relay lead review: fallback variety and trusted prompt copy

**Sample fallback copy per read and remember the room's last fallback quip.** Each
failure draws three distinct shared names and two distinct shared brags with crypto
randomness. Six short Sir Socksworth lines supply the quip; the room excludes its
previous selection synchronously, including simultaneous failures and TV resume.

**Only exact shared prompt text can enter the model prompt.** The shared helper derives
the whitelist from `promptText` over every color, brag and show prompt. Any other
phone-supplied string becomes `Snag something from around the house` before the provider
sees it, and still receives a read. The existing 4 KiB header cap bounds the input.
The log whitelist, structured output, four-second budget and wire shape are unchanged.

### 2026-10-13 · Native eyes retain the reference damping tail

The native-eyes brief estimates 1–1.5 s to settle. With the unchanged `stepEyes`
spring (14), damping (1.4), gravity (2) and disk collision (1.6), representative
kicks still have visible displacement and velocity at 1.5 s and take roughly
4–6 s to fall below 0.035 normalized displacement / 0.15 normalized velocity.
Precompute the complete 30 Hz tail (capped at 10 s) instead of increasing damping
or truncating it. `tv/test/eyes-trajectory.test.ts` compares every sample directly
with the actual mockup integrator. The brief's gentle 3.6 s idle sway is a closed,
precomputed loop that starts at the last trajectory's position; its staggered
phase is chosen once per sticker.

### 2026-10-13 · Native eye geometry and complete-stage attachment

The single-eye core Animated probe worked, but the composed painted eye geometry
failed with both the native driver and a batched React-state trial. Reference pupil
bitmaps inside the same plain Animated Views restored full-stage presentation, so
ship the lead's preferred native-driver trajectory approach. The 15 Hz trial is
removed. White sprites are baked directly from `.gg` at each supported displayed
radius so the CSS 3 px outer ring and inset shade do not scale with sticker size.
A new, unlisted sticker size can use the existing base sprite until the radius list
in `tools/tv-foundation/generate.mjs` is extended.

The checkpoint initialized native diagnostic layer 0. All-at-once layer 7 cold
mounts intermittently stopped answering snapshots; staged attachment worked.
Attach those existing layers automatically at 150 ms intervals after native
relay/font readiness, reaching the complete stage in 1.05 s. Web starts at layer 7.
No scene, wire-protocol, game-flow, scoring, copy or audio changes are made here.
## 2026-10-13 · After mock judge G1

**Polly voice moves from P1 to required.** The G1 mock judge scored Tech 4/10 and named its
single most valuable change: a real photo, named by Bedrock, read aloud by Sir Socksworth
in his Polly voice in the same moment. That beat is the AI hook, and it makes the AWS
mini-challenge entry a real pipeline (phone CV → Bedrock vision → Polly with visemes →
TV). The brief's cut list put Polly fourth; the rules' AWS creative bar and this verdict
outweigh that. The voice blips stay as the fallback when Polly is slow or down.

**The Pixel Judge shows its work.** The judge read the color match as an unconvincing
number. During the TV's scan beam we highlight the photo pixels that matched (the closest
20% the phone already finds), sent as a small bitmask with the snag. Computer vision then
reads on screen and on video, not as a percentage. It's added to the protocol as an
optional field, so nothing breaks without it.

**Effects never cover text.** Particles, reactions, rings and wipes render under names,
titles, the host bubble and banners, or avoid their bounds. Payoff moments must stay
readable.

## 2026-10-13 · Phone face redaction (w/face-blur)

**Redact once, before the Pixel Judge and JPEG encoder.** Camera and file-picker
captures share the 720 px square pipeline. MediaPipe Tasks Vision uses the pinned
BlazeFace short-range model locally, with confidence 0.5 and CPU inference. Lazy
loading starts after the TV confirms the player joined; no join UI awaits it. A
single instance stays warm across rounds. The expanded face region adds 25% on
each edge (conservative coverage of forehead/chin) and is replaced with roughly
twelve blocky mosaic cells across. Temporary canvases, Pixel Judge buffers and
file-image blob URLs are cleared; the camera stops immediately after the square
is captured, before detector loading/detection waits.

**A useful close-up retry needs padding.** With no detections, shrink the square
to 180 px inside a black 360 px canvas, then map boxes back to the original.
Merely resizing a square would be undone by the model's own 128 px preprocessing.

**Implement the worker brief's explicit availability fallback.** At the shutter,
wait at most 1.5 s for MediaPipe. Try browser Shape Detection when available; bound
that asynchronous API to 1.5 s too. Otherwise send with `redaction: 'none'`, as
requested in step 5. The optional enum is a non-identifying, countable per-snag
metric; it contains no face count, coordinates or identity. The relay accepts
and ignores it, preserving old clients and the TV's existing message shape.
This explicit fallback can transmit an unredacted photo, and a detector can miss
a face; the opening aspiration that no face ever leaves the phone cannot be an
absolute guarantee under the requested fallback. The end-card copy is exactly
the worker's requested wording, retaining the existing 11 px privacy style.

**Make thumbnail pixelation explicit without running a detector.** A direct
96×64 resize can preserve close-up facial detail. Reduce first to a 12×8 mosaic,
then expand with nearest-neighbor sampling to the existing 96×64 JPEG at 3 fps.
This makes the mockup's blocky TV-feed look explicit and removes fine facial
detail without per-frame inference. This is a small privacy correction to the
brief's assumption that the existing scale alone was sufficient.

**Self-host all inference assets, including both WASM variants.** Pin Tasks Vision
0.10.14 rather than 1.1.0, whose selected WASM alone is 3.86 MB gzip. Vendor the
matching runtime and version-1 model under `phone/public/face-detector/`, with
Apache license and provenance. The relay's strict header schema needs the optional
metric; its static route additionally needs `application/wasm` and gzip for WASM,
model and JS assets so measured download sizes reflect real serving. These small
relay changes support the phone pipeline; photo handling and game logic are unchanged.

The longer two-line privacy copy keeps Rubik at 11 px. Its line-height changes
from 1.3 to 1.2 so Run it back fits in the reference's normalized 390×844 phone
frame; the card, palette and spacing remain as ported. An empty inline favicon
avoids Chrome's unrelated `/favicon.ico` 404 during the strict game smoke.

Verified receipts are in `docs/workers/face-blur-report.md` and
`docs/review/face-blur*`. The added SIMD download is 3,168,058 bytes gzip including
the 1,737-byte change to initial JS, so the 3 MB target is exceeded by 168,058 bytes.
The real drawn-face detector smoke found a face; desktop Chrome's warm detection
median was 3.5 ms, with 3.1 ms for the warm detect-and-mosaic call. Root tests
(280), root typecheck, phone build and the full three-round relay/TV game pass.

**Faces are blurred on the phone before a photo leaves it (Nick, Oct 13).** A MediaPipe face
detector runs in the phone page; any face in a snap is pixelated before judging,
encoding and upload, so no face reaches the relay, Bedrock, the TV, other phones or the
video. The TV feed thumbnails (96×64) are already unrecognizable. The detector loads in
the background during the lobby, about 2–3 MB, self-hosted.

## 2026-10-13 · Pixel-mask worker: evidence format and team slots

The optional Color Rush mask uses the exact existing closest-20% selection at the
phone's 480px judging size. Equal-distance samples keep row-major order, matching the
mockup's stable sort. Grid coordinates cover the whole photo, with row-major,
least-significant-bit-first packing: 24×24 bits, 72 bytes, 96 standard-base64 characters.
`judgePhoto` returns the mask alongside its unchanged score/color so the phone samples
and sorts once. `judgeMask` also exposes the requested standalone helper. Invalid
optional masks are dropped; a snag still arrives. Bots and other rounds omit masks.
`PROTO` stays 1, and neither the relay nor simulator logs the encoded mask or photos.

Lobby empty chips use the mockup's `Waiting…` caption with a blank monogram and paper
color. `TeamView.joined?: boolean` is added to distinguish these TV-only `joined:false`
slots from actual disconnected teams; absence means joined for backward compatibility.
`TvView.teams` is padded only in the lobby and contains only joined teams throughout a
game, including scene wipes and the finale. Phone rosters always list actual teams.
Bot identities appear only while bots are enabled. This is the requested departure
from the four-team mockup; no game timing, scoring, art or motion values change.

The real-phone e2e runs without screenshots by default and prints only mask validity,
byte length and lit-cell counts from TV find screens. If screenshots are requested,
camera pixels and photo stickers are redacted before capture to keep media off disk.

The e2e reports and excludes only Chrome's optional `/favicon.ico` HTTP 404 probe;
the phone does not reference that icon. Page errors and all other console errors
still fail the run. This avoids an unrelated missing browser icon invalidating an
otherwise complete game/mask receipt without changing the phone UI.

A real e2e rerun exposed fractional `tvsim` deadlines after clock-sync averaging.
The relay requires integer millisecond deadlines, so it rejected some Color Rush
screens and the phone never entered that hunt. `SimulatorClock.phone` now rounds
only the converted wire deadline (at most 0.5ms); game timing and the simulation
axis retain their precision. Regression tests cover normal and 10× fast mode.

## 2026-10-13 · Face-blur worker: merge Pixel Judge masks from main

Merge main `602d800` into `w/face-blur`, preserving both sets of decisions and the
joined-only HUD behavior. The shared snag header and relay schema accept optional
`mask` and `redaction` together. Color Rush masks still reach SnagArrived and TV
find screens; the relay still ignores the non-identifying redaction metric.
Malformed optional masks retain main's drop-and-continue behavior, while invalid
redaction values are rejected.

Both capture paths keep the order: 720 px square → face redaction → 480 px
downscale → `judgePhoto` (score/color and mask from the same redacted selection) →
JPEG encoding → header and upload. The phone does not run `judgeMask` a second
time; `judgePhoto` already derives the mask in its existing sample/sort pass.
Capture/judge canvases, judge pixels and file URLs are cleared as before. The
merged SnagImage/SnagPhoto type preserves PhotoJudgment's optional mask and adds
the redaction method. Bots and non-Color Rush rounds continue to omit masks.

Regression tests now use a synthetic image whose matching-pixel mask changes
after mocked redaction, check redaction/judging/encoding order and cleanup, and
exercise mask plus each redaction enum value in one relay header. The focused
browser check confirms camera/image and file masks match the redacted drawing's
mask and differ from its original mask. The full-game e2e retains both branches'
checks: outgoing redaction and mask metadata, and the mask received in TV find
screens. It logs only methods, validity, byte counts and lit-cell counts, and
keeps player media and raw encoded masks off disk and out of logs.

Merge verification passed: root tests (296), root typecheck, phone production
build, four focused browser checks, and a 215.3-second three-round relay/TV game.
All three outgoing snags reported `mediapipe`; the Color Rush snag contained a
valid 72-byte mask with 64 lit cells, matching the TV receipt. Other rounds omitted
masks in both directions. Receipts are `docs/review/face-blur-merge-*`.

**The "Most <color>" crown goes to the closest color match, not the highest total (Oct 13).**
The real-photo benchmark (64 licensed photos, `tools/eval`, on `w/eval`) showed that the
speed bonus (30/20/10/0) is often bigger than the gap between a true color and a
near-miss: the true object won only 50% of RED and 42% of ORANGE rounds once speed
counted. A crown reading "Most red" on an orange thing looks broken on TV. Points are
unchanged (match % plus speed bonus, as in the mockup), so speed still pays. Only the
banner, the crown and the "wins Color Rush" line follow the match. The same benchmark found
no 94–99% bunching on real photos (median 77 for true objects vs 43 for near-misses), so
the scoring scale stays as shipped.
## 2026-10-13 · TV Worker A: native intro and standings rendering

**Keep choreography and scores in the shared core.** The intro renders the authoritative
`GO!` content as the TV's reference `SNAG!`; phone copy remains unchanged. Standings use
the previous order as stable base bounds and the core's top/width/left animation stacks
for racing and reordering. No wire or game-core shape changed.

**Native drawing adaptations.** Marquee light glows use four translucent drawing bands
instead of CSS blur; the reel's 70px fades use fourteen static alpha bands. These avoid
CSS-only filters/gradients without adding particles or per-frame React state. The crown
uses the foundation's pop spring with the reference's -40px drop, -40 to -12 degree
rotation and .3-to-1 scale, rather than the CSS 500ms cubic-bezier entrance. Bar widths
use native transforms, as required by the stage API: corner radii stretch with the fill,
and stripe spacing is compensated for its final width (the texture compresses during
the race). Text labels use the required 16px floor. Positions, card pitches, durations,
score curves, overtakes and celebration cues otherwise come directly from the reference.

**Acceptance fixtures.** Native comparisons use four teams: a local host fixture that
takes no photo, plus the three seeded bots. The separate fast game uses three bots.
Score totals, prompt choice and the host's zero-point lane therefore differ from the
provided screenshot fixtures; no photo or thumbnail is captured or persisted.
## 2026-10-13 — Worker C TV scene port

- Brag-Off uses the final v2 CSS overrides: brag bubbles at y=96, combo at y=104, and the 808-pixel tug at x=236. Those overrides are what the acceptance screenshots show.
- Showstopper centers the eligible pedestals when a team misses its snag. With no eligible finds, an ink-outlined paper pill reads ‘NO FINDS ON THE RUNWAY’. A Brag-Off bye uses a centered winning find and ‘<team> gets a bye!’ in the same panel/sticker language. These states are absent from the four-team mockup.
- Vega’s holographic treatment uses two masked rainbow passes crossfading over 3.2 seconds, with eyes above the sheen and the Object of the Night text above its background sheen. This replaces CSS hue-rotate/color-dodge while keeping the original art, ink, readable eyes, and authoritative winner beat.
- UI labels and badge initials retain the required 16-pixel minimum. The fourth-place plate and natural-width fighter team tags accommodate those larger labels.

## 2026-10-13 · TV integration review adaptations

Team names use measured Rubik Black outlines and at most two lines, breaking only at spaces. Tracking tightens before type shrinks, with a 16 px minimum. HUD chips widen to 217 px, and their scores occupy the shorter name line; the room chip moves to the available right margin. An exceptionally wide unbroken custom name compresses horizontally as a last resort, retaining its 16 px height and every character. Main's `joined:false` lobby placeholders stay neutral in both the HUD and join dots.

Intro titles retain the 168 px reference maximum, fit long words by measured Lilita width, and cap entrance scale at 1.08 so the complete title fits with margins even during the world punch. Their dust rings use the title height rather than the stage-wide containing block. The lobby words grow from 176 to 188 px (6.8%) to match the comparison. Delta tags move above the scores. Global effects draw before scene text; the judge beam clips to the sticker area.

The photo-only Pixel Judge overlay decodes the existing 24×24 wire mask, reveals fixed glowing rows as the exact eased beam crosses them, and holds 450 ms after the 800 ms meter fills before fading over 220 ms. It is under the die cut and googly eyes. Bots retain the pixel shimmer. No shared wire shape or scoring rule changes.

Native scenes detach for 150 ms before attaching their replacements, following the foundation's native attachment lesson. Acceptance uses the normal-speed full game; accelerated 10× integration trials stalled without JS exceptions and are not representative of the delivered play speed. Generic camera and shimmer interpolation nodes are cached rather than recreated on each view publication. Three all-bot teams are the existing solo configuration; the G2 demo supplies the fourth team through its phone.

## 2026-10-13 · Native capture refinements

The settled native standings exposed adjacent-row overlap from the initial -30 px delta position. Restore the reference’s -16 px position and lift score glyphs 3 px, leaving the tag above its own score and clear of the preceding score. Capture standings after the reorder settles.

The photo mask timeline includes the core’s 20 ms scan-to-meter gap and 800 ms meter fill before its 450 ms hold. Native comparison captures run live: the game’s pause action opens the remote menu, so paused screenshots cannot serve as scene evidence. Encode the 60 fps clips after play to avoid missing short capture states under CPU load.

**Face redaction tuned on real photos (Oct 13).** On 12 licensed face photos and 64 object
photos, the first settings (confidence 0.5 plus a retry) blurred every face but put a
mosaic over 11 objects, the very thing a player shows off. Confidence 0.7, no retry, and
sanity limits on box size and aspect ratio keep 12/12 faces and 0/64 false positives.
Padding is 25% on the sides and bottom and 45% on top, so foreheads are fully covered.
The full sweep is in `docs/review/eval/face-redaction-sweep.md`. Photo credits are in the
test set's `manifest.json` (23 of the photos are CC BY or BY-SA, so we keep the
attribution with them).

## 2026-10-13 · Native stall resolved, integration state, usage

**Native googly eyes:** each sticker's pupils follow precomputed 30 Hz trajectories, played
on one RN core `Animated` clock (native driver) using the reference eye bitmaps, with
layers attached in stages over about 1 s at startup. Per-frame shared values, worklet
pupils, and a 15 Hz React-state loop all stalled frame presentation on Vega (logged in
FRICTION.md). The parade moved to a single shared scalar clock for the same reason.
Verification uses normal speed: the 10× fast mode floods the VVD and is not a valid
stall check.

**Usage (Nick, Oct 13):** Codex Sol workers do the heavy lifting. Claude subagents only for
taste reviews and mock judging, on Sonnet unless it is a final taste call. The lead
batches check-ins (at most every 15 minutes) and compacts at phase boundaries.

## 2026-10-13 · Director showcase and capture isolation

- Showcase is an explicit `GameOptions.showcase` seed plus checked script and
  `playShowcase()` call in an empty lobby. It stages four reference-art actors,
  excludes external phone input/thumbnails, and uses the normal award arithmetic.
  The native TV toggle is left to the TV owner. No production wire shape changes.
- PINK / PIRATE / WEIRDEST, catalog names/brags, a close final and ballots
  0→3 / 1→0 / 2→0 / 3→1 give a two-vote Sockrates win and a last-round champion
  change. Normal omitted/false options compare identically in full-game tests.
- The occupied VVD lock was respected. Web rehearsal uses guarded in-memory
  mockup hooks and synthetic illustrations. It is tooling evidence, not proof of
  a Fire TV runtime. A separate opt-in native renderer bridge supplies exact
  seeded seek/hold/play controls without changing the production relay.
- The reference's random 10×10 scan squares are replaced in the capture adapter
  by a real shared-judge 24×24 synthetic closest-20% mask, lit above the sticker.
  Its scan/beam pose is held briefly for PNG capture, then resumed. Lobby stills
  use the settled four-team beat. The 3:2 thumbnail rearranges the original logo
  and stickers; its composition is deliberately distinct from the TV layout.
- Capture masters/scene clips stay outside git. Previews use H.264 CRF 28 / slow,
  ≤10 MB each; masters use H.264 CRF 17. Web rehearsal is silent 1080p30 and VVD
  requests 1080p60. Neither encoded rate is claimed as unique rendered FPS.
  Native replay segments reserve one second of the ≤170-second recorder limit
  for startup and overlap by two seconds; the edit removes overlap once.

## 2026-10-13 · TV photo worker: one mask and room-memory photo art

The judge photo mask now merges adjacent on-cells per row into one SVG Path. One animated Rect clip follows the exact reference scan beam, then holds the whole path through the 820 ms scan-to-meter interval, 800 ms meter completion and 450 ms extra hold before its 220 ms fade. There are no row/cell animation nodes or timers. The existing 24×24 wire mask and score arithmetic are unchanged.

Native photo die cuts use the calibrated alpha coverage from assets/photos/mask-384.png, applied once to each center-cover photo in room memory. A transparent 320×320 PNG sits between the original shadow and frame assets; eyes and the single-path judge overlay retain their layer order. This replaces native rounded Image clipping and avoids dynamic SVG image-mask composition. The source JPEG, composed PNG and completed in-memory URI are shared across scenes, with no filesystem or disk cache; room replacement/close clears them, and late requests cannot repopulate a closed room. Web keeps the reference SVG art-mask compositor. This is a native drawing adaptation, with no shape or timing change to the game contract.


## 2026-10-13 · TV photo worker: native effects and joined-team layout

The integrated native phone game required more than the photo-only replacement. Particle geometry now projects the existing physics at 30 Hz and plays the active paths from one native progress clock. The background projects the reference geometry and palette approach at 20 Hz, preserving its seeds, palette, rates, count and timing. This is interpolation sampling for Vega; it does not change the game, wire protocol or scoring. One StageProvider publishes the TV view, and native subscriber/frame updates are batched. New motion waits for its native layout attachment. These changes address stalls observed outside the isolated photo fixture; the complete normal-speed G2 receipt is the acceptance gate.

Judge cards use the existing 272-pixel widths and 32-pixel gaps, with the whole group centered at x=640 for two, three or four cards. Showstopper already used the centered group formula; fresh two/three-team native fixtures verify it. The HUD renders only joined teams after the game starts, retaining four waiting slots in the lobby.

Timing clarification for the previous mask entry: the full path is lit at scan completion (800 ms), stays lit through the following 20 ms gap plus 800 ms meter fill (1620 ms), then holds for 450 ms before the 220 ms fade. The earlier wording's 820 ms interval already includes that meter fill.

The fake-camera phone harness keeps Chrome GPU enabled because Chromium 155's MediaPipe CPU pipeline still uses WebGL for input preparation. Disabling GPU caused an undefined activeTexture exception and prevented the redaction assertion; enabling it passed the unchanged assertion in all three rounds. Chrome remains muted and uses its built-in synthetic camera.


Only the newly mounted judge banner and crown opt into native entrance timing from layout attachment. Their reference spring curves, frames and duration stay intact; starting after attachment prevents a delayed native commit from showing only the completed slam pose. Other motion continues to follow the authoritative game clock. The native scored still waits seven seconds after the logical winner cue because an earlier three-second snapshot had captured the preceding header; the full bounded Color Rush video retains the entrance and purple palette transition.


Final acceptance uses the same build with the attachment-timed judge entrances: G2 completed in 249.317 seconds with zero native/phone/audio errors. The scored comparison frame is at 21.2 seconds in that native reveal clip; consecutive entrance frames show both slams and the winner's wobble, then the scored still shows the purple palette and confetti. This replaces an incorrectly timed live console still that had already reached standings. Native fanfare cold/warm decoder evidence is separate and passing. No human photo was captured or persisted.

## 2026-10-13 EDT · voice worker

- Preserve all puppet art, bounds, reactions and reference smoothing. Speech marks replace the random talking target and fixed bubble cadence only when actual Polly playback starts within 600 ms; the fallback stays 2 characters/34 ms with blips.
- Add optional `prefetchHost`, `Voice` view/settings state and a media-duration notification to the shared game adapter. Phone/relay wire messages are unchanged. An advancing long clip can extend its speech/read hold, including queued host jobs; timed hunt/mash/vote phases never await synthesis. Short host jobs reserve the adapter's 600 ms decision window.
- Polly neural cannot accept `<emphasis>` according to its official support table. Use supported rate/volume prosody for bold words and document the standard-engine literal-emphasis mapping in relay/README.md and F-VOICE-POLLY-01. No live AWS call was attempted.
- Required web verification exposed an existing missing `unstable_batchedUpdates` export. The web adapter now re-exports React DOM's batching function so the unchanged shared renderer can mount.

## 2026-10-13 EDT · voice native transport

Use fragmented AAC/MP4 through native W3C MediaSource because the tested VVD rejects
HTTP MP3 and MP3 SourceBuffer playback. The same Polly/mock MP3 remains the default
authenticated endpoint; `format=mp4` is additive. Convert only speech through the
installed FFmpeg, with four jobs maximum, a 500 ms budget and no file writes or
extra AWS calls. Native TVs prefetch the encoded bytes into the room's bounded
memory cache and sample the same word/viseme track from the media clock. This
adds FFmpeg to the relay runtime requirements; the AWS mock/live flag is unchanged.


## 2026-10-13 EDT · voice verification and native lifecycle

Native completed MediaSource players retire asynchronously instead of reloading the same element. One upcoming scripted line may hold a second voice element with buffered room-memory bytes; its decoder warms at zero volume and pauses at the first playing event. The effect/music pool is unchanged, with at most 12 live players total. Optional quips still prefetch transport bytes but do not block the scripted preparation plan.

Acceptance telemetry distinguishes actual media-start estimates from the time a fallback decision reaches JS. Unit tests enforce the 600 ms selection rule, while native full-game receipts retain observed overdue callbacks as a remaining limitation. No late clip is accepted after the deadline. The Mac remained muted; mock MP3/AAC analysis confirms silence. Visual evidence uses bot artwork only. Native capture starts after the greeting advances because recorder startup itself contends with native media setup.


## 2026-10-13 EDT · dynamic winner prefetch

The final latency audit identified the Color Rush and Showstopper winner cues as the remaining cold native sources. Once the last color match is calculated, prefetch the likely winner during its existing 2.6-second flip/scan/meter hold. Once votes close, prefetch the likely winner during the existing 1.9-second tally. Both flows still choose their actual winner at the original point, so a later fit/name update can only make a prefetched clip unused; score arithmetic, RNG order, visual reveals and timers do not change. A shared virtual-clock test checks that both actual announcements were prefetched before those holds. The native one-slot plan admits those dynamic winner triggers.


The prepared native slot now performs its only seek during zero-volume decoder warmup. Consuming that already-paused slot at the host cue does not repeat pause/seek work; the native lifecycle test checks that the seek count remains one. The 600 ms playback permission guard still applies before play, including delayed source-ready callbacks.


Brag winner speech now prefetches immediately after the mash result is known, during the existing 560 ms knockout animation. No alternative outcome is synthesized, and no timer or score changes. The virtual-clock test checks both Brag matches as well as Color Rush and Showstopper winner lead times.


## 2026-10-13 EDT · voice PCM/WAV follow-up

Per the lead's request, use Polly PCM at 16 kHz and wrap it in a 44-byte mono 16-bit LE RIFF/WAVE header in JavaScript. The marks request and authenticated TTS route stay unchanged. One room-memory WAV buffer replaces the web MP3 plus native AAC variant; duration comes from PCM byte length / 32 milliseconds. Remove the relay encoder process and binary runtime dependency. The mock uses the same header helper around one second of silence. The TV loads the WAV URL directly.

The current VVD rejects remote WAV with media error 4 even though packaged WAV SFX work; blips remain the safe fallback. The acceptance script now records the full game before reporting a failed lobby/codec check, preserving a nonzero exit status and explicit pass:false receipts. See docs/workers/voice-wav-report.md for current checks and limitations; earlier AAC transport decisions are historical.


## 2026-10-13 EDT · native speech regression repaired with pinned AAC encoder

The lead requested a 48 kHz stereo WAV trial before restoring AAC. A 3x linear-interpolation upsample with duplicated channels, correct 44-byte RIFF header, byte rate 192,000 and block alignment 4 passed header/duration and authenticated HTTP Range tests, but still returned native media error 4. Do not ship that unsuccessful upsample. Keep Polly 16 kHz mono PCM and unchanged marks; serve mono WAV on web, and restore memory-only FFmpeg AAC/fragmented MP4 plus the proven native MediaSource lifecycle. Both audio variants are zeroed with the room and support exact byte-range responses.

EC2 setup installs the versioned John Van Sickle static arm64 FFmpeg 7.0.2 archive, verifies pinned SHA-256 before extraction, checks its executable version, preserves its GPL/readme files, and links it into the existing service PATH. The downloaded checksum and static AArch64 ELF were verified; the exact binary ran and encoded silence on Linux/VVD. EC2 provisioning itself remains unrun.

Avoid allocating/retiring an unused native voice bank: prepare with an already-initialized idle element, and skip warming a replacement while the next clip is prepared. Add glow-up to the preparation plan. The acceptance driver waits for the lobby/teams greetings to finish before starting, instead of cancelling those host lines immediately. Final normal-speed native and web receipts each show 28/28 Polly lines, zero blips, zero runtime/audio exceptions. Native maximum start latency is 582 ms; web is 107 ms. See docs/workers/voice-native-fix-report.md.

## 2026-10-14 · TV polish: transport feasibility and effects beneath text

- Keep Vega transport registered as a single whole-game session, independent of the W3C music/SFX/Polly players. Pause/play are idempotent and use the existing Play/Pause path; Next uses the existing Fast-forward skip path. Idle is an explicit complete `NOT_PLAYING` state with no actions because the tested empty state update aborted the VVD app. The recommendation is **ship-unverified**: native direct-handler and core tests pass, SDK discovery and spoken Alexa/device focus remain unverified. Details: `docs/review/tv/alexa-transport.md` and friction F-POLISH1-03/04.
- The polish worker's explicit text-legibility rule overrides the mockup's effect overlay order. Put backdrops below global effects, then scene copy/cards, HUD, host/ticker and menus. Keep scan/flash/sheens below their labels. Route reactions beside the 720-pixel host bubble and fade before the 96-pixel HUD; move firework origins beside the rendered champion name. Preserve reference art, palette, type, burst recipes, velocity/gravity and timing otherwise. No shared wire/core shape changes. Audit and five-frame sheet: `docs/review/tv/effects-text-audit.md`.

## 2026-10-14 · native polish startup and speech preparation

Initialize the bounded native audio bank before attaching particle worklets. A cold full-stage launch stalled the JS/control timeline without an exception, while attaching the particle layer after media warm-up stayed responsive. This is an initialization-order fix: particles retain their recipes and remain enabled during gameplay. Use paint order on stage containers rather than assigning a nonzero z-index to every nested primitive; keep Brag's opaque backdrop separate from its foreground.

Native audio preparation now has a bounded 1,200 ms permission window instead of the web's unchanged 600 ms. The observed native decoder/callback delays exceeded 600 ms after the combined polish changes. Reserve mandatory speech/read holds through the existing speechTiming hook while a native clip prepares, and let natural typing completion wait for the remaining preparation window. Forced skips still finish immediately; hunt/mash/vote deadlines and optional quips do not acquire a speech wait. This intentionally permits longer native speech/read pacing than the reference. It is not a claim that JS deadline callbacks arrive within 1,200 ms; observed route timings and failed release attempts are retained separately.

The release audio gate can run with TV_VOICE_CAPTURE=false to avoid console-recording contention; it still requires actual advancing media-clock/marked speech telemetry, all eight core scenes, zero exceptions/audio errors and every host line routed through mock Polly. A stale console frame cannot certify native visual acceptance.

## 2026-10-14 · yield native particle planning between frame batches

The strict all-Polly game still failed at Brag winners without console recording. The native particle planner built a burst's entire future SVG path table in one synchronous JS task at the same payoff beat. Split its existing 30 Hz sampling into batches of four frames, yielding to speech/network callbacks between batches. Only one plan builds at a time; updates coalesce, scene clears/pause generations cancel obsolete work, and animation begins at the elapsed plan position instead of replaying preparation time. Tests preserve every sampled path from the original immutable snapshot and check cancellation. No particle count, recipe, geometry, color or timing changes.

## 2026-10-14 · final native preparation budget and complete-clip gate

The 1,200 ms candidate remained inconsistent: repeated strict games fell back at Brag winners and the champion, with observed native decision delays up to 1,719 ms. The current native permission window is **2,000 ms**; web remains 600 ms. Reserve mandatory preparation time in a microtask immediately after the host cue, once the core has installed its typing task/phase wait, then include the known clip duration. This prevents a short core typing hold from expiring before a late clip can extend it. Native mandatory speech/read pacing is intentionally longer than the reference; timed hunts/mash/votes and optional quips keep their deadlines. Clips arriving outside the window still use blips, and no promise waits indefinitely.

The release verifier now requires every host route to use mock Polly **and** every clip to report media-clock completion, with no post-route fallback. The earlier 28-route candidate cut one Brag clip at a scene change, so it is retained as a failed full-clip gate rather than accepted for delivery. Final evidence is under docs/review/tv/polish1/native-final; the prior native attempts remain explicitly historical.

## 2026-10-14 · Gallery worker

- The worker brief explicitly requests third-place points even though reference CSS hides `.pod.p3 span`. Keep the short 74 px podium and fit a 28 px Lilita rank above the existing 16 px Rubik points treatment.
- Add an opt-in native director renderer and a local relay-backed fake-camera phone adapter, without changing shared protocol v1 or the core showcase script/scoring. Capture all-scored judge cards with the actual phone mask held and tinted lime; retain only the small synthetic phone thumbnail in TV memory for hunt pickups. Seeks draw the existing motion-stack poses statically and preserve native media controls while clearing transient effects.
- Restore the mockup's native object hue cycle with four pre-rendered hue keyframes from the reference stickers and a 2.2-second crossfade, under the existing rainbow sheen. This approximates continuous CSS hue rotation; no geometry, original sticker art, palette tokens, scoring or normal game timing changes.
- Thumbnail v2 retains the director composition, relocates its lower sock for the new phone, and builds the glee host from the existing host-part source. Native gallery captures are silent, normal-speed, synthetic-only window captures; masters stay outside git.
- The review movie keeps the continuous native round and adds a two-second hold of the same session's captured judge winner. Live native host typing and HUD point flights can lag the core winner beat; a captured end hold makes the complete result readable without substituting rendered web pixels.

**Publishing plan for the public repo (Oct 14, Nick decides on submission day).** The rules
require a public repo with an OSI license. This working repo's history and `CLAUDE.md`
carry private coordination details (the owner's name, fleet setup, worker sessions). Plan:
at submission, publish a fresh public repo (or a fresh orphan branch) holding **one commit
of the scrubbed tree** (`tools/release/scrub.py` clean), without `CLAUDE.md`, `notes/` or
the worker-coordination docs, under the MIT license. The working repo stays private.


## 2026-10-17 · Live Mantle request compatibility

The deploy worker checked the current primary documentation while testing Opus 5,
Sonnet 5 and Haiku 4.5. Claude in Amazon Bedrock/Mantle does not currently support
structured outputs (`output_config.format`); Haiku 4.5 also does not support the
effort parameter. Remove the format request on Mantle and omit effort for the
Haiku candidate; retain low effort for Opus/Sonnet. The exact canonical JSON prompt,
local strict result validation/clamping, one-call limit, four-second abort and wire
shape remain unchanged. This corrects the older relay brief's unsupported request
options. Stubbed SDK transport tests exercise all three candidates. Live account
403 responses remain a separate access gate, recorded in docs/release/live.md.

Sources checked Oct 17: https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock#features-not-supported,
https://platform.claude.com/docs/en/build-with-claude/structured-outputs#compatibility,
and https://platform.claude.com/docs/en/build-with-claude/effort#compatibility.

## 2026-10-17 · Owner chooses Claude Opus 5.5 for naming

Nick explicitly requested Opus 5.5 while preparing the first stick test. Target
the catalog-confirmed `anthropic.claude-opus-5-5` for the photo naming, brags,
fit score, and host quip. This supersedes the previous preference for Opus 5
over the fastest benchmark candidate. Retain the four-second fallback and
dedicated workspace with retention `none`. Verify live access and five image
calls before applying the prepared model-scoped runtime policy and environment;
do not report fallback success as live Claude inference. Current access and
activation status are recorded in `docs/release/opus55-access.json`.

Nick subsequently accepted Opus 5 or Sonnet 5+ as alternatives. Prefer an
accessible model among those accepted choices, with the existing four-second
fallback and successful image/latency checks. Fresh Opus 5/Sonnet 5 probes still
return the same account-access 403; no alternative has been selected or deployed.

Nick authorized submission of the AWS access request and requested a fallback
for the meantime. Submit the account-level access case through AWS Basic Support
with Web/email replies. Retain the existing built-in fallback names/brags/quips
and four-second deadline; the hosted verification returned fallback in 96 ms
with live Polly working. There is no need for another provider or a paid support
plan. A successful later Claude invocation is accepted by the existing reader.

## 2026-10-17 · Retail-stick lifecycle, media and control corrections

The actual App.Show composition reused one sibling key for scenes, particles and
the host. A negative control reproduces six live scene layers and four particle
fields after staged startup and one update. Give each layer its own key; a mounted
React regression traverses all eight scenes, presentation changes and unmount.
Remove the large boot title and explicitly replace the startup native container.
This is an application lifecycle bug, not evidence of a platform rendering bug.

Negotiate native image variants without changing protocol v1. Keep player bytes
in relay RAM: sharp creates the exact calibrated 320-pixel alpha-masked PNG and
pixelated preview; authenticated no-store routes serve PNG or its base64 form.
Fetch the native photo on snag arrival, before the short judge scan. The TV avoids
JPEG decoding, full-resolution masking and byte-by-byte base64 conversion during
reveals. Cache variants once, bound preview work, discard late jobs and zero image
buffers on room disposal. The browser transport and phone's color scoring stay the
same. Clear TV photo caches when a new game starts.

Native particle plans proved expensive on the 1 GB stick even after yielding.
Transfer immutable initial conditions and evaluate the same 30 Hz Euler physics
in closed form on the UI runtime, batching the visible SVG paths by color/alpha.
Reference comparisons cover every frame, every shape, fades, gravity and drag;
rounding differences are bounded to a tenth of a logical pixel. Preserve particle
counts, recipes and choreography. Precompile motion samplers, compact interpolation
data and reuse host artwork while typing.

Accept a validated application clock ping as connection liveness for native
WebSocket implementations that do not send protocol pong. Malformed pings still
expire. Latch a disconnect-managed pause across failed retries while preserving a
deliberate user pause. Declare the inputd service and use BackHandler alone for
native Back, since TVEventHandler can deliver the same press later. The manifest
uses a 1,800-second component inactivity timeout for phone-controlled games; this
does not claim a generic device/display wake lock. All changes require separate
normal-speed retail-stick and production-package acceptance before handoff.


## 2026-10-17 · Background release and physical-test memory hygiene

Request every native audio pause/deinitialize synchronously before awaiting completion; JavaScript can suspend between awaited releases in the background. Unmount the stage, then use Vega FastImage 4.0.0's public clearMemoryCache method to release the native image/graphics cache. The app-deployed helper uses the SDK 0.24 ABI, stays out of browser builds, and retains its Program Materials notice. Hardware recovery remains a separate gate.

The device CLI retained uploaded packages and completed traces in RAM-backed /tmp. These session-owned files accumulated to 454 MiB of its 476 MiB capacity, distorting memory and performance conditions. Explicit cleanup returns it to 652 KiB. Delete each upload after successful installation and each completed trace after its local copy; never clear unrelated system files. Device-game acceptance now refuses more than 64 MiB already used in /tmp. Earlier traces are historical observations with this caveat, not clean-device code comparisons.

Offscreen stage and static-card cache experiments did not improve the measured workload and were removed. Keep direct native 1080p rendering; no TV display preference was changed. The system's five-minute idle/screensaver policy is independent of the component inactivity timeout. Owner approval and the on-TV PIN are still required to extend that preference; the app does not inject periodic remote input.

## 2026-10-18 · Render the active-game backdrop with Vega video

The native game must remain visible while players use their phones. The Builder
Tools docs and Amazon's current [screensaver explanation](https://community.amazondeveloper.com/t/vega-os-no-api-or-device-setting-to-keep-the-display-awake-for-non-media-signage-kiosk-apps-screensaver-engages-despite-foreground-app/28610)
confirm there is no public wake-lock API for a non-media foreground app. Media
control metadata alone does not hold the display. SDK user-engagement hints describe
existing audio/video capability use; they are not a general game wake lock.

The October18 candidate plays the actual animated stage artwork as local H.264
video behind the native game UI during a game. Five ten-second, silent 720p30
clips come directly from the approved reference BG.draw, with a one-second loop
dissolve. Every source clip is below3 MiB. The lobby keeps its native backdrop;
completion and backgrounding request immediate decoder release. Initialization
that finishes after unmount releases without starting playback. Four lifecycle
regressions and the full509-check suite pass. Initial device pictures show the
video behind the native UI; full-game, loop and idle behavior remain under test.
No device idle preference has changed, and no synthetic remote input keeps it awake.

## 2026-10-20 · TV scenes prioritize couch-distance clarity

The clarity worker's explicit brief supersedes the reference's small text. Scene team names now request a 24-logical-pixel floor (36 px at 1080p), retain full names and team colors, and use static high-contrast backing where needed. Existing motion targets, phase timing, scoring and shared protocol stay unchanged. Static layout makes active hunt/glow-up/mash/vote instructions dominant and exposes winner identity, match/vote totals, score awards and championship margin.

Deliberate visual adaptations: larger lobby join/code/QR copy; a rule panel behind round subtitles; shorter standings bars with a separate delta column; slightly smaller Brag/Show objects to reserve readable labels; Showstopper vote/score totals replace brag copy only while voting/results; full podium name plates and rematch copy. The Showstopper DOUBLE POINTS ornament is replaced by its current actual scoring rule without changing core rules or host copy. Before/after/reference comparisons for twenty states and 25% downscales are in `docs/review/clarity/`.

Stage changes are limited and additive: `CameraFeed.largeStatus`, `TeamName.minSize` (default 16, scenes opt into 24), and a browser-only AppState adapter that treats Vega's moduleChange subscription as a no-op. No scene gains an animated node, per-frame value or timer. This is a web visual review; the stick worker owns native performance/lifecycle acceptance.


## 2026-10-20 · Native celebration and calm stage budget

Nick’s physical finale photo and `docs/design/tv-direction.md` supersede the mockup’s continuous effects. Native rings were live SVG strokes from slam/ring cues; the particle field also accepted perpetual finale fireworks and automatic crowd reactions. Native now ignores that web simulation and triggers one pre-rendered 40-piece confetti sheet per snag lock, judge winner, knockout, Showstopper winner and champion reveal. One native-driver clock moves/fades the sheet for 2.2 seconds, behind scene content; its native opacity reaches zero before JS retirement. Pause/scene disposal cancels pending beats. Web retains the original effect simulation.

Native mood, soft glow and vignette are baked into a single quiet backdrop raster. Visible silent video repeats that identical raster during play for the existing media keep-awake path; release has the same raster beneath it. No device timeout, preference or repeated input is changed. The ticker is the only decorative loop: native parade, sticker eyes, trophy float, foil hue, marquee chase and stripes hold intentional poses. Host speech jaw/typing, result entrances, interactive mash response and countdown changes remain functional motion. Closing host copy remains visible on the completed finale. Name plates, fourth place, Object of the Night and other scene layouts come from `w/clarity`.

This is an explicit fidelity adaptation for the 1 GB stick: quiet palette from the reference, no decorative stage outlines or moving rays/grid/cones, a short sparse payoff instead of continuous fireworks/confetti. Native captures, timing bounds and independent render-frame measurements live in `docs/review/stick-vs-mockup/`. Production readiness still requires uninterrupted game/rematch and photo-bearing Home recovery.


## 2026-10-20 · Lead notes 2 supersedes worker visual implementation

Nick assigns every design choice to the lead on `w/clarity`. The preceding worker-authored calm backdrops, replacement confetti sheet, held decorative poses, host visibility change and raster wipe have been backed out of the source. They are not a proposed design. Their screenshots/performance numbers are superseded and archived outside the checkout. The failed audio-atlas implementation is also backed out; failure receipts remain diagnostic history.

The only new visual behavior is a temporary, named native finale particle cutoff: `DISABLE_NATIVE_FINALE_PARTICLES` in `tv/src/stage/native-effects-policy.ts`. It prevents rings/confetti/fireworks/crowd particle rendering and simulation while scene `champ` is active. Web and all other scenes keep the lead's renderer. The lead supplies any replacement. Lifecycle fixes, neutral capture instrumentation and native frame measurement remain device-worker work.

## 2026-10-20 · Stick freezes: no synchronous media loads during play (device driver)

Evidence: whole-game frame trace on the stick (`docs/review/stick-vs-mockup/perf.md`). The
baseline game ran at 10.6 fps with 447 gaps over 100 ms and was killed by the Thread Monitor
inside an SFX player's `src` setter. On Vega the media `src` setter runs a synchronous native
load on the JS thread (p50 119 ms, max 835 ms, once never returned).

- **SFX:** every effect voice loads one PCM atlas (`sfx-atlas.wav`, 112 unchanged clips with
  0.3 s silence between them, bit-exact) once at preload. A cue seeks and plays, and a timer
  pauses at the clip end. Rejected: one player per effect id (38 ids would need 38 audio
  streams on a stick whose audio server already ran out of streams) and dropping rare effects.
  The earlier atlas attempt's "failure" receipt was taken while the stick's audio server was
  out of streams (code 3 on every player), so it did not test the atlas.
- **Audio `code: 3`:** `Failed to initialize audio stream` (novaaudiosink) occurred in every
  app session before the 20:31 reboot and in none after, including two full games. That
  points to audio-server stream exhaustion that built up across many killed app instances,
  not to our files or codecs. A relaunch-repeat check is still to do on the stick. A family
  launches the app once, but the fewer audio players we hold, the safer.
- **Backdrop video:** one decoder per game (`NATIVE_BACKDROP_SINGLE_DECODER`). Other moods and
  the judge/finale palettes cover it with the still mood raster. That is a look change, so it
  is flagged for the lead.
- **Motion tables:** one sample per 30 fps frame (the stick's ceiling) and an LRU cache keyed
  by relative timing, so tables are not rebuilt for every round and team.
- **Polly attach:** waits 900 ms after any scene/phase cue. The attach itself is unchanged
  because MediaSource reuse across lines is untested on Vega.
- **Judge beam:** native drops the only blurred shadow in the app (`DISABLE_NATIVE_BLUR_SHADOWS`).
  This is a look change, flagged for the lead.
- **Measurement:** the `graphics` trace category covers a full game in one 96 MB buffer, so
  per-scene numbers come from one uninterrupted game rather than 15-second windows. The
  profiler leaves 56–110 MB of finished trace in the stick's RAM-backed `/tmp`, so the verdict
  script deletes it after each run.
