/**
 * Every number, token and word list the game shares, ported from the approved mockup
 * (reference/src/game.js and style.css). Change these only with a DECISIONS.md entry.
 */

/* ---------- design tokens (style.css :root) ---------- */
export const TOKENS = {
  cobalt: '#2B3BFF',
  ink: '#0E0B2B',
  paper: '#FFF8EC',
  yolk: '#FFD43B',
  bubble: '#FF4FA0',
  lime: '#B8F23B',
  red: '#F23B2E',
  night: '#0A0E4A',
} as const;

/** Team badge colors. Phones take the first 4, bots the last 3. */
export const TEAM_COLORS = ['#FF4FA0', '#8B5CFF', '#FFD43B', '#F23B2E', '#FF7A1F', '#B8F23B', '#3FE0D0'] as const;
export const PHONE_COLORS = TEAM_COLORS.slice(0, 4);
/** Badge colors dark enough to need light (paper) text. */
export const DARK_COLORS: ReadonlySet<string> = new Set(['#8B5CFF', '#F23B2E']);
export const CONFETTI = ['#FFD43B', '#FF4FA0', '#3FE0D0', '#B8F23B', '#FF7A1F', '#FFF8EC', '#8B5CFF'] as const;

/* ---------- the stage ---------- */
export const STAGE_W = 1280;
export const STAGE_H = 720;
/** Floor horizon on the 1280x720 stage. */
export const HORIZON_Y = 496;

export type Mood = 'normal' | 'urgent' | 'tension' | 'party' | 'gold';
export const BG_PALETTES: Record<Mood, { base: RGB; ray: RGB; glow: RGB }> = {
  normal: { base: [43, 59, 255], ray: [58, 76, 255], glow: [110, 124, 255] },
  urgent: { base: [232, 40, 104], ray: [255, 72, 132], glow: [255, 140, 180] },
  tension: { base: [26, 32, 150], ray: [36, 46, 178], glow: [80, 90, 220] },
  party: { base: [139, 92, 255], ray: [160, 120, 255], glow: [255, 150, 220] },
  gold: { base: [240, 150, 20], ray: [255, 184, 40], glow: [255, 230, 140] },
};
/** Spotlight intensity per mood; the third (center) spotlight shows only when >= .95. */
export const BG_SPOT: Record<Mood, number> = { normal: 0.55, urgent: 0.85, tension: 0.8, party: 1, gold: 1.2 };
/** Sunburst rotation speed (rad/s) per mood. */
export const BG_RAY_SPEED = { urgent: 0.22, party: 0.12, gold: 0.12, default: 0.035 } as const;
export type RGB = [number, number, number];

/* ---------- motion ---------- */
/** Spring presets: [stiffness, damping], unit mass. */
export const SPRINGS = {
  pop: [320, 15],
  soft: [150, 18],
  wobble: [260, 8],
  drop: [200, 12],
  snap: [600, 28],
} as const;
export type SpringName = keyof typeof SPRINGS;
export const MAX_PARTICLES = 300;

/* ---------- music ---------- */
/** Six music moods (the brief says five; the mockup has six). */
export const MUSIC_BPM = { lobby: 102, hunt: 124, urgent: 140, tension: 90, brag: 116, win: 122 } as const;
export type MusicMood = keyof typeof MUSIC_BPM | 'off';

/* ---------- timing (seconds unless named _MS) ---------- */
export const TIMING = {
  START_HOLD_MS: 850,
  REEL_SPIN_MS: 2400,
  REEL_CARDS: 16,
  COUNTDOWN_STEP_MS: 760,
  HUNT_S: 35,
  /** The hunt ends this long after every team has snagged. */
  HUNT_ALL_SNAGGED_GRACE_MS: 1300,
  /** Last-seconds urgency (music, background, red timer). */
  URGENT_S: 10,
  GLOW_S: 15,
  BRAG_LINE_MS: 1500,
  MASH_COUNT_STEP_MS: 560,
  MASH_MS: 6000,
  TAP_SEND_MS: 100,
  VOTE_S: 10,
  WIPE_MS: 1000,
  POINTS_FLY_MS: 1300,
  THUMB_W: 96,
  THUMB_H: 64,
  THUMB_FPS: 3,
  SNAG_PX: 720,
  SNAG_JPEG_Q: 0.8,
  AI_TIMEOUT_MS: 4000,
  /** A phone that has not reconnected by then plays on as a disconnected team. */
  RECONNECT_GRACE_S: 60,
} as const;

/* ---------- scoring ---------- */
export const SCORING = {
  /** Color Rush: match % plus a speed bonus by snag order. */
  SPEED_BONUS: [30, 20, 10, 0],
  MATCH_MIN: 2,
  MATCH_MAX: 99,
  DELTA_E_SCALE: 1.05,
  BRAG_SEMI_WIN: 100,
  BRAG_FINAL_WIN: 150,
  SHOW_PER_VOTE: 100,
  SHOW_MOST_VOTED: 100,
  /** Fallback AI fit score when Bedrock times out. */
  AI_FALLBACK_SCORE: 5,
} as const;

/* ---------- teams ---------- */
export const MIN_TEAMS = 2;
export const MAX_TEAMS = 4;
export interface BotDef { id: string; name: string; mono: string; color: string }
export const BOTS: readonly BotDef[] = [
  { id: 'cp', name: 'Couch Potatoes', mono: 'CP', color: '#FF7A1F' },
  { id: 'jd', name: 'Junk Drawer Gang', mono: 'JD', color: '#B8F23B' },
  { id: 'gr', name: "Grandma's Revenge", mono: 'GR', color: '#3FE0D0' },
];
export const TEAM_NAMES = ['Sock Goblins', 'The Snaggletooths', 'Couch Commandos', 'Fridge Raiders', 'Lost Remote Club', 'Team Doohickey', 'The Junk Monks', 'Crumb Bums', 'The Dust Bunnies', 'Captain Clutter', 'Pillow Fort Inc', 'The Thingamajigs', 'Basement Bandits', 'Chaos Gremlins'] as const;
export const TEAM_NAME_MAX = 20;

/* ---------- rounds and prompts ---------- */
export type RoundKind = 'color' | 'brag' | 'show';
export const ROUNDS = [
  { kind: 'color', name: 'COLOR RUSH', nice: 'Color Rush', kicker: 'ROUND 1 OF 3', sub: 'The Pixel Judge scores the closest color. Fastest snag earns a bonus.' },
  { kind: 'brag', name: 'BRAG-OFF', nice: 'Brag-Off', kicker: 'ROUND 2 OF 3', sub: 'Head to head. Everyone mashes their phone to swing the vote.' },
  { kind: 'show', name: 'SHOWSTOPPER', nice: 'Showstopper', kicker: 'FINAL ROUND', sub: 'Double points. Everyone votes. The best find goes holographic.' },
] as const satisfies readonly { kind: RoundKind; name: string; nice: string; kicker: string; sub: string }[];

export interface ColorPrompt { kind: 'color'; k: string; hex: string }
export interface TraitPrompt { kind: 'brag' | 'show'; t: string; a: string; b: string; c: string; col: string; ic: string }
export type Prompt = ColorPrompt | TraitPrompt;

export const COLORS: readonly { k: string; hex: string }[] = [
  { k: 'RED', hex: '#F23B2E' }, { k: 'BLUE', hex: '#2E5BFF' }, { k: 'YELLOW', hex: '#FFD43B' },
  { k: 'GREEN', hex: '#3BB54A' }, { k: 'PINK', hex: '#FF6FB5' }, { k: 'ORANGE', hex: '#FF7A1F' },
];
export const BRAGP: readonly Omit<TraitPrompt, 'kind'>[] = [
  { t: 'loot', a: 'Something a', b: 'PIRATE', c: 'would steal', col: '#FFD43B', ic: 'crown' },
  { t: 'old', a: 'Something that has', b: 'SEEN THINGS', c: '(the older the better)', col: '#3FE0D0', ic: 'portrait' },
  { t: 'tough', a: 'Something that would', b: 'WIN A FIGHT', c: 'against anything', col: '#FF7A1F', ic: 'pan' },
  { t: 'isle', a: 'Your', b: 'ISLAND BUDDY', c: 'for a desert island', col: '#B8F23B', ic: 'teddy' },
];
export const SHOWP: readonly Omit<TraitPrompt, 'kind'>[] = [
  { t: 'weird', a: 'The', b: 'WEIRDEST', c: 'thing you can find', col: '#FF4FA0', ic: 'sock' },
  { t: 'museum', a: 'Something that belongs', b: 'IN A MUSEUM', c: 'priceless, obviously', col: '#FFD43B', ic: 'record' },
];

/** The three lines of a prompt card. */
export function promptParts(p: Prompt): { a: string; b: string; c: string; col: string } {
  if (p.kind === 'color') return { a: 'Snag the most', b: p.k, c: 'thing in the house', col: p.hex };
  return { a: p.a, b: p.b, c: p.c, col: p.col };
}
export function promptText(p: Prompt): string {
  const q = promptParts(p);
  return `${q.a} ${q.b} ${q.c}`;
}

const knownPromptTexts: ReadonlySet<string> = new Set([
  ...COLORS.map((p) => promptText({ ...p, kind: 'color' })),
  ...BRAGP.map((p) => promptText({ ...p, kind: 'brag' })),
  ...SHOWP.map((p) => promptText({ ...p, kind: 'show' })),
]);

/** Only exact canonical prompt copy is trusted; no trimming or fuzzy matches. */
export function isKnownPromptText(text: string): boolean {
  return knownPromptTexts.has(text);
}

/* ---------- fallback copy (used when the AI is slow or down) ---------- */
export const GEN_NAMES = ['Exhibit A', 'The Thingamajig', 'Lil Doohickey', 'Sir Whatsit', 'The Gizmo', 'Captain Unknown', 'Mystery Guest', 'Big Deal', 'The Contraption', 'Lady Knickknack'] as const;
export const NAME_PREFIXES = ['Sir', 'Dame', 'Captain', 'Lil', 'Big', 'Professor', 'Lady', 'Duke', 'Agent', 'Coach', 'Auntie', 'DJ'] as const;
export const NAME_SUFFIXES = ['Supreme', 'the Great', 'Jr.', 'Deluxe', 'Prime'] as const;
export const NAME_SILLY = ['Wiggles', 'Sparkles', 'McFancy', 'Bonanza', 'Thunder'] as const;
export const GEN_BRAGS = ['Found it in under 30 seconds. Legend.', 'Nobody asked for this. Everybody needed it.', 'Has more personality than the fridge.', 'Ten out of ten. No notes.', 'Born for this exact moment.', 'Was here before you moved in.'] as const;
export const TICKER = ['LOCAL REMOTE FOUND INSIDE FRIDGE, REFUSES TO EXPLAIN', 'DRYER DENIES ALL KNOWLEDGE OF MISSING SOCK', 'BANANA ENTERS FINAL STAGE OF RIPENESS', 'CAT KNOCKS PRIZE MUG OFF TABLE, SHOWS NO REMORSE', 'JUNK DRAWER ANNEXES SECOND DRAWER', 'TEDDY BEAR CELEBRATES 30 YEARS OF HUGS', 'LAVA LAMP STILL BUBBLING, SCIENTISTS BAFFLED', 'GRANDPA PORTRAIT SPOTTED JUDGING DINNER GUESTS'] as const;

export const REACTIONS = ['star', 'heart', 'flame', 'tomato'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REACTION_COLORS: Record<Reaction, string> = { star: '#FFD43B', heart: '#FF4FA0', flame: '#FF7A1F', tomato: '#F23B2E' };

/** Monogram for a team badge: initials of the first two words that are not "the/of/and/a". */
export function monoOf(name: string): string {
  const w = name.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).filter((x) => x && !/^(the|of|and|a)$/i.test(x));
  if (!w.length) return 'ME';
  const first = w[0]!;
  return (w.length > 1 ? first[0]! + w[1]![0]! : first.slice(0, 2)).toUpperCase();
}
