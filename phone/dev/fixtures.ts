import { BOTS, GEN_BRAGS, ROUNDS, TOKENS } from '@snag/shared';
import type { FindView, Screen, ScreenMsg, TeamView } from '@snag/shared';
import { OBJI } from '../src/art';

export const SCREEN_KEYS = ['join', 'lobby', 'ready', 'cam', 'glow', 'wait', 'mash', 'vote', 'end'] as const;
export const FIXTURE_LABELS = ['Join', 'Lobby', 'Round intro', 'Camera', 'Glow up', 'Wait & reactions', 'Mash', 'Vote', 'End card'];
export const teams: TeamView[] = [
  { id: 'you', name: 'Sock Goblins', mono: 'SG', color: TOKENS.bubble, score: 0, bot: false, connected: true },
  ...BOTS.map((t) => ({ ...t, score: 0, bot: true, connected: true })),
];
export function botFind(obj: string, team: string, round = 0): FindView {
  const spec = OBJI[obj]!;
  return { team, round, obj, name: spec.names[0]!, brag: spec.brags[0]!, thing: spec.nm, eyes: spec.eyes, hex: spec.col, match: 80, time: 8, pts: round === 1 ? 100 : 40 };
}
export function fixture(key: Screen['k'], now: number): ScreenMsg {
  const record = botFind('record', 'you');
  let round = 0, score = 0;
  let s: Screen;
  switch (key) {
    case 'join': round = -1; s = { k: key, takenColors: [], suggestedName: 'Sock Goblins', full: false }; break;
    case 'lobby': round = -1; s = { k: key, isHost: true, canStart: true, botsOn: true, minTeams: 2 }; break;
    case 'ready': s = { k: key, kicker: 'ROUND 1 OF 3', title: 'Color Rush', sub: ROUNDS[0].sub }; break;
    case 'cam': s = { k: key }; break;
    case 'glow': s = { k: key, find: record, names: OBJI.record!.names, brags: [...OBJI.record!.brags, GEN_BRAGS[3]!], aiPending: false }; break;
    case 'wait': s = { k: key, msg: 'Sent! Watch the TV.', card: record }; break;
    case 'mash': round = 1; score = 40; s = { k: key, kicker: 'SEMI-FINAL 1 OF 2', youIn: true, left: { team: teams[0]!, find: record, side: -1 }, right: { team: teams[2]!, find: { ...botFind('pan', 'jd', 1), name: 'Sir Sizzle' }, side: 1 }, phase: 'mash', sub: 'DJ Spin is pulling ahead' }; break;
    case 'vote': round = 2; score = 140; s = { k: key, options: [record, { ...botFind('sock', 'cp', 2), brag: 'Smells like victory. Mostly.' }, { ...botFind('lava', 'jd', 2), name: 'The Blobfather' }, { ...botFind('duck', 'gr', 2), name: 'Sir Floatsalot', brag: 'Squeaks once. Room goes silent.' }] }; break;
    case 'end': round = 3; score = 140; s = { k: key, rank: 3, line: 'The couch remembers. Run it back.', best: { ...record, round: 1, pts: 100 }, rows: ROUNDS.map((r, i) => ({ round: i, name: 'DJ Spin', sub: `${r.nice} · Vinyl record`, pts: [40, 100, 0][i]! })), isHost: true }; break;
  }
  const roster = teams.map((t, i) => ({ ...t, score: i === 0 ? score : 0 }));
  return { t: 'screen', seq: 1, me: key === 'join' ? null : roster[0]!, teams: key === 'join' ? [] : roster, round, prompt: { kind: 'color', a: 'Snag the most', b: 'PINK', c: 'thing in the house', col: '#FF6FB5', hex: '#FF6FB5' }, deadline: now + (key === 'cam' ? 29000 : key === 'glow' ? 26000 : key === 'mash' ? 6000 : 10000), total: key === 'cam' ? 35000 : 35000, paused: false, s };
}

/** Entirely synthetic scene: generated in memory, never a player image. */
export function syntheticScene(): string {
  const c = document.createElement('canvas'); c.width = 480; c.height = 720; const x = c.getContext('2d')!;
  x.fillStyle = '#F2B6B4'; x.fillRect(0, 0, 480, 720);
  x.fillStyle = '#234D68'; x.fillRect(0, 400, 480, 320);
  x.fillStyle = '#FF6FB5'; x.fillRect(80, 170, 290, 380);
  x.fillStyle = '#BB3879'; x.fillRect(110, 500, 260, 50);
  x.lineWidth = 24; x.strokeStyle = '#FF6FB5'; x.beginPath(); x.arc(375, 320, 68, -Math.PI / 2, Math.PI / 2); x.stroke();
  x.fillStyle = '#FFF8EC'; x.fillRect(105, 190, 35, 180);
  return c.toDataURL('image/png');
}
