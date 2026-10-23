# Release preparation verification · 2026-10-14

Release worker on `w/release`. Documentation and tooling only; no game/protocol changes.

## README commands

- Node 24.20.0 / pnpm 12.10.1: `pnpm install --frozen-lockfile` passed without downloads.
- `pnpm --filter phone build` passed; production assets remain in gitignored `phone/dist`.
- The documented relay on loopback port 8788, phone Vite proxy on 5173 and `tvsim --bots` started successfully with both AWS services explicitly mocked.
- `pnpm --filter tvsim start -- --loopback --demo --bots --fast` passed all three rounds and closed its memory-only room. Full transcript: [loopback.txt](loopback.txt).
- The browser quick-start check uses `tools/release/verify-local.mjs ROOM_CODE`. It runs the actual phone through the actual relay and normal-speed headless TV host. Chrome is muted, camera permission is deliberately denied, and each photo is a synthetic `File` drawn in browser memory. It never writes photo/thumbnail payloads or connection credentials.

## Credits and font checks

`node tools/release/credits.mjs --check` passed: all 76 fixture titles, author strings, source URLs and license versions match the manifest, and every fixture file exists. The corpus contains 64 objects and 12 public face fixtures; 23 photographs have CC BY/CC BY-SA licenses requiring attribution. Google’s official BlazeFace short-range model card confirms its Apache-2.0 license; the existing bundled runtime license and Lucent notice are retained.

Font inventory passed for all 24 source/generated font copies in six directories. Every directory contains byte-identical source OFL notices. Asset generation also puts both notices into `tv/assets/raw/` for packaging. The project MIT license and the three native JavaScript helper notices are retained in raw package assets as well. No font outlines, names or artwork changed.

## Actual local game

The normal-speed README relay/tvsim/phone game passed all three rounds, all nine phone screens, three 720×720 synthetic snags, the actual 72-byte Pixel Judge mask, and zero uncaught browser exceptions. It reached the real end screen and displayed the privacy copy. Numeric receipt: [local-game.json](local-game.json). Synthetic-only finale screenshot: [local-phone-finale.png](local-phone-finale.png).

## Release packaging

The real packager succeeded for **armv7, aarch64 and x86_64** using Node 24.20.0, pnpm 12.10.1, Vega SDK 0.24.12112 / CLI 1.4.2 and Hermes 0.12.0 (HBC 94). All packages are Release builds with system JS bundles, the environment-supplied relay URL and debug/offline/showcase/photo-probe modes disabled. `-g0` omits Hermes debug metadata; archive-content scanning then found zero home-path/account/key signatures. Both OFL notices and the project/base64/QR/JPEG helper notices match their source bytes in every archive. No `.env`, private key or source map is packaged.

`python3 tools/release/check-packages.py` (Python 3.14+, run before removing SDK build intermediates) passed. [packages.json](packages.json) records sizes, SHA-256 hashes, SDK target-output provenance, app/OS identity, runtime config and inspection results. [package-run.txt](package-run.txt) contains the actual short build transcript and exact draft release command. `LC_ALL=C shasum -a 256 -c SHA256SUMS` passed for all three files. The original `tv/src/config.ts` hash is unchanged after packaging and the packaging lock was removed.

The app uses system native modules; its application archive has no ELF library. Architecture evidence is the successful explicit SDK target and corresponding fresh output path, not an inferred binary CPU type. No package installation or retail performance is claimed.

The retained archives are local verification builds in gitignored `dist/release/`, baked with `ws://127.0.0.1:8788/ws`. **Rebuild with the deployed public WSS URL before distributing them.** The script prints `gh release create --draft` and never executes it. No release or Git tag was created.

## Final checks

- `pnpm test` passed **465 tests**, including **14 release-tool tests** for missing/unsafe URLs, credential-safe errors, help, locks, all architecture flags/hashes, shell quoting, failed asset/target cleanup, ambiguous outputs and stale archives. The upload-command parser uses an explicitly fake `gh` executable; the real CLI is never called. [Root test transcript](root-tests.txt).
- `pnpm typecheck` passed across all workspace packages. [Typecheck transcript](root-typecheck.txt).
- `bash -n tools/release/package.sh` passed; `node tools/release/credits.mjs --check` passed again after native packaging.
- The final publication scan and protected-file exception are recorded in [scrub-report.md](scrub-report.md). No private notes, protected shared documents, history, push or publication was touched.
- Worker-owned local servers and temporary outputs were stopped/removed; ending the headless TV room returned relay health to zero rooms/phones. Archive outputs are retained for local inspection; disposable native build intermediates are removed after inspection.

The upstream jpeg-js notice is retained byte-for-byte, including trailing spaces; a local Git attribute exempts only that notice from the trailing-space check.

Amazon-tool observations are appended to [docs/friction-raw.md](../friction-raw.md) as F-RELEASE-01 through F-RELEASE-03. The first package-inspection attempt assumed an application ELF library; inspection corrected that assumption to this app's actual VegaScript/system-module structure. A checksum verification initially failed because macOS Perl rejected the inherited C.UTF-8 locale; the documented command now explicitly uses C.

## Scope and limits

The native gallery is existing VVD evidence under [docs/gallery](../gallery/GALLERY.md). This worker's local game check is headless-TV/browser evidence. It does not establish retail-stick performance, mixed physical-phone compatibility, live Bedrock/Polly behavior or deployed uptime.

No accounts, paid API calls, cloud provisioning, push, tag creation, release upload or publishing is part of this work. `TESTING.md` remains lead-owned and still needs the real release page and hosted URL before judges can follow its hosted-install path.

The explicit release-prep assignment to update `README.md` is treated as the exception to COMMON.md's general shared-file restriction. All other protected shared files stay unchanged unless the owner explicitly authorizes a scrub edit. No visual, gameplay or protocol adaptation is made by this worker.
