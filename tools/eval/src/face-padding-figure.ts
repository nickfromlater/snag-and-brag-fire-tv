/** A vector plot of measured boxes; it contains no photograph or working pixels. */
export function facePaddingFigure(face: { expected?: number[][]; padding: { top: number; coverage: number[]; expandedBoxes: { x: number; y: number; width: number; height: number }[] }[] }): string {
  const expected = face.expected![0]!, cases = face.padding.slice(0, 3);
  const originX = Math.min(expected[0]!, ...cases.flatMap(p => p.expandedBoxes.map(b => b.x))) - 10;
  const originY = Math.min(expected[1]!, ...cases.flatMap(p => p.expandedBoxes.map(b => b.y))) - 10;
  const plots = cases.map((p, i) => {
    const box = p.expandedBoxes[0]!;
    return `<g transform="translate(${i * 320},0)"><text x="160" y="82" text-anchor="middle" font-size="18" font-weight="bold">${Math.round(p.top * 100)}% top margin</text><g transform="translate(65,95)"><rect x="${box.x-originX}" y="${box.y-originY}" width="${box.width}" height="${box.height}" fill="#E4F0FF" stroke="#145AA3" stroke-width="2"/><rect x="${expected[0]!-originX}" y="${expected[1]!-originY}" width="${expected[2]}" height="${expected[3]}" fill="none" stroke="#18783C" stroke-width="3" stroke-dasharray="6 3"/></g><text x="160" y="301" text-anchor="middle" font-size="16">${(p.coverage[0]! * 100).toFixed(1)}% covered · starts y=${box.y}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="330" viewBox="0 0 960 330" role="img" aria-label="Melvin forehead coverage with 25, 40 and 45 percent top padding"><rect width="960" height="330" fill="white"/><g font-family="Arial, sans-serif" fill="#142334"><text x="24" y="29" font-size="21" font-weight="bold">Melvin: measured face-box coverage (25% sides and bottom)</text><text x="24" y="52" font-size="14">Green dashed: annotated face. Blue: area pixelated by the phone. Annotation begins at y=160.</text>${plots}</g></svg>\n`;
}
