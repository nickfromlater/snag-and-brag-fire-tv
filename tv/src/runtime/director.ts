import type { CueEvent, FindView, ScreenMsg, SnagArrived, TvView } from '@snag/shared';
import { OBJI } from '@snag/shared';
import type { TvClock } from './clock';

export interface DirectorFrame { t: 'director-frame'; atMs: number; held: boolean; seeking: boolean; view: TvView; cues: CueEvent[]; phoneScreen?: ScreenMsg; pose?: 'judge-mask' | 'hologram' }
/** Native drawing still uses the ordinary scenes and motion primitives. */
export class DirectorPlayback {
  frame?: DirectorFrame;
  generation = 0;
  private consumed = 0;
  constructor(private readonly clock: TvClock) {}
  accept(frame: DirectorFrame, cue: (event: CueEvent) => void): void {
    if (!Number.isFinite(frame.atMs) || frame.atMs < 0 || !frame.view || !Array.isArray(frame.cues)) throw new Error('Invalid director frame');
    this.clock.present(frame.atMs, frame.held);
    this.frame = frame;
    if (frame.seeking) { this.generation++; this.consumed = 0; return; }
    for (const event of frame.cues) if (event.seq > this.consumed) { this.consumed = event.seq; cue(event); }
  }
  view(room: { code: string; joinUrl: string }, photo?: SnagArrived): TvView | undefined {
    if (!this.frame) return;
    const v = this.frame.view, team = v.teams[0]?.id;
    const find = (f: FindView): FindView => photo && f.team === team && f.round === photo.round
      ? { ...f, obj: undefined, photoId: photo.photoId, hex: photo.hex, match: photo.match, mask: photo.mask } : f;
    const c = v.content;
    const content = c.k === 'lobby' ? { ...c, ...room }
      : c.k === 'brag' && this.frame.held ? { ...c, match: { ...c.match, taps: {} } }
      : c.k === 'judge' ? { ...c, cards: c.cards.map(card => ({ ...card, find: find(card.find) })) }
      : c.k === 'show' ? { ...c, pedestals: c.pedestals.map(p => ({ ...p, find: find(p.find) })) }
      : c.k === 'champ' && c.object ? { ...c, object: find(c.object) } : c;
    let motion = v.motion;
    // Keep the phone's actual selected cells visible for the all-scored pickup,
    // just as the web director holds its scan overlay during PNG encoding.
    if (this.frame.held && this.frame.pose === 'judge-mask' && photo && c.k === 'judge') {
      const target = 'judge-beam:' + team, states = v.motion[target];
      if (states) motion = { ...motion, [target]: states.map(s => ({ ...s, startedAt: this.frame!.atMs - 1800, elapsedMs: 1800 })) };
    }
    return { ...v, paused: this.frame.held || v.paused, content, motion,
      feeds: v.feeds.map(f => ({ ...f, ...(f.find ? { find: find(f.find) } : {}) })), history: v.history.map(find) };
  }
  screen(sequence: number, relayNow: number, photo?: SnagArrived): ScreenMsg | undefined {
    const s = this.frame?.phoneScreen;
    if (!s || !this.frame) return;
    const find = (f: FindView): FindView => photo && f.round === photo.round
      ? { ...f, obj: undefined, photoId: photo.photoId, hex: photo.hex, match: photo.match, mask: photo.mask } : f;
    const glove = OBJI.glove!;
    const screen = photo && s.round === photo.round && s.s.k === 'cam' && s.me
      ? { k: 'glow' as const, find: find({ team: s.me.id, round: s.round, obj: 'glove', name: glove.names[0]!, brag: glove.brags[0]!, thing: glove.nm, eyes: glove.eyes }), names: [...glove.names], brags: [...glove.brags], aiPending: false }
      : s.s.k === 'glow' ? { ...s.s, find: find(s.s.find) } : s.s.k === 'wait' && s.s.card ? { ...s.s, card: find(s.s.card) } : s.s;
    return { ...s, seq: sequence, paused: this.frame.held || s.paused,
      ...(s.deadline === undefined ? {} : { deadline: Math.round(relayNow + s.deadline - this.clock.now()) }), s: screen };
  }
}
