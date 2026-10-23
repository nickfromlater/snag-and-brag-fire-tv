import { particleBatches, ParticleEngine } from './particles';
export interface ParticleDrawing { d: string; opacity: number; strokeWidth: string }
export interface ParticleTrack { key: string; color: string; stroke: boolean; frames: ParticleDrawing[] }
export interface ParticlePlan { duration: number; tracks: ParticleTrack[] }
/** Freeze the exact existing particle recipe at 30 Hz; one clock plays all tracks. */
function* samplePlan(engine: ParticleEngine): Generator<void, ParticlePlan> {
  const simulation = new ParticleEngine(); simulation.particles.push(...engine.particles.map(p => ({ ...p })));
  const frames = Math.max(1, Math.ceil(Math.max(0, ...simulation.particles.map(p => p.life - p.t)) * 30) + 1), tracks = new Map<string, ParticleTrack>();
  for (let frame = 0; frame <= frames; frame++) {
    for (const batch of particleBatches(simulation)) {
      const stroke = batch.fill === 'none', key = batch.color + '/' + batch.alpha + '/' + (stroke ? 'stroke' : 'fill');
      let track = tracks.get(key);
      if (!track) { track = { key, color: batch.color, stroke, frames: Array.from({ length: frames + 1 }, () => ({ d: 'M0 0', opacity: 0, strokeWidth: '3' })) }; tracks.set(key, track); }
      track.frames[frame] = { d: batch.d, opacity: batch.alpha, strokeWidth: String(batch.width) };
    }
    simulation.step(1 / 30);
    yield;
  }
  return { duration: frames * 1000 / 30, tracks: [...tracks.values()] };
}
export function particlePlan(engine: ParticleEngine): ParticlePlan {
  const samples = samplePlan(engine);
  let next = samples.next();
  while (!next.done) next = samples.next();
  return next.value;
}
/** Yield between small frame batches so native speech/network callbacks can run. */
export async function particlePlanAsync(engine: ParticleEngine, yieldToHost: () => Promise<void>, cancelled: () => boolean): Promise<ParticlePlan | undefined> {
  const samples = samplePlan(engine);
  for (;;) {
    if (cancelled()) return;
    for (let frame = 0; frame < 4; frame++) {
      const next = samples.next();
      if (next.done) return next.value;
    }
    await yieldToHost();
  }
}
