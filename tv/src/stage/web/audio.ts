export class AudioPlayer {
  private readonly element = new Audio();
  async initialize(): Promise<void> {}
  async deinitialize(): Promise<void> { this.element.pause(); this.element.src = ''; }
  get src(): string { return this.element.src; }
  set src(v: string) { this.element.src = v; }
  get loop(): boolean { return this.element.loop; }
  set loop(v: boolean) { this.element.loop = v; }
  set autoplay(v: boolean) { this.element.autoplay = v; }
  get paused(): boolean { return this.element.paused; }
  get currentTime(): number { return this.element.currentTime; }
  set currentTime(v: number) { this.element.currentTime = v; }
  get volume(): number { return this.element.volume; }
  set volume(v: number) { this.element.volume = Math.max(0, Math.min(1, v)); }
  get error(): MediaError | null { return this.element.error; }
  load(): void { this.element.load(); }
  play(): void { void this.element.play().catch(() => {}); }
  pause(): void { this.element.pause(); }
  addEventListener(k: string, f: () => void): void { this.element.addEventListener(k, f); }
}
export const MediaSource = globalThis.MediaSource;
