import { describe, expect, it, vi } from 'vitest';
import { BRAGP, GameHost, HOST_LINES, HostTrack, SHOWP, hostTypingMs, seededRng } from '../src';
import type { TvCue, TvView } from '../src';
import { Timeline } from '../src/game/timeline';
import { VirtualClock } from './gameClock';

function track(callbackLag = 0) {
  const clock = new VirtualClock(), time = new Timeline({ now: () => clock.now(), setTimeout: (fn, ms) => clock.setTimeout(fn, ms + callbackLag), clearTimeout: h => clock.clearTimeout(h) }), cues: TvCue[] = [];
  const state: TvView['host'] = { typing: false, visible: false, reaction: 'norm' };
  const host = new HostTrack(time, c => cues.push(c), state, () => {});
  const speech = () => cues.filter((c): c is Extract<TvCue, { k: 'host' }> => c.k === 'host');
  return { clock, time, host, state, cues, speech };
}

describe('shared-TV host copy', () => {
  it('names the leader and last team, with three distinct round-selected standings lines', () => {
    const lines = [0, 1, 2].map(r => HOST_LINES.standings('Couch Potatoes', r, "Grandma's Revenge").text);
    expect(lines).toEqual([
      '**Couch Potatoes** lead the pack! Do not get cocky. Get a little cocky.',
      "**Couch Potatoes** leads. It is still anyone's game.",
      "**Couch Potatoes** leads. Somebody has to be last. Today it is **Grandma's Revenge**.",
    ]);
    expect(new Set(lines).size).toBe(3); expect(lines.join(' ')).not.toMatch(/\byou\b/i);
    expect(HOST_LINES.champion('Sock Goblins').text).toBe('Your champions: **Sock Goblins**! Their prize? Eternal bragging rights.');
    expect(HOST_LINES.welcome('Sock Goblins').text).toBe('Welcome, **Sock Goblins**! Lovely badge. Very **Sock Goblins**.');
    expect(HOST_LINES.ready(4).text).not.toMatch(/\byou\b/i);
  });
  it('speaks all six complete trait prompts, omitting only their editorial asides', () => {
    const prompts = [...BRAGP.map(p => ({ ...p, kind: 'brag' as const })), ...SHOWP.map(p => ({ ...p, kind: 'show' as const }))];
    expect(prompts.map(p => HOST_LINES.prompt(p).text)).toEqual([
      '**Something a pirate would steal**. Be bold. Be weird.',
      '**Something that has seen things**. Be bold. Be weird.',
      '**Something that would win a fight against anything**. Be bold. Be weird.',
      '**Your island buddy for a desert island**. Be bold. Be weird.',
      '**The weirdest thing you can find**. Be bold. Be weird.',
      '**Something that belongs in a museum**. Be bold. Be weird.',
    ]);
    expect(HOST_LINES.prompt({ ...prompts[0]!, c: 'a treasure chest' }).text).toBe('**Something a pirate a treasure chest**. Be bold. Be weird.');
    expect(HOST_LINES.prompt({ kind: 'color', k: 'RED', hex: '#F23B2E' }).text).toBe('Find the most **red** thing you can. Closest color wins.');
  });
});

describe('optional TV speech integration', () => {
  it('prefetches dynamic winner announcements during the existing reveal waits', () => {
    const clock = new VirtualClock(), prefetched = new Map<string, number>(), leads: { trigger: string; ms: number }[] = [];
    const game = new GameHost({ clock, rng: seededRng(1), send: () => {},
      prefetchHost: line => { if (!prefetched.has(line.text)) prefetched.set(line.text, clock.now()); },
      cue: e => { if (e.cue.k === 'host' && ['judge.winner', 'brag.winner', 'show.winner'].includes(e.cue.line.trigger)) leads.push({ trigger: e.cue.line.trigger, ms: clock.now() - prefetched.get(e.cue.line.text)! }); },
    });
    game.setBots(true); game.remote('select'); game.remote('down'); game.remote('select');
    clock.runUntil(() => game.getView().completed);
    expect(leads).toHaveLength(4);
    expect(leads.find(l => l.trigger === 'judge.winner')!.ms).toBeGreaterThanOrEqual(2600);
    expect(leads.find(l => l.trigger === 'show.winner')!.ms).toBeGreaterThanOrEqual(1900);
    expect(leads.filter(l => l.trigger === 'brag.winner').every(l => l.ms >= 560)).toBe(true);
    game.dispose();
  });
  it('prefetches a queued line while the current line is still typing', () => {
    const h = track(), prepared = vi.fn();
    const host = new HostTrack(h.time, c => h.cues.push(c), h.state, () => {}, prepared);
    const first = HOST_LINES.lobby(), next = HOST_LINES.welcome('Next team');
    host.say(first); host.say(next);
    expect(h.state.line?.text).toBe(first.text); expect(h.state.typing).toBe(true);
    expect(prepared.mock.calls.map(([line]) => line.text)).toEqual([first.text, next.text]);
    host.clear();
  });
  it('keeps a longer clip and its following line serialized, including across pause', () => {
    const h = track(), first = HOST_LINES.lobby(), next = HOST_LINES.welcome('Next team');
    h.host.say(first); h.host.say(next); h.clock.advance(100);
    const delta = h.host.speechTiming(first.text, 4000);
    expect(delta).toBe(4100 - hostTypingMs(first.text));
    h.clock.advance(200); h.time.pause(); h.clock.advance(10000); expect(h.state.line?.text).toBe(first.text);
    h.time.resume(); h.clock.advance(3800); expect(h.state.typing).toBe(false); expect(h.state.line?.text).toBe(first.text);
    h.clock.advance(first.hold); expect(h.state.line?.text).toBe(next.text);
    expect(h.host.speechTiming('stale line', 9999)).toBe(0); h.host.clear();
  });
  it('extends a speech-owned flow wait, without extending a timed hunt', () => {
    const clock = new VirtualClock(), cues: TvCue[] = [];
    const game = new GameHost({ clock, rng: seededRng(1), send: () => {}, cue: e => cues.push(e.cue), prefetchHost: () => {} });
    game.setBots(true); game.remote('select'); game.remote('down'); game.remote('select');
    clock.runUntil(() => game.getView().host.line?.trigger === 'intro.title');
    const line = game.getView().host.line!; clock.advance(100); game.speechTiming(line.text, 5000);
    clock.advance(4900); expect(game.getView().phase).toBe('title');
    clock.advance(100 + line.hold); expect(game.getView().host.typing).toBe(false);
    clock.runUntil(() => game.getView().phase === 'hunt');
    const deadline = game.getView().deadline;
    game.speechTiming(game.getView().host.line?.text ?? '', 10000); expect(game.getView().deadline).toBe(deadline);
    game.pause(); for (let i = 0; i < 4; i++) game.remote('down'); game.remote('select');
    expect(game.getView().voice).toBe(false); expect(game.getView().sound).toBe(true);
    game.dispose();
  });
});

describe('bounded optional host speech', () => {
  it('plays a winner quip after the knockout line finishes typing, inside its existing hold', () => {
    const h = track(), main = HOST_LINES.bragWinner('Alpha', 'Bravo', 0), quip = HOST_LINES.quip('Ace.');
    const endsAt = h.clock.now() + hostTypingMs(main.text) + main.hold;
    const wait = h.host.say(main, until => expect(h.host.trySay(quip, until, true)).toBe(true));
    expect(wait).toBe(endsAt - h.clock.now()); expect(h.speech()).toHaveLength(1);
    h.clock.advance(hostTypingMs(main.text));
    expect(h.speech().map(c => c.line.trigger)).toEqual(['brag.winner', 'reveal.ai-quip']);
    const finish = h.cues.findIndex(c => c.k === 'host-finish' && c.text === main.text), speech = h.cues.findIndex(c => c.k === 'host' && c.line === h.state.line);
    expect(finish).toBeLessThan(speech);
    h.clock.advance(main.hold); expect(h.state.typing).toBe(false); expect(h.clock.now()).toBe(endsAt);
  });
  it('drops overlong quips, including an overlong knockout replacement', () => {
    const h = track(), quip = HOST_LINES.quip('Q'.repeat(80));
    expect(h.host.trySay(quip, h.time.now() + 900)).toBe(false);
    h.host.say(HOST_LINES.bragWinner('Alpha', 'Bravo', 0), until => expect(h.host.trySay(quip, until, true)).toBe(false));
    h.clock.advance(5000); expect(h.speech().map(c => c.line.trigger)).toEqual(['brag.winner']);
  });
  it('admits queued speech only if the entire typing/hold fits the deadline', () => {
    const h = track(), end = h.time.now() + h.host.say(HOST_LINES.runway()), quip = HOST_LINES.quip('Ace.');
    const duration = hostTypingMs(quip.text) + quip.hold;
    expect(h.host.trySay(quip, end + duration - 1)).toBe(false);
    expect(h.host.trySay(quip, end + duration)).toBe(true);
    h.clock.advance(end - h.time.now() + duration); expect(h.speech()).toHaveLength(2); expect(h.state.typing).toBe(false);
  });
  it('cancels queued and active quips at a phase boundary, and freezes their budget while paused', () => {
    const h = track(); h.host.say(HOST_LINES.runway()); expect(h.host.trySay(HOST_LINES.quip('Ace.'), h.time.now() + 5000)).toBe(true);
    h.host.cancelQuips(); h.clock.advance(5000); expect(h.speech()).toHaveLength(1);
    expect(h.host.trySay(HOST_LINES.quip('Bravo.'), h.time.now() + 1000)).toBe(true);
    h.clock.advance(34); h.time.pause(); const count = h.cues.length; h.clock.advance(20_000); expect(h.cues).toHaveLength(count);
    h.time.resume(); h.host.cancelQuips(); expect(h.state.typing).toBe(false); expect(h.state.visible).toBe(false);
    const cancelled = h.cues.length; h.clock.advance(5000); expect(h.cues).toHaveLength(cancelled);
  });
  it('does not repeat adjacent queued, played or optional lines, and resets for a new game', () => {
    const h = track(), first = HOST_LINES.welcome('Alpha'), second = HOST_LINES.ready(4);
    h.host.say(first); h.host.say(first); h.host.say(second); h.host.say(second);
    h.clock.advance(15_000); expect(h.speech().map(c => c.line.text)).toEqual([first.text, second.text]);
    expect(h.host.say(second)).toBe(0); expect(h.host.trySay(second, h.time.now() + 10_000)).toBe(false);
    h.host.clear(); h.host.say(second); expect(h.speech()).toHaveLength(3);
  });
  it('cancels overdue callbacks so a delayed quip never finishes over a newer vote line', () => {
    const h = track(2000), quip = HOST_LINES.quip('Ace.');
    expect(h.host.trySay(quip, h.time.now() + 1000)).toBe(true); h.clock.advance(1000);
    h.host.say(HOST_LINES.vote()); h.clock.advance(5000);
    expect(h.speech().map(c => c.line.trigger)).toEqual(['reveal.ai-quip', 'show.vote']);
    expect(h.cues.some(c => c.k === 'host-finish' && c.text === quip.text)).toBe(false);
  });
});
