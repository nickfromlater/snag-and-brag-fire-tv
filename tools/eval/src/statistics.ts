export function percentile(values: readonly number[], q: number): number {
  if (!values.length) throw new Error('Cannot summarize an empty population');
  if (q < 0 || q > 1) throw new Error('Percentile must be between 0 and 1');
  const sorted = [...values].sort((a, b) => a - b);
  // Nearest rank, with q=0 defined as min. Used for timing p50/p95 (not Pixel Judge selection).
  return sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)]!;
}

export function spread(values: readonly number[]): { n: number; min: number; median: number; max: number; mean: number } {
  if (!values.length) throw new Error('Cannot summarize an empty population');
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return { n: values.length, min: sorted[0]!, median, max: sorted.at(-1)!, mean: values.reduce((a, b) => a + b, 0) / values.length };
}

export function permutations<T>(values: readonly T[]): T[][] {
  return values.length === 0 ? [[]] : values.flatMap((v, i) => permutations(values.filter((_, j) => j !== i)).map(rest => [v, ...rest]));
}
