import { describe, expect, it } from 'vitest';
import { svgImageSource } from '../src/stage/svg-image-source';

describe('raster href on the two SVG backends', () => {
  it('renders memory photos and bitmap masks as browser URL hrefs', () => {
    expect(svgImageSource({ uri: 'data:image/jpeg;base64,/9j/' }, true)).toBe('data:image/jpeg;base64,/9j/');
    expect(svgImageSource({ uri: '/assets/photos/mask.png' }, true)).toBe('/assets/photos/mask.png');
  });
  it('preserves native URI objects and bundled resource identifiers', () => {
    const memory = { uri: 'data:image/jpeg;base64,/9j/' };
    expect(svgImageSource(memory, false)).toBe(memory);
    expect(svgImageSource(42, false)).toBe(42);
    expect(svgImageSource('/assets/mask.png', true)).toBe('/assets/mask.png');
  });
});
