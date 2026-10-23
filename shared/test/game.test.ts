import { describe, expect, it } from 'vitest';
import { GameHost, HOST_LINES, HOST_REACTIONS, OBJ, PHONE_COLORS, SCORING, TOKENS, seededRng } from '../src';
import type { AiRead, CueEvent, ScreenMsg, TvToPhone, TvView } from '../src';
import { VirtualClock } from './gameClock';

const ai: AiRead = { thing: 'red cup', names: ['Count Cup', 'Sir Sip', 'Cupcake'], brags: ['A proper cup.', 'Holds grudges.'], score: 8, quip: 'Quite the cup.', fallback: false };
interface ScriptOptions { humans?: number; bots?: boolean; neverSnags?: string[]; aiDelay?: number | null; autoGlow?: boolean; aiRead?: (cid: string, round: number) => AiRead; mask?: string; inspectView?: (view: TvView) => void; matchFor?: (cid: string) => number; snagDelayFor?: (cid: string) => number }
function harness(options: ScriptOptions = {}) {
  const clock = new VirtualClock(), cues: CueEvent[] = [], messages: { cid: string; m: TvToPhone }[] = [];
  const hostViews = new Map<number, TvView>();
  const scripted = new Set<string>(), glowing = new Set<string>(), voting = new Set<string>(), mashing = new Set<string>();
  let game: GameHost;
  const send = (cid: string, m: TvToPhone) => {
    messages.push({ cid, m });
    if (m.t !== 'screen' || !m.me || !game) return;
    const key = cid + ':' + m.round;
    if (m.s.k === 'cam' && !scripted.has(key) && !options.neverSnags?.includes(cid)) {
      scripted.add(key);
      clock.setTimeout(() => {
        if (!game.getView().teams.find(t => t.id === m.me!.id)?.connected) return;
        const photoId = 'synthetic:' + key;
        game.receive(cid, { t: 'snag', photoId, round: m.round, hex: '#F23B2E', match: options.matchFor?.(cid) ?? 92, ...(options.mask ? { mask: options.mask } : {}) });
        if (options.aiDelay !== null) clock.setTimeout(() => game.ai(cid, photoId, options.aiRead?.(cid, m.round) ?? ai), options.aiDelay ?? 100);
      }, options.snagDelayFor?.(cid) ?? 1200);
    }
    if (m.s.k === 'glow' && options.autoGlow !== false && !glowing.has(key)) {
      glowing.add(key);
      clock.setTimeout(() => {
        const latest = game.getScreen(cid)?.s;
        if (latest?.k === 'glow') game.receive(cid, { t: 'glow', eyes: [[42, 46], [78, 46]], name: latest.names[0]!, brag: latest.brags[0]! });
      }, 700);
    }
    if (m.s.k === 'vote' && !voting.has(key) && m.s.options.length) {
      voting.add(key); const choice = m.s.options[0]!.team;
      clock.setTimeout(() => game.receive(cid, { t: 'vote', team: choice }), 1000);
    }
    if (m.s.k === 'mash' && m.s.phase === 'mash') {
      const matchKey = key + ':' + m.s.left.team.id + ':' + m.s.right.team.id;
      if (mashing.has(matchKey)) return; mashing.add(matchKey);
      let fraction = 0;
      const tap = () => {
        const screen = game.getScreen(cid)?.s;
        if (screen?.k !== 'mash' || screen.phase !== 'mash' || game.getView().paused) return;
        fraction += .7; const n = Math.floor(fraction); fraction -= n;
        if (n) game.receive(cid, { t: 'tap', n, side: screen.right.team.id === m.me!.id ? 1 : -1 });
        clock.setTimeout(tap, 100);
      };
      clock.setTimeout(tap, 100);
    }
  };
  game = new GameHost({ clock, rng: seededRng(42), send, cue: e => { cues.push(e); if (e.cue.k === 'host' && game) hostViews.set(e.seq, game.getView()); }, view: options.inspectView, room: { code: 'TEST', joinUrl: 'https://example.invalid/?r=TEST' } });
  for (let i = 0; i < (options.humans ?? 1); i++) {
    const cid = 'phone' + i; game.peer(cid, true); game.receive(cid, { t: 'join', name: 'Team ' + i, color: PHONE_COLORS[i]! });
  }
  if (options.bots ?? true) game.receive('phone0', { t: 'bots', on: true });
  game.receive('phone0', { t: 'start' });
  return { clock, game, cues, messages, hostViews, clearScripts: () => { scripted.clear(); glowing.clear(); voting.clear(); mashing.clear(); } };
}
const screens = (messages: { cid: string; m: TvToPhone }[], cid = 'phone0') => messages.filter(x => x.cid === cid && x.m.t === 'screen').map(x => x.m as ScreenMsg);

describe('TV-owned deterministic game', () => {
  it('plays all scenes and all phone screens, with exact round score accounting', () => {
    const h = harness(); h.clock.runUntil(() => h.game.getView().completed);
    const view = h.game.getView();
    expect(h.cues.filter(e => e.cue.k === 'scene').map(e => (e.cue as { scene: string }).scene)).toEqual([
      'lobby', 'intro', 'hunt', 'judge', 'stand', 'intro', 'hunt', 'brag', 'brag', 'brag', 'stand', 'intro', 'hunt', 'show', 'stand', 'champ',
    ]);
    expect(view.history).toHaveLength(12);
    const color = view.history.filter(f => f.round === 0).sort((a, b) => a.time! - b.time!);
    color.forEach((f, i) => expect(f.pts).toBe(f.match! + SCORING.SPEED_BONUS[i]!));
    expect(view.history.filter(f => f.round === 1).reduce((n, f) => n + f.pts!, 0)).toBe(350);
    expect(view.history.filter(f => f.round === 2).reduce((n, f) => n + f.pts!, 0)).toBe(500);
    for (const team of view.teams) expect(team.score).toBe(view.history.filter(f => f.team === team.id).reduce((n, f) => n + f.pts!, 0));
    const kinds = [...new Set(screens(h.messages).map(m => m.s.k))];
    expect(kinds).toEqual(['join', 'lobby', 'ready', 'cam', 'glow', 'wait', 'mash', 'vote', 'end']);
    const end = h.game.getScreen('phone0')!; expect(end.round).toBe(3); expect(end.s.k).toBe('end');
    if (end.s.k === 'end') { expect(end.s.rows).toHaveLength(3); expect(end.s.best?.pts).toBe(Math.max(...end.s.rows.map(r => r.pts))); }
    expect(h.cues.every((e, i) => i === 0 || e.seq > h.cues[i - 1]!.seq && e.at >= h.cues[i - 1]!.at)).toBe(true);
    h.game.dispose(); expect(h.clock.pending).toBeLessThanOrEqual(1); // only a scripted phone's independent tap can remain
  });
  it.each([2, 3])('runs a %i-team bracket with the correct win points', humans => {
    const phases = new Set<string>();
    const h = harness({ humans, bots: false, inspectView: view => {
      if (view.round < 0) return;
      phases.add(view.phase);
      expect(view.teams).toHaveLength(humans);
      expect(view.teams.every(t => t.joined !== false && t.name !== 'Waiting…')).toBe(true);
      expect(view.feeds.every(f => view.teams.some(t => t.id === f.team))).toBe(true);
    } }); h.clock.runUntil(() => h.game.getView().completed);
    const matches = h.cues.filter(e => e.cue.k === 'match');
    expect(matches).toHaveLength(humans - 1);
    expect(matches.map(e => e.cue.k === 'match' && e.cue.points)).toEqual(humans === 2 ? [150] : [100, 150]);
    expect(h.game.getView().history.filter(f => f.round === 1).reduce((n, f) => n + f.pts!, 0)).toBe(humans === 2 ? 150 : 250);
    expect([...phases]).toEqual(expect.arrayContaining(['title', 'hunt', 'glow', 'judge', 'mash', 'vote', 'standings', 'finale']));
    expect(screens(h.messages).filter(s => s.round >= 0).every(s => s.teams.length === humans)).toBe(true);
    expect(screens(h.messages).every(s => s.teams.every(t => t.joined !== false))).toBe(true);
    expect(h.game.getView().content.k).toBe('champ'); h.game.dispose();
  });
  it('shows neutral lobby slots, adds bots only when enabled, and restores slots after ending', () => {
    const clock = new VirtualClock(), game = new GameHost({ clock, rng: seededRng(7), send: () => {}, cue: () => {} });
    const neutral = () => {
      const empty = game.getView().teams.filter(t => t.joined === false);
      expect(empty.every(t => t.name === 'Waiting…' && t.mono === '' && t.color === TOKENS.paper && !t.bot && !t.connected && t.score === 0)).toBe(true);
      return empty;
    };
    expect(game.getView().teams).toHaveLength(4); expect(neutral()).toHaveLength(4);
    game.receive('host', { t: 'join', name: 'Hosts', color: PHONE_COLORS[0]! });
    expect(neutral()).toHaveLength(3); expect(game.getScreen('host')!.teams).toHaveLength(1);
    game.setBots(true); expect(neutral()).toHaveLength(0);
    expect(game.getView().teams.filter(t => t.bot).map(t => t.mono)).toEqual(['CP', 'JD', 'GR']);
    game.setBots(false); expect(neutral()).toHaveLength(3);
    game.receive('rival', { t: 'join', name: 'Rivals', color: PHONE_COLORS[1]! });
    game.receive('host', { t: 'start' });
    expect(game.getView().round).toBe(0); expect(game.getView().teams).toHaveLength(2);
    game.peer('rival', false); expect(game.getView().teams).toHaveLength(2);
    game.receive('host', { t: 'control', action: 'end' }); game.remote('down'); game.remote('select');
    expect(game.getView().round).toBe(-1); expect(game.getView().teams).toHaveLength(4); expect(neutral()).toHaveLength(2);
    expect(game.getScreen('host')!.teams).toHaveLength(2); game.dispose();
  });
  it('carries a real Color Rush mask through feeds, cues, AI, judge cards and history; bots and other rounds get none', () => {
    const mask = Buffer.from(new Uint8Array(72).fill(0x55)).toString('base64'), h = harness({ mask });
    h.clock.runUntil(() => h.game.getScreen('phone0')?.s.k === 'glow');
    const glow = h.game.getScreen('phone0')!.s;
    expect(glow.k === 'glow' && glow.find.mask).toBe(mask);
    expect(h.game.getView().feeds.find(f => f.find?.photoId)?.find?.mask).toBe(mask);
    expect(h.cues.some(e => e.cue.k === 'find' && e.cue.find.mask === mask)).toBe(true);
    h.clock.runUntil(() => h.game.getView().phase === 'judge' && h.game.getView().content.k === 'judge');
    const judge = h.game.getView().content;
    if (judge.k !== 'judge') throw new Error('No judge cards');
    expect(judge.cards.find(c => c.find.photoId)?.find.mask).toBe(mask);
    expect(judge.cards.filter(c => c.find.obj).every(c => !('mask' in c.find))).toBe(true);
    h.clock.runUntil(() => h.game.getView().completed);
    const history = h.game.getView().history;
    expect(history.filter(f => f.mask)).toHaveLength(1);
    expect(history.find(f => f.photoId && f.round === 0)?.mask).toBe(mask);
    expect(history.filter(f => f.obj || f.round > 0).every(f => !('mask' in f))).toBe(true);
    h.game.dispose();
  });
  it('crowns the closest color match, even when a faster near-miss has more points', () => {
    // phone0 snags first (+30) at 80% = 110 points; phone1 snags second (+20) at 89% = 109 points.
    const h = harness({ humans: 2, bots: false, matchFor: cid => cid === 'phone0' ? 80 : 89, snagDelayFor: cid => cid === 'phone0' ? 1200 : 2400 });
    h.clock.runUntil(() => { const c = h.game.getView().content; return c.k === 'judge' && !!c.winner; });
    const judge = h.game.getView().content;
    if (judge.k !== 'judge') throw new Error('No judge');
    const pts = Object.fromEntries(judge.cards.map(c => [c.find.team, c.find.pts]));
    const team1 = h.game.getView().teams.find(t => t.name === 'Team 1')!.id, team0 = h.game.getView().teams.find(t => t.name === 'Team 0')!.id;
    expect(pts[team0]).toBeGreaterThan(pts[team1]!);
    expect(judge.winner).toBe(team1);
    h.game.dispose();
  });

  it('ignores a malformed optional mask while still accepting the photo', () => {
    const h = harness({ mask: 'bad-mask' }); h.clock.runUntil(() => h.game.getScreen('phone0')?.s.k === 'glow');
    const s = h.game.getScreen('phone0')!.s;
    expect(s.k === 'glow' && !!s.find.photoId).toBe(true);
    if (s.k === 'glow') expect(s.find).not.toHaveProperty('mask');
    h.game.dispose();
  });
  it('gives a non-snagging team zero points, a bye to its opponent, and no pedestal', () => {
    const h = harness({ humans: 2, bots: false, neverSnags: ['phone1'] }); h.clock.runUntil(() => h.game.getView().completed);
    const team = h.game.getScreen('phone1')!.me!;
    expect(team.score).toBe(0); expect(h.game.getView().history.filter(f => f.team === team.id).every(f => f.missed && f.pts === 0)).toBe(true);
    const match = h.cues.find(e => e.cue.k === 'match')!.cue; expect(match.k === 'match' && match.bye).toBeTruthy();
    expect(h.cues.filter(e => e.cue.k === 'animate' && e.cue.target === 'show-find:' + team.id)).toHaveLength(0);
    h.game.dispose();
  });
  it.each([2, 3, 4])('anchors all three winner confetti bursts to the centered pedestal with %i eligible finds', count => {
    const h = harness({ humans: 4, bots: false, neverSnags: Array.from({ length: 4 - count }, (_, i) => 'phone' + (i + count)) });
    try {
      h.clock.runUntil(() => { const c = h.game.getView().content; return c.k === 'show' && !!c.winner; });
      const content = h.game.getView().content;
      if (content.k !== 'show') throw new Error('Expected Showstopper');
      expect(content.pedestals).toHaveLength(count);
      const showStart = h.cues.filter(e => e.cue.k === 'scene' && e.cue.scene === 'show').at(-1)!.seq;
      const bursts = h.cues.filter(e => e.seq > showStart && e.cue.k === 'confetti' && e.cue.count === 90 && e.cue.power === 1300);
      expect(bursts).toHaveLength(3);
      for (const e of bursts) if (e.cue.k === 'confetti') expect(e.cue.at).toEqual({ target: 'pedestal:' + content.winner, y: 300 });
      expect(bursts.map(e => e.cue.k === 'confetti' ? e.cue.delayMs : -1)).toEqual([0, 350, 700]);
    } finally { h.game.dispose(); }
  });
  it('keeps a dropped team and reconnects it to a fresh current screen', () => {
    const h = harness({ humans: 2, bots: false, neverSnags: ['phone1'] });
    h.clock.runUntil(() => h.game.getView().phase === 'hunt');
    h.game.peer('phone1', false); h.clock.advance(10_000); const old = h.game.getScreen('phone1')!;
    h.game.peer('phone1', true); const rejoined = h.game.getScreen('phone1')!;
    expect(rejoined.seq).toBeGreaterThan(old.seq); expect(rejoined.s.k).toBe('cam'); expect(rejoined.me!.connected).toBe(true);
    h.game.peer('phone1', false); h.clock.runUntil(() => h.game.getView().phase === 'glow'); h.game.peer('phone1', true);
    expect(h.game.getScreen('phone1')!.s.k).toBe('wait'); expect(h.game.getView().teams).toHaveLength(2); h.game.dispose();
  });
  it('freezes bots, host typing and deadlines while paused; resumes with shifted deadlines', () => {
    const h = harness({ neverSnags: ['phone0'] }); h.clock.runUntil(() => h.game.getView().phase === 'hunt');
    h.clock.advance(1000); const before = h.game.getView(); h.game.remote('playpause'); const count = h.cues.length;
    h.clock.advance(20_000); expect(h.cues).toHaveLength(count); expect(h.game.getView().feeds.every(f => f.state === 'hunting')).toBe(true);
    h.game.remote('select'); expect(h.game.getView().paused).toBe(false); expect(h.game.getScreen('phone0')!.deadline).toBe(before.deadline! + 20_000);
    h.game.remote('ff'); expect(h.game.getView().phase).toBe('time');
    expect(h.game.getView().feeds.filter(f => f.find?.obj)).toHaveLength(3); expect(h.game.getScreen('phone0')!.s.k).toBe('wait'); h.game.dispose();
  });
  it('does not land point flights during a pause', () => {
    const h = harness(); h.clock.runUntil(() => h.cues.some(e => e.cue.k === 'fly-points'));
    const before = h.game.getView().teams.map(t => t.score); h.game.pause(); h.clock.advance(40_000);
    expect(h.game.getView().teams.map(t => t.score)).toEqual(before); h.game.resume(); h.clock.advance(1300);
    expect(h.game.getView().teams.some((t, i) => t.score > before[i]!)).toBe(true); h.game.dispose();
  });
  it('Back opens a menu; ending requires confirmation; remote settings have visible focus', () => {
    const h = harness(); h.clock.runUntil(() => h.game.getView().phase === 'hunt'); h.game.remote('back');
    expect(h.game.getView().menu?.options).toEqual(['Resume', 'Skip this phase', 'Sound', 'Music', 'Voice', 'End game']);
    h.game.remote('down'); h.game.remote('down'); h.game.remote('select'); expect(h.game.getView().sound).toBe(false);
    h.game.receive('phone0', { t: 'control', action: 'end' }); expect(h.game.getView().menu?.kind).toBe('confirm-end');
    h.game.remote('back'); expect(h.game.getView().round).toBe(0);
    h.game.receive('phone0', { t: 'control', action: 'end' }); h.game.remote('down'); h.game.remote('select');
    h.clock.runUntil(() => h.game.getView().scene === 'lobby'); expect(h.game.getView().round).toBe(-1); expect(h.game.getView().history).toHaveLength(0);
    expect(h.cues.some(e => e.cue.k === 'menu' && e.cue.focusColor === '#FFD43B')).toBe(true); h.game.dispose();
  });
  it('rematches with the same teams, resetting scores and photo references', () => {
    const h = harness(); h.clock.runUntil(() => h.game.getView().completed); const teams = h.game.getView().teams;
    h.clearScripts(); h.game.receive('phone0', { t: 'again' });
    expect(h.game.getView().teams.map(t => t.id)).toEqual(teams.map(t => t.id)); expect(h.game.getView().teams.every(t => t.score === 0)).toBe(true); expect(h.game.getView().history).toEqual([]);
    h.clock.runUntil(() => h.game.getView().completed); expect(h.game.getView().history).toHaveLength(12); h.game.dispose();
  });
  it.each([null, 5000, 40_000])('does not wait for AI (%s ms), and late names never replace a sent name', aiDelay => {
    const h = harness({ aiDelay }); h.clock.runUntil(() => h.game.getView().completed);
    const first = h.game.getView().history.find(f => f.team === h.game.getScreen('phone0')!.me!.id)!;
    expect(first.name).not.toBe('Count Cup');
    if (aiDelay === 5000) expect(first.thing).toBe('red cup');
    const endTime = h.cues.find(e => e.cue.k === 'complete')!.at; expect(endTime).toBeLessThan(1_400_000); h.game.dispose();
  });
  it('replaces pending AI choices, supplies a third brag, and ignores reads for another photo', () => {
    const h = harness({ aiDelay: null, autoGlow: false }); h.clock.runUntil(() => h.game.getScreen('phone0')?.s.k === 'glow');
    const f = h.game.getScreen('phone0')!.s; if (f.k !== 'glow') throw new Error('No glow');
    h.game.ai('phone0', 'wrong-photo', ai); expect(h.game.getScreen('phone0')!.s).toEqual(f);
    h.game.ai('phone0', f.find.photoId!, ai); const updated = h.game.getScreen('phone0')!.s;
    expect(updated.k).toBe('glow'); if (updated.k === 'glow') { expect(updated.names).toEqual(ai.names); expect(updated.brags).toHaveLength(3); expect(updated.aiPending).toBe(false); }
    h.clock.runUntil(() => h.game.getView().phase === 'judge'); expect(h.game.getView().history[0]!.name).toBe('Count Cup'); h.game.dispose();
  });
  it('tracks reactions and protects in-memory thumbnails from snapshot mutation', () => {
    const h = harness({ neverSnags: ['phone0'] }); h.clock.runUntil(() => h.game.getView().phase === 'hunt');
    const bytes = new Uint8Array([1, 2, 3]); h.game.thumbnail('phone0', bytes); bytes[0] = 9;
    const snap = h.game.getView(), feed = snap.feeds.find(f => f.jpeg)!; expect(feed.jpeg![0]).toBe(1); feed.jpeg![0] = 7;
    expect(h.game.getView().feeds.find(f => f.jpeg)!.jpeg![0]).toBe(1);
    h.game.receive('phone0', { t: 'react', kind: 'star' }); expect(h.game.getView().hype).toBe(6); h.clock.advance(300); expect(h.game.getView().hype).toBe(4);
    expect(h.cues.some(e => e.cue.k === 'feed' && e.cue.thumbnail)).toBe(true); expect(h.cues.some(e => JSON.stringify(e).includes('jpeg'))).toBe(false); h.game.dispose();
  });
  it('ports all metadata and all host line/reaction triggers', () => {
    expect(OBJ).toHaveLength(26); expect(new Set(OBJ.map(o => o.id)).size).toBe(26);
    expect(OBJ.every(o => o.names.length === 3 && o.brags.length === 2 && !('zone' in o))).toBe(true);
    expect(HOST_LINES.intro(0).hold).toBe(900); expect(HOST_LINES.faceOff('A', 'B', true).brow).toBe('up'); expect(HOST_REACTIONS.knockout).toEqual(['glee', 1800]);
  });
  it('reproduces the complete game from the same seed and inputs', () => {
    const first = harness(), second = harness();
    first.clock.runUntil(() => first.game.getView().completed); second.clock.runUntil(() => second.game.getView().completed);
    expect(first.game.getView()).toEqual(second.game.getView()); expect(first.cues).toEqual(second.cues);
    first.game.dispose(); second.game.dispose();
  });
  it('preserves title, reel and hunt-grace beats in milliseconds', () => {
    const h = harness(); h.clock.runUntil(() => h.game.getView().phase === 'judge');
    const firstRound = h.cues.filter(e => e.round === 0);
    const pop = firstRound.find(e => e.cue.k === 'pop' && e.cue.target === 'intro.kicker')!;
    const title = firstRound.find(e => e.cue.k === 'slam' && e.cue.target === 'intro.title')!;
    const sub = firstRound.find(e => e.cue.k === 'pop' && e.cue.target === 'intro.sub')!;
    expect(title.at - pop.at).toBe(250); expect(sub.at - title.at).toBe(500);
    const reel = firstRound.find(e => e.cue.k === 'reel')!.cue;
    if (reel.k === 'reel') { expect(reel.durationMs).toBe(2400); expect(reel.cards).toHaveLength(16); expect(reel.cards[15]).toEqual(h.game.getView().prompt); }
    const lastSnag = firstRound.filter(e => e.cue.k === 'find').at(-1)!;
    const time = firstRound.find(e => e.cue.k === 'phase' && e.cue.phase === 'time')!;
    expect(time.at - lastSnag.at).toBe(1300); h.game.dispose();
  });
  it('breaks an even human mash by AI fit, and a Showstopper vote tie by fit', () => {
    const h = harness({ humans: 2, bots: false }); h.clock.runUntil(() => h.game.getView().phase === 'mash');
    const match = h.game.getView().content; if (match.k !== 'brag') throw new Error('No bracket');
    const right = h.game.getView().feeds.find(f => f.team === match.match.right)!;
    h.game.ai('phone1', right.find!.photoId!, { ...ai, score: 9 });
    h.clock.runUntil(() => h.game.getView().phase === 'knockout');
    const result = h.game.getView().content; if (result.k !== 'brag') throw new Error('No result'); expect(Math.abs(result.match.p)).toBeLessThan(1e-9); expect(result.match.winner).toBe(match.match.right);
    h.clock.runUntil(() => h.game.getView().phase === 'vote');
    const photo = h.game.getView().feeds.find(f => f.team === right.team)!.find!.photoId!;
    h.game.ai('phone1', photo, { ...ai, score: 9 });
    h.clock.runUntil(() => { const c = h.game.getView().content; return c.k === 'show' && !!c.winner; });
    const show = h.game.getView().content; if (show.k !== 'show') throw new Error('No show'); expect(show.winner).toBe(right.team); h.game.dispose();
  });
  it('breaks equal Showstopper fit by earlier snag order', () => {
    const h = harness({ humans: 2, bots: false }); h.clock.runUntil(() => h.game.getView().phase === 'vote');
    const first = h.game.getScreen('phone0')!.me!.id;
    h.clock.runUntil(() => { const c = h.game.getView().content; return c.k === 'show' && !!c.winner; });
    const show = h.game.getView().content; if (show.k !== 'show') throw new Error('No show'); expect(show.winner).toBe(first); h.game.dispose();
  });
  it('auto-sends first glow options and default eyes, without AI', () => {
    const h = harness({ aiDelay: null, autoGlow: false }); h.clock.runUntil(() => h.game.getScreen('phone0')?.s.k === 'glow');
    const glow = h.game.getScreen('phone0')!.s; if (glow.k !== 'glow') throw new Error('No glow');
    h.clock.runUntil(() => h.game.getView().phase === 'judge'); const find = h.game.getView().history.find(f => f.team === glow.find.team)!;
    expect(find.name).toBe(glow.names[0]); expect(find.brag).toBe(glow.brags[0]); expect(find.eyes).toEqual([[42, 46], [78, 46], 11]);
    expect(screens(h.messages).some(m => m.s.k === 'wait' && m.s.msg.startsWith('Auto-sent!'))).toBe(true); h.game.dispose();
  });
  it('finishes every phase with one fast-forward, retaining scoring and defaults', () => {
    const h = harness({ neverSnags: ['phone0'], aiDelay: null });
    for (let i = 0; i < 100 && !h.game.getView().completed; i++) h.game.remote('ff');
    expect(h.game.getView().completed).toBe(true); expect(h.game.getView().history).toHaveLength(12);
    for (const t of h.game.getView().teams) expect(t.score).toBe(h.game.getView().history.filter(f => f.team === t.id).reduce((n, f) => n + f.pts!, 0)); h.game.dispose();
  });
  it('reserves lobby colors and start/control authority for the host phone', () => {
    const clock = new VirtualClock(), game = new GameHost({ clock, rng: seededRng(7), send: () => {}, cue: () => {} });
    game.peer('host', true); game.peer('rival', true); game.receive('host', { t: 'join', name: 'Hosts', color: PHONE_COLORS[0]! });
    expect(game.getScreen('rival')!.s).toMatchObject({ k: 'join', takenColors: [PHONE_COLORS[0]] });
    game.receive('host', { t: 'start' }); expect(game.getView().phase).toBe('lobby');
    game.receive('rival', { t: 'join', name: 'Rivals', color: PHONE_COLORS[0]! }); expect(game.getScreen('rival')!.me).toBeNull();
    game.receive('rival', { t: 'join', name: 'Rivals', color: PHONE_COLORS[1]! }); game.receive('rival', { t: 'start' }); expect(game.getView().phase).toBe('lobby');
    game.receive('host', { t: 'start' }); game.receive('rival', { t: 'control', action: 'pause' }); expect(game.getView().paused).toBe(false); game.dispose();
  });
  it('snapshots in-progress native motion without replay, freezing it during pause', () => {
    const h = harness(); h.clock.runUntil(() => !!h.game.getView().motion['intro.title']);
    h.clock.advance(100); const before = h.game.getView().motion['intro.title']![0]!;
    h.game.pause(); h.clock.advance(20_000);
    const paused = h.game.getView().motion['intro.title']![0]!;
    expect(paused.elapsedMs).toBe(before.elapsedMs); expect(paused.animation.frames).toEqual(before.animation.frames);
    h.game.resume(); h.clock.advance(50); expect(h.game.getView().motion['intro.title']![0]!.elapsedMs).toBe(before.elapsedMs + 50); h.game.dispose();
  });
  it('names the shared-TV leader/champion and never repeats standings copy, while phones stay personal', () => {
    const h = harness({ humans: 2, bots: false }); h.clock.runUntil(() => h.game.getView().completed);
    const standings = h.cues.filter(e => e.cue.k === 'host' && e.cue.line.trigger === 'stand.leader');
    expect(standings).toHaveLength(3); const lines: string[] = [];
    for (const event of standings) {
      if (event.cue.k !== 'host') continue;
      const ranked = [...h.hostViews.get(event.seq)!.teams].sort((a, b) => b.score - a.score);
      expect(event.cue.line.text).toBe(HOST_LINES.standings(ranked[0]!.name, event.round, ranked.at(-1)!.name).text);
      expect(event.cue.line.text).not.toMatch(/\byou\b/i); lines.push(event.cue.line.text);
    }
    expect(new Set(lines).size).toBe(3);
    const champion = h.cues.find(e => e.cue.k === 'host' && e.cue.line.trigger === 'champ.champion')!;
    expect(champion.cue.k === 'host' && champion.cue.line.text).toBe(HOST_LINES.champion('Team 0').text);
    expect(screens(h.messages).some(s => s.s.k === 'wait' && s.s.msg.startsWith('You are'))).toBe(true);
    const spoken = h.cues.filter(e => e.cue.k === 'host');
    spoken.forEach((event, i) => { if (i && event.cue.k === 'host' && spoken[i - 1]!.cue.k === 'host') expect(event.cue.line.text).not.toBe((spoken[i - 1]!.cue as Extract<typeof event.cue, { k: 'host' }>).line.text); });
    h.game.dispose();
  });
  it.each([0, 500, 999])('skips the opening greeting when a team joins at %i ms', delay => {
    const clock = new VirtualClock(), cues: CueEvent[] = [];
    const game = new GameHost({ clock, rng: seededRng(1), send: () => {}, cue: e => cues.push(e) });
    clock.advance(delay); game.peer('host', true); game.receive('host', { t: 'join', name: 'Quick Team', color: PHONE_COLORS[0]! }); game.setBots(true);
    clock.advance(20_000);
    expect(cues.some(e => e.cue.k === 'host' && e.cue.line.trigger === 'lobby.join')).toBe(true);
    expect(cues.some(e => e.cue.k === 'host' && e.cue.line.trigger === 'lobby.ready')).toBe(true);
    expect(cues.some(e => e.cue.k === 'host' && e.cue.line.trigger === 'lobby.open')).toBe(false); game.dispose();
  });
  it('plays the empty-room greeting before a later join', () => {
    const clock = new VirtualClock(), cues: CueEvent[] = [];
    const game = new GameHost({ clock, rng: seededRng(1), send: () => {}, cue: e => cues.push(e) });
    clock.advance(1000); game.receive('host', { t: 'join', name: 'Later Team', color: PHONE_COLORS[0]! }); clock.advance(20_000);
    expect(cues.filter(e => e.cue.k === 'host').map(e => e.cue.k === 'host' && e.cue.line.trigger)).toEqual(['lobby.open', 'lobby.join']); game.dispose();
  });
  it('keeps quips after Color Rush score landings, after winner knockout copy, and on the first two real runway finds', () => {
    const h = harness({ humans: 4, bots: false, aiRead: cid => ({ ...ai, names: ['Find ' + cid], quip: 'Q ' + cid + '.' }) });
    h.clock.runUntil(() => h.game.getView().completed);
    const quips = h.cues.filter(e => e.cue.k === 'host' && e.cue.line.trigger === 'reveal.ai-quip');
    expect(quips.filter(e => e.round === 0).length).toBeGreaterThan(0); expect(quips.filter(e => e.round === 1).length).toBeGreaterThan(0);
    expect(quips.filter(e => e.round === 2)).toHaveLength(2);
    for (const event of quips) {
      if (event.cue.k !== 'host') continue;
      const view = h.hostViews.get(event.seq)!, cid = event.cue.line.text.slice(2, -1), team = h.game.getScreen(cid)!.me!.id;
      if (event.round === 0) {
        expect(view.phase).toBe('judge'); const score = h.cues.find(e => e.round === 0 && e.cue.k === 'score' && e.cue.team === team)!;
        expect(event.seq).toBeGreaterThan(score.seq); expect(event.at).toBeGreaterThanOrEqual(score.at);
      } else if (event.round === 1) {
        expect(view.phase).toBe('knockout'); expect(view.content.k === 'brag' && view.content.match.winner).toBe(team);
        const previous = h.cues.slice(0, h.cues.indexOf(event)).filter(e => e.cue.k === 'host').at(-1)!;
        expect(previous.cue.k === 'host' && previous.cue.line.trigger).toBe('brag.winner');
        const finished = h.cues.find(e => e.seq > previous.seq && e.seq < event.seq && e.cue.k === 'host-finish' && previous.cue.k === 'host' && e.cue.text === previous.cue.line.text);
        expect(finished).toBeDefined();
      } else {
        expect(view.phase).toBe('runway'); expect(['phone0', 'phone1']).toContain(cid);
      }
      const nextPhase = h.cues.find(e => e.seq > event.seq && e.cue.k === 'phase' && e.cue.phase !== view.phase)!;
      expect(event.at + event.cue.typingMs + event.cue.line.hold).toBeLessThanOrEqual(nextPhase.at);
    }
    h.game.dispose();
  });
  it.each([4, 80])('optional %i-character quips never extend phase or scene timings', length => {
    const silent = harness({ humans: 2, bots: false, aiRead: () => ({ ...ai, quip: '' }) });
    const spoken = harness({ humans: 2, bots: false, aiRead: () => ({ ...ai, quip: 'Q'.repeat(length) }) });
    silent.clock.runUntil(() => silent.game.getView().completed); spoken.clock.runUntil(() => spoken.game.getView().completed);
    const times = (h: ReturnType<typeof harness>) => h.cues.filter(e => e.cue.k === 'phase' || e.cue.k === 'scene').map(e => ({ at: e.at, cue: e.cue }));
    expect(times(spoken)).toEqual(times(silent)); expect(spoken.game.getView().teams).toEqual(silent.game.getView().teams);
    if (length === 80) expect(spoken.cues.some(e => e.cue.k === 'host' && e.cue.line.trigger === 'reveal.ai-quip')).toBe(false);
    silent.game.dispose(); spoken.game.dispose();
  });
  it('keeps the host hidden during brag bubbles and ignores late AI speech during voting', () => {
    const h = harness({ humans: 2, bots: false }); h.clock.runUntil(() => h.game.getView().phase === 'brag-lines');
    const find = h.game.getView().feeds.find(f => f.team === h.game.getScreen('phone0')!.me!.id)!.find!;
    const before = h.cues.length; h.game.ai('phone0', find.photoId!, { ...ai, quip: 'Late brag.' }); h.clock.advance(500);
    expect(h.game.getView().host.visible).toBe(false); expect(h.cues.slice(before).some(e => e.cue.k === 'host')).toBe(false);
    h.clock.runUntil(() => h.game.getView().phase === 'vote'); const photo = h.game.getView().feeds.find(f => f.team === find.team)!.find!.photoId!;
    const vote = h.cues.length; h.game.ai('phone0', photo, { ...ai, quip: 'Late vote.' }); h.clock.runUntil(() => h.game.getView().phase === 'tally');
    expect(h.cues.slice(vote).some(e => e.cue.k === 'host' && e.cue.line.trigger === 'reveal.ai-quip')).toBe(false); h.game.dispose();
  });
  it('cancels queued runway quips when fast-forward enters voting', () => {
    const h = harness({ humans: 4, bots: false, aiRead: cid => ({ ...ai, quip: 'Q ' + cid + '.' }) });
    h.clock.runUntil(() => h.game.getView().phase === 'runway' && h.cues.some(e => e.round === 2 && e.cue.k === 'ring' && 'target' in e.cue.at && e.cue.at.target.startsWith('show-find:')));
    const before = h.cues.length; h.game.remote('ff'); expect(h.game.getView().phase).toBe('vote'); h.clock.runUntil(() => h.game.getView().phase === 'tally');
    expect(h.cues.slice(before).some(e => e.cue.k === 'host' && e.cue.line.trigger === 'reveal.ai-quip')).toBe(false); h.game.dispose();
  });
});
