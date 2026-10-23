import type { Mood, MusicMood, Reaction, SpringName } from '../constants';
import type { ClientId, FindView, PromptView, TeamId, TeamView, TvToPhone } from '../protocol';
import type { HostLine } from './host';
import type { PARTICLES, POINT_FLIGHT } from './motion';
import type { ShowcaseOptions } from './showcase';

/** The only source of time. Handles are deliberately opaque (Hermes, browser, Node). */
export interface Clock {
  now(): number;
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}
export type Rng = () => number;
export type Scene = 'lobby' | 'intro' | 'hunt' | 'judge' | 'brag' | 'show' | 'stand' | 'champ';
export type Phase = 'lobby' | 'title' | 'reel' | 'countdown' | 'hunt' | 'time' | 'glow'
  | 'judge' | 'brag-intro' | 'brag-lines' | 'brag-countdown' | 'mash' | 'knockout'
  | 'runway' | 'vote' | 'tally' | 'standings' | 'podium' | 'finale';
export type RemoteKey = 'select' | 'back' | 'playpause' | 'ff' | 'up' | 'down' | 'left' | 'right';
/** A semantic element anchor is resolved by the native renderer's layout. */
export type Anchor = { x: number; y: number } | { target: string; dx?: number; dy?: number; x?: number; y?: number };
export interface MotionFrame {
  transform?: string;
  opacity?: number;
  offset?: number;
  width?: string;
  top?: string;
  left?: string;
  /** Brag seam/panels share this custom property (1280 * percent / 100). */
  xPercent?: number;
}
export interface Animation {
  target: string;
  frames: MotionFrame[];
  durationMs?: number;
  spring?: SpringName;
  easing?: string;
  delayMs: number;
  fill: 'both' | 'none' | 'backwards';
  iterations: number | 'infinite';
}
export interface MotionState {
  animation: Animation;
  startedAt: number;
  elapsedMs: number;
  durationMs: number;
  active: boolean;
}
export type Sfx = 'tap' | 'sel' | 'pop' | 'join' | 'slam' | 'thump' | 'whoosh' | 'whoop'
  | 'tick' | 'beep' | 'horn' | 'shutter' | 'snagged' | 'rival' | 'taken' | 'bonk' | 'lock'
  | 'buzzer' | 'flip' | 'scan' | 'mtick' | 'coin' | 'crowd' | 'aww' | 'fanfare' | 'sparkle'
  | 'boing' | 'stamp' | 'mash' | 'react' | 'rollTick' | 'reveal' | 'drumroll' | 'riser' | 'voice' | 'boom' | 'ko';

/** All cues are transient; draw TvView first, then consume cues in sequence order.
 * No cue contains photo bytes or thumbnails. See docs/game-core.md for target names. */
export type TvCue =
  | { k: 'scene'; from: Scene; scene: Scene; wipe: boolean; durationMs: number; swapAtMs: number; animation: Animation }
  | { k: 'phase'; phase: Phase; deadline?: number; total?: number }
  | { k: 'music'; mood: MusicMood }
  | { k: 'background'; mood: Mood }
  | { k: 'sfx'; name: Sfx; args: (number | string)[]; delayMs: number }
  | { k: 'host'; line: HostLine; typingMs: number; startedAt: number; cadence: { intervalMs: number; characters: number; voiceEveryCharacters: number; talkingOpen: [number, number]; quietOpen: [number, number] } }
  | { k: 'host-finish'; text: string; forced?: boolean }
  | { k: 'host-hide'; durationMs: number }
  | { k: 'host-brow'; brow: 'norm' | 'up' | 'down' }
  | { k: 'host-react'; mood: 'norm' | 'glee' | 'shock'; durationMs: number; hop?: Animation; shake?: Animation }
  | { k: 'slam'; target: string; rotation: number; from: number; durationMs: number; delayMs: number;
      frames: MotionFrame[]; easing: string; impactAtMs: number; sound: boolean; shakePx: number;
      shakeMs: number; ring: boolean; ringColor: string; ringMinRadius: number; ringWidthFactor: number; eyesPower: number }
  | { k: 'pop'; target: string; fromRotation: number; rotation: number; from: number; spring: 'pop'; delayMs: number }
  | ({ k: 'animate' } & Animation)
  | { k: 'shake'; px: number; durationMs: number; steps: number; easing: 'linear' }
  | { k: 'flash'; opacity: number; durationMs: number }
  | { k: 'punch'; scale: number; durationMs: number; easing: string }
  | { k: 'eyes'; target: string | null; power: number }
  | { k: 'confetti'; at: Anchor; count: number; colors: readonly string[]; angle: number; spread: number;
      power: number; gravity: number; drag: number; life: [number, number]; delayMs: number; recipe: typeof PARTICLES.confetti }
  | { k: 'stars'; at: Anchor; count: number; color: string; lifeMs: number; recipe: typeof PARTICLES.stars }
  | { k: 'ring'; at: Anchor; color: string; radius: number; lifeMs: number; recipe: typeof PARTICLES.ring }
  | { k: 'firework'; x: number; y: number; color: string; rocket: { fromX: number; fromY: number; durationMs: number; gravity: number };
      burst: { count: number; speed: [number, number]; gravity: number; drag: number; life: [number, number]; sound: 'boom'; recipe: typeof PARTICLES.firework } }
  | { k: 'reel'; cards: PromptView[]; durationMs: number; cardHeight: number; easing: 'quart-out'; tickAtMs: number[]; bulbsHoldMs: number }
  | { k: 'count'; target: 'intro' | 'brag'; text: string; color: string; fontSize?: number; top?: number; animation: Animation }
  | { k: 'feed'; team: TeamId; state: TvFeed['state']; label: string; thumbnail: boolean }
  | { k: 'find'; find: FindView; order: number }
  | { k: 'card-flip'; team: TeamId; animation: Animation }
  | { k: 'scan'; team: TeamId; beam: Animation; pixels: { size: number; jitter: number; intervalMs: number; durationMs: number; stopMs: number; hex: string } }
  | { k: 'meter'; team: TeamId; match: number; speedBonus: number; durationMs: number; easing: string; ticks: { probability: number; name: 'mtick' } }
  | { k: 'fly-points'; team: TeamId; pts: number; from: Anchor; to: Anchor; durationMs: number; delayMs: number;
      easing: string; trail: { intervalMs: number; startMs: number; lifeMs: number }; rollMs: number; recipe: typeof POINT_FLIGHT }
  | { k: 'sticker-flight'; team: TeamId; eyes: boolean; from: Anchor; to: Anchor; durationMs: number; easing: string; middle: { offset: number; distanceFraction: number; arc: number; scale: number; rotation: number }; end: { rotation: number; minScale: number; targetFill: number } }
  | { k: 'parade'; objects: { obj: string; travelDelayS: number; hopDelayS: number }[] }
  | { k: 'score'; team: TeamId; from: number; total: number; rollMs: number; leaders: TeamId[] }
  | { k: 'roll'; target: string; from: number; to: number; durationMs: number; easing: 'cubic-out'; tickMs: number; sound: 'rollTick' }
  | { k: 'match'; left: TeamId; right: TeamId; kicker: string; points: number; final: boolean; bye?: TeamId }
  | { k: 'mash'; p: number; taps: Record<TeamId, number>; seamPercent: number; leftScale: number; rightScale: number; elapsedMs: number }
  | { k: 'mash-tap'; team: TeamId; n: number; combo: number; side: -1 | 1; animation: Animation; starCount: number; sparkle: boolean }
  | { k: 'mash-spark'; at: Anchor; colors: string[]; lifeMs: number; velocityX: [number, number]; velocityY: [number, number]; gravity: number; drag: number; width: [number, number] }
  | { k: 'vote'; voter: TeamId; team: TeamId; durationMs: number; arc: number; middleScale: number; endScale: number; from: Anchor; to: Anchor }
  | { k: 'hologram'; team: TeamId; on: boolean }
  | { k: 'reaction'; team: TeamId | null; kind: Reaction; x: number; y: number; hype: number; lifeMs: number; velocityY: [number, number]; gravity: number; recipe: typeof PARTICLES.reaction }
  | { k: 'hype'; value: number }
  | { k: 'menu'; menu: TvMenu | null; focusColor: '#FFD43B' }
  | { k: 'pause'; paused: boolean; deadline?: number }
  | { k: 'settings'; sound: boolean; music: boolean; voice?: boolean }
  | { k: 'game-ended' }
  | { k: 'complete' };

export interface CueEvent { seq: number; at: number; round: number; cue: TvCue }
export interface TvFeed {
  team: TeamId;
  state: 'hunting' | 'locked' | 'snagged' | 'glowing' | 'ready' | 'missed';
  label: string;
  connected: boolean;
  /** Memory only. Render it; never serialize a snapshot to a log or a file. */
  jpeg?: Uint8Array;
  find?: FindView;
}
export interface JudgeCard { find: FindView; stage: 'back' | 'flip' | 'scan' | 'scored'; speedBonus: number }
export interface MatchView { left: TeamId; right: TeamId; kicker: string; points: number; final: boolean; p: number; taps: Record<TeamId, number>; lineSide?: -1 | 1; count?: string; winner?: TeamId; bye?: TeamId }
export interface PedestalView { find: FindView; visible: boolean; spotlight: number; voters: TeamId[] }
export type SceneContent =
  | { k: 'lobby'; code: string; joinUrl: string; copy: 'Two to four teams'; botsOn: boolean; parade: string[] }
  | { k: 'intro'; title: string; kicker: string; sub: string; kickerVisible: boolean; titleVisible: boolean; subVisible: boolean; reel?: PromptView[]; landed: boolean; count?: string }
  | { k: 'hunt'; glowing: boolean; snagOrder: TeamId[] }
  | { k: 'judge'; cards: JudgeCard[]; winner?: TeamId; banner?: string; crown: boolean }
  | { k: 'brag'; match: MatchView }
  | { k: 'show'; pedestals: PedestalView[]; voting: boolean; winner?: TeamId; holographic: boolean; crown: boolean }
  | { k: 'stand'; before: Record<TeamId, number>; previous: TeamId[]; ranking: TeamId[]; raced: boolean; reordered: boolean; leader?: TeamId; overtakes: TeamId[] }
  | { k: 'champ'; ranking: TeamId[]; podiums: number[]; badges: number[]; crown: boolean; name: boolean; trophy: boolean; fourth: boolean; object?: FindView; objectVisible: boolean; endShown: boolean };
export interface TvMenu { kind: 'pause' | 'lobby' | 'confirm-end'; options: string[]; focus: number }
export interface TvView {
  scene: Scene;
  phase: Phase;
  beatAt: number;
  round: number;
  /** Seat order. Lobby only: pad to four with joined:false neutral slots.
   * From the first title through the finale: joined teams only, including dropouts. */
  teams: TeamView[];
  hostClientId?: ClientId;
  prompt?: PromptView;
  deadline?: number;
  total?: number;
  feeds: TvFeed[];
  content: SceneContent;
  /** Declarative animation stacks, with frozen elapsed time. A late renderer evaluates
   * these states directly; it need not replay any previous cue events. */
  motion: Record<string, MotionState[]>;
  paused: boolean;
  menu: TvMenu | null;
  sound: boolean;
  music: boolean;
  /** Missing on older adapters means Polly voice on. Off uses reference blips. */
  voice?: boolean;
  musicMood: MusicMood;
  backgroundMood: Mood;
  hype: number;
  completed: boolean;
  host: { line?: HostLine; startedAt?: number; typing: boolean; visible: boolean; reaction: 'norm' | 'glee' | 'shock' };
  transition?: { from: Scene; to: Scene; swapAt: number; endsAt: number };
  /** No image bytes: finds only refer to relay memory by photoId or object art id. */
  history: FindView[];
}
export interface GameOptions {
  clock: Clock;
  rng: Rng;
  send: (clientId: ClientId, message: TvToPhone) => void;
  cue: (event: CueEvent) => void;
  view?: (snapshot: TvView) => void;
  room?: { code: string; joinUrl: string };
  /** Optional speech preparation; never awaits a network response or changes rules. */
  prefetchHost?: (line: HostLine) => void;
  /** Explicit, synthetic filming session. Omitted/false leaves live games unchanged. */
  showcase?: ShowcaseOptions | false;
}
