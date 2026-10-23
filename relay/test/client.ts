import { randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket, type RawData } from 'ws';
import sharp from 'sharp';
import { PROTO, decodeBinary, encodeBinary, type BinaryHeader, type RelayToClient } from '@snag/shared';

type Welcome = Extract<RelayToClient, { t: 'welcome' }>;
export const clientId = () => randomBytes(16).toString('hex');
export const snagHeader: Extract<BinaryHeader, { t: 'snag' }> = { t: 'snag', round: 0, roundKind: 'color', hex: '#F23B2E', match: 99, prompt: 'Snag the most RED thing in the house' };
/** No fixtures read from/written to disk; every photo is a synthetic red square. */
export function redSquare(size = 64): Promise<Buffer> {
  return sharp({ create: { width: size, height: size, channels: 3, background: '#F23B2E' } }).jpeg().toBuffer();
}

export class Client {
  readonly json: RelayToClient[] = [];
  readonly binary: Buffer[] = [];
  readonly receivedAt: number[] = [];
  private wake: (() => void) | undefined;
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (raw: RawData, binary) => {
      const data = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
      if (binary) this.binary.push(data);
      else this.json.push(JSON.parse(data.toString()) as RelayToClient);
      this.receivedAt.push(performance.now());
      this.wake?.();
    });
  }
  static async open(url: string, autoPong = true, headers?: Record<string, string>): Promise<Client> {
    const ws = new WebSocket(url, { autoPong, headers });
    const client = new Client(ws);
    await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    return client;
  }
  send(value: unknown) { this.ws.send(JSON.stringify(value)); }
  upload(header: BinaryHeader, jpeg: Uint8Array) { this.ws.send(encodeBinary(header, jpeg)); }
  async take<T extends RelayToClient['t']>(t: T, timeout = 2000): Promise<Extract<RelayToClient, { t: T }>> {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const i = this.json.findIndex((m) => m.t === t);
      if (i >= 0) return this.json.splice(i, 1)[0] as Extract<RelayToClient, { t: T }>;
      await Promise.race([new Promise<void>((resolve) => { this.wake = resolve; }), delay(Math.min(20, end - Date.now()))]);
      this.wake = undefined;
    }
    throw new Error(`Timed out waiting for ${t}`);
  }
  async takeBinary() {
    for (let i = 0; i < 100 && !this.binary.length; i++) await delay(10);
    const data = this.binary.shift();
    if (!data) throw new Error('Timed out waiting for binary');
    return decodeBinary(data)!;
  }
  async tv(resume?: { code: string; tvKey: string }): Promise<Welcome> {
    this.send({ t: 'hello', proto: PROTO, role: 'tv', ...(resume ? { resume } : {}) });
    return this.take('welcome');
  }
  async phone(code: string, cid = clientId()): Promise<{ welcome: Welcome; cid: string }> {
    this.send({ t: 'hello', proto: PROTO, role: 'phone', code, cid });
    return { welcome: await this.take('welcome'), cid };
  }
  async close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => { this.ws.once('close', () => resolve()); this.ws.close(); });
  }
}
