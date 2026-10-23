import { expect, it } from 'vitest';
import { Timeline } from '../src/game/timeline';
import type { Clock } from '../src/game/types';

it('keeps an animation origin stable on a ticking clock and shifts it by the actual pause', () => {
  let wall = 1000;
  const clock: Clock = { now: () => wall++, setTimeout: () => 0, clearTimeout: () => {} };
  const timeline = new Timeline(clock), origin = timeline.now();
  for (let i = 0; i < 50; i++) expect(timeline.wall(origin)).toBe(origin);
  timeline.pause();
  const before = timeline.wall(origin); wall += 100;
  expect(timeline.wall(origin) - before).toBe(101);
  timeline.resume();
  const resumed = timeline.wall(origin);
  wall += 1000;
  expect(timeline.wall(origin)).toBe(resumed);
  expect(resumed).toBeGreaterThan(origin + 100);
});
