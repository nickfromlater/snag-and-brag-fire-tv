import { ClockSync } from '@snag/shared';
import type { Clock } from '@snag/shared';
export class TvClock implements Clock {
  readonly sync = new ClockSync(Date.now);
  private axis = Date.now(); private local = Date.now(); speed = 1;
  private director?: { at: number; local: number; held: boolean };
  now(): number {
    if (this.director) return Math.round(this.director.at + (this.director.held ? 0 : Date.now() - this.director.local));
    // Sync offsets average RTT samples and can contain fractional milliseconds.
    // Wire deadlines are integer milliseconds; keep that boundary in the adapter.
    return Math.round(this.speed === 1 ? this.sync.serverNow() : this.axis + (this.sync.serverNow() - this.local) * this.speed);
  }
  setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout> { return setTimeout(callback, Math.max(0, ms) / this.speed); }
  clearTimeout(handle: unknown): void { clearTimeout(handle as ReturnType<typeof setTimeout>); }
  welcome(serverNow: number): void { const prior = this.now(); this.sync.offset = serverNow - Date.now(); this.local = serverNow; this.axis = prior; }
  accelerate(speed: number): void { this.axis = this.now(); this.local = this.sync.serverNow(); this.speed = Math.max(1, Math.min(20, speed)); }
  /** Capture time is independent of relay time; only the opt-in adapter calls this. */
  present(at: number, held: boolean): void { this.director = { at, held, local: Date.now() }; this.speed = 1; }
}
