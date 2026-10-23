/** Renderer task scheduler ported from the core timeline, without changing its exports. */
import type { Clock } from '@snag/shared';
/** The mockup samples meter ticks at 60Hz, with a probability on each frame. */
export function meterTicks(durationMs: number, probability: number, random: () => number = Math.random): { at: number; progress: number }[] {
  return periodicOffsets(durationMs, 1000 / 60).filter(() => random() < probability).map(at => ({ at, progress: at / durationMs }));
}

/** Cue-owned periodic beats; the final endpoint belongs to the next show beat. */
export function periodicOffsets(durationMs: number, intervalMs: number): number[] {
  if (!Number.isFinite(durationMs) || !Number.isFinite(intervalMs) || durationMs <= 0 || intervalMs <= 0) return [];
  return Array.from({ length: Math.ceil(durationMs / intervalMs) }, (_, i) => i * intervalMs);
}

interface Task { id: number; due: number; callback: () => void; handle?: unknown }
/** One pausable active-time axis for choreography, bots, host typing and point flights. */
export class Timeline {
  private tasks = new Map<number, Task>();
  private serial = 0;
  private frozenAt: number | undefined;
  private pausedWallAt = 0;
  private pauseTotal = 0;
  constructor(private readonly clock: Clock) {}
  now(): number { return this.frozenAt ?? this.clock.now() - this.pauseTotal; }
  wall(activeAt: number): number { return this.clock.now() + activeAt - this.now(); }
  get paused(): boolean { return this.frozenAt !== undefined; }
  after(ms: number, callback: () => void): number {
    const t: Task = { id: ++this.serial, due: this.now() + Math.max(0, ms), callback };
    this.tasks.set(t.id, t);
    this.arm(t);
    return t.id;
  }
  cancel(id: number | undefined): void {
    if (id === undefined) return;
    const t = this.tasks.get(id);
    if (!t) return;
    if (t.handle !== undefined) this.clock.clearTimeout(t.handle);
    this.tasks.delete(id);
  }
  pause(): void {
    if (this.paused) return;
    this.frozenAt = this.now(); this.pausedWallAt = this.clock.now();
    for (const t of this.tasks.values()) {
      if (t.handle !== undefined) this.clock.clearTimeout(t.handle);
      t.handle = undefined;
    }
  }
  resume(): void {
    if (!this.paused) return;
    this.pauseTotal += this.clock.now() - this.pausedWallAt; this.frozenAt = undefined;
    for (const t of this.tasks.values()) this.arm(t);
  }
  clear(): void { for (const id of this.tasks.keys()) this.cancel(id); }
  private arm(t: Task): void {
    if (this.paused) return;
    t.handle = this.clock.setTimeout(() => {
      if (!this.tasks.delete(t.id)) return;
      t.callback();
    }, Math.max(0, t.due - this.now()));
  }
}
