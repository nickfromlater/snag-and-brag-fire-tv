import { GameHost, PROTO, createShowcase, decodeBinary, seededRng } from '@snag/shared';
import type { ClientToRelay, RelayToClient, RemoteKey, TvView } from '@snag/shared';
import { SimulatorClock } from './clock';
import type { Transport } from './loopback';
import { formatCue } from './transcript';

export interface SimulatorOptions { bots?: boolean; fast?: boolean; seed?: number; showcase?: boolean; log: (line: string) => void; onReady?: () => void; onComplete?: () => void; onError?: (code: string) => void }
export class TvSimulator {
  game: GameHost | undefined;
  clock: SimulatorClock | undefined;
  private transport: Transport | undefined;
  private credentials: { code: string; tvKey: string } | undefined;
  private pingTask: ReturnType<typeof setTimeout> | undefined;
  private suspendedByDisconnect = false;
  private stopped = false;
  private roster = '';
  constructor(private readonly options: SimulatorOptions) {}
  attach(transport: Transport): void {
    this.transport = transport;
    this.send({ t: 'hello', role: 'tv', proto: PROTO, resume: this.credentials });
  }
  receive(message: RelayToClient): void {
    if (this.stopped) return;
    if (message.t === 'welcome' && message.role === 'tv') {
      if (message.tvKey) this.credentials = { code: message.code, tvKey: message.tvKey };
      this.options.log('Room ' + message.code + ' · Join ' + message.joinUrl);
      if (!this.game) {
        this.clock = new SimulatorClock(message.serverNow, this.options.fast ? 10 : 1);
        const origin = this.clock.now();
        this.game = new GameHost({ clock: this.clock, rng: seededRng(this.options.seed ?? 1), room: { code: message.code, joinUrl: message.joinUrl },
          ...(this.options.showcase ? { showcase: createShowcase(this.options.seed) } : {}),
          send: (cid, m) => this.send({ t: 'to', to: [cid], m: this.clock!.phone(m) }),
          view: v => this.summarizeRoster(v),
          cue: e => { this.options.log(formatCue(e, origin)); if (e.cue.k === 'complete') this.options.onComplete?.(); } });
        if (this.options.showcase) this.game.playShowcase();
      } else {
        this.clock!.welcome(message.serverNow); if (this.suspendedByDisconnect) this.game.resume();
      }
      this.suspendedByDisconnect = false; this.ping(); this.options.onReady?.();
    } else if (message.t === 'pong') this.clock?.pong(message.c, message.s);
    else if (message.t === 'error') { this.options.log('Relay error: ' + message.code); this.options.onError?.(message.code); }
    else if (message.t === 'from') {
      this.game?.receive(message.cid, message.m, this.clock!.fromRelay(message.at));
      const view = this.game?.getView();
      if (message.m.t === 'join' && this.options.bots && view?.content.k === 'lobby' && !view.content.botsOn) this.game!.setBots(true);
    }
    else this.game?.handle(message);
  }
  binary(bytes: Uint8Array): void {
    const frame = decodeBinary(bytes);
    if (frame?.header.t === 'thumb' && frame.header.cid) this.game?.thumbnail(frame.header.cid, frame.payload);
  }
  disconnected(): void {
    if (this.stopped) return;
    clearTimeout(this.pingTask); this.transport = undefined;
    this.suspendedByDisconnect = !!this.game && !this.game.getView().paused;
    this.game?.pause(); this.options.log('TV disconnected; game paused. Reconnecting with the room key held in memory.');
  }
  remote(key: RemoteKey): void { this.game?.remote(key); }
  stop(closeRoom = true): void {
    this.stopped = true; clearTimeout(this.pingTask);
    if (closeRoom) this.send({ t: 'close' }); this.game?.dispose(); this.transport?.close(); this.transport = undefined;
    this.credentials = undefined;
  }
  private send(message: ClientToRelay): void { this.transport?.send(message); }
  private summarizeRoster(view: TvView): void {
    const key = (view.round === -1 ? 'lobby:' : 'game:') + view.teams.map(t => t.id).join(',');
    if (key === this.roster) return;
    this.roster = key;
    const joined = view.teams.filter(t => t.joined !== false), empty = view.teams.filter(t => t.joined === false);
    this.options.log(`HUD ${view.round === -1 ? 'lobby' : 'game'} joined=${joined.length} slots=${view.teams.length} bots=${joined.filter(t => t.bot).length} placeholderMonograms=${empty.filter(t => t.mono).length}`);
  }
  private ping(): void {
    clearTimeout(this.pingTask); this.send({ t: 'ping', c: Date.now() });
    this.pingTask = setTimeout(() => this.ping(), 5000);
  }
}
