import { describe, expect, it } from 'vitest';
import { GameHost, PHONE_COLORS, SHOWCASE_HOST_CID, ShowcaseClock, createShowcase, isJudgeMask, seededRng } from '../src';
import type { CueEvent, GameOptions, TvView } from '../src';

function film(seed = 20261022) {
  const clock = new ShowcaseClock(), cues: CueEvent[] = [], standings: TvView[] = [];
  const game = new GameHost({ clock, rng: () => { throw new Error('Caller RNG used in showcase'); }, showcase: createShowcase(seed), cue: e => cues.push(e), send: () => {},
    view: v => { if (v.phase === 'standings' && v.content.k === 'stand' && v.content.reordered && !standings.some(s => s.round === v.round)) standings.push(v); } });
  game.playShowcase(); clock.advanceTo(400_000);
  return { game, clock, cues, standings, final: game.getView() };
}

describe('opt-in submission showcase', () => {
  it('replays identical cues, prompts, finds, votes and scores from its own seed', () => {
    const a = film(), b = film();
    expect(a.final.completed).toBe(true); expect(a.cues).toEqual(b.cues); expect(a.final).toEqual(b.final);
    expect(a.cues.filter(e => e.cue.k === 'reel').map(e => e.cue.k === 'reel' && e.cue.cards.at(-1)!.b)).toEqual(['PINK', 'PIRATE', 'WEIRDEST']);
    expect(a.final.history.map(f => f.name)).toEqual(['Glove Actually', 'Donut Disturb', 'Groovy Gloria', 'Clank Hanks', 'Admiral Squeak', 'Her Royal Shininess', 'Great Uncle Mort', 'Pan Solo', 'Sockrates', 'The Blobfather', 'Sir Whiskers', 'Tiny Arms Tony']);
    expect(a.final.history.filter(f => f.round === 0).every(f => isJudgeMask(f.mask))).toBe(true);
    expect(a.final.history.every(f => f.obj && !f.photoId)).toBe(true);
    const votes = a.cues.filter(e => e.cue.k === 'vote').map(e => e.cue.k === 'vote' && e.cue.team);
    expect(votes.filter(t => t === 'p1')).toHaveLength(2);
    expect(a.standings[1]!.content.k === 'stand' && a.standings[1]!.content.ranking[0]).toBe('jd');
    expect(a.final.content.k === 'champ' && a.final.content.ranking[0]).toBe('p1');
    expect(a.final.teams.map(t => t.score)).toEqual([429, 307, 347, 135]);
    for (const t of a.final.teams) expect(t.score).toBe(a.final.history.filter(f => f.team === t.id).reduce((n, f) => n + f.pts!, 0));
    const matches = a.cues.filter(e => e.cue.k === 'match');
    const finalStart = matches.at(-1)!.at;
    const mash = a.cues.filter(e => e.at >= finalStart && e.cue.k === 'mash').map(e => e.cue.k === 'mash' ? e.cue.p : 0);
    expect(Math.max(...mash.map(Math.abs))).toBeLessThan(.24); expect(mash.at(-1)).toBeCloseTo(.1);
    a.game.dispose(); b.game.dispose();
  });
  it('leaves normal games byte-for-byte unchanged when omitted or false', () => {
    const play = (showcase?: GameOptions['showcase']) => {
      const clock = new ShowcaseClock(), cues: CueEvent[] = [], messages: unknown[] = [];
      const game = new GameHost({ clock, rng: seededRng(43), showcase, cue: e => cues.push(e), send: (cid, m) => messages.push({ cid, m }) });
      game.playShowcase(); clock.advanceTo(10_000); // Explicitly inert without the flag.
      expect(game.getView().teams.filter(t => t.joined !== false)).toHaveLength(0);
      game.receive('phone', { t: 'join', name: 'Hosts', color: PHONE_COLORS[0]! }); game.setBots(true); game.receive('phone', { t: 'start' }); clock.advanceTo(500_000);
      const result = { view: game.getView(), cues, messages }; game.dispose(); return result;
    };
    expect(play(false)).toEqual(play());
  });
  it('rejects malformed scripts and ignores external live photos in a filming session', () => {
    const preset = createShowcase(); expect(() => createShowcase(1, { ...preset.script, voteFor: [0, 0, 0, 1] })).toThrow(/ballot/);
    const clock = new ShowcaseClock(), game = new GameHost({ clock, rng: seededRng(1), showcase: preset, cue: () => {}, send: () => {} });
    game.playShowcase(); game.receive('external-phone', { t: 'join', name: 'Live player', color: PHONE_COLORS[1]! }); clock.advanceTo(6000);
    expect(game.getView().teams.map(t => t.name)).not.toContain('Live player');
    clock.advanceTo(23_000);
    game.receive(SHOWCASE_HOST_CID, { t: 'snag', photoId: 'external-photo', round: 0, hex: '#FF6FB5', match: 99 });
    game.peer('external-phone', true); clock.advanceTo(400_000);
    expect(game.getView().history.every(f => f.obj && !f.photoId)).toBe(true); game.dispose();
  });
});
