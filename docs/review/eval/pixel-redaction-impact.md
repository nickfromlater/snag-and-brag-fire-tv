# Current-phone redaction impact on Pixel Judge

Exact phone redactor from `working tree on 7ffe2d3b78d44c52e3fe0162d848edd2bcadc4bf; source SHA-256 83a044f2a7b51ee441bf074b4fec9bca92212f2cae4ac25181ca57464846da3d`. All 64 public no-person object fixtures, all six targets and all three sensitivity variants. Scoring uses the redacted 720 px canvas drawn to 480 **before** encoding the preview JPEG; no redacted source photos are written. The unchanged fixture JPEG is decoded once, as in the isolated benchmark.

**0/384 scores changed across 0/64 photos.** Post-redaction min/median/max: **2/26/88**; scores 94–99: **0/384**. Detection presence alone does not imply a score change.

Color-only wins isolate matching. The actual crown uses match + speed; its strict wins enumerate all 24 snag orders. Point ties require AI fit then earlier snag, so they remain separate from strict wins.

| Color | Post-redaction true min/median/max | Near min/median/max | Color-only wins / ties / losses | Strict crown wins / trials |
|---|---|---|---|---|
| RED | 87/88/88 | 63/73/83 | 21/0/0 | 252/504 |
| BLUE | 14/40/81 | 2/2/2 | 21/0/0 | 420/504 |
| YELLOW | 57/65/81 | 31/46/61 | 14/0/7 | 293/504 |
| GREEN | 54/69/85 | 19/28.5/38 | 21/0/0 | 456/504 |
| PINK | 56/77/78 | 42/43/44 | 21/0/0 | 434/504 |
| ORANGE | 72/77/83 | 68/69/70 | 21/0/0 | 210/504 |

| Rule | Color-only wins / ties / losses | Strict crown win % | Scores at floor 2 |
|---|---|---:|---|
| shipped | 119/0/7 | 68.3% | 61/384 |
| scale-1.50 | 112/7/7 | 67.5% | 241/384 |
| percentile-40 | 98/0/28 | 52.5% | 82/384 |
| scale-1.50-percentile-40 | 84/14/28 | 55.3% | 302/384 |

## Changed scores

| Fixture | Target | Isolated judge | After phone redaction | Δ points |
|---|---|---:|---:|---:|

[What the current phone will supply to the TV: contact sheet with scores and masks](pixel-contact-sheet-phone.jpg). [Full post-redaction scores, masks and experiments](pixel-redaction-impact.json). [Isolated Pixel Judge report and recommendation](pixel-judge.md). [Detection/timing report](face-blur.md).

Reproduce: `pnpm --filter eval judge`, then `pnpm --filter eval faces (working tree), or pnpm --filter eval faces -- --ref <commit>`. The face command also measures this object control population. Image fixtures are public licensed inputs, not player media.
