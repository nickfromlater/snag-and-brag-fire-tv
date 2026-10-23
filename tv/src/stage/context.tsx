import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { Clock, CueEvent, TvView, Anchor } from '@snag/shared';
import { frameClock } from './frame-clock';
import type { SpeechCache } from '../runtime/speech';

export interface Bounds { x: number; y: number; width: number; height: number }
export interface StageSession {
  readonly clock: Clock;
  readonly capturePose?: 'judge-mask' | 'hologram';
  readonly presentationRevision?: number;
  readonly capture?: boolean;
  readonly roomCode?: string;
  readonly speech?: SpeechCache;
  latestHost?(): CueEvent | undefined;
  speechTiming?(text: string, remainingMs: number): void;
  getView(): TvView;
  subscribe(fn: () => void): () => void;
  cues(fn: (event: CueEvent) => void): () => void;
  photoUrl(id: string): string | undefined;
  remote(key: import('@snag/shared').RemoteKey): void;
  mediaControl?: (action: import('./game-media-controls').MediaTransportAction, route: 'handler' | 'sdk') => Promise<void>;
  telemetry(kind: string, fields?: Record<string, string | number | boolean | null>): void;
}
export const StageContext = createContext<StageSession | null>(null);
const TvViewContext = createContext<TvView | null>(null);
export function useSession(): StageSession { const s = useContext(StageContext); if (!s) throw new Error('Stage primitives require StageSession'); return s; }
export function useTvView(): TvView { const view = useContext(TvViewContext); if (!view) throw new Error('Stage primitives require a TV view'); return view; }
export const anchors = new Map<string, Bounds>();
export function resolveAnchor(a: Anchor): { x: number; y: number; width: number; height: number } {
  if (!('target' in a)) return { ...a, width: 120, height: 120 };
  const b = anchors.get(a.target) ?? { x: a.target.startsWith('phone:') ? 640 : 640, y: a.target.startsWith('phone:') ? 780 : 360, width: 120, height: 120 };
  return { x: (a.x ?? b.x + b.width / 2) + (a.dx ?? 0), y: (a.y ?? b.y + b.height / 2) + (a.dy ?? 0), width: b.width, height: b.height };
}
export function StageProvider({ session, children }: { session: StageSession; children: React.ReactNode }): React.ReactElement {
  const [view, setView] = useState(() => session.getView());
  useEffect(() => { setView(session.getView()); return session.subscribe(() => setView(session.getView())); }, [session]);
  return <StageContext.Provider value={session}><TvViewContext.Provider value={view}>{children}</TvViewContext.Provider></StageContext.Provider>;
}
