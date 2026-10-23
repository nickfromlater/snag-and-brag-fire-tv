import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RelayTransport } from '../src/transport';

class Socket {
  static OPEN = 1;
  static instances: Socket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  constructor() { Socket.instances.push(this); }
  send() {}
  close() { this.readyState = 3; }
  receive(value: unknown) { this.onmessage?.({ data: JSON.stringify(value) }); }
}
let transport: RelayTransport;
beforeEach(() => { vi.useFakeTimers(); Socket.instances = []; vi.stubGlobal('WebSocket', Socket); });
afterEach(() => { transport?.stop(); vi.unstubAllGlobals(); vi.useRealTimers(); });
function open() {
  const events = { message: vi.fn(), ai: vi.fn(), status: vi.fn(), closed: vi.fn() };
  transport = new RelayTransport('wss://example.test/ws', 'AAAA', events); transport.start();
  const socket = Socket.instances[0]!; socket.readyState = 1; socket.onopen?.();
  return { socket, events };
}

it('returns an invalid room handshake to code entry and stops retrying', () => {
  const { socket, events } = open(); socket.receive({ t: 'error', code: 'BAD_MSG' });
  expect(events.closed).toHaveBeenCalledWith('Check the four-letter room code on the TV.');
  expect(transport.send({ t: 'join', name: 'Team', color: '#FF4FA0' })).toBe(false);
  vi.advanceTimersByTime(30000);
  expect(Socket.instances).toHaveLength(1); expect(socket.readyState).toBe(3);
});

it('keeps a joined controller usable after a rejected individual message', () => {
  const { socket, events } = open();
  socket.receive({ t: 'welcome', role: 'phone', roomKey: 'a'.repeat(32), serverNow: Date.now() });
  socket.receive({ t: 'error', code: 'BAD_MSG' });
  expect(events.closed).not.toHaveBeenCalled();
  expect(transport.send({ t: 'vote', team: 'p2' })).toBe(true);
});

it('returns a closed room to code entry with the actionable server error', () => {
  const { socket, events } = open(); socket.receive({ t: 'error', code: 'NO_ROOM' });
  expect(events.closed).toHaveBeenCalledWith('That show has closed. Check the code on the TV.');
  expect(socket.readyState).toBe(3);
});
