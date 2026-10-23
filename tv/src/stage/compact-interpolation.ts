/** Retain discontinuities/curves while dropping redundant native graph samples. */
export function compactInterpolation(input: number[], output: number[], tolerance = .0001): { inputRange: number[]; outputRange: number[] } {
  if (input.length !== output.length || input.length < 2) throw new Error('Invalid interpolation samples');
  const keep = new Set([0, input.length - 1]), pending = [[0, input.length - 1]];
  while (pending.length) {
    const [first, last] = pending.pop()!; let largest = tolerance, split = -1;
    const x = input[first!]!, y = output[first!]!, span = input[last!]! - x, rise = output[last!]! - y;
    for (let i = first! + 1; i < last!; i++) {
      const error = Math.abs(output[i]! - (y + rise * (input[i]! - x) / span));
      if (error > largest) { largest = error; split = i; }
    }
    if (split >= 0) { keep.add(split); pending.push([first!, split], [split, last!]); }
  }
  const indices = [...keep].sort((a, b) => a - b);
  return { inputRange: indices.map(i => input[i]!), outputRange: indices.map(i => output[i]!) };
}
