/** Platform-free pool policy. Eight active voices total, per-effect 40 ms trigger guard. */
export interface AudioVoice { id: number; effect: string; started: number; until: number }
export class AudioPool {
  readonly active = new Map<number, AudioVoice>();
  private readonly last = new Map<string, number>();
  private serial = 0;
  dropped = 0; stolen = 0;
  constructor(readonly max = 8, readonly retriggerMs = 40) {}
  start(effect: string, now: number, durationMs: number): { voice: AudioVoice; stolen?: AudioVoice } | undefined {
    this.expire(now);
    if (now - (this.last.get(effect) ?? -Infinity) < this.retriggerMs) { this.dropped++; return; }
    this.last.set(effect, now);
    const stolen = this.active.size >= this.max ? [...this.active.values()].sort((a, b) => a.started - b.started)[0] : undefined;
    if (stolen) { this.active.delete(stolen.id); this.stolen++; }
    const voice = { id: ++this.serial, effect, started: now, until: now + durationMs };
    this.active.set(voice.id, voice); return { voice, stolen };
  }
  expire(now: number): void { for (const [id, v] of this.active) if (v.until <= now) this.active.delete(id); }
  end(id: number): void { this.active.delete(id); }
  clear(): void { this.active.clear(); this.last.clear(); }
}
