/** Browser SVG href accepts a URL string; native SVG keeps ImageSource objects. */
export function svgImageSource<T>(source: T, web: boolean): T | string {
  if (web && source && typeof source === 'object' && 'uri' in source && typeof source.uri === 'string') return source.uri;
  return source;
}
