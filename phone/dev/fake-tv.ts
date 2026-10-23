import { GEN_BRAGS, GEN_NAMES, PROTO, ROUNDS, TIMING, TOKENS, decodeBinary, monoOf } from '@snag/shared';
import type { AiRead, BinaryHeader, FindView, PhoneToTv, PromptView, Screen, TeamView, TvToPhone } from '@snag/shared';
import type { PhoneTransport, TransportEvents } from '../src/transport';
import { botFind, teams as fixtureTeams } from './fixtures';

export interface FrameReceipt { header: BinaryHeader; bytes: number; width: number; height: number }
/** Metadata only. Never exposes a photo, thumbnail, room key, or reconnect token. */
export interface ReviewReceipt {
  proto: number; seen: string[]; rounds: number[]; messages: PhoneToTv[]; frames: FrameReceipt[];
  aiReads: number; errors: string[];
  inspect?(): { screen: string | null; cameraReady: boolean; cameraActive: boolean; seq: number };
  inject?(message: TvToPhone): void;
  expire?(): void;
}
declare global { interface Window { __phoneReview?: ReviewReceipt } }

export function jpegDimensions(bytes: Uint8Array): { width: number; height: number } {
  for (let i = 2; i + 9 < bytes.length;) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1]!; const length = (bytes[i + 2]! << 8) + bytes[i + 3]!;
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { height: (bytes[i + 5]! << 8) + bytes[i + 6]!, width: (bytes[i + 7]! << 8) + bytes[i + 8]! };
    if (length < 2) break; i += 2 + length;
  }
  return { width: 0, height: 0 };
}

interface Scheduled { id: ReturnType<typeof setTimeout>; at: number; remaining: number; run(): void }
export class FakeTv implements PhoneTransport {
  private seq = 0;
  private me: TeamView | null = null;
  private teams: TeamView[] = [];
  private round = -1;
  private screen: Screen = { k: 'join', suggestedName: 'Sock Goblins', takenColors: [], full: false };
  private deadline: number | undefined;
  private total: number | undefined;
  private paused = false;
  private pausedAt = 0;
  private bots = true;
  private photos = new Map<string, string>();
  private timers = new Set<Scheduled>();
  private finds: FindView[] = [];
  private tug = 0;
  private live = false;
  private next: (() => void) | null = null;
  private host = true;
  private pace: number;

  constructor(private readonly events: TransportEvents, private readonly receipt: ReviewReceipt, fast = false) {
    this.pace = fast ? .15 : 1;
    receipt.expire = () => { if (this.screen.k === 'glow') { this.deadline = Date.now() + 100; this.emit(); } };
  }
  now(): number { return Date.now(); }
  photoUrl(id: string): string { return this.photos.get(id) ?? ''; }
  hostIdentity(value?: boolean): boolean { if (value !== undefined) this.host = value; return this.host; }
  start(): void { if (this.live) return; this.live = true; queueMicrotask(() => { this.events.status(''); this.emit(); }); }
  stop(): void { this.live = false; this.clear(); this.dropPhotos(); }
  reconnect(): void { this.live = true; this.events.status(''); this.emit(); }

  private prompt(): PromptView {
    return this.round === 0 ? { kind: 'color', a: 'Snag the most', b: 'RED', c: 'thing in the house', col: TOKENS.red, hex: TOKENS.red }
      : this.round === 1 ? { kind: 'brag', a: 'Something that would', b: 'WIN A FIGHT', c: 'against anything', col: '#FF7A1F' }
      : { kind: 'show', a: 'The', b: 'WEIRDEST', c: 'thing you can find', col: TOKENS.bubble };
  }
  private emit(): void {
    if (!this.live) return;
    this.events.message({ t: 'screen', seq: ++this.seq, me: this.me ? { ...this.me } : null, teams: this.teams.map((t) => ({ ...t })), round: this.round, prompt: this.round >= 0 && this.round < 3 ? this.prompt() : undefined, deadline: this.deadline, total: this.total, paused: this.paused, s: this.screen });
  }
  private later(ms: number, run: () => void): void {
    const task: Scheduled = { id: 0 as unknown as ReturnType<typeof setTimeout>, at: Date.now() + ms, remaining: ms, run };
    task.id = setTimeout(() => { this.timers.delete(task); if (!this.paused && this.live) run(); }, ms); this.timers.add(task);
  }
  private clear(): void { for (const task of this.timers) clearTimeout(task.id); this.timers.clear(); this.next = null; }
  private set(s: Screen, duration?: number): void { this.screen = s; this.total = duration; this.deadline = duration === undefined ? undefined : Date.now() + duration; this.emit(); }
  private dropPhotos(): void { for (const url of this.photos.values()) URL.revokeObjectURL(url); this.photos.clear(); }
  send(message: PhoneToTv): boolean {
    if (!this.live) return false;
    this.receipt.messages.push(structuredClone(message));
    switch (message.t) {
      case 'join': {
        if (this.screen.k !== 'join') break;
        this.me = { id: 'you', name: message.name, mono: monoOf(message.name), color: message.color, score: 0, bot: false, connected: true };
        this.teams = [this.me, ...fixtureTeams.slice(1).map((t) => ({ ...t }))]; this.host = true; this.lobby(); break;
      }
      case 'bots': if (this.screen.k === 'lobby') { this.bots = message.on; this.teams = this.bots ? [this.me!, ...fixtureTeams.slice(1).map((t) => ({ ...t }))] : [this.me!]; this.lobby(); } break;
      case 'start': if (this.screen.k === 'lobby' && this.screen.canStart) this.intro(0); break;
      case 'glow': {
        if (this.screen.k !== 'glow') break;
        const find = this.screen.find; Object.assign(find, { name: message.name, brag: message.brag, eyes: [...message.eyes, 11] }); this.finds.push(find);
        this.clear(); this.set({ k: 'wait', msg: 'Sent! Watch the TV.', sub: 'The room is getting ready for your close-up.', card: find });
        this.next = () => this.reveal(); this.later(2500 * this.pace, this.next); break;
      }
      case 'tap': if (this.screen.k === 'mash' && this.screen.phase === 'mash' && !this.paused) this.tug = Math.max(-1, Math.min(1, this.tug + message.side * message.n * .025)); break;
      case 'vote': if (this.screen.k === 'vote' && this.screen.options.some((f) => f.team === message.team && f.team !== this.me?.id)) { this.clear(); this.set({ k: 'wait', msg: 'Vote locked in!', sub: 'Eyes on the TV.', card: this.finds[this.finds.length - 1] }); this.next = () => this.finish(); this.later(2500 * this.pace, this.next); } break;
      case 'react': break;
      case 'again': this.clear(); this.dropPhotos(); this.finds = []; this.round = -1; if (this.me) this.me.score = 0; this.teams.forEach((t) => t.score = 0); this.lobby(); break;
      case 'control': this.control(message.action); break;
    }
    return true;
  }
  private lobby(): void { this.set({ k: 'lobby', isHost: true, canStart: this.teams.length >= 2 || this.bots, botsOn: this.bots, minTeams: 2 }); }
  private intro(round: number): void {
    this.clear(); this.round = round; const r = ROUNDS[round]!;
    const ready: Extract<Screen, { k: 'ready' }> = { k: 'ready', kicker: r.kicker, title: r.nice, sub: r.sub };
    this.set(ready);
    this.later(2400 * this.pace, () => { ready.prompt = this.prompt(); ready.count = '3'; this.emit(); });
    this.later((2400 + TIMING.COUNTDOWN_STEP_MS) * this.pace, () => { ready.count = '2'; this.emit(); });
    this.later((2400 + TIMING.COUNTDOWN_STEP_MS * 2) * this.pace, () => { ready.count = '1'; this.emit(); });
    this.later((2400 + TIMING.COUNTDOWN_STEP_MS * 3) * this.pace, () => { ready.count = 'GO!'; this.emit(); });
    this.next = () => this.hunt(); this.later((2400 + TIMING.COUNTDOWN_STEP_MS * 3 + 400) * this.pace, this.next);
  }
  private hunt(): void {
    this.clear(); this.set({ k: 'cam' }, TIMING.HUNT_S * 1000);
    this.later(2000, () => this.events.message({ t: 'toast', text: 'Couch Potatoes snagged a red mug', color: '#FF7A1F' }));
    this.next = () => { const find: FindView = { team: 'you', round: this.round, name: 'Didn’t snag', brag: 'Next round is yours.', thing: '', missed: true, pts: 0 }; this.finds.push(find); this.clear(); this.set({ k: 'wait', msg: 'Didn’t snag this time.', sub: 'Keep your camera ready.' }); this.later(1500 * this.pace, () => this.reveal()); };
    this.later(TIMING.HUNT_S * 1000, this.next);
  }
  binary(frame: Uint8Array): boolean {
    if (!this.live) return false;
    const decoded = decodeBinary(frame); if (!decoded) return false;
    const { header, payload } = decoded;
    this.receipt.frames.push({ header, bytes: payload.byteLength, ...jpegDimensions(payload) });
    if (header.t !== 'snag' || this.screen.k !== 'cam' || header.round !== this.round) return true;
    this.clear(); const photoId = `fake-${this.round}`;
    this.photos.set(photoId, URL.createObjectURL(new Blob([new Uint8Array(payload).buffer], { type: 'image/jpeg' })));
    const find: FindView = { team: 'you', round: this.round, photoId, name: GEN_NAMES[0]!, brag: GEN_BRAGS[0]!, thing: 'Your photo', hex: header.hex, match: header.match, time: 8.2, pts: this.round === 0 ? header.match + 30 : this.round === 1 ? 150 : 100 };
    this.set({ k: 'glow', find, names: GEN_NAMES.slice(0, 3), brags: GEN_BRAGS.slice(0, 3), aiPending: true }, TIMING.GLOW_S * 1000);
    this.later(2000, () => {
      const r: AiRead = { thing: 'red mug', names: ['Mugsy Malone', 'Sir Sips-a-Lot', 'Morning Menace'], brags: ['Holds coffee. Holds grudges.', 'Survived four dishwashers and a toddler.'], score: 8, quip: 'An excellent vessel for your ambition.', fallback: false };
      this.receipt.aiReads++; find.thing = r.thing; this.events.ai({ t: 'ai', cid: 'fake', photoId, r });
      if (this.screen.k === 'glow') { this.screen.names = r.names; this.screen.brags = r.brags; this.screen.aiPending = false; this.emit(); }
    });
    this.next = () => { /* Phone deadline auto-send owns this transition. */ };
    return true;
  }
  private award(): void {
    const find = this.finds[this.finds.length - 1]; if (!find || !this.me) return;
    this.me.score += find.pts ?? 0; this.events.message({ t: 'award', pts: find.pts ?? 0, total: this.me.score });
  }
  private reveal(): void {
    this.clear();
    if (this.round === 1) {
      const me = this.me!, mine = this.finds[this.finds.length - 1]!; const rival = this.teams[1] ?? fixtureTeams[1]!;
      const mash: Extract<Screen, { k: 'mash' }> = { k: 'mash', kicker: 'THE FINAL', youIn: true, left: { team: me, find: mine, side: -1 }, right: { team: rival, find: botFind('pan', rival.id, 1), side: 1 }, phase: 'ready' };
      this.set(mash);
      this.later(1000 * this.pace, () => { mash.phase = 'mash'; this.tug = 0; this.set(mash, TIMING.MASH_MS); this.mashTick(); });
      this.next = () => { this.clear(); this.award(); this.set({ ...mash, phase: 'done', head: 'You won the brag!', sub: '+150 points. Keep your thumbs warm.' }); this.later(1800 * this.pace, () => this.intro(2)); };
      this.later(1000 * this.pace + TIMING.MASH_MS, this.next);
    } else if (this.round === 2) {
      const options = [this.finds[this.finds.length - 1]!, botFind('sock', 'cp', 2), botFind('lava', 'jd', 2), botFind('duck', 'gr', 2)];
      this.set({ k: 'vote', options }, TIMING.VOTE_S * 1000); this.next = () => this.finish(); this.later(TIMING.VOTE_S * 1000, this.next);
    } else {
      this.award(); this.set({ k: 'wait', msg: `${this.finds[this.finds.length - 1]?.match ?? 0}% red`, sub: 'Color Rush · Pixel Judge', card: this.finds[this.finds.length - 1] });
      this.next = () => this.intro(1); this.later(3000 * this.pace, this.next);
    }
  }
  private mashTick(): void { if (this.screen.k !== 'mash' || this.screen.phase !== 'mash') return; this.events.message({ t: 'mashp', p: this.tug }); this.later(200, () => this.mashTick()); }
  private finish(): void {
    this.clear(); this.award(); this.round = 3;
    const best = [...this.finds].sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0))[0];
    this.set({ k: 'end', rank: 1, line: 'Champions! The TV agrees.', best, rows: this.finds.map((f) => ({ round: f.round, name: f.name, sub: `${ROUNDS[f.round]!.nice} · ${f.thing}`, pts: f.pts ?? 0 })), isHost: true });
  }
  private control(action: 'skip' | 'pause' | 'resume' | 'end'): void {
    if (action === 'end') { this.paused = false; this.finish(); return; }
    if (action === 'pause' && !this.paused) {
      this.paused = true; this.pausedAt = Date.now();
      for (const task of this.timers) { clearTimeout(task.id); task.remaining = Math.max(0, task.at - this.pausedAt); }
      this.emit();
    } else if (action === 'resume' && this.paused) {
      const duration = Date.now() - this.pausedAt; this.paused = false; if (this.deadline) this.deadline += duration;
      const tasks = [...this.timers]; this.timers.clear(); for (const task of tasks) this.later(task.remaining, task.run); this.emit();
    } else if (action === 'skip' && !this.paused && this.next) { const next = this.next; this.clear(); next(); }
  }
}

export class FixtureTransport implements PhoneTransport {
  private host = false;
  constructor(private readonly frozenNow: number) {}
  start(): void {}
  stop(): void {}
  reconnect(): void {}
  send(): boolean { return true; }
  binary(): boolean { return true; }
  now(): number { return this.frozenNow; }
  photoUrl(): string { return ''; }
  hostIdentity(value?: boolean): boolean { if (value !== undefined) this.host = value; return this.host; }
}
export function newReceipt(): ReviewReceipt { return { proto: PROTO, seen: [], rounds: [], messages: [], frames: [], aiReads: 0, errors: [] }; }
