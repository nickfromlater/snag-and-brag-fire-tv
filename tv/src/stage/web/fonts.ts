import { useEffect, useState } from 'react';
export function useFonts(fonts: Record<string, string | number>): [boolean, Error | null] {
  const [loaded, setLoaded] = useState(false), [error, setError] = useState<Error | null>(null);
  useEffect(() => {
    Promise.all(Object.entries(fonts).map(async ([family, uri]) => {
      const face = new FontFace(family, 'url(' + uri + ')'); await face.load(); (document.fonts as unknown as {add(f: FontFace): void}).add(face);
    })).then(() => setLoaded(true), e => setError(e as Error));
  }, []);
  return [loaded, error];
}
