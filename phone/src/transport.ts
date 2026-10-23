import { ClockSync, PROTO } from '@snag/shared';
import type { ClientToRelay, PhoneToTv, RelayToClient, TvToPhone } from '@snag/shared';
import { clientId, photoEndpoint, reconnectDelay } from './logic';

export interface PhoneTransport {
  start(): void;
  stop(): void;
  reconnect(): void;
  send(message: PhoneToTv): boolean;
  binary(frame: Uint8Array): boolean;
  now(): number;
  photoUrl(id: string): string;
  hostIdentity(value?: boolean): boolean;
}
export interface TransportEvents {
  message(message: TvToPhone): void;
  ai(message: Extract<RelayToClient, { t: 'ai' }>): void;
  status(text: string): void;
  closed?(reason?: string): void;
}

export class RelayTransport implements PhoneTransport {
  private socket: WebSocket | null = null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private ping: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private stopped = true;
  private connectedAt = 0;
  private welcomed = false;
  private key = '';
  private host = false;
  private storage: Storage | undefined;
  readonly cid: string;
  readonly clock = new ClockSync(() => Date.now());

  constructor(private readonly url: string, private readonly code: string, private readonly events: TransportEvents) {
    try { this.storage = localStorage; } catch { /* Storage is optional. */ }
    this.cid = clientId(code, this.storage);
    try { this.host = this.storage?.getItem(`snag:host:${code}`) === this.cid; } catch { /* Identity is kept in memory. */ }
  }
  now(): number { return this.clock.serverNow(); }
  photoUrl(id: string): string { return photoEndpoint(this.url, this.code, id, this.key); }
  hostIdentity(value?: boolean): boolean {
    if (value !== undefined) {
      this.host = value;
      try {
        if (value) this.storage?.setItem(`snag:host:${this.code}`, this.cid);
        else this.storage?.removeItem(`snag:host:${this.code}`);
      } catch { /* TV remains the authority for host controls. */ }
    }
    return this.host;
  }
  start(): void { this.stopped = false; this.drop(); this.connect(); }
  stop(): void { this.stopped = true; this.drop(); }
  reconnect(): void { if (this.stopped) return; this.drop(); this.connect(); }
  private drop(): void {
    clearTimeout(this.retry); clearTimeout(this.ping);
    this.retry = undefined; this.ping = undefined; this.welcomed = false;
    const old = this.socket; this.socket = null;
    if (old) { old.onopen = old.onmessage = old.onclose = old.onerror = null; old.close(); }
  }
  private connect(): void {
    if (this.stopped || this.socket || this.retry) return;
    this.events.status(this.attempt ? 'Reconnecting to the show…' : 'Connecting to the show…');
    const socket = new WebSocket(this.url);
    this.socket = socket; socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.connectedAt = Date.now();
      this.envelope({ t: 'hello', proto: PROTO, role: 'phone', code: this.code, cid: this.cid });
      this.tickPing();
    };
    socket.onmessage = (event: MessageEvent<unknown>) => {
      if (socket !== this.socket || typeof event.data !== 'string') return;
      let message: RelayToClient;
      try { message = JSON.parse(event.data) as RelayToClient; } catch { return; }
      if (!message || typeof message !== 'object') return;
      if (message.t === 'welcome' && message.role === 'phone') {
        this.key = message.roomKey; this.welcomed = true; this.attempt = 0;
        this.clock.offset = message.serverNow - Date.now(); this.events.status('');
      } else if (message.t === 'pong') this.clock.sample(message.c, message.s);
      else if (message.t === 'msg' && this.welcomed) this.events.message(message.m);
      else if (message.t === 'ai' && this.welcomed) this.events.ai(message);
      else if (message.t === 'error') {
        const copy = { NO_ROOM: 'That show has closed. Check the code on the TV.', ROOM_FULL: 'The show is full. Four teams is a full house!', BAD_PROTO: 'This controller needs a refresh.', BAD_KEY: 'That room link has expired.', RATE_LIMIT: 'A little slower, superstar.', BAD_MSG: 'The TV couldn’t read that. Try again.' };
        const reason = message.code === 'BAD_MSG' && !this.welcomed ? 'Check the four-letter room code on the TV.' : copy[message.code] ?? 'The show couldn’t connect. Try again.';
        this.events.status(reason);
        if (['NO_ROOM', 'ROOM_FULL', 'BAD_PROTO', 'BAD_KEY'].includes(message.code) || message.code === 'BAD_MSG' && !this.welcomed) {
          this.stopped = true; this.drop(); this.events.closed?.(reason);
        }
      }
    };
    const failed = () => {
      if (this.socket !== socket || this.stopped) return;
      this.drop(); this.events.status('Reconnecting to the show…');
      this.retry = setTimeout(() => { this.retry = undefined; this.connect(); }, reconnectDelay(this.attempt++));
    };
    socket.onerror = failed; socket.onclose = failed;
  }
  private tickPing(): void {
    clearTimeout(this.ping);
    this.envelope({ t: 'ping', c: Date.now() });
    this.ping = setTimeout(() => this.tickPing(), Date.now() - this.connectedAt < 10000 ? 2000 : 10000);
  }
  private envelope(message: ClientToRelay): boolean {
    if (this.socket?.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(message)); return true;
  }
  send(message: PhoneToTv): boolean { return this.welcomed && this.envelope({ t: 'msg', m: message }); }
  binary(frame: Uint8Array): boolean {
    if (!this.welcomed || this.socket?.readyState !== WebSocket.OPEN) return false;
    // Copy to an ArrayBuffer (not SharedArrayBuffer) accepted by every browser's WebSocket.
    this.socket.send(new Uint8Array(frame).buffer); return true;
  }
}
