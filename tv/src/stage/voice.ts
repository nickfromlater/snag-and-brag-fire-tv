import type { Clock, CueEvent } from '@snag/shared';
import type { SpeechCache, SpeechClip } from '../runtime/speech';
import { SpeechTrack } from './speech-track';

export const VOICE_DEADLINE_MS = 600;
export const NATIVE_VOICE_DEADLINE_MS = 2000;
export interface SpeechPlayback {
  readonly positionMs: number; readonly ended: boolean; readonly failed: boolean;
  stop(): void;
}
export interface VoiceBus { startSpeech(uri: string, nativeAudio?: ArrayBuffer, canStart?: () => boolean): Promise<SpeechPlayback | undefined>; play(name: 'voice'): Promise<void> }
type HostCue = Extract<CueEvent['cue'], { k: 'host' }>;
interface Active {
  seq: number; cue: HostCue; at: number; path: 'pending' | 'polly' | 'blips';
  prefetched: boolean; clip?: SpeechClip; playback?: SpeechPlayback; track?: SpeechTrack;
  reported: boolean; lastBeat: number; finished: boolean;
  lastCharacters?: number; lastJaw?: number;
}
export interface VoiceFrame { characters: number; target: number; talking: boolean }
/** One clip, one media clock, one compiled track; the existing host clock samples it. */
export class VoiceDirector {
  private active?: Active; private sound = true; private enabled = true;
  private frozenAt?: number; private pauseTotal = 0;
  private deadline?: unknown;
  constructor(private readonly cache: SpeechCache, private readonly bus: VoiceBus,
    private readonly now: () => number,
    private readonly report: (kind: string, fields: Record<string, string | number | boolean | null>) => void,
    private readonly timing?: (text: string, remainingMs: number) => void,
    private readonly timers?: Pick<Clock, 'setTimeout' | 'clearTimeout'>,
    private readonly deadlineMs = VOICE_DEADLINE_MS) {}
  private time(): number { return (this.frozenAt ?? this.now()) - this.pauseTotal; }
  /** Read the existing playback clock without advancing speech or scheduling work. */
  debugClock(): { lineSeq: number; mediaMs: number; mediaPath: string } {
    const a = this.active;
    return { lineSeq: a?.seq ?? 0, mediaMs: Math.round(a?.path === 'polly'
      ? a.finished ? a.clip?.durationMs ?? 0 : a.playback?.positionMs ?? 0 : 0), mediaPath: a?.path ?? 'none' };
  }
  start(seq: number, cue: HostCue, elapsedMs = 0): void {
    this.stop('superseded');
    const prefetched = !!this.cache.peek(cue.line.text);
    const a: Active = { seq, cue, at: this.time() - Math.max(0, elapsedMs), path: 'pending', prefetched, reported: false, lastBeat: -1, finished: false };
    this.active = a;
    this.arm(a);
    // Even Sound/Voice-off lines request TTS, so turning Voice back on is warm.
    const pending = this.cache.request(cue.line.text, true);
    if (!this.sound || !this.enabled) this.fallback(a, this.sound ? 'voice-off' : 'sound-off');
    // Defer until the core has installed its typing task and phase wait.
    if (this.deadlineMs > VOICE_DEADLINE_MS) void Promise.resolve().then(() => {
      if (this.active === a && a.path === 'pending')
        this.timing?.(cue.line.text, Math.max(0, this.deadlineMs - (this.time() - a.at)));
    });
    void pending.then(async clip => {
      if (this.active !== a || a.path !== 'pending') return;
      if (!clip) { this.fallback(a, 'tts-failed'); return; }
      if (this.time() - a.at >= this.deadlineMs) { this.fallback(a, 'deadline'); return; }
      a.clip = clip; a.track = new SpeechTrack(cue.line.text, clip.marks, clip.durationMs);
      // Reserve a bounded native speech/read hold while the decoder becomes ready.
      // The core excludes timed hunts, mash/vote deadlines and optional quips.
      if (this.deadlineMs > VOICE_DEADLINE_MS) this.timing?.(cue.line.text, this.deadlineMs + clip.durationMs - (this.time() - a.at));
      try {
        const playback = await this.bus.startSpeech(clip.uri, clip.nativeAudio,
          () => this.active === a && a.path === 'pending' && this.time() - a.at < this.deadlineMs);
        if (this.active !== a || a.path !== 'pending') { playback?.stop(); return; }
        a.playback = playback;
        this.cache.refresh();
        if (!playback) this.fallback(a, 'audio-unavailable');
      } catch { if (this.active === a) this.fallback(a, 'playback-error'); }
    });
  }
  settings(sound: boolean, voice: boolean): void {
    this.sound = sound; this.enabled = voice;
    if (this.active && (!sound || !voice) && this.active.path !== 'blips') this.fallback(this.active, sound ? 'voice-off' : 'sound-off');
  }
  pause(value: boolean): void {
    if (value && this.frozenAt === undefined) { this.frozenAt = this.now(); this.cancelDeadline(); }
    else if (!value && this.frozenAt !== undefined) { this.pauseTotal += this.now() - this.frozenAt; this.frozenAt = undefined; if (this.active?.path === 'pending') this.arm(this.active); }
  }
  private cancelDeadline(): void { if (this.deadline !== undefined) this.timers?.clearTimeout(this.deadline); this.deadline = undefined; }
  private arm(a: Active): void {
    this.cancelDeadline(); if (this.frozenAt !== undefined) return;
    this.deadline = this.timers?.setTimeout(() => { this.deadline = undefined; if (this.active === a) this.decide(a); }, Math.max(0, this.deadlineMs - (this.time() - a.at)));
  }
  private decide(a: Active): void {
    if (a.path !== 'pending') return;
    const elapsed = Math.max(0, this.time() - a.at), position = a.playback?.positionMs ?? 0;
    if (a.playback?.failed) this.fallback(a, 'playback-error');
    else if (position > 0 && elapsed - position < this.deadlineMs) {
      a.path = 'polly'; this.cancelDeadline(); this.route(a, 'ready', Math.max(0, elapsed - position));
      this.timing?.(a.cue.line.text, Math.max(0, a.clip!.durationMs - position));
    } else if (elapsed >= this.deadlineMs) this.fallback(a, 'deadline');
  }
  frame(text: string): VoiceFrame | undefined {
    const a = this.active;
    if (!a || a.cue.line.text !== text) return;
    const elapsed = Math.max(0, this.time() - a.at);
    this.decide(a);
    if (a.path === 'polly' && a.playback?.failed) this.fallback(a, 'playback-error');
    if (a.path === 'polly') {
      const position = a.finished || a.playback!.ended ? a.clip!.durationMs : a.playback!.positionMs;
      const frame = a.track!.sample(position);
      if (frame.characters !== a.lastCharacters || frame.target !== a.lastJaw) {
        a.lastCharacters = frame.characters; a.lastJaw = frame.target;
        this.report('voice-sample', { lineSeq: a.seq, characters: frame.characters, jaw: frame.target, elapsedMs: Math.round(position), talking: frame.talking });
      }
      if (!frame.talking && !a.finished) { a.finished = true; this.complete(a, 'ended', position); a.playback!.stop(); }
      return frame;
    }
    if (a.path === 'pending') return { characters: 0, target: 0, talking: false };
    const cadence = a.cue.cadence, length = text.replace(/\*\*/g, '').length;
    const characters = a.finished ? length : Math.min(length, Math.floor(elapsed / cadence.intervalMs) * cadence.characters);
    const talking = !a.finished && characters < length;
    const beat = Math.floor(characters / cadence.voiceEveryCharacters);
    if (talking && this.frozenAt === undefined && characters > 0 && beat !== a.lastBeat) { a.lastBeat = beat; if (this.sound) void this.bus.play('voice'); }
    const range = characters % cadence.voiceEveryCharacters === 0 ? cadence.talkingOpen : cadence.quietOpen;
    if (!talking && !a.finished) { a.finished = true; this.complete(a, 'typed', elapsed); }
    return { characters, target: talking ? range[0] + Math.random() * (range[1] - range[0]) : 0, talking };
  }
  /** Natural core typing completion does not cut a longer Polly clip. */
  finish(force = false): void {
    const a = this.active;
    if (a) this.decide(a);
    if (a?.path === 'pending' && !force && this.deadlineMs > VOICE_DEADLINE_MS && this.time() - a.at < this.deadlineMs) return;
    if (!a || a.finished || !force && a.path === 'polly') return;
    if (a.path === 'pending') this.fallback(a, 'finished');
    a.finished = true; this.complete(a, 'typed', this.time() - a.at);
    if (force) a.playback?.stop();
  }
  stop(reason = 'hidden'): void {
    this.cancelDeadline();
    const a = this.active; if (!a) return;
    if (a.path === 'pending') this.fallback(a, reason);
    if (!a.finished) this.complete(a, reason, a.playback?.positionMs ?? this.time() - a.at);
    a.playback?.stop(); this.active = undefined;
  }
  private fallback(a: Active, reason: string): void {
    this.cancelDeadline();
    a.playback?.stop(); a.playback = undefined;
    const changed = a.path === 'polly'; a.path = 'blips';
    if (changed) this.report('voice-fallback', { lineSeq: a.seq, reason });
    this.route(a, reason);
  }
  private route(a: Active, reason: string, latency = this.time() - a.at): void {
    if (a.reported) return; a.reported = true;
    this.report('voice-line', { lineSeq: a.seq, trigger: a.cue.line.trigger, path: a.path, reason,
      latencyMs: Math.round(latency), durationMs: a.clip?.durationMs ?? a.cue.typingMs,
      prefetched: a.prefetched, wordMarks: a.clip?.marks.filter(m => m.type === 'word').length ?? 0,
      visemeMarks: a.clip?.marks.filter(m => m.type === 'viseme').length ?? 0 });
  }
  private complete(a: Active, reason: string, elapsedMs: number): void {
    this.report('voice-complete', { lineSeq: a.seq, path: a.path, reason, elapsedMs: Math.round(elapsedMs) });
  }
}
