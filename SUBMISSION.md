# Snag & Brag: Devpost write-up (final, Oct 23)

> Paste each section into the matching Devpost field. Nick clicks Submit.

## Video

**YouTube title:** Snag & Brag: a Fire TV game show where your phones are the cameras
**YouTube description:** Snag & Brag is a family party game for Fire TV, built natively
for Vega OS. Every phone in the room is a camera and controller: scan a QR code, hunt the
house, and let Sir Socksworth (voiced by Amazon Polly) judge your finds. Play solo with
bots on one phone. Code and Fire TV packages: https://github.com/nickfromlater/snag-and-brag-fire-tv
Built for the Amazon Build, Ship, Shape hackathon (Fire TV track).

**Tagline:** A Fire TV game show where your phones are the cameras and your stuff is the star.

**Track:** Fire TV. **Mini challenge:** AWS Builder.
**Fire TV priority categories:** Family entertainment · Multi-modal UX · Computer vision.

## Inspiration

Family game night on the TV usually means passing around one remote, or buying controllers
nobody else in the house owns. Everyone already has a phone with a good camera, and every
house is full of strange, wonderful stuff. We wanted a game that gets people *off* the
couch, running around the house, and then back on it, shouting at the TV.

## What it does

Snag & Brag is a party game show for 2 to 4 teams, about 5 minutes long, hosted on the TV by Sir
Socksworth, a posh sock puppet. Each team joins by scanning a QR code: nothing to install,
no accounts. Every round:

1. **The prompt reel spins** ("Snag the most RED thing in the house", "Something a PIRATE
   would steal").
2. **Teams hunt** with their phone's camera. The TV shows a live, deliberately pixelated
   feed tile from each phone, so the room can watch the chaos.
3. **Glow-up:** each team sticks googly eyes on its photo and picks a stage name and a
   brag line from Sir Socksworth's suggestions.
4. **The reveal,** different every round:
   - **Color Rush:** the **Pixel Judge**. On-device computer vision measures the color match
     in CIELAB space, and the TV lights up exactly the pixels that matched.
   - **Brag-Off:** head-to-head brackets where the whole room mashes their phones to win
     a tug-of-war.
   - **Showstopper:** finds parade onto pedestals and the room votes. The winner goes
     holographic.

Standings race after every round, and the finale crowns the champions and the Object of
the Night. **Solo mode** fills the room with three bot teams, so one person with one phone
can play a whole game.

The TV side runs entirely from the Fire TV remote: lobby options, a pause menu, skip, and a
confirm before Back leaves a live game.

## How we built it

- **Fire TV app:** native React Native on **Vega OS** (SDK 0.24), not a web view. A
  1280×720 stage scaled to 1080p; vector backgrounds and batched particle paths;
  pre-rendered sticker art; native-driver animation; pooled audio for low-latency effects.
  The TV is the game host: it owns the state machine, the timers and the bots, like a
  console. We profiled every scene on a real Fire TV Stick 4K Select with the Vega profiler
  (Perfetto traces of every presented frame) and ablated it layer by layer, which took a
  full game on the stick from about 10 fps to over 30 fps.
- **Phone controller:** a plain TypeScript web page (Vite). It uses the camera
  (`getUserMedia`, with a file-picker fallback), runs the Pixel Judge on the phone, streams
  96×64 thumbnails at 3 fps, and reconnects automatically.
- **Room service on AWS:** a small Node relay on EC2 behind CloudFront (WebSockets, one
  origin, free HTTPS). It handles rooms, clock sync (every deadline is server time), and
  photo memory that is never written to disk or logs.
- **AI pipeline:**
  - The phone's computer vision scores the photo.
  - The relay is wired to send each photo to **Claude on Amazon Bedrock** (structured JSON:
    the object, three stage names, two brags, a fit score and a host quip) within a 4-second
    budget. Our account's model access is still pending, so today a built-in catalog
    answers instantly and the show never waits.
  - **Amazon Polly** voices Sir Socksworth, and its viseme speech marks drive his mouth.
    Lines are prefetched per room; a line that arrives late falls back to voice blips.
- **Tooling:** the Amazon Devices Builder Tools MCP for documentation search and early
  trace analysis; the Vega CLI and profiler for scaffolding, packaging and device traces.
  A team of AI coding agents did the implementation, directed against an approved design
  mockup.

## Challenges

- **Native 2D on a 1 GB stick.** We found no official Skia port for Vega, and its GL view
  wouldn't compose with React Native UI. We built the whole show from native SVG paths, pre-rendered sticker
  bitmaps and native-driver animation, with background and particles batched into a few
  paths at 30 Hz.
- **Finding the frame cost.** On the stick, ordinary styles have very different costs: dashed
  borders, a rotated rounded clip, a video backdrop surface under the UI, and large vector
  drawings (re-rasterized every frame) each cost frame rate. Per-layer ablation with the
  profiler found each one; dashed borders, clips and the video backdrop now use plain views
  and still rasters, and large vector drawings are next.
- **Frames that silently stopped.** Several native workloads (googly eyes with
  per-frame physics, a parade on chained animations, a 576-cell photo overlay) made Vega
  stop presenting frames without a single exception. The fix was the same every time: one
  clock driving a few nodes, with the physics precomputed as trajectories and played on a
  native-driver animation. Every finding, with numbers and minimal repros, is in
  [FRICTION.md](https://github.com/nickfromlater/snag-and-brag-fire-tv/blob/main/FRICTION.md).
- **Sound on a TV.** Dozens of overlapping effects exhausted the native audio sinks, and
  relay-served MP3 and WAV wouldn't play. A bounded, reused player pool and AAC for the
  host's voice worked around both.
- **Privacy without hurting the game.** Face blur on the phone first blurred peppers and
  frying pans too. Tuning it on a licensed test set got to 12/12 faces and 0/64 objects
  blurred.
- **Honest scoring.** Our real-photo benchmark showed the speed bonus could crown an
  orange thing "Most RED", so the crown now follows the color match, while points still
  reward speed.

## Accomplishments

- A complete game show: every scene of the approved design built natively at 1080p on Vega
  OS and adapted for a 1 GB stick, hosted by Sir Socksworth in an Amazon Polly voice.
- Full hosted games plus a rematch pass on the retail Fire TV Stick 4K Select: photos,
  googly eyes, the Pixel Judge lighting up the matched pixels, the mash, the vote and the
  finale.
- Computer vision you can see, and privacy you don't have to think about: color judging and
  face blur both run on the phone, and photos never touch a disk.
- Hosted on AWS end to end: a phone anywhere joins the TV by QR code with nothing to install,
  and the backend stays up for judging with a health check and a budget alarm.
- Profiling every scene on the device took a full game on the Fire TV Stick 4K Select from
  about 10 fps to over 30 fps.

## What we learned

- On Vega, the shape of the animation graph matters more than the drawing cost: fewer,
  longer-lived nodes on one clock beat many small animated pieces.
- Measure on real data. 64 real photos showed scores spread from 2 to 88 and exposed the
  speed-bonus flaw before any player hit it.
- Design the TV for a room, not a player: the host addresses teams by name, nothing says
  "you", and every payoff moment stays readable from the couch.

## What's next

- An iOS app for the controller, with haptics and offline photo stickers.
- Up to 8 teams, and team-vs-team over the internet for families in different homes.
- **Seasonal prompt packs** (Halloween, holidays, back to school) as the business model,
  plus classroom and corporate team-building editions.
- Publishing to the Fire TV Appstore.

## Built with

Vega SDK · React Native · Amazon Devices Builder Tools (MCP) · Amazon Bedrock (Claude) ·
Amazon Polly · Amazon EC2 · Amazon CloudFront · Route 53 health checks · TypeScript ·
Node.js · Vite
