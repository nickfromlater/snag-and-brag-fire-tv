export function starD(cx: number, cy: number, radius: number, inner = radius * .45, rotation = 0): string {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = i * Math.PI / 5 - Math.PI / 2 + rotation, r = i % 2 ? inner : radius;
    d += (i ? 'L' : 'M') + (cx + Math.cos(a) * r).toFixed(1) + ' ' + (cy + Math.sin(a) * r).toFixed(1);
  }
  return d + 'Z';
}
