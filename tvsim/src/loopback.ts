import { GEN_BRAGS, GEN_NAMES, PROTO, decodeBinary, encodeBinary, isJudgeMask } from '@snag/shared';
import type { AiRead, BinaryHeader, ClientToRelay, Clock, RelayToClient } from '@snag/shared';

export interface Transport {
  send(message: ClientToRelay): void;
  sendBinary?(bytes: Uint8Array): void;
  close(): void;
}
interface Peer { role?: 'tv' | 'phone'; cid?: string; open: boolean; deliver: (m: RelayToClient) => void; binary?: (bytes: Uint8Array) => void }
/** A test relay only: protocol envelopes, memory photos, peer changes and fallback AI.
 * It contains no timers/scoring/game state and never binds a port or writes a file. */
export class LoopbackRelay {
  private tv: Peer | undefined;
  private readonly peers = new Set<Peer>();
  private readonly photos = new Map<string, Uint8Array>();
  private readonly aiTasks = new Set<unknown>();
  private photoSerial = 0;
  constructor(private readonly clock: Clock, private readonly aiDelayMs = 4000) {}
  connect(deliver: (m: RelayToClient) => void, binary?: (bytes: Uint8Array) => void): Transport {
    const peer: Peer = { open: true, deliver, binary }; this.peers.add(peer);
    return { send: m => this.message(peer, m), sendBinary: bytes => this.binary(peer, bytes), close: () => this.drop(peer) };
  }
  get photoCount(): number { return this.photos.size; }
  private message(peer: Peer, message: ClientToRelay): void {
    if (!peer.open) return;
    if (message.t === 'hello') {
      if (message.proto !== PROTO) { peer.deliver({ t: 'error', code: 'BAD_PROTO' }); return; }
      peer.role = message.role;
      if (message.role === 'tv') this.tv = peer;
      else { peer.cid = message.cid; if (!this.tv) { peer.deliver({ t: 'error', code: 'NO_ROOM' }); return; } }
      peer.deliver({ t: 'welcome', role: message.role, code: 'LOOP', roomKey: 'memory-only-read-key', tvKey: message.role === 'tv' ? 'memory-only-tv-key' : undefined, joinUrl: 'loopback://LOOP', serverNow: this.clock.now() });
      if (peer.role === 'phone') this.tv!.deliver({ t: 'peer', cid: peer.cid!, up: true });
    } else if (message.t === 'ping') peer.deliver({ t: 'pong', c: message.c, s: this.clock.now() });
    else if (message.t === 'msg' && peer.role === 'phone') this.tv?.deliver({ t: 'from', cid: peer.cid!, at: this.clock.now(), m: message.m });
    else if (message.t === 'to' && peer === this.tv) {
      for (const phone of this.peers) if (phone.open && phone.role === 'phone' && (message.to === 'all' || message.to.includes(phone.cid!))) phone.deliver({ t: 'msg', m: message.m });
    } else if (message.t === 'close' && peer === this.tv) this.close();
  }
  private binary(peer: Peer, bytes: Uint8Array): void {
    if (peer.role !== 'phone' || !peer.open) return;
    const frame = decodeBinary(bytes); if (!frame) return;
    if (frame.header.t === 'thumb') { this.tv?.binary?.(encodeBinary({ t: 'thumb', cid: peer.cid! }, frame.payload)); return; }
    if (frame.header.t !== 'snag') return;
    const header: Extract<BinaryHeader, { t: 'snag' }> = frame.header, photoId = 'synthetic-' + ++this.photoSerial;
    this.photos.set(photoId, frame.payload.slice());
    this.tv?.deliver({ t: 'from', cid: peer.cid!, at: this.clock.now(), m: { t: 'snag', photoId, round: header.round, hex: header.hex, match: header.match, ...(header.roundKind === 'color' && isJudgeMask(header.mask) ? { mask: header.mask } : {}) } });
    let handle: unknown;
    handle = this.clock.setTimeout(() => {
      this.aiTasks.delete(handle);
      const r: AiRead = { thing: 'synthetic red card', names: [...GEN_NAMES.slice(0, 3)], brags: [...GEN_BRAGS.slice(0, 2)], score: 5, quip: 'A fine card. Quite square.', fallback: true };
      this.tv?.deliver({ t: 'ai', cid: peer.cid!, photoId, r });
      if (peer.open) peer.deliver({ t: 'ai', cid: peer.cid!, photoId, r });
    }, this.aiDelayMs);
    this.aiTasks.add(handle);
  }
  private drop(peer: Peer): void {
    if (!peer.open) return; peer.open = false; this.peers.delete(peer);
    if (peer.role === 'phone') this.tv?.deliver({ t: 'peer', cid: peer.cid!, up: false });
    if (peer === this.tv) this.close();
  }
  close(): void {
    for (const peer of this.peers) peer.open = false;
    this.peers.clear(); this.tv = undefined; this.photos.clear();
    for (const task of this.aiTasks) this.clock.clearTimeout(task); this.aiTasks.clear();
  }
}
