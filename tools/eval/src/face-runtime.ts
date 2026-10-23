import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import puppeteer from 'puppeteer-core';
import { rootDir, packageDir } from './paths.js';

const git = (args: string[]) => execFileSync('git', args, { cwd: rootDir, maxBuffer: 32 * 1024 * 1024 });

/** Exact phone source/assets, compiled in memory and served only over loopback. */
export async function faceRuntime(ref?: string) {
  const revision = git(['rev-parse', '--verify', '--end-of-options', `${ref ?? 'HEAD'}^{commit}`]).toString().trim();
  const file = async (path: string) => ref ? git(['show', `${revision}:${path}`]) : readFile(resolve(rootDir, path));
  const source = (await file('phone/src/faceBlur.ts')).toString();
  const phonePackage = JSON.parse((await file('phone/package.json')).toString()) as { dependencies: Record<string, string> };
  const require = createRequire(resolve(packageDir, 'package.json')), sdkDir = dirname(require.resolve('@mediapipe/tasks-vision'));
  const sdk = JSON.parse(await readFile(resolve(sdkDir, 'package.json'), 'utf8')) as { version: string };
  if (phonePackage.dependencies['@mediapipe/tasks-vision'] !== sdk.version) throw new Error('Eval and phone MediaPipe versions differ');
  const compiled = await build({ stdin: { contents: source, resolveDir: packageDir, sourcefile: 'phone/src/faceBlur.ts', loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'browser', define: { 'import.meta.env.BASE_URL': '"/"' }, logLevel: 'silent' });
  const routes = new Map<string, { type: string; body: Buffer }>([
    ['/', { type: 'text/html', body: Buffer.from('<!doctype html><html><head><link rel="icon" href="data:,"></head><body>Offline face benchmark</body></html>') }],
    ['/faceBlur.js', { type: 'text/javascript', body: Buffer.from(compiled.outputFiles[0]!.contents) }],
  ]);
  for (const name of ['blaze_face_short_range.tflite', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm', 'wasm/vision_wasm_nosimd_internal.js', 'wasm/vision_wasm_nosimd_internal.wasm']) {
    routes.set(`/face-detector/${name}`, { type: name.endsWith('.js') ? 'text/javascript' : name.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream', body: await file(`phone/public/face-detector/${name}`) });
  }
  const server = createServer((request, response) => {
    const route = routes.get(new URL(request.url ?? '/', 'http://localhost').pathname);
    response.writeHead(route ? 200 : 404, { 'Content-Type': route?.type ?? 'text/plain', 'Cache-Control': 'no-store' }); response.end(route?.body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('Loopback server unavailable');
  const origin = `http://127.0.0.1:${address.port}`;
  const errors: string[] = [], network = { foreignRequests: 0 };
  try {
    const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, args: ['--mute-audio', '--force-color-profile=srgb'] });
    const page = await browser.newPage(); await page.setRequestInterception(true);
    await page.evaluateOnNewDocument('globalThis.__name = (fn, name) => { Object.defineProperty(fn, "name", { value: name, configurable: true }); return fn; };');
    page.on('request', request => {
      if (request.url().startsWith(origin + '/') || /^(data:|blob:|about:)/.test(request.url())) void request.continue();
      else { network.foreignRequests++; void request.abort(); }
    });
    page.on('pageerror', error => errors.push(String(error).slice(0, 200)));
    await page.goto(origin);
    return { browser, page, revision, sourceLabel: ref ? `Git snapshot ${revision}` : `working tree on ${revision}`, sourceSha256: createHash('sha256').update(source).digest('hex'), sdk: sdk.version, errors, network,
      close: async () => { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); } };
  } catch (error) { await new Promise<void>(resolve => server.close(() => resolve())); throw error; }
}
