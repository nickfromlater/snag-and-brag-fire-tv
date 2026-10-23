import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('tools/eval/photos/manifest.json', root), 'utf8'));
const text = value => String(value).replaceAll('|', '\\|').replaceAll('[', '\\[').replaceAll(']', '\\]').replaceAll('\n', ' ');
const link = (label, url) => `[${text(label)}](<${url}>)`;
const header = `# Credits and third-party notices

The repository's [MIT license](LICENSE) covers the original project code and assets. It does not replace the licenses of fonts, evaluation photographs or vendored runtime/model assets below.

## Original project assets

The Snag & Brag authors created the approved [reference mockup](reference/README.md): Sir Socksworth, the cartoon house, the 26 object stickers, UI copy, motion, sound effects and music. The asset generators port that source art and synthesize the sound bank; the game does not use a third-party stock-art or recorded-music library. Gallery stills and clips show the project's native VVD build with synthetic camera media.

## Fonts · SIL Open Font License 1.1

| Family | Copyright / authors | Bundled forms | License |
| --- | --- | --- | --- |
| **Lilita One** | Copyright © 2011 Juan Montoreano; Reserved Font Name “Lilita One” | Regular WOFF2 and TTF | [LilitaOne-OFL.txt](assets/fonts/LilitaOne-OFL.txt) |
| **Rubik** | Copyright © 2015 The Rubik Project Authors ([upstream](https://github.com/googlefonts/rubik)) | 500, 700, 800 and 900 WOFF2/TTF; retained benchmark TTF | [Rubik-OFL.txt](assets/fonts/Rubik-OFL.txt) |

Complete copyright notices and OFL 1.1 text accompany the font copies in \`reference/fonts/\`, \`assets/fonts/\`, \`phone/public/fonts/\`, \`spike/vega-app/src/assets/fonts/\` and \`tv/src/stage/benchmark-assets/fonts/\`. \`tools/tv-foundation/generate.mjs\` also copies the notices next to generated native fonts and into the TV package's raw assets. WOFF2-to-TTF conversion preserves the font names and outlines. Author contact details in the legal notices are preserved as required attribution.

## On-phone face detector · Apache License 2.0

- **Google / The MediaPipe Authors:** \`@mediapipe/tasks-vision\` **0.10.14**, including the SIMD/non-SIMD WASM runtimes and JavaScript loaders under \`phone/public/face-detector/wasm/\`. The runtime copies are unchanged. [Upstream license](https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE); [bundled license and third-party notices](phone/public/face-detector/LICENSE).
- **Google BlazeFace short-range model**, float16, version **1**, by Valentin Bazarevsky (Google). [Model source](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite), [official model card, including Apache 2.0 license](https://storage.googleapis.com/mediapipe-assets/MediaPipe%20BlazeFace%20Model%20Card%20%28Short%20Range%29.pdf), [task documentation](https://developers.google.com/edge/mediapipe/solutions/vision/face_detector). Model bytes are unchanged. Provenance: [ASSETS.md](phone/public/face-detector/ASSETS.md).

These are inference assets, not player photographs or an identity database. The existing bundled license also retains its Lucent dtoa notice. Dependency packages and the installed Vega SDK retain their own upstream license terms; neither is relicensed by this document. The Amazon Devices Builder Tools skills in \`.agents/skills/\` retain the Apache-2.0 license files in their respective directories.

## Bundled native helpers

| Library | Version / authors | Use | Retained notice |
| --- | --- | --- | --- |
| base-64 | 1.0.0 · Mathias Bynens | Base64 encoding in the retained benchmark | [MIT](tools/release/licenses/base-64-MIT.txt) |
| qrcode-generator | 1.4.4 · Kazuhiko Arase, copyright 2009 | Lobby pairing QR code | [MIT and original header/trademark notice](tools/release/licenses/qrcode-generator-MIT.txt) |
| jpeg-js | 0.4.4 · Eugene Ware, copyright 2014 | In-memory photo and thumbnail decoding | [BSD-3-Clause](tools/release/licenses/jpeg-js-BSD.txt) |
| @amazon-devices/react-native-fast-image | 4.0.0 · Amazon, copyright 2025 | Release native image and graphics caches in the background | [Amazon Program Materials notice](tools/release/licenses/react-native-fast-image-PML.txt) |

The base-64, jpeg-js and Amazon notices are copied unchanged from the pinned packages. qrcode-generator 1.4.4 has no standalone license file; its original copyright/license/trademark header is retained with the standard MIT permission text. Native asset generation bundles these four notices and the project's MIT license in \`tv/assets/raw/\`, alongside the font notices. The raw assets contain notices only, never player media.

## Public evaluation photographs

All **${manifest.photos.length} fixtures** below come from the frozen [photo manifest](tools/eval/photos/manifest.json), including the ${manifest.photos.filter(p => p.kind === 'object').length} object fixtures and ${manifest.photos.filter(p => p.kind === 'face').length} public face fixtures. They are test data, never player media, and are not bundled into the phone or TV app. Titles, authors, source links and license versions follow that manifest exactly; no author is invented for an unidentified photographer.

**Changes:** source thumbnails are center-square cropped, resized to 720×720 and re-encoded as JPEG at quality 0.8 using the game's capture pipeline. Individual derivatives retain the license/status linked in their row, including the same-version CC BY-SA terms. The manifest retains original/download URLs, source dimensions and checksums; [LICENSES.md](tools/eval/photos/LICENSES.md) is the corpus-local attribution table.

| Repository fixture | Original title / source | Author / credit | License |
| --- | --- | --- | --- |
`;
const rows = manifest.photos.map(photo => `| ${link(photo.file, 'tools/eval/photos/' + photo.file)} | ${link(photo.title, photo.sourceUrl)} | ${text(photo.author)} | ${link(photo.license, photo.licenseUrl)} |`).join('\n');
const footer = `

## Derived evaluation figures

The two object contact sheets in \`docs/review/eval/\` are adaptations under **CC BY-SA 4.0 International**, with per-source attribution above and the license/change description in [ASSET-LICENSES.md](docs/review/eval/ASSET-LICENSES.md). Their changes include cropping/resizing, JPEG encoding, scoring captions, mask overlays and composition; the second sheet also applies the phone's face-redaction pipeline. Public face fixtures used in face-padding/redaction figures retain their credited CC0/public-domain status. Original plotting code and numerical reports remain MIT.

This attribution table is generated by \`node tools/release/credits.mjs\`; verify it against the manifest with \`node tools/release/credits.mjs --check\`.
`;
const expected = header + rows + footer;
const destination = new URL('CREDITS.md', root);
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== expected) throw new Error('CREDITS.md differs from the manifest; run node tools/release/credits.mjs');
  for (const photo of manifest.photos) await readFile(new URL('tools/eval/photos/' + photo.file, root));
  console.log(`PASS credits: all ${manifest.photos.length} fixture titles, authors, source URLs and licenses match the manifest.`);
} else { await writeFile(destination, expected); console.log(`Wrote CREDITS.md with ${manifest.photos.length} fixture attributions.`); }
