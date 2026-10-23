import { GameHost, ShowcaseClock, createShowcase, seededRng } from './shared.mjs';
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { json, sceneRanges, saveManifest } from './lib.mjs';

/** Deliberate allowlist: never write TvView, photoId, thumbnails, masks or relay keys. */
export function cueSummary(e) {
  const c = e.cue, base = { seq: e.seq, atMs: e.at, round: e.round, kind: c.k };
  if (c.k === 'scene') return { ...base, scene: c.scene };
  if (c.k === 'phase') return { ...base, phase: c.phase };
  if (c.k === 'match') return { ...base, final: c.final };
  if (c.k === 'slam') return { ...base, target: c.target };
  if (['scan', 'hologram', 'complete'].includes(c.k)) return base;
  return undefined;
}
export function makePlan(seed = 20261022) {
  const clock = new ShowcaseClock(), events = [];
  /** @type {Record<string, number>} */
  const beats = {};
  const galleryBeats = {};
  let match = 0;
  const game = new GameHost({ clock, rng: seededRng(seed), showcase: createShowcase(seed), send: () => {}, cue: e => {
    const summary = cueSummary(e); if (summary) events.push(summary);
    const c = e.cue;
    if (c.k === 'phase' && c.phase === 'lobby') beats.lobby = e.at + 6500;
    if (c.k === 'phase' && c.phase === 'hunt' && e.round === 0) beats['hunt-feeds'] = e.at + 1800;
    if (c.k === 'scan' && beats['pixel-judge-mask'] === undefined) beats['pixel-judge-mask'] = e.at + 350;
    if (c.k === 'match') match++;
    if (c.k === 'phase' && c.phase === 'mash' && match === 3) beats['brag-final-mash'] = e.at + 2400;
    if (c.k === 'hologram' && c.on) beats['showstopper-win'] = e.at + 1100;
    if (c.k === 'slam' && c.target === 'champ.name') beats.finale = e.at + 1600;
    if (c.k === 'host' && c.line.trigger === 'intro.reel-land' && e.round === 0) galleryBeats['prompt-reel'] = e.at + e.cue.typingMs + 150;
    if (c.k === 'meter' && e.round === 0) galleryBeats['pixel-judge-mask'] = e.at + 900;
    if (c.k === 'host' && c.line.trigger === 'judge.winner') galleryBeats['judge-win'] = e.at + c.typingMs + 400;
    if (c.k === 'host' && c.line.trigger === 'stand.leader' && e.round === 2) galleryBeats['standings-overtake'] = e.at + c.typingMs + 100;
    if (c.k === 'hologram' && c.on) galleryBeats['showstopper-win'] = e.at + 2100;
    if (c.k === 'host' && c.line.trigger === 'show.winner') galleryBeats['showstopper-win'] = Math.max(galleryBeats['showstopper-win'] ?? 0, e.at + c.typingMs + 100);
    if (c.k === 'host' && c.line.trigger === 'champ.thanks') galleryBeats.finale = e.at + c.typingMs + 100;
  } });
  game.playShowcase();
  for (let ms = 500; ms <= 600_000 && !game.getView().completed; ms += 500) clock.advanceTo(ms);
  if (!game.getView().completed) throw new Error('Showcase did not finish');
  const durationMs = events.find(e => e.kind === 'complete').atMs + 3000;
  galleryBeats['pixel-judge-mask'] = galleryBeats['judge-win'];
  const plan = { version: 1, target: 'core', syntheticOnly: true, seed, script: createShowcase(seed).script.id, durationMs, events, beats, galleryBeats: { ...beats, ...galleryBeats }, scenes: sceneRanges(events, durationMs), scores: game.getView().teams.map(t => ({ name: t.name, score: t.score })) };
  game.dispose(); return plan;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ args: process.argv.slice(2).filter(a => a !== '--'), options: { seed: { type: 'string', default: '20261022' }, out: { type: 'string' } } });
  const plan = makePlan(Number(values.seed));
  if (values.out) { await saveManifest(resolve(values.out), plan); console.log(`Cue plan: ${values.out} (${(plan.durationMs / 1000).toFixed(1)}s, ${plan.scenes.length} scenes)`); }
  else console.log(json({ seed: plan.seed, durationSeconds: plan.durationMs / 1000, beats: plan.beats, scores: plan.scores }));
}
