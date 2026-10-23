import { DARK_COLORS, GEN_BRAGS, GEN_NAMES, NAME_PREFIXES, NAME_SILLY, NAME_SUFFIXES, PHONE_COLORS, REACTIONS, REACTION_COLORS, ROUNDS, TEAM_NAMES, TIMING, TOKENS, clamp, encodeBinary } from '@snag/shared';
import type { BinaryHeader, FindView, PhoneToTv, RelayToClient, Screen, ScreenMsg, TeamView, TvToPhone } from '@snag/shared';
import template from './phone.html?raw';
import { ART, OBJI, artDefs } from './art';
import type { EyePair } from './art';
import { CameraFeed, snagFile } from './camera';
import { faceRedactor } from './faceBlur';
import { ReactionThrottle, TapBatcher, fmt, inAppBrowser, reduceScreen, timer } from './logic';
import { GooglyEyes, PhoneFX, animate, haptic, phoneTransition, press } from './motion';
import type { PhoneTransport } from './transport';

export const esc = (s: string | number) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const color = (s: string) => /^#[0-9a-f]{6}$/i.test(s) ? s : TOKENS.bubble;
function element(html: string): HTMLElement { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstElementChild as HTMLElement; }
export function badge(team: TeamView): string { return `<span class="badge${DARK_COLORS.has(team.color) ? ' lt' : ''}" style="--c:${color(team.color)}">${esc(team.mono)}</span>`; }

interface GlowInput {
  key: string; find: FindView; names: string[]; brags: string[]; name: string; brag: string;
  namesPicked: boolean; bragPicked: boolean; eyes: [number, number][]; sent: boolean;
}
export class PhoneView {
  screen: ScreenMsg | null = null;
  readonly root: HTMLElement;
  readonly camera: CameraFeed;
  readonly eyes = new GooglyEyes();
  readonly fx: PhoneFX;
  private selectedColor: string = PHONE_COLORS[0]!;
  private glow: GlowInput | null = null;
  private lastFrame = performance.now();
  private raf = 0;
  private tapInterval: ReturnType<typeof setInterval>;
  private hype = 0;
  private lastHype = 0;
  private reactions = new ReactionThrottle();
  private taps: TapBatcher;
  private mashKey = '';
  private mashCounts: Record<-1 | 1, number> = { [-1]: 0, 1: 0 };
  private voted: string | null = null;
  private pendingVote: Extract<PhoneToTv, { t: 'vote' }> | null = null;
  private pendingGlow: Extract<PhoneToTv, { t: 'glow' }> | null = null;
  private pendingSnag: { round: number; frame: Uint8Array } | null = null;
  private lastSnagRound: number | null = null;
  private capturing = false;
  private pauseAt: number | null = null;
  private lastAutoTry = 0;
  private holdRaf = 0;
  private holdStart: number | null = null;
  private holdTick = 0;
  private startSent = false;
  private photoCounter = 0;
  private photos = new Map<string, { abort: AbortController; promise: Promise<string>; url?: string }>();
  private scoreRoll: { from: number; to: number; at: number } | null = null;
  private orientationAllowed = false;
  private orientationRequested = false;
  private shownCount = '';

  constructor(container: HTMLElement, private readonly transport: PhoneTransport, code: string, private readonly options: { fixture?: boolean; seen?(screen: ScreenMsg): void } = {}) {
    container.innerHTML = `<svg width="0" height="0" style="position:absolute;pointer-events:none" aria-hidden="true"><defs>${artDefs()}</defs></svg>${template}`;
    this.root = this.get('ps'); this.root.style.setProperty('--team', this.selectedColor); this.get('room-code').textContent = code;
    this.fx = new PhoneFX(this.get('pfx'), this.root);
    this.taps = new TapBatcher((message) => this.transport.send(message));
    this.camera = new CameraFeed(this.get('camera'), {
      thumb: (bytes) => this.transport.binary(encodeBinary({ t: 'thumb' }, bytes)),
      state: (ready, fallback) => {
        this.get('camera-fallback').hidden = !fallback;
        this.get<HTMLButtonElement>('shutter').disabled = (!ready && !fallback) || this.capturing || this.lastSnagRound === this.screen?.round;
        this.get('chint').textContent = fallback ? 'Camera shy? A photo works too.' : 'Aim. Snap. Make it a star.';
      },
      hunting: () => this.hunting(),
    });
    this.bind(); this.fan();
    this.tapInterval = setInterval(() => {
      if (this.screen?.s.k === 'mash' && this.screen.s.phase === 'mash' && !this.screen.paused && !document.hidden) this.taps.flush();
      else this.taps.clear();
    }, TIMING.TAP_SEND_MS);
    this.raf = requestAnimationFrame((now) => this.frame(now));
    this.get('inapp').hidden = !inAppBrowser(navigator.userAgent);
  }
  get<T extends HTMLElement = HTMLElement>(id: string): T { return this.root?.querySelector<T>(`#${id}`) ?? document.getElementById(id) as T; }
  private send(message: PhoneToTv): boolean {
    if (this.transport.send(message)) return true;
    this.status('Reconnecting to the show…'); return false;
  }
  status(text: string): void {
    const status = this.get('connection'); status.textContent = text; status.hidden = !text;
    if (!text) { this.flushInput(); this.retryPhotos(); }
  }
  receive(message: TvToPhone): void {
    if (message.t === 'screen') this.apply(message);
    else if (message.t === 'toast') this.toast(message.text, message.color);
    else if (message.t === 'award') this.award(message.pts, message.total);
    else if (message.t === 'mashp' && this.screen?.s.k === 'mash' && this.screen.s.phase === 'mash') {
      const m = this.screen.s;
      this.get('m-s').textContent = Math.abs(message.p) < .08 ? 'Dead even!' : `${message.p < 0 ? m.left.find.name : m.right.find.name} is pulling ahead`;
    }
  }
  ai(message: Extract<RelayToClient, { t: 'ai' }>): void {
    if (this.screen?.s.k !== 'glow' || this.screen.s.find.photoId !== message.photoId || this.glow?.sent) return;
    this.updateSuggestions(message.r.names, message.r.brags);
    this.get('aiwait').hidden = true;
  }
  apply(incoming: ScreenMsg): void {
    const previous = this.screen;
    const next = reduceScreen(previous, incoming);
    if (!next || next === previous) { this.flushInput(); return; }
    this.screen = next; const s = next.s;
    if (next.me) void faceRedactor.warm();
    if (s.k === 'lobby' || s.k === 'end') this.transport.hostIdentity(s.isHost);
    if (s.k === 'join' && next.seq >= 0) this.transport.hostIdentity(false);
    if (next.paused && !previous?.paused) this.pauseAt = this.transport.now();
    if (!next.paused) this.pauseAt = null;
    const changed = previous?.s.k !== s.k;
    if (changed) {
      this.stopHold(); this.startSent = false; this.taps.clear(); this.clearPhotos();
      this.pendingVote = null; this.voted = null;
      if (s.k !== 'cam') { this.camera.stop(); this.pendingSnag = null; this.capturing = false; }
      if (s.k !== 'glow') this.pendingGlow = null;
      this.root.querySelectorAll<HTMLElement>('.pscr').forEach((p) => p.classList.toggle('on', p.id === `p-${s.k}`));
      this.get(`p-${s.k}`).scrollTop = 0; phoneTransition(this.get(`p-${s.k}`));
      if (s.k === 'join' || s.k === 'lobby') { this.lastSnagRound = null; this.glow = null; }
    }
    this.root.dataset.screen = s.k; this.root.dataset.round = String(next.round);
    this.root.classList.toggle('is-paused', next.paused);
    if (next.me) this.root.style.setProperty('--team', next.me.color);
    this.header(); this.get('pause-overlay').hidden = !next.paused;
    this.get('resume-button').hidden = !this.transport.hostIdentity();
    this.get('pause-control').textContent = next.paused ? 'Resume' : 'Pause';
    this.get('pause-control').dataset.control = next.paused ? 'resume' : 'pause';
    if (next.paused) { this.camera.stop(); this.stopHold(); this.taps.clear(); }
    switch (s.k) {
      case 'join': this.join(s, changed); break;
      case 'lobby': this.lobby(s); break;
      case 'ready': this.ready(s); break;
      case 'cam': this.cam(); break;
      case 'glow': this.glowScreen(s); break;
      case 'wait': this.wait(s); break;
      case 'mash': this.mash(s); break;
      case 'vote': this.vote(s); break;
      case 'end': this.end(s, changed); break;
    }
    this.options.seen?.(next); this.flushInput();
  }
  private header(): void {
    const me = this.screen?.me;
    const score = this.scoreRoll?.to ?? me?.score ?? 0;
    this.get('pme').innerHTML = me ? `${badge(me)}<b>${score}</b>` : '';
    this.get('host-toggle').hidden = !me || !this.transport.hostIdentity();
  }
  private fan(): void {
    const fan = this.get('fan'); fan.replaceChildren();
    const pool = ['mug', 'duck', 'crown', 'dino', 'donut', 'teddy', 'lava', 'rocket'];
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j]!, pool[i]!]; }
    (this.options.fixture ? ['duck', 'teddy', 'crown'] : pool.slice(0, 3)).forEach((id, i) => {
      const st = this.sticker({ team: '', round: 0, obj: id, name: '', brag: '', thing: '', eyes: OBJI[id]!.eyes });
      st.style.cssText = `left:${[0, 26, 54][i]}px;top:${[34, 0, 30][i]}px;transform:rotate(${[-14, 4, 16][i]}deg)`;
      fan.append(st); animate(st, [{ opacity: 0, transform: `scale(.3) rotate(-10deg)` }, { opacity: 1, transform: `rotate(${[-14, 4, 16][i]}deg)` }], 'pop', { delay: i * 80 });
    });
  }
  private join(s: Extract<Screen, { k: 'join' }>, changed: boolean): void {
    const input = this.get<HTMLInputElement>('tname');
    if (changed || !input.value) input.value = s.suggestedName || pick(TEAM_NAMES);
    if (s.takenColors.includes(this.selectedColor)) this.selectedColor = PHONE_COLORS.find((c) => !s.takenColors.includes(c)) ?? PHONE_COLORS[0]!;
    this.root.style.setProperty('--team', this.selectedColor);
    const swatches = this.get('swatches'); swatches.replaceChildren();
    PHONE_COLORS.forEach((c, i) => {
      const b = element(`<button role="radio" aria-checked="${c === this.selectedColor}" aria-label="Badge color ${i + 1}${s.takenColors.includes(c) ? ', taken' : ''}" style="background:${c}"></button>`) as HTMLButtonElement;
      b.disabled = s.takenColors.includes(c);
      b.onclick = () => { this.selectedColor = c; this.root.style.setProperty('--team', c); this.join(s, false); haptic(6); };
      swatches.append(b);
    });
    this.get<HTMLButtonElement>('b-join').disabled = s.full || PHONE_COLORS.every((c) => s.takenColors.includes(c));
    this.get('b-join').querySelector('.hl')!.textContent = s.full ? 'The show is full' : 'Join the show';
  }
  private rundown(id: string): void {
    const round = this.screen?.round ?? -1;
    this.get(id).innerHTML = ROUNDS.map((r, i) => `<div class="lrow${i < round ? ' done' : i === round ? ' now' : ''}"><span class="n">${i + 1}</span><div>${esc(r.nice)}<small>${esc(r.sub)}</small></div><span class="st">${i < round ? 'Done' : i === round ? 'Now' : 'Next'}</span></div>`).join('');
  }
  private lobby(s: Extract<Screen, { k: 'lobby' }>): void {
    const me = this.screen!.me;
    this.get('lob-badge').innerHTML = me ? badge(me) : '';
    this.get('lob-name').textContent = me?.name ?? 'Your team';
    this.get('roster').innerHTML = this.screen!.teams.map((t) => `<div class="lrow${t.id === me?.id ? ' me' : ''}">${badge(t)}<div>${esc(t.name)}<small>${t.id === me?.id ? `You${s.isHost ? ' · host phone' : ''}` : 'Rival team'}</small></div><span class="st${t.connected ? ' ok' : ''}">${t.connected ? 'Ready' : 'Rejoining…'}</span></div>`).join('');
    this.rundown('rundown1');
    this.get('lobby-note').textContent = s.isHost ? "You’re the host phone. About four minutes, start to finish." : 'You’re in. Waiting for the host to start the show.';
    const start = this.get<HTMLButtonElement>('b-start'); start.hidden = !s.isHost; start.disabled = !s.canStart || this.startSent || this.screen!.paused;
    this.get('b-start-l').textContent = s.canStart ? 'Hold to go live' : 'Waiting for teams…';
    const bots = this.get<HTMLButtonElement>('bots-toggle');
    const wasVisible = !bots.hidden, wasOn = bots.getAttribute('aria-pressed') === 'true';
    bots.hidden = !s.isHost; bots.disabled = this.screen!.paused; bots.setAttribute('aria-pressed', String(s.botsOn));
    if (wasVisible && s.isHost && !this.screen!.paused && !document.hidden && wasOn !== s.botsOn) {
      const knob = this.get('bot-knob'), toggle = this.get('bot-switch');
      for (const el of [knob, toggle]) el.getAnimations().forEach((animation) => animation.cancel());
      animate(knob, [{ transform: `translateX(${wasOn ? 20 : 0}px)` }, { transform: `translateX(${s.botsOn ? 20 : 0}px)` }], 'pop');
      animate(toggle, [{ transform: 'scale(.9)' }, { transform: 'scale(1)' }], 'pop');
      haptic(8);
    }
  }
  private ready(s: Extract<Screen, { k: 'ready' }>): void {
    this.get('rd-k').textContent = s.kicker; this.get('rd-h').textContent = s.title; this.get('rd-s').textContent = s.sub;
    this.get('rd-card').hidden = !s.prompt;
    if (s.prompt) this.get('rd-p').innerHTML = `${esc(s.prompt.a)} <span style="color:${color(s.prompt.col)}">${esc(s.prompt.b)}</span> ${esc(s.prompt.c)}`;
    this.rundown('rundown2'); this.get('rd-c').textContent = s.count ?? '';
    if (s.count && s.count !== this.shownCount) { animate(this.get('rd-c'), [{ transform: 'scale(2.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]); haptic(s.count === 'GO!' ? [30, 30, 60] : 10); }
    this.shownCount = s.count ?? '';
  }
  private cam(): void {
    const p = this.screen!.prompt;
    this.get('cchip').innerHTML = `<span class="k">SNAG</span><span class="t">${p ? `${esc(p.a)} <em style="color:${color(p.col)}">${esc(p.b)}</em> ${esc(p.c)}` : 'Eyes on the TV for your mission'}</span>${p?.kind === 'color' && p.hex ? `<span class="dot" style="background:${color(p.hex)}"></span>` : ''}`;
    this.get('brk').classList.toggle('lock', this.lastSnagRound === this.screen!.round);
    this.get('olab').classList.toggle('none', this.lastSnagRound !== this.screen!.round);
    this.get('olab').textContent = 'Snagged! Eyes on the TV.';
    if (this.hunting() && !this.options.fixture) void this.camera.start();
  }
  private hunting(): boolean {
    return this.screen?.s.k === 'cam' && !this.screen.paused && !document.hidden && this.lastSnagRound !== this.screen.round && (this.screen.deadline === undefined || this.transport.now() < this.screen.deadline);
  }
  private glowScreen(s: Extract<Screen, { k: 'glow' }>): void {
    const key = `${this.screen!.round}:${s.find.team}:${s.find.photoId ?? s.find.obj ?? 'missed'}`;
    if (this.glow?.key !== key) {
      const names = this.three(s.names, GEN_NAMES), brags = this.three(s.brags, GEN_BRAGS);
      this.glow = { key, find: s.find, names, brags, name: names[0]!, brag: brags[0]!, namesPicked: false, bragPicked: false, eyes: [], sent: false };
      this.pendingGlow = null;
      const st = this.sticker(s.find, false); this.get('gstage').querySelector('.stk')?.remove(); this.get('gstage').prepend(st);
      this.get('gstage').classList.remove('sent'); this.get('ghint').hidden = false; this.get('ghint').textContent = 'TAP TO STICK 2 EYES';
      animate(st, [{ transform: 'scale(.3) rotate(-30deg)', opacity: 0 }, { transform: 'none', opacity: 1 }]);
      this.names(); this.brags();
    } else if (!s.aiPending && !this.glow.sent) this.updateSuggestions(s.names, s.brags);
    this.get('aiwait').hidden = !s.aiPending || this.glow.sent;
    this.get<HTMLButtonElement>('b-send').disabled = this.glow.sent || this.screen!.paused;
    this.get('b-send').querySelector('.hl')!.textContent = this.glow.sent ? 'Sent! Watch the TV.' : 'Send it to the TV';
  }
  private three(list: readonly string[], fallback: readonly string[]): string[] { return [...new Set([...list.filter(Boolean), ...fallback])].slice(0, 3); }
  private updateSuggestions(names: string[], brags: string[]): void {
    if (!this.glow || this.glow.sent) return;
    let updated = false;
    if (!this.glow.namesPicked && names.length) { this.glow.names = this.three(names, GEN_NAMES); this.glow.name = this.glow.names[0]!; this.names(); updated = true; }
    if (!this.glow.bragPicked && brags.length) { this.glow.brags = this.three(brags, GEN_BRAGS); this.glow.brag = this.glow.brags[0]!; this.brags(); updated = true; }
    if (updated) { this.fx.at(this.get('gnames'), 20, [TOKENS.yolk, TOKENS.paper]); animate(this.get('gnames'), [{ transform: 'scale(.96)' }, { transform: 'scale(1)' }]); }
  }
  private names(): void {
    const input = this.glow!; const host = this.get('gnames'); host.replaceChildren();
    input.names.forEach((name) => {
      const b = element(`<button class="chipb" role="radio" aria-checked="${name === input.name}">${esc(name)}</button>`);
      b.onclick = () => { if (input.sent || this.screen?.paused) return; input.name = name; input.namesPicked = true; this.names(); haptic(5); }; host.append(b);
    });
    const roll = element('<button class="chipb dicey" aria-label="Roll new names"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3.5" y="3.5" width="17" height="17" rx="4"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>Roll</button>');
    roll.onclick = () => {
      if (input.sent || this.screen?.paused) return;
      const base = input.find.thing.split(' ').pop() || pick(['Thing', 'Gizmo', 'Whatsit', 'Doodad']);
      const word = base[0]!.toUpperCase() + base.slice(1);
      input.names = [`${pick(NAME_PREFIXES)} ${word}`, `${word} ${pick(NAME_SUFFIXES)}`, `${pick(NAME_PREFIXES)} ${pick(NAME_SILLY)}`];
      input.name = input.names[0]!; input.namesPicked = true; this.names(); haptic(8);
    }; host.append(roll);
  }
  private brags(): void {
    const input = this.glow!; const host = this.get('gbrags'); host.replaceChildren();
    input.brags.forEach((brag) => {
      const b = element(`<button role="radio" aria-checked="${brag === input.brag}"><i></i><span>${esc(brag)}</span></button>`);
      b.onclick = () => { if (input.sent || this.screen?.paused) return; input.brag = brag; input.bragPicked = true; this.brags(); haptic(5); }; host.append(b);
    });
  }
  private addEye(x: number, y: number): void {
    const input = this.glow; if (!input || input.sent || this.screen?.s.k !== 'glow' || this.screen.paused) return;
    const st = this.get('gstage').querySelector<HTMLElement>('.stk')!;
    if (input.eyes.length >= 2) { input.eyes = []; st.querySelectorAll('.gg').forEach((eye) => eye.remove()); }
    const point: [number, number] = [Math.round(clamp(x, 0, 120)), Math.round(clamp(y, 0, 120))]; input.eyes.push(point);
    this.eyes.addEyes(st, [point, null, input.find.eyes?.[2] ?? 11]);
    animate(st.lastElementChild!, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], 'wobble'); this.eyes.kickEyes(st, 8); haptic(12);
    this.get('ghint').textContent = input.eyes.length === 2 ? 'TAP AGAIN TO RE-STICK' : 'ONE MORE EYE';
    if (input.eyes.length === 2) { this.fx.at(st, 26); animate(st, [{ transform: 'scale(1)' }, { transform: 'scale(1.08) rotate(-4deg)' }, { transform: 'scale(1)' }], 'wobble'); }
  }
  private sendGlow(): void {
    const input = this.glow; if (!input || input.sent || this.screen?.s.k !== 'glow' || this.screen.paused) return;
    const eyes: EyePair = input.eyes.length === 2 ? [input.eyes[0]!, input.eyes[1]!] : input.find.eyes ? [input.find.eyes[0], input.find.eyes[1]] : [[42, 46], [78, 46]];
    this.pendingGlow = { t: 'glow', eyes, name: input.name, brag: input.brag };
    if (this.send(this.pendingGlow)) {
      input.sent = true; this.pendingGlow = null;
      this.get<HTMLButtonElement>('b-send').disabled = true; this.get('b-send').querySelector('.hl')!.textContent = 'Sent! Watch the TV.';
      this.get('ghint').hidden = true; this.get('aiwait').hidden = true; this.get('gstage').classList.add('sent'); haptic([10, 20, 10]);
    }
  }
  private wait(s: Extract<Screen, { k: 'wait' }>): void {
    const host = this.get('w-card'); host.replaceChildren(); host.hidden = !s.card;
    if (s.card) { host.append(this.sticker(s.card), element(`<div><div class="wn">${esc(s.card.name)}</div><div class="wb">${esc(s.card.brag)}</div></div>`)); }
    this.get('w-stat').innerHTML = `${esc(s.msg)}${s.sub ? `<small>${esc(s.sub)}</small>` : ''}`;
    this.get('w-rank').innerHTML = [...this.screen!.teams].sort((a, b) => b.score - a.score).map((t, i) => `<div class="lrow${t.id === this.screen!.me?.id ? ' me' : ''}">${badge(t)}<div>${i + 1}. ${esc(t.name)}</div><span class="v">${t.score}</span></div>`).join('');
  }
  private mash(s: Extract<Screen, { k: 'mash' }>): void {
    const key = `${this.screen!.round}:${s.kicker}:${s.left.team.id}:${s.right.team.id}`;
    if (key !== this.mashKey) { this.mashKey = key; this.mashCounts = { [-1]: 0, 1: 0 }; this.taps.clear(); }
    this.get('m-k').textContent = s.kicker;
    this.get('m-h').innerHTML = s.head ? esc(s.head) : s.youIn ? 'Mash <em>your</em> sticker' : 'Pick a side and <em>mash</em>';
    this.get('m-s').textContent = s.sub ?? (s.phase === 'mash' ? 'Dead even!' : s.phase === 'ready' ? 'Get ready…' : 'Eyes on the TV');
    this.get('p-mash').classList.toggle('mashing', s.phase === 'mash'); const host = this.get('mgrid'); host.replaceChildren();
    [s.left, s.right].forEach((fighter) => {
      const b = element(`<button class="mbtn" data-side="${fighter.side}" style="background:${color(fighter.team.color)}"><span class="tap">${this.mashCounts[fighter.side]}</span><em>MASH</em></button>`) as HTMLButtonElement;
      const st = this.sticker(fighter.find); b.append(st, element(`<b>${esc(fighter.find.name)}</b>`), element(`<small>${esc(fighter.team.name)}</small>`));
      b.disabled = s.phase !== 'mash' || this.screen!.paused || (s.youIn && fighter.team.id !== this.screen!.me?.id);
      const tap = () => {
        if (b.disabled || this.screen?.s.k !== 'mash' || this.screen.s.phase !== 'mash' || this.screen.paused) return;
        this.taps.tap(fighter.side); b.querySelector('.tap')!.textContent = String(++this.mashCounts[fighter.side]);
        b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 60); this.eyes.kickEyes(st, 6); haptic(8);
      };
      b.onpointerdown = (e) => { e.preventDefault(); tap(); };
      b.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); } };
      host.append(b);
    });
  }
  private vote(s: Extract<Screen, { k: 'vote' }>): void {
    this.voted = s.voted ?? this.voted; const host = this.get('vlist'); host.replaceChildren();
    s.options.filter((f) => f.team !== this.screen!.me?.id && !f.missed).forEach((find) => {
      const t = this.screen!.teams.find((t) => t.id === find.team);
      const b = element(`<button class="vopt" role="radio" aria-checked="${find.team === this.voted}" data-team="${esc(find.team)}"><div></div><div><b>${esc(find.name)}</b><small>${esc(find.brag)}</small><div class="who">${esc(t?.name ?? '')}</div></div><i></i></button>`) as HTMLButtonElement;
      b.firstElementChild!.replaceWith(this.sticker(find)); b.disabled = !!this.voted && find.team !== this.voted || this.screen!.paused || this.transport.now() >= (this.screen!.deadline ?? Infinity);
      b.onclick = () => {
        if (this.voted || this.screen?.s.k !== 'vote' || this.screen.paused || this.transport.now() >= (this.screen.deadline ?? Infinity)) return;
        this.voted = find.team; this.pendingVote = { t: 'vote', team: find.team };
        const message = this.pendingVote; this.vote(s); if (this.send(message)) this.pendingVote = null; haptic(15);
      }; host.append(b);
    });
    this.get('v-stat').textContent = this.voted ? `Vote locked in for ${s.options.find((f) => f.team === this.voted)?.name ?? 'your pick'}` : '';
  }
  private end(s: Extract<Screen, { k: 'end' }>, changed: boolean): void {
    this.get('e-rank').textContent = String(s.rank); this.get('e-suf').textContent = ['st', 'nd', 'rd', 'th'][Math.min(3, Math.max(0, s.rank - 1))]!;
    this.get('e-line').textContent = s.line; const card = this.get('e-card'); card.className = 'tcardp holo';
    card.innerHTML = s.best ? `<div class="tin"><div class="tt"><span>${esc(this.screen!.me?.name ?? '')}</span><span>Best find</span></div><div class="tart"></div><div class="tn">${esc(s.best.name)}</div><div class="ts"><div>POINTS<b>${s.best.pts ?? 0}</b></div><div>ROUND<b>${s.best.round + 1}</b></div><div>SNAGGED<b>${fmt((s.best.time ?? 0) * 1000)}</b></div></div></div>` : '<div class="tin"><div class="tn">Your next find awaits</div><p class="sub">Run it back and make it a star.</p></div>';
    if (s.best) card.querySelector('.tart')!.append(this.sticker(s.best));
    this.get('e-rows').innerHTML = s.rows.map((r) => `<div class="lrow"><span class="n">${r.round + 1}</span><div>${esc(r.name)}<small>${esc(r.sub)}</small></div><span class="v">+${r.pts}</span></div>`).join('');
    if (changed) { animate(card, [{ transform: 'scale(.4) rotate(-20deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], 'pop', { delay: 200 }); this.fx.burst(s.rank === 1 ? 110 : 50); }
  }
  sticker(find: FindView, withEyes = true): HTMLElement {
    const id = `ph${++this.photoCounter}`;
    let svg: string;
    if (find.photoId) svg = `<svg viewBox="0 0 120 120" aria-hidden="true"><defs><clipPath id="${id}"><rect x="10" y="10" width="100" height="100" rx="20"/></clipPath></defs><g filter="url(#diecut)"><rect x="10" y="10" width="100" height="100" rx="20" fill="#FFF8EC"/><image x="10" y="10" width="100" height="100" preserveAspectRatio="xMidYMid slice" clip-path="url(#${id})"/></g></svg>`;
    else if (find.obj && ART[find.obj]) svg = `<svg viewBox="0 0 120 120" aria-hidden="true"><use href="#o-${find.obj}" filter="url(#diecut)"/></svg>`;
    else svg = '<svg viewBox="0 0 120 120" aria-hidden="true"><rect x="10" y="10" width="100" height="100" rx="20" fill="#FFF8EC" stroke="#0E0B2B" stroke-width="4"/><text x="60" y="66" text-anchor="middle" fill="#0E0B2B" font-size="15" font-family="Rubik">No snag</text></svg>';
    const st = element(`<div class="stk">${svg}</div>`);
    if (find.photoId) {
      const image = st.querySelector('image')!;
      image.setAttribute('data-photo-id', find.photoId);
      void this.photo(find.photoId).then((url) => { if (image.isConnected) image.setAttribute('href', url); }).catch(() => { /* A disconnected view cancels its fetch. */ });
    }
    if (withEyes && find.eyes) this.eyes.addEyes(st, find.eyes);
    return st;
  }
  private photo(id: string): Promise<string> {
    const existing = this.photos.get(id); if (existing) return existing.promise;
    const abort = new AbortController();
    const entry: { abort: AbortController; promise: Promise<string>; url?: string } = { abort, promise: Promise.resolve('') };
    entry.promise = fetch(this.transport.photoUrl(id), { cache: 'no-store', signal: abort.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Photo unavailable');
      const blob = await response.blob(); if (abort.signal.aborted) throw new Error('Photo view closed');
      const url = URL.createObjectURL(blob); entry.url = url; return url;
    }).catch((error: unknown) => { if (this.photos.get(id) === entry) this.photos.delete(id); throw error; });
    this.photos.set(id, entry); return entry.promise;
  }
  private clearPhotos(): void { for (const photo of this.photos.values()) { photo.abort.abort(); if (photo.url) URL.revokeObjectURL(photo.url); } this.photos.clear(); }
  private retryPhotos(): void {
    if (!this.screen) return;
    this.get(`p-${this.screen.s.k}`).querySelectorAll<SVGImageElement>('image[data-photo-id]').forEach((image) => {
      if (image.hasAttribute('href')) return;
      const id = image.getAttribute('data-photo-id')!;
      void this.photo(id).then((url) => { if (image.isConnected) image.setAttribute('href', url); }).catch(() => { /* The next reconnect can retry a missing photo. */ });
    });
  }
  private toast(text: string, c: string): void {
    if (this.screen?.s.k !== 'cam') return;
    const rival = this.screen.teams.find((t) => t.color.toLowerCase() === c.toLowerCase());
    const item = element(`<div>${rival ? badge(rival) : `<span class="badge" style="--c:${color(c)}">!</span>`}<span>${esc(text)}</span></div>`); this.get('vfeed').append(item);
    animate(item, [{ opacity: 0, transform: 'translateX(-100%)' }, { opacity: 1, transform: 'none' }], 'soft');
    while (this.get('vfeed').childElementCount > 3) this.get('vfeed').firstElementChild!.remove();
    setTimeout(() => { const a = animate(item, [{ opacity: 1 }, { opacity: 0, transform: 'translateX(20px)' }], 'soft', { duration: 220 }); void a.finished.then(() => item.remove()).catch(() => item.remove()); }, 3200);
  }
  private award(pts: number, total: number): void {
    const number = this.get('pme').querySelector('b');
    this.scoreRoll = { from: Number(number?.textContent ?? this.screen?.me?.score ?? 0), to: total, at: performance.now() };
    this.fx.at(this.get('pme'), 60, [this.screen?.me?.color ?? TOKENS.bubble, TOKENS.yolk, TOKENS.paper]);
    if (pts > 0) haptic([10, 20, 10]); animate(this.get('pme'), [{ transform: 'scale(1)' }, { transform: 'scale(1.2)' }, { transform: 'scale(1)' }]);
  }
  private async capture(file?: File): Promise<void> {
    const msg = this.screen;
    if (!msg || msg.s.k !== 'cam' || msg.paused || this.capturing || this.lastSnagRound === msg.round || this.transport.now() >= (msg.deadline ?? Infinity)) return;
    if (!file && !this.camera.ready) { this.get<HTMLInputElement>('realfile').click(); return; }
    this.capturing = true; this.get<HTMLButtonElement>('shutter').disabled = true; this.get('shutter').classList.add('down');
    haptic([20, 30, 40]); animate(this.get('vflash'), [{ opacity: .95 }, { opacity: 0 }], 'soft', { duration: 350 });
    try {
      const target = msg.prompt?.kind === 'color' ? msg.prompt.hex ?? null : null;
      const result = file ? await snagFile(file, target) : await this.camera.capture(target);
      if (this.screen?.s.k !== 'cam' || this.screen.round !== msg.round || this.screen.paused || this.transport.now() >= (this.screen.deadline ?? Infinity)) return;
      const header: BinaryHeader = { t: 'snag', round: msg.round, hex: result.hex, match: result.match, prompt: msg.prompt ? `${msg.prompt.a} ${msg.prompt.b} ${msg.prompt.c}` : '', roundKind: msg.prompt?.kind ?? ROUNDS[msg.round]?.kind ?? 'color', redaction: result.redaction, ...(result.mask ? { mask: result.mask } : {}) };
      this.pendingSnag = { round: msg.round, frame: encodeBinary(header, result.bytes) }; this.lastSnagRound = msg.round;
      this.camera.stop(); this.flushInput(); this.cam(); this.fx.at(this.get('vf'), 36, [msg.me?.color ?? TOKENS.bubble, TOKENS.yolk, TOKENS.paper]);
    } catch (error) {
      this.status(error instanceof Error ? error.message : 'That photo couldn’t be opened. Try another one.');
      if (this.hunting() && !this.options.fixture) void this.camera.start();
    } finally { this.capturing = false; this.get('shutter').classList.remove('down'); }
  }
  private flushInput(): void {
    const msg = this.screen; if (!msg || msg.paused) return;
    if (msg.s.k === 'cam' && this.pendingSnag?.round === msg.round && this.transport.now() < (msg.deadline ?? Infinity)) this.transport.binary(this.pendingSnag.frame);
    if (msg.s.k === 'glow' && this.pendingGlow) this.sendGlow();
    if (msg.s.k === 'vote' && this.pendingVote && this.transport.now() < (msg.deadline ?? Infinity)) { if (this.transport.send(this.pendingVote)) this.pendingVote = null; }
  }
  private startHold(): void {
    const b = this.get<HTMLButtonElement>('b-start'); if (b.disabled || this.holdStart !== null || this.screen?.s.k !== 'lobby' || !this.screen.s.isHost || !this.screen.s.canStart || this.screen.paused) return;
    this.holdStart = performance.now(); this.holdTick = 0;
    const tick = (now: number) => {
      if (this.holdStart === null) return;
      const p = Math.min(1, (now - this.holdStart) / TIMING.START_HOLD_MS); b.style.setProperty('--p', String(p));
      const n = Math.floor(p * 4); if (n > this.holdTick) { this.holdTick = n; haptic(10); }
      if (p >= 1) { this.holdStart = null; this.startSent = this.send({ t: 'start' }); b.disabled = this.startSent; if (!this.startSent) b.style.setProperty('--p', '0'); return; }
      this.holdRaf = requestAnimationFrame(tick);
    }; this.holdRaf = requestAnimationFrame(tick);
  }
  private stopHold(): void { this.holdStart = null; cancelAnimationFrame(this.holdRaf); this.get('b-start').style.setProperty('--p', '0'); }
  private frame(now: number): void {
    const dt = Math.max(.001, Math.min(.05, (now - this.lastFrame) / 1000)); this.lastFrame = now;
    if (!document.hidden) { this.eyes.stepEyes(dt); this.fx.draw(dt); }
    if (this.scoreRoll) {
      const roll = this.scoreRoll, p = Math.min(1, (now - roll.at) / 900), n = this.get('pme').querySelector('b');
      if (n) n.textContent = String(Math.round(roll.from + (roll.to - roll.from) * (1 - (1 - p) ** 3)));
      if (p >= 1) this.scoreRoll = null;
    }
    const msg = this.screen;
    if (msg && msg.deadline !== undefined) {
      const t = timer(msg, this.pauseAt ?? this.transport.now()); const low = t.remaining < 10000;
      if (msg.s.k === 'cam') {
        this.get('ctime').textContent = fmt(t.remaining); this.get('ctime').classList.toggle('low', low); this.get('cbar').classList.toggle('low', low); this.get('cbari').style.transform = `scaleX(${t.fraction})`;
        if (!t.remaining) { this.camera.stop(); this.get<HTMLButtonElement>('shutter').disabled = true; }
      } else if (msg.s.k === 'glow') {
        this.get('gtime').textContent = fmt(t.remaining);
        if (!msg.paused && !t.remaining && !this.glow?.sent && now - this.lastAutoTry > 250) { this.lastAutoTry = now; this.sendGlow(); }
      } else if (msg.s.k === 'mash' && !t.remaining) this.get('mgrid').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.disabled = true);
      else if (msg.s.k === 'vote' && !t.remaining) this.get('vlist').querySelectorAll<HTMLButtonElement>('button').forEach((b) => b.disabled = true);
    }
    if (now - this.lastHype >= 300) { this.lastHype = now; this.hype = Math.max(0, this.hype - 2); this.get('w-hype').style.width = `${this.hype}%`; }
    this.raf = requestAnimationFrame((time) => this.frame(time));
  }
  sleep(): void { this.camera.stop(); this.stopHold(); this.taps.clear(); }
  roomClosed(): void { this.sleep(); this.clearPhotos(); this.pendingSnag = null; this.pendingGlow = null; this.pendingVote = null; this.root.querySelectorAll('image').forEach((image) => image.removeAttribute('href')); }
  wake(): void { if (this.hunting() && !this.options.fixture) void this.camera.start(); }
  destroy(): void { cancelAnimationFrame(this.raf); clearInterval(this.tapInterval); this.sleep(); this.clearPhotos(); }
  fixtureCamera(url: string): void { this.get('vf').style.background = `center / cover url("${url}")`; this.get('camera').hidden = true; }
  fixtureEyes(): void { this.addEye(44, 46); this.addEye(76, 46); }

  private bind(): void {
    this.get('tdice').onclick = () => { const input = this.get<HTMLInputElement>('tname'); const names = TEAM_NAMES.filter((name) => name !== input.value); input.value = pick(names); haptic(8); };
    this.get('fan').onclick = () => { this.fan(); haptic(8); };
    this.get('b-join').onclick = () => { if (this.screen?.s.k !== 'join') return; press(this.get('b-join')); const name = this.get<HTMLInputElement>('tname').value.trim().slice(0, 20) || pick(TEAM_NAMES); this.send({ t: 'join', name, color: this.selectedColor }); };
    this.get('tname').onkeydown = (e) => { if (e.key === 'Enter') this.get('b-join').click(); };
    const start = this.get<HTMLButtonElement>('b-start');
    start.onpointerdown = (e) => { if (start.disabled) return; e.preventDefault(); start.setPointerCapture(e.pointerId); this.startHold(); };
    start.onkeydown = (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); this.startHold(); } };
    for (const event of ['pointerup', 'pointercancel', 'pointerleave', 'keyup', 'blur']) start.addEventListener(event, () => { if (this.holdStart !== null) this.stopHold(); });
    this.get('bots-toggle').onclick = () => { if (this.screen?.s.k === 'lobby' && this.screen.s.isHost && !this.screen.paused) this.send({ t: 'bots', on: !this.screen.s.botsOn }); };
    this.get('host-toggle').onclick = () => { const menu = this.get('host-menu'); menu.hidden = !menu.hidden; this.get('host-toggle').setAttribute('aria-expanded', String(!menu.hidden)); };
    this.get('host-menu').onclick = (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>('[data-control]')?.dataset.control;
      if (!this.transport.hostIdentity() || !action || !['skip', 'pause', 'resume', 'end'].includes(action)) return;
      this.send({ t: 'control', action: action as 'skip' | 'pause' | 'resume' | 'end' }); this.get('host-menu').hidden = true; this.get('host-toggle').setAttribute('aria-expanded', 'false');
    };
    this.get('resume-button').onclick = () => { if (this.transport.hostIdentity()) this.send({ t: 'control', action: 'resume' }); };
    this.get('copy-link').onclick = async () => {
      try { await navigator.clipboard.writeText(location.href); this.get('copy-link').textContent = 'Link copied! Open your browser.'; this.get('inapp').hidden = true; }
      catch { this.get('copy-link').textContent = 'Select and copy the address above'; }
    };
    this.get('shutter').onclick = () => void this.capture();
    const choose = () => { if (!this.hunting()) return; const file = this.get<HTMLInputElement>('realfile'); file.value = ''; file.click(); };
    this.get('b-real').onclick = choose; this.get('fallback-pick').onclick = choose;
    this.get<HTMLInputElement>('realfile').onchange = (e) => { const file = (e.target as HTMLInputElement).files?.[0]; if (file) { this.camera.stop(); void this.capture(file); } (e.target as HTMLInputElement).value = ''; };
    this.get('gstage').onclick = (e) => { const r = this.get('gstage').getBoundingClientRect(); this.addEye((e.clientX - r.left) / r.width * 120, (e.clientY - r.top) / r.height * 120); };
    this.get('gstage').onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.addEye(this.glow?.eyes.length ? 78 : 42, 46); } };
    this.get('b-send').onclick = () => { press(this.get('b-send')); this.sendGlow(); };
    const reactions = this.get('react');
    REACTIONS.forEach((kind) => {
      const b = element(`<button aria-label="Send a ${kind}" data-reaction="${kind}" style="background:${kind === 'tomato' ? TOKENS.paper : REACTION_COLORS[kind]}"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${kind}"/></svg></button>`);
      b.onclick = () => { if (this.screen?.s.k !== 'wait' || this.screen.paused || !this.reactions.allow(performance.now())) return; this.send({ t: 'react', kind }); this.hype = Math.min(100, this.hype + 6); this.get('w-hype').style.width = `${this.hype}%`; haptic(6); animate(b, [{ transform: 'scale(1)' }, { transform: 'scale(1.15) rotate(-6deg)' }, { transform: 'scale(1)' }], 'pop', { duration: 200 }); };
      reactions.append(b);
    });
    this.get('b-again').onclick = () => { if (this.screen?.s.k === 'end') { this.send({ t: 'again' }); this.clearPhotos(); } };
    const card = this.get('e-card');
    card.onpointermove = (e) => { if (this.screen?.s.k !== 'end') return; const r = card.getBoundingClientRect(); card.style.transform = `perspective(700px) rotateY(${((e.clientX - r.left) / r.width - .5) * 24}deg) rotateX(${(-((e.clientY - r.top) / r.height - .5) * 24)}deg)`; };
    card.onpointerleave = () => { card.style.transform = ''; };
    const permission = async () => {
      if (this.orientationRequested) return;
      this.orientationRequested = true;
      const orientation = window.DeviceOrientationEvent as (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<string> }) | undefined;
      if (!orientation) return;
      try { this.orientationAllowed = !orientation.requestPermission || await orientation.requestPermission() === 'granted'; } catch { this.orientationAllowed = false; }
    };
    card.onclick = () => void permission(); card.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); void permission(); } };
    if (typeof DeviceOrientationEvent !== 'undefined' && !('requestPermission' in DeviceOrientationEvent)) this.orientationAllowed = true;
    window.addEventListener('deviceorientation', (e) => { if (!this.orientationAllowed || this.screen?.s.k !== 'end' || e.gamma === null || e.beta === null) return; card.style.transform = `perspective(700px) rotateY(${clamp(e.gamma, -30, 30) * .6}deg) rotateX(${clamp(e.beta - 45, -30, 30) * -.6}deg)`; });
  }
}
