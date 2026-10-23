import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { seededRng } from '@snag/shared';
import { createEye, EYE_HZ, EYE_REST_Y, eyeAt, sampleEyeSway, sampleEyeTrajectory } from '../src/stage/eyes';

describe('precomputed reference eyes', () => {
  it('matches the actual mockup integration after a kick and parent impulse, without mutating its input', () => {
    const source = readFileSync('../reference/src/game.js', 'utf8');
    const physics = source.slice(source.indexOf('var EYES=[];'), source.indexOf('/* =====================================================================\n   TV: scaling'));
    const initial = Object.freeze({ x: .12, y: .6, vx: -2, vy: -3 });
    const kick = { power: 18, direction: { x: -.7, y: -.8 }, parentImpulse: { x: 60, y: -20, width: 78 } };
    const trajectory = sampleEyeTrajectory(initial, kick);
    const pupil = { ...initial, vx: initial.vx + kick.power * kick.direction.x, vy: initial.vy + kick.power * kick.direction.y,
      lx: 0, ly: 0, el: { isConnected: true }, p: { style: { transform: '' } },
      host: { getBoundingClientRect: () => ({ left: 60 - 39, top: -20 - 39, width: 78, height: 78 }) } };
    const reference = runInNewContext(physics + '\nEYES.push(pupil); stepEyes;', { pupil, clamp: (v: number, a: number, b: number) => Math.max(a, Math.min(b, v)) }) as (dt: number) => void;
    for (const sample of trajectory.samples.slice(1)) {
      reference(1 / EYE_HZ);
      for (const field of ['x', 'y', 'vx', 'vy'] as const) expect(sample[field]).toBeCloseTo(pupil[field], 12);
      expect(Math.hypot(sample.x, sample.y)).toBeLessThanOrEqual(1.000001);
    }
    expect(initial).toEqual({ x: .12, y: .6, vx: -2, vy: -3 });
    expect(trajectory).toEqual(sampleEyeTrajectory(initial, kick));
    expect(Math.hypot(pupil.x, pupil.y - EYE_REST_Y)).toBeLessThan(.035);
    expect(Math.hypot(pupil.vx, pupil.vy)).toBeLessThan(.15);
  });

  it('restarts a rapid kick at the current interpolated position and retains momentum', () => {
    const first = sampleEyeTrajectory(createEye(seededRng(2)), { power: 14, direction: { x: .8, y: -.6 } });
    const current = eyeAt(first, .417);
    const next = sampleEyeTrajectory(current, { power: 10, direction: { x: -.5, y: .2 } });
    expect(next.samples[0]).toMatchObject({ x: current.x, y: current.y, vx: current.vx - 5, vy: current.vy + 2 });
    expect(eyeAt(first, 100)).toMatchObject(eyeAt(first, first.duration));
  });

  it('has closed staggered idle loops with no position jump on entry or wrap', () => {
    const rest = { x: .01, y: EYE_REST_Y, vx: 0, vy: 0 };
    const a = sampleEyeSway(rest, .2), b = sampleEyeSway(rest, 1.6);
    expect(a.samples[0]).toMatchObject({ x: rest.x, y: rest.y });
    expect(a.samples.at(-1)).toEqual({ ...a.samples[0], time: a.duration });
    expect(eyeAt(a, .8).x).not.toBeCloseTo(eyeAt(b, .8).x, 3);
    expect(eyeAt(a, a.duration + .417, true)).toEqual(eyeAt(a, .417, true));
    for (const sample of a.samples) expect(Math.hypot(sample.x, sample.y)).toBeLessThan(1);
  });
});
