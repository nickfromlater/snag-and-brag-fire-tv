import type { IMediaControlHandlerAsync, IMediaSessionId, MediaSessionState, PlaybackStatus } from '@amazon-devices/kepler-media-controls';
import type { StageSession } from './context';

export type MediaTransportAction = 'play' | 'pause' | 'togglePlayPause' | 'stop' | 'next' | 'fastForward';
export const MEDIA_TRANSPORT_ACTIONS: readonly MediaTransportAction[] = ['play', 'pause', 'togglePlayPause', 'stop', 'next', 'fastForward'];
const sessionId = { id: 1 };
const actions = ['PLAY', 'PAUSE', 'TOGGLE_PLAY_PAUSE', 'STOP', 'NEXT', 'FAST_FORWARD'].map(name => ({ name }));

/** The audio sample overrides player callbacks; these overrides control the show.
 * One game session owns transport, independent of music/SFX/Polly player lifetimes. */
export class GameMediaControlHandler implements IMediaControlHandlerAsync {
  private lastState?: string;
  private disposed = false;
  constructor(private readonly session: StageSession, private readonly update: (states: MediaSessionState[]) => void) {}
  states(id?: IMediaSessionId): MediaSessionState[] {
    const view = this.session.getView();
    // KMC's client uses {id: NaN} for an omitted/default session.
    if (id && Number.isFinite(id.id) && id.id !== sessionId.id) return [];
    const active = !this.disposed && view.scene !== 'lobby' && !view.completed;
    return [{ id: sessionId, playbackState: { playbackStatus: (!active ? 'NOT_PLAYING' : view.paused ? 'PAUSED' : 'PLAYING') as PlaybackStatus, playbackSpeed: 1 },
      mediaInfo: { id: { contentId: 'snag-and-brag-show', catalogName: 'snag-and-brag' }, hasVideo: false, availableAudioTracks: [], availableTextTracks: [] },
      playlistState: { repeatMode: 0, shuffle: false },
      capabilities: { actions: active ? actions : [], speeds: [1], ratings: [], forwardSkipSteps: [], backwardSkipSteps: [] }, controls: [] }];
  }
  publish(): void {
    const states = this.states(), status = states[0]?.playbackState.playbackStatus ?? 'NOT_PLAYING';
    if (status === this.lastState) return;
    this.update(states); this.lastState = status;
    this.session.telemetry('media-session', { active: status !== 'NOT_PLAYING', status, sessionId: sessionId.id, actions: status !== 'NOT_PLAYING' ? actions.map(a => a.name).join(',') : '' });
  }
  dispose(): void { this.disposed = true; this.publish(); }
  private apply(action: MediaTransportAction, id?: IMediaSessionId): void {
    const state = this.states(id)[0];
    if (!state || state.playbackState.playbackStatus === 'NOT_PLAYING') throw new Error('No live game media session');
    const paused = this.session.getView().paused;
    if (action === 'next' || action === 'fastForward') this.session.remote('ff');
    else if (action === 'togglePlayPause' || ((action === 'pause' || action === 'stop') !== paused)) this.session.remote('playpause');
    this.publish();
    this.session.telemetry('media-handler', { action, paused: this.session.getView().paused, phase: this.session.getView().phase });
  }
  async handlePlay(id?: IMediaSessionId): Promise<void> { this.apply('play', id); }
  async handlePause(id?: IMediaSessionId): Promise<void> { this.apply('pause', id); }
  async handleTogglePlayPause(id?: IMediaSessionId): Promise<void> { this.apply('togglePlayPause', id); }
  async handleStop(id?: IMediaSessionId): Promise<void> { this.apply('stop', id); }
  async handleNext(id?: IMediaSessionId): Promise<void> { this.apply('next', id); }
  async handleFastForward(id?: IMediaSessionId): Promise<void> { this.apply('fastForward', id); }
  async handleGetSessionState(id?: IMediaSessionId): Promise<MediaSessionState[]> { return this.states(id); }
  async handleGetMetadataInfo(): Promise<Awaited<ReturnType<IMediaControlHandlerAsync['handleGetMetadataInfo']>>> {
    return { mediaId: 'snag-and-brag-show', title: 'Snag & Brag', artwork: [] };
  }
  private unsupported(): Promise<never> { return Promise.reject(new Error('Unsupported game media command')); }
  handleStartOver = (): Promise<never> => this.unsupported();
  handleRewind = (): Promise<never> => this.unsupported();
  handleSetPlaybackSpeed = (): Promise<never> => this.unsupported();
  handleSkipForward = (): Promise<never> => this.unsupported();
  handleSkipBackward = (): Promise<never> => this.unsupported();
  handleSeek = (): Promise<never> => this.unsupported();
  handleSetAudioVolume = (): Promise<never> => this.unsupported();
  handleSetAudioTrack = (): Promise<never> => this.unsupported();
  handleEnableTextTrack = (): Promise<never> => this.unsupported();
  handleDisableTextTrack = (): Promise<never> => this.unsupported();
  handlePrevious = (): Promise<never> => this.unsupported();
  handleEnableShuffle = (): Promise<never> => this.unsupported();
  handleSetRepeatMode = (): Promise<never> => this.unsupported();
  handleSetRating = (): Promise<never> => this.unsupported();
  handleCustomAction = (): Promise<never> => this.unsupported();
}
