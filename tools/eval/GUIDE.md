# Snag & Brag evaluation worker

From the repo root, with Node 24 and system Chrome:

```sh
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
pnpm install
pnpm --filter eval validate
pnpm --filter eval judge
pnpm --filter eval faces
AI_MODE=mock pnpm --filter eval bedrock -- \
  --models anthropic.claude-opus-5,anthropic.claude-sonnet-5,anthropic.claude-haiku-4-5 --n 30
pnpm test
pnpm typecheck
```

`CHROME_PATH` can override the system Chrome executable. Browsers always use
`--mute-audio`; judging and face checks block external browser requests.

## Corpus

64 object photographs and 12 separate face photographs, approximately 5.5 MB in
`photos/`. Every fixture is a Chrome canvas 720 px center square, JPEG quality .8.
Only resized captures are committed. Natural source lighting, blur and framing
are retained. `manifest.json` records source/author/license/fetch date, purpose,
color/trait/condition labels, input thumbnail dimensions, expected face boxes,
output byte count and SHA-256. `photos/LICENSES.md` records each asset's license and
attribution; the repository's MIT code license does not replace image licenses.

True-color labels mean visible object hues rather than exact palette triplets.
They were frozen before scoring; coverage and size are checked by `validate`.
Faces are isolated from object/color/AI benchmarks. The face boxes were reviewed
against full-resolution fixtures after correcting imprecise thumbnail-based
coordinates; they are coarse annotations of the visible face excluding hair and
neck. No identity inference is performed.

On a normal clone the photos are already present. To restore a missing fixture:

```sh
pnpm --filter eval run fetch
```

The explicit `run` avoids pnpm's built-in `fetch` command. Downloads are bounded
to 6 MB each and stay in memory; the importer writes only resized fixture JPEGs.
It uses manifest-listed public Wikimedia/StockSnap image hosts and skips intact
files. Current Chrome/source thumbnail changes can produce new hashes, so review
and re-freeze receipts when regenerating; do not silently reinterpret new bytes as
the original benchmark corpus.

## Pixel Judge

`judge` decodes the committed JPEG in Chrome, downsamples with the phone's default
canvas smoothing to 480 px, and calls shared `judgePhoto` and `judgeMask` against
all six targets. It checks the experimental baseline against the real judge on
every image/target. Sensitivity variants: scale 1.50/p20, scale 1.05/p40 and scale
1.50/p40. Shared scoring/constants and phone/TV code are never modified.

Evidence: `docs/review/eval/pixel-judge.md`, `pixel-judge.json`, and one
`pixel-contact-sheet.jpg` with every photo/target score and the transmitted mask
grid overlay. The report separates color-only discrimination from actual crown
selection by match + speed, with all 24 speed-bonus assignments. Point ties need
AI fit then earlier snag and are kept separate from strict wins. It reads the frozen interpretation
from `recommendation.md`; if the corpus changes, update that interpretation too.

The capture JPEG is one encoding generation later than the phone's pre-encode
judge input. The Pixel Judge experiment isolates color scoring; the newly merged
phone face detector also alters some object photos. Run `judge` before `faces` to
also generate `pixel-redaction-impact.md/.json` and
`pixel-contact-sheet-phone.jpg`: every target and all three variants run again
on the real redacted canvas before preview JPEG encoding. The comparison reports
changed scores alongside round winners. Both contact-sheet adaptations use
CC BY-SA 4.0 with per-image source attribution in
`docs/review/eval/ASSET-LICENSES.md`.

## Face check

`faces` reads the exact working-tree `phone/src/faceBlur.ts`, model and WASM
by default, bundles the code in memory, and runs its real
`FaceRedactor.redact` in headless Chrome. The dependency version must match the
phone snapshot. It leaves all phone/main files untouched, and adds no copied
pipeline implementation or runtime/model assets to this package. `--ref` selects
a Git snapshot and writes a stub only when that snapshot has no pipeline. To reproduce a pinned run:

```sh
pnpm --filter eval faces -- --ref b2ce6b811316bae8f322c5a3865172497b644693
```

Results: `docs/review/eval/face-blur.md` and `.json`. Detection matches coarse face
annotations at IoU ≥0.2; coverage measures the expanded box's intersection with
the annotation. These metrics do not establish de-identification. Timings separate
detector initialization, inference/pixelation and image decode. All 64 no-person
object photos also run as controls to reveal detector effects on game objects.
Working images remain in memory and are cleared; no redaction outputs are saved.

`pnpm --filter eval sweep-faces` runs the same CPU detector and padded retry at
SDK thresholds 0.5, 0.6, 0.7 and 0.8. It compares all 2,000 combinations of
primary confidence, retry off/on with its own confidence, minimum relative side,
aspect ratio and minimum visible box area. Each row uses the phone's exported
selection function on the actual threshold's candidates. Thresholds can change
NMS geometry, so the sweep does not approximate an SDK setting by filtering
another setting's scores. The final `faces` run confirms actual pixelation.

The complete table, per-setting false positives/misses and numeric candidate
receipts are in `docs/review/eval/face-redaction-sweep.md` and `.json`. The vector
padding figure contains measured geometry only. The chosen confidence is 0.7,
retry off (configured retry threshold 0.7), minimum side 5% of frame, aspect
0.5–2, minimum area 0.5% of frame. These keep 12/12 faces with 0/64 object
detections; 25% sides/bottom and 45% top cover every annotated face completely.
Results describe this corpus, not recall on untested photos. The original 0.5 /
retry-on baseline is preserved in `docs/review/eval/face-blur-baseline.*`.

## Bedrock

The command above defaults to mock unless `AI_MODE=bedrock` is explicitly set;
an ambient `BEDROCK_MODEL_ID` alone cannot enable billing. Mock mode runs 30 fixed,
stratified photos per model label, using the relay `AiReader` and `mockAiProvider`.
The labels are not real-model comparisons. The unit suite injects a transport into
the actual Mantle provider to verify its prompt, schema and 512 px image path
without contacting AWS.

The lead's future live command is:

```sh
AI_MODE=bedrock AWS_REGION=<enabled-region> pnpm --filter eval bedrock -- \
  --models <enabled-mantle-model-ids> --n 30
```

Credentials/workspace configuration come only from environment or the existing
AWS credential chain. This worker did not run live AWS or read/print credentials.
Use actual enabled model IDs: Opus/Sonnet 5 availability and prices were not
verified. The requested example labels are accepted, with clearly labeled
planning rates rather than invented price quotations. Before constructing a live
provider, the CLI prints total calls and an estimate (~1,800 input tokens plus at
most 512 output tokens/call; the requested 90-call example estimates $2.485).
This is an estimate, not a billing ceiling; the mock costs $0. Supply a JSON
`--rates-file` to override per-model assumptions:

```json
{
  "your-enabled-model-id": {
    "input": 3,
    "output": 15,
    "basis": "Verified rate and date; USD per million input/output tokens"
  }
}
```

Calls are sequential, have no retries, and reuse `relay/src/ai.ts`: the same
prompt, schema, inside-512 JPEG q75 preparation (only used when smaller), parsing,
4 s budget and fallback. Outputs go to `bedrock-mock.md/.json` or
`bedrock-live.md/.json`; `--out <dir>` can choose another report directory.
Each markdown taste table contains its input thumbnail, prompt, thing, three
names, two brags, fit score, quip and status. JSON preserves public-fixture raw
responses alongside delivered responses to expose relay repairs.

Metrics include all-result and success-only latency p50/p95/max (nearest rank),
timeout reasons, measured >4 s overruns, refusals, bad-result/schema failures,
raw contract violations, provider failure reasons, fallbacks and a whole-word
brand-list check on raw/delivered text. `bad_result` may also include an unexpected
completion stop reason; the relay does not expose finer diagnostic categories.
Brand-list matches need a human read ("apple" can be a fruit; "Stanley" can be a
name), and unlisted brands are missed. Mock outputs are plumbing evidence only.

Only manifest-listed, checksum-verified public fixtures are read. Do not adapt
this harness to player-photo directories or log player media.
