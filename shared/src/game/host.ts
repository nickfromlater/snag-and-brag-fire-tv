import type { Prompt } from '../constants';
import { promptParts } from '../constants';
import type { Timeline } from './timeline';
import type { TvCue, TvView } from './types';

export interface HostLine {
  trigger: string;
  text: string;
  brow: 'norm' | 'up' | 'down';
  hold: number;
  linger: number;
  wait: boolean;
}
const make = (trigger: string, text: string, hold?: number, brow: HostLine['brow'] = 'norm'): HostLine => ({
  trigger, text, brow, hold: hold ?? Math.min(2200, 700 + text.replace(/\*\*/g, '').length * 14), linger: 1600, wait: true,
});
/** Every HOST.say in game.js. Dynamic substitutions retain the original bold copy.
 * Panic snag is archived here for reference; real phones receive a missed card instead.
 * Shared-TV copy names teams; audience-wide instructions still address the room. */
export const HOST_LINES = {
  lobby: () => make('lobby.open', 'Good evening! I am **Sir Socksworth**, and tonight your stuff gets famous. Grab a phone and join!', 2400),
  welcome: (team: string) => make('lobby.join', 'Welcome, **' + team + '**! Lovely badge. Very **' + team + '**.', undefined, 'up'),
  ready: (n: number) => make('lobby.ready', (n === 4 ? 'Four' : n === 3 ? 'Three' : n === 2 ? 'Two' : 'One') + ' team' + (n === 1 ? '' : 's') + '! Host phone, **hold the button** when ready.', undefined, 'up'),
  intro: (r: number) => make('intro.title', r === 0 ? 'Round one: **Color Rush**! The Pixel Judge sees all. Even the fridge.' : r === 1 ? 'Round two: the **Brag-Off**! Head to head, mash your phones, shout at your relatives.' : 'The final round: the **Showstopper**! Double points. No mercy. Some mercy.', 900),
  prompt: (p: Prompt) => {
    const pp = promptParts(p);
    const c = pp.c.trim();
    // The lead's museum example omits its editorial tagline too, despite the card's
    // original "priceless, obviously" lacking parentheses. Card copy stays intact.
    const aside = /^\(.*\)$/.test(c) || p.kind === 'show' && p.t === 'museum' && c === 'priceless, obviously';
    const spoken = [pp.a, pp.b.toLowerCase(), ...(!aside && c ? [c] : [])].join(' ');
    return make('intro.reel-land', p.kind === 'color' ? 'Find the most **' + p.k.toLowerCase() + '** thing you can. Closest color wins.' : '**' + spoken + '**. Be bold. Be weird.', 700, 'up');
  },
  first: (team: string, color: boolean) => make('hunt.rival-first', '**' + team + '** snagged first!' + (color ? ' Speed bonus!' : ' Show-offs.'), 600, 'up'),
  urgent: () => make('hunt.ten-seconds-unsnagged', 'Ten seconds! Grab **anything**!', 400, 'up'),
  glow: () => make('hunt.glow-up', 'Glow-up time! Eyes on, names on, brags ready.', 500),
  panic: (team: string, thing: string) => make('hunt.panic-snag-mockup-only', 'Panic snag! **' + team + '** grabbed the ' + thing.toLowerCase() + '.', 400, 'down'),
  judge: (color: string) => make('judge.open', 'The Pixel Judge sees every pixel. Let us see who is really **' + color.toLowerCase() + '**.', 500),
  quip: (text: string) => make('reveal.ai-quip', text, 400),
  colorWinner: (team: string, name: string) => make('judge.winner', '**' + team + '** wins Color Rush with **' + name + '**!', 1200, 'up'),
  faceOff: (l: string, r: string, final: boolean) => make('brag.intro', final ? 'The final! **' + l + '** versus **' + r + '**!' : 'In this corner, **' + l + '**! And in that corner, **' + r + '**!', 250, 'up'),
  bragWinner: (w: string, loser: string, variation: number) => make('brag.winner', [
    '**' + w + '** brags harder!', 'The room has spoken: **' + w + '**!', '**' + w + '** takes it. ' + loser + ' is devastated.',
  ][variation]!, 900, 'up'),
  runway: () => make('show.runway', "Welcome to the runway. Tonight's finds, please!", 200),
  vote: () => make('show.vote', 'Vote for the best find. Not your own. I am watching. I have no eyes, but **I am watching**.', 300),
  showWinner: (name: string, votes: number) => make('show.winner', 'By ' + votes + ' vote' + (votes === 1 ? '' : 's') + ': **' + name + '**! It is going holographic.', 1400, 'up'),
  standings: (name: string, round: number, lastTeam: string) => make('stand.leader', [
    '**' + name + '** lead the pack! Do not get cocky. Get a little cocky.',
    '**' + name + '** leads. It is still anyone\'s game.',
    '**' + name + '** leads. Somebody has to be last. Today it is **' + lastTeam + '**.',
  ][round % 3]!, 1200),
  champion: (name: string) => make('champ.champion', 'Your champions: **' + name + '**! Their prize? Eternal bragging rights.', 1600, 'up'),
  thanks: () => make('champ.thanks', 'Thank you for playing **Snag and Brag**. Put everything back. Especially the crown.', 3000),
};

/** Every HOST.react trigger, including the score-dependent judge reactions. */
export const HOST_REACTIONS = {
  join: ['glee', 1200], reel: ['glee', 900], rival: ['shock', 800], time: ['shock', 1000],
  snag: ['glee', 900], judgeHigh: ['glee', 900], judgeLow: ['shock', 900], colorWin: ['glee', 1600],
  knockout: ['glee', 1800], showWin: ['glee', 2000], hostLead: ['glee', 1500], champion: ['glee', 3500],
} as const;

export function hostTypingMs(text: string): number { return Math.ceil(text.replace(/\*\*/g, '').length / 2) * 34; }
interface Job { line: HostLine; start: number; typingEnd: number; end: number; optional: boolean; afterTyping?: (holdEndsAt: number) => void; startTask?: number; finishTask?: number; doneTask?: number }
/** Serializes the mockup's HOST.q; neither AI nor a background host line gates a timer. */
export class HostTrack {
  private jobs: Job[] = [];
  private hideTask: number | undefined;
  private startActive: number | undefined;
  private lastText: string | undefined;
  constructor(private readonly time: Timeline, private readonly cue: (cue: TvCue) => void,
    private readonly state: TvView['host'], private readonly update: () => void,
    private readonly prefetch?: (line: HostLine) => void) {}
  private typingMs(line: HostLine): number { return Math.max(this.prefetch ? 600 : 0, hostTypingMs(line.text)); }
  say(line: HostLine, afterTyping?: (holdEndsAt: number) => void): number {
    if (this.repeats(line)) return Math.max(0, (this.jobs.at(-1)?.end ?? 0) - this.time.now());
    return this.enqueue(line, false, afterTyping);
  }
  /** Optional speech must finish typing/holding inside the existing active-time window.
   * A knockout quip may use the winner line's read hold AFTER that line finishes typing;
   * the flow's original wait is unchanged. Other quips may queue only if the whole queue
   * fits before the next phase's speech. Overlong/duplicate quips are dropped. */
  trySay(line: HostLine, until: number, replaceReadHold = false): boolean {
    if (this.time.paused || this.repeats(line)) return false;
    const now = this.time.now(), duration = this.typingMs(line) + (line.wait ? line.hold : 0);
    const active = this.jobs.filter(j => j.end > now);
    const held = active.length === 1 && !this.state.typing && active[0]!.line === this.state.line && active[0]!.typingEnd <= now ? active[0] : undefined;
    const replace = replaceReadHold && held && held.end <= until;
    const start = replace ? now : Math.max(now, this.jobs.at(-1)?.end ?? 0);
    if (start + duration > until) return false;
    if (replace) {
      this.time.cancel(held.doneTask); this.jobs = this.jobs.filter(j => j !== held);
    }
    this.enqueue(line, true); return true;
  }
  cancelQuips(): void {
    for (const job of this.jobs.filter(j => j.optional)) {
      this.time.cancel(job.startTask); this.time.cancel(job.finishTask); this.time.cancel(job.doneTask);
    }
    this.jobs = this.jobs.filter(j => !j.optional);
    if (this.state.line?.trigger === 'reveal.ai-quip') {
      this.time.cancel(this.hideTask); this.state.typing = false; this.state.visible = false;
      this.cue({ k: 'host-hide', durationMs: 150 }); this.update();
    }
  }
  private repeats(line: HostLine): boolean { return (this.jobs.at(-1)?.line.text ?? this.lastText) === line.text; }
  private enqueue(line: HostLine, optional: boolean, afterTyping?: (holdEndsAt: number) => void): number {
    // A delayed adapter callback may outlive its computed end. Cancel its tasks
    // before replacing it so an old quip cannot finish over a newer phase's line.
    for (const job of this.jobs.filter(j => j.end <= this.time.now())) {
      this.time.cancel(job.startTask); this.time.cancel(job.finishTask); this.time.cancel(job.doneTask);
    }
    this.jobs = this.jobs.filter(j => j.end > this.time.now());
    const start = Math.max(this.time.now(), this.jobs.at(-1)?.end ?? 0);
    const typingEnd = start + this.typingMs(line);
    const job: Job = { line, start, typingEnd, end: typingEnd + (line.wait ? line.hold : 0), optional, afterTyping };
    this.jobs.push(job);
    this.prefetch?.(line);
    if (start === this.time.now() && this.jobs.length === 1) this.begin(job);
    else job.startTask = this.time.after(start - this.time.now(), () => this.begin(job));
    return job.end - this.time.now();
  }
  private begin(job: Job): void {
    this.time.cancel(this.hideTask);
    this.startActive = job.start;
    this.lastText = job.line.text;
    this.state.line = job.line; this.state.startedAt = this.time.wall(job.start);
    this.state.typing = true; this.state.visible = true;
    this.cue({ k: 'host', line: job.line, typingMs: hostTypingMs(job.line.text), startedAt: this.state.startedAt, cadence: { intervalMs: 34, characters: 2, voiceEveryCharacters: 4, talkingOpen: [.4, 1], quietOpen: [0, .35] } });
    // The voice/mouth cadence (2 chars / 34 ms, a blip every 4 chars) is in the host cue.
    job.finishTask = this.time.after(job.typingEnd - this.time.now(), () => this.typed(job));
    this.update();
  }
  private typed(job: Job, forced = false): void {
    this.state.typing = false;
    this.cue({ k: 'host-finish', text: job.line.text, ...(forced ? { forced: true } : {}) });
    job.doneTask = this.time.after(job.line.wait ? job.line.hold : 0, () => {
      this.jobs = this.jobs.filter(j => j !== job);
    });
    this.hideTask = this.time.after(job.line.hold + job.line.linger, () => {
      if (this.state.line !== job.line || this.state.typing) return;
      this.state.visible = false; this.cue({ k: 'host-hide', durationMs: 220 }); this.update();
    });
    this.update();
    const afterTyping = job.afterTyping; job.afterTyping = undefined; afterTyping?.(job.end);
  }
  finish(): void {
    const job = this.jobs.find(j => j.start <= this.time.now() && j.typingEnd > this.time.now());
    if (!job || !this.state.typing) return;
    this.time.cancel(job.finishTask);
    const saved = job.typingEnd - this.time.now(); job.typingEnd = this.time.now(); job.end -= saved;
    for (const next of this.jobs.filter(j => j.start > this.time.now())) {
      this.time.cancel(next.startTask); next.start -= saved; next.typingEnd -= saved; next.end -= saved;
      next.startTask = this.time.after(next.start - this.time.now(), () => this.begin(next));
    }
    this.typed(job, true);
  }
  /** A started media clip may outlast blip typing. Extend speech/read holds, never
   * hunt/mash/vote deadlines. Mock clips are shorter and preserve reference pace. */
  speechTiming(text: string, remainingMs: number): number {
    const job = this.jobs.find(j => j.line.text === text && j.start <= this.time.now() && j.typingEnd > this.time.now());
    if (!job || job.optional || !Number.isFinite(remainingMs) || remainingMs <= 0) return 0;
    const delta = Math.max(0, this.time.now() + remainingMs - job.typingEnd);
    if (!delta) return 0;
    job.typingEnd += delta; job.end += delta;
    this.time.cancel(job.finishTask); job.finishTask = this.time.after(job.typingEnd - this.time.now(), () => this.typed(job));
    for (const next of this.jobs.filter(j => j.start > job.start)) {
      this.time.cancel(next.startTask); next.start += delta; next.typingEnd += delta; next.end += delta;
      next.startTask = this.time.after(next.start - this.time.now(), () => this.begin(next));
    }
    return delta;
  }
  hide(): void {
    this.finish(); this.time.cancel(this.hideTask); this.state.visible = false;
    this.cue({ k: 'host-hide', durationMs: 150 }); this.update();
  }
  clear(): void {
    for (const job of this.jobs) {
      this.time.cancel(job.startTask); this.time.cancel(job.finishTask); this.time.cancel(job.doneTask);
    }
    this.time.cancel(this.hideTask); this.jobs = []; this.state.typing = false; this.state.visible = false;
    delete this.state.line; delete this.state.startedAt;
    this.startActive = undefined;
    this.lastText = undefined;
  }
  startedAt(): number | undefined { return this.startActive === undefined ? undefined : this.time.wall(this.startActive); }
}
