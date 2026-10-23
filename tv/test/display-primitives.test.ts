import { describe, expect, it } from 'vitest';
import { displayLines, marqueePoints, reelOffset, rollValue } from '../src/stage/display-math';
import { animationPose, parseFrame, renderPose, renderPoseSampler, transformMatrix } from '../src/stage/motion';
import type { MotionState } from '@snag/shared';
import { shakeOffset } from '../src/stage/effects';

describe('reference display geometry', () => {
  it('places all 60 marquee bulbs on the reference perimeter, including the corner wrap', () => {
    const points = marqueePoints(150, 118, 980, 330);
    expect(points).toHaveLength(60); expect(points[0]).toEqual({ x: 150, y: 118 });
    expect(points[23]).toEqual({ x: 1130, y: 142 }); expect(points[30]).toEqual({ x: 1130, y: 448 });
    expect(points[59]).toEqual({ x: 150, y: 162 });
    expect(points.every(p => p.x === 150 || p.x === 1130 || p.y === 118 || p.y === 448)).toBe(true);
  });
  it('lands the 16-card reel exactly and evaluates the remaining curve on a late mount', () => {
    expect(reelOffset(16, -100)).toBe(0); expect(reelOffset(16, 1200)).toBe(-4500);
    expect(reelOffset(16, 2400)).toBe(-4800); expect(reelOffset(16, 3000)).toBe(-4800);
  });
  it('rolls scores with cubic ease-out and wraps team names with actual glyph metrics', () => {
    expect(rollValue(0, 100, 0)).toBe(0); expect(rollValue(0, 100, .5)).toBe(88); expect(rollValue(0, 100, 1)).toBe(100);
    expect(displayLines('Junk Drawer Gang', 210, 27)).toEqual(['Junk Drawer', 'Gang']);
    expect(displayLines('Sock Goblins', 210, 27)).toEqual(['Sock Goblins']);
  });
});
describe('layout-aware motion', () => {
  const state: MotionState = { animation: { target: 'rider', frames: [{ left: '5%' }, { left: '95%' }], durationMs: 1300, easing: 'linear', delayMs: 0, fill: 'both', iterations: 1 }, startedAt: 0, elapsedMs: 0, durationMs: 1300, active: true };
  it('resolves layout percentages against the track without changing transform percentages', () => {
    expect(parseFrame({ left: '95%', transform: 'translateX(-50%)' }, 68, 68, { width: 742, height: 42 })).toMatchObject({ left: 704.9, x: -34 });
    expect(renderPose([state], 1300, 68, 68, { width: 742, height: 42 }).x).toBeCloseTo(667.8);
  });
  it('preserves semantic bar lengths and row reordering in reduced motion', () => {
    const reorder = { ...state, animation: { ...state.animation, frames: [{ top: '234px', transform: 'rotate(-8deg)' }, { top: '0px', transform: 'rotate(0)' }] } };
    expect(renderPose([reorder], 1300, 1176, 72, { width: 1176, height: 340 }, true)).toMatchObject({ y: -234, rotation: 0 });
    const fill = { ...state, animation: { ...state.animation, frames: [{ width: '5%' }, { width: '95%' }] } };
    expect(renderPose([fill], 1300, 742, 42, { width: 742, height: 42 }, true).sx).toBeCloseTo(.95);
  });
  it('keeps all six badge hops and removes the transient transform when they finish', () => {
    const hop = { ...state.animation, frames: [{ transform: 'translateY(0)' }, { transform: 'translateY(-12px)' }, { transform: 'translateY(0)' }], durationMs: 220, iterations: 6, fill: 'none' as const };
    expect(animationPose(hop, 110).y).toBeCloseTo(-12);
    expect(animationPose(hop, 5 * 220 + 110).y).toBeCloseTo(-12);
    expect(animationPose(hop, 1320).y).toBe(0);
  });
  it('samples a whole motion trajectory without reparsing its keyframes for every frame', () => {
    let reads = 0;
    const frame = { get transform() { reads++; return 'translateX(100px) scale(2)'; }, left: '25%' };
    const motion = { ...state, animation: { ...state.animation, frames: [{ transform: 'translateX(0) scale(1)', left: '0%' }, frame] } };
    const sample = renderPoseSampler([motion], 100, 40, { width: 400, height: 80 });
    const compiledReads = reads;
    expect(sample(0)).toMatchObject({ x: 0, sx: 1 }); expect(sample(650)).toMatchObject({ x: 100, sx: 1.5 });
    expect(sample(1300)).toMatchObject({ x: 200, sx: 2 });
    for (let i = 0; i <= 120; i++) sample(i * 1300 / 120);
    expect(reads).toBe(compiledReads);
  });
});
describe('native world effects',()=>{
  it('retains the reference impact amplitude and settles without a residual world offset',()=>{
    expect(shakeOffset(0,14)).toBe(0);expect(shakeOffset(.125,14)).toBe(-14);
    expect(shakeOffset(.25,14)).toBeCloseTo(11.662);expect(shakeOffset(1,14)).toBe(0);
    for(let i=0;i<=100;i++)expect(Math.abs(shakeOffset(i/100,14))).toBeLessThanOrEqual(14);
  });
  it('preserves translation and nonuniform scale in one native matrix',()=>{
    expect(transformMatrix(40,-12,1,1,0)).toEqual([1,0,0,0,-0,1,0,0,0,0,1,0,40,-12,0,1]);
    const m=transformMatrix(0,0,.92,1.08,90);expect(m[0]).toBeCloseTo(0);expect(m[1]).toBeCloseTo(1.08);expect(m[4]).toBeCloseTo(-.92);expect(m[5]).toBeCloseTo(0);
  });
});
