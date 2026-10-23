# Relay

Node 24 + `ws` room transport for Snag & Brag. The TV is the game host; this
package owns pairing, server time, transient JPEG/voice memory, Bedrock and Polly.
The wire contract is unchanged in `shared/src/protocol.ts`.

## Run

From the repository root:

Node 24 and pnpm 12.10.1 were used for verification; the EC2 setup pins those
versions. The workspace permits esbuild's required install script.

```sh
export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
pnpm install
pnpm --filter relay dev
```

The relay listens on `:8787`. Local startup defaults to mock AI and mock Polly;
it makes no AWS calls. Connect a TV/phone WebSocket at `ws://localhost:8787/ws`.
`GET http://localhost:8787/healthz` reports counts and service modes. The phone
worker's built `phone/dist` is served at `/` when present; otherwise `/` returns
404. Build the phone package before using the QR join URL. `pnpm --filter relay
start` runs without a watcher.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` / `PORT` | `0.0.0.0` / `8787` | Listener; production uses loopback behind nginx. |
| `PUBLIC_URL` | `http://localhost:8787` | Public origin used for `welcome.joinUrl`. |
| `PHONE_DIST` | repository `phone/dist` | Optional static build directory. |
| `AI_MODE` | `mock` without a model, otherwise `bedrock` | Force offline or live vision. |
| `AI_MOCK_DELAY_MS` | `150` | Deterministic fake-read delay; `4500` exercises fallback. |
| `BEDROCK_MODEL_ID` | unset | Lead selects an enabled vision model, e.g. `anthropic.claude-opus-5`. |
| `BEDROCK_WORKSPACE_ID` | account default locally | Deployment sets a dedicated zero-retention workspace. |
| `AWS_REGION` | `us-east-1` for mocks | Required explicitly for live services. |
| `POLLY_MODE` | `mock` | Set `aws` to enable speech synthesis. |
| `POLLY_MOCK_DELAY_MS` | `80` | `5500` exercises the five-second voice budget. |
| `POLLY_VOICE` | Arthur, then Brian if unavailable | Optional explicit British voice override. |
| `ORIGIN_SECRET` | unset locally | 64 lowercase hex characters; deployment adds the matching CloudFront header. |

Live adapters use the standard AWS credential chain (environment, profile or
instance role). The deploy instructions load the lead's local CLI credentials
from `~/secrets`; the instance uses its role. Credentials are never included in
the release. Mantle SDK logging is disabled explicitly.

## Behavior and limits

- TV `hello` opens a consonant-only, four-letter room with independent 128-bit
  `tvKey` and `roomKey`. TV resume replaces the previous socket. Rooms survive
  120 seconds of TV absence and expire after three hours. The TV gets current
  phone presence on resume; it owns replay of phone screens.
  Phone drops during TV absence replay as presence updates too. Ordinary phone
  messages during TV absence receive `NO_ROOM`; accepted snags remain queued.
- Eight concurrent phones maximum; the persistent 32-hex-character `cid`
  replaces an older socket. Presence, routing and server timestamps follow the
  shared protocol. Clock pongs are synchronous and never wait on service jobs.
- Text frames: 16 KiB; socket traffic: 60 frames/s; thumbnails: 16 KiB and
  5/s; JPEG snags: 400 KiB, checked for JPEG magic. The WebSocket transport
  closes frames beyond the binary maximum with code 1009; smaller invalid
  frames receive `BAD_MSG`. Socket pong timeout: 30 seconds; unauthenticated
  sockets expire after ten seconds; maximum 500 rooms / 5,000 connections.
- Thumbnails are forwarded with a trusted `cid` and never stored. At 256 KiB
  of TV backpressure they are dropped. Reliable traffic exceeding 4 MiB
  disconnects the slow socket. Accepted snags remain in room memory, and their
  unsent notifications replay on TV resume. The oldest photo is evicted at 40.
- `GET /p/:code/:photoId?k=roomKey` and
  `GET /tts/:code/:id?k=roomKey` are open-CORS, `no-store`, keyed reads.
  Unknown IDs and wrong keys return the same 404. Keys never appear in logs.
- Every snag starts one read. The four-second budget starts at arrival and
  includes downscaling, credential resolution, the request and JSON validation.
  Bedrock receives a smaller inference copy up to 512 px; the original JPEG
  remains in memory. Resize time/byte counts and total latency are numeric logs.
  A refused, truncated, invalid, failed or late read returns the shared fallback
  lists, score 5 and `fallback: true` to TV and phone. No retries.
  Each fallback samples three distinct names and two distinct brags at random.
  Six short Sir Socksworth quips supply the host line; the previous fallback quip
  is excluded within that room, including simultaneous failures and TV resume.
  Phone-supplied prompt text must exactly match a canonical `promptText` from
  `COLORS`, `BRAGP` or `SHOWP`. Any other string becomes
  `Snag something from around the house` before the provider sees it; the snag
  still gets a read. The existing 4 KiB binary-header limit bounds that input.
  Structured output uses the SDK's `zodOutputFormat` helper; local validation
  enforces counts and clamps lengths/score independently.
- Polly converts host copy to escaped SSML at 90% rate, requests neural 16 kHz PCM and
  word/viseme marks with identical SSML, and returns `ok:false` after five seconds
  or on error. The TV uses blips if playback has not begun within 600 ms. Mock
  Polly serves a valid one-second silent WAV with fake marks. Relay smoke never
  plays or writes audio; TV integration tests play it with the Mac muted.
  Forty clips and four pending requests per room;
  text up to 1,000 characters, clips up to 1 MiB, marks replies within 16 KiB.
  Reusing a TTS id is idempotent; use a new id for a new line.
- Room closure aborts pending work, zeroes retained photo/audio buffers,
  clears maps and marks, destroys keys, and closes its WebSockets. libvips
  image caching is disabled. No upload path, database, bucket, payload log or
  photo fixture file exists. The deploy proxy disables response/request
  buffering, temporary proxy files and access/error logs; swap/core dumps are
  disabled. Only finite numbers and enumerated reasons pass the relay logger.
- Static HTML is `no-cache`, Vite-style hashed assets are immutable for a year,
  and other static files cache for five minutes. Paths cannot escape the dist
  root, including through symlinks.

## Verify

```sh
pnpm test
pnpm typecheck
pnpm --filter relay load
```

Tests use real `ws` clients on random loopback ports, a stub TV, synthetic JPEGs
generated in memory and local SDK response stubs. They cover creation, pairing,
resume/replacement, routing, all screen shapes, clock priority, binary frames,
keyed HTTP reads, memory zeroing, timeouts, caps, voice, static files and health.

The load script is outside CI: 50 rooms × four phones × three thumbnails/s for
60 seconds. It reports delivered frames, p50/p95 and RSS/heap/external memory.
By default it starts an isolated offline relay; its memory includes both server
and generator. Set `LOAD_URL=wss://<host>/ws` to test a running instance (then
memory measurements describe only the generator).

Manual smoke calls, **for the lead after AWS access arrives**:

```sh
# Run in a fresh shell; do not enable shell tracing.
set -a
source ~/secrets/snag-aws.env
set +a
export AWS_REGION=us-east-1
export BEDROCK_MODEL_ID=anthropic.claude-opus-5  # replace with the enabled model
read BEDROCK_WORKSPACE_ID MANTLE_PROJECT_ARN < <(pnpm --silent --filter relay setup:mantle)
export BEDROCK_WORKSPACE_ID MANTLE_PROJECT_ARN
pnpm --filter relay smoke:bedrock
pnpm --filter relay smoke:polly
```

Bedrock smoke makes one live call on a synthetic red square and prints latency
and the parsed read. Polly smoke makes the two synthesis requests, prints
latency/duration/marks, and discards its audio without playback or file writes.
Both exit nonzero on fallback/failure. `setup:mantle` creates/reuses a dedicated
workspace and verifies its zero-retention mode before the smoke; it sends no
images and needs the deployment identity's project create/get/update access.
None of these scripts has been run against AWS here.

## Sir Socksworth: switch mock to live Polly

The TV requests every host line through the existing `tts` message and authenticated
`GET /tts/<code>/<id>?k=<roomKey>`. Fixed and dynamic lines are cached only in room
memory. A TV room cache holds up to 32 ready clips, submits at most two requests
at once, and prefetches known upcoming lines while the current line plays. Cached
relay clips use LRU eviction; all room audio and marks are dropped on room closure.

For a local, credential-free check:

```sh
AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start
# In another shell; silent audio is analyzed, never played aloud.
AI_MODE=mock POLLY_MODE=mock pnpm --filter relay smoke:polly
```

Once the lead supplies AWS access, load credentials without echoing them, then
restart the relay with **only `POLLY_MODE` changed to `aws`**. The TV needs no new
build or flag. `AWS_REGION` and the standard AWS credential chain must be configured;
the identity needs `polly:SynthesizeSpeech`. Keep `AI_MODE=mock` when testing only voice.

```sh
set -a
source ~/secrets/snag-aws.env
set +a
export AWS_REGION=us-east-1
AI_MODE=mock POLLY_MODE=aws pnpm --filter relay start
```

In a separate credential-loaded shell, `AI_MODE=mock POLLY_MODE=aws pnpm --filter
relay smoke:polly` makes two billable requests (PCM and word/viseme marks), with an
Arthur-to-Brian retry if Arthur is unavailable. It prints latency, duration, marks
and byte count, exits nonzero on failure, zeroes the audio, and never writes or plays
it. Omitting `POLLY_MODE` from the smoke command selects live AWS deliberately.

Default delivery is Arthur, neural, en-GB; set `POLLY_VOICE=Brian` to select Brian.
Bold text is preserved through synthesis. Neural Polly does not support
`<emphasis>`: bold words use supported 85% rate/+2 dB prosody inside the overall 90%
rate. The SSML mapper retains literal `<emphasis>` for standard-engine use.
Names and AI quips are XML-escaped. See [Polly SSML support](https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html).

Start a fresh TV room after restarting the relay so a room's mock clips cannot
be mistaken for live clips. `Voice OFF` uses reference blips, `Sound OFF` mutes
both Polly and blips, and `Music` remains independent. No live AWS call has been
made by the voice worker; AWS permissions, region availability and spoken quality
remain to be verified with the lead's keys.

Polly audio is cached as a memory-only WAV buffer for web. Audio is
requested with `OutputFormat: 'pcm'`, `SampleRate: '16000'` and the existing neural
voice/SSML. Plain JavaScript adds a 44-byte RIFF/WAVE header (PCM format 1, mono,
16-bit little-endian, 16 kHz, 32,000 bytes/second). Duration is PCM byte length /
32 milliseconds. The separate word/viseme JSON request is unchanged.

`GET /tts/<code>/<id>?k=<roomKey>` serves `audio/wav` with `Cache-Control: no-store`.
Eviction/room closure zeroes its buffers. Mock speech uses the same header helper
with one second of zero PCM. `POLLY_MODE=aws` remains the mock-to-live switch.

Native Vega uses `&format=mp4`: the relay pipes the WAV through FFmpeg to a bounded
fragmented AAC/MP4 buffer, cached per clip and played through MediaSource. This
restores the verified native path: remote WAV still failed with error 4 even after
a JavaScript 3x linear upsample to 48 kHz stereo matching the bundled SFX format.
Both audio variants stay in room memory; conversion writes no audio file and adds
no Polly call. Authenticated TTS GET supports single HTTP byte ranges (206/416),
with exact Content-Length, Content-Range and Accept-Ranges; HEAD returns the full
representation length without a body.

Local native development requires `ffmpeg` on PATH. EC2
[deploy/setup.sh](deploy/setup.sh) installs the static Linux arm64 7.0.2 build in
`/opt/ffmpeg-7.0.2`, with `/usr/local/bin/ffmpeg` linked into the service's PATH.
The versioned vendor archive is pinned by SHA-256 and checked before extraction;
a failed download/checksum leaves an existing encoder untouched. Version and
license files are installed with it. See [deploy/README.md](deploy/README.md).

## Deploy and handoff

[deploy/README.md](deploy/README.md) has exact AWS CLI steps, systemd/nginx setup,
IAM templates, CloudFront settings, the health alarm, a $50 budget and cost
estimates. All infrastructure steps remain unrun. The policy adds the Mantle
inference permission required by the selected SDK; `bedrock:InvokeModel` alone
targets a different endpoint. This is the only API-related change to the brief;
see the dated entry in [FRICTION.md](../FRICTION.md).

No visual mockup changes or shared protocol changes. Offline reads and a fixed
silent mock voice implement the requested development stand-ins. Cloud deployment,
live model/voice latency, account permissions and the merged phone/TV integration
await the lead's credentials/builds. The server package and deploy plumbing are
ready for those checks.
