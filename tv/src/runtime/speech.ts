import type { ClientToRelay, RelayToClient, SpeechMark } from '@snag/shared';

export interface SpeechClip { id: string; uri: string; marks: SpeechMark[]; durationMs: number; nativeAudio?: ArrayBuffer }
interface Entry {
  id: string; text: string; status: 'queued' | 'pending' | 'preparing' | 'ready'; clip?: SpeechClip; abort?: AbortController;
  promise: Promise<SpeechClip | undefined>; resolve(clip?: SpeechClip): void;
}
/** Room-lifetime memory cache. Two requests in flight leave relay headroom for a
 * foreground line. Dynamic text keys include the complete team/find/quip text. */
export class SpeechCache {
  private readonly entries = new Map<string, Entry>();
  private readonly ids = new Map<string, Entry>();
  private readonly queue: Entry[] = [];
  private planned: string[] = []; private readonly listeners = new Set<() => void>();
  private serial = 0; private generation = 0; private inFlight = 0;
  constructor(private readonly send: (message: ClientToRelay) => boolean,
    private readonly uri: (id: string) => string | undefined, readonly max = 32,
    private readonly prepare?: (uri: string, signal: AbortSignal) => Promise<ArrayBuffer | undefined>) {}
  prefetch(text: string, planned = true): void { if (planned && !this.planned.includes(text)) this.planned.push(text); void this.request(text); this.changed(); }
  upcoming(): SpeechClip | undefined { return this.planned.length ? this.peek(this.planned[0]!) : undefined; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  refresh(): void { this.changed(); }
  resetPlan(): void { this.planned.length = 0; this.changed(); }
  private changed(): void { for (const fn of this.listeners) fn(); }
  peek(text: string): SpeechClip | undefined { const entry = this.entries.get(text); return entry?.status === 'ready' ? entry.clip : undefined; }
  request(text: string, foreground = false): Promise<SpeechClip | undefined> {
    if (foreground) { const at = this.planned.indexOf(text); if (at >= 0) this.planned = this.planned.slice(at + 1); this.changed(); }
    const existing = this.entries.get(text);
    if (existing) {
      this.entries.delete(text); this.entries.set(text, existing);
      if (foreground && existing.status === 'ready') this.send({ t: 'tts', id: existing.id, text });
      if (foreground && existing.status === 'queued') { this.queue.splice(this.queue.indexOf(existing), 1); this.queue.unshift(existing); this.pump(); }
      return existing.promise;
    }
    let resolve!: Entry['resolve'];
    const promise = new Promise<SpeechClip | undefined>(done => { resolve = done; });
    const entry: Entry = { id: 'voice-' + this.generation + '-' + ++this.serial, text, status: 'queued', promise, resolve };
    this.entries.set(text, entry); this.ids.set(entry.id, entry);
    foreground ? this.queue.unshift(entry) : this.queue.push(entry);
    this.pump(); this.trim(); return promise;
  }
  receive(reply: Extract<RelayToClient, { t: 'tts' }>): void {
    const entry = this.ids.get(reply.id);
    if (!entry || entry.status !== 'pending') return;
    this.inFlight--;
    const uri = this.uri(reply.id);
    if (reply.ok && uri && reply.marks?.some(m => m.type === 'word') && reply.marks.some(m => m.type === 'viseme') && Number.isFinite(reply.durationMs) && reply.durationMs! > 0) {
      entry.clip = { id: entry.id, uri, marks: reply.marks, durationMs: reply.durationMs! };
      if (this.prepare) {
        entry.status = 'preparing'; entry.abort = new AbortController();
        void this.prepare(uri, entry.abort.signal).then(data => {
          if (this.ids.get(entry.id) !== entry) { if (data) new Uint8Array(data).fill(0); return; }
          if (data) { entry.clip!.nativeAudio = data; entry.status = 'ready'; entry.resolve(entry.clip); }
          else { this.entries.delete(entry.text); this.ids.delete(entry.id); entry.resolve(); }
          this.trim(); this.changed();
        }).catch(() => { if (this.ids.get(entry.id) === entry) { this.entries.delete(entry.text); this.ids.delete(entry.id); entry.resolve(); } });
      } else { entry.status = 'ready'; entry.resolve(entry.clip); this.changed(); }
    } else { this.entries.delete(entry.text); this.ids.delete(entry.id); entry.resolve(); }
    this.pump(); this.trim();
  }
  private pump(): void {
    while (this.inFlight < 2 && this.queue.length) {
      const entry = this.queue.shift()!;
      entry.status = 'pending'; this.inFlight++;
      if (!this.send({ t: 'tts', id: entry.id, text: entry.text })) {
        this.inFlight--; this.entries.delete(entry.text); this.ids.delete(entry.id); entry.resolve();
      }
    }
  }
  private trim(): void {
    for (const [text, entry] of this.entries) {
      if (this.entries.size <= this.max) break;
      if (entry.status !== 'ready') continue;
      if (entry.clip?.nativeAudio) new Uint8Array(entry.clip.nativeAudio).fill(0);
      this.entries.delete(text); this.ids.delete(entry.id);
    }
  }
  clear(): void {
    this.generation++; for (const entry of this.entries.values()) { entry.abort?.abort(); if (entry.clip?.nativeAudio) new Uint8Array(entry.clip.nativeAudio).fill(0); entry.resolve(); }
    this.entries.clear(); this.ids.clear(); this.queue.length = 0; this.planned.length = 0; this.inFlight = 0; this.changed();
  }
}
