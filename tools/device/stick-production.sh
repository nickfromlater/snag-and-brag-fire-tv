#!/bin/zsh
# Production package for the stick, run right after a passing stick-verdict.sh.
#   zsh tools/device/stick-production.sh build      # build + inspect baked flags (no stick needed)
#   zsh tools/device/stick-production.sh install    # install, launch, lobby screenshot for the room code
#   zsh tools/device/stick-production.sh play ABCD  # full hosted game + rematch on the TV's room code,
#                                                   # then promote to ~/builds/snag-and-brag/tv_armv7-live.vpkg
# Production: debug/offline/showcase/photoProbe false, hosted relay, Hermes -O,-w,-g0.
# Without debug telemetry the check is protocol + foreground (lifecycle manager) only.
set -u
cd "$(dirname "$0")/../.."
export PATH=$HOME/.nvm/versions/node/v24.20.0/bin:$PATH
source ~/vega/env >/dev/null 2>&1
osascript -e 'set volume output muted true' >/dev/null 2>&1
SHA=$(git rev-parse --short HEAD); DIR=/tmp/snag-production-$SHA; mkdir -p $DIR
PKG=${PKG:-$HOME/builds/snag-and-brag/tv_armv7-production-$SHA.vpkg}
stick() {
  SERIAL=${DEVICE_SERIAL:-$(vega device list 2>/dev/null | grep " : " | grep -v -i VirtualDevice | awk '{print $1}' | head -1)}
  [ -n "$SERIAL" ] || { echo "No physical stick found."; exit 2; }
  export DEVICE_SERIAL=$SERIAL
}
RELAY=wss://d2q0olvpmfmvjn.cloudfront.net/ws

if [ "${1:-}" = build ]; then
  CFG=$(mktemp /tmp/snag-production-config.XXXXXX); cp tv/src/config.ts $CFG
  TV_RELAY_URL=$RELAY TV_DEBUG=false TV_OFFLINE=false TV_PHOTO_PROBE=false SNAG_SHOWCASE=0 node tv/tooling/configure.mjs
  { pnpm --filter @snag/tv assets && pnpm --filter @snag/tv exec react-native build-vega --build-type Release --target armv7 --use-system-js-bundles true --max-workers 2 --hermes-flags=-O,-w,-g0; } > $DIR/build.log 2>&1
  BUILD=$?; cp $CFG tv/src/config.ts; rm -f $CFG; git checkout -- assets/eyes 2>/dev/null
  [ $BUILD -eq 0 ] || { tail -20 $DIR/build.log; exit 4; }
  cp tv/build/private/kepler/tv/undefined/vega/armv7/Release/tv_armv7.vpkg $PKG
  # Inspect the packaged bundle's baked configuration and payload.
  rm -rf $DIR/x; mkdir -p $DIR/x; tar -C $DIR/x -xf $PKG bundle/index.bundle meta-info/build-info.json
  python3 - $DIR/x/bundle/index.bundle $RELAY <<'PY' || exit 5
import json, os, re, sys
src = open(sys.argv[1], encoding='utf-8', errors='replace').read()
m = re.search(r'\{\s*"relayUrl":[^}]*\}', src); cfg = json.loads(m.group(0))
want = {'relayUrl': sys.argv[2], 'showcase': False, 'debug': False, 'offline': False, 'photoProbe': False}
bad = {k: cfg.get(k) for k, v in want.items() if cfg.get(k) != v}
print('baked config:', {k: cfg[k] for k in want}); assert not bad, f'wrong production flags: {bad}'
assert os.path.expanduser('~') not in src and os.environ.get('USER', '\\0') not in src, 'home path leaked into bundle'
print('inspection PASS')
PY
  rm -rf $DIR/x
  shasum -a 256 $PKG | tee $DIR/sha256.txt
elif [ "${1:-}" = install ]; then
  stick; [ -f $PKG ] || { echo "Build first: $PKG missing"; exit 2; }
  vega device install-app -d $SERIAL -p $PKG 2>&1 | grep -i -E 'success|fail' | sed "s/$SERIAL/<device>/g"
  vega device run-cmd -d $SERIAL -c "rm -f /tmp/${PKG:t}; inputd-cli button_press KEY_HOMEPAGE" >/dev/null 2>&1
  vega device terminate-app -d $SERIAL --appName com.snagbrag.tv.main >/dev/null 2>&1; sleep 2; vega device launch-app -d $SERIAL --appName com.snagbrag.tv.main >/dev/null 2>&1; sleep 25
  VDA=$(ls ~/vega/sdk/vega-sdk/main/*/bin/tools/vda | tail -1)
  $VDA -s $SERIAL shell 'gwsi-tool-screenshooter /tmp/snag-prod-lobby.png' >/dev/null 2>&1
  $VDA -s $SERIAL pull /tmp/snag-prod-lobby.png $DIR/lobby.png >/dev/null 2>&1; $VDA -s $SERIAL shell 'rm -f /tmp/snag-prod-lobby.png' >/dev/null 2>&1
  echo "Lobby screenshot (read the 4-letter room code): $DIR/lobby.png"
  echo "Then: zsh tools/device/stick-production.sh play <CODE>"
elif [ "${1:-}" = play ] && [ -n "${2:-}" ]; then
  stick; [ -f $PKG ] || { echo "Build first: $PKG missing"; exit 2; }
  DEVICE_ROOM_CODE=$2 DEVICE_CHECK_GAMES=2 DEVICE_CHECK_REPORT=$DIR/game.json node tools/device/verify-live.mjs 2>&1 | tee $DIR/game.log | tail -3
  python3 -c "import json;d=json.load(open('$DIR/game.json'));print(d['outcome'],d.get('reason',''),'games',len(d['games']),[round(g['durationSeconds']) for g in d['games']],'foreground',sorted({c['state'] for c in d['foregroundChecks']}))"
  if python3 -c "import json,sys;d=json.load(open('$DIR/game.json'));sys.exit(0 if d['outcome']=='PASS' and len(d['games'])==2 else 1)"; then
    cp $PKG $HOME/builds/snag-and-brag/tv_armv7-live.vpkg
    H=$(shasum -a 256 $HOME/builds/snag-and-brag/tv_armv7-live.vpkg | awk '{print $1}')
    echo "PROMOTED tv_armv7-live.vpkg sha256 $H -- add it to VERIFIED_LIVE in tools/device/session.sh and the READY line in STATUS.md"
  else echo "NOT promoted: production game + rematch did not pass"; exit 1; fi
else echo "usage: stick-production.sh build | install | play <ROOMCODE>"; exit 64; fi
