import { TIMING } from '@snag/shared';
import type { PhoneToTv, ScreenMsg } from '@snag/shared';

/** Whole-screen messages are authoritative; duplicates never erase local choices. */
export function reduceScreen(current: ScreenMsg | null, incoming: ScreenMsg): ScreenMsg | null {
  return current && incoming.seq <= current.seq ? current : incoming;
}

export function reconnectDelay(attempt: number): number {
  return Math.min(2000, 250 * 2 ** Math.max(0, attempt));
}

export function centerCrop(width: number, height: number, aspect = 1): { x: number; y: number; w: number; h: number } {
  if (!(width > 0 && height > 0 && aspect > 0)) throw new Error('The camera frame is not ready.');
  const w = Math.min(width, height * aspect), h = w / aspect;
  return { x: (width - w) / 2, y: (height - h) / 2, w, h };
}

export class TapBatcher {
  private counts: Record<-1 | 1, number> = { [-1]: 0, 1: 0 };
  constructor(private readonly send: (m: Extract<PhoneToTv, { t: 'tap' }>) => void) {}
  tap(side: -1 | 1): void { this.counts[side]++; }
  flush(): void {
    for (const side of [-1, 1] as const) {
      const n = this.counts[side];
      this.counts[side] = 0;
      if (n) this.send({ t: 'tap', n, side });
    }
  }
  clear(): void { this.counts = { [-1]: 0, 1: 0 }; }
}

/** Sliding window, so taps across a second boundary still cannot exceed six per second. */
export class ReactionThrottle {
  private times: number[] = [];
  allow(now: number): boolean {
    this.times = this.times.filter((t) => now - t < 1000);
    if (this.times.length >= 6) return false;
    this.times.push(now);
    return true;
  }
}

export function roomCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z]{4}$/.test(code) ? code : null;
}

export function clientId(code: string, storage: Pick<Storage, 'getItem' | 'setItem'> | undefined): string {
  const key = `snag:cid:${code}`;
  try { const found = storage?.getItem(key); if (found && /^[a-f0-9]{32}$/.test(found)) return found; } catch { /* Private browsing. */ }
  const id = [...crypto.getRandomValues(new Uint8Array(16))].map((n) => n.toString(16).padStart(2, '0')).join('');
  try { storage?.setItem(key, id); } catch { /* The current connection still has its token. */ }
  return id;
}

export function relayUrl(override: string | null, location: Pick<Location, 'protocol' | 'host'>): string {
  const url = new URL(override || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`);
  if (!['ws:', 'wss:'].includes(url.protocol)) throw new Error('The relay link must start with ws:// or wss://.');
  return url.href;
}

export function photoEndpoint(relay: string, code: string, id: string, key: string): string {
  const base = new URL(relay);
  base.protocol = base.protocol === 'wss:' ? 'https:' : 'http:';
  base.pathname = `/p/${encodeURIComponent(code)}/${encodeURIComponent(id)}`;
  base.search = new URLSearchParams({ k: key }).toString();
  base.hash = '';
  return base.href;
}

export function inAppBrowser(ua: string): boolean {
  return /Instagram|FBAN|FBAV|FB_IAB|Messenger|Line\/|\bwv\b|TikTok|Bytedance|Snapchat|MicroMessenger/i.test(ua);
}

export function timer(msg: ScreenMsg, now: number): { remaining: number; fraction: number } {
  const remaining = Math.max(0, (msg.deadline ?? now) - now);
  const fallback = msg.s.k === 'cam' ? TIMING.HUNT_S * 1000 : msg.s.k === 'glow' ? TIMING.GLOW_S * 1000 : msg.s.k === 'mash' ? TIMING.MASH_MS : TIMING.VOTE_S * 1000;
  const total = msg.total ?? fallback;
  return { remaining, fraction: Math.min(1, remaining / Math.max(1, total)) };
}

export function fmt(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
