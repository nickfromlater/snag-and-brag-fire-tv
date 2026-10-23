import type { Clock } from '../src/game/types';

export class VirtualClock implements Clock {
  private value = 1_000_000;
  private serial = 0;
  private tasks = new Map<number, { at: number; fn: () => void }>();
  now(): number { return this.value; }
  setTimeout(fn: () => void, delay: number): number {
    const id = ++this.serial; this.tasks.set(id, { at: this.value + Math.max(0, delay), fn }); return id;
  }
  clearTimeout(handle: unknown): void { this.tasks.delete(handle as number); }
  advance(ms: number): void {
    const target = this.value + ms;
    for (let count = 0; count < 100_000; count++) {
      const next = this.next();
      if (!next || next[1].at > target) { this.value = target; return; }
      this.runNext();
    }
    throw new Error('Virtual clock runaway');
  }
  runUntil(predicate: () => boolean, max = 100_000): void {
    for (let i = 0; i < max; i++) { if (predicate()) return; if (!this.runNext()) throw new Error('No timer can reach the requested state'); }
    throw new Error('Virtual clock did not converge');
  }
  runNext(): boolean {
    const next = this.next(); if (!next) return false;
    this.tasks.delete(next[0]); this.value = next[1].at; next[1].fn(); return true;
  }
  get pending(): number { return this.tasks.size; }
  private next() { return [...this.tasks.entries()].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0]; }
}
