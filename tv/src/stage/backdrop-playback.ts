import type { Mood } from '@snag/shared';

export interface BackdropPlayer {
  src: string; loop: boolean;
  initialize(): Promise<void>; deinitialize(): Promise<void>;
  play(): void | Promise<void>; pause(): void;
  setSurfaceHandle(handle: string): void; clearSurfaceHandle(handle: string): void;
}

const activeBackdrops = new Set<BackdropPlayback>();
/** Begin native release inside AppState; background React effects may be deferred. */
export function releaseBackdrops(): number {
  const count = activeBackdrops.size;
  for (const playback of [...activeBackdrops]) playback.stop();
  return count;
}

/** One decoder owns the visible backdrop. Cleanup starts before JS backgrounds. */
export class BackdropPlayback {
  private ready = false; private closed = false; private surface?: string;
  private attached?: string; private source?: Mood; private paused = false;
  private released = false;
  constructor(private readonly player: BackdropPlayer, private mood: Mood, private readonly failed: () => void) { activeBackdrops.add(this); }
  start(): void {
    void this.player.initialize().then(() => {
      this.ready = true;
      if (this.closed) this.release(); else this.apply();
    }).catch(() => { if (!this.closed) this.failed(); });
  }
  setSurface(handle: string | undefined): void {
    this.surface = handle;
    if (!handle && this.ready && !this.closed) { this.player.pause(); if (this.attached) this.player.clearSurfaceHandle(this.attached); this.attached = undefined; }
    else this.apply();
  }
  update(mood: Mood, paused: boolean): void { this.mood = mood; this.paused = paused; this.apply(); }
  private apply(): void {
    if (!this.ready || this.closed || !this.surface) return;
    try {
      if (this.attached !== this.surface) { this.player.setSurfaceHandle(this.surface); this.attached = this.surface; }
      if (this.source !== this.mood) { this.player.src = '/pkg/assets/raw/stage-' + this.mood + '.mp4'; this.player.loop = true; this.source = this.mood; }
      if (this.paused) this.player.pause(); else {
        const playing = this.player.play();
        if (playing) void playing.catch(() => { if (!this.closed) this.failed(); });
      }
    } catch { this.failed(); }
  }
  stop(): void { if (this.closed) return; this.closed = true; activeBackdrops.delete(this); if (this.ready) this.release(); }
  private release(): void {
    if (this.released) return; this.released = true;
    try { this.player.pause(); } catch { /* A failed player still needs release. */ }
    try { if (this.attached) this.player.clearSurfaceHandle(this.attached); } catch { /* Surface may be gone. */ }
    try { void this.player.deinitialize().catch(() => {}); } catch { /* Already released by the native player. */ }
  }
}
