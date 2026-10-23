import { PROTO, decodeBinary } from '@snag/shared';
import type { ClientToRelay, RelayToClient } from '@snag/shared';
export interface RelayCallbacks {
  message(m: RelayToClient): void; thumb(cid: string, jpeg: Uint8Array): void;
  disconnected(code?: number): void; status(connected: boolean): void;
}
/** Authentication credentials are held in memory and are never included in telemetry. */
export class RelayClient {
  private ws?: WebSocket; private reconnect?: ReturnType<typeof setTimeout>; private ping?: ReturnType<typeof setInterval>;
  private credentials?: { code: string; tvKey: string }; private stopped = false; private attempt = 0;
  roomKey?: string; code?: string;
  constructor(readonly url: string, private readonly callbacks: RelayCallbacks) {}
  connect(): void {
    if (this.stopped) return;
    const url = new URL(this.url);
    if ((globalThis as { HermesInternal?: unknown }).HermesInternal) url.searchParams.set('images', 'native');
    const ws = new WebSocket(url.toString()); this.ws = ws; ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.attempt = 0; this.callbacks.status(true); this.send({ t: 'hello', proto: PROTO, role: 'tv', resume: this.credentials }); this.ping = setInterval(() => this.send({ t: 'ping', c: Date.now() }), 5000); };
    ws.onmessage = event => {
      if (typeof event.data === 'string') {
        let m: RelayToClient; try { m = JSON.parse(event.data) as RelayToClient; } catch { return; }
        if (m.t === 'welcome' && m.role === 'tv') { this.code = m.code; this.roomKey = m.roomKey; if (m.tvKey) this.credentials = { code: m.code, tvKey: m.tvKey }; }
        if (m.t === 'error' && m.code === 'NO_ROOM') { this.credentials = undefined; this.send({ t: 'hello', proto: PROTO, role: 'tv' }); return; }
        this.callbacks.message(m);
      } else {
        const frame = decodeBinary(event.data as ArrayBuffer);
        if (frame?.header.t === 'thumb' && frame.header.cid && frame.payload.length <= 128 * 1024) this.callbacks.thumb(frame.header.cid, frame.payload);
      }
    };
    ws.onerror = () => {}; // onclose owns the single reconnect loop
    ws.onclose = event => { clearInterval(this.ping); this.ws = undefined; this.callbacks.status(false); if (!this.stopped) { this.callbacks.disconnected(event.code); this.reconnect = setTimeout(() => this.connect(), Math.min(8000, 500 * 2 ** this.attempt++)); } };
  }
  send(m: ClientToRelay): boolean { if (this.ws?.readyState !== WebSocket.OPEN) return false; this.ws.send(asciiJson(m)); return true; }
  photoUrl(id: string): string | undefined {
    return this.mediaUrl('p', id);
  }
  speechUrl(id: string): string | undefined { return this.mediaUrl('tts', id); }
  private mediaUrl(path: 'p' | 'tts', id: string): string | undefined {
    if (!this.code || !this.roomKey) return;
    return new URL(this.url.replace(/^ws/, 'http')).origin + '/' + path + '/' + encodeURIComponent(this.code) + '/' + encodeURIComponent(id) + '?k=' + encodeURIComponent(this.roomKey);
  }
  close(closeRoom = true): void { this.stopped = true; clearTimeout(this.reconnect); clearInterval(this.ping); if (closeRoom) this.send({ t: 'close' }); this.ws?.close(); this.ws = undefined; this.credentials = undefined; this.roomKey = undefined; }
}

/** JSON with every non-ASCII character escaped. The stick's WebSocket double-encoded non-ASCII text
 *  frames: the phone showed "scanningâ€¦" for "scanning…" (Nick's phone, Oct 20). */
export function asciiJson(value: unknown): string {
  return JSON.stringify(value).replace(/[\u0080-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
}
