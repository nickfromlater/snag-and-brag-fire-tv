/** A visual loop shares the show's clock, including late mounts and pause/resume.
 * It never schedules game beats or publishes per-frame React state. */
export class DecorativeClock {
  private pausedAt: number | undefined;
  private pausedMs = 0;
  constructor(private readonly startedAt: number) {}
  elapsed(now: number, paused: boolean): number {
    if (paused && this.pausedAt === undefined) this.pausedAt = now;
    if (!paused && this.pausedAt !== undefined) {
      this.pausedMs += now - this.pausedAt;
      this.pausedAt = undefined;
    }
    return Math.max(0, (this.pausedAt ?? now) - this.startedAt - this.pausedMs);
  }
}
