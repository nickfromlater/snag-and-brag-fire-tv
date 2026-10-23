import { z } from 'zod';
import type { BinaryHeader, ClientToRelay, PhoneToTv, TvToPhone } from '@snag/shared';
import { isJudgeMask } from '@snag/shared';
import { LIMITS } from './config.js';

export const roomCode = /^[BCDFGHJKLMNPQRSTVWXYZ]{4}$/;
export const key = /^[a-f0-9]{32}$/i;
const cid = z.string().length(32).regex(key);
const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/).refine((s) => s.trim() === s);
const text = (max: number) => z.string().max(max).refine((s) => !s.includes('\0'));
const hex = z.string().length(7).regex(/^#[a-f0-9]{6}$/i);
const integer = (min = 0, max = Number.MAX_SAFE_INTEGER) => z.number().int().min(min).max(max);
const kind = z.enum(['color', 'brag', 'show']);
// Invalid optional masks are dropped without rejecting an otherwise valid snag.
const mask = z.unknown().transform(value => isJudgeMask(value) ? value : undefined).optional();
const point = z.tuple([z.number().min(0).max(120), z.number().min(0).max(120)]);
const eyes = z.tuple([point, point]);
const team = z.strictObject({
  id, name: text(64), mono: text(8), color: hex, score: integer(), bot: z.boolean(), connected: z.boolean(), joined: z.boolean().optional(),
});
const prompt = z.strictObject({ kind, a: text(256), b: text(256), c: text(256), col: hex, hex: hex.optional() });
const find = z.strictObject({
  team: id, round: integer(0, 2), photoId: id.optional(), obj: id.optional(), name: text(128),
  brag: text(256), thing: text(128), eyes: z.tuple([point, point, z.number().positive().max(60)]).optional(),
  hex: hex.optional(), match: integer(0, 99).optional(), time: z.number().min(0).max(10800).optional(),
  pts: integer().optional(), missed: z.boolean().optional(), mask,
});
const fighter = z.strictObject({ team, find, side: z.union([z.literal(-1), z.literal(1)]) });
const screen = z.discriminatedUnion('k', [
  z.strictObject({ k: z.literal('join'), takenColors: z.array(hex).max(8), suggestedName: text(64), full: z.boolean() }),
  z.strictObject({ k: z.literal('lobby'), isHost: z.boolean(), canStart: z.boolean(), botsOn: z.boolean(), minTeams: integer(1, 8) }),
  z.strictObject({ k: z.literal('ready'), kicker: text(128), title: text(128), sub: text(512), prompt: prompt.optional(), count: z.enum(['3', '2', '1', 'GO!']).optional() }),
  z.strictObject({ k: z.literal('cam') }),
  z.strictObject({ k: z.literal('glow'), find, names: z.array(text(128)).max(10), brags: z.array(text(256)).max(10), aiPending: z.boolean() }),
  z.strictObject({ k: z.literal('wait'), msg: text(512), sub: text(512).optional(), card: find.optional() }),
  z.strictObject({ k: z.literal('mash'), kicker: text(128), youIn: z.boolean(), left: fighter, right: fighter, phase: z.enum(['ready', 'mash', 'done']), head: text(256).optional(), sub: text(512).optional() }),
  z.strictObject({ k: z.literal('vote'), options: z.array(find).max(8), voted: id.optional() }),
  z.strictObject({ k: z.literal('end'), rank: integer(1, 8), line: text(512), best: find.optional(), rows: z.array(z.strictObject({ round: integer(0, 2), name: text(128), sub: text(256), pts: integer() })).max(3), isHost: z.boolean() }),
]);

export const phoneMessage: z.ZodType<PhoneToTv> = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('join'), name: text(20).refine((s) => s.trim().length > 0), color: hex }),
  z.strictObject({ t: z.literal('start') }),
  z.strictObject({ t: z.literal('bots'), on: z.boolean() }),
  z.strictObject({ t: z.literal('glow'), eyes, name: text(128), brag: text(256) }),
  z.strictObject({ t: z.literal('tap'), n: integer(0, 1000), side: z.union([z.literal(-1), z.literal(1)]) }),
  z.strictObject({ t: z.literal('vote'), team: id }),
  z.strictObject({ t: z.literal('react'), kind: z.enum(['star', 'heart', 'flame', 'tomato']) }),
  z.strictObject({ t: z.literal('control'), action: z.enum(['skip', 'pause', 'resume', 'end']) }),
  z.strictObject({ t: z.literal('again') }),
]);
export const tvMessage: z.ZodType<TvToPhone> = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('screen'), seq: integer(), me: team.nullable(), teams: z.array(team).max(8), round: integer(-1, 3), prompt: prompt.optional(), deadline: integer().optional(), total: z.number().min(0).max(10800000).optional(), paused: z.boolean(), s: screen }),
  z.strictObject({ t: z.literal('toast'), text: text(512), color: hex }),
  z.strictObject({ t: z.literal('award'), pts: integer(), total: integer() }),
  z.strictObject({ t: z.literal('mashp'), p: z.number().min(-1).max(1) }),
]);

// 'hello' is discriminated by role as well as t, so use a union for the envelope.
export const clientMessage: z.ZodType<ClientToRelay> = z.union([
  z.strictObject({ t: z.literal('hello'), proto: integer(), role: z.literal('tv'), resume: z.strictObject({ code: z.string().length(4).regex(roomCode), tvKey: z.string().length(32).regex(key) }).optional() }),
  z.strictObject({ t: z.literal('hello'), proto: integer(), role: z.literal('phone'), code: z.string().length(4).regex(roomCode), cid }),
  z.strictObject({ t: z.literal('ping'), c: z.number() }),
  z.strictObject({ t: z.literal('to'), to: z.union([z.literal('all'), z.array(cid).max(8)]), m: tvMessage }),
  z.strictObject({ t: z.literal('msg'), m: phoneMessage }),
  z.strictObject({ t: z.literal('tts'), id, text: text(LIMITS.ttsTextChars).refine((s) => s.trim().length > 0) }),
  z.strictObject({ t: z.literal('close') }),
]);

export const binaryHeader: z.ZodType<BinaryHeader> = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('thumb'), cid: cid.optional() }),
  // decodeBinary caps the whole header at 4 KiB. Any string, including empty or
  // injected copy, reaches AI prompt selection and receives a generic safe read.
  z.strictObject({ t: z.literal('snag'), round: integer(0, 2), hex, match: integer(0, 99), prompt: z.string(), roundKind: kind, mask, redaction: z.enum(['mediapipe', 'shape', 'none']).optional() }),
]);

/** Sliding one-second window, including rejected junk in the general socket cap. */
export class RateWindow {
  private times: number[] = [];
  constructor(private readonly cap: number) {}
  take(now: number): boolean {
    while (this.times.length && this.times[0]! <= now - 1000) this.times.shift();
    if (this.times.length >= this.cap) return false;
    this.times.push(now);
    return true;
  }
}
