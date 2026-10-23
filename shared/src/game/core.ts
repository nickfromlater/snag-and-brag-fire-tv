import { BOTS, CONFETTI, GEN_BRAGS, GEN_NAMES, MAX_TEAMS, PHONE_COLORS, ROUNDS, SCORING, TEAM_NAMES, TEAM_NAME_MAX, TIMING, TOKENS, promptParts } from '../constants';
import type { Mood, MusicMood, Prompt, Reaction } from '../constants';
import { OBJI } from '../objects';
import type { ObjectTrait } from '../objects';
import { clamp, colorMatch, isJudgeMask } from '../pixelJudge';
import type { AiRead, ClientId, FindView, PhoneToTv, PromptView, RelayToClient, Screen, ScreenMsg, SnagArrived, TeamId, TeamView } from '../protocol';
import { botPick, choosePrompt } from './bots';
import { HOST_LINES, HOST_REACTIONS, HostTrack } from './host';
import type { HostLine } from './host';
import { MASH_TICK_MS, mashPush } from './mash';
import { PARTICLES, POINT_FLIGHT, SPRING_CURVES } from './motion';
import { pick, random, seededRng, shuffle } from './random';
import { SHOWCASE_HOST_CID, createShowcase, showcaseJudgeMask, showcaseMashPosition } from './showcase';
import type { ShowcaseOptions } from './showcase';
import { Timeline } from './timeline';
import type { Anchor, Animation, GameOptions, MatchView, MotionFrame, Phase, RemoteKey, Scene, SceneContent, Sfx, TvCue, TvFeed, TvMenu, TvView } from './types';

interface Team extends TeamView { cid?: ClientId }
interface Find { view: FindView; order: number; sent: boolean; names: string[]; brags: string[]; aiPending: boolean; fit: number; votes: number; quip?: string; quipSaid?: boolean; autoSent?: boolean }
interface Award { team: Team; pts: number; task: number; onLand?: () => void }
interface Wait { ms: number; host?: boolean }
type Flow = Generator<Wait, void, void>;
interface Match { left: TeamId; right: TeamId; kicker: string; points: number; final: boolean }
interface MashRuntime { match: MatchView; start: number; last: number; lastPhone: number; lastSpark: number; crowd: number; bots: { side: -1 | 1; rate: number }[]; voters: (-1 | 1)[] }

/** Copies memory images as memory images; deliberately never JSON-serializes state. */
function copy<T>(value: T): T {
  if (value instanceof Uint8Array) return value.slice() as T;
  if (Array.isArray(value)) return value.map(v => copy(v)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, copy(v)])) as T;
  return value;
}
function mono(name: string): string {
  const words = name.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).filter(w => w && !/^(the|of|and|a)$/i.test(w));
  return !words.length ? 'ME' : (words.length > 1 ? words[0]![0]! + words[1]![0]! : words[0]!.slice(0, 2)).toUpperCase();
}
const wait = (ms: number): Wait => ({ ms: Math.max(0, ms) });
const ordinal = (n: number) => n + ['st', 'nd', 'rd', 'th'][Math.min(3, n - 1)]!;

/** TV-owned game host. No global clock, timer, DOM, Node API, or unseeded randomness. */
export class GameHost {
  private readonly time: Timeline;
  private readonly host: HostTrack;
  private readonly teams: Team[] = [];
  private readonly peers = new Set<ClientId>();
  private readonly feeds = new Map<TeamId, TvFeed>();
  private readonly finds = new Map<TeamId, Find>();
  private readonly history: Find[] = [];
  private readonly taken = new Set<string>();
  private readonly pendingAwards = new Set<Award>();
  private readonly votes = new Map<TeamId, TeamId>();
  private readonly pendingTaps = new Map<TeamId, { side: -1 | 1; n: number }[]>();
  private readonly reactionCounts = new Map<TeamId, number>();
  private readonly latest = new Map<ClientId, ScreenMsg>();
  private readonly motion = new Map<string, { animation: Animation; start: number }[]>();
  private readonly suggestions = new Map<ClientId, string>();
  private mashRuntime: MashRuntime | undefined;
  private flow: Flow | undefined;
  private waitTask: number | undefined;
  private hostWaitDue: number | undefined;
  private deadlineActive: number | undefined;
  private huntStart = 0;
  private roundPrompt: Prompt | undefined;
  private hostCid: ClientId | undefined;
  private botsOn = false;
  private teamSerial = 0;
  private screenSeq = 0;
  private cueSeq = 0;
  private generation = 0;
  private phaseToken = 0;
  private reactionToken = 0;
  private beatActive = 0;
  private transitionActive: { swap: number; end: number } | undefined;
  private previousRank: TeamId[] = [];
  private bragMatchIndex = 0;
  private skipPhase: Phase | undefined;
  private disposed = false;
  private publishing = false;
  private dirty = false;
  private hypeTask: number | undefined;
  private runningFlow = false;
  private readonly state: TvView;
  private readonly options: GameOptions;
  private readonly showcase: ShowcaseOptions | undefined;
  private showcasing = false;

  constructor(options: GameOptions) {
    this.showcase = options.showcase ? createShowcase(options.showcase.seed, options.showcase.script) : undefined;
    this.options = this.showcase ? { ...options, rng: seededRng(this.showcase.seed) } : options;
    this.time = new Timeline(options.clock);
    this.beatActive = this.time.now();
    this.state = {
      scene: 'lobby', phase: 'lobby', beatAt: options.clock.now(), round: -1, teams: [], feeds: [],
      content: this.lobbyContent(), motion: {}, paused: false, menu: null, sound: true, music: true, voice: true,
      musicMood: 'lobby', backgroundMood: 'normal', hype: 0, completed: false,
      host: { typing: false, visible: false, reaction: 'norm' }, history: [],
    };
    this.host = new HostTrack(this.time, c => this.emit(c), this.state.host, () => this.publish(false), options.prefetchHost);
    this.flow = this.lobbyFlow(false); this.advance();
  }

  /** Four illustrated actors join on their cues. This never fabricates live photos. */
  playShowcase(): void {
    if (!this.showcase || this.showcasing || this.state.phase !== 'lobby' || this.teams.length) return;
    this.showcasing = true;
    this.showcase.script.joinMs.forEach((ms, seat) => this.after(ms, () => {
      if (!seat) this.join(SHOWCASE_HOST_CID, TEAM_NAMES[0], PHONE_COLORS[0]!);
      else { const t: Team = { ...BOTS[seat - 1]!, score: 0, bot: true, connected: true }; this.teams.push(t); this.chipJoin(t); }
      this.botsOn = true; this.state.content = this.lobbyContent(); this.publish();
    }));
    this.after(this.showcase.script.startMs, () => this.beginGame());
  }

  getView(): TvView {
    const result = copy(this.state);
    result.beatAt = this.time.wall(this.beatActive);
    result.host.startedAt = this.host.startedAt();
    if (result.transition && this.transitionActive) {
      result.transition.swapAt = this.time.wall(this.transitionActive.swap);
      result.transition.endsAt = this.time.wall(this.transitionActive.end);
    }
    result.teams = this.teams.map(({ cid: _cid, ...team }) => copy(team));
    if (result.round === -1) {
      while (result.teams.length < MAX_TEAMS) result.teams.push({
        id: 'waiting-' + (result.teams.length + 1), name: 'Waiting…', mono: '', color: TOKENS.paper,
        score: 0, bot: false, connected: false, joined: false,
      });
    }
    result.feeds = [...this.feeds.values()].map(f => copy(f));
    result.history = this.history.map(f => copy(f.view));
    result.motion = this.motionView();
    result.hostClientId = this.hostCid;
    if (this.deadlineActive !== undefined) result.deadline = this.time.wall(this.deadlineActive);
    else delete result.deadline;
    return result;
  }
  /** Latest idempotent phone screen; returned data is safe to mutate in a renderer. */
  getScreen(cid: ClientId): ScreenMsg | undefined { const s = this.latest.get(cid); return s ? copy(s) : undefined; }
  /** Relay adapter: the relay owns authentication and never owns a game decision. */
  handle(message: RelayToClient): void {
    if (message.t === 'peer') this.peer(message.cid, message.up);
    else if (message.t === 'from') this.receive(message.cid, message.m, message.at);
    else if (message.t === 'ai') this.ai(message.cid, message.photoId, message.r);
  }
  peer(cid: ClientId, up: boolean): void {
    if (this.disposed) return;
    if (this.showcasing) return;
    if (up) this.peers.add(cid); else this.peers.delete(cid);
    const t = this.byClient(cid);
    if (t) { t.connected = up; const f = this.feeds.get(t.id); if (f) f.connected = up; }
    this.publish();
    // A reconnect always receives a fresh seq, including deadlines moved by a pause.
    if (up && !t) this.sendScreen(cid);
  }
  receive(cid: ClientId, message: PhoneToTv | SnagArrived, at = this.options.clock.now()): void {
    if (this.disposed) return;
    if (this.showcasing) return;
    if (message.t === 'join') { this.join(cid, message.name, message.color); return; }
    const team = this.byClient(cid);
    if (!team) return;
    if (message.t === 'control') {
      if (cid !== this.hostCid) return;
      if (message.action === 'pause') this.pause();
      else if (message.action === 'resume') this.resume();
      else if (message.action === 'skip') { this.resume(); this.skip(); }
      else if (this.state.menu?.kind === 'confirm-end') this.endGame();
      else this.confirmEndMenu();
      return;
    }
    if (message.t === 'again') {
      if (cid === this.hostCid && this.state.content.k === 'champ' && this.state.content.endShown) this.beginGame();
      else this.sendScreen(cid);
      return;
    }
    if (this.state.paused) return;
    if (message.t === 'bots') { if (cid === this.hostCid) this.setBots(message.on); }
    else if (message.t === 'start') { if (cid === this.hostCid && this.canStart()) this.beginGame(); }
    else if (message.t === 'snag') this.snag(team, message, at);
    else if (message.t === 'glow') this.glow(team, message);
    else if (message.t === 'tap') this.tap(team, message.n, message.side);
    else if (message.t === 'vote' && this.state.phase === 'vote') this.castVote(team, message.team);
    else if (message.t === 'react') this.reaction(team.id, message.kind);
  }
  /** Binary thumbnails stay in memory only; a feed cue contains presence, never bytes. */
  thumbnail(cid: ClientId, jpeg: Uint8Array): void {
    if (this.showcasing) return;
    const team = this.byClient(cid);
    if (!team || this.state.phase !== 'hunt' || this.finds.has(team.id) || jpeg.length > 32_768) return;
    const feed = this.feeds.get(team.id)!; feed.jpeg = jpeg.slice();
    this.feedCue(feed); this.publish(false);
  }
  ai(cid: ClientId, photoId: string, read: AiRead): void {
    if (this.showcasing) return;
    const team = this.byClient(cid), find = team && this.finds.get(team.id);
    if (!find || find.view.photoId !== photoId || find.view.missed) return;
    find.fit = Number.isFinite(read.score) ? clamp(read.score, 0, 10) : SCORING.AI_FALLBACK_SCORE;
    find.quip = String(read.quip).slice(0, 80); find.view.thing = String(read.thing || 'Your photo').slice(0, 40);
    if (find.quip) this.options.prefetchHost?.(HOST_LINES.quip(find.quip));
    find.aiPending = false;
    if (!find.sent) {
      find.names = read.names.filter(n => typeof n === 'string' && n.trim()).slice(0, 3).map(n => n.slice(0, 18));
      if (!find.names.length) find.names = [GEN_NAMES[0], GEN_NAMES[1], GEN_NAMES[2]];
      find.brags = read.brags.filter(b => typeof b === 'string' && b.trim()).slice(0, 2).map(b => b.slice(0, 60));
      find.brags.push(pick(this.options.rng, GEN_BRAGS));
      find.view.name = find.names[0]!; find.view.brag = find.brags[0]!;
      this.sfx('sparkle');
    }
    const feed = this.feeds.get(team!.id);
    if (feed) { feed.label = 'Snagged: ' + find.view.thing; feed.find = copy(find.view); this.feedCue(feed); }
    this.refreshContentFinds(); this.publish();
  }

  setBots(on: boolean): void {
    if (this.state.phase !== 'lobby') return;
    this.botsOn = on;
    if (on) {
      for (const def of BOTS) {
        if (this.teams.length >= MAX_TEAMS) break;
        if (this.teams.some(t => t.id === def.id)) continue;
        const t: Team = { ...def, score: 0, bot: true, connected: true };
        this.teams.push(t); this.chipJoin(t);
      }
    } else {
      for (let i = this.teams.length - 1; i >= 0; i--) if (this.teams[i]!.bot) this.teams.splice(i, 1);
    }
    this.state.content = this.lobbyContent();
    if (this.canStart()) this.host.say(HOST_LINES.ready(this.teams.length));
    this.publish();
  }
  remote(key: RemoteKey): void {
    if (this.disposed) return;
    if (key === 'ff') { this.resume(); this.skip(); return; }
    const menu = this.state.menu;
    if (key === 'playpause') { if (this.state.paused) this.resume(); else this.pause(); return; }
    if (key === 'back') {
      if (menu?.kind === 'confirm-end') this.pauseMenu();
      else if (menu) this.resume();
      else if (this.state.phase === 'lobby') this.lobbyMenu();
      else this.pause();
      return;
    }
    if (menu) {
      if (['up', 'down', 'left', 'right'].includes(key)) {
        const delta = key === 'up' || key === 'left' ? -1 : 1;
        menu.focus = (menu.focus + delta + menu.options.length) % menu.options.length;
        this.emit({ k: 'menu', menu: copy(menu), focusColor: '#FFD43B' }); this.sfx('sel'); this.publish(false);
      } else if (key === 'select') this.selectMenu(menu);
      return;
    }
    if (key === 'select' && this.state.phase === 'lobby') this.lobbyMenu();
  }
  pause(): void {
    if (this.state.paused) return;
    this.time.pause(); this.state.paused = true; this.pauseMenu();
    this.emit({ k: 'pause', paused: true, deadline: this.getView().deadline }); this.publish();
  }
  resume(): void {
    if (this.state.paused) {
      this.time.resume(); this.state.paused = false;
      // Remaining typing/motion is frozen; the renderer resumes it via the pause cue.
      this.emit({ k: 'pause', paused: false, deadline: this.getView().deadline });
    }
    if (this.state.menu) { this.state.menu = null; this.emit({ k: 'menu', menu: null, focusColor: '#FFD43B' }); }
    this.publish();
  }
  /** End the currently visible phase now, finish typing, retain all scoring/defaults. */
  skip(): void {
    if (this.state.paused || this.state.phase === 'lobby' || this.state.completed) { this.host.finish(); return; }
    this.skipPhase = this.state.phase; this.host.finish(); this.host.cancelQuips();
    this.time.cancel(this.waitTask); this.waitTask = undefined; this.hostWaitDue = undefined; this.advance();
  }
  speechTiming(text: string, remainingMs: number): void {
    const delta = this.host.speechTiming(text, remainingMs);
    if (!delta || this.hostWaitDue === undefined || this.disposed) return;
    this.hostWaitDue += delta; this.time.cancel(this.waitTask);
    this.waitTask = this.time.after(this.hostWaitDue - this.time.now(), () => { this.waitTask = undefined; this.hostWaitDue = undefined; this.advance(); });
  }
  dispose(): void {
    this.disposed = true; this.generation++; this.time.clear(); this.host.clear(); this.flow = undefined;
    this.feeds.clear(); this.finds.clear(); this.history.length = 0; this.latest.clear(); this.pendingAwards.clear();
  }

  private byClient(cid: ClientId): Team | undefined { return this.teams.find(t => t.cid === cid); }
  private team(id: TeamId): Team { return this.teams.find(t => t.id === id)!; }
  private canStart(): boolean { return this.state.phase === 'lobby' && this.teams.length >= (this.botsOn ? 1 : 2); }
  private lobbyContent(): Extract<SceneContent, { k: 'lobby' }> {
    return { k: 'lobby', code: this.options.room?.code ?? '', joinUrl: this.options.room?.joinUrl ?? '', copy: 'Two to four teams', botsOn: this.botsOn, parade: ['duck', 'mug', 'dino', 'lava', 'crown', 'teddy', 'donut', 'robot'] };
  }
  private join(cid: ClientId, name: string, color: string): void {
    if (this.byClient(cid)) { this.peer(cid, true); return; }
    this.peers.add(cid);
    if (this.state.phase !== 'lobby' || this.teams.length >= MAX_TEAMS) { this.sendScreen(cid); return; }
    if (!(PHONE_COLORS as readonly string[]).includes(color) || this.teams.some(t => t.color === color)) {
      this.options.send(cid, { t: 'toast', text: 'That badge color is taken. Pick another.', color: TOKENS.yolk }); this.sendScreen(cid); return;
    }
    const n = (name.trim().replace(/\s+/g, ' ') || pick(this.options.rng, TEAM_NAMES)).slice(0, TEAM_NAME_MAX);
    const t: Team = { id: 'p' + ++this.teamSerial, cid, name: n, mono: mono(n), color, score: 0, bot: false, connected: true };
    this.teams.push(t); this.hostCid ??= cid;
    this.chipJoin(t); this.reactHost('join');
    this.confetti({ target: 'chip:' + t.id, y: 90 }, 40, { colors: [t.color, TOKENS.yolk, TOKENS.paper], angle: Math.PI / 2, power: 500 });
    this.host.say(HOST_LINES.welcome(t.name));
    if (this.canStart()) this.host.say(HOST_LINES.ready(this.teams.length));
    this.publish();
  }
  private chipJoin(t: Team): void { this.slam('chip:' + t.id, { from: 1.8, shake: 5, ring: false }); this.sfx('join'); }
  private beginGame(): void {
    this.resetTimeline(); this.teams.forEach(t => { t.score = 0; });
    this.finds.clear(); this.feeds.clear(); this.history.length = 0; this.previousRank = []; this.state.completed = false;
    this.state.round = 0; this.state.menu = null; this.state.hype = 0; this.sfx('horn');
    this.flow = this.gameFlow(); this.advance();
  }
  private endGame(): void {
    this.emit({ k: 'game-ended' }); this.resetTimeline(); this.teams.forEach(t => { t.score = 0; });
    this.finds.clear(); this.feeds.clear(); this.history.length = 0; this.previousRank = []; this.roundPrompt = undefined;
    this.state.completed = false; this.state.round = -1; delete this.state.prompt; this.state.menu = null; this.state.hype = 0;
    this.flow = this.lobbyFlow(true); this.advance();
  }
  private resetTimeline(): void {
    this.generation++; this.time.clear(); this.host.clear(); this.time.resume(); this.state.paused = false;
    this.pendingAwards.clear(); this.pendingTaps.clear(); this.votes.clear(); this.waitTask = undefined; this.hostWaitDue = undefined;
    this.motion.clear();
    this.deadlineActive = undefined; this.skipPhase = undefined; this.hypeTask = undefined;
  }
  private pauseMenu(): void { this.menu({ kind: 'pause', options: ['Resume', 'Skip this phase', 'Sound', 'Music', 'Voice', 'End game'], focus: 0 }); }
  private lobbyMenu(): void { this.menu({ kind: 'lobby', options: ['Play with bots', 'Start the show', 'Sound', 'Music', 'Voice'], focus: 0 }); }
  private confirmEndMenu(): void {
    if (!this.state.paused) this.pause();
    this.menu({ kind: 'confirm-end', options: ['Keep playing', 'End game'], focus: 0 });
  }
  private menu(menu: TvMenu): void { this.state.menu = menu; this.emit({ k: 'menu', menu: copy(menu), focusColor: '#FFD43B' }); this.publish(false); }
  private selectMenu(menu: TvMenu): void {
    const item = menu.options[menu.focus];
    if (item === 'Resume' || item === 'Keep playing') this.resume();
    else if (item === 'Skip this phase') { this.resume(); this.skip(); }
    else if (item === 'Play with bots') { this.setBots(true); this.lobbyMenu(); this.state.menu!.focus = 1; this.menu(this.state.menu!); }
    else if (item === 'Start the show' && this.canStart()) this.beginGame();
    else if (item === 'Sound' || item === 'Music' || item === 'Voice') {
      if (item === 'Sound') this.state.sound = !this.state.sound;
      else if (item === 'Music') this.state.music = !this.state.music;
      else this.state.voice = !(this.state.voice ?? true);
      this.emit({ k: 'settings', sound: this.state.sound, music: this.state.music, voice: this.state.voice }); this.publish(false);
    } else if (item === 'End game') { if (menu.kind === 'confirm-end') this.endGame(); else this.confirmEndMenu(); }
  }
  private emit(cue: TvCue): void {
    if (this.disposed) return;
    this.observeMotion(cue);
    this.options.cue({ seq: ++this.cueSeq, at: this.options.clock.now(), round: this.state.round, cue: copy(cue) });
  }
  private observeMotion(cue: TvCue): void {
    const add = (animation: Animation) => {
      const stack = this.motion.get(animation.target) ?? [];
      stack.push({ animation: copy(animation), start: this.time.now() }); this.motion.set(animation.target, stack);
    };
    if (cue.k === 'animate') { const { k: _kind, ...animation } = cue; add(animation); }
    else if (cue.k === 'pop') add(this.animation(cue.target, [{ opacity: 0, transform: `scale(.3) rotate(${cue.fromRotation}deg)` }, { opacity: 1, transform: `scale(1) rotate(${cue.rotation}deg)` }], { spring: 'pop', delayMs: cue.delayMs }));
    else if (cue.k === 'slam') add(this.animation(cue.target, cue.frames, { durationMs: cue.durationMs, delayMs: cue.delayMs, easing: cue.easing }));
    else if (cue.k === 'card-flip' || cue.k === 'count') add(cue.animation);
    else if (cue.k === 'scan') add(cue.beam);
    else if (cue.k === 'scene') add(cue.animation);
    else if (cue.k === 'host-react') { if (cue.hop) add(cue.hop); if (cue.shake) add(cue.shake); }
    else if (cue.k === 'mash-tap') add(cue.animation);
  }
  private motionView(): TvView['motion'] {
    const out: TvView['motion'] = {}, now = this.time.now();
    for (const [target, stack] of this.motion) {
      const entries = stack.map(entry => {
        const a = entry.animation, durationMs = a.durationMs ?? (a.spring ? SPRING_CURVES[a.spring].durationMs : 420);
        const elapsedMs = now - entry.start - a.delayMs;
        return { entry, animation: copy(a), startedAt: this.time.wall(entry.start + a.delayMs), elapsedMs, durationMs,
          active: a.iterations === 'infinite' || elapsedMs < durationMs * a.iterations };
      });
      const lastBase = [...entries].reverse().find(e => !e.active && e.animation.fill === 'both');
      const keep = entries.filter(e => e.active || e === lastBase);
      this.motion.set(target, keep.map(e => e.entry));
      if (keep.length) out[target] = keep.map(({ entry: _entry, ...state }) => state);
    }
    return out;
  }
  private publish(phones = true): void {
    if (this.disposed) return;
    if (this.publishing) { this.dirty = true; return; }
    this.publishing = true;
    try {
      do {
        this.dirty = false;
        if (phones) {
          for (const t of this.teams) if (t.cid) this.sendScreen(t.cid);
          for (const cid of this.peers) if (!this.byClient(cid)) this.sendScreen(cid);
        }
        this.options.view?.(this.getView());
      } while (this.dirty);
    } finally { this.publishing = false; }
  }
  private sendScreen(cid: ClientId): void {
    const team = this.byClient(cid), view = this.getView();
    if (!this.suggestions.has(cid)) this.suggestions.set(cid, pick(this.options.rng, TEAM_NAMES));
    const screen: ScreenMsg = {
      t: 'screen', seq: ++this.screenSeq, me: team ? view.teams.find(t => t.id === team.id)! : null,
      teams: this.teams.map(t => this.teamView(t)), round: view.round, prompt: view.prompt, deadline: view.deadline, total: view.total,
      paused: view.paused, s: team ? this.screenFor(team) : {
        k: 'join', takenColors: this.teams.map(t => t.color), suggestedName: this.suggestions.get(cid)!, full: this.teams.length >= MAX_TEAMS || this.state.phase !== 'lobby',
      },
    };
    this.latest.set(cid, copy(screen)); this.options.send(cid, copy(screen));
  }
  private screenFor(t: Team): Screen {
    const f = this.finds.get(t.id), c = this.state.content;
    if (this.state.phase === 'lobby') return { k: 'lobby', isHost: t.cid === this.hostCid, canStart: this.canStart(), botsOn: this.botsOn, minTeams: this.botsOn ? 1 : 2 };
    if (c.k !== 'intro' && ['title', 'reel', 'countdown'].includes(this.state.phase)) return { k: 'ready', kicker: ROUNDS[this.state.round]!.kicker, title: ROUNDS[this.state.round]!.nice, sub: ROUNDS[this.state.round]!.sub, ...(this.state.phase === 'countdown' ? { prompt: this.state.prompt, count: 'GO!' } : {}) };
    if (c.k === 'intro') return { k: 'ready', kicker: c.kicker, title: ROUNDS[this.state.round]!.nice, sub: c.sub, prompt: c.landed ? this.state.prompt : undefined, count: c.count as '3' | '2' | '1' | 'GO!' | undefined };
    if (c.k === 'hunt') {
      if (this.state.phase === 'countdown') return { k: 'ready', kicker: ROUNDS[this.state.round]!.kicker, title: ROUNDS[this.state.round]!.nice, sub: ROUNDS[this.state.round]!.sub, prompt: this.state.prompt, count: 'GO!' };
      if (!f) return { k: 'cam' };
      if (!f.sent && !f.view.missed) return { k: 'glow', find: copy(f.view), names: [...f.names], brags: [...f.brags], aiPending: f.aiPending };
      return { k: 'wait', msg: f.view.missed ? "Didn't snag. Next round awaits." : f.autoSent ? 'Auto-sent! Watch the TV.' : 'Sent! Watch the TV.', card: copy(f.view), sub: 'Send reactions while you wait' };
    }
    if (c.k === 'brag') {
      const m = c.match, left = this.team(m.left), right = this.team(m.right), youIn = t.id === left.id || t.id === right.id;
      if (youIn && f?.view.missed) return { k: 'wait', msg: "Didn't snag. Next round awaits.", card: copy(f.view) };
      return { k: 'mash', kicker: m.kicker, youIn, left: { team: this.teamView(left), find: copy(this.finds.get(left.id)!.view), side: -1 }, right: { team: this.teamView(right), find: copy(this.finds.get(right.id)!.view), side: 1 },
        phase: m.winner ? 'done' : this.state.phase === 'mash' ? 'mash' : 'ready',
        head: m.winner ? m.winner === t.id ? 'You won the brag!' : youIn ? 'So close. They bragged harder.' : this.team(m.winner).name + ' wins this one' : youIn ? 'Mash your sticker' : 'Pick a side and mash',
        sub: m.winner ? m.winner === t.id ? '+' + m.points + ' points' : 'Keep your thumbs warm' : this.state.phase === 'mash' ? Math.abs(m.p) < .08 ? 'Dead even!' : this.finds.get(m.p < 0 ? m.left : m.right)!.view.name + ' is pulling ahead' : 'Get ready…' };
    }
    if (c.k === 'show' && c.voting) return { k: 'vote', options: c.pedestals.filter(p => p.find.team !== t.id).map(p => copy(p.find)), voted: this.votes.get(t.id) };
    if (c.k === 'champ' && c.endShown) {
      const ranking = this.ranking(), rank = ranking.findIndex(x => x.id === t.id) + 1;
      const mine = this.history.filter(x => x.view.team === t.id), best = [...mine].filter(x => !x.view.missed).sort((a, b) => (b.view.pts ?? 0) - (a.view.pts ?? 0))[0];
      return { k: 'end', rank, line: rank === 1 ? 'Champions! The TV agrees.' : rank === 2 ? 'So close. Demand a rematch.' : 'The couch remembers. Run it back.', best: best && copy(best.view), isHost: t.cid === this.hostCid,
        rows: mine.map(x => ({ round: x.view.round, name: x.view.name, sub: ROUNDS[x.view.round]!.nice + ' · ' + x.view.thing, pts: x.view.pts ?? 0 })) };
    }
    let msg = 'Watch the TV.', sub = 'Send reactions while you wait';
    if (c.k === 'judge') { msg = c.cards.find(x => x.find.team === t.id)?.stage === 'scored' ? (f?.view.match ?? 0) + '% ' + this.state.prompt!.b.toLowerCase() : 'The Pixel Judge is scanning…'; }
    else if (c.k === 'show') { msg = c.winner ? c.winner === t.id ? 'Your find stole the show!' : this.team(c.winner).name + ' stole the show' : 'The runway is open'; sub = c.winner ? (f?.votes ?? 0) + ' votes for you · ' + (f?.view.pts ?? 0) + ' points' : 'Vote is coming up next'; }
    else if (c.k === 'stand') { msg = 'You are ' + ordinal(this.ranking().findIndex(x => x.id === t.id) + 1); sub = t.score + ' points so far'; }
    return { k: 'wait', msg, sub, card: f && copy(f.view) };
  }
  private teamView(t: Team): TeamView { const { cid: _cid, ...view } = t; return copy(view); }
  private ranking(): Team[] { return [...this.teams].sort((a, b) => b.score - a.score || this.teams.indexOf(a) - this.teams.indexOf(b)); }
  private advance(): void {
    if (!this.flow || this.disposed || this.runningFlow) return;
    this.runningFlow = true;
    try {
      for (;;) {
        const next = this.flow.next();
        if (next.done) { this.flow = undefined; this.waitTask = undefined; this.hostWaitDue = undefined; this.publish(); break; }
        if (this.skipPhase === this.state.phase) { this.host.finish(); continue; }
        this.hostWaitDue = next.value.host ? this.time.now() + next.value.ms : undefined;
        this.waitTask = this.time.after(next.value.ms, () => { this.waitTask = undefined; this.hostWaitDue = undefined; this.advance(); });
        this.publish(); break;
      }
    } finally { this.runningFlow = false; }
  }
  private phase(phase: Phase, durationMs?: number): void {
    if (this.state.phase !== phase) this.host.cancelQuips();
    this.phaseToken++; this.state.phase = phase; this.beatActive = this.time.now(); this.state.beatAt = this.options.clock.now();
    if (this.skipPhase !== phase) this.skipPhase = undefined;
    this.deadlineActive = durationMs === undefined ? undefined : this.time.now() + durationMs;
    this.state.total = durationMs;
    this.emit({ k: 'phase', phase, deadline: this.getView().deadline, total: durationMs });
  }
  private after(ms: number, callback: () => void, scope: 'game' | 'phase' = 'game'): number {
    const gen = this.generation, phase = this.phaseToken;
    return this.time.after(ms, () => { if (gen !== this.generation || this.disposed || scope === 'phase' && phase !== this.phaseToken) return; callback(); this.publish(false); });
  }
  private shorten(ms: number): void {
    if (this.deadlineActive === undefined) return;
    if (this.runningFlow) { this.after(0, () => this.shorten(ms), 'phase'); return; }
    const due = Math.min(this.deadlineActive, this.time.now() + ms);
    this.deadlineActive = due; this.time.cancel(this.waitTask);
    this.waitTask = this.time.after(due - this.time.now(), () => { this.waitTask = undefined; this.advance(); });
    this.publish();
  }
  private *scene(scene: Scene, content: SceneContent, wipe = true): Flow {
    const from = this.state.scene, durationMs = wipe ? 1000 : 0;
    this.emit({ k: 'scene', from, scene, wipe, durationMs, swapAtMs: wipe ? 470 : 0,
      animation: this.animation('wipe', [{ transform: 'translateX(-2400px) rotate(-14deg)' }, { transform: 'translateX(-120px) rotate(-14deg)', offset: .45 }, { transform: 'translateX(120px) rotate(-14deg)', offset: .55 }, { transform: 'translateX(2600px) rotate(-14deg)' }], { durationMs, easing: 'cubic-bezier(.6,0,.4,1)', fill: 'none' }) });
    if (wipe) {
      this.sfx('whoosh'); this.state.transition = { from, to: scene, swapAt: this.options.clock.now() + 470, endsAt: this.options.clock.now() + 1000 };
      this.transitionActive = { swap: this.time.now() + 470, end: this.time.now() + 1000 };
      yield wait(470);
    }
    this.state.scene = scene; this.state.content = content;
    for (const target of this.motion.keys()) if (!target.startsWith('chip:') && target !== 'host' && target !== 'wipe') this.motion.delete(target);
    if (wipe) yield wait(530);
    delete this.state.transition; this.transitionActive = undefined;
  }
  private music(mood: MusicMood): void { this.state.musicMood = mood; this.emit({ k: 'music', mood }); }
  private bg(mood: Mood): void { this.state.backgroundMood = mood; this.emit({ k: 'background', mood }); }
  private sfx(name: Sfx, args: (number | string)[] = [], delayMs = 0): void { this.emit({ k: 'sfx', name, args, delayMs }); }
  private animation(target: string, frames: MotionFrame[], options: Partial<Omit<Animation, 'target' | 'frames'>> = {}): Animation {
    return { target, frames, delayMs: 0, fill: 'both', iterations: 1, ...options, ...(options.spring || options.durationMs !== undefined ? {} : { durationMs: 420 }), ...(options.easing || options.spring ? {} : { easing: 'cubic-bezier(.2,.7,.3,1)' }) };
  }
  private animate(target: string, frames: MotionFrame[], options: Partial<Omit<Animation, 'target' | 'frames'>> = {}): void { this.emit({ k: 'animate', ...this.animation(target, frames, options) }); }
  private pop(target: string, rotation = 0, delayMs = 0, fromRotation = -10): void { this.emit({ k: 'pop', target, fromRotation, rotation, from: .3, spring: 'pop', delayMs }); }
  private slam(target: string, o: { rotation?: number; from?: number; shake?: number; ring?: boolean; durationMs?: number; delayMs?: number; silent?: boolean } = {}): void {
    const rotation = o.rotation ?? 0, from = o.from ?? 2.6, d = o.durationMs ?? 520, delayMs = o.delayMs ?? 0;
    this.emit({ k: 'slam', target, rotation, from, durationMs: d, delayMs,
      frames: [{ opacity: 0, transform: `scale(${from}) rotate(${rotation - 8}deg)` }, { opacity: 1, transform: `scale(.92,1.08) rotate(${rotation}deg)`, offset: .55 }, { opacity: 1, transform: `scale(1.04,.96) rotate(${rotation}deg)`, offset: .75 }, { opacity: 1, transform: `scale(1) rotate(${rotation}deg)` }],
      easing: 'cubic-bezier(.3,.6,.3,1)', impactAtMs: delayMs + d * .5, sound: !o.silent,
      shakePx: o.silent ? 0 : o.shake ?? 10, shakeMs: 380, ring: !o.silent && o.ring !== false,
      ringColor: TOKENS.paper, ringMinRadius: 120, ringWidthFactor: .7, eyesPower: o.silent ? 0 : 9 });
  }
  private shake(px: number): void { this.emit({ k: 'shake', px, durationMs: 380, steps: 8, easing: 'linear' }); }
  private flash(opacity: number): void { this.emit({ k: 'flash', opacity, durationMs: 380 }); }
  private punch(scale: number): void { this.emit({ k: 'punch', scale, durationMs: 420, easing: 'cubic-bezier(.2,.8,.3,1)' }); }
  private eyes(target: string | null, power: number): void { this.emit({ k: 'eyes', target, power }); }
  private confetti(at: Anchor, count: number, o: { colors?: readonly string[]; angle?: number; spread?: number; power?: number; life?: number; delayMs?: number } = {}): void {
    this.emit({ k: 'confetti', at, count, colors: o.colors ?? CONFETTI, angle: o.angle ?? -Math.PI / 2, spread: o.spread ?? 1.2, power: o.power ?? 900, gravity: 1300, drag: .985, life: o.life ? [o.life, o.life] : [1.6, 2.6], delayMs: o.delayMs ?? 0, recipe: PARTICLES.confetti });
  }
  private stars(at: Anchor, count: number, color: string): void { this.emit({ k: 'stars', at, count, color, lifeMs: 700, recipe: PARTICLES.stars }); }
  private ring(at: Anchor, radius: number, color: string = TOKENS.paper): void { this.emit({ k: 'ring', at, color, radius, lifeMs: 500, recipe: PARTICLES.ring }); }
  private reactHost(trigger: keyof typeof HOST_REACTIONS): void {
    const [mood, durationMs] = HOST_REACTIONS[trigger]; this.state.host.reaction = mood;
    const token = ++this.reactionToken;
    this.emit({ k: 'host-react', mood, durationMs,
      hop: mood === 'glee' ? this.animation('host', [{ transform: 'translateY(0)' }, { transform: 'translateY(-44px) rotate(-5deg)', offset: .35 }, { transform: 'translateY(0) scale(1.06,.92)', offset: .72 }, { transform: 'translateY(0)' }], { durationMs: 620, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'none' }) : undefined,
      shake: mood === 'shock' ? this.animation('host', [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { durationMs: 180, iterations: 2, fill: 'none' }) : undefined });
    this.after(durationMs, () => { if (token === this.reactionToken) this.state.host.reaction = 'norm'; });
  }
  private *say(line: HostLine, afterTyping?: (holdEndsAt: number) => void): Flow { yield { ms: this.host.say(line, afterTyping), host: true }; }

  private feedCue(feed: TvFeed): void { this.emit({ k: 'feed', team: feed.team, state: feed.state, label: feed.label, thumbnail: !!feed.jpeg }); }
  private snag(team: Team, message: SnagArrived, at: number): void {
    if (this.state.phase !== 'hunt' || message.round !== this.state.round || this.finds.has(team.id)) return;
    if (!Number.isFinite(message.match) || !/^#[a-f0-9]{6}$/i.test(message.hex) || !message.photoId || at > (this.getView().deadline ?? Infinity)) return;
    const names = shuffle(this.options.rng, GEN_NAMES).slice(0, 3), brags = shuffle(this.options.rng, GEN_BRAGS).slice(0, 3);
    const find: Find = {
      view: { team: team.id, round: this.state.round, photoId: message.photoId, hex: message.hex, match: this.roundPrompt!.kind === 'color' ? clamp(Math.round(message.match), 2, 99) : 0,
        name: names[0]!, brag: brags[0]!, thing: 'Your photo', pts: 0,
        ...(this.roundPrompt!.kind === 'color' && isJudgeMask(message.mask) ? { mask: message.mask } : {}) },
      order: 0, sent: false, names, brags, aiPending: true, fit: SCORING.AI_FALLBACK_SCORE, votes: 0,
    };
    this.recordSnag(team, find, at); this.sfx('snagged'); this.reactHost('snag'); this.stickerFlight(team.id, false);
    this.after(TIMING.AI_TIMEOUT_MS, () => {
      if (this.finds.get(team.id) !== find || !find.aiPending) return;
      find.aiPending = false; this.publish();
    });
  }
  private botSnag(team: Team): void {
    if (this.finds.has(team.id)) return;
    const scripted = this.showcase?.script.rounds[this.state.round]?.finds[this.teams.indexOf(team)];
    const object = scripted ? OBJI[scripted.obj]! : botPick(this.roundPrompt!, this.taken, this.options.rng); this.taken.add(object.id);
    const fit = this.roundPrompt!.kind === 'color' ? SCORING.AI_FALLBACK_SCORE : object.t[this.roundPrompt!.t as ObjectTrait];
    this.recordSnag(team, { view: { team: team.id, round: this.state.round, obj: object.id, name: scripted ? object.names[scripted.name]! : pick(this.options.rng, object.names), brag: scripted ? object.brags[scripted.brag]! : pick(this.options.rng, object.brags), thing: object.nm, eyes: copy(object.eyes), hex: object.col, pts: 0, match: 0,
      ...(scripted && this.roundPrompt!.kind === 'color' ? { mask: showcaseJudgeMask(object.col, this.roundPrompt!.hex) } : {}) },
      order: 0, sent: false, names: [...object.names], brags: [...object.brags, pick(this.options.rng, GEN_BRAGS)], aiPending: false, fit, votes: 0 });
    if (scripted && !team.bot) { this.sfx('snagged'); this.reactHost('snag'); }
    else { this.sfx('rival'); this.reactHost('rival'); }
  }
  private recordSnag(team: Team, find: Find, at = this.options.clock.now()): void {
    find.order = this.finds.size + 1;
    const activeArrival = this.time.now() - Math.max(0, this.options.clock.now() - at);
    find.view.time = Math.max(0, activeArrival - this.huntStart) / 1000;
    this.finds.set(team.id, find);
    const feed = this.feeds.get(team.id)!; feed.state = 'locked'; feed.label = 'Snagged: ' + find.view.thing; feed.find = copy(find.view);
    delete feed.jpeg; this.feedCue(feed); this.emit({ k: 'find', find: copy(find.view), order: find.order });
    if (this.state.content.k === 'hunt') this.state.content.snagOrder.push(team.id);
    this.after(300, () => this.animate('feed-flash:' + team.id, [{ opacity: 1 }, { opacity: 0 }], { durationMs: 380, fill: 'none' }));
    this.after(640, () => {
      if (this.finds.get(team.id) !== find || this.state.scene !== 'hunt') return;
      feed.state = find.sent ? 'ready' : 'snagged'; this.feedCue(feed);
      this.slam('slot-card:' + team.id, { from: 1.6, shake: 7 });
      this.animate('snag-burst:' + team.id, [{ opacity: 0, transform: 'scale(.2) rotate(-30deg)' }, { opacity: 1, transform: 'scale(1) rotate(-8deg)', offset: .4 }, { opacity: 1, transform: 'scale(1) rotate(-6deg)', offset: .8 }, { opacity: 0, transform: 'scale(1.2) rotate(-6deg)' }], { durationMs: 1300 });
      this.confetti({ target: 'slot:' + team.id }, 26, { colors: [team.color, TOKENS.paper, TOKENS.yolk], power: 700 });
      if (find.order === 1 && this.roundPrompt!.kind === 'color') this.pop('first-snag:' + team.id, -4);
    });
    for (const rival of this.teams) if (rival.cid && rival.id !== team.id) this.options.send(rival.cid, { t: 'toast', text: team.name + ' snagged ' + find.view.thing.toLowerCase(), color: team.color });
    if (team.bot && find.order === 1 && !this.finds.has(this.byClient(this.hostCid ?? '')?.id ?? '')) this.host.say(HOST_LINES.first(team.name, this.roundPrompt!.kind === 'color'));
    if (this.teams.every(t => this.finds.has(t.id))) this.shorten(TIMING.HUNT_ALL_SNAGGED_GRACE_MS);
    this.publish();
  }
  private missed(team: Team): void {
    const find: Find = { view: { team: team.id, round: this.state.round, name: "Didn't snag", brag: '', thing: "Didn't snag", pts: 0, missed: true, match: 0 },
      order: Infinity, sent: true, names: [], brags: [], aiPending: false, fit: 0, votes: 0 };
    this.finds.set(team.id, find);
    const feed = this.feeds.get(team.id)!; feed.state = 'missed'; feed.label = "Didn't snag"; feed.find = copy(find.view); delete feed.jpeg; this.feedCue(feed);
    this.emit({ k: 'find', find: copy(find.view), order: 0 });
  }
  private glow(team: Team, message: Extract<PhoneToTv, { t: 'glow' }>): void {
    if (!['hunt', 'time', 'glow'].includes(this.state.phase)) return;
    const find = this.finds.get(team.id);
    if (!find || find.sent || find.view.missed) return;
    find.view.name = (message.name.trim() || find.names[0]!).slice(0, 22);
    find.view.brag = (message.brag.trim() || find.brags[0]!).slice(0, 70);
    if (message.eyes.length === 2 && message.eyes.every(p => p.length === 2 && p.every(Number.isFinite))) {
      find.view.eyes = [[clamp(message.eyes[0][0], 0, 120), clamp(message.eyes[0][1], 0, 120)], [clamp(message.eyes[1][0], 0, 120), clamp(message.eyes[1][1], 0, 120)], 11];
    }
    this.sendFind(team, find);
  }
  private sendFind(team: Team, find: Find, auto = false): void {
    if (find.sent || find.view.missed) return;
    find.sent = true; find.autoSent = auto; find.view.eyes ??= [[42, 46], [78, 46], 11];
    const feed = this.feeds.get(team.id)!; feed.find = copy(find.view);
    const delay = team.bot ? 0 : 780;
    if (!team.bot) { this.sfx('whoop'); this.stickerFlight(team.id, true); }
    this.slam('ready:' + team.id, { from: 2.2, shake: 4, ring: false, rotation: -12, durationMs: 420, delayMs: delay }); this.sfx('stamp', [], delay);
    if (delay) this.after(delay, () => { if (this.finds.get(team.id) === find) { feed.state = 'ready'; this.feedCue(feed); } });
    else { feed.state = 'ready'; this.feedCue(feed); }
    this.refreshContentFinds();
    if (this.state.phase === 'glow' && this.teams.every(t => this.finds.get(t.id)?.sent)) this.shorten(0);
    this.publish();
  }
  private stickerFlight(team: TeamId, eyes: boolean): void {
    this.emit({ k: 'sticker-flight', team, eyes, from: { target: 'phone:' + team }, to: { target: 'slot:' + team }, durationMs: 780, easing: 'cubic-bezier(.45,0,.3,1)', middle: { offset: .5, distanceFraction: .45, arc: 140, scale: 1.25, rotation: -200 }, end: { rotation: -360, minScale: .3, targetFill: .8 } });
  }
  private refreshContentFinds(): void {
    const c = this.state.content;
    if (c.k === 'judge') c.cards.forEach(card => { card.find = copy(this.finds.get(card.find.team)!.view); });
    if (c.k === 'show') c.pedestals.forEach(p => { p.find = copy(this.finds.get(p.find.team)!.view); });
  }
  private revealQuip(find: Find, until: number, replaceReadHold = false): void {
    if (!find.view.photoId || !find.quip?.trim() || find.quipSaid || find.view.missed || this.state.paused || this.skipPhase === this.state.phase) return;
    // Consume this opportunity even when it does not fit. A failed quip is never
    // retried from a late AI event or carried into another phase/match.
    find.quipSaid = true; this.host.trySay(HOST_LINES.quip(find.quip), until, replaceReadHold);
  }
  private flyPoints(team: Team, pts: number, from: Anchor, delayMs = 0, onLand?: () => void): void {
    if (!pts) return;
    const to: Anchor = { target: 'chip:' + team.id };
    this.emit({ k: 'fly-points', team: team.id, pts, from, to, durationMs: 1300, delayMs, easing: 'cubic-bezier(.45,0,.4,1)', trail: { intervalMs: 50, startMs: 250, lifeMs: 450 }, rollMs: 900, recipe: POINT_FLIGHT });
    this.sfx('pop', [4], delayMs); this.sfx('whoop', [], delayMs + 480);
    const award: Award = { team, pts, task: 0, onLand };
    award.task = this.after(delayMs + 1300, () => this.landPoints(award)); this.pendingAwards.add(award);
  }
  private landPoints(award: Award): void {
    if (!this.pendingAwards.delete(award)) return;
    const { team, pts } = award, from = team.score; team.score += pts;
    this.emit({ k: 'score', team: team.id, from, total: team.score, rollMs: 900, leaders: this.teams.filter(t => t.score === this.ranking()[0]!.score).map(t => t.id) });
    this.animate('chip:' + team.id, [{ transform: 'scale(1)' }, { transform: 'scale(1.12) rotate(-2deg)' }, { transform: 'scale(1)' }], { spring: 'wobble', fill: 'none' });
    this.sfx('coin'); this.stars({ target: 'chip:' + team.id }, 10, team.color); this.ring({ target: 'chip:' + team.id }, 90, team.color);
    if (team.cid) this.options.send(team.cid, { t: 'award', pts, total: team.score }); this.publish();
    award.onLand?.();
  }
  private settlePoints(): void { for (const award of [...this.pendingAwards]) { this.time.cancel(award.task); this.landPoints(award); } }
  private reaction(team: TeamId | null, kind: Reaction): void {
    if (!['star', 'heart', 'flame', 'tomato'].includes(kind)) return;
    if (team) {
      this.state.hype = Math.min(100, this.state.hype + 6);
      const count = (this.reactionCounts.get(team) ?? 0) + 1; this.reactionCounts.set(team, count); this.sfx('react', [kind, count]);
      if (this.hypeTask === undefined) this.decayHype();
    }
    this.emit({ k: 'reaction', team, kind, x: random(this.options.rng, team ? 300 : 260, team ? 1180 : 1220), y: 700, hype: this.state.hype, lifeMs: 2600, velocityY: [-260, -190], gravity: -40, recipe: PARTICLES.reaction });
    this.publish(false);
  }
  private decayHype(): void {
    this.hypeTask = this.after(300, () => {
      this.state.hype = Math.max(0, this.state.hype - 2); this.emit({ k: 'hype', value: this.state.hype });
      this.hypeTask = undefined; if (this.state.hype > 0) this.decayHype();
    });
  }
  private crowd(scene: Scene): void {
    this.after(420, () => {
      if (this.state.scene !== scene) return;
      if (this.options.rng() < .55) this.reaction(null, pick(this.options.rng, ['star', 'heart', 'flame', 'heart', 'star', 'tomato'] as const));
      this.crowd(scene);
    });
  }

  private *lobbyFlow(rejoin: boolean): Flow {
    this.options.prefetchHost?.(HOST_LINES.lobby());
    this.phase('lobby'); this.music('lobby'); this.bg('normal'); this.emit({ k: 'host-brow', brow: 'norm' });
    yield* this.scene('lobby', this.lobbyContent(), rejoin);
    this.emit({ k: 'parade', objects: this.lobbyContent().parade.map((obj, i) => ({ obj, travelDelayS: -i * 2.1, hopDelayS: -i * .17 })) });
    if (rejoin) return;
    yield wait(300); this.slam('lobby.snag', { rotation: -5, silent: true });
    yield wait(260); this.pop('lobby.ampersand', 10);
    yield wait(200); this.slam('lobby.brag', { rotation: -2, silent: true });
    yield wait(240); this.pop('lobby.tagline', -2); this.pop('lobby.join-card', 2, 120);
    this.animate('lobby.snag', [{ transform: 'rotate(-5deg)' }, { transform: 'rotate(-3deg) translateY(-6px)' }, { transform: 'rotate(-5deg)' }], { durationMs: 2600, iterations: 'infinite', easing: 'ease-in-out', delayMs: 900, fill: 'none' });
    this.animate('lobby.brag', [{ transform: 'rotate(-2deg)' }, { transform: 'rotate(-4deg) translateY(-5px)' }, { transform: 'rotate(-2deg)' }], { durationMs: 3000, iterations: 'infinite', easing: 'ease-in-out', delayMs: 1200, fill: 'none' });
    this.animate('lobby.ampersand', [{ transform: 'rotate(10deg)' }, { transform: 'rotate(-6deg) scale(1.06)' }, { transform: 'rotate(10deg)' }], { durationMs: 2200, iterations: 'infinite', easing: 'ease-in-out', delayMs: 1000, fill: 'none' });
    if (!this.teams.length) this.host.say(HOST_LINES.lobby());
  }
  private *gameFlow(): Flow {
    for (let round = 0; round < 3; round++) {
      this.state.round = round; this.roundPrompt = this.showcase?.script.rounds[round]?.prompt ?? choosePrompt(ROUNDS[round]!.kind, this.options.rng);
      this.state.prompt = this.promptView(this.roundPrompt);
      const before = Object.fromEntries(this.teams.map(t => [t.id, t.score]));
      yield* this.introFlow(); yield* this.huntFlow();
      this.teams.forEach(t => this.history.push(this.finds.get(t.id)!));
      if (round === 0) yield* this.judgeFlow(); else if (round === 1) yield* this.bragFlow(); else yield* this.showFlow();
      this.settlePoints(); yield* this.standFlow(before);
    }
    this.state.round = 3; yield* this.champFlow();
    this.state.completed = true; this.emit({ k: 'complete' });
  }
  private promptView(prompt: Prompt): PromptView { return { kind: prompt.kind, ...promptParts(prompt), ...(prompt.kind === 'color' ? { hex: prompt.hex } : {}) }; }

  private *introFlow(): Flow {
    const round = ROUNDS[this.state.round]!, prompt = this.roundPrompt!, pp = promptParts(prompt);
    this.options.prefetchHost?.(HOST_LINES.intro(this.state.round));
    this.options.prefetchHost?.(HOST_LINES.prompt(prompt));
    this.options.prefetchHost?.(HOST_LINES.glow());
    if (prompt.kind === 'color') this.options.prefetchHost?.(HOST_LINES.judge(prompt.k));
    else if (prompt.kind === 'show') { this.options.prefetchHost?.(HOST_LINES.runway()); this.options.prefetchHost?.(HOST_LINES.vote()); }
    this.phase('title'); this.music('tension'); this.bg('normal');
    const content: Extract<SceneContent, { k: 'intro' }> = { k: 'intro', title: round.name, kicker: round.kicker, sub: round.sub, kickerVisible: false, titleVisible: false, subVisible: false, landed: false };
    yield* this.scene('intro', content);
    content.kickerVisible = true; this.pop('intro.kicker', -3); yield wait(250);
    content.titleVisible = true; this.slam('intro.title', { rotation: -3, shake: 14 }); this.confetti({ x: 640, y: 260 }, 60, { power: 1000 }); this.punch(1.05);
    yield wait(500); content.subVisible = true; this.pop('intro.sub'); yield* this.say(HOST_LINES.intro(this.state.round));
    this.animate('intro.title', [{ opacity: 1, transform: 'rotate(-3deg)' }, { opacity: 0, transform: 'translateY(-160px) rotate(-10deg) scale(.6)' }], { durationMs: 380, easing: 'ease-in' });
    this.animate('intro.sub', [{ opacity: 1 }, { opacity: 0 }], { durationMs: 250 });
    this.animate('intro.kicker', [{ opacity: 1 }, { opacity: 0 }], { durationMs: 250 }); yield wait(250);
    this.phase('reel', 2400); content.titleVisible = false; content.subVisible = false; content.kickerVisible = false;
    const cards = Array.from({ length: 15 }, () => this.promptView(choosePrompt(prompt.kind, this.options.rng))); cards.push(this.promptView(prompt)); content.reel = cards;
    this.pop('intro.reel'); this.pop('intro.arrow-left'); this.pop('intro.arrow-right'); this.animate('intro.bulbs', [{ opacity: 0 }, { opacity: 1 }], { durationMs: 200 }); this.sfx('drumroll', [2.3]);
    this.emit({ k: 'reel', cards: copy(cards), durationMs: 2400, cardHeight: 320, easing: 'quart-out', tickAtMs: Array.from({ length: 15 }, (_, i) => 2400 * (1 - Math.pow(1 - (i + .5) / 15, .25))), bulbsHoldMs: 800 });
    yield wait(2400); this.phase('reel'); content.landed = true;
    this.sfx('reveal'); this.sfx('slam'); this.shake(14); this.flash(.6); this.punch(1.06); this.reactHost('reel'); this.confetti({ x: 640, y: 280 }, 70, { colors: [pp.col, TOKENS.paper, TOKENS.yolk], power: 1100 }); this.eyes(null, 8);
    yield* this.say(HOST_LINES.prompt(prompt)); this.phase('countdown');
    this.animate('intro.reel', [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.8)' }], { durationMs: 260 });
    for (const target of ['intro.bulbs', 'intro.arrow-left', 'intro.arrow-right']) this.animate(target, [{ opacity: 1 }, { opacity: 0 }], { durationMs: 200 });
    for (let n = 3; n >= 1; n--) {
      content.count = String(n); this.sfx('beep', [0]);
      this.emit({ k: 'count', target: 'intro', text: String(n), color: n === 1 ? TOKENS.bubble : TOKENS.yolk,
        animation: this.animation('intro.count', [{ opacity: 0, transform: 'scale(2.2)' }, { opacity: 1, transform: 'scale(1)', offset: .35 }, { opacity: 1, transform: 'scale(.95)', offset: .8 }, { opacity: 0, transform: 'scale(.7)' }], { durationMs: 760 }) });
      yield wait(760);
    }
    content.count = 'GO!'; this.sfx('beep', [1]); this.sfx('horn'); this.flash(.7); this.shake(16); this.confetti({ x: 640, y: 320 }, 90, { power: 1300 });
    this.emit({ k: 'count', target: 'intro', text: 'SNAG!', color: TOKENS.lime, fontSize: 250, top: 150, animation: this.animation('intro.count', [{ opacity: 0, transform: 'scale(2.5) rotate(-10deg)' }, { opacity: 1, transform: 'scale(1) rotate(-4deg)', offset: .3 }, { opacity: 1, transform: 'scale(1.05) rotate(-4deg)', offset: .8 }, { opacity: 0, transform: 'scale(1.4) rotate(-4deg)' }], { durationMs: 900 }) });
    yield wait(650);
  }

  private *huntFlow(): Flow {
    this.finds.clear(); this.taken.clear(); this.feeds.clear();
    for (const t of this.teams) this.feeds.set(t.id, { team: t.id, state: 'hunting', label: 'Hunting…', connected: t.connected });
    const content: Extract<SceneContent, { k: 'hunt' }> = { k: 'hunt', glowing: false, snagOrder: [] };
    yield* this.scene('hunt', content); this.music('hunt'); this.bg('normal');
    this.phase('hunt', TIMING.HUNT_S * 1000); this.huntStart = this.time.now();
    const bots = this.teams.filter(t => t.bot || !!this.showcase), times = this.showcase ? [] : shuffle(this.options.rng, [random(this.options.rng, 4, 8), random(this.options.rng, 10, 17), random(this.options.rng, 17, 27)]);
    bots.forEach((t, i) => this.after(this.showcase?.script.rounds[this.state.round]!.finds[this.teams.indexOf(t)]!.snagMs ?? times[i]! * 1000, () => this.botSnag(t), 'phase'));
    this.after(25_000, () => {
      this.music('urgent'); this.bg('urgent'); this.sfx('riser', [1.2]);
      if (this.teams.some(t => !t.bot && !this.finds.has(t.id))) this.host.say(HOST_LINES.urgent());
    }, 'phase');
    for (let at = 26_000; at <= 34_000; at += 1000) this.after(at, () => this.sfx('tick'), 'phase');
    yield wait(35_000);
    // Skip defaults the remaining bots as the mockup does; a real phone never gets a fabricated object.
    for (const bot of bots) if (!this.finds.has(bot.id)) this.botSnag(bot);
    for (const t of this.teams) if (!this.finds.has(t.id)) this.missed(t);
    this.phase('time'); this.slam('hunt.time', { shake: 16 }); this.sfx('buzzer'); this.reactHost('time'); this.music('tension'); this.bg('normal');
    yield wait(900); this.animate('hunt.time', [{ opacity: 1 }, { opacity: 0 }], { durationMs: 300 });
    content.glowing = true; this.phase('glow', TIMING.GLOW_S * 1000);
    for (const t of this.teams) {
      const f = this.finds.get(t.id)!, feed = this.feeds.get(t.id)!;
      if (!f.sent) { feed.state = 'glowing'; this.feedCue(feed); }
    }
    bots.forEach((t, i) => this.after(300 + i * 350, () => this.sendFind(t, this.finds.get(t.id)!), 'phase'));
    if (this.teams.some(t => !this.finds.get(t.id)!.sent)) {
      this.host.say(HOST_LINES.glow()); yield wait(15_000);
    }
    for (const t of this.teams) this.sendFind(t, this.finds.get(t.id)!, true);
    this.phase('glow'); yield wait(700);
  }

  private *judgeFlow(): Flow {
    const prompt = this.roundPrompt!; if (prompt.kind !== 'color') return;
    this.phase('judge');
    const ordered = [...this.finds.values()].sort((a, b) => a.order - b.order);
    const content: Extract<SceneContent, { k: 'judge' }> = { k: 'judge', cards: ordered.map(f => ({ find: copy(f.view), stage: 'back', speedBonus: 0 })), crown: false };
    yield* this.scene('judge', content); this.crowd('judge'); yield* this.say(HOST_LINES.judge(prompt.k));
    for (let i = 0; i < ordered.length; i++) {
      const find = ordered[i]!, t = this.team(find.view.team), card = content.cards[i]!;
      const match = find.view.missed ? 0 : find.view.photoId ? find.view.match! : clamp(colorMatch(find.view.hex!, prompt.hex) + (this.showcase ? 0 : Math.floor(random(this.options.rng, -3, 3))), 2, 99);
      const bonus = find.view.missed ? 0 : SCORING.SPEED_BONUS[find.order - 1] ?? 0;
      find.view.match = match; find.view.pts = match + bonus; card.speedBonus = bonus; card.stage = 'flip'; this.refreshContentFinds();
      if (i === ordered.length - 1) {
        // All matches are now known. Warm the likely announcement during the
        // last card's scan; the actual winner is still chosen after the reveal.
        const upcoming = ordered.filter(f => !f.view.missed).sort((a, b) => (b.view.match ?? 0) - (a.view.match ?? 0) || b.fit - a.fit || a.order - b.order)[0];
        if (upcoming) this.options.prefetchHost?.(HOST_LINES.colorWinner(this.team(upcoming.view.team).name, upcoming.view.name));
      }
      this.sfx('flip'); this.emit({ k: 'card-flip', team: t.id, animation: this.animation('judge-card-inner:' + t.id, [{ transform: 'rotateY(0) scale(1)' }, { transform: 'rotateY(90deg) scale(1.08)', offset: .5 }, { transform: 'rotateY(180deg) scale(1)' }], { durationMs: 620, easing: 'cubic-bezier(.4,0,.2,1)' }) });
      this.after(400, () => this.eyes('judge-card:' + t.id, 14)); yield wait(560);
      if (!find.view.missed) {
        card.stage = 'scan'; this.sfx('scan');
        this.emit({ k: 'scan', team: t.id, beam: this.animation('judge-beam:' + t.id, [{ opacity: 0, top: '30px' }, { opacity: 1, top: '40px', offset: .1 }, { opacity: 1, top: '200px', offset: .9 }, { opacity: 0, top: '210px' }], { durationMs: 800, easing: 'ease-in-out' }), pixels: { size: 10, jitter: 70, intervalMs: 60, durationMs: 900, stopMs: 950, hex: find.view.hex! } });
        yield wait(820);
        this.animate('judge-bar:' + t.id, [{ width: '0%' }, { width: match + '%' }], { durationMs: 800, easing: 'cubic-bezier(.2,.8,.3,1)' });
        this.animate('judge-swatch:' + t.id, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { spring: 'wobble' });
        this.emit({ k: 'meter', team: t.id, match, speedBonus: bonus, durationMs: 800, easing: 'cubic-out', ticks: { probability: .5, name: 'mtick' } }); yield wait(800);
        this.shake(5); if (match >= 90) this.reactHost('judgeHigh'); else if (match < 55) this.reactHost('judgeLow');
        this.confetti({ target: 'judge-card:' + t.id, dy: -40 }, 24, { colors: [t.color, TOKENS.yolk, TOKENS.paper], power: 600 });
        // The next scripted host line starts after the remaining cards. The quip
        // can begin only after this award lands and must finish before that line.
        const until = this.time.now() + 420 + ordered.slice(i + 1).reduce((ms, f) => ms + (f.view.missed ? 980 : 2600), 0);
        this.flyPoints(t, find.view.pts!, { target: 'judge-card:' + t.id, dy: -30 }, 0, () => {
          if (this.state.phase === 'judge') this.revealQuip(find, until);
        });
      }
      card.stage = 'scored'; yield wait(420);
    }
    // The "Most <color>" crown goes to the closest color match, not the highest total: the speed
    // bonus (30/20/10/0) can exceed the gap between a true color and a near-miss (eval, Oct 13),
    // and a crown reading "Most red" on an orange thing looks broken. Points still include speed.
    const winner = ordered.filter(f => !f.view.missed).sort((a, b) => (b.view.match ?? 0) - (a.view.match ?? 0) || b.fit - a.fit || a.order - b.order)[0];
    if (!winner) return;
    const t = this.team(winner.view.team); content.winner = t.id; content.crown = true; content.banner = 'Most ' + prompt.k.toLowerCase() + ': ' + winner.view.name;
    this.music('brag'); this.bg('party'); this.slam('judge.banner', { rotation: -2, shake: 10 }); this.slam('judge.crown', { rotation: 16, shake: 6, ring: false });
    this.animate('judge-card:' + t.id, [{ transform: 'scale(1)' }, { transform: 'scale(1.06) rotate(-2deg)' }], { spring: 'wobble' });
    this.confetti({ target: 'judge-card:' + t.id, y: 300 }, 120, { power: 1200 }); this.sfx('fanfare'); this.reactHost('colorWin');
    yield* this.say(HOST_LINES.colorWinner(t.name, winner.view.name));
  }

  private *bragFlow(): Flow {
    this.bragMatchIndex = 0;
    const ids = this.teams.map(t => t.id);
    if (ids.length === 2) {
      yield* this.faceOff({ left: ids[0]!, right: ids[1]!, kicker: 'THE FINAL', points: 150, final: true }); return;
    }
    if (ids.length === 3) {
      const seats = shuffle(this.options.rng, ids);
      const winner = yield* this.faceOff({ left: seats[0]!, right: seats[1]!, kicker: 'SEMI-FINAL', points: 100, final: false });
      yield* this.faceOff({ left: winner, right: seats[2]!, kicker: 'THE FINAL', points: 150, final: true }); return;
    }
    const pairs = this.showcase?.script.bracket;
    const foe = pairs ? ids[pairs[0]![1]]! : pick(this.options.rng, ids.slice(1)), rest = pairs ? pairs[1]!.map(i => ids[i]!) : ids.slice(1).filter(id => id !== foe);
    const first = yield* this.faceOff({ left: ids[pairs?.[0]?.[0] ?? 0]!, right: foe, kicker: 'SEMI-FINAL 1 OF 2', points: 100, final: false });
    const second = yield* this.faceOff({ left: rest[0]!, right: rest[1]!, kicker: 'SEMI-FINAL 2 OF 2', points: 100, final: false });
    yield* this.faceOff({ left: first, right: second, kicker: 'THE FINAL', points: 150, final: true });
  }
  private *faceOff(match: Match): Generator<Wait, TeamId, void> {
    const variation = (this.state.round + this.bragMatchIndex++) % 3;
    const left = this.finds.get(match.left)!, right = this.finds.get(match.right)!;
    if (!left.view.missed && !right.view.missed) this.options.prefetchHost?.(HOST_LINES.faceOff(left.view.name, right.view.name, match.final));
    const m: MatchView = { ...match, p: 0, taps: Object.fromEntries(this.teams.map(t => [t.id, 0])) };
    this.phase('brag-intro'); yield* this.scene('brag', { k: 'brag', match: m }); this.music('brag'); this.bg('normal');
    if (left.view.missed || right.view.missed) {
      const winner = left.view.missed ? right.view.missed ? left : right : left;
      m.bye = winner.view.team; m.winner = winner.view.team; this.phase('knockout');
      this.emit({ k: 'match', ...match, bye: m.bye });
      if (!winner.view.missed) {
        winner.view.pts = (winner.view.pts ?? 0) + match.points; this.flyPoints(this.team(winner.view.team), match.points, { x: 640, y: 290 }, 350);
        this.slam('brag.bye', { rotation: -5, shake: 12 });
        yield* this.say(HOST_LINES.bragWinner(winner.view.name, winner === left ? right.view.name : left.view.name, variation), until => this.revealQuip(winner, until, true));
      } else yield wait(500);
      return winner.view.team;
    }
    this.emit({ k: 'match', ...match });
    this.animate('brag.panel-left', [{ transform: 'translateX(-105%)' }, { transform: 'none' }], { durationMs: 560, easing: 'cubic-bezier(.2,.9,.3,1)' });
    this.animate('brag.panel-right', [{ transform: 'translateX(105%)' }, { transform: 'none' }], { durationMs: 560, easing: 'cubic-bezier(.2,.9,.3,1)', delayMs: 60 }); this.sfx('whoosh');
    this.animate('brag.seam', [{ opacity: 0, transform: 'scaleY(0)' }, { opacity: 1, transform: 'none' }], { durationMs: 260, delayMs: 480, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'backwards' });
    this.animate('brag.fighter-left', [{ transform: 'translateX(-700px) rotate(-30deg)' }, { transform: 'none' }], { spring: 'drop', delayMs: 240, fill: 'backwards' });
    this.animate('brag.fighter-right', [{ transform: 'translateX(700px) rotate(30deg)' }, { transform: 'none' }], { spring: 'drop', delayMs: 340, fill: 'backwards' });
    yield wait(680); this.sfx('slam'); this.shake(14); this.flash(.35); this.eyes(null, 12);
    this.animate('brag.vs', [{ opacity: 0, transform: 'scale(3) rotate(-180deg)' }, { opacity: 1, transform: 'scale(1) rotate(-8deg)' }], { spring: 'pop' });
    yield* this.say(HOST_LINES.faceOff(left.view.name, right.view.name, match.final)); this.host.hide(); this.phase('brag-lines');
    for (const side of [-1, 1] as const) {
      m.lineSide = side; const label = side < 0 ? 'left' : 'right';
      this.pop('brag.line-' + label, side * 2, 0, side * 14);
      for (let i = 0; i < 6; i++) this.sfx('voice', [], i * 70);
      this.eyes('brag.fighter-' + label, 10);
      this.animate('brag.fighter-' + label, [{ transform: 'none' }, { transform: 'translateY(-16px) rotate(' + (side * 3) + 'deg)' }, { transform: 'none' }], { durationMs: 360, fill: 'none' });
      yield wait(TIMING.BRAG_LINE_MS);
    }
    delete m.lineSide;
    for (const label of ['left', 'right']) this.animate('brag.line-' + label, [{ opacity: 1 }, { opacity: 0 }], { durationMs: 200 });
    this.phase('brag-countdown'); this.animate('brag.tug', [{ opacity: 0, transform: 'translateY(60px)' }, { opacity: 1, transform: 'none' }], { spring: 'pop' });
    for (let n = 3; n >= 1; n--) {
      m.count = String(n); this.sfx('beep', [0]);
      this.emit({ k: 'count', target: 'brag', text: String(n), color: TOKENS.yolk, animation: this.animation('brag.count', [{ opacity: 0, transform: 'scale(2)' }, { opacity: 1, transform: 'scale(1)', offset: .4 }, { opacity: 0, transform: 'scale(.8)' }], { durationMs: 560 }) }); yield wait(560);
    }
    m.count = 'MASH!'; this.sfx('horn'); this.flash(.5); this.shake(12);
    this.emit({ k: 'count', target: 'brag', text: 'MASH!', color: TOKENS.bubble, animation: this.animation('brag.count', [{ opacity: 0, transform: 'scale(2.4) rotate(-8deg)' }, { opacity: 1, transform: 'scale(1) rotate(-4deg)', offset: .3 }, { opacity: 0, transform: 'scale(1.3)' }], { durationMs: 900 }) });
    this.phase('mash', 6000); this.startMash(m, left, right); yield wait(6000);
    this.tickMash(); this.mashRuntime = undefined; this.pendingTaps.clear(); this.phase('knockout');
    const winner = m.p < 0 || (Math.abs(m.p) < 1e-9 && left.fit >= right.fit) ? left : right, loser = winner === left ? right : left;
    const leftWins = winner === left, winningTeam = this.team(winner.view.team); m.winner = winningTeam.id;
    this.options.prefetchHost?.(HOST_LINES.bragWinner(winner.view.name, loser.view.name, variation));
    this.animate('brag.tug', [{ opacity: 1 }, { opacity: 0 }], { durationMs: 250 }); this.animate('brag.combo', [{ opacity: 1 }, { opacity: 0 }], { durationMs: 250 });
    this.animate('brag.vs', [{ opacity: 1, transform: 'scale(1) rotate(-8deg)' }, { opacity: 0, transform: 'scale(2.2) rotate(20deg)' }], { durationMs: 300 });
    this.sfx('ko'); this.shake(22); this.flash(.7); this.punch(1.07); this.reactHost('knockout');
    this.animate('brag.fighter-' + (leftWins ? 'right' : 'left'), [{ transform: 'scale(' + (leftWins ? 1 + m.p * .14 : 1 - m.p * .14) + ')', opacity: 1 }, { transform: 'translate(' + (leftWins ? 760 : -760) + 'px,-260px) rotate(' + (leftWins ? 620 : -620) + 'deg) scale(.4)', opacity: 0 }], { durationMs: 850, easing: 'cubic-bezier(.5,0,.75,.4)' }); this.sfx('boing', [], 120);
    this.animate('brag.fighter-' + (leftWins ? 'left' : 'right'), [{ transform: 'scale(' + (leftWins ? 1 - m.p * .14 : 1 + m.p * .14) + ')' }, { transform: 'translateX(' + (leftWins ? 374 : -374) + 'px) scale(1.12)' }], { spring: 'soft' });
    this.animate('brag.sweep', [{ xPercent: -m.p * 16 }, { xPercent: leftWins ? 78 : -78 }], { durationMs: 560, easing: 'cubic-out' }); yield wait(560);
    this.eyes('brag.fighter-' + (leftWins ? 'left' : 'right'), 16); this.slam('brag.ko', { rotation: -5, shake: 12 });
    this.confetti({ x: 640, y: 300 }, 120, { colors: [winningTeam.color, TOKENS.yolk, TOKENS.paper, TOKENS.bubble], power: 1300 }); this.sfx('fanfare');
    winner.view.pts = (winner.view.pts ?? 0) + match.points; this.flyPoints(winningTeam, match.points, { x: 640, y: 290 }, 350);
    yield* this.say(HOST_LINES.bragWinner(winner.view.name, loser.view.name, variation), until => this.revealQuip(winner, until, true));
    return winningTeam.id;
  }
  private tap(team: Team, n: number, side: -1 | 1): void {
    const runtime = this.mashRuntime;
    if (this.state.phase !== 'mash' || !runtime || !Number.isSafeInteger(n) || n <= 0 || (side !== -1 && side !== 1)) return;
    const m = runtime.match;
    if (team.id === m.left && side !== -1 || team.id === m.right && side !== 1) return;
    n = Math.min(30, n); m.taps[team.id] = (m.taps[team.id] ?? 0) + n;
    const packets = this.pendingTaps.get(team.id) ?? []; packets.push({ side, n }); this.pendingTaps.set(team.id, packets);
    const combo = m.taps[team.id]!;
    this.emit({ k: 'mash-tap', team: team.id, n, combo, side,
      animation: this.animation('brag.combo:' + team.id, [{ opacity: 1, transform: 'translateX(-50%) scale(1.6) rotate(-10deg)' }, { opacity: 1, transform: 'translateX(-50%) scale(1) rotate(-4deg)' }], { durationMs: 180 }),
      starCount: Math.floor(combo / 3) - Math.floor((combo - n) / 3), sparkle: Math.floor(combo / 10) > Math.floor((combo - n) / 10) });
    this.sfx('mash', [combo]);
    for (let i = Math.floor((combo - n) / 3); i < Math.floor(combo / 3); i++) this.stars({ target: 'brag.knob' }, 4, this.team(side < 0 ? m.left : m.right).color);
    if (Math.floor(combo / 10) > Math.floor((combo - n) / 10)) { this.stars({ target: 'brag.combo:' + team.id }, 10, TOKENS.yolk); this.sfx('sparkle'); }
  }
  private startMash(match: MatchView, left: Find, right: Find): void {
    this.pendingTaps.clear();
    const bots = ([[-1, match.left, left], [1, match.right, right]] as const).filter(([, id]) => this.team(id).bot)
      .map(([side, , f]) => ({ side, rate: clamp(.1 + (f.fit - 5) * .014 + random(this.options.rng, -.02, .02), .04, .17) }));
    const voters = this.teams.filter(t => t.bot && t.id !== match.left && t.id !== match.right)
      .map((): -1 | 1 => left.fit + random(this.options.rng, -3, 3) > right.fit + random(this.options.rng, -3, 3) ? -1 : 1);
    const now = this.time.now(); this.mashRuntime = { match, start: now, last: now, lastPhone: now, lastSpark: now, crowd: 0, bots, voters };
    const tick = () => { this.tickMash(); if (this.mashRuntime && this.time.now() - this.mashRuntime.start < 6000) this.after(MASH_TICK_MS, tick, 'phase'); };
    this.after(MASH_TICK_MS, tick, 'phase');
  }
  private tickMash(): void {
    const runtime = this.mashRuntime; if (!runtime) return;
    const now = this.time.now(), dt = Math.min(.1, Math.max(0, now - runtime.last) / 1000); runtime.last = now;
    let leftTaps = 0, rightTaps = 0;
    for (const packets of this.pendingTaps.values()) for (const packet of packets) if (packet.side < 0) leftTaps += packet.n; else rightTaps += packet.n;
    this.pendingTaps.clear();
    const botDelta = runtime.bots.reduce((sum, b) => sum + b.side * b.rate * dt * random(this.options.rng, .6, 1.4), 0) + runtime.voters.reduce((sum, side) => sum + side * .025 * dt, 0);
    const m = runtime.match;
    if (this.showcase) {
      const winner = this.teams[this.showcase.script.matchWinners[this.bragMatchIndex - 1]!]!.id;
      m.p = showcaseMashPosition(now - runtime.start, m.final, winner === m.left ? -1 : 1);
      for (const t of this.teams) m.taps[t.id] = Math.floor((now - runtime.start) * .007);
    } else m.p = mashPush(m.p, leftTaps, rightTaps, botDelta);
    this.emit({ k: 'mash', p: m.p, taps: copy(m.taps), seamPercent: -m.p * 16, leftScale: 1 - m.p * .14, rightScale: 1 + m.p * .14, elapsedMs: now - runtime.start });
    if (now - runtime.lastSpark >= 150) {
      runtime.lastSpark = now;
      this.emit({ k: 'mash-spark', at: { target: 'brag.knob' }, colors: [this.team(m.left).color, this.team(m.right).color], lifeMs: 700, velocityX: [-200, 200], velocityY: [-400, -200], gravity: 900, drag: .98, width: [10, 18] });
    }
    runtime.crowd += dt;
    if (runtime.crowd > .6) { runtime.crowd = 0; this.sfx('crowd', [.6, .04 + Math.abs(m.p) * .08]); }
    if (now - runtime.lastPhone >= 200) {
      runtime.lastPhone = now;
      for (const t of this.teams) if (t.cid) this.options.send(t.cid, { t: 'mashp', p: m.p });
    }
  }
  private castVote(voter: Team, target: TeamId): void {
    if (this.votes.has(voter.id) || voter.id === target) return;
    const find = this.finds.get(target);
    if (!find || find.view.missed) return;
    this.votes.set(voter.id, target); find.votes++;
    const c = this.state.content; if (c.k === 'show') c.pedestals.find(p => p.find.team === target)!.voters.push(voter.id);
    this.sfx('whoop');
    this.emit({ k: 'vote', voter: voter.id, team: target, durationMs: 640, arc: 170, middleScale: 1.7, endScale: .6, from: { target: 'chip:' + voter.id }, to: { target: 'vote-badge:' + target + ':' + voter.id } });
    this.after(640, () => { this.slam('vote-badge:' + target + ':' + voter.id, { from: 2.2, shake: 5, ring: false, durationMs: 360 }); this.sfx('stamp'); this.stars({ target: 'vote-badge:' + target + ':' + voter.id }, 6, voter.color); });
    if (this.state.phase === 'vote' && this.votes.size >= this.teams.length) this.shorten(0);
    this.publish();
  }
  private defaultVote(voter: Team): void {
    if (this.votes.has(voter.id)) return;
    if (this.showcase) { this.castVote(voter, this.teams[this.showcase.script.voteFor[this.teams.indexOf(voter)]!]!.id); return; }
    const choices = [...this.finds.values()].filter(f => !f.view.missed && f.view.team !== voter.id);
    if (!choices.length) return;
    const chosen = voter.bot ? choices.map(f => ({ f, s: f.fit + random(this.options.rng, 0, 6) })).sort((a, b) => b.s - a.s)[0]!.f : pick(this.options.rng, choices);
    this.castVote(voter, chosen.view.team);
  }
  private *showFlow(): Flow {
    this.phase('runway'); this.votes.clear();
    const eligible = this.teams.map(t => this.finds.get(t.id)!).filter(f => !f.view.missed);
    const c: Extract<SceneContent, { k: 'show' }> = { k: 'show', pedestals: eligible.map(f => ({ find: copy(f.view), visible: false, spotlight: 0, voters: [] })), voting: false, holographic: false, crown: false };
    yield* this.scene('show', c); this.music('tension'); this.bg('tension'); this.crowd('show'); this.host.say(HOST_LINES.runway());
    const quipFinds = eligible.filter(f => f.view.photoId).slice(0, 2);
    const runwayEndsAt = this.time.now() + eligible.length * 900;
    for (let i = 0; i < eligible.length; i++) {
      const f = eligible[i]!, p = c.pedestals[i]!; p.visible = true; p.spotlight = 1;
      this.animate('show-spot:' + f.view.team, [{ opacity: 0 }, { opacity: 1 }], { durationMs: 250 }); this.sfx('thump');
      this.animate('show-find:' + f.view.team, [{ opacity: 0, transform: 'translateY(-500px) rotate(-30deg)' }, { opacity: 1, transform: 'translateY(0) rotate(0)' }], { spring: 'drop' });
      this.after(330, () => {
        this.sfx('stamp'); this.shake(7); this.eyes('show-find:' + f.view.team, 14); this.ring({ target: 'show-find:' + f.view.team, dy: 90 }, 150);
        if (quipFinds.includes(f)) this.revealQuip(f, runwayEndsAt);
      }, 'phase');
      yield wait(900); p.spotlight = .25; this.animate('show-spot:' + f.view.team, [{ opacity: 1 }, { opacity: .25 }], { durationMs: 500 });
    }
    if (!eligible.length) return;
    this.music('brag'); this.bg('party'); this.pop('show.vote-timer'); this.host.say(HOST_LINES.vote());
    this.phase('vote', 10_000); c.voting = true;
    for (const t of this.teams.filter(t => t.bot || !!this.showcase)) this.after(this.showcase?.script.voteMs[this.teams.indexOf(t)] ?? random(this.options.rng, 1.5, 7.5) * 1000, () => this.defaultVote(t), 'phase');
    yield wait(10_000);
    for (const t of this.teams) this.defaultVote(t);
    const upcoming = [...eligible].sort((a, b) => b.votes - a.votes || b.fit - a.fit || a.order - b.order)[0]!;
    this.options.prefetchHost?.(HOST_LINES.showWinner(upcoming.view.name, upcoming.votes));
    this.phase('tally'); yield wait(500); this.music('tension'); this.sfx('drumroll', [1.4]); yield wait(1400);
    const winner = [...eligible].sort((a, b) => b.votes - a.votes || b.fit - a.fit || a.order - b.order)[0]!;
    eligible.forEach((f, i) => {
      const pts = f.votes * 100 + (f === winner ? 100 : 0); f.view.pts = (f.view.pts ?? 0) + pts;
      this.flyPoints(this.team(f.view.team), pts, { target: 'show-find:' + f.view.team }, i * 170);
    }); this.refreshContentFinds();
    c.voting = false; c.winner = winner.view.team; c.holographic = true; c.crown = true;
    this.music('win'); this.bg('gold'); this.sfx('fanfare'); this.sfx('sparkle'); this.flash(.7); this.shake(16); this.punch(1.06); this.reactHost('showWin');
    this.emit({ k: 'hologram', team: winner.view.team, on: true });
    this.animate('show.crown', [{ opacity: 0, transform: 'translateY(-260px) rotate(-30deg)' }, { opacity: 1, transform: 'rotate(-8deg)' }], { spring: 'drop', delayMs: 250 }); this.sfx('stamp', [], 560);
    this.animate('pedestal:' + winner.view.team, [{ transform: 'scale(1)' }, { transform: 'scale(1.1) translateY(-10px)' }], { spring: 'wobble' }); this.eyes('pedestal:' + winner.view.team, 18);
    this.slam('show.ribbon', { rotation: -6 });
    for (let i = 0; i < 3; i++) this.confetti({ target: 'pedestal:' + winner.view.team, y: 300 }, 90, { power: 1300, delayMs: i * 350 });
    yield* this.say(HOST_LINES.showWinner(winner.view.name, winner.votes));
  }

  private *standFlow(before: Record<TeamId, number>): Flow {
    this.phase('standings');
    const ranked = this.ranking(), previous = this.previousRank.length ? [...this.previousRank] : this.teams.map(t => t.id);
    this.options.prefetchHost?.(HOST_LINES.standings(ranked[0]!.name, this.state.round, ranked.at(-1)!.name));
    const max = Math.max(1, ranked[0]!.score) * 1.04, pct = (score: number) => clamp(score / max * 100, 5, 95);
    const c: Extract<SceneContent, { k: 'stand' }> = { k: 'stand', before, previous, ranking: ranked.map(t => t.id), raced: false, reordered: false, overtakes: [] };
    yield* this.scene('stand', c); this.music('lobby'); this.bg('normal');
    this.slam('stand.title', { rotation: -2, shake: 8 }); this.pop('stand.kicker', 2, 200);
    previous.forEach((id, i) => this.animate('lane:' + id, [{ transform: 'translateX(-1400px)' }, { transform: 'none' }], { spring: 'soft', delayMs: 150 + i * 90, fill: 'backwards' }));
    yield wait(950); this.sfx('riser', [1.2]); c.raced = true;
    for (const t of ranked) {
      const old = before[t.id] ?? 0, from = pct(old) + '%', to = pct(t.score) + '%';
      this.animate('lane-fill:' + t.id, [{ width: from }, { width: to }], { durationMs: 1300, easing: 'cubic-bezier(.3,.8,.3,1)' });
      this.animate('lane-rider:' + t.id, [{ left: from }, { left: to }], { durationMs: 1300, easing: 'cubic-bezier(.3,.8,.3,1)' });
      this.emit({ k: 'roll', target: 'lane-score:' + t.id, from: old, to: t.score, durationMs: 1300, easing: 'cubic-out', tickMs: 60, sound: 'rollTick' });
      if (t.score > old) {
        this.animate('lane-badge:' + t.id, [{ transform: 'translateY(0) rotate(0)' }, { transform: 'translateY(-12px) rotate(-8deg)' }, { transform: 'translateY(0) rotate(0)' }], { durationMs: 220, iterations: 6, fill: 'none' });
        this.animate('lane-delta:' + t.id, [{ opacity: 0, transform: 'scale(.3)' }, { opacity: 1, transform: 'scale(1) rotate(-6deg)' }], { spring: 'pop', delayMs: 1200 });
      }
    }
    yield wait(1550); c.reordered = true; let moved = false;
    ranked.forEach((t, i) => {
      const oldRank = previous.indexOf(t.id);
      if (oldRank === i) return;
      moved = true; this.animate('lane:' + t.id, [{ top: oldRank * 78 + 'px' }, { top: i * 78 + 'px' }], { spring: 'soft' });
      if (i < oldRank) { c.overtakes.push(t.id); this.slam('overtake:' + t.id, { rotation: -5, shake: 5, ring: false, from: 2.2, delayMs: 250 }); }
    });
    if (moved) { this.sfx('whoosh'); this.sfx('stamp', [], 320); }
    this.after(moved ? 520 : 120, () => {
      c.leader = ranked[0]!.id;
      this.confetti({ target: 'lane-rider:' + c.leader }, 40, { colors: [ranked[0]!.color, TOKENS.yolk, TOKENS.paper], power: 700 }); this.sfx('coin');
    });
    this.previousRank = ranked.map(t => t.id);
    const hostTeam = this.byClient(this.hostCid ?? '');
    if (hostTeam === ranked[0]) this.reactHost('hostLead');
    yield* this.say(HOST_LINES.standings(ranked[0]!.name, this.state.round, ranked.at(-1)!.name));
  }
  private *champFlow(): Flow {
    this.phase('podium');
    const ranked = this.ranking(), champion = ranked[0]!;
    this.options.prefetchHost?.(HOST_LINES.champion(champion.name));
    this.options.prefetchHost?.(HOST_LINES.thanks());
    const best = [...this.history].filter(f => !f.view.missed).sort((a, b) => (b.view.pts ?? 0) - (a.view.pts ?? 0))[0];
    const c: Extract<SceneContent, { k: 'champ' }> = { k: 'champ', ranking: ranked.map(t => t.id), podiums: [], badges: [], crown: false, name: false, trophy: false, fourth: false, object: best && copy(best.view), objectVisible: false, endShown: false };
    yield* this.scene('champ', c); this.music('tension'); this.bg('tension'); this.crowd('champ'); this.sfx('drumroll', [2.2]);
    for (let index = Math.min(2, ranked.length - 1); index >= 0; index--) {
      const t = ranked[index]!; c.podiums.push(index + 1);
      this.animate('podium:' + (index + 1), [{ transform: 'translateY(300px)' }, { transform: 'none' }], { spring: 'soft' }); this.sfx('thump');
      yield wait(index ? 380 : 520);
      if (!index) { this.music('win'); this.bg('gold'); this.sfx('ko'); this.flash(.85); this.punch(1.07); } else this.sfx('coin');
      c.badges.push(index + 1); this.slam('podium-badge:' + t.id, { shake: index ? 6 : 18, from: 2.6 });
      if (!index) this.confetti({ x: 640, y: 300 }, 140, { power: 1400 });
      yield wait(index ? 420 : 260);
    }
    this.phase('finale'); c.crown = true; c.name = true;
    this.animate('champ.crown', [{ transform: 'translateY(-320px) rotate(-40deg)' }, { transform: 'rotate(-10deg)' }], { spring: 'drop' });
    this.after(360, () => { this.sfx('stamp'); this.shake(10); this.eyes(null, 10); });
    this.slam('champ.name', { rotation: -2, shake: 16 }); this.pop('champ.kicker', -2); this.reactHost('champion'); this.sfx('fanfare');
    for (let i = 0; i < 6; i++) {
      this.confetti({ x: i % 2 ? 1260 : 20, y: 700 }, 90, { angle: i % 2 ? -2.2 : -.95, spread: .4, power: 1500, life: 3, delayMs: i * 450 }); this.sfx('thump', [], i * 450);
    }
    this.fireworks(); yield wait(600); c.trophy = true; c.objectVisible = !!best; c.fourth = ranked.length === 4;
    this.pop('champ.trophy', -6);
    if (best) { this.slam('champ.object', { rotation: 3, shake: 8 }); this.eyes('champ.object', 14); }
    if (c.fourth) this.pop('champ.fourth', -2, 300);
    this.animate('champ.trophy', [{ transform: 'rotate(-6deg)' }, { transform: 'rotate(4deg) translateY(-8px)' }, { transform: 'rotate(-6deg)' }], { durationMs: 2400, iterations: 'infinite', easing: 'ease-in-out', delayMs: 900, fill: 'none' });
    c.endShown = true;
    yield* this.say(HOST_LINES.champion(champion.name));
    yield* this.say(HOST_LINES.thanks());
  }
  private fireworks(): void {
    const x = random(this.options.rng, 320, 960), y = random(this.options.rng, 110, 250), color = pick(this.options.rng, CONFETTI);
    this.emit({ k: 'firework', x, y, color, rocket: { fromX: x + random(this.options.rng, -120, 120), fromY: 720, durationMs: 600, gravity: 500 }, burst: { count: 46, speed: [240, 430], gravity: 300, drag: .955, life: [.9, 1.4], sound: 'boom', recipe: PARTICLES.firework } });
    this.after(random(this.options.rng, 550, 950), () => { if (this.state.scene === 'champ') this.fireworks(); });
  }
}
