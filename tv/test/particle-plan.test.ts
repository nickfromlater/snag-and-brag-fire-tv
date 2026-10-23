import { expect, it, vi } from 'vitest';
vi.mock('../src/stage/context', () => ({ resolveAnchor: () => ({ x: 640, y: 300 }) }));
vi.mock('../src/stage/glyphs', () => ({ glyphCache: {} }));
import { ParticleEngine } from '../src/stage/particles';
import { particlePlan, particlePlanAsync } from '../src/stage/particle-plan';

it('keeps the same sampled geometry from an immutable snapshot while yielding to native callbacks', async () => {
  const engine = new ParticleEngine();
  for (let i = 0; i < 120; i++) engine.add({ kind: i % 2 ? 'rect' : 'star', x: 640, y: 300, vx: i * 3 - 180, vy: -300, gravity: 1200, drag: .99, life: 1.5, color: i % 2 ? '#FFD43B' : '#FFFFFF' });
  engine.add({ kind: 'ring', x: 640, y: 300, radius: 120, life: .5 });
  const before = engine.particles.map(p => ({ ...p })), expected = particlePlan(engine);
  expect(engine.particles).toEqual(before);
  let yields = 0;
  const actual = await particlePlanAsync(engine, async () => { yields++; engine.clear(); }, () => false);
  expect(yields).toBeGreaterThan(1);
  expect(actual).toEqual(expected);
  expect(engine.particles).toHaveLength(0);
});

it('abandons a yielded plan after its scene or pause generation changes', async () => {
  const engine = new ParticleEngine(); engine.add({ life: 2 });
  let cancelled = false;
  const plan = await particlePlanAsync(engine, async () => { cancelled = true; }, () => cancelled);
  expect(plan).toBeUndefined();
  expect(engine.particles[0]?.t).toBe(0);
});
