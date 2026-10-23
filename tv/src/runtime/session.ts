import { GameHost, PHONE_COLORS, PROTO, seededRng, encodeBinary, decodeBinary } from '@snag/shared';
import type { Clock, CueEvent, RelayToClient, RemoteKey, TvView, SnagArrived } from '@snag/shared';
import { acceptThumbnail, batchStage } from '../stage';
import type { StageSession } from '../stage';
import { base64, feedSlots, memoryPhotos } from '../stage/memory-images';
import { TvClock } from './clock';
import { RelayClient } from './relay';
import { config } from '../config';
import { SpeechCache } from './speech';
import { MEDIA_TRANSPORT_ACTIONS } from '../stage/game-media-controls';
import type { MediaTransportAction } from '../stage/game-media-controls';
import { DirectorPlayback } from './director';
import type { DirectorFrame } from './director';
import { observeWork } from '../stage/work-monitor';
export class TvSession implements StageSession {
  readonly clock = new TvClock();
  readonly speech = new SpeechCache(m => this.relay?.send(m) ?? false, id => this.relay?.speechUrl(id), 32,
    (globalThis as { HermesInternal?: unknown }).HermesInternal ? async (uri, signal) => {
      const response = await fetch(uri + '&format=mp4', { signal, cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.arrayBuffer();
      if (signal.aborted || !data.byteLength || data.byteLength > 1024 * 1024) { new Uint8Array(data).fill(0); return; }
      return data;
    } : undefined);
  private hostEvent?: CueEvent;
  private notification?: ReturnType<typeof setTimeout>;
  private notify(): void { if (this.notification) return; this.notification = setTimeout(() => { this.notification = undefined; batchStage(() => { for (const fn of [...this.listeners]) fn(); }); }, 0); }
  private view?: TvView; game?: GameHost; private relay?: RelayClient;
  private readonly listeners = new Set<() => void>(); private readonly cueListeners = new Set<(e: CueEvent) => void>();
  private readonly pendingTelemetry: string[] = [];
  private fixturePhoto?:string;
  private control?: WebSocket; private controlRetry?: ReturnType<typeof setTimeout>; private stopped = false; private disconnectedPause = false;
  private room = { code: 'LOOP', joinUrl: 'http://localhost:8787/?r=LOOP' };
  private readonly playback = new DirectorPlayback(this.clock);
  private director?: WebSocket; private directorRetry?: ReturnType<typeof setTimeout>;
  private filmingPhone?: string; private filmingPhoto?: SnagArrived; private phoneSequence = 0;
  private filmingThumb?: Uint8Array; private feedPickup?: ReturnType<typeof setTimeout>;
  private phoneState = '';
  presentationRevision = 0;
  cueCount = 0; exceptions = 0; connected = false; loaded = false; onDebug?: (command: Record<string, unknown>) => void;
  appState = 'unknown'; audioReady = false;
  foreground(active: boolean): void {
    this.appState = active ? 'active' : 'background';
    if (!active) { this.audioReady = false; this.game?.pause(); }
    this.telemetry('app-state', { status: this.appState });
  }
  constructor() {}
  mediaControl?: StageSession['mediaControl'];
  start(): void {
    if (config.debug) observeWork(fields => this.telemetry('native-work', fields));
    if (config.debug) this.connectControl();
    if (config.showcase) this.connectDirector();
    if (config.offline) { this.createGame(); return; }
    this.relay = new RelayClient(config.relayUrl, {
      message: m => this.message(m),
      thumb: (cid, bytes) => {
        if (config.showcase) { if (cid === this.filmingPhone) { this.filmingThumb = bytes.slice(); acceptThumbnail(0, bytes); } return; }
        this.game?.thumbnail(cid, bytes);
        const team = this.game?.getScreen(cid)?.me;
        const index = team ? this.game!.getView().teams.findIndex(t => t.id === team.id) : -1;
        if (index >= 0) acceptThumbnail(index, bytes);
      },
      status: connected => { this.connected = connected; this.telemetry('relay', { connected }); },
      disconnected: code => { this.telemetry('relay-disconnected', { code: code ?? 0 }); this.speech.clear(); this.disconnectedPause ||= !!this.game && !this.game.getView().paused; this.game?.pause(); },
    });
    this.relay.connect();
  }
  private createGame(seed = 1): void {
    this.game?.dispose(); this.hostEvent = undefined; this.speech.resetPlan(); memoryPhotos.clear(); feedSlots.clear(); this.cueCount = 0; this.exceptions = 0;
    this.game = new GameHost({ clock: this.clock, rng: seededRng(seed), room: this.room,
      send: (cid, m) => this.relay?.send({ t: 'to', to: [cid], m }),
      prefetchHost: line => this.speech.prefetch(line.text, ['lobby.open', 'intro.title', 'intro.reel-land', 'hunt.glow-up', 'judge.open', 'judge.winner', 'brag.intro', 'brag.winner', 'show.runway', 'show.vote', 'show.winner', 'stand.leader', 'champ.champion', 'champ.thanks'].includes(line.trigger)),
      cue: event => {
        this.cueCount++;
        // This explicit summary logs every cue without serializing image-bearing state.
        const c = event.cue, fields: Record<string, string | number | boolean | null> = { seq: event.seq, at: event.at, round: event.round, cue: c.k };
        if (c.k === 'scene' && c.scene === 'intro' && event.round === 0) memoryPhotos.clear();
        if ('target' in c && typeof c.target === 'string') fields.target = c.target;
        if (c.k === 'phase') fields.phase = c.phase;
        if (c.k === 'scene') { fields.from = c.from; fields.scene = c.scene; }
        if (c.k === 'host') { fields.trigger = c.line.trigger; this.hostEvent = event; }
        if (c.k === 'count') fields.text = c.text;
        if (c.k === 'sfx') fields.name = c.name;
        if (c.k === 'confetti') fields.count = c.count;
        if (c.k === 'background' || c.k === 'music') fields.mood = c.mood;
        this.telemetry('cue', fields);
        for (const fn of [...this.cueListeners]) fn(event);
        if (c.k === 'complete') this.telemetry('complete', { cues: this.cueCount, exceptions: this.exceptions, teams: this.game?.getView().teams.length ?? 0 });
      },
      view: view => { this.view = view; this.notify(); },
    });
    this.view = this.game.getView();
    if (this.appState === 'background') this.game.pause();
    this.telemetry('engine', { hermes: !!(globalThis as { HermesInternal?: unknown }).HermesInternal, utf8: typeof TextEncoder === 'undefined' || typeof TextDecoder === 'undefined' ? 'pure-js' : 'TextEncoder', binary: !!decodeBinary(encodeBinary({ t: 'thumb', cid: 'utf8-★' }, new Uint8Array([0, 128, 255]))) });
    this.notify();
  }
  private message(m: RelayToClient): void {
    if (m.t === 'welcome' && m.role === 'tv') {
      const freshRoom = m.code !== this.room.code; if (freshRoom) this.speech.clear(); this.room = { code: m.code, joinUrl: m.joinUrl }; this.clock.welcome(m.serverNow);
      if (config.showcase) { this.directorRoom(); this.refreshDirector(); return; }
      if (!this.game || freshRoom) this.createGame();
      else if (this.disconnectedPause && this.appState !== 'background') this.game.resume();
      this.disconnectedPause = false;
    } else if (m.t === 'tts') this.speech.receive(m);
    else if (m.t === 'pong') this.clock.sync.sample(m.c, m.s);
    else if (m.t === 'error') this.telemetry('relay-error', { code: m.code });
    else if (config.showcase && m.t === 'peer' && m.up) {
      this.relay?.send({ t: 'to', to: [m.cid], m: { t: 'screen', seq: ++this.phoneSequence, me: null, teams: [], round: -1, paused: false, s: { k: 'join', takenColors: [], suggestedName: 'Sock Goblins', full: !!this.filmingPhone && this.filmingPhone !== m.cid } } });
    } else if (config.showcase && m.t === 'from') {
      if (m.m.t === 'join' && !this.filmingPhone) { this.filmingPhone = m.cid; this.telemetry('showcase-phone', { connected: true }); }
      if (m.cid !== this.filmingPhone) return;
      if (m.m.t === 'snag' && m.m.round === 0) { this.filmingPhoto = m.m; this.telemetry('showcase-photo', { round: 0, ready: true, pass: m.m.match >= 95 }); }
      this.refreshDirector();
    } else {
      if (m.t === 'from' && m.m.t === 'control') this.telemetry('transport-input', { source: 'phone', action: m.m.action });
      if (this.appState === 'background' && m.t === 'from' && m.m.t === 'control' && (m.m.action === 'resume' || m.m.action === 'skip')) {
        this.relay?.send({ t: 'to', to: [m.cid], m: { t: 'toast', text: 'Open Snag & Brag on the TV to resume.', color: '#FFD43B' } });
        return;
      }
      // Fetch/convert while the team is still dressing its find, so the judge's
      // short scan does not wait for network and base64 work at reveal time.
      if (m.t === 'from' && m.m.t === 'snag' && (globalThis as { HermesInternal?: unknown }).HermesInternal) {
        const url = this.photoUrl(m.m.photoId);
        if (url) void memoryPhotos.loadMasked(url).catch(() => {});
      }
      this.game?.handle(m);
    }
  }
  get ready(): boolean { return !!this.view; }
  get capture(): boolean { return config.showcase; }
  get roomCode(): string { return this.room.code; }
  get capturePose(): 'judge-mask' | 'hologram' | undefined { return config.showcase && this.playback.frame?.held ? this.playback.frame.pose : undefined; }
  getView(): TvView { if (!this.view) throw new Error('TV room is not ready'); return this.view; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  cues(fn: (e: CueEvent) => void): () => void { this.cueListeners.add(fn); return () => { this.cueListeners.delete(fn); }; }
  latestHost(): CueEvent | undefined { return this.hostEvent; }
  speechTiming(text: string, remainingMs: number): void { this.game?.speechTiming(text, remainingMs); }
  photoUrl(id:string):string|undefined{return id==='fixture'?this.fixturePhoto:this.relay?.photoUrl(id);}
  remote(key: RemoteKey): void { if (this.appState === 'background') return; this.telemetry('transport-input', { source: 'remote', action: key }); if (config.showcase && this.director?.readyState === WebSocket.OPEN) this.director.send(JSON.stringify({ t: 'director-key', key })); else this.game?.remote(key); }
  private directorRoom(): void { if (this.director?.readyState === WebSocket.OPEN && this.relay?.code) this.director.send(JSON.stringify({ t: 'director-room', ...this.room })); }
  private refreshDirector(): void {
    const view = this.playback.view(this.room, this.filmingPhoto); if (!view) return;
    this.view = view; this.notify();
    if (this.filmingPhone) {
      const key = [this.presentationRevision, this.playback.frame?.phoneScreen?.seq, this.playback.frame?.held, this.filmingPhoto?.photoId, this.filmingPhone].join(':');
      if (key === this.phoneState) return;
      const screen = this.playback.screen(++this.phoneSequence, this.clock.sync.serverNow(), this.filmingPhoto);
      if (screen && this.relay?.send({ t: 'to', to: [this.filmingPhone], m: screen })) this.phoneState = key;
    }
  }
  private connectDirector(): void {
    if (this.stopped) return;
    const ws = new WebSocket(config.directorUrl); this.director = ws;
    ws.onopen = () => { ws.send(JSON.stringify({ t: 'director-renderer', target: (globalThis as { HermesInternal?: unknown }).HermesInternal ? 'vvd' : 'web', width: 1920, height: 1080 })); this.directorRoom(); };
    ws.onmessage = event => {
      if (typeof event.data !== 'string') return;
      try {
        const frame = JSON.parse(event.data) as DirectorFrame; if (frame.t !== 'director-frame') return;
        if (frame.seeking) {
          this.hostEvent = undefined; this.presentationRevision++; clearTimeout(this.feedPickup);
          const generation = this.presentationRevision;
          if (frame.view.scene === 'hunt') this.feedPickup = setTimeout(() => { if (generation === this.presentationRevision && this.filmingThumb) acceptThumbnail(0, this.filmingThumb); }, 250);
        }
        this.playback.accept(frame, cue => {
          this.view = this.playback.view(this.room, this.filmingPhoto); this.cueCount++;
          if (cue.cue.k === 'host') this.hostEvent = cue;
          for (const fn of [...this.cueListeners]) fn(cue);
        });
        this.refreshDirector();
        this.telemetry('director-frame', { at: frame.atMs, paused: frame.held, scene: frame.view.scene, phase: frame.view.phase, round: frame.view.round, ready: true });
      } catch { this.exceptions++; this.telemetry('exception', { source: 'director', exceptions: this.exceptions }); }
    };
    ws.onerror = () => {};
    ws.onclose = () => { if (!this.stopped) this.directorRetry = setTimeout(() => this.connectDirector(), 1000); };
  }
  telemetry(kind: string, fields: Record<string, string | number | boolean | null> = {}): void {
    if (kind === 'audio-preloaded') this.audioReady = true;
    const record = { kind, at: Date.now(), hermes: !!(globalThis as { HermesInternal?: unknown }).HermesInternal, ...fields };
    // The local control bridge already retains diagnostic receipts. Duplicating
    // every animation/media checkpoint into the device system logger adds I/O
    // to the same low-power runtime being measured.
    if (config.debug && ['exception', 'audio-error', 'relay-error'].includes(kind)) console.log('[TV]', JSON.stringify(record));
    const encoded=JSON.stringify(record);
    if(this.control?.readyState===WebSocket.OPEN)this.control.send(encoded);
    else if(config.debug){this.pendingTelemetry.push(encoded);if(this.pendingTelemetry.length>256)this.pendingTelemetry.shift();}
  }
  private connectControl(): void {
    if (this.stopped) return;
    const runtime = (globalThis as { HermesInternal?: unknown }).HermesInternal ? 'native' : 'web';
    const ws = new WebSocket(config.controlUrl + '/' + runtime); this.control = ws;
    ws.onopen=()=>{for(const record of this.pendingTelemetry)ws.send(record);this.pendingTelemetry.length=0;this.telemetry('control-ready');};
    ws.onmessage = e => { if(typeof e.data!=='string'){const b=new Uint8Array(e.data);if(b.length>8&&b[0]===83&&b[1]===66){const jpg=b.subarray(8);acceptThumbnail(b[2]!,jpg);if(b[2]===0)this.fixturePhoto='data:image/jpeg;base64,'+base64(jpg);}return;} try { this.command(JSON.parse(e.data) as Record<string, unknown>); } catch { this.exceptions++; this.telemetry('exception', { source: 'control', exceptions: this.exceptions }); } };
    ws.onerror = () => {};
    ws.onclose = () => { if (!this.stopped) this.controlRetry = setTimeout(() => this.connectControl(), 2000); };
  }
  command(c: Record<string, unknown>): void {
    if (c.command === 'media-control') {
      const action = String(c.action) as MediaTransportAction, route = c.route === 'handler' ? 'handler' : 'sdk';
      if (!MEDIA_TRANSPORT_ACTIONS.includes(action) || !this.mediaControl) { this.telemetry('media-injection-error', { action, route, reason: 'unavailable' }); return; }
      void this.mediaControl(action, route).catch(error => this.telemetry('media-injection-error', { action, route, reason: error instanceof Error ? error.name + ': ' + error.message.replace(/(?:https?|wss?):\/\/\S+/gi, '<uri>').replace(/\b[0-9a-f]{32,}\b/gi, '<key>').slice(0, 180) : 'error' }));
    }
    else if (c.command === 'remote') this.remote(c.key as RemoteKey);
    else if (c.command === 'reset') { this.clock.accelerate(Number(c.speed ?? 1)); this.createGame(Number(c.seed ?? 1)); }
    else if (c.command === 'bots') { this.game?.setBots(true); if (c.start !== false) { this.remote('select'); this.remote('down'); this.remote('select'); } }
    else if (c.command === 'join') {
      const n = Number(c.index ?? 0), cid = '0000000000000000000000000000000' + (n + 1);
      this.game?.peer(cid, true); this.game?.receive(cid, { t: 'join', name: ['Sock Goblins', 'The Snaggletooths', 'Fridge Raiders', 'Lost Remote Club'][n] ?? 'Team', color: PHONE_COLORS[n % 4]! });
    } else if (c.command === 'start') { this.remote('select'); this.remote('down'); this.remote('select'); }
    else if(c.command==='feed-state')this.telemetry('feed-state',{retained:feedSlots.bytes,jpegReceived:feedSlots.received,jpegDrawn:feedSlots.drawn});
    else if (c.command === 'pause') { this.telemetry('transport-input', { source: 'diagnostic', action: c.on === false ? 'resume' : 'pause' }); if (c.on === false) this.game?.resume(); else this.game?.pause(); }
    else if (c.command === 'snapshot') {
      const v = this.view;
      this.telemetry('snapshot', { ready:this.ready, loaded:this.loaded, connected:this.connected, active:this.appState === 'active', audio:this.audioReady, hermes:!!(globalThis as { HermesInternal?: unknown }).HermesInternal,
        ...(v ? { code:this.room.code, scene:v.scene, phase:v.phase, round:v.round, mood:v.backgroundMood, completed:v.completed, paused:v.paused, teams:v.teams.filter(t=>t.joined!==false).length, cues:this.cueCount, exceptions:this.exceptions,
          ...(v.content.k==='judge'?{cardStage:v.content.cards.map(card=>card.stage).join(','),banner:!!v.content.banner,crown:v.content.crown,...(v.content.winner?{winner:v.content.winner}:{})}:{}),
          ...(v.content.k==='show'&&v.content.winner?{winner:v.content.winner}:{}),
        } : {}) });
    }
    else this.onDebug?.(c);
  }
  dispose(): void { this.stopped = true; if (config.debug) observeWork(); clearTimeout(this.controlRetry); clearTimeout(this.directorRetry); clearTimeout(this.feedPickup); clearTimeout(this.notification); this.game?.dispose(); this.speech.clear(); this.filmingPhoto = undefined; this.filmingThumb = undefined; memoryPhotos.clear(); feedSlots.clear(); this.relay?.close(); this.control?.close(); this.director?.close(); this.listeners.clear(); this.cueListeners.clear(); }
}
