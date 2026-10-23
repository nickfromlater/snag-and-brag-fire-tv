/** Reference eight-step shake, sampled by the native UI worklet. */
export function shakeOffset(progress: number, amplitude: number): number {
  'worklet';
  const values = [0, -1, .833, -.667, .5, -.333, .25, -.083, 0];
  const t = Math.max(0, Math.min(1, progress)) * 8, i = Math.min(7, Math.floor(t));
  return (values[i]! + (values[i + 1]! - values[i]!) * (t - i)) * amplitude;
}
