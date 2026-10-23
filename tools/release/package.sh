#!/usr/bin/env bash
# Local release builds only. Never invokes gh, uploads, tags or AWS services.
set -euo pipefail

release_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
release_tv="$release_root/tv"
release_lock="$release_root/.release-package.lock"
release_output=${RELEASE_OUTPUT_DIR:-"$release_root/dist/release"}
release_temp=''
release_owns_lock=false
release_arches=(armv7 aarch64 x86_64)

fail() { printf 'Release packaging failed: %s\n' "$1" >&2; exit 1; }
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n "$release_temp" && -f "$release_temp/config.ts" ]]; then
    cp -p "$release_temp/config.ts" "$release_tv/src/config.ts" || status=1
  fi
  if [[ -n "$release_temp" && -d "$release_temp" ]]; then rm -rf -- "$release_temp"; fi
  if [[ "$release_owns_lock" == true ]]; then
    rm -f "$release_lock/pid"
    rmdir "$release_lock" || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if [[ "${1:-}" == --help || "${1:-}" == -h ]]; then
  printf 'Usage: TV_RELAY_URL=wss://relay.example/ws tools/release/package.sh\n'
  printf 'Optional environment: RELEASE_OUTPUT_DIR (default dist/release), RELEASE_TAG (default TV version).\n'
  printf 'Requires installed Node 24+, pnpm and Vega SDK; prints a draft gh command without running it.\n'
  exit 0
fi
[[ $# == 0 ]] || fail 'No positional arguments are supported; use --help or the documented environment variables.'
[[ -n "${TV_RELAY_URL:-}" ]] || fail 'Set TV_RELAY_URL to the public WebSocket URL ending in /ws.'
for tool in node pnpm vega git; do
  command -v "$tool" >/dev/null 2>&1 || fail "Missing $tool; use the existing Node/pnpm/Vega SDK installation."
done
node <<'NODE'
const fail = message => { console.error('Release packaging failed: ' + message); process.exit(1); };
if (Number(process.versions.node.split('.')[0]) < 24) fail('Node 24 or newer is required.');
try {
  const raw = process.env.TV_RELAY_URL;
  const url = new URL(raw);
  if (/\s/.test(raw) || !['ws:', 'wss:'].includes(url.protocol) || !url.hostname || url.pathname !== '/ws' || url.username || url.password || url.search || url.hash) throw new Error();
} catch { fail('TV_RELAY_URL must be ws:// or wss:// with path /ws and no credentials, query or fragment.'); }
NODE

cd "$release_root"
release_tag=${RELEASE_TAG:-"v$(node -p 'JSON.parse(require("node:fs").readFileSync("tv/package.json", "utf8")).version')"}
[[ "$release_tag" != -* ]] && git check-ref-format "refs/tags/$release_tag" >/dev/null 2>&1 || fail 'RELEASE_TAG must be a valid Git tag and cannot start with a dash.'
release_commit=$(git rev-parse HEAD)
[[ -f "$release_tv/src/config.ts" ]] || fail 'TV configuration is missing.'
mkdir "$release_lock" 2>/dev/null || fail 'Another packager owns .release-package.lock; do not remove an active lock.'
release_owns_lock=true
printf '%s\n' "$$" > "$release_lock/pid"
mkdir -p -- "$release_output"
release_output=$(cd "$release_output" && pwd)
release_temp=$(mktemp -d "$release_output/.package.XXXXXX")
cp -p "$release_tv/src/config.ts" "$release_temp/config.ts"

# Force the ordinary online release mode, regardless of inherited dev variables.
TV_DEBUG=false TV_OFFLINE=false SNAG_SHOWCASE=0 TV_PHOTO_PROBE=false \
  TV_CONTROL_URL=ws://127.0.0.1:8790 TV_DIRECTOR_URL=ws://127.0.0.1:8791/renderer \
  node tv/tooling/configure.mjs
if ! pnpm --filter @snag/tv assets > "$release_temp/assets.log" 2>&1; then
  fail 'TV asset generation failed. Run pnpm --filter @snag/tv assets to inspect diagnostics.'
fi

for arch in "${release_arches[@]}"; do
  printf 'Building %s Release…\n' "$arch"
  # Delete only generated Release archives for this target: a successful command
  # that produces nothing must never silently reuse a stale package.
  if [[ -d "$release_tv/build" ]]; then
    find "$release_tv/build" -type f -name "tv_${arch}.vpkg" -path '*/Release/*' -delete
  fi
  if ! pnpm --filter @snag/tv exec react-native build-vega --build-type Release \
      --target "$arch" --use-system-js-bundles true --max-workers 2 --hermes-flags=-O,-w,-g0 \
      > "$release_temp/$arch.log" 2>&1; then
    fail "$arch build failed. Inspect locally: pnpm --filter @snag/tv exec react-native build-vega --build-type Release --target $arch --use-system-js-bundles true --max-workers 2 --hermes-flags=-O,-w,-g0"
  fi
  packages=()
  if [[ -d "$release_tv/build" ]]; then
    while IFS= read -r -d '' package; do packages+=("$package"); done < <(
      find "$release_tv/build" -type f -name "tv_${arch}.vpkg" -path '*/Release/*' -print0
    )
  fi
  [[ ${#packages[@]} == 1 ]] || fail "$arch build must produce exactly one fresh Release archive."
  [[ -s "${packages[0]}" ]] || fail "$arch archive is empty."
  cp "${packages[0]}" "$release_temp/snagbrag_${arch}.vpkg"
done

node - "$release_temp" "$release_commit" "$release_tag" <<'NODE'
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync, statSync } = require('node:fs');
const { join } = require('node:path');
const [directory, sourceCommit, tag] = process.argv.slice(2);
const artifacts = ['armv7', 'aarch64', 'x86_64'].map(arch => {
  const file = `snagbrag_${arch}.vpkg`;
  return { arch, file, bytes: statSync(join(directory, file)).size, sha256: createHash('sha256').update(readFileSync(join(directory, file))).digest('hex') };
});
writeFileSync(join(directory, 'SHA256SUMS'), artifacts.map(a => `${a.sha256}  ${a.file}`).join('\n') + '\n');
writeFileSync(join(directory, 'release-manifest.json'), JSON.stringify({
  createdAt: new Date().toISOString(), sourceCommit, tag, buildType: 'Release',
  relayUrl: process.env.TV_RELAY_URL, useSystemJsBundles: true,
  hermesFlags: ['-O', '-w', '-g0'],
  runtime: { debug: false, offline: false, showcase: false, photoProbe: false }, artifacts,
}, null, 2) + '\n');
NODE

# Do not expose a new upload set until all three targets have succeeded.
for file in snagbrag_armv7.vpkg snagbrag_aarch64.vpkg snagbrag_x86_64.vpkg SHA256SUMS release-manifest.json; do
  mv -f "$release_temp/$file" "$release_output/$file"
done
release_display_output=$(node -e 'console.log(require("node:path").relative(process.argv[1], process.argv[2]) || ".")' "$release_root" "$release_output")
printf 'Packaged all three targets; SHA256SUMS and release-manifest.json written.\n'
printf 'From the repository root, draft command (printed only):\n'
printf '%q ' gh release create "$release_tag" \
  "$release_display_output/snagbrag_armv7.vpkg" \
  "$release_display_output/snagbrag_aarch64.vpkg" \
  "$release_display_output/snagbrag_x86_64.vpkg" \
  "$release_display_output/SHA256SUMS" "$release_display_output/release-manifest.json" \
  --draft --title "Snag & Brag $release_tag" --generate-notes --target "$release_commit"
printf '\n'
