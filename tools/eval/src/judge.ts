import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { COLORS, JUDGE_SIZE, SCORING } from '@snag/shared';
import { PhotoCanvas } from './browser.js';
import { readManifest, fixturePath, type Photo, type ColorRole } from './manifest.js';
import { validateFixtures } from './validate.js';
import { reviewDir, rootDir, packageDir } from './paths.js';
import { RULES } from './scoring.js';
import { spread } from './statistics.js';
import { roundOutcomes } from './rounds.js';
import { contactSheet } from './contact-sheet.js';
import { evaluatePixels, type PixelResult as Result } from './evaluate-pixels.js';
const percent = (n: number, total: number) => `${(100 * n / total).toFixed(1)}%`;
const summarize = (values: number[]) => { const s = spread(values); return `${s.min}/${s.median}/${s.max} (mean ${s.mean.toFixed(1)}, n=${s.n})`; };
const byRole = (photos: Photo[], color: string, role: ColorRole) => photos.filter(p => p.colors[color] === role);
const scoreFor = (results: Result[], id: string, color: string, rule: string) => results.find(r => r.id === id)!.targets[color]!.scores[rule]!;

async function main(): Promise<void> {
  const validation = await validateFixtures(), manifest = await readManifest();
  const photos = manifest.photos.filter(p => p.kind === 'object'), canvas = await PhotoCanvas.open();
  const results: Result[] = []; let chrome: string;
  try {
    chrome = await canvas.version();
    for (const photo of photos) {
      const rgba = await canvas.rgba(await readFile(fixturePath(photo)), JUDGE_SIZE);
      results.push(evaluatePixels(photo.id, rgba));
    }
  } finally { await canvas.close(); }
  await mkdir(reviewDir, { recursive: true });
  const matrix = {
    generated: new Date().toISOString(), revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim(),
    chrome: chrome!, capture: manifest.capture, fixtures: validation,
    method: 'Decode committed 720 px JPEG into Chrome canvas; drawImage to 480 with default smoothing; judgePhoto and judgeMask from shared. Capture JPEG decoding is one lossy generation later than the live pre-encode phone canvas.',
    rules: RULES, results,
    summary: RULES.map(rule => ({ rule, colors: COLORS.map(({ k }) => {
      const groups = Object.fromEntries((['true', 'near', 'hard', 'distractor'] as const).map(role => [role, spread(byRole(photos, k, role).map(p => scoreFor(results, p.id, k, rule.id)))]));
      const trues = byRole(photos, k, 'true').map(p => scoreFor(results, p.id, k, rule.id));
      const nears = byRole(photos, k, 'near').map(p => scoreFor(results, p.id, k, rule.id));
      return { color: k, groups, gaps: spread(trues.flatMap(t => nears.map(n => t - n))), rounds: roundOutcomes(trues, nears, byRole(photos, k, 'distractor').map(p => scoreFor(results, p.id, k, rule.id))) };
    }) })),
  };
  await writeFile(resolve(reviewDir, 'pixel-judge.json'), JSON.stringify(matrix, null, 2) + '\n');
  await contactSheet(photos, results, resolve(reviewDir, 'pixel-contact-sheet.jpg'));
  const all = results.flatMap(r => COLORS.map(c => r.targets[c.k]!.match));
  const trueScores = COLORS.flatMap(c => byRole(photos, c.k, 'true').map(p => scoreFor(results, p.id, c.k, 'shipped')));
  const lines = [
    '# Pixel Judge real-photo benchmark', '',
    `${photos.length} real object photographs, ${COLORS.length} targets, ${all.length} judgments. ${manifest.photos.filter(p => p.kind === 'face').length} isolated face fixtures are excluded. Generated ${matrix.generated}; base revision \`${matrix.revision}\`; ${chrome!}.`, '',
    '## Headline', '',
    `Scores in 94–99: **${all.filter(s => s >= 94).length}/${all.length} (${percent(all.filter(s => s >= 94).length, all.length)})** over the full six-target matrix, and **${trueScores.filter(s => s >= 94).length}/${trueScores.length} (${percent(trueScores.filter(s => s >= 94).length, trueScores.length)})** over the labeled true objects. Overall min/median/max: **${summarize(all)}**.`, '',
    '## Method and limits', '',
    '- The baseline calls shared `judgePhoto` and `judgeMask`, with a checked equality against the sensitivity experiment baseline. It samples every fourth flattened pixel in the center 60% of the 480×480 canvas (20,736 samples), selects floor(20% × samples), and scores the **last selected distance**. The selected RGB average only determines the reported hex.',
    '- Labels describe the visible object hue, not closeness to a particular sRGB triplet. They were assigned by visual inspection before scoring. A human “blue” object may be darker, lighter or less saturated than `#2E5BFF`.',
    '- Chrome `drawImage` uses the phone’s default canvas interpolation. Only the committed 720×720 JPEG at browser quality .8 is available: live shutter scoring precedes JPEG encoding, so these results include one additional JPEG decode. No source originals are committed.',
    '- These are curated public photos (including studio and museum photos), not a random sample of players’ homes. Hard/messy fixtures are natural source photographs; no artificial relighting or blur is added. Trait candidates are human suggestions, not fit-score ground truth.',
    '- The mask lights a 24×24 cell if **any** selected sample occupies it; its visible area is not pixel coverage or object segmentation. Only center cells can light. Masks are target-conditioned, so the same photo lights differently for each target.',
    '- This benchmark isolates Pixel Judge color math. The original face-blur settings altered some no-person object photos; the tuned phone settings preserve all 64 object controls. See the [post-redaction impact comparison](pixel-redaction-impact.md) and [current-phone contact sheet](pixel-contact-sheet-phone.jpg) for scores and masks after the real phone redactor. Both runs use the same committed fixture bytes and shared judge.', '',
    '## Per-color score spread', '',
    'Each entry is min/median/max match %, followed by the mean and sample count. Untagged photos still appear in the full matrix but are excluded from these group comparisons.', '',
    '| Target | True objects | Near-misses | Hard cases | Neutral distractors |',
    '|---|---|---|---|---|',
  ];
  for (const { k, hex } of COLORS) lines.push(`| ${k} ${hex} | ${(['true', 'near', 'hard', 'distractor'] as const).map(role => summarize(byRole(photos, k, role).map(p => scoreFor(results, p.id, k, 'shipped')))).join(' | ')} |`);
  lines.push('', '## Would the right object win a four-team round?', '',
    'Exhaustive fixture rounds contain one true object, every pair of near-misses, and each tagged neutral distractor. “Color-only win” means a **strictly** highest match, isolating color discrimination. **The actual TV crown uses match + speed**, as both reference/src/game.js and shared/src/game/core.ts do. “Crown with speed” enumerates all 24 assignments of the shipped 30/20/10/0 bonuses and means strictly highest round points. Point ties are reported separately: shared core breaks them by AI fit, then earlier snag. No real AI fit measurements are available to resolve them here. Fractions of enumerated orders are not player win probabilities.', '',
    '| Target | Fixture rounds | Color-only wins / ties / losses | Crown with speed wins / ties / losses (trials) | Guaranteed across snag orders | True − near gap min/median/max |',
    '|---|---:|---|---|---|---|');
  const baseline = matrix.summary[0]!;
  for (const color of baseline.colors) {
    const r = color.rounds, g = color.gaps;
    lines.push(`| ${color.color} | ${r.rounds} | ${r.colorWins}/${r.colorTies}/${r.colorLosses} (${percent(r.colorWins, r.rounds)} wins) | ${r.speedWins}/${r.speedTies}/${r.speedLosses} (${r.speedTrials}) | ${r.guaranteedWins}/${r.rounds} | ${g.min}/${g.median}/${g.max} |`);
  }
  lines.push('', '## Three simulated alternatives (no shipped changes)', '',
    'The same 480 px samples feed every rule; all retain the 2–99 clamp. A larger scale is monotone in distance, so it cannot correct a reversed ranking (it can split rounding ties or widen a lead). A larger percentile requires more matching area and can penalize small/off-center objects. Aggregate gaps pool all true–near pairs across colors.', '',
    '| Rule | True median | Near median | True − near gap min/median/max | Color-only wins / ties / losses | Strict crown win % | 94–99 in full matrix | Scores at floor 2 |',
    '|---|---:|---:|---|---|---:|---|---|');
  for (const item of matrix.summary) {
    const rule = item.rule.id;
    const ts = COLORS.flatMap(c => byRole(photos, c.k, 'true').map(p => scoreFor(results, p.id, c.k, rule)));
    const ns = COLORS.flatMap(c => byRole(photos, c.k, 'near').map(p => scoreFor(results, p.id, c.k, rule)));
    const gaps = COLORS.flatMap(c => byRole(photos, c.k, 'true').flatMap(t => byRole(photos, c.k, 'near').map(n => scoreFor(results, t.id, c.k, rule) - scoreFor(results, n.id, c.k, rule))));
    const sums = item.colors.reduce((a, c) => ({ win: a.win + c.rounds.colorWins, tie: a.tie + c.rounds.colorTies, loss: a.loss + c.rounds.colorLosses, speed: a.speed + c.rounds.speedWins, trials: a.trials + c.rounds.speedTrials }), { win: 0, tie: 0, loss: 0, speed: 0, trials: 0 });
    const scores = results.flatMap(r => COLORS.map(c => r.targets[c.k]!.scores[rule]!)), g = spread(gaps);
    lines.push(`| ${rule} (×${item.rule.scale}, p${item.rule.fraction * 100}) | ${spread(ts).median} | ${spread(ns).median} | ${g.min}/${g.median}/${g.max} | ${sums.win}/${sums.tie}/${sums.loss} | ${percent(sums.speed, sums.trials)} | ${scores.filter(s => s >= 94).length}/${scores.length} | ${scores.filter(s => s === SCORING.MATCH_MIN).length}/${scores.length} |`);
  }
  lines.push('', '### Per-color sensitivity', '', '| Rule | Target | True min/median/max | Near min/median/max | Hard min/median/max | Color-only wins / rounds | Strict crown wins / trials |', '|---|---|---|---|---|---|---|');
  for (const item of matrix.summary.slice(1)) for (const color of item.colors) {
    const groups = color.groups as Record<string, ReturnType<typeof spread>>;
    lines.push(`| ${item.rule.id} | ${color.color} | ${['true', 'near', 'hard'].map(role => { const s = groups[role]!; return `${s.min}/${s.median}/${s.max}`; }).join(' | ')} | ${color.rounds.colorWins}/${color.rounds.rounds} | ${color.rounds.speedWins}/${color.rounds.speedTrials} |`);
  }
  lines.push('', '## Recommendation', '', (await readFile(resolve(packageDir, 'recommendation.md'), 'utf8')).trim(), '', '## Evidence', '',
    '- [All six target masks and scores on one contact sheet](pixel-contact-sheet.jpg). Open at full resolution; one photo per row, targets in columns.',
    '- [Full machine-readable matrix and sensitivity results](pixel-judge.json).',
    '- [Fixture provenance, licenses, labels and SHA-256 receipts](../../../tools/eval/photos/manifest.json).',
    '- [Fixture format, coverage and size verification](fixtures-check.json).',
    '- [Muted reference mockup walkthrough](mockup-check.json).', '',
    'Contact-sheet adaptations: [CC BY-SA 4.0 and full source attribution](ASSET-LICENSES.md).', '',
    'Run from the repo root: `pnpm --filter eval validate`, then `pnpm --filter eval judge`. Requires the system Chrome (or `CHROME_PATH`), Node 24 and `pnpm install`. This command makes no network or AWS calls.', '');
  await writeFile(resolve(reviewDir, 'pixel-judge.md'), lines.join('\n'));
  process.stdout.write(`Judged ${photos.length} photos × 6 targets; 94–99: ${all.filter(s => s >= 94).length}/${all.length}. Evidence: docs/review/eval/pixel-judge.md\n`);
}

main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
