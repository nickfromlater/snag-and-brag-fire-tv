import { afterEach, describe, expect, it, vi } from 'vitest';
import jpeg from 'jpeg-js';
import { WebSocketServer } from 'ws';
import { PROTO, decodeBinary, encodeBinary, isJudgeMask } from '@snag/shared';
import type { ClientToRelay, Clock, RelayToClient, TvView } from '@snag/shared';
import { SimulatorClock } from '../src/clock';
import { startDemoPhone } from '../src/demo';
import { LoopbackRelay } from '../src/loopback';
import { TvSimulator } from '../src/simulator';
import { connectWebSocket } from '../src/websocket';

const realClock: Clock = { now: () => Date.now(), setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: h => clearTimeout(h as ReturnType<typeof setTimeout>) };
afterEach(() => vi.useRealTimers());

describe('stand-in TV', () => {
  it('maps fast-mode phone deadlines and durations to the actual relay clock', () => {
    let local = 1000;
    const clock = new SimulatorClock(2000, 10, () => local);
    expect(clock.now()).toBe(2000); local += 1000; expect(clock.now()).toBe(12_000);
    const screen = clock.phone({ t: 'screen', seq: 1, me: null, teams: [], round: 0, paused: false, deadline: 22_000, total: 10_000, s: { k: 'cam' } });
    expect(screen.t === 'screen' && screen.deadline).toBe(4000); expect(screen.t === 'screen' && screen.total).toBe(1000);
    expect(clock.fromRelay(clock.toRelay(42_000))).toBe(42_000);
  });
  it.each([1, 10])('sends integer deadlines after fractional clock sync at %ix speed', speed => {
    let local = 1000;
    const clock = new SimulatorClock(2000, speed, () => local);
    local++; clock.pong(1000, 2000); // 1ms RTT gives a fractional offset.
    const deadline = clock.now() + 12_344;
    const screen = clock.phone({ t: 'screen', seq: 1, me: null, teams: [], round: 0, paused: false, deadline, total: 12_344, s: { k: 'cam' } });
    expect(screen.t === 'screen' && screen.deadline).toBe(Math.round(clock.toRelay(deadline)));
    expect(screen.t === 'screen' && Number.isInteger(screen.deadline)).toBe(true);
    expect(screen.t === 'screen' && Math.abs(screen.deadline! - clock.toRelay(deadline))).toBeLessThanOrEqual(.5);
  });
  it('runs a full fast game through protocol envelopes and memory JPEGs, releasing the room', () => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    const relay = new LoopbackRelay(realClock, 400), logs: string[] = [];
    let demo: ReturnType<typeof startDemoPhone> | undefined, final: TvView | undefined, photos = 0;
    const simulator = new TvSimulator({ bots: true, fast: true, log: l => logs.push(l),
      onReady: () => { demo = startDemoPhone(relay, simulator.clock!); },
      onComplete: () => { final = simulator.game!.getView(); photos = relay.photoCount; demo?.stop(); simulator.stop(); },
    });
    simulator.attach(relay.connect(m => simulator.receive(m), bytes => simulator.binary(bytes)));
    for (let i = 0; i < 20_000 && !final; i++) vi.advanceTimersToNextTimer();
    expect(final?.completed).toBe(true); expect(final?.history).toHaveLength(12); expect(photos).toBe(3); expect(relay.photoCount).toBe(0);
    expect(final?.teams.reduce((n, t) => n + t.score, 0)).toBe(final?.history.reduce((n, f) => n + f.pts!, 0));
    expect(logs.some(l => l.includes('Room LOOP · Join loopback://LOOP'))).toBe(true);
    expect(logs.some(l => l.includes('complete: three rounds finished'))).toBe(true);
    const color = final!.history.find(f => f.photoId && f.round === 0)!;
    expect(isJudgeMask(color.mask)).toBe(true);
    expect(final!.history.filter(f => f.obj || f.round > 0).every(f => !('mask' in f))).toBe(true);
    expect(logs.some(l => l.includes('mask=24x24 bytes=72 onCells=64 valid=true'))).toBe(true);
    expect(logs.join('\n')).not.toContain(color.mask);
    expect(logs).toContain('HUD lobby joined=0 slots=4 bots=0 placeholderMonograms=0');
    expect(logs).toContain('HUD lobby joined=1 slots=4 bots=0 placeholderMonograms=0');
    expect(logs).toContain('HUD game joined=4 slots=4 bots=3 placeholderMonograms=0');
    expect(logs.join('\n')).not.toMatch(/memory-only-(tv|read)-key|data:image|base64|jpeg|"payload"/);
    expect(vi.getTimerCount()).toBe(0);
  });
  it('loopback relays thumbnails in memory and only photo metadata to the TV', () => {
    vi.useFakeTimers();
    const relay = new LoopbackRelay(realClock), tvMessages: RelayToClient[] = [], tvBinary: Uint8Array[] = [];
    const tv = relay.connect(m => tvMessages.push(m), b => tvBinary.push(b)); tv.send({ t: 'hello', proto: PROTO, role: 'tv' });
    const phone = relay.connect(() => {}); phone.send({ t: 'hello', proto: PROTO, role: 'phone', cid: 'synthetic-client', code: 'LOOP' });
    const image = jpeg.encode({ data: Buffer.from([255, 0, 0, 255]), width: 1, height: 1 }, 80).data;
    phone.sendBinary!(encodeBinary({ t: 'thumb' }, image)); expect(decodeBinary(tvBinary[0]!)?.header).toEqual({ t: 'thumb', cid: 'synthetic-client' });
    phone.sendBinary!(encodeBinary({ t: 'snag', round: 0, hex: '#ff0000', match: 99, prompt: 'RED', roundKind: 'color' }, image));
    expect(relay.photoCount).toBe(1); const snag = tvMessages.find(m => m.t === 'from' && m.m.t === 'snag')!;
    expect(JSON.stringify(snag)).not.toContain('payload'); expect(JSON.stringify(snag)).not.toContain('base64');
    vi.advanceTimersByTime(4000); expect(tvMessages.some(m => m.t === 'ai' && m.r.fallback)).toBe(true);
    tv.send({ t: 'close' }); expect(relay.photoCount).toBe(0); expect(vi.getTimerCount()).toBe(0);
  });
  it.each([2, 3])('reports only %i joined HUD slots throughout a game transcript', count => {
    vi.useFakeTimers(); vi.setSystemTime(1_000_000);
    const relay = new LoopbackRelay(realClock), logs: string[] = [];
    const simulator = new TvSimulator({ log: l => logs.push(l) });
    simulator.attach(relay.connect(m => simulator.receive(m)));
    const phones = Array.from({ length: count }, (_, i) => {
      const phone = relay.connect(() => {});
      phone.send({ t: 'hello', proto: PROTO, role: 'phone', code: 'LOOP', cid: 'phone-' + i });
      phone.send({ t: 'msg', m: { t: 'join', name: 'Team ' + i, color: ['#FF4FA0', '#8B5CFF', '#FFD43B'][i]! } });
      return phone;
    });
    phones[0]!.send({ t: 'msg', m: { t: 'start' } });
    for (let i = 0; i < 200 && !simulator.game!.getView().completed; i++) {
      expect(simulator.game!.getView().teams).toHaveLength(count);
      simulator.remote('ff'); vi.advanceTimersByTime(2000);
    }
    expect(simulator.game!.getView().completed).toBe(true);
    expect(logs.filter(l => l.startsWith('HUD game'))).toEqual([`HUD game joined=${count} slots=${count} bots=0 placeholderMonograms=0`]);
    for (const phone of phones) phone.close();
    simulator.stop(); relay.close(); expect(vi.getTimerCount()).toBe(0);
  });
  it('connects over real ws, sends hello as the TV, and addresses a phone screen', async () => {
    const server = new WebSocketServer({ port: 0, host: '127.0.0.1' });
    await new Promise<void>((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('No test socket');
    const frames: ClientToRelay[] = [], logs: string[] = [];
    let resolveLobby: () => void = () => {};
    const lobby = new Promise<void>(resolve => { resolveLobby = resolve; });
    server.on('connection', ws => ws.on('message', bytes => {
      const frame = JSON.parse(bytes.toString()) as ClientToRelay; frames.push(frame);
      if (frame.t === 'hello') {
        ws.send(JSON.stringify({ t: 'welcome', role: 'tv', code: 'TEST', tvKey: 'synthetic-tv-key', roomKey: 'synthetic-read-key', joinUrl: 'http://localhost/?r=TEST', serverNow: Date.now() }));
        ws.send(JSON.stringify({ t: 'peer', cid: 'phone', up: true }));
        ws.send(JSON.stringify({ t: 'from', cid: 'phone', at: Date.now(), m: { t: 'join', name: 'Test Team', color: '#FF4FA0' } }));
      }
      if (frame.t === 'ping') ws.send(JSON.stringify({ t: 'pong', c: frame.c, s: Date.now() }));
      if (frame.t === 'to' && frame.m.t === 'screen' && frame.m.s.k === 'lobby') resolveLobby();
    }));
    const simulator = new TvSimulator({ log: l => logs.push(l) });
    const socket = connectWebSocket(simulator, 'ws://127.0.0.1:' + address.port, () => {}, () => {});
    try {
      await lobby;
      expect(frames[0]).toMatchObject({ t: 'hello', role: 'tv', proto: PROTO });
      expect(frames.some(m => m.t === 'to' && m.to[0] === 'phone' && m.m.t === 'screen' && m.m.s.k === 'lobby')).toBe(true);
      expect(logs[0]).toBe('Room TEST · Join http://localhost/?r=TEST'); expect(logs.join('\n')).not.toContain('synthetic-tv-key');
    } finally {
      simulator.stop(); socket.terminate(); for (const ws of server.clients) ws.terminate();
      await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
    }
  });
});
