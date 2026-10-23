// Host lines of the deterministic showcase, with their showcase-clock times (for the video's voice track).
import { GameHost, ShowcaseClock, createShowcase, seededRng } from './shared.mjs';
const seed = Number(process.argv[2] ?? 20261022), clock = new ShowcaseClock(), lines = [];
const game = new GameHost({ clock, rng: seededRng(seed), showcase: createShowcase(seed), send: () => {}, cue: e => {
  const c = e.cue; if (c.k === 'host') lines.push({ atMs: e.at, round: e.round, trigger: c.line?.trigger, text: c.line?.text ?? c.text, typingMs: c.typingMs, mood: c.mood });
} });
game.playShowcase();
for (let ms = 500; ms <= 600_000 && !game.getView().completed; ms += 500) clock.advanceTo(ms);
console.log(JSON.stringify(lines, null, 1));
