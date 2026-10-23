// Measure vendored assets and optionally the relay's real gzip transfer bytes.
// node phone/dev/face-blur-size.mjs [http://localhost:8787]
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { get as getHttp } from 'node:http';
import { get as getHttps } from 'node:https';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';

const origin = process.argv[2];
const dist = new URL('../dist/', import.meta.url);
const visionChunk = (await readdir(new URL('assets/', dist))).find((name) => name.startsWith('vision_bundle-') && name.endsWith('.js'));
assert(visionChunk, 'build the phone first');
const files = ['face-detector/blaze_face_short_range.tflite', 'face-detector/wasm/vision_wasm_internal.js', 'face-detector/wasm/vision_wasm_internal.wasm',
  'face-detector/wasm/vision_wasm_nosimd_internal.js', 'face-detector/wasm/vision_wasm_nosimd_internal.wasm', `assets/${visionChunk}`];

function transfer(url) {
  return new Promise((resolve, reject) => {
    (url.protocol === 'https:' ? getHttps : getHttp)(url, { headers: { 'Accept-Encoding': 'gzip' } }, (res) => {
      const chunks = []; res.on('error', reject); res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, encoding: res.headers['content-encoding'], type: res.headers['content-type'], bytes: Buffer.concat(chunks) }));
    }).on('error', reject);
  });
}
const assets = [];
for (const path of files) {
  const raw = await readFile(new URL(path, dist)), gzip = gzipSync(raw, { level: 9 });
  const row = { path, rawBytes: raw.length, gzipBytes: gzip.length, sha256: createHash('sha256').update(raw).digest('hex') };
  if (origin) {
    const served = await transfer(new URL(path, origin)); assert.equal(served.status, 200); assert.equal(served.encoding, 'gzip');
    assert.equal(served.bytes.length, gzip.length); assert(gunzipSync(served.bytes).equals(raw));
    if (path.endsWith('.wasm')) assert.equal(served.type, 'application/wasm');
    row.servedBytes = served.bytes.length;
  }
  assets.push(row);
}
const sum = (rows, key) => rows.reduce((n, row) => n + row[key], 0);
const simd = assets.filter((row) => !row.path.includes('nosimd'));
const noSimd = assets.filter((row) => !row.path.includes('vision_wasm_internal'));
const report = { packageVersion: '0.10.14', modelVersion: 1, assets, simdDownloadGzipBytes: sum(simd, 'gzipBytes'),
  noSimdDownloadGzipBytes: sum(noSimd, 'gzipBytes'), allVariantsShippedRawBytes: sum(assets, 'rawBytes'),
  allVariantsShippedGzipBytes: sum(assets, 'gzipBytes'), targetBytes: 3_000_000, servedVerified: !!origin,
  note: 'A phone downloads one WASM/loader variant, plus model and lazy JS. This excludes the existing phone UI and a small redaction addition in its main chunk.' };
const out = new URL('../../docs/review/', import.meta.url); await mkdir(out, { recursive: true });
await writeFile(new URL('face-blur-size.json', out), JSON.stringify(report, null, 2) + '\n');
console.log(`Detector gzip download: SIMD ${report.simdDownloadGzipBytes} B; non-SIMD ${report.noSimdDownloadGzipBytes} B. Both variants shipped: ${report.allVariantsShippedRawBytes} B raw. Relay gzip verified: ${report.servedVerified}.`);
