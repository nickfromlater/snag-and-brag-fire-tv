import { expect, it } from 'vitest';
import { cachedMotionTable, motionTableSteps } from '../src/stage/motion-table';

it('samples native motion once per 30 fps frame, bounded to 12..120 intervals', () => {
  expect(motionTableSteps(100)).toBe(12);
  expect(motionTableSteps(1000)).toBe(30);
  expect(motionTableSteps(2500)).toBe(75);
  expect(motionTableSteps(60000)).toBe(120);
});
it('builds a repeated beat once and reuses the same table', () => {
  let builds = 0;
  const build = () => { builds++; return [{ x: 1 }]; };
  const a = cachedMotionTable('beat:intro.title:400', build), b = cachedMotionTable('beat:intro.title:400', build);
  expect(b).toBe(a); expect(builds).toBe(1);
  for (let i = 0; i < 300; i++) cachedMotionTable('fill:' + i, build);
  expect(cachedMotionTable('beat:intro.title:400', build)).not.toBe(a);
});
