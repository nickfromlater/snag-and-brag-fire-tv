import { describe, expect, it } from 'vitest';
import type { PhoneToTv, ScreenMsg } from '@snag/shared';
import { ReactionThrottle, TapBatcher, centerCrop, clientId, fmt, inAppBrowser, photoEndpoint, reconnectDelay, reduceScreen, relayUrl, roomCode, timer } from '../src/logic';

const screen = (seq: number): ScreenMsg => ({ t: 'screen', seq, round: 0, me: null, teams: [], paused: false, deadline: 36000, total: 35000, s: { k: 'cam' } });
describe('authoritative screens', () => {
  it('takes the initial screen and strictly newer screens', () => { const a = screen(1), b = screen(2); expect(reduceScreen(null, a)).toBe(a); expect(reduceScreen(a, b)).toBe(b); });
  it('drops stale and idempotent reconnect snapshots, preserving local choices', () => { const current = screen(8); expect(reduceScreen(current, screen(7))).toBe(current); expect(reduceScreen(current, screen(8))).toBe(current); });
  it('renders a relay-clock deadline and clamps expired timers', () => { expect(timer(screen(1), 1000)).toEqual({ remaining: 35000, fraction: 1 }); expect(timer(screen(1), 18500)).toEqual({ remaining: 17500, fraction: .5 }); expect(timer(screen(1), 99999)).toEqual({ remaining: 0, fraction: 0 }); expect(fmt(10001)).toBe('0:11'); expect(fmt(60000)).toBe('1:00'); });
});
describe('input batching and throttles', () => {
  it('keeps each side’s unsigned count when a spectator alternates sides', () => { const sent: PhoneToTv[] = [], taps = new TapBatcher((m) => sent.push(m)); taps.tap(-1); taps.tap(1); taps.tap(-1); expect(sent).toEqual([]); taps.flush(); taps.flush(); expect(sent).toEqual([{ t: 'tap', n: 2, side: -1 }, { t: 'tap', n: 1, side: 1 }]); });
  it('drops pending taps when a phase ends or the phone sleeps', () => { const sent: PhoneToTv[] = [], taps = new TapBatcher((m) => sent.push(m)); taps.tap(1); taps.clear(); taps.flush(); expect(sent).toEqual([]); });
  it('allows six reactions in a sliding second, including a second boundary', () => { const throttle = new ReactionThrottle(); for (let i = 0; i < 6; i++) expect(throttle.allow(990 + i)).toBe(true); expect(throttle.allow(1001)).toBe(false); expect(throttle.allow(1989)).toBe(false); expect(throttle.allow(1990)).toBe(true); });
});
describe('capture math', () => {
  it.each([[1920, 1080, 420, 0, 1080], [1080, 1920, 0, 420, 1080], [720, 720, 0, 0, 720]])('center-squares %i × %i without a stretch', (w, h, x, y, size) => { expect(centerCrop(w, h)).toEqual({ x, y, w: size, h: size }); });
  it('crops a 3:2 preview thumbnail separately from the square snag', () => { expect(centerCrop(1920, 1080, 1.5)).toEqual({ x: 150, y: 0, w: 1620, h: 1080 }); });
  it('rejects zero-size camera frames', () => { expect(() => centerCrop(0, 720)).toThrow(); });
});
describe('joining and reconnecting', () => {
  it('backs off from 250 ms to a 2 s cap', () => { expect([0, 1, 2, 3, 4, 100].map(reconnectDelay)).toEqual([250, 500, 1000, 2000, 2000, 2000]); });
  it('keeps a random 128-bit client id per room and tolerates disabled storage', () => {
    const values = new Map<string, string>(), storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const id = clientId('ABCD', storage); expect(id).toMatch(/^[a-f0-9]{32}$/); expect(clientId('ABCD', storage)).toBe(id); expect(clientId('EFGH', storage)).not.toBe(id);
    expect(clientId('ABCD', { getItem: () => { throw new Error(); }, setItem: () => { throw new Error(); } })).toMatch(/^[a-f0-9]{32}$/);
    expect([...values.keys()]).toEqual(['snag:cid:ABCD', 'snag:cid:EFGH']);
  });
  it('normalizes four letters and rejects digits, too-long and partial codes', () => { expect(roomCode(' abcd ')).toBe('ABCD'); for (const value of ['AB', 'ABCDE', 'K7QF', '<img>']) expect(roomCode(value)).toBeNull(); });
  it('uses the same-origin ws endpoint, or the full dev override', () => { expect(relayUrl(null, { protocol: 'https:', host: 'example.test' })).toBe('wss://example.test/ws'); expect(relayUrl('ws://localhost:8000/relay', { protocol: 'http:', host: 'localhost:5173' })).toBe('ws://localhost:8000/relay'); expect(() => relayUrl('https://example.test', { protocol: 'https:', host: 'example.test' })).toThrow(); });
  it('uses the relay photo origin and escapes identifiers and the room read key', () => { expect(photoEndpoint('wss://relay.test/ws', 'ABCD', 'id/2', 'a+b')).toBe('https://relay.test/p/ABCD/id%2F2?k=a%2Bb'); });
  it('detects camera-hostile embedded browsers without flagging Safari/Chrome', () => { for (const agent of ['Instagram 900', 'FBAV/99', 'Messenger', 'Android; wv', 'Line/1']) expect(inAppBrowser(agent)).toBe(true); expect(inAppBrowser('Mozilla/5.0 iPhone Safari/605.1')).toBe(false); expect(inAppBrowser('Chrome/141 Safari/537')).toBe(false); });
});
