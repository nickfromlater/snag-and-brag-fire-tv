import { batchStage } from './batch';
type Subscriber = { hz: number; last: number; fn: (dt: number, now: number) => void };
/** One capped 30 Hz clock, no React state. Sticker transforms use the native driver. */
export class FrameClock {
  private readonly subscribers = new Set<Subscriber>();
  private raf = 0; private previous = 0; private presentation = 0;
  enabled = true; paused = false; reducedMotion = false; fps = 0; frame = 0; private frames = 0; private sampled = 0;
  now(): number { return this.presentation; }
  private readonly tick = () => {
    const now = performance.now(), dt = Math.min(.05, Math.max(0, (now - this.previous) / 1000));
    this.previous = now; this.frames++; this.frame++;
    if (now - this.sampled >= 1000) { this.fps = this.frames * 1000 / (now - this.sampled); this.frames = 0; this.sampled = now; }
    if (!this.paused) this.presentation += dt;
    batchStage(() => { for (const s of [...this.subscribers]) if (now - s.last >= 1000 / s.hz - .2) {
      const elapsed = s.last ? Math.min(.05, (now - s.last) / 1000) : 1 / s.hz; s.last = now;
      if(this.enabled)s.fn(this.paused ? 0 : elapsed, this.presentation);
    } });
    this.raf = setTimeout(this.tick, 1000 / 30) as unknown as number;
  };
  subscribe(fn: Subscriber['fn'], hz = 30): () => void {
    const s = { hz: Math.min(60, hz), last: 0, fn }; this.subscribers.add(s);
    if (this.subscribers.size === 1) { this.previous = this.sampled = performance.now(); this.raf = setTimeout(this.tick, 1000 / 30) as unknown as number; }
    return () => { this.subscribers.delete(s); if (!this.subscribers.size) clearTimeout(this.raf); };
  }
}
export const frameClock = new FrameClock();
