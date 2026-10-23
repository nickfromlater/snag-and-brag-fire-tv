import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import vm from 'node:vm';

export interface ObjectArt {
  id: string;
  nm: string;
  col: string;
  zone: number;
  x: number;
  y: number;
  s: number;
  eyes: [[number, number], [number, number], number];
}

export function between(source: string, start: string, end: string): string {
  const a = source.indexOf(start);
  const b = source.indexOf(end, a + start.length);
  if (a < 0 || b < 0) throw new Error(`Missing reference section: ${start}`);
  return source.slice(a, b);
}

export function sha256(bytes: string | Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function readSource(root: string) {
  const paths = ['reference/src/art.js', 'reference/src/game.js', 'reference/src/style.css', 'reference/src/body.html'];
  const [art, game, css, body] = await Promise.all(paths.map(p => readFile(join(root, p), 'utf8')));
  if (!art || !game || !css || !body) throw new Error('Incomplete reference');
  const context = vm.createContext({});
  vm.runInContext(art, context);
  const objects = JSON.parse(JSON.stringify(context.OBJ)) as ObjectArt[];
  const sox = JSON.parse(JSON.stringify(context.SOX)) as Record<string, string>;
  const house = vm.runInContext('({ back: houseBack(), front: houseFront() })', context) as { back: string; front: string };
  const defs = between(game, "(function(){var d='';", '\n\n/* =====================================================================');
  const hostSetup = between(game, "(function(){var s=$('#soxsvg');", '\nHOST.mood=');
  const hostAnimation = between(game, "HOST.mood='norm';", '\nvar bubble=');
  const stickerFunction = between(game, 'function stickerSVG(f)', '\nfunction sticker(f,');
  const browPaths = vm.runInNewContext('(' + between(game, 'var L={norm:', "[m||'norm'];").slice('var L='.length) + ')') as Record<string, [string, string]>;
  return { art, game, css, body, objects, sox, house, defs, hostSetup, hostAnimation, stickerFunction, browPaths,
    hashes: Object.fromEntries(paths.map((p, i) => [p, sha256([art, game, css, body][i]!)])) };
}
