# Family-test deployment · October 17, 2026

**Native retest is pending.** The previous package/hash below is historical and
failed the first physical game. It has not been replaced or promoted yet.
The corrected diagnostic build is undergoing native frame-rate, complete-game,
background-recovery and production-control checks. Follow the ready notice only
after those checks pass; `STATUS.md` and `docs/HANDOFF.md` track current findings.

- **Phone:** https://d2q0olvpmfmvjn.cloudfront.net/
- **Health:** https://d2q0olvpmfmvjn.cloudfront.net/healthz
- **Stick build:** `~/builds/snag-and-brag/tv_armv7-live.vpkg`
- **TV WebSocket:** `wss://d2q0olvpmfmvjn.cloudfront.net/ws`

The AWS relay is live in us-east-1. Polly uses Arthur. Bedrock is enabled with
`anthropic.claude-opus-5`; account access is still returning 403, so the game
currently uses its normal fallback suggestions. The required ten-minute retries
completed from **15:05:21 to 17:05:21 UTC** (11:05 a.m.–1:05 p.m. Eastern):
**39 probes across 13 cycles, all HTTP 403**. No model could supply the five
successful calls required for latency selection. [Final model result](live-bedrock-result.json).

**Oct 17 afternoon: Nick requested Claude Opus 5.5 for naming.** The current
AWS catalog confirms `anthropic.claude-opus-5-5`, image input, and support for
no data retention. A fresh synthetic-image call returns HTTP 403, and the
foundation-model API reports agreement `NOT_AVAILABLE` despite authorization,
entitlement, and region availability. The game workspace still verifies
retention `none`. Model-scoped policy/environment changes are prepared outside
the repository; the live relay remains on its prior configuration pending an
owner-console activation test and successful image/latency checks.
[Opus 5.5 access receipt](opus55-access.json). Nick approved first-use model
terms, and the owner-console request `Reply with exactly OK.` was submitted.
It returned HTTP 403: the model is not available for this account, with AWS
directing the owner to https://aws.amazon.com/contact-us/sales-support/ for
additional access options. Both the deployment identity and owner console are
blocked. No successful Opus 5.5 inference or latency sample is claimed; obtain
account access before resuming the planned verification/deployment.

Nick also accepted Opus 5 or Sonnet 5+ as alternatives. Fresh image calls to
Opus 5 and Sonnet 5 still return the same 403; older Opus 4.8/4.7 calls are also
denied. The deployment identity and owner console were verified to use the
same AWS account. The [access request](claude-access-request.txt) was submitted
through AWS Basic Support on Oct 17 at 17:06 Eastern, under Account and billing →
Account → Other Account Issues, with Web/email replies. The confirmed case
identifiers are retained privately outside the repository. AWS access is pending;
no successful Claude model is currently claimed.

**Temporary fallback (owner requested):** the existing built-in names, brags,
fit score and quips remain active when Claude fails or times out. A fresh
[hosted check](fallback-verified.json) returned the fallback in **96 ms** and
verified live Polly, WSS pairing, in-memory media and room cleanup. The existing
four-second bound remains. The same configuration will use Claude automatically
when an invocation succeeds; no additional provider or support-plan purchase
was introduced.

## Run the family test

With the Fire TV Stick on a TV, USB-connected, and Developer Mode enabled:

```sh
bash tools/device/session.sh
```

The script defaults to the live armv7 package and hosted relay. It skips the
local game relay and port 8787 forwarding when `TV_RELAY_URL` is hosted. The
standalone benchmark still uses its separate local transport on 7071. Join the
room through the QR code on the TV or enter its room code at the phone URL above.
The WebSocket URL is baked into the package; override `TV_PKG` and
`TV_RELAY_URL` together when testing a package built for another endpoint.

The release has `debug`, `offline`, `showcase`, and `photoProbe` disabled. It is
23,333,273 bytes; SHA-256:

```text
8fc375fd985aa9aa7e940f87770a2d7a13b703fa931b23cb97dca044a3850abb
```

[Package inspection](live-tv-package.json) verifies the armv7 Release archive,
hosted runtime configuration, app/OS identity, Hermes bytecode, and absence of
credentials, local home paths, and source maps. The executed Hermes bytecode
also contains the hosted relay URL, and the delivery copy's hash matches.
No physical device was connected
at build time; installation, retail-stick frame rate, and spoken Alexa controls
remain for the device session.

## Infrastructure and alerts

The account-wide **$50 monthly budget was created before infrastructure**.
Its 80% actual and 100% forecast notifications both point to the owner's email.
This is an alert, not a resource spending cutoff.

One t4g.small uses encrypted 8 GiB gp3, required IMDSv2 and standard CPU credits.
The Elastic IP is the CloudFront origin. Port 80 accepts only CloudFront's
managed origin prefix list; SSH accepts only the deployment address /32. Port
8787 is loopback-only. CloudFront is deployed with logging disabled, private
routes uncached, HTTPS for the phone and WSS for game traffic.

The basic Route 53 HTTP health check hits the uncached `/healthz` path every
30 seconds, with three failed probes before failure. `snag-relay-health` alerts
after two failing one-minute CloudWatch periods, and also notifies on recovery.
**The SNS email subscription still needs the owner to confirm the AWS email.**
The alert resources exist; delivery is pending that confirmation. Current alarm
state and subscription status are in [the infrastructure receipt](live-infrastructure.json).
The final external check is HTTP 200 with zero rooms/phones and live modes;
the service reports success, zero restarts since its last start, and over
108 minutes of uptime. See [the final health receipt](live-health-final.json).

The runtime uses an instance role, not the deployment key. The dedicated Mantle
workspace was created through `pnpm --filter relay setup:mantle`, changed to
`data_retention.mode=none`, and read back successfully. Its identifiers and all
AWS resource IDs, the origin header, SSH key and deployment configuration stay
under `~/secrets/snag-deploy/`, outside the repository.

FFmpeg 7.0.2 arm64 uses the runbook's pinned archive SHA-256
`f4149bb2b0784e30e99bdda85471c9b5930d3402014e934a5098b41d0f7201b1`.
The live bootstrap checked it and Node 24.20.0 before installation. The service
has core dumps and swap disabled, a 1.5 GiB memory limit, and a volatile journal.
nginx has no request/error logs, cache, or disk buffering. Audio encoding and
image traffic use memory only.

## Verification

- [Hosted smoke](live-hosted-smoke.json): HTTPS phone and health, WSS TV/phone
  pairing and 20 ms ping, live Polly/visemes, WAV and native fragmented MP4,
  HTTP Range 206, a synthetic photo round trip, and 404s for photo/voice after
  room close. Arthur's direct smoke took 483 ms; the hosted voice flow took
  583 ms including both audio fetches. Bedrock's denied request returned a
  fallback in 159 ms. This smoke was repeated after the Mantle compatibility fix.
- [Direct Polly smoke](live-polly-smoke.txt): live AWS mode, 44 speech marks,
  3,510.625 ms audio. It saved no audio and played nothing aloud.
- [Full hosted game](live-game.json): the unchanged `phone/dev/e2e-play.mjs`
  against `tvsim` over hosted WSS completed all three rounds and the finale in
  **218.599 seconds**, with zero browser errors. All three synthetic snaps ran
  local MediaPipe redaction; the real 72-byte Color Rush mask reached the TV,
  and other rounds omitted it. [Phone transcript](live-phone-game.txt),
  [TV transcript](live-tvsim.txt), and [redacted finale](live-phone/021-end.png).
  Closing the test TV returned `/healthz` to zero rooms and zero phones.
- [Root tests](live-root-tests.txt): 468 tests including release checks.
  [Root typecheck](live-root-typecheck.txt) passes. Tests run with
  `LC_ALL=C LC_CTYPE=C LANG=C` because this Mac does not provide the tool shell's
  inherited C.UTF-8 locale and Perl's checksum helper otherwise aborts.
- [Device-script branch check](live-device-session.json): hosted mode skips the
  local game process/forwarding; local mode retains them. Shell syntax and
  hosted verifier syntax pass.

To repeat the live transport smoke (one model attempt and one short Polly line
are billable; all media stays in memory):

```sh
node tools/release/verify-hosted.mjs https://d2q0olvpmfmvjn.cloudfront.net
```

For a normal-speed browser game:

```sh
pnpm --filter tvsim start -- --relay wss://d2q0olvpmfmvjn.cloudfront.net/ws
# In another terminal, use the Join URL printed by tvsim:
node phone/dev/e2e-play.mjs 'https://d2q0olvpmfmvjn.cloudfront.net/?r=ROOM'
```

## Model access and release differences

[Timestamped model probes](live-bedrock-probes.jsonl) cover Opus 5, Sonnet 5 and
Haiku 4.5. Each returned HTTP 403 in every one of the 13 scheduled cycles,
including the final check at 17:05 UTC. The [account model catalog](live-bedrock-catalog.json) also reports
all three as unavailable, while listing `none` as an allowed retention mode for
each. For Opus/Sonnet, the foundation-model availability API reports authorization,
entitlement and region as available, with the model agreement `NOT_AVAILABLE`.
That API rejects Haiku's Mantle identifier, so its Mantle catalog status is the
recorded access evidence. The catalog directs the account owner to
[AWS access options](https://aws.amazon.com/contact-us/sales-support/).
No successful inference or five-call p95 was measurable. The requested Opus 5
configuration is retained with its four-second fallback; **no model is claimed
as selected by the latency gate**. The retry process exited after the full
two-hour window. Once account access works, measure five successful calls:
select Opus 5 if p95 is below 3,500 ms, otherwise the fastest enabled candidate
below that threshold. Update the scoped runtime policy and environment together
if changing the model, and restart between games.

The game, wire protocol, visuals and mockup timing are unchanged. Deployment
required retaining AL2023's preinstalled curl-minimal, shipping every workspace
manifest while filtering production installation to relay/shared, and starting
systemd from the relay package so it resolves tsx. The failed first user-data run
is historical; the corrected manual bootstrap and live service are verified.
These findings are appended to [the raw friction log](../friction-raw.md).

The older relay brief requested `output_config.format`, which current Mantle
documentation excludes. Requests now rely on the unchanged canonical JSON prompt
and local strict validation; Haiku 4.5 also omits unsupported effort, while
Opus/Sonnet retain low effort. Transport tests cover all three candidates. This
changes request options only. See the [primary feature documentation](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock#features-not-supported)
and [effort compatibility](https://platform.claude.com/docs/en/build-with-claude/effort#compatibility).

Remaining owner actions: resolve AWS model access/agreement availability,
confirm the SNS subscription email, and run the USB device session for the
physical stick and family test. Deployment, the live Polly smoke, the hosted
game, the production build, and root checks are complete. There are no player
photos or thumbnails in these receipts; the two saved phone stills redact media.

Keep the backend available through December 3 per `DECISIONS.md`. Teardown
instructions are in [the deployment runbook](../../relay/deploy/README.md).
