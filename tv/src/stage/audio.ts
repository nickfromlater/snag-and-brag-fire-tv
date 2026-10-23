import { Platform } from '@amazon-devices/react-native-kepler';
import { clamp } from '@snag/shared';
import type { MusicMood, Sfx } from '@snag/shared';
import manifest from '../../../assets/audio/manifest.json';
import sfxAtlas from './generated/sfx-atlas.json';
import { AudioPlayer } from './platform';
import { audioUrls } from './generated/audio';
import { AudioPool } from './audio-pool';
import type { SpeechPlayback } from './voice';
import { attachSpeechSource } from './speech-source';
import { SpeechStream } from './speech-stream';
import type { SpeechRange } from './speech-stream';
import { traceNativeCalls } from './work-monitor';

type File = typeof manifest.files[number];
/** One Polly line on the shared speech timeline. Its position is a wall clock anchored on a real
 * playback signal, so lip sync never reads the native `currentTime` per frame (5,000 reads a game). */
interface StreamLine {
  token: number; range: SpeechRange; timer?: ReturnType<typeof setTimeout>; confirm?: ReturnType<typeof setTimeout>;
  /** performance.now() at which the line's position was 0; undefined until playback is confirmed. */
  anchor?: number; anchoredBy?: 'playing' | 'read' | 'resume';
  /** Position (s) held while the engine is paused. */
  frozen?: number;
}
/** The one confirming `currentTime` read per line, after the seek has had time to land. */
export const STREAM_CONFIRM_MS = 600;
/** Clock anchors lean late: a late clock only trims the 1 s of silence after a line, an early one
 * would end the lip sync (and stop the element) before the audio has finished. */
const STREAM_LATE_BIAS_MS = 40;
interface Player { api: AudioPlayer; file?: string; codec?: 'wav' | 'ogg'; busy: boolean; voice?: number; ended: boolean; errors: number; gain?: number; speechReady?: boolean; clipEnd?: number; clipTimer?: ReturnType<typeof setTimeout> }
const atlasClips: Record<string, { start: number; duration: number } | undefined> = sfxAtlas.clips;
/** Native effects never reassign src mid-game: Vega's src setter is a synchronous native
 * load (p50 118 ms, max 835 ms on the stick) and one hang was killed by the thread monitor. */
const ATLAS = Platform.OS !== 'web';
const MUSIC_FILES = manifest.files.filter(f => f.kind === 'music');
/** One looping player per music track (6 instead of 2 swapped ones). If the stick's audio
 * server cannot hold 8 effect + 6 music + 1 voice streams (MediaError code 3), set false to
 * return to two players that load the next track at each mood change. */
export const MUSIC_PLAYER_PER_TRACK = true;
/** Polly lines append to one session MediaSource instead of attaching a new one per line
 * (130-700 ms of blocked JS per line on the stick). False restores per-line attach. */
export const SPEECH_SINGLE_SOURCE = true;
/** Seek-to-sound latency is 42-220 ms (VVD); clips are separated by 1.5 s of silence, so the
 * end timer runs this much past the clip to keep its tail (and 90 ms clips) audible, and a
 * late timer (busy JS) still lands in silence rather than the next clip. */
const ATLAS_START_ALLOWANCE_MS = 600;
const ATLAS_SILENCE_AT = Math.max(...Object.values(atlasClips).map(c => c!.start + c!.duration)) + .4;
interface PreparedSpeech { uri: string; player?: Player; detach?: (reset?: boolean) => void; cancelled: boolean; ready: boolean; consumed: boolean; warmed?: boolean; disposed?: boolean; token?: number; canStart?: () => boolean; promise: Promise<void> }
export const VOICE_DUCK_GAIN = Math.pow(10, -6 / 20);
const warmEffects: Sfx[] = ['voice', 'voice', 'mash', 'mash', 'tick', 'rollTick', 'pop', 'react'];
export function selectAudio(name: Sfx, args: (string | number)[], serial: number): File {
  let bank = manifest.files.filter(f => f.kind === 'sfx' && f.effect === name);
  if (name === 'voice' || name === 'boom') return bank[serial % bank.length]!;
  if (name === 'react') {
    const kind = String(args[0] ?? 'star'); bank = bank.filter(f => f.parameters && 'kind' in f.parameters && f.parameters.kind === kind);
    const n = Number(args[1] ?? 0) % 10;
    return bank.find(f => 'n' in f.parameters && f.parameters.n === n) ?? bank[serial % bank.length]!;
  }
  const parameter = name === 'mtick' ? 'p' : name === 'drumroll' || name === 'riser' ? 'sec' : name === 'crowd' ? 'v' : 'n';
  const value = name === 'crowd' ? Number(args[1] ?? .16) : name === 'mash' ? Number(args[0] ?? 0) % 13 : Number(args[0] ?? 0);
  return bank.sort((a, b) => Math.abs(Number((a.parameters as Record<string, unknown>)[parameter] ?? 0) - value) - Math.abs(Number((b.parameters as Record<string, unknown>)[parameter] ?? 0) - value))[0]!;
}
/** Reference effect/music files plus a single room-authenticated Polly voice bus. */
export class AudioEngine {
  readonly policy = new AudioPool();
  private readonly players: Player[] = [];
  private loading?: Promise<Player[]>;
  private readonly music: Player[] = [];
  private musicLoading?: Promise<void>;
  private serial = 0; private generation = 0; private selected: MusicMood = 'off';
  private playerSerial = 0;
  private currentMusic?: Player; private startedAt = 0; private currentFile?: File;
  private pending?: ReturnType<typeof setTimeout>; private fade?: ReturnType<typeof setInterval>;
  private closed = false; private musicEnabled = true; private soundEnabled = true; private paused = false;
  private disposal?: Promise<void>;
  private probing = false;
  private speech?: Player; private speechLoading?: Promise<Player | undefined>; private speechGeneration = 0; private ducking = false;
  private detachSpeech?: (resetPlayer?: boolean) => void; private retiringSpeech?: Promise<void>;
  private preparedSpeech?: PreparedSpeech;
  private speechWarmGeneration = 0;
  private stream?: { p: Player; s: SpeechStream }; private streamLoading?: Promise<void>; private streamBroken = false;
  private readonly streamRanges = new Map<string, Promise<SpeechRange>>(); private streamLine?: StreamLine;
  codec: 'wav' | 'ogg' = 'ogg';
  readonly masterGain = manifest.mix.runtimeOverlap.peakDbfs > 0 ? Math.pow(10, -manifest.mix.runtimeOverlap.peakDbfs / 20) : 1;
  constructor(private readonly report: (kind: string, data: Record<string, string | number | boolean | null>) => void, private readonly options = { singleSourceSpeech: SPEECH_SINGLE_SOURCE }) {}
  private uri(file: File, codec = this.codec): string { return Platform.OS === 'web' ? audioUrls[file.id]! : '/pkg/assets/raw/' + file.id + '.' + codec; }
  private async player(file?: File, codec = this.codec, target?: string): Promise<Player> {
    const api = traceNativeCalls(new AudioPlayer(), target ?? 'audio-' + ++this.playerSerial,
      ['initialize', 'deinitialize', 'play', 'pause', 'load'], ['src', 'srcObject', 'currentTime', 'volume'], ['currentTime']), p: Player = { api, busy: false, ended: false, errors: 0 };
    await api.initialize(); api.autoplay = false; api.volume = this.masterGain;
    api.addEventListener('ended', () => { p.ended = true; p.busy = false; if (p.voice) this.policy.end(p.voice); });
    api.addEventListener('error', () => { p.errors++; const detail = String(api.error?.message ?? '').replace(/(?:https?|wss?):\/\/\S+/gi, '<uri>').replace(/\b[0-9a-f]{32,}\b/gi, '<key>').replace(/(?:roomKey|tvKey|\bk)=\S+/gi, '<key>').slice(0, 140); this.report('audio-error', { file: p.file ?? 'music', codec: p.file === 'polly' ? (Platform.OS === 'web' ? 'mp3' : 'aac') : p.codec ?? this.codec, code: String(api.error?.code ?? 'unknown'), ...(p.file === 'polly' ? { source: detail } : {}) }); });
    if (file) this.load(p, file, codec);
    return p;
  }
  private async atlasPlayer(): Promise<Player> {
    const p = await this.player();
    p.api.pause(); p.file = 'atlas'; p.ended = true; p.api.loop = false;
    p.api.src = '/pkg/assets/raw/' + sfxAtlas.file;
    // Warm the decoder's first seek silently, in the lobby: a cold first seek took over a second.
    p.api.volume = 0; p.api.currentTime = ATLAS_SILENCE_AT; p.api.play();
    setTimeout(() => { if (!p.busy && !this.closed) { p.api.pause(); p.api.volume = this.masterGain; } }, 800);
    return p;
  }
  private endClip(p: Player, afterMs: number): void {
    clearTimeout(p.clipTimer);
    p.clipTimer = setTimeout(() => { p.clipTimer = undefined; if (!p.busy) return; p.api.pause(); p.busy = false; p.ended = true; if (p.voice) this.policy.end(p.voice); }, Math.max(0, afterMs));
  }
  private load(p: Player, file: File, codec = this.codec): void {
    p.api.pause(); p.file = file.id; p.codec = codec; p.ended = false;
    // Vega's src setter runs the native load algorithm itself. Loading again
    // immediately tears down the new decoder and can block JS past the watchdog.
    p.api.src = this.uri(file, codec);
    if (Platform.OS === 'web') p.api.load();
  }
  private bank(): Promise<Player[]> {
    if (this.loading) return this.loading;
    if (this.players.length === this.policy.max || this.closed) return Promise.resolve(this.players);
    // The active-voice limit must also bound native media instances. Paused players
    // retain audio streams on Vega; one bank per effect exhausts shared memory.
    const task = (async () => {
      for (let i = this.players.length; i < this.policy.max && !this.closed; i++) {
        const p = ATLAS ? await this.atlasPlayer() : await this.player(selectAudio(warmEffects[i % warmEffects.length]!, [], i));
        if (this.closed) { await p.api.deinitialize(); return []; }
        this.players.push(p);
      }
      return this.players;
    })();
    this.loading = task;
    void task.finally(() => { this.loading = undefined; });
    return task;
  }
  async preload(): Promise<void> {
    // Voice initialization runs alongside the bounded effects bank, before a line.
    const speech = this.useStream() ? this.speechStream().then(() => this.stream ? undefined : this.speechBank()) : this.speechBank();
    await this.bank(); if (this.closed) return;
    await this.musicBank(); if (this.closed) return;
    await speech;
    this.report('audio-preloaded', { players: this.players.length + this.music.length + (this.speech || this.stream ? 1 : 0), unity: true, master: this.masterGain, overlapDbfs: manifest.mix.runtimeOverlap.peakDbfs, codec: this.codec });
  }
  async play(name: Sfx, args: (string | number)[] = []): Promise<void> {
    const file = selectAudio(name, args, this.serial++); if (file) await this.playFile(file);
  }
  private async playFile(file: File): Promise<Player | undefined> {
    if (this.closed || !this.soundEnabled || this.paused) return;
    const name = file.effect as Sfx;
    const selected = this.policy.start(name, performance.now(), file.durationSeconds * 1000); if (!selected) return;
    if (selected.stolen) for (const p of this.players) if (p.voice === selected.stolen.id) { p.api.pause(); p.busy = false; }
    const bank = await this.bank();
    if (this.closed || this.paused || !this.soundEnabled || !bank.length || !this.policy.active.has(selected.voice.id)) { this.policy.end(selected.voice.id); return; }
    const available = (p: Player) => !p.busy || !p.voice || !this.policy.active.has(p.voice);
    const clip = ATLAS && !(this.probing && this.codec === 'wav') ? atlasClips[file.id] : undefined;
    const p = clip ? bank.find(p => available(p) && p.file === 'atlas') ?? bank.find(p => p.file === 'atlas') ?? bank[0]! : bank.find(p => available(p) && p.file === file.id && p.codec === this.codec) ?? bank.find(available) ?? bank[0]!;
    if (p.busy) { p.api.pause(); if (p.voice) this.policy.end(p.voice); }
    if (this.closed) { this.policy.end(selected.voice.id); return; }
    if (clip && p.file === 'atlas') {
      p.voice = selected.voice.id; p.busy = true; p.ended = false; p.clipEnd = clip.start + clip.duration;
      p.api.currentTime = clip.start; p.api.volume = this.masterGain; p.api.play();
      this.endClip(p, clip.duration * 1000 + ATLAS_START_ALLOWANCE_MS);
      return p;
    }
    if (p.file !== file.id || p.codec !== this.codec) this.load(p, file);
    p.voice = selected.voice.id; p.busy = true; p.ended = false; p.api.currentTime = 0; p.api.volume = this.masterGain; p.api.play();
    return p;
  }
  async mood(mood: MusicMood): Promise<void> {
    this.selected = mood; const token = ++this.generation;
    clearTimeout(this.pending);
    if (mood === 'off' || !this.musicEnabled) { this.crossfade(undefined); return; }
    if (this.currentFile?.parameters && 'mood' in this.currentFile.parameters && this.currentFile.parameters.mood === mood) return;
    await this.musicBank();
    if (token !== this.generation || this.closed) return;
    const file = manifest.files.find(f => f.id === 'music-' + mood)!;
    const old = this.currentFile, barMs = old?.loop ? old.loop.lengthSamples / manifest.format.sampleRate / old.loop.bars * 1000 : 0;
    const delay = old && barMs ? (barMs - (performance.now() - this.startedAt) % barMs) % barMs : 0;
    this.pending = setTimeout(() => { if (token === this.generation) this.crossfade(file); }, delay);
  }
  private musicBank(): Promise<void> {
    if (this.musicLoading) return this.musicLoading;
    const task = (async () => {
      // One looping player per track, loaded once at startup: a mood change is only a seek,
      // play/pause and a volume fade. A src swap is a synchronous native load on Vega
      // (about 15 per game on the stick, up to 694 ms each).
      for (const file of MUSIC_PLAYER_PER_TRACK ? MUSIC_FILES : [undefined, undefined]) {
        if (this.closed || file && this.music.some(p => p.file === file.id) || !file && this.music.length >= 2) continue;
        const p = await this.player();
        if (this.closed) { await p.api.deinitialize(); return; }
        if (file) { this.load(p, file); p.api.loop = true; }
        this.musicGain(p, 0); this.music.push(p);
      }
    })();
    this.musicLoading = task;
    void task.finally(() => { this.musicLoading = undefined; });
    return task;
  }
  private crossfade(file: File | undefined): void {
    clearInterval(this.fade);
    let next = file ? this.music.find(p => p.file === file.id) : undefined;
    if (file && !next && !MUSIC_PLAYER_PER_TRACK) { next = this.music.find(p => p !== this.currentMusic); if (next) { this.load(next, file); next.api.loop = true; this.musicGain(next, 0); } }
    const fading = this.music.filter(p => p !== next && ((p.gain ?? 0) > 0 || p === this.currentMusic)), from = fading.map(p => p.gain ?? 0);
    if (next) {
      if (!(next.gain ?? 0)) next.api.currentTime = 0;
      if (!this.paused) next.api.play();
      this.currentFile = file; this.startedAt = performance.now();
    }
    this.currentMusic = next;
    const start = performance.now(), nextFrom = next?.gain ?? 0;
    this.fade = setInterval(() => {
      const t = clamp((performance.now() - start) / 500, 0, 1);
      fading.forEach((p, i) => this.musicGain(p, from[i]! * (1 - t)));
      if (next) this.musicGain(next, nextFrom + (1 - nextFrom) * t);
      if (t === 1) { clearInterval(this.fade); fading.forEach(p => p.api.pause()); if (!file) this.currentFile = undefined; }
    }, 40);
  }
  private musicGain(p: Player, gain: number): void { p.gain = gain; p.api.volume = gain * this.masterGain * (this.ducking ? VOICE_DUCK_GAIN : 1); }
  private duck(value: boolean): void {
    if (this.ducking === value) return;
    // Only the audible track: one native volume write when the host starts and one when he stops.
    this.ducking = value; this.music.forEach(p => { if ((p.gain ?? 0) > 0) this.musicGain(p, p.gain!); });
    this.report('voice-duck', { voice: value, master: value ? VOICE_DUCK_GAIN : 1 });
  }
  private speechBank(): Promise<Player | undefined> {
    if (this.speech) return Promise.resolve(this.speech);
    if (this.speechLoading) return this.speechLoading;
    if (this.closed) return Promise.resolve(undefined);
    const generation = this.speechWarmGeneration;
    const task = (async () => {
      await this.retiringSpeech; if (this.closed) return;
      const p = await this.player();
      if (this.closed || generation !== this.speechWarmGeneration) { await p.api.deinitialize(); return; }
      p.file = 'polly';
      p.api.addEventListener('ended', () => { this.duck(false); });
      this.speech = p; return p;
    })();
    this.speechLoading = task;
    void task.then(() => { this.speechLoading = undefined; }, () => { this.speechLoading = undefined; });
    return task;
  }
  /** One upcoming native clip can be fully buffered beside the current voice.
   * Native source setup runs during an earlier speech/read hold, before its cue. */
  private useStream(): boolean { return this.options.singleSourceSpeech && Platform.OS !== 'web' && !this.streamBroken && !this.closed; }
  /** Attach the session's single voice MediaSource once, in the lobby. */
  private speechStream(): Promise<void> {
    if (this.stream || !this.useStream()) return Promise.resolve();
    this.streamLoading ??= (async () => {
      const p = await this.player(undefined, this.codec, 'speech-player'); p.file = 'polly';
      if (this.closed) { await p.api.deinitialize(); return; }
      p.api.loop = false; p.api.volume = this.masterGain;
      p.api.addEventListener('playing', () => { const line = this.streamLine; if (line && line.anchor === undefined && line.frozen === undefined && !this.paused) { line.anchor = performance.now() + STREAM_LATE_BIAS_MS; line.anchoredBy = 'playing'; } });
      try { this.stream = { p, s: new SpeechStream(p.api) }; }
      catch (error) { void p.api.deinitialize(); throw error; }
    })().catch(() => { this.streamBroken = true; this.report('audio-error', { file: 'polly', codec: 'aac', code: 'stream-attach' }); });
    return this.streamLoading;
  }
  private streamRange(uri: string, nativeAudio: ArrayBuffer, durationMs = 0): Promise<SpeechRange> | undefined {
    if (!this.stream) return;
    let range = this.streamRanges.get(uri);
    if (!range) {
      const from = this.streamLine?.range.start ?? 0;
      range = this.stream.s.append(nativeAudio, durationMs, from);
      this.streamRanges.set(uri, range);
      while (this.streamRanges.size > 4) this.streamRanges.delete(this.streamRanges.keys().next().value!);
    }
    return range;
  }
  prepareSpeech(uri: string, nativeAudio?: ArrayBuffer, durationMs?: number): void {
    if (nativeAudio && this.useStream()) { void this.speechStream().then(() => { if (this.useStream()) void this.streamRange(uri, nativeAudio, durationMs)?.catch(() => {}); }); return; }
    if (Platform.OS === 'web' || this.closed || !nativeAudio) return;
    if (this.preparedSpeech?.uri === uri) return;
    if (this.preparedSpeech) this.clearPreparedSpeech();
    const slot: PreparedSpeech = { uri, cancelled: false, ready: false, consumed: false, promise: Promise.resolve() };
    this.preparedSpeech = slot;
    slot.promise = (async () => {
      await this.retiringSpeech; if (this.closed || slot.cancelled) return;
      // The idle voice bank is already initialized. Borrow it instead of doing
      // another native initialize and then retiring that unused bank at the cue.
      const idle = this.speech && !this.speech.busy && !this.detachSpeech ? this.speech : undefined;
      if (idle) this.speech = undefined;
      const p = idle ?? await this.player(); slot.player = p; p.file = 'polly'; p.speechReady = false;
      if (this.closed || slot.cancelled) { slot.disposed = true; await p.api.deinitialize(); return; }
      p.api.loop = false;
      p.api.volume = 0;
      p.api.addEventListener('playing', () => {
        if (slot.consumed || slot.cancelled || slot.warmed) return;
        slot.warmed = true; p.api.pause(); p.api.currentTime = 0;
      });
      slot.detach = attachSpeechSource(p.api, uri, () => {
        slot.ready = true; p.speechReady = true; p.ended = false;
        if (slot.consumed && slot.token === this.speechGeneration && slot.canStart?.()) { this.duck(true); if (!this.paused) p.api.play(); }
        else if (!slot.consumed && !slot.cancelled) p.api.play(); // Silent decoder warmup; pause on playing.
      }, () => { p.errors++; slot.cancelled = true; }, nativeAudio);
    })().catch(() => { slot.cancelled = true; });
  }
  clearPreparedSpeech(): void {
    const slot = this.preparedSpeech; this.preparedSpeech = undefined;
    if (!slot) return; slot.cancelled = true;
    const release = () => {
      if (slot.player && !slot.consumed && !slot.disposed) { slot.disposed = true; slot.player.api.pause(); return slot.player.api.deinitialize().then(() => { slot.detach?.(false); }); }
    };
    // Backgrounding suspends JS. Start native cleanup now when initialization
    // already finished, rather than scheduling it after a promise continuation.
    const dispose = slot.player ? release() : slot.promise.then(release);
    this.retiringSpeech = Promise.all([this.retiringSpeech, dispose]).then(() => {});
  }
  async startSpeech(uri: string, nativeAudio?: ArrayBuffer, canStart: () => boolean = () => true): Promise<SpeechPlayback | undefined> {
    const token = ++this.speechGeneration;
    this.stopSpeech();
    if (nativeAudio && this.useStream()) {
      await this.speechStream();
      const pending = this.useStream() ? this.streamRange(uri, nativeAudio) : undefined;
      if (pending) {
        let range: SpeechRange | undefined;
        try { range = await pending; } catch { this.streamBroken = true; this.report('audio-error', { file: 'polly', codec: 'aac', code: 'stream-append' }); }
        this.streamRanges.delete(uri);
        if (range) return this.playStreamLine(token, range, canStart);
        if (token !== this.speechGeneration) return;
      }
    }
    const prepared = this.preparedSpeech?.uri === uri ? this.preparedSpeech : undefined;
    if (prepared) { this.preparedSpeech = undefined; prepared.consumed = true; prepared.token = token; prepared.canStart = canStart; this.speechWarmGeneration++; await prepared.promise; }
    const p = prepared?.player ?? await this.speechBank();
    if (!p || prepared?.cancelled || this.closed || !this.soundEnabled || this.paused || token !== this.speechGeneration || !canStart()) {
      if (prepared?.player && !prepared.disposed) { prepared.disposed = true; this.retireSpeech(prepared.player, () => prepared.detach?.(false)); }
      return;
    }
    if (prepared) {
      const unused = this.speech;
      if (unused && unused !== p) { unused.api.pause(); this.retireSpeech(unused); }
      this.speech = p;
    }
    // A warmed slot already paused and sought to zero before this cue. Repeating
    // that native seek here can stall an otherwise prepared MediaSource element.
    if (!prepared?.warmed) p.api.pause();
    p.busy = true; p.ended = false; p.speechReady = prepared?.ready ?? false;
    const errors = p.errors;
    p.api.loop = false; p.api.volume = this.masterGain;
    if (prepared) { this.detachSpeech = prepared.detach; if (prepared.ready) { if (!prepared.warmed) p.api.currentTime = 0; if (canStart()) { this.duck(true); p.api.play(); } } }
    else if (Platform.OS === 'web') { p.api.src = uri; p.api.load(); p.api.currentTime = 0; p.speechReady = true; if (canStart()) { this.duck(true); p.api.play(); } }
    else this.detachSpeech = attachSpeechSource(p.api, uri, () => {
      if (token !== this.speechGeneration || this.closed || !canStart()) return;
      p.speechReady = true; p.ended = false; this.duck(true); if (!this.paused) p.api.play();
    }, () => { if (token === this.speechGeneration) { p.errors++; this.report('audio-error', { file: 'polly', codec: 'aac', code: 'buffer' }); } }, nativeAudio);
    return {
      get positionMs() { return p.speechReady ? Math.max(0, p.api.currentTime * 1000) : 0; },
      get ended() { return !!p.speechReady && p.ended; },
      get failed() { return p.errors !== errors; },
      stop: () => { if (token === this.speechGeneration) { this.speechGeneration++; this.stopSpeech(); } },
    };
  }
  private playStreamLine(token: number, range: SpeechRange, canStart: () => boolean): SpeechPlayback | undefined {
    const stream = this.stream;
    if (!stream || token !== this.speechGeneration || this.closed || !this.soundEnabled || this.paused || !canStart()) return;
    const p = stream.p, errors = p.errors, duration = range.end - range.start;
    // Volume was set once at attach; a per-line write on this element blocked JS up to 253 ms (VVD).
    p.busy = true; p.ended = false;
    p.api.currentTime = range.start; this.duck(true); p.api.play();
    const line: StreamLine = { token, range };
    // Safety stop: the shared timeline stalls at the gap after a line, but never leave it playing.
    line.timer = setTimeout(() => { if (this.streamLine === line) { p.api.pause(); p.busy = false; } }, duration * 1000 + 2000);
    this.streamLine = line;
    this.confirmStreamLine(line, STREAM_CONFIRM_MS);
    const position = (): number => {
      if (line.frozen !== undefined) return line.frozen;
      if (line.anchor === undefined) return -1;
      return clamp((performance.now() - line.anchor) / 1000, 0, duration);
    };
    return {
      get positionMs() { return Math.max(0, position() * 1000); },
      get ended() { return position() >= duration; },
      get failed() { return p.errors !== errors; },
      stop: () => { if (token === this.speechGeneration) { this.speechGeneration++; this.stopSpeech(); } },
    };
  }
  /** One native position read per line. In range and advancing: re-anchor the clock on it. Already
   * anchored by `playing` but not advancing: the decoder is stuck, so fail the line to blips. */
  private confirmStreamLine(line: StreamLine, afterMs: number): void {
    clearTimeout(line.confirm);
    line.confirm = setTimeout(() => {
      line.confirm = undefined;
      const stream = this.stream;
      if (!stream || this.streamLine !== line || this.paused) return;
      const t = stream.p.api.currentTime, { start, end } = line.range;
      if (t > start + .02 && t <= end + .5) { line.anchor = performance.now() - (t - start) * 1000 + STREAM_LATE_BIAS_MS; line.anchoredBy = 'read'; }
      // At the line's start but not moving although `playing` fired. (Outside the range means the
      // seek has not landed yet: keep waiting for `playing`; the voice deadline falls back to blips.)
      else if (t >= start - .05 && t <= start + .02 && line.anchoredBy === 'playing') { stream.p.errors++; this.report('audio-error', { file: 'polly', codec: 'aac', code: 'stream-stalled' }); }
    }, afterMs);
  }
  private stopSpeech(): void {
    const line = this.streamLine;
    if (line && this.stream) { clearTimeout(line.timer); clearTimeout(line.confirm); this.streamLine = undefined; this.stream.p.api.pause(); this.stream.p.busy = false; this.duck(false); }
    const p = this.speech, detach = this.detachSpeech;
    this.detachSpeech = undefined;
    if (p) { p.api.pause(); p.busy = false; }
    if (p && detach && Platform.OS !== 'web') {
      // Reloading a completed native MSE element can stall the JS thread. Destroy
      // it asynchronously, release its bytes, then warm a fresh voice element.
      this.speech = undefined;
      this.speechWarmGeneration++; this.retireSpeech(p, () => detach(false));
      if (!this.preparedSpeech || this.preparedSpeech.cancelled) void this.speechBank();
    } else detach?.();
    this.duck(false);
  }
  private retireSpeech(p: Player, release?: () => void): void {
    const dispose = p.api.deinitialize().then(() => { release?.(); }, () => { release?.(); });
    this.retiringSpeech = Promise.all([this.retiringSpeech, dispose]).then(() => {});
  }
  settings(sound: boolean, music: boolean): void {
    this.soundEnabled = sound; this.musicEnabled = music;
    if (!sound) { this.players.forEach(p => { p.api.pause(); p.busy = false; clearTimeout(p.clipTimer); p.clipTimer = undefined; }); this.policy.clear(); this.speechGeneration++; this.stopSpeech(); }
    void this.mood(this.selected);
  }
  pause(value: boolean): void {
    this.paused = value;
    if (value) { this.players.forEach(p => { p.api.pause(); clearTimeout(p.clipTimer); p.clipTimer = undefined; }); this.music.forEach(p => p.api.pause()); this.speech?.api.pause(); if (this.streamLine && this.stream) { const line = this.streamLine; this.stream.p.api.pause(); clearTimeout(line.timer); clearTimeout(line.confirm); if (line.anchor !== undefined && line.frozen === undefined) { line.frozen = clamp((performance.now() - line.anchor) / 1000, 0, line.range.end - line.range.start); line.anchor = undefined; } } }
    else { this.players.filter(p => p.busy).forEach(p => { p.api.play(); if (p.file === 'atlas' && p.clipEnd !== undefined) this.endClip(p, (p.clipEnd - p.api.currentTime) * 1000 + ATLAS_START_ALLOWANCE_MS); }); if (this.musicEnabled && this.currentFile) this.currentMusic?.api.play(); if (this.soundEnabled && this.speech?.busy && this.speech.speechReady) this.speech.api.play();
      const line = this.streamLine, stream = this.stream;
      // Resume from the frozen position without a read; lean late for the restart latency.
      if (line && stream && line.frozen !== undefined) { line.anchor = performance.now() - line.frozen * 1000 + STREAM_LATE_BIAS_MS + 60; line.anchoredBy = 'resume'; line.frozen = undefined; }
      else if (line && stream && line.anchor === undefined) this.confirmStreamLine(line, STREAM_CONFIRM_MS);
      if (line && stream && this.soundEnabled) { stream.p.api.play(); line.timer = setTimeout(() => { if (this.streamLine === line) { stream.p.api.pause(); stream.p.busy = false; } }, (line.range.end - line.range.start) * 1000 + 2000); } }
  }
  /** Player-state latency, not acoustic latency. Mac is always muted. */
  async probeCodec(codec: 'wav' | 'ogg'): Promise<void> {
    const p = await this.player(selectAudio('tick', [], 0), codec);
    const measure = async (warm: boolean) => new Promise<void>(resolve => {
      const start = performance.now(); let done = false;
      const finish = (ok: boolean) => { if (done) return; done = true; clearInterval(poll); this.report('audio-latency', { codec, warm, milliseconds: performance.now() - start, advancing: ok }); p.api.pause(); resolve(); };
      p.api.currentTime = 0; p.api.play();
      const poll = setInterval(() => { if (!p.api.paused && p.api.currentTime > 0) finish(true); }, 5);
      setTimeout(() => finish(false), 1500);
    });
    await measure(false); await measure(true); await p.api.deinitialize();
  }
  /** Play exact asset ids through the production pool; receipts never contain audio/media. */
  async probeEffects(codec: 'wav' | 'ogg', ids?: readonly string[]): Promise<void> {
    if (this.closed || this.probing) return;
    this.probing = true;
    const previous = { codec: this.codec, sound: this.soundEnabled, music: this.musicEnabled, paused: this.paused };
    this.codec = codec; this.settings(true, false); this.pause(false); this.policy.clear();
    const files = manifest.files.filter(f => f.kind === 'sfx' && (!ids || ids.includes(f.id)));
    const seen = new Set<string>();
    let passed = 0;
    try {
      for (const file of files.flatMap(file => [file, file])) {
        if (this.closed) break;
        const warm = seen.has(file.id); seen.add(file.id);
        const start = performance.now(), p = await this.playFile(file), errors = p?.errors ?? 0;
        let advancing = false, firstAdvanceMs = -1;
        // Atlas voices start mid-file: advancing means past the clip's own start.
        const clip = p?.file === 'atlas' ? atlasClips[file.id] : undefined, from = clip ? clip.start + .02 : 0;
        if (p) await new Promise<void>(resolve => {
          const poll = setInterval(() => {
            if (!advancing && p.api.currentTime > from) { advancing = true; firstAdvanceMs = performance.now() - start; }
            if (!this.closed && !p.ended && p.errors === errors && performance.now() - start < file.durationSeconds * 1000 + 1800) return;
            clearInterval(poll); resolve();
          }, 20);
        });
        const pass = !!p && p.ended && advancing && p.errors === errors;
        if (pass) passed++;
        this.report('audio-effect', { file: file.id, codec, warm, ...(clip ? { latencyMs: Math.round(firstAdvanceMs), source: 'atlas' } : {}), seconds: file.durationSeconds, milliseconds: performance.now() - start, advancing, completed: p?.ended ?? false, exceptions: (p?.errors ?? errors) - errors, pass });
        if (p) { p.api.pause(); p.busy = false; if (p.voice) this.policy.end(p.voice); }
      }
      this.report('audio-effects-complete', { codec, players: this.players.length + this.music.length, frames: files.length * 2, sample: passed, pass: passed === files.length * 2 && files.length > 0 });
    } finally {
      this.codec = previous.codec; this.settings(previous.sound, previous.music); this.pause(previous.paused); this.probing = false;
    }
  }
  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.closed = true; this.generation++; this.speechGeneration++; this.clearPreparedSpeech(); this.stopSpeech(); clearTimeout(this.pending); clearInterval(this.fade);
    // Invoke every native release before yielding: Vega can suspend JS as soon
    // as the app leaves foreground, leaving a sequential await loop unfinished.
    this.players.forEach(p => clearTimeout(p.clipTimer));
    this.stream?.s.dispose(); this.streamRanges.clear();
    const releasing = this.players.concat(this.music, this.speech ? [this.speech] : [], this.stream ? [this.stream.p] : []).map(p => { p.api.pause(); return p.api.deinitialize(); });
    this.speech = undefined; this.stream = undefined;
    this.players.length = 0; this.music.length = 0; this.policy.clear();
    this.disposal = Promise.all([...releasing, this.retiringSpeech]).then(() => {});
    return this.disposal;
  }
}
