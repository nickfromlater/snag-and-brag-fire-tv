# Pixel Judge real-photo benchmark

64 real object photographs, 6 targets, 384 judgments. 12 isolated face fixtures are excluded. Generated 2026-10-13T15:27:41.819Z; base revision `5b7bcb60d2befcac2a51413dfab4620e73205fae`; Chrome/155.0.8059.40.

## Headline

Scores in 94–99: **0/384 (0.0%)** over the full six-target matrix, and **0/18 (0.0%)** over the labeled true objects. Overall min/median/max: **2/26/88 (mean 27.7, n=384)**.

## Method and limits

- The baseline calls shared `judgePhoto` and `judgeMask`, with a checked equality against the sensitivity experiment baseline. It samples every fourth flattened pixel in the center 60% of the 480×480 canvas (20,736 samples), selects floor(20% × samples), and scores the **last selected distance**. The selected RGB average only determines the reported hex.
- Labels describe the visible object hue, not closeness to a particular sRGB triplet. They were assigned by visual inspection before scoring. A human “blue” object may be darker, lighter or less saturated than `#2E5BFF`.
- Chrome `drawImage` uses the phone’s default canvas interpolation. Only the committed 720×720 JPEG at browser quality .8 is available: live shutter scoring precedes JPEG encoding, so these results include one additional JPEG decode. No source originals are committed.
- These are curated public photos (including studio and museum photos), not a random sample of players’ homes. Hard/messy fixtures are natural source photographs; no artificial relighting or blur is added. Trait candidates are human suggestions, not fit-score ground truth.
- The mask lights a 24×24 cell if **any** selected sample occupies it; its visible area is not pixel coverage or object segmentation. Only center cells can light. Masks are target-conditioned, so the same photo lights differently for each target.
- This benchmark isolates Pixel Judge color math. The original face-blur settings altered some no-person object photos; the tuned phone settings preserve all 64 object controls. See the [post-redaction impact comparison](pixel-redaction-impact.md) and [current-phone contact sheet](pixel-contact-sheet-phone.jpg) for scores and masks after the real phone redactor. Both runs use the same committed fixture bytes and shared judge.

## Per-color score spread

Each entry is min/median/max match %, followed by the mean and sample count. Untagged photos still appear in the full matrix but are excluded from these group comparisons.

| Target | True objects | Near-misses | Hard cases | Neutral distractors |
|---|---|---|---|---|
| RED #F23B2E | 87/88/88 (mean 87.7, n=3) | 63/73/83 (mean 73.0, n=2) | 57/57/57 (mean 57.0, n=1) | 8/18/31 (mean 17.7, n=7) |
| BLUE #2E5BFF | 14/40/81 (mean 45.0, n=3) | 2/2/2 (mean 2.0, n=2) | 78/78/78 (mean 78.0, n=1) | 2/2/2 (mean 2.0, n=7) |
| YELLOW #FFD43B | 57/65/81 (mean 67.7, n=3) | 31/46/61 (mean 46.0, n=2) | 26/26/26 (mean 26.0, n=1) | 18/22/38 (mean 24.7, n=7) |
| GREEN #3BB54A | 54/69/85 (mean 69.3, n=3) | 19/28.5/38 (mean 28.5, n=2) | 23/23/23 (mean 23.0, n=1) | 23/27/33 (mean 27.7, n=7) |
| PINK #FF6FB5 | 56/77/78 (mean 70.3, n=3) | 42/43/44 (mean 43.0, n=2) | 27/27/27 (mean 27.0, n=1) | 30/31/34 (mean 31.7, n=7) |
| ORANGE #FF7A1F | 72/77/83 (mean 77.3, n=3) | 68/69/70 (mean 69.0, n=2) | 39/39/39 (mean 39.0, n=1) | 11/22/36 (mean 21.9, n=7) |

## Would the right object win a four-team round?

Exhaustive fixture rounds contain one true object, every pair of near-misses, and each tagged neutral distractor. “Color-only win” means a **strictly** highest match, isolating color discrimination. **The actual TV crown uses match + speed**, as both reference/src/game.js and shared/src/game/core.ts do. “Crown with speed” enumerates all 24 assignments of the shipped 30/20/10/0 bonuses and means strictly highest round points. Point ties are reported separately: shared core breaks them by AI fit, then earlier snag. No real AI fit measurements are available to resolve them here. Fractions of enumerated orders are not player win probabilities.

| Target | Fixture rounds | Color-only wins / ties / losses | Crown with speed wins / ties / losses (trials) | Guaranteed across snag orders | True − near gap min/median/max |
|---|---:|---|---|---|---|
| RED | 21 | 21/0/0 (100.0% wins) | 252/0/252 (504) | 0/21 | 4/14.5/25 |
| BLUE | 21 | 21/0/0 (100.0% wins) | 420/0/84 (504) | 14/21 | 12/38/79 |
| YELLOW | 21 | 14/0/7 (66.7% wins) | 293/28/183 (504) | 0/21 | -4/23/50 |
| GREEN | 21 | 21/0/0 (100.0% wins) | 456/0/48 (504) | 14/21 | 16/41/66 |
| PINK | 21 | 21/0/0 (100.0% wins) | 434/0/70 (504) | 14/21 | 12/33.5/36 |
| ORANGE | 21 | 21/0/0 (100.0% wins) | 210/0/294 (504) | 0/21 | 2/8/15 |

## Three simulated alternatives (no shipped changes)

The same 480 px samples feed every rule; all retain the 2–99 clamp. A larger scale is monotone in distance, so it cannot correct a reversed ranking (it can split rounding ties or widen a lead). A larger percentile requires more matching area and can penalize small/off-center objects. Aggregate gaps pool all true–near pairs across colors.

| Rule | True median | Near median | True − near gap min/median/max | Color-only wins / ties / losses | Strict crown win % | 94–99 in full matrix | Scores at floor 2 |
|---|---:|---:|---|---|---:|---|---|
| shipped (×1.05, p20) | 77 | 43 | -4/24.5/79 | 119/0/7 | 68.3% | 0/384 | 61/384 |
| scale-1.50 (×1.5, p20) | 67 | 19 | -7/25/76 | 112/7/7 | 67.5% | 0/384 | 241/384 |
| percentile-40 (×1.05, p40) | 67.5 | 41.5 | -45/12.5/75 | 98/0/28 | 52.5% | 0/384 | 82/384 |
| scale-1.50-percentile-40 (×1.5, p40) | 53.5 | 16 | -64/11.5/73 | 84/14/28 | 55.3% | 0/384 | 302/384 |

### Per-color sensitivity

| Rule | Target | True min/median/max | Near min/median/max | Hard min/median/max | Color-only wins / rounds | Strict crown wins / trials |
|---|---|---|---|---|---|---|
| scale-1.50 | RED | 82/82/83 | 47/61.5/76 | 38/38/38 | 21/21 | 252/504 |
| scale-1.50 | BLUE | 2/14/73 | 2/2/2 | 68/68/68 | 14/21 | 294/504 |
| scale-1.50 | YELLOW | 38/51/73 | 2/23.5/45 | 2/2/2 | 14/21 | 322/504 |
| scale-1.50 | GREEN | 34/55/78 | 2/7/12 | 2/2/2 | 21/21 | 486/504 |
| scale-1.50 | PINK | 37/67/69 | 18/19/20 | 2/2/2 | 21/21 | 434/504 |
| scale-1.50 | ORANGE | 60/67/76 | 55/56/57 | 13/13/13 | 21/21 | 252/504 |
| percentile-40 | RED | 33/83/87 | 58/68/78 | 35/35/35 | 14/21 | 168/504 |
| percentile-40 | BLUE | 12/26/77 | 2/2/2 | 4/4/4 | 21/21 | 336/504 |
| percentile-40 | YELLOW | 39/47/74 | 29/44.5/60 | 23/23/23 | 7/21 | 182/504 |
| percentile-40 | GREEN | 25/63/82 | 13/25/37 | 15/15/15 | 14/21 | 357/504 |
| percentile-40 | PINK | 54/66/71 | 41/41.5/42 | 21/21/21 | 21/21 | 378/504 |
| percentile-40 | ORANGE | 69/71/74 | 66/67/68 | 26/26/26 | 21/21 | 168/504 |
| scale-1.50-percentile-40 | RED | 5/76/81 | 40/54.5/69 | 7/7/7 | 14/21 | 210/504 |
| scale-1.50-percentile-40 | BLUE | 2/2/67 | 2/2/2 | 2/2/2 | 7/21 | 252/504 |
| scale-1.50-percentile-40 | YELLOW | 13/24/63 | 2/22/42 | 2/2/2 | 7/21 | 210/504 |
| scale-1.50-percentile-40 | GREEN | 2/48/75 | 2/6/10 | 2/2/2 | 14/21 | 378/504 |
| scale-1.50-percentile-40 | PINK | 34/52/58 | 15/16/17 | 2/2/2 | 21/21 | 434/504 |
| scale-1.50-percentile-40 | ORANGE | 55/58/63 | 52/53/54 | 2/2/2 | 21/21 | 189/504 |

## Recommendation

Keep **ΔE ×1.05 and the closest-20% rule** for this release. This corpus does not reproduce the reported 94–99 bunching: **0/384** judgments reach that band; the full range is **2–88** and the median is **26**. The 18 clear target objects have median **77**. Retuning to spread already-low real-photo scores would solve the wrong observed problem. Check the live cards’ score provenance and synthetic/bot paths before attributing mock-card compression to the real-photo judge; that cause is an inference, not established by this test.

The shipped rule already makes the three clear RED objects score **87–88**, ahead of the pink-tumbler near-miss (**63**) and orange-carrot near-miss (**83**). Their true-minus-near gaps are **4–25 points**, median **14.5**; RED has the highest color match in **21/21** fixture rounds. **Both the mockup and shared core select the actual crown using match + speed**; RED's strict crown wins are only **252/504 (50%)** across all snag-order assignments. Raising the scale to **1.50** changes those scores to **82–83** versus **47/76**, enlarging the closest lead from **4 to 6** and the median gap to **20.5**. It leaves RED crown wins at **252/504**, while scores at the floor jump from **61/384 (15.9%)** to **241/384 (62.8%)** across the matrix. Overall color-only wins fall from **119/126 (94.4%)** to **112/126 (88.9%)**, with seven new BLUE ties. That is a poor trade for a two-point increase in the tightest RED lead.

Raising the selected percentile to **40%** is worse: the clear red mug falls **88→33**, below both RED near-misses (**58/78**), and RED color-only wins fall **21/21→14/21**. Overall color-only wins fall **119/126→98/126 (77.8%)**; strict actual crown wins fall **68.3%→52.5%**. The combined 1.50/p40 alternative has **84/126 (66.7%)** color-only wins and floors **302/384 (78.6%)** scores. Keep the 20% selection so an object can occupy only part of a naturally framed photo.

The unresolved finding is semantic color/saturation sensitivity, not top-end bunching. A visibly pale-blue CD sleeve scores **14**, and pale-yellow sweets (**57**) lose to the yellow-green cap (**61**). ORANGE’s worst clear-versus-near gap is only **2**, and speed bonuses can outweigh otherwise correct color rankings. Raising a monotone scale cannot repair a reversed ranking, and requiring more matching area penalizes ordinary framing. Any broader hue-aware or exposure-aware design needs a separately frozen experiment and the lead’s decision. No shared constants, wire shape, phone code or TV code were changed by this worker.

The conclusion also holds **after the tuned phone redactor**: the offline settings sweep retains **12/12 faces** and reduces object detections from **11/64 to 0/64**. Consequently **0/384** object/color scores change, and the matrix remains **2/26/88** with **0/384** in 94–99. Clear RED remains **87–88** versus near-misses **63/83**; color-only wins remain **119/126** and strict crown wins **68.3%** (RED **50%**). The three alternatives still have only **112/126**, **98/126**, and **84/126** color-only wins. See [the complete redaction settings sweep](face-redaction-sweep.md), [post-redaction comparison](pixel-redaction-impact.md), and [current-phone contact sheet](pixel-contact-sheet-phone.jpg). The follow-up explicitly authorized phone tuning; confidence 0.7, retry off, loose sanity guards, and 45% top padding are implemented on this branch.

## Evidence

- [All six target masks and scores on one contact sheet](pixel-contact-sheet.jpg). Open at full resolution; one photo per row, targets in columns.
- [Full machine-readable matrix and sensitivity results](pixel-judge.json).
- [Fixture provenance, licenses, labels and SHA-256 receipts](../../../tools/eval/photos/manifest.json).
- [Fixture format, coverage and size verification](fixtures-check.json).
- [Muted reference mockup walkthrough](mockup-check.json).

Contact-sheet adaptations: [CC BY-SA 4.0 and full source attribution](ASSET-LICENSES.md).

Run from the repo root: `pnpm --filter eval validate`, then `pnpm --filter eval judge`. Requires the system Chrome (or `CHROME_PATH`), Node 24 and `pnpm install`. This command makes no network or AWS calls.
