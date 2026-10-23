#!/bin/bash
# Device gate session for the Fire TV Stick 4K Select (Vega OS). Run from the repo root:
#   bash tools/device/session.sh
# Nick's part: the stick on a TV and USB-wired to this Mac, Developer Mode on, approve one
# browser login, read out the code. Everything else is automatic. See docs/DEVICE-GATE.md.
set -u
set -o pipefail
umask 077
cd "$(dirname "$0")/../.."
export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
source ~/vega/env >/dev/null 2>&1
SPIKE_PKG=${SPIKE_PKG:-$HOME/builds/snag-and-brag/vegaspike_armv7.vpkg}
# Hosted relay URL is baked into the live package. Override both values together
# when installing a package built for a different relay.
TV_PKG=${TV_PKG:-$HOME/builds/snag-and-brag/tv_armv7-live.vpkg}
TV_RELAY_URL=${TV_RELAY_URL:-wss://d2q0olvpmfmvjn.cloudfront.net/ws}
# Only packages that passed a production game + rematch on the stick
# (tools/device/stick-production.sh play) are installed for a family session.
VERIFIED_LIVE=(
  c8639b535895d6351fdd4bb5526b976df43f9ea502657c2005844d5a005581a4  # 1b4a3b8, Oct 21: still backdrops, 47 fps every scene; game+rematch PASS
)
if [ -f "$TV_PKG" ] && [ -z "${ALLOW_UNVERIFIED:-}" ]; then
  TV_SHA=$(shasum -a 256 "$TV_PKG" | awk '{print $1}')
  if [[ ! " ${VERIFIED_LIVE[*]} " =~ " $TV_SHA " ]]; then
    echo "This TV package has not passed a production game on the stick. Wait for the verified replacement."
    exit 1
  fi
fi
OUT=${DEVICE_OUTPUT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/snag-device-$(date +%Y%m%d-%H%M).XXXXXX")}; mkdir -p "$OUT"
say() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

say "1/6 Find the stick"
vega device list | tee "$OUT/devices.txt"
# Lines look like "VirtualDevice : tv - aarch64 - OS - amazon-<id>"; the stick is the non-virtual one.
SERIAL=${SERIAL:-$(vega device list 2>/dev/null | grep " : " | grep -v -i "VirtualDevice" | awk '{print $NF}' | head -1)}
if [ -z "$SERIAL" ]; then echo "No physical device found. Check the USB data cable and that the stick is on."; exit 1; fi
echo "Physical stick selected; device details stay in the private session directory."
vega device info -d "$SERIAL" 2>&1 | tee "$OUT/device-info.txt" | head -20

say "2/6 Developer Mode (Nick: approve the browser login with your Amazon Developer account)"
if vega device installed-apps -d "$SERIAL" >/dev/null 2>&1; then echo "Developer access already works; skipping login."; else
  vega devmode login
  read -r -p "Type the 6-character code shown on the TV: " CODE
  vega devmode enable-device --code "$CODE" || exit 1
  echo "Waiting for the stick to reboot…"; sleep 20
  for i in $(seq 1 60); do vega device is-connected -d "$SERIAL" >/dev/null 2>&1 && break; sleep 5; done
fi

say "3/6 Install builds"
if [ ! -f "$TV_PKG" ]; then echo "TV package is missing: $TV_PKG"; exit 1; fi
for P in "$SPIKE_PKG" "$TV_PKG"; do
  [ -f "$P" ] || continue
  if ! vega device install-app -d "$SERIAL" -p "$P" > "$OUT/install.log" 2>&1; then tail -n 12 "$OUT/install.log"; exit 1; fi
  tail -n 3 "$OUT/install.log"
  # The CLI leaves the uploaded archive in RAM-backed /tmp after installation.
  PACKAGE_BASENAME=${P##*/}
  if [[ "$PACKAGE_BASENAME" =~ ^[A-Za-z0-9_.-]+\.vpkg$ ]]; then
    vega device run-cmd -d "$SERIAL" -c "rm -f /tmp/$PACKAGE_BASENAME" >/dev/null 2>&1 || exit 1
  fi
done
vega device run-cmd -d "$SERIAL" -c 'df -h /tmp'
vega device installed-apps -d "$SERIAL" 2>&1 | grep -i "snag" | tee "$OUT/installed.txt"

say "4/6 Relay and benchmark port forwarding"
case "$TV_RELAY_URL" in
  ws://localhost:*|ws://127.0.0.1:*|ws://\[::1\]:*)
    (AI_MODE=mock POLLY_MODE=mock pnpm --filter relay start > "$OUT/relay.log" 2>&1 &)
    sleep 4
    vega device start-port-forwarding -d "$SERIAL" -p 8787 -f false 2>&1 | tail -1
    ;;
  *) echo "Using hosted TV relay: $TV_RELAY_URL" ;;
esac
# The standalone benchmark still needs its own local transport.
vega device start-port-forwarding -d "$SERIAL" -p 7071 -f false 2>&1 | tail -1
(node spike/vega-app/relay.cjs > "$OUT/spike-relay.log" 2>&1 &)

say "5/6 Benchmark build (the lead measures; Nick can leave now)"
vega device launch-app -d "$SERIAL" --appName com.snagbrag.spike.main > "$OUT/launch-spike.log" 2>&1 &
echo "Benchmark app launching. Lead: run the protocol in docs/DEVICE-GATE.md (workloads via the remote's"
echo "FF button or node spike/vega-app/control.cjs case full20; native traces with vega exec perf)."
read -r -p "Press Enter to switch to the real TV app… " _
vega device terminate-app -d "$SERIAL" --appName com.snagbrag.spike.main >/dev/null 2>&1

say "6/6 The real TV app"
vega device launch-app -d "$SERIAL" --appName com.snagbrag.tv.main > "$OUT/launch-tv.log" 2>&1 &
echo "TV app launching on the stick. For a solo game: Select on the lobby, then Play with bots."
echo "Join from the QR code on the TV; the live package uses the hosted HTTPS phone page."
echo "Receipts in $OUT"
