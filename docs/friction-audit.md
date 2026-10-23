# Friction source audit — 2026-10-14

This is the review trail for [FRICTION.md](../FRICTION.md), not a new platform
test or a claim of deployment. The assigned baseline was `d9a6701` on
`w/friction`. Only Markdown/metadata/test-output files changed.
[Checked numeric claims and coverage](review/friction/claims.json) are derived
from the existing receipts; their original synthetic images/media are not copied.

## Preservation and scope

The [raw log](friction-raw.md) is byte-identical to the original root log:
SHA-256 `0642f9912bef3feada69640dfc9046de92e05605364c9c3273f4fce29e39e585`.
The [spike entries](spike/friction-entries.md) were not changed.
The task-specific instruction in [the friction brief](workers/friction.md)
explicitly requests the rewrite/archive; it is the exception to COMMON's
ordinary append-only rule for FRICTION.md. Other lead-owned files and DECISIONS.md
were not edited.

Every one of 54 main-log reports and 12 spike findings maps below.
The “What worked” spike list and initial product-feedback prose informed the
17 product sections. Three highest-impact themes are summarized in exactly five
bullets; 43 Amazon-facing entries include observed failures, documentation limits,
offline configuration and candid local setup mistakes. Four non-Amazon findings
remain outside Amazon defect attribution. Eight feature requests link to findings.

## Claim corrections and evidence limits

- **G2 history:** the old failure is `16fb5d6:docs/review/tv/g2-native-e2e.json`
  (`pass:false`, 78.025 s, last Judge cue 222, zero native/media errors).
  The same path was later replaced by a pass. The current
  [JSON](review/tv/g2-native-e2e.json) says `pass:true`, 249.317 s, all eight TV and
  phone screens, zero recorded native/phone/audio errors. The raw log's 290 s
  prose describes an earlier pass and is not used for the current timing.
- **Presentation:** early A/B/C observer contamination/filename problems are
  local evidence failures. The later same-package
  [headless comparison](review/tv/visual/integrated-headless/presentation.json)
  independently fails pixels despite advancing core/clock commits; the
  [windowed report](review/tv/visual/REPORT.md) and images pass. This does not
  retrospectively prove a common internal cause for every old stalled run.
  Offscreen-surface selection remains an inference.
- **Voice:** the latest
  [strict gate](review/tv/visual/release-gate/native-voice-game.json) passes 28/28
  mock routes, no fallback/errors, maximum start latency 887 ms. Its
  [event stream](review/tv/visual/release-gate/native-voice-game.jsonl) contains 28
  matched ended events meeting each routed clip's duration tolerance.
  [Current source](../tv/src/stage/voice.ts) uses native 2,000 ms and web 600 ms.
  The original strict native 600 ms target is not certified; an earlier 582 ms
  pass does not erase later workload delays. “Polly” route names in these
  receipts mean the mock speech path, not live synthesis.
- **Effects:** [baseline](review/tv/native-audio-ogg-baseline.json) gives 90/112
  successes and 33 error records; [fixed bank](review/tv/native-audio-effects.json)
  gives 224/224 plays and ten retained players. The
  [diagnosis](review/tv/native-audio-diagnosis.md) records sink allocation errors
  and a fresh-file control. The app's resource retention was our fix; misleading
  decoder-only errors are the feedback. No codec-wide failure is inferred.
- **Fanfare:** [failed](review/tv/native-photo-fanfare-timeout.json) and
  [fresh](review/tv/native-photo-fanfare.json) probes differ. The 86.5 ms ended
  event is not an accepted warm-start/acoustic result or proof of an old-event
  origin.
- **Version labels:** Performance CLI reports 0.24.0; 2.0.345.0 is its package.
  The spike's MCP version is 1.0.17; later sessions do not expose a version.
  React Native remains the tested 0.72/runtime 2.0 pin, even though Doctor
  recommends 2.1. IAM 2012-10-17 is a policy language version. AWS CLI/retail
  firmware versions are unknown, not guessed.
- **Docs and ownership:** F-A33–35 are offline/documented limits, without live
  AccessDenied, retention violation or unsupported-SSML request. The Bedrock
  client's README belongs to Anthropic. F-A22 is an automatic approval rejection,
  not evidence of an Amazon upload/service failure. F-A28/36/38 and N-A04 identify
  our invocation/setup/scheduling choices rather than assigning an unsupported
  SDK cause.
- **Missing transcripts:** the raw reports retain exact scaffold/font/PATH/CLI
  errors, but not every original terminal/crash transcript. F-A04/09/19/21/22/27/28
  explicitly distinguish worker reports from retained native logs/JSON.
  No assertion, path-discovery error or reviewer quote was invented. rAF
  `timestampType:"undefined"` is present in the
  [spike telemetry](spike/evidence/runtime.jsonl), as are failed and successful
  local-audio state probes.
- **Untested gates:** physical Developer Mode, retail armv7 runtime/remote/Alexa,
  physical performance, acoustic quality, live Bedrock/Polly and EC2/CloudFront/
  IAM/Budgets operation remain pending. Local SDK stubs and deployment templates
  do not establish these results. The
  [Bedrock evaluation](review/eval/bedrock-mock.json) is explicitly `mode:mock`.
  The [MediaPipe transfer](review/face-blur-size.json) exceeds its 3 MB budget;
  the documented desktop test does not establish physical Safari compatibility.

## External primary-source checks

Read-only documentation checks on 2026-10-14 confirmed the narrow claims below.
No AWS account/API operation, paid call, login or message was made.

| Source | Claim checked | Limit |
|---|---|---|
| [Official rules](https://amazonappdev2026.devpost.com/rules) | Product-feedback questions, feature-request fields and optional friction fields/up-to-10% review bonus. | This document does not promise a bonus or submit feedback. |
| [Bedrock inference permissions](https://docs.aws.amazon.com/bedrock/latest/userguide/inference.html), [Mantle authorization](https://docs.aws.amazon.com/service-authorization/latest/reference/list_bedrock-mantle.html) | Mantle has CreateInference with project and Model-condition support. | Configured least privilege has not been tested against an account. |
| [Retention](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html), [workspaces](https://docs.aws.amazon.com/bedrock/latest/userguide/workspaces.html) | Inherited scopes/model compatibility and explicit project/header setup. | No effective live mode was read or changed. |
| [Polly SSML](https://docs.aws.amazon.com/polly/latest/dg/supportedtags.html) | Neural emphasis tag unavailable. | Prosody substitution still needs live delivery review. |
| [Media Controls setup](https://developer.amazon.com/docs/vega/0.24/media-controls-get-started) | Published constructor calls the factory but uses an unassigned server field; guide recommends client discovery for tests. | F-A37 is source inspection; no separate runtime exception is asserted. |

Only short fragments are quoted; fetched pages were not committed. Most findings
are bounded to the pinned historical versions. No latest-release capability claim
or retail-device purchasing recommendation is made.

## Main-log alias map

Line numbers refer to the unchanged [raw archive](friction-raw.md). The repeated
original ID **F-TV-08** is disambiguated by line/subject: 217 is googly eyes,
285 is visual review. Some reports contain several distinct observations and
therefore map to more than one curated entry.

| Raw line | Original report/ID | Curated entry |
|---:|---|---|
| 26 | F-RELAY-01 | F-A33 |
| 48 | F-RELAY-02 | F-A34 |
| 96 | Phone-P01 | N-A03 |
| 115 | F-TV-01 | F-A09 |
| 128 | F-TV-02 | F-A04, F-A03 |
| 145 | F-TV-03 | F-A03 |
| 159 | F-TV-04 | F-A02, F-A37 |
| 175 | F-TV-05 | F-A21 |
| 188 | F-TV-06 | F-A28 |
| 199 | Worker B native acceptance | F-A01, F-A02 |
| 208 | F-TV-07 | F-A20 |
| 217 | F-TV-08 — googly-eye composition | F-A11 |
| 226 | F-TV-09 | F-A02 |
| 236 | FACE-01 | N-A01 |
| 252 | FACE-02 | N-A02 |
| 275 | F-TV-A-01 | F-A01, F-A03 |
| 285 | F-TV-08 — visual review | F-A01 |
| 295 | Worker A follow-up to F-TV-A-01 | F-A01, F-A03 |
| 302 | Worker C MCP discovery | F-A23 |
| 315 | Worker C blocking native acceptance | F-A01, F-A03 |
| 325 | Worker C native follow-up | F-A01 |
| 335 | Worker C fresh capture retry | F-A01, F-A03, F-A25 |
| 344 | F-TV-INTEGRATE-01 | F-A03 |
| 353 | F-TV-INTEGRATE-02 | F-A01, F-A03 |
| 362 | F-TV-INTEGRATE-03 | F-A24 |
| 371 | F-TV-INTEGRATE-04 | F-A05 |
| 380 | F-TV-FINISH-01 | F-A05 |
| 390 | F-TV-FINISH-02 | F-A03, F-A12 |
| 399 | F-TV-FINISH-03 | F-A22 |
| 409 | F-TV-FINISH-04 | F-A02 |
| 418 | DIR-01 — capture/access | F-A26 |
| 448 | F-TV-PHOTO-01 | F-A03, F-A12 |
| 459 | F-TV-PHOTO-02 | F-A18 |
| 470 | F-TV-PHOTO-03 | F-A02, F-A38 |
| 480 | F-VOICE-POLLY-01 | F-A35 |
| 490 | F-VOICE-VEGA-02 | F-A16, F-A06 |
| 501 | F-VOICE-VEGA-03 | F-A06 |
| 515 | Remote WAV URL playback | F-A16, F-A06 |
| 528 | 48 kHz WAV / AAC repair | F-A16, F-A06 |
| 539 | Console/core-scene mismatch | F-A01, F-A06 |
| 549 | F-POLISH1-01 | F-A23 |
| 558 | F-POLISH1-02 | F-A24 |
| 567 | F-POLISH1-03 | F-A07 |
| 576 | F-POLISH1-04 | F-A08 |
| 585 | F-POLISH1-05 | F-A36 |
| 594 | F-POLISH1-06 | F-A02 |
| 603 | F-POLISH1-07 | F-A19, F-A20 |
| 612 | F-POLISH1-08 | F-A06 |
| 621 | F-POLISH1-09 | F-A01 |
| 630 | F-POLISH1-10 | F-A25 |
| 639 | F-POLISH1-11 | N-A04 |
| 654 | F-VISUAL-01 | F-A01 |
| 664 | F-VISUAL-02 | F-A02 |
| 674 | F-VISUAL-03 | F-A27 |

## Spike alias map

The spike findings originally have date/tool headings, not IDs. The short subjects
below are stable aliases in the curated entries.

| Spike line | Original subject | Curated entry |
|---:|---|---|
| 5 | project generate / name grammar | F-A29 |
| 13 | SDK environment / bare vda | F-A30 |
| 21 | expo-font companion install | F-A31 |
| 29 | VVD transient launch | F-A24 |
| 37 | MCP API body truncation | F-A15 |
| 45 | UI-fluidity KPI prerequisite | F-A19 |
| 53 | requestAnimationFrame timestamp | F-A14 |
| 61 | SVG custom-font Text/stroke | F-A10 |
| 69 | local AudioPlayer asset URI | F-A17 |
| 77 | scaled GLView composition | F-A13 |
| 85 | standalone perf record / TTY | F-A20 |
| 93 | project doctor companion warnings | F-A32 |

The final voice, final console-capture, and pnpm-version updates embedded between
raw headings are included in F-A06, F-A01 and N-A04 respectively. No separate
observation was dropped as a duplicate. Only repeated descriptions were merged.

## Verification of this documentation change

- `pnpm install --frozen-lockfile` used Node 24.20.0/pnpm 12.10.1 and reused the
  local package cache (zero package downloads reported). Saved output replaces home
  paths with `~/` and strips pnpm trailing line padding; test results are unchanged.
- Root `pnpm test`: **448 passed**, including TV lint and the existing capture
  guards. [Sanitized output](review/friction/root-tests.txt).
- Root `pnpm typecheck`: passed. [Output](review/friction/root-typecheck.txt).
- Source metrics, complete-clip events, raw preservation, local links/anchors,
  required entry fields, 17 five-question product sections, 8 feature requests,
  alias coverage, privacy/path scan and staged size/scope checks are recorded in
  [documentation checks](review/friction/document-checks.txt).
- No new screenshot or native run was needed for a docs-only assignment.
  Existing comparison screenshots are linked directly from the corresponding
  findings; their pixels stay synthetic and their failures are not relabeled.

To review, open [FRICTION.md](../FRICTION.md) and follow each Our evidence link.
To rerun the required workspace checks: use the Node PATH in the worker brief,
`pnpm install --frozen-lockfile`, `pnpm test`, then `pnpm typecheck`.
Original-app commands are retrospective and identify missing pre-fix harnesses.
The ten independent fresh-template reductions added below remain unverified;
this audit did not mutate the shared simulator or deploy AWS.

The rewrite/archive is the assignment's only exception to the common append-only
rule. No mockup/game/protocol/art changes were made. This worker's documentation
work is complete; the explicitly pending platform/device/service gates belong
to future sessions.

## Lead-review revision — 2026-10-14

Ten priority topics now have **Minimal repro** blocks independent of the repo:
F-A01/02/03/05/16/19 plus Back/held-key/run-app/devmode F-A39–42.
The fresh-template recipe explicitly chooses helloWorld-rn72 because current
CLI metadata makes helloWorld the RN 0.83 template. Seven RN components are
under 30 lines; shell probes use five-line sequences. Receipt-reading commands
were removed from the six revised existing entries; links are now **Our evidence**.

Every reduction is labeled **expected to reproduce; derived from our app**.
No isolated runtime failure is claimed. BackHandler passed in our native spike;
repeat=false and the 122–129 s timing are inherited WebView observations.
Retail mode/registration remains pending. F-A43 records the new restricted-
filesystem CLI-help write interaction and its non-package-directory workaround.
[Source notes](review/friction/lead-review-evidence.md) preserve these boundaries.
[Repro index](review/friction/minimal-repro-index.json) records snippet line counts
and explicitly says runtimeVerified:false. Existing raw logs/runtime receipts are untouched; root check logs were refreshed.
Fresh-template SDK/vendor/device behavior remains untested by this docs worker.

Validation: all seven TSX snippets pass syntax checks; six pass strict type checks
against the installed Vega declarations. WebView receives syntax checks only
because its package is absent here. Eleven shell blocks, embedded Python/HTML JS
and service TOML parse; all five synthetic fixture commands generate/decode.
Root pnpm test passes **448 tests**, including TV lint; pnpm typecheck passes.
The sandbox initially denied local mock-relay listeners (listen EPERM); the
required suite passed with loopback access. No new application tests were added.
