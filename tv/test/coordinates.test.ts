import { describe, expect, it } from 'vitest';
import { registeredBounds } from '../src/stage/coordinates';

describe('semantic flight bounds', () => {
  it('keeps the original absolute placement contract for existing scenes', () => {
    expect(registeredBounds(96, 142, 340, 400)).toEqual({ x: 96, y: 142, width: 340, height: 400 });
  });
  it('lands flights in stage space when a badge is nested inside a pedestal', () => {
    expect(registeredBounds(82, 347, 32, 32, { x: 434, y: 459 })).toEqual({ x: 434, y: 459, width: 32, height: 32 });
  });
});
