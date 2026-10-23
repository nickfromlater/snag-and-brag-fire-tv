import { ClockSync } from '@snag/shared';
import type { Clock, ScreenMsg, TvToPhone } from '@snag/shared';

/** Normal mode is relay time. Fast mode uses an accelerated simulation axis internally;
 * wire timestamps and phone durations are mapped back to the real relay clock. */
export class SimulatorClock implements Clock {
  private readonly sync: ClockSync;
  private readonly relayAnchor: number;
  private readonly gameAnchor: number;
  constructor(serverNow: number, readonly speed = 1, private readonly localNow = Date.now) {
    this.sync = new ClockSync(localNow); this.sync.offset = serverNow - localNow();
    this.relayAnchor = serverNow; this.gameAnchor = serverNow;
  }
  now(): number { return this.fromRelay(this.sync.serverNow()); }
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout> { return setTimeout(callback, Math.max(0, delayMs) / this.speed); }
  clearTimeout(handle: unknown): void { clearTimeout(handle as ReturnType<typeof setTimeout>); }
  fromRelay(at: number): number { return this.gameAnchor + (at - this.relayAnchor) * this.speed; }
  toRelay(at: number): number { return this.relayAnchor + (at - this.gameAnchor) / this.speed; }
  pong(c: number, s: number): void { this.sync.sample(c, s); }
  welcome(serverNow: number): void { this.sync.offset = serverNow - this.localNow(); }
  phone(message: TvToPhone): TvToPhone {
    if (message.t !== 'screen') return message;
    const out: ScreenMsg = { ...message };
    // ClockSync averages offsets, and fast mode divides the game axis by speed.
    // Both can introduce fractions; the relay's wire schema requires integer ms.
    if (out.deadline !== undefined) out.deadline = Math.round(this.toRelay(out.deadline));
    if (out.total !== undefined) out.total /= this.speed;
    return out;
  }
}
