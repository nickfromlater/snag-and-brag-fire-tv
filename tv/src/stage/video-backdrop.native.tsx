import React, { useEffect, useRef } from 'react';
import { KeplerVideoSurfaceView, VideoPlayer } from '@amazon-devices/react-native-w3cmedia';
import type { Mood } from '@snag/shared';
import { BackdropPlayback } from './backdrop-playback';
import { traceNativeCalls } from './work-monitor';

/** Actual stage artwork plays through Vega's hardware video surface during games. */
export function VideoBackdrop({ mood, paused, onFailure, onStatus }: { mood: Mood; paused: boolean; onFailure(): void; onStatus?(status: string): void }): React.ReactElement {
  const controller = useRef<BackdropPlayback>();
  const handle = useRef<string>();
  const current = useRef({ mood, paused, onFailure, onStatus }); current.current = { mood, paused, onFailure, onStatus };
  useEffect(() => {
    const player = traceNativeCalls(new VideoPlayer(), 'stage-video', ['initialize', 'deinitialize', 'play', 'pause', 'setSurfaceHandle', 'clearSurfaceHandle'], ['src', 'currentTime']);
    const playback = new BackdropPlayback(player, current.current.mood, () => current.current.onFailure());
    const error = () => current.current.onFailure(); player.addEventListener('error', error);
    const playing = () => current.current.onStatus?.('playing'); player.addEventListener('playing', playing);
    controller.current = playback; playback.update(current.current.mood, current.current.paused);
    playback.setSurface(handle.current); playback.start();
    return () => { controller.current = undefined; playback.stop(); player.removeEventListener('error', error); player.removeEventListener('playing', playing); current.current.onStatus?.('release-requested'); };
  }, []);
  useEffect(() => controller.current?.update(mood, paused), [mood, paused]);
  return <KeplerVideoSurfaceView scalingmode="fit" style={{ position: 'absolute', left: 0, top: 0, width: 1280, height: 720, zIndex: 0 }}
    onSurfaceViewCreated={value => { handle.current = value; controller.current?.setSurface(value); }}
    onSurfaceViewDestroyed={() => { handle.current = undefined; controller.current?.setSurface(undefined); }}/>;
}
