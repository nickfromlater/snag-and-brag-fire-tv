import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { COLORS } from '@snag/shared';
import type { Photo, ColorRole } from './manifest.js';
import type { PixelResult } from './evaluate-pixels.js';
import { RULES } from './scoring.js';
import { spread } from './statistics.js';
import { roundOutcomes } from './rounds.js';
import { reviewDir } from './paths.js';
import { contactSheet } from './contact-sheet.js';

export async function redactionImpact(photos: Photo[], results: PixelResult[], previews: Map<string, Buffer>, revision: string): Promise<void> {
  const before = JSON.parse(await readFile(resolve(reviewDir, 'pixel-judge.json'), 'utf8')) as { results: PixelResult[] };
  const original = (id: string, color: string) => before.results.find(p => p.id === id)!.targets[color]!.match;
  const score = (id: string, color: string, rule = 'shipped') => results.find(p => p.id === id)!.targets[color]!.scores[rule]!;
  const group = (color: string, role: ColorRole, rule = 'shipped') => photos.filter(p => p.colors[color] === role).map(p => score(p.id, color, rule));
  const changed = results.flatMap(p => COLORS.filter(c => original(p.id, c.k) !== p.targets[c.k]!.match).map(c => ({ photoId: p.id, color: c.k, before: original(p.id, c.k), after: p.targets[c.k]!.match })));
  const scores = results.flatMap(p => COLORS.map(c => p.targets[c.k]!.match));
  const summary = RULES.map(rule => ({ rule, colors: COLORS.map(({ k }) => ({ color: k, true: spread(group(k, 'true', rule.id)), near: spread(group(k, 'near', rule.id)), rounds: roundOutcomes(group(k, 'true', rule.id), group(k, 'near', rule.id), group(k, 'distractor', rule.id)) })) }));
  const report = { generated: new Date().toISOString(), revision, method: 'Same committed JPEGs; actual FaceRedactor.redact on 720 px canvas, then Chrome drawImage to 480 before another JPEG encoding. Preview JPEGs are only for contact-sheet drawing, not for scoring.', changed, summary, results };
  await writeFile(resolve(reviewDir, 'pixel-redaction-impact.json'), JSON.stringify(report, null, 2) + '\n');
  await contactSheet(photos, results, resolve(reviewDir, 'pixel-contact-sheet-phone.jpg'), previews);
  const compact = (v: ReturnType<typeof spread>) => `${v.min}/${v.median}/${v.max}`;
  const lines = ['# Current-phone redaction impact on Pixel Judge', '',
    `Exact phone redactor from \`${revision}\`. All ${photos.length} public no-person object fixtures, all six targets and all three sensitivity variants. Scoring uses the redacted 720 px canvas drawn to 480 **before** encoding the preview JPEG; no redacted source photos are written. The unchanged fixture JPEG is decoded once, as in the isolated benchmark.`, '',
    `**${changed.length}/${scores.length} scores changed across ${new Set(changed.map(c => c.photoId)).size}/${photos.length} photos.** Post-redaction min/median/max: **${compact(spread(scores))}**; scores 94–99: **${scores.filter(s => s >= 94).length}/${scores.length}**. Detection presence alone does not imply a score change.`, '',
    'Color-only wins isolate matching. The actual crown uses match + speed; its strict wins enumerate all 24 snag orders. Point ties require AI fit then earlier snag, so they remain separate from strict wins.', '',
    '| Color | Post-redaction true min/median/max | Near min/median/max | Color-only wins / ties / losses | Strict crown wins / trials |', '|---|---|---|---|---|',
  ];
  for (const c of summary[0]!.colors) lines.push(`| ${c.color} | ${compact(c.true)} | ${compact(c.near)} | ${c.rounds.colorWins}/${c.rounds.colorTies}/${c.rounds.colorLosses} | ${c.rounds.speedWins}/${c.rounds.speedTrials} |`);
  lines.push('', '| Rule | Color-only wins / ties / losses | Strict crown win % | Scores at floor 2 |', '|---|---|---:|---|');
  for (const s of summary) {
    const totals = s.colors.reduce((a, c) => ({ wins: a.wins + c.rounds.colorWins, ties: a.ties + c.rounds.colorTies, losses: a.losses + c.rounds.colorLosses, speed: a.speed + c.rounds.speedWins, trials: a.trials + c.rounds.speedTrials }), { wins: 0, ties: 0, losses: 0, speed: 0, trials: 0 });
    const values = results.flatMap(p => COLORS.map(c => p.targets[c.k]!.scores[s.rule.id]!));
    lines.push(`| ${s.rule.id} | ${totals.wins}/${totals.ties}/${totals.losses} | ${(100 * totals.speed / totals.trials).toFixed(1)}% | ${values.filter(v => v === 2).length}/${values.length} |`);
  }
  lines.push('', '## Changed scores', '', '| Fixture | Target | Isolated judge | After phone redaction | Δ points |', '|---|---|---:|---:|---:|', ...changed.map(c => `| ${c.photoId} | ${c.color} | ${c.before} | ${c.after} | ${c.after - c.before} |`), '',
    '[What the current phone will supply to the TV: contact sheet with scores and masks](pixel-contact-sheet-phone.jpg). [Full post-redaction scores, masks and experiments](pixel-redaction-impact.json). [Isolated Pixel Judge report and recommendation](pixel-judge.md). [Detection/timing report](face-blur.md).', '',
    'Reproduce: `pnpm --filter eval judge`, then `pnpm --filter eval faces (working tree), or pnpm --filter eval faces -- --ref <commit>`. The face command also measures this object control population. Image fixtures are public licensed inputs, not player media.', '');
  await writeFile(resolve(reviewDir, 'pixel-redaction-impact.md'), lines.join('\n'));
  process.stdout.write(`Phone redaction changed ${changed.length}/${scores.length} Pixel Judge scores; current-phone contact sheet saved.\n`);
}
