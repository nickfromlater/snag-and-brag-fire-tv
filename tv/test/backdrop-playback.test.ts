import { expect, it, vi } from 'vitest';
import { BackdropPlayback, releaseBackdrops } from '../src/stage/backdrop-playback';

function fixture() {
  let initialized!: () => void;
  const player = { src: '', loop: false, initialize: vi.fn(() => new Promise<void>(resolve => { initialized = resolve; })),
    deinitialize: vi.fn(() => Promise.resolve()), play: vi.fn<() => void | Promise<void>>(), pause: vi.fn(), setSurfaceHandle: vi.fn(), clearSurfaceHandle: vi.fn() };
  const failed = vi.fn(); const playback = new BackdropPlayback(player, 'normal', failed);
  return { player, playback, failed, initialized: async () => { initialized(); await Promise.resolve(); } };
}

it('waits for both native initialization and a surface before starting visible video', async () => {
  const f = fixture(); f.playback.start(); await f.initialized();
  expect(f.player.play).not.toHaveBeenCalled();
  f.playback.setSurface('surface');
  expect(f.player.setSurfaceHandle).toHaveBeenCalledWith('surface');
  expect(f.player.src).toBe('/pkg/assets/raw/stage-normal.mp4');
  expect(f.player.play).toHaveBeenCalledTimes(1); expect(f.player.loop).toBe(true);
  f.playback.stop();
});

it('never starts an initialization that completes after the app has backgrounded', async () => {
  const f = fixture(); f.playback.setSurface('surface'); f.playback.start(); f.playback.stop();
  await f.initialized();
  expect(f.player.play).not.toHaveBeenCalled(); expect(f.player.setSurfaceHandle).not.toHaveBeenCalled();
  expect(f.player.deinitialize).toHaveBeenCalledTimes(1); expect(f.failed).not.toHaveBeenCalled();
});

it('releases immediately and once, including when the surface was already destroyed', async () => {
  const f = fixture(); f.playback.start(); f.playback.setSurface('surface'); await f.initialized();
  f.player.clearSurfaceHandle.mockImplementation(() => { throw new Error('Surface gone'); });
  f.playback.stop(); f.playback.stop();
  expect(f.player.pause).toHaveBeenCalled(); expect(f.player.deinitialize).toHaveBeenCalledTimes(1);
});

it('keeps one decoder across moods and pauses, and detaches a destroyed surface', async () => {
  const f = fixture(); f.playback.start(); f.playback.setSurface('first'); await f.initialized();
  f.playback.update('gold', true); expect(f.player.src).toBe('/pkg/assets/raw/stage-gold.mp4');
  expect(f.player.pause).toHaveBeenCalledTimes(1);
  f.playback.setSurface(undefined); expect(f.player.clearSurfaceHandle).toHaveBeenCalledWith('first');
  f.playback.update('party', false); const played = f.player.play.mock.calls.length;
  f.playback.setSurface('second'); expect(f.player.setSurfaceHandle).toHaveBeenLastCalledWith('second');
  expect(f.player.play).toHaveBeenCalledTimes(played + 1); expect(f.player.initialize).toHaveBeenCalledTimes(1);
  f.playback.stop();
});

it('falls back on a rejected native play promise and ignores rejection after unmount', async () => {
  const f = fixture(); f.player.play.mockReturnValueOnce(Promise.reject(new Error('Decoder unavailable')));
  f.playback.setSurface('surface'); f.playback.start(); await f.initialized(); await Promise.resolve();
  expect(f.failed).toHaveBeenCalledTimes(1);
  let reject!: (error: Error) => void;
  f.player.play.mockReturnValueOnce(new Promise<void>((_resolve, fail) => { reject = fail; }));
  f.playback.update('party', false); f.playback.stop(); reject(new Error('Released'));
  await Promise.resolve(); expect(f.failed).toHaveBeenCalledTimes(1);
});

it('releases ready and initializing decoders before any React unmount effects run', async () => {
  const ready = fixture(), pending = fixture();
  ready.playback.setSurface('surface'); ready.playback.start(); await ready.initialized();
  pending.playback.setSurface('pending'); pending.playback.start();
  expect(releaseBackdrops()).toBe(2);
  expect(ready.player.clearSurfaceHandle).toHaveBeenCalledWith('surface');
  expect(ready.player.deinitialize).toHaveBeenCalledTimes(1);
  expect(releaseBackdrops()).toBe(0);
  await pending.initialized();
  expect(pending.player.play).not.toHaveBeenCalled();
  expect(pending.player.deinitialize).toHaveBeenCalledTimes(1);
});
