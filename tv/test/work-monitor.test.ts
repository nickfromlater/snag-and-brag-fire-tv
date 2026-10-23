import { afterEach, expect, it } from 'vitest';
import { observeWork, traceNativeCalls } from '../src/stage/work-monitor';
afterEach(() => observeWork());

it('leaves production instances unmodified', () => {
  const p = { play() { return this; } }, play = p.play;
  expect(traceNativeCalls(p, 'player', ['play'])).toBe(p); expect(p.play).toBe(play);
});

it('records entry/return while preserving method receivers, promises and accessor behavior', async () => {
  const records: Record<string, string | number>[] = []; observeWork(x => records.push(x));
  class Player {
    private value = ''; readonly started = Promise.resolve();
    get src() { return this.value; } set src(value: string) { this.value = value; }
    play() { return this.started; }
  }
  const p = traceNativeCalls(new Player(), 'player', ['play'], ['src']);
  p.src = 'private-media-uri'; expect(p.src).toBe('private-media-uri');
  expect(p.play()).toBe(p.started); await p.started;
  expect(records.map(x => x.file + '/' + x.phase)).toEqual(['native-set-src/start', 'native-set-src/end', 'native-play/start', 'native-play/end']);
  expect(JSON.stringify(records)).not.toContain('private-media-uri');
});

it('records a throwing native method without swallowing the original error', () => {
  const records: Record<string, string | number>[] = []; observeWork(x => records.push(x));
  const error = new Error('native failure'), p = traceNativeCalls({ pause() { throw error; } }, 'player', ['pause']);
  expect(() => p.pause()).toThrow(error); expect(records.map(x => x.phase)).toEqual(['start', 'end']);
});
