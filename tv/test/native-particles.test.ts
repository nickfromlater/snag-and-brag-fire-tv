import { expect, it, vi } from 'vitest';
vi.mock('../src/stage/context', () => ({ resolveAnchor: () => ({ x: 640, y: 300 }) }));
vi.mock('../src/stage/glyphs', () => ({ glyphCache: { get: () => ({ d: 'M1 2L11 17Z', width: 11, baseline: 17 }) } }));
import { ParticleEngine, particleBatches } from '../src/stage/particles';
import { particlePlan } from '../src/stage/particle-plan';
import { nativeParticleAt, nativeParticleDrawing, nativeParticleGroups } from '../src/stage/native-particles';

it('matches the reference particle paths and alpha at every 30 Hz frame without future path tables', () => {
  const engine = new ParticleEngine();
  for (const drag of [1, .99, .9]) for (const kind of ['rect', 'star', 'spark', 'ring', 'icon', 'text'] as const) {
    engine.add({ kind, x: 321.37, y: 221.19, px: 319, py: 218, vx: -151.7, vy: -301.3, vr: 2.17, r: .17, gravity: 1207, drag, t: .019, life: 2.137, color: '#FFD43B', icon: 'heart', text: '10' });
  }
  for (const icon of ['flame', 'tomato', 'star']) engine.add({ kind: 'icon', icon, x: 701.21, y: 441.27, vx: 19, vy: -44, gravity: 11, life: 2.137 });
  const groups = nativeParticleGroups(engine.particles);
  for (let frame = 0; frame < 66; frame++) {
    const reference = particleBatches(engine);
    for (const group of groups) for (const alpha of [1, .75, .5, .25]) {
      const expected = reference.find(b => b.color === group.color && (b.fill === 'none') === group.stroke && b.alpha === alpha);
      const actual = nativeParticleDrawing(group, alpha, frame);
      const expectedPath = expected?.d || 'M0 0', numbers = /-?\d+(?:\.\d+)?/g;
      expect(actual.d.replace(numbers, '#')).toBe(expectedPath.replace(numbers, '#'));
      const a = actual.d.match(numbers)!.map(Number), b = expectedPath.match(numbers)!.map(Number);
      // Equivalent sums can round on opposite sides of a tenth-pixel boundary.
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i]! - b[i]!)).toBeLessThanOrEqual(.10000001);
      expect(actual.opacity).toBe(expected?.alpha ?? 0);
      if (expected) expect(Number(actual.strokeWidth)).toBeCloseTo(expected.width, 8);
    }
    engine.step(1 / 30);
  }
});

it('keeps a constant-size immutable UI payload for a long confetti burst', () => {
  const engine = new ParticleEngine();
  for (let i = 0; i < 120; i++) engine.add({ kind: i % 2 ? 'rect' : 'star', x: 640, y: 300, vx: i * 3 - 180, vy: -300, gravity: 1200, drag: .99, life: 2.5 });
  const groups = nativeParticleGroups(engine.particles), before = JSON.stringify(groups);
  expect(before.length).toBeLessThan(JSON.stringify(particlePlan(engine)).length / 10);
  engine.step(.1); engine.clear();
  expect(JSON.stringify(groups)).toBe(before);
  expect(nativeParticleAt(groups[0]!.particles[0]!, 0)).toMatchObject({ x: 640, y: 300, t: 0 });
});
